use crate::audio::{
    AudioAuth, AudioPacket, PacketType, AudioStateManager, AudioSession,
    packet::{PacketError, PacketHeader, HandshakeData, VoicePacket},
    auth::AuthError,
    state::{AudioUserState, ChannelState, Role},
};
use crate::routes::channels::AppState as ChannelAppState;
use std::collections::{HashMap, VecDeque};
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::net::UdpSocket;
use tokio::sync::mpsc;
use tokio::time::{interval, timeout};
use tracing::{debug, error, info, warn};

/// Audio server configuration
#[derive(Debug, Clone)]
pub struct AudioServerConfig {
    pub bind_addr: String,
    pub max_packet_size: usize,
    pub buffer_size: usize,
    pub cleanup_interval: Duration,
    pub user_timeout: Duration,
    pub heartbeat_interval: Duration,
    pub handshake_timeout: Duration,
    pub jitter_buffer_size: usize,
    pub jitter_buffer_window_ms: u64,
    pub frame_interval_ms: u64,
    pub jwt_secret: String,
}

/// Pending handshake information
#[derive(Debug)]
struct PendingHandshake {
    user_id: String,
    channel_id: String,
    started_at: Instant,
}

/// Jitter buffer entry for reordering packets
#[derive(Debug, Clone)]
struct JitterBufferEntry {
    sequence_number: u32,
    timestamp: u64,
    payload: Vec<u8>,
    received_at: Instant,
}

/// Jitter buffer for a single user
#[derive(Debug)]
struct JitterBuffer {
    entries: VecDeque<JitterBufferEntry>,
    last_played_sequence: u32,
    max_size: usize,
    window_ms: u64,
}

impl JitterBuffer {
    fn new(max_size: usize, window_ms: u64) -> Self {
        Self {
            entries: VecDeque::with_capacity(max_size),
            last_played_sequence: 0,
            max_size,
            window_ms,
        }
    }

    /// Insert a packet into the jitter buffer in sequence order
    fn insert(&mut self, entry: JitterBufferEntry) -> bool {
        // Drop if sequence is too old
        if entry.sequence_number <= self.last_played_sequence {
            return false;
        }

        // Drop if buffer is full and packet is too old
        if self.entries.len() >= self.max_size {
            let oldest_timestamp = self.entries.front()
                .map(|e| e.timestamp)
                .unwrap_or(0);
            
            if entry.timestamp < oldest_timestamp + self.window_ms {
                return false;
            }
        }

        // Insert in sequence order
        let insert_pos = self.entries.binary_search_by(|e| e.sequence_number.cmp(&entry.sequence_number));
        match insert_pos {
            Ok(_) => false, // Duplicate sequence
            Err(pos) => {
                self.entries.insert(pos, entry);
                true
            }
        }
    }

    /// Get the next in-order packet
    fn pop_next(&mut self) -> Option<JitterBufferEntry> {
        if let Some(entry) = self.entries.front() {
            if entry.sequence_number == self.last_played_sequence + 1 {
                self.last_played_sequence = entry.sequence_number;
                self.entries.pop_front()
            } else {
                None
            }
        } else {
            None
        }
    }

    /// Clean up old entries
    fn cleanup(&mut self, max_age_ms: u64) {
        let now = Instant::now();
        while let Some(entry) = self.entries.front() {
            if now.duration_since(entry.received_at).as_millis() > max_age_ms as u128 {
                self.entries.pop_front();
            } else {
                break;
            }
        }
    }

    /// Check if buffer is empty
    fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Get buffer size
    fn len(&self) -> usize {
        self.entries.len()
    }
}

#[derive(Debug, Clone)]
pub struct VoiceConnectionState {
    pub last_sequence: u32,
    pub last_active: Instant,
    pub channel_id: String,
    pub user_id: String,
}

impl Default for AudioServerConfig {
    fn default() -> Self {
        Self {
            bind_addr: "0.0.0.0:8080".to_string(),
            max_packet_size: 1024,
            buffer_size: 8192,
            cleanup_interval: Duration::from_secs(60),
            user_timeout: Duration::from_secs(300),
            heartbeat_interval: Duration::from_secs(30),
            handshake_timeout: Duration::from_secs(5),
            jitter_buffer_size: 20, // 20 entries (400ms at 20ms frames)
            jitter_buffer_window_ms: 400, // 400ms window
            frame_interval_ms: 20, // 20ms frame interval
            jwt_secret: "your-secret-key".to_string(),
        }
    }
}

/// Audio server event
#[derive(Debug)]
pub enum AudioServerEvent {
    UserJoined {
        user_id: String,
        channel_id: String,
        socket_addr: SocketAddr,
    },
    UserLeft {
        user_id: String,
        channel_id: String,
        socket_addr: SocketAddr,
    },
    UserMuted {
        user_id: String,
        channel_id: String,
        muted: bool,
    },
    AudioPacket {
        from_user_id: String,
        channel_id: String,
        sequence: u32,
        data: Vec<u8>,
    },
    Error {
        socket_addr: SocketAddr,
        error: String,
    },
}

/// UDP Audio Streaming Server
pub struct AudioServer {
    config: AudioServerConfig,
    auth: Arc<AudioAuth>,
    state_manager: Arc<AudioStateManager>,
    channel_state: Arc<ChannelAppState>,
    socket: Option<Arc<UdpSocket>>,
    event_tx: Option<mpsc::UnboundedSender<AudioServerEvent>>,
    event_rx: Option<mpsc::UnboundedReceiver<AudioServerEvent>>,
    pending_handshakes: Arc<Mutex<HashMap<SocketAddr, PendingHandshake>>>,
    voice_connections: Arc<Mutex<HashMap<SocketAddr, VoiceConnectionState>>>,
    jitter_buffers: Arc<Mutex<HashMap<String, JitterBuffer>>>,
}

impl AudioServer {
    /// Create a new audio server
    pub fn new(config: AudioServerConfig, channel_state: Arc<ChannelAppState>) -> Self {
        let auth = Arc::new(AudioAuth::new(config.jwt_secret.clone(), channel_state.clone()));
        let state_manager = Arc::new(AudioStateManager::new());
        
        let (event_tx, event_rx) = mpsc::unbounded_channel();

        Self {
            config,
            auth,
            state_manager,
            channel_state,
            socket: None,
            event_tx: Some(event_tx),
            event_rx: Some(event_rx),
            pending_handshakes: Arc::new(Mutex::new(HashMap::new())),
            voice_connections: Arc::new(Mutex::new(HashMap::new())),
            jitter_buffers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Start the audio server
    pub async fn start(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        info!("Starting UDP audio server on {}", self.config.bind_addr);

        // Bind UDP socket
        let socket = UdpSocket::bind(&self.config.bind_addr).await?;
        socket.set_recv_buffer_size(self.config.buffer_size)?;
        socket.set_send_buffer_size(self.config.buffer_size)?;
        
        self.socket = Some(Arc::new(socket));
        let socket = self.socket.as_ref().unwrap().clone();

        // Start background tasks
        let auth = self.auth.clone();
        let state_manager = self.state_manager.clone();
        let pending_handshakes = self.pending_handshakes.clone();
        let voice_connections = self.voice_connections.clone();
        let jitter_buffers = self.jitter_buffers.clone();
        let cleanup_interval = self.config.cleanup_interval;
        let user_timeout = self.config.user_timeout;
        let handshake_timeout = self.config.handshake_timeout;
        let frame_interval = Duration::from_millis(self.config.frame_interval_ms);

        // Cleanup task
        tokio::spawn(async move {
            let mut interval = interval(cleanup_interval);
            loop {
                interval.tick().await;
                
                // Clean up expired sessions
                auth.cleanup_expired_sessions();
                
                // Clean up expired users
                let removed_users = state_manager.cleanup();
                if !removed_users.is_empty() {
                    debug!("Cleaned up {} expired users", removed_users.len());
                }

                // Clean up expired handshakes
                let mut handshakes = pending_handshakes.lock().unwrap();
                let now = Instant::now();
                handshakes.retain(|addr, handshake| {
                    if now.duration_since(handshake.started_at) > handshake_timeout {
                        warn!("Handshake timeout for {}", addr);
                        false
                    } else {
                        true
                    }
                });

                // Clean up old jitter buffers
                let mut buffers = jitter_buffers.lock().unwrap();
                buffers.retain(|user_id, buffer| {
                    buffer.cleanup(500); // 500ms max age
                    !buffer.is_empty() || buffer.last_played_sequence > 0
                });
            }
        });

        // Jitter buffer processing task
        let voice_connections_jb = voice_connections.clone();
        let jitter_buffers_jb = jitter_buffers.clone();
        let socket_jb = socket.clone();
        
        tokio::spawn(async move {
            let mut interval = interval(frame_interval);
            loop {
                interval.tick().await;
                
                let mut buffers = jitter_buffers_jb.lock().unwrap();
                let connections = voice_connections_jb.lock().unwrap();
                
                // Process each user's jitter buffer
                for (user_id, buffer) in buffers.iter_mut() {
                    // Find the user's channel
                    let user_channel = connections.values()
                        .find(|conn| conn.user_id == *user_id)
                        .map(|conn| &conn.channel_id);
                    
                    if let Some(channel_id) = user_channel {
                        // Get next in-order packet
                        if let Some(entry) = buffer.pop_next() {
                            // Create voice packet for forwarding
                            let voice_packet = VoicePacket {
                                packet_type: VoicePacket::VOICE_PACKET_TYPE,
                                sequence_number: entry.sequence_number,
                                timestamp: entry.timestamp,
                                payload: entry.payload,
                            };
                            let packet_data = voice_packet.to_bytes();
                            
                            // Forward to all other users in the same channel
                            for (other_addr, other_conn) in connections.iter() {
                                if other_conn.channel_id == *channel_id && other_conn.user_id != *user_id {
                                    if let Err(e) = socket_jb.send_to(&packet_data, *other_addr).await {
                                        warn!("Failed to forward voice packet to {}: {}", other_addr, e);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        // Main packet processing loop
        let mut buffer = vec![0u8; self.config.max_packet_size];
        
        loop {
            match socket.recv_from(&mut buffer).await {
                Ok((len, addr)) => {
                    let packet_data = &buffer[..len];
                    
                    // Spawn task to handle packet
                    let auth = self.auth.clone();
                    let state_manager = self.state_manager.clone();
                    let channel_state = self.channel_state.clone();
                    let socket = socket.clone();
                    let event_tx = self.event_tx.as_ref().unwrap().clone();
                    let pending_handshakes = self.pending_handshakes.clone();
                    let voice_connections = voice_connections.clone();
                    let jitter_buffers = jitter_buffers.clone();

                    tokio::spawn(async move {
                        // Check for binary Opus packet (VoicePacket)
                        if !packet_data.is_empty() && packet_data[0] == crate::audio::packet::VoicePacket::VOICE_PACKET_TYPE {
                            use crate::audio::packet::VoicePacket;
                            match VoicePacket::from_bytes(packet_data) {
                                Ok(voice_packet) => {
                                    // Look up connection state
                                    let mut vc_map = voice_connections.lock().unwrap();
                                    if let Some(state) = vc_map.get_mut(&addr) {
                                        // Insert into jitter buffer instead of direct forwarding
                                        let mut buffers = jitter_buffers.lock().unwrap();
                                        let buffer = buffers.entry(state.user_id.clone()).or_insert_with(|| {
                                            JitterBuffer::new(20, 400) // Use config values
                                        });
                                        
                                        let entry = JitterBufferEntry {
                                            sequence_number: voice_packet.sequence_number,
                                            timestamp: voice_packet.timestamp,
                                            payload: voice_packet.payload,
                                            received_at: Instant::now(),
                                        };
                                        
                                        if buffer.insert(entry) {
                                            debug!("Inserted voice packet seq {} from {} into jitter buffer", 
                                                   voice_packet.sequence_number, state.user_id);
                                        } else {
                                            debug!("Dropped voice packet seq {} from {} (duplicate/old)", 
                                                   voice_packet.sequence_number, state.user_id);
                                        }
                                        
                                        // Update sender state
                                        state.last_sequence = voice_packet.sequence_number;
                                        state.last_active = Instant::now();
                                    } else {
                                        warn!("Received voice packet from unauthenticated or unknown socket: {}", addr);
                                    }
                                }
                                Err(e) => {
                                    warn!("Malformed voice packet from {}: {}", addr, e);
                                }
                            }
                            return;
                        }
                        // Otherwise, handle as control packet
                        if let Err(e) = Self::handle_packet(
                            packet_data,
                            addr,
                            &auth,
                            &state_manager,
                            &channel_state,
                            &socket,
                            &event_tx,
                            &pending_handshakes,
                            &jitter_buffers,
                        ).await {
                            error!("Error handling packet from {}: {}", addr, e);
                            let _ = event_tx.send(AudioServerEvent::Error {
                                socket_addr: addr,
                                error: e.to_string(),
                            });
                        }
                    });
                }
                Err(e) => {
                    error!("Error receiving packet: {}", e);
                }
            }
        }
    }

    /// Handle incoming packet
    async fn handle_packet(
        data: &[u8],
        addr: SocketAddr,
        auth: &Arc<AudioAuth>,
        state_manager: &Arc<AudioStateManager>,
        channel_state: &Arc<ChannelAppState>,
        socket: &Arc<UdpSocket>,
        event_tx: &mpsc::UnboundedSender<AudioServerEvent>,
        pending_handshakes: &Arc<Mutex<HashMap<SocketAddr, PendingHandshake>>>,
        jitter_buffers: &Arc<Mutex<HashMap<String, JitterBuffer>>>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Parse packet
        let packet = AudioPacket::from_bytes(data)?;
        
        match packet.header.packet_type {
            PacketType::Handshake => {
                Self::handle_handshake(packet, addr, auth, state_manager, event_tx, pending_handshakes, jitter_buffers).await?;
            }
            PacketType::Audio => {
                Self::handle_audio_packet(packet, addr, auth, state_manager, socket, event_tx).await?;
            }
            PacketType::JoinChannel => {
                Self::handle_join_channel(packet, addr, auth, state_manager, channel_state, event_tx).await?;
            }
            PacketType::LeaveChannel => {
                Self::handle_leave_channel(packet, addr, auth, state_manager, event_tx).await?;
            }
            PacketType::SetMute => {
                Self::handle_set_mute(packet, addr, auth, state_manager, event_tx).await?;
            }
            PacketType::Heartbeat => {
                Self::handle_heartbeat(packet, addr, auth, state_manager).await?;
            }
            _ => {
                warn!("Unhandled packet type: {:?}", packet.header.packet_type);
            }
        }
        
        Ok(())
    }

    /// Handle handshake packet
    async fn handle_handshake(
        packet: AudioPacket,
        addr: SocketAddr,
        auth: &Arc<AudioAuth>,
        state_manager: &Arc<AudioStateManager>,
        event_tx: &mpsc::UnboundedSender<AudioServerEvent>,
        pending_handshakes: &Arc<Mutex<HashMap<SocketAddr, PendingHandshake>>>,
        jitter_buffers: &Arc<Mutex<HashMap<String, JitterBuffer>>>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Check if this is a new handshake or a retry
        let mut handshakes = pending_handshakes.lock().unwrap();
        
        if let Some(existing_handshake) = handshakes.get(&addr) {
            // Check if handshake has timed out
            if Instant::now().duration_since(existing_handshake.started_at) > Duration::from_secs(5) {
                warn!("Handshake timeout for {}, removing", addr);
                handshakes.remove(&addr);
            } else {
                // Still within timeout, ignore duplicate handshake
                return Ok(());
            }
        }

        // Parse handshake data
        let (token, channel_id) = if let Some(handshake_data) = &packet.handshake_data {
            // New JSON handshake format
            (&handshake_data.token, &handshake_data.channel_id)
        } else if let Some(token) = &packet.jwt_token {
            // Legacy format - extract channel_id from packet header
            (token, &packet.header.channel_id_str())
        } else {
            return Err("Missing handshake data".into());
        };

        // Authenticate user and verify channel membership
        let session = match auth.authenticate_with_channel(token, channel_id) {
            Ok(session) => session,
            Err(AuthError::InvalidToken) => {
                error!("Invalid JWT token from {}", addr);
                return Err("Invalid JWT token".into());
            }
            Err(AuthError::ChannelNotFound) => {
                error!("Channel {} not found for user from {}", channel_id, addr);
                return Err("Channel not found".into());
            }
            Err(AuthError::NotChannelMember) => {
                error!("User not a member of channel {} from {}", channel_id, addr);
                return Err("User not a member of channel".into());
            }
            Err(AuthError::UserBanned) => {
                error!("User banned from channel {} from {}", channel_id, addr);
                return Err("User banned from channel".into());
            }
            Err(e) => {
                error!("Authentication error for {}: {:?}", addr, e);
                return Err(format!("Authentication error: {:?}", e).into());
            }
        };

        // Add to pending handshakes
        handshakes.insert(addr, PendingHandshake {
            user_id: session.user_id.clone(),
            channel_id: channel_id.to_string(),
            started_at: Instant::now(),
        });
        
        // Add to voice_connections
        let mut vc_map = self.voice_connections.lock().unwrap();
        vc_map.insert(addr, VoiceConnectionState {
            last_sequence: 0,
            last_active: Instant::now(),
            channel_id: channel_id.to_string(),
            user_id: session.user_id.clone(),
        });
        
        // Create jitter buffer for the user
        let mut buffers = jitter_buffers.lock().unwrap();
        buffers.insert(session.user_id.clone(), JitterBuffer::new(20, 400));

        info!("User {} authenticated for channel {} from {}", session.user_id, channel_id, addr);

        // Send acknowledgment
        let ack_packet = AudioPacket::ack(&session.user_id, channel_id, 0);
        let ack_data = ack_packet.to_bytes()?;
        
        // Note: We don't have socket here, so we'll need to handle this differently
        // For now, we'll just log the authentication success
        
        Ok(())
    }

    /// Handle audio packet
    async fn handle_audio_packet(
        packet: AudioPacket,
        addr: SocketAddr,
        auth: &Arc<AudioAuth>,
        state_manager: &Arc<AudioStateManager>,
        socket: &Arc<UdpSocket>,
        event_tx: &mpsc::UnboundedSender<AudioServerEvent>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let user_id = packet.header.user_id_str();
        let channel_id = packet.header.channel_id_str();

        // Get user session (must be authenticated)
        let session = auth.get_session(&user_id)?;
        
        // Update user activity
        if let Some(mut user) = state_manager.get_user_by_socket(&addr) {
            user.update_activity();
        }

        // Get audio data
        let audio_data = packet.audio_data
            .ok_or("Missing audio data")?;

        // Get broadcast targets (excluding sender)
        let targets = state_manager.get_broadcast_targets(&user_id, false);

        // Broadcast to all targets
        for (target_user_id, target_addr) in targets {
            if let Err(e) = socket.send_to(&audio_data, target_addr).await {
                warn!("Failed to send audio to {}: {}", target_addr, e);
            }
        }

        // Send event
        let _ = event_tx.send(AudioServerEvent::AudioPacket {
            from_user_id: user_id,
            channel_id,
            sequence: packet.header.sequence,
            data: audio_data,
        });

        Ok(())
    }

    /// Handle join channel packet
    async fn handle_join_channel(
        packet: AudioPacket,
        addr: SocketAddr,
        auth: &Arc<AudioAuth>,
        state_manager: &Arc<AudioStateManager>,
        channel_state: &Arc<ChannelAppState>,
        event_tx: &mpsc::UnboundedSender<AudioServerEvent>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let user_id = packet.header.user_id_str();
        let channel_id = packet.header.channel_id_str();

        // Get user session
        let session = auth.get_session(&user_id)?;

        // Verify user is in channel (check channel state)
        let channels = channel_state.channels.lock().unwrap();
        let channel = channels.get(&channel_id)
            .ok_or("Channel not found")?;

        // Check if user is a member
        let user_role = if channel.owner == user_id {
            Role::Owner
        } else if channel.moderators.contains(&user_id) {
            Role::Moderator
        } else if channel.members.contains(&user_id) {
            Role::Member
        } else {
            return Err("User not a member of channel".into());
        };

        // Add user to audio channel
        state_manager.add_user_to_channel(
            user_id.clone(),
            session.username,
            channel_id.clone(),
            addr,
            user_role,
        )?;

        info!("User {} joined audio channel {}", user_id, channel_id);

        // Send event
        let _ = event_tx.send(AudioServerEvent::UserJoined {
            user_id,
            channel_id,
            socket_addr: addr,
        });

        Ok(())
    }

    /// Handle leave channel packet
    async fn handle_leave_channel(
        packet: AudioPacket,
        addr: SocketAddr,
        auth: &Arc<AudioAuth>,
        state_manager: &Arc<AudioStateManager>,
        event_tx: &mpsc::UnboundedSender<AudioServerEvent>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let user_id = packet.header.user_id_str();
        let channel_id = packet.header.channel_id_str();

        // Get user session
        let _session = auth.get_session(&user_id)?;

        // Remove user from audio channel
        state_manager.remove_user_from_channel(&user_id)?;

        info!("User {} left audio channel {}", user_id, channel_id);

        // Send event
        let _ = event_tx.send(AudioServerEvent::UserLeft {
            user_id,
            channel_id,
            socket_addr: addr,
        });

        Ok(())
    }

    /// Handle set mute packet
    async fn handle_set_mute(
        packet: AudioPacket,
        addr: SocketAddr,
        auth: &Arc<AudioAuth>,
        state_manager: &Arc<AudioStateManager>,
        event_tx: &mpsc::UnboundedSender<AudioServerEvent>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let user_id = packet.header.user_id_str();
        let channel_id = packet.header.channel_id_str();

        // Get user session
        let _session = auth.get_session(&user_id)?;

        // Get mute state
        let muted = packet.mute_state
            .ok_or("Missing mute state")?;

        // Update user mute state
        if state_manager.set_user_mute(&user_id, muted) {
            info!("User {} {} in channel {}", 
                user_id, 
                if muted { "muted" } else { "unmuted" }, 
                channel_id
            );

            // Send event
            let _ = event_tx.send(AudioServerEvent::UserMuted {
                user_id,
                channel_id,
                muted,
            });
        }

        Ok(())
    }

    /// Handle heartbeat packet
    async fn handle_heartbeat(
        packet: AudioPacket,
        addr: SocketAddr,
        auth: &Arc<AudioAuth>,
        state_manager: &Arc<AudioStateManager>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let user_id = packet.header.user_id_str();

        // Get user session
        let _session = auth.get_session(&user_id)?;

        // Update user activity
        if let Some(mut user) = state_manager.get_user_by_socket(&addr) {
            user.update_activity();
        }

        Ok(())
    }

    /// Get event receiver
    pub fn take_event_receiver(&mut self) -> Option<mpsc::UnboundedReceiver<AudioServerEvent>> {
        self.event_rx.take()
    }

    /// Get server statistics
    pub fn get_stats(&self) -> AudioServerStats {
        AudioServerStats {
            auth_sessions: self.auth.session_count(),
            state_stats: self.state_manager.get_stats(),
        }
    }

    /// Send packet to specific address
    pub async fn send_packet(&self, packet: AudioPacket, addr: SocketAddr) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(socket) = &self.socket {
            let data = packet.to_bytes()?;
            socket.send_to(&data, addr).await?;
        }
        Ok(())
    }

    /// Broadcast packet to channel (excluding sender)
    pub async fn broadcast_to_channel(
        &self,
        packet: AudioPacket,
        sender_user_id: &str,
        include_muted: bool,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(socket) = &self.socket {
            let targets = self.state_manager.get_broadcast_targets(sender_user_id, include_muted);
            let data = packet.to_bytes()?;

            for (_, addr) in targets {
                if let Err(e) = socket.send_to(&data, addr).await {
                    warn!("Failed to broadcast to {}: {}", addr, e);
                }
            }
        }
        Ok(())
    }
}

/// Audio server statistics
#[derive(Debug, Clone)]
pub struct AudioServerStats {
    pub auth_sessions: usize,
    pub state_stats: crate::audio::state::AudioStats,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::SocketAddr;
    use std::str::FromStr;

    #[tokio::test]
    async fn test_audio_server_creation() {
        let config = AudioServerConfig::default();
        let channel_state = Arc::new(ChannelAppState::new());
        
        let mut server = AudioServer::new(config, channel_state);
        assert!(server.event_tx.is_some());
        assert!(server.event_rx.is_some());
    }

    #[test]
    fn test_packet_handling() {
        // Test packet parsing and handling logic
        let packet = AudioPacket::handshake(
            "test.token".to_string(),
            "user1",
            "channel1",
        );

        let data = packet.to_bytes().unwrap();
        let parsed = AudioPacket::from_bytes(&data).unwrap();

        assert_eq!(packet.header.packet_type, parsed.header.packet_type);
        assert_eq!(packet.jwt_token, parsed.jwt_token);
    }

    #[test]
    fn test_json_handshake_packet() {
        // Test JSON handshake packet creation and parsing
        let packet = AudioPacket::json_handshake(
            "test.jwt.token".to_string(),
            "test-channel".to_string(),
        );
        
        assert_eq!(packet.header.packet_type, PacketType::Handshake);
        assert!(packet.handshake_data.is_some());
        assert_eq!(packet.jwt_token, None);
        
        if let Some(handshake_data) = &packet.handshake_data {
            assert_eq!(handshake_data.token, "test.jwt.token");
            assert_eq!(handshake_data.channel_id, "test-channel");
        }
    }
} 