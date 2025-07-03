use std::collections::{HashMap, HashSet};
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use crate::routes::channels::Role;

/// Audio user state
#[derive(Debug, Clone)]
pub struct AudioUserState {
    pub user_id: String,
    pub username: String,
    pub channel_id: String,
    pub socket_addr: SocketAddr,
    pub is_muted: bool,
    pub is_speaking: bool,
    pub last_activity: Instant,
    pub sequence_number: u32,
    pub role: Role,
}

impl AudioUserState {
    pub fn new(
        user_id: String,
        username: String,
        channel_id: String,
        socket_addr: SocketAddr,
        role: Role,
    ) -> Self {
        Self {
            user_id,
            username,
            channel_id,
            socket_addr,
            is_muted: false,
            is_speaking: false,
            last_activity: Instant::now(),
            sequence_number: 0,
            role,
        }
    }

    pub fn update_activity(&mut self) {
        self.last_activity = Instant::now();
    }

    pub fn is_expired(&self, timeout: Duration) -> bool {
        self.last_activity.elapsed() > timeout
    }

    pub fn next_sequence(&mut self) -> u32 {
        self.sequence_number = self.sequence_number.wrapping_add(1);
        self.sequence_number
    }
}

/// Channel state for audio streaming
#[derive(Debug)]
pub struct ChannelState {
    pub channel_id: String,
    pub users: HashMap<String, AudioUserState>,
    pub user_socket_map: HashMap<SocketAddr, String>, // socket_addr -> user_id
    pub last_activity: Instant,
}

impl ChannelState {
    pub fn new(channel_id: String) -> Self {
        Self {
            channel_id,
            users: HashMap::new(),
            user_socket_map: HashMap::new(),
            last_activity: Instant::now(),
        }
    }

    /// Add user to channel
    pub fn add_user(&mut self, user: AudioUserState) {
        let user_id = user.user_id.clone();
        let socket_addr = user.socket_addr;
        
        self.users.insert(user_id.clone(), user);
        self.user_socket_map.insert(socket_addr, user_id);
        self.last_activity = Instant::now();
    }

    /// Remove user from channel
    pub fn remove_user(&mut self, user_id: &str) -> Option<AudioUserState> {
        if let Some(user) = self.users.remove(user_id) {
            self.user_socket_map.remove(&user.socket_addr);
            self.last_activity = Instant::now();
            Some(user)
        } else {
            None
        }
    }

    /// Get user by ID
    pub fn get_user(&self, user_id: &str) -> Option<&AudioUserState> {
        self.users.get(user_id)
    }

    /// Get user by socket address
    pub fn get_user_by_socket(&self, socket_addr: &SocketAddr) -> Option<&AudioUserState> {
        if let Some(user_id) = self.user_socket_map.get(socket_addr) {
            self.users.get(user_id)
        } else {
            None
        }
    }

    /// Get user by socket address (mutable)
    pub fn get_user_by_socket_mut(&mut self, socket_addr: &SocketAddr) -> Option<&mut AudioUserState> {
        if let Some(user_id) = self.user_socket_map.get(socket_addr) {
            self.users.get_mut(user_id)
        } else {
            None
        }
    }

    /// Get all users in channel (excluding sender)
    pub fn get_users_except(&self, exclude_user_id: &str) -> Vec<&AudioUserState> {
        self.users
            .values()
            .filter(|user| user.user_id != exclude_user_id)
            .collect()
    }

    /// Get all unmuted users (excluding sender)
    pub fn get_unmuted_users_except(&self, exclude_user_id: &str) -> Vec<&AudioUserState> {
        self.users
            .values()
            .filter(|user| user.user_id != exclude_user_id && !user.is_muted)
            .collect()
    }

    /// Update user mute state
    pub fn set_user_mute(&mut self, user_id: &str, muted: bool) -> bool {
        if let Some(user) = self.users.get_mut(user_id) {
            user.is_muted = muted;
            user.update_activity();
            true
        } else {
            false
        }
    }

    /// Update user speaking state
    pub fn set_user_speaking(&mut self, user_id: &str, speaking: bool) -> bool {
        if let Some(user) = self.users.get_mut(user_id) {
            user.is_speaking = speaking;
            user.update_activity();
            true
        } else {
            false
        }
    }

    /// Clean up expired users
    pub fn cleanup_expired_users(&mut self, timeout: Duration) -> Vec<String> {
        let mut expired_users = Vec::new();
        
        self.users.retain(|user_id, user| {
            if user.is_expired(timeout) {
                expired_users.push(user_id.clone());
                false
            } else {
                true
            }
        });

        // Clean up socket map
        for user_id in &expired_users {
            if let Some(user) = self.users.get(user_id) {
                self.user_socket_map.remove(&user.socket_addr);
            }
        }

        expired_users
    }

    /// Get user count
    pub fn user_count(&self) -> usize {
        self.users.len()
    }

    /// Check if channel is empty
    pub fn is_empty(&self) -> bool {
        self.users.is_empty()
    }

    /// Get all user IDs
    pub fn get_user_ids(&self) -> Vec<String> {
        self.users.keys().cloned().collect()
    }
}

/// Global audio state manager
pub struct AudioStateManager {
    channels: Arc<Mutex<HashMap<String, ChannelState>>>,
    user_channels: Arc<Mutex<HashMap<String, String>>>, // user_id -> channel_id
    cleanup_interval: Duration,
    user_timeout: Duration,
}

impl AudioStateManager {
    pub fn new() -> Self {
        Self {
            channels: Arc::new(Mutex::new(HashMap::new())),
            user_channels: Arc::new(Mutex::new(HashMap::new())),
            cleanup_interval: Duration::from_secs(60), // 1 minute
            user_timeout: Duration::from_secs(300), // 5 minutes
        }
    }

    /// Add user to channel
    pub fn add_user_to_channel(
        &self,
        user_id: String,
        username: String,
        channel_id: String,
        socket_addr: SocketAddr,
        role: Role,
    ) -> Result<(), StateError> {
        let mut channels = self.channels.lock().unwrap();
        let mut user_channels = self.user_channels.lock().unwrap();

        // Remove user from previous channel if any
        if let Some(prev_channel_id) = user_channels.get(&user_id) {
            if let Some(channel) = channels.get_mut(prev_channel_id) {
                channel.remove_user(&user_id);
            }
        }

        // Get or create channel
        let channel = channels
            .entry(channel_id.clone())
            .or_insert_with(|| ChannelState::new(channel_id.clone()));

        // Add user to channel
        let user = AudioUserState::new(user_id.clone(), username, channel_id.clone(), socket_addr, role);
        channel.add_user(user);

        // Update user-channel mapping
        user_channels.insert(user_id, channel_id);

        Ok(())
    }

    /// Remove user from channel
    pub fn remove_user_from_channel(&self, user_id: &str) -> Result<(), StateError> {
        let mut channels = self.channels.lock().unwrap();
        let mut user_channels = self.user_channels.lock().unwrap();

        if let Some(channel_id) = user_channels.remove(user_id) {
            if let Some(channel) = channels.get_mut(&channel_id) {
                channel.remove_user(user_id);
                
                // Remove empty channels
                if channel.is_empty() {
                    channels.remove(&channel_id);
                }
            }
        }

        Ok(())
    }

    /// Get user's current channel
    pub fn get_user_channel(&self, user_id: &str) -> Option<String> {
        self.user_channels.lock().unwrap().get(user_id).cloned()
    }

    /// Get channel state
    pub fn get_channel(&self, channel_id: &str) -> Option<ChannelState> {
        self.channels.lock().unwrap().get(channel_id).cloned()
    }

    /// Get channel state (mutable)
    pub fn get_channel_mut(&self, channel_id: &str) -> Option<impl std::ops::DerefMut<Target = ChannelState>> {
        self.channels.lock().unwrap().get_mut(channel_id).map(|c| c)
    }

    /// Get user by socket address
    pub fn get_user_by_socket(&self, socket_addr: &SocketAddr) -> Option<(String, AudioUserState)> {
        let channels = self.channels.lock().unwrap();
        
        for channel in channels.values() {
            if let Some(user) = channel.get_user_by_socket(socket_addr) {
                return Some((channel.channel_id.clone(), user.clone()));
            }
        }
        
        None
    }

    /// Set user mute state
    pub fn set_user_mute(&self, user_id: &str, muted: bool) -> bool {
        if let Some(channel_id) = self.get_user_channel(user_id) {
            if let Some(mut channel) = self.get_channel_mut(&channel_id) {
                return channel.set_user_mute(user_id, muted);
            }
        }
        false
    }

    /// Set user speaking state
    pub fn set_user_speaking(&self, user_id: &str, speaking: bool) -> bool {
        if let Some(channel_id) = self.get_user_channel(user_id) {
            if let Some(mut channel) = self.get_channel_mut(&channel_id) {
                return channel.set_user_speaking(user_id, speaking);
            }
        }
        false
    }

    /// Get users to broadcast to (excluding sender)
    pub fn get_broadcast_targets(&self, sender_user_id: &str, include_muted: bool) -> Vec<(String, SocketAddr)> {
        if let Some(channel_id) = self.get_user_channel(sender_user_id) {
            if let Some(channel) = self.get_channel(&channel_id) {
                let users = if include_muted {
                    channel.get_users_except(sender_user_id)
                } else {
                    channel.get_unmuted_users_except(sender_user_id)
                };
                
                return users
                    .into_iter()
                    .map(|user| (user.user_id.clone(), user.socket_addr))
                    .collect();
            }
        }
        Vec::new()
    }

    /// Clean up expired users and empty channels
    pub fn cleanup(&self) -> Vec<String> {
        let mut channels = self.channels.lock().unwrap();
        let mut user_channels = self.user_channels.lock().unwrap();
        let mut removed_users = Vec::new();

        let mut channels_to_remove = Vec::new();

        for (channel_id, channel) in channels.iter_mut() {
            let expired_users = channel.cleanup_expired_users(self.user_timeout);
            
            for user_id in &expired_users {
                user_channels.remove(user_id);
                removed_users.push(user_id.clone());
            }

            if channel.is_empty() {
                channels_to_remove.push(channel_id.clone());
            }
        }

        // Remove empty channels
        for channel_id in channels_to_remove {
            channels.remove(&channel_id);
        }

        removed_users
    }

    /// Get statistics
    pub fn get_stats(&self) -> AudioStats {
        let channels = self.channels.lock().unwrap();
        let user_channels = self.user_channels.lock().unwrap();

        let total_channels = channels.len();
        let total_users = user_channels.len();
        let mut channel_stats = Vec::new();

        for (channel_id, channel) in channels.iter() {
            channel_stats.push(ChannelStats {
                channel_id: channel_id.clone(),
                user_count: channel.user_count(),
                last_activity: channel.last_activity,
            });
        }

        AudioStats {
            total_channels,
            total_users,
            channel_stats,
        }
    }

    /// Set cleanup interval
    pub fn set_cleanup_interval(&mut self, interval: Duration) {
        self.cleanup_interval = interval;
    }

    /// Set user timeout
    pub fn set_user_timeout(&mut self, timeout: Duration) {
        self.user_timeout = timeout;
    }
}

/// Audio statistics
#[derive(Debug, Clone)]
pub struct AudioStats {
    pub total_channels: usize,
    pub total_users: usize,
    pub channel_stats: Vec<ChannelStats>,
}

/// Channel statistics
#[derive(Debug, Clone)]
pub struct ChannelStats {
    pub channel_id: String,
    pub user_count: usize,
    pub last_activity: Instant,
}

/// State management errors
#[derive(Debug, thiserror::Error)]
pub enum StateError {
    #[error("Channel not found")]
    ChannelNotFound,
    #[error("User not found")]
    UserNotFound,
    #[error("User already in channel")]
    UserAlreadyInChannel,
    #[error("Channel is full")]
    ChannelFull,
    #[error("Permission denied")]
    PermissionDenied,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::SocketAddr;
    use std::str::FromStr;

    fn create_test_socket() -> SocketAddr {
        SocketAddr::from_str("127.0.0.1:12345").unwrap()
    }

    #[test]
    fn test_channel_state() {
        let mut channel = ChannelState::new("test_channel".to_string());
        let socket = create_test_socket();
        
        let user = AudioUserState::new(
            "user1".to_string(),
            "User1".to_string(),
            "test_channel".to_string(),
            socket,
            Role::Member,
        );

        channel.add_user(user);
        assert_eq!(channel.user_count(), 1);
        assert!(!channel.is_empty());

        let removed_user = channel.remove_user("user1");
        assert!(removed_user.is_some());
        assert_eq!(channel.user_count(), 0);
        assert!(channel.is_empty());
    }

    #[test]
    fn test_audio_state_manager() {
        let manager = AudioStateManager::new();
        let socket = create_test_socket();

        // Add user to channel
        manager
            .add_user_to_channel(
                "user1".to_string(),
                "User1".to_string(),
                "channel1".to_string(),
                socket,
                Role::Member,
            )
            .unwrap();

        // Check user is in channel
        assert_eq!(manager.get_user_channel("user1"), Some("channel1".to_string()));

        // Remove user
        manager.remove_user_from_channel("user1").unwrap();
        assert_eq!(manager.get_user_channel("user1"), None);
    }

    #[test]
    fn test_broadcast_targets() {
        let manager = AudioStateManager::new();
        let socket1 = SocketAddr::from_str("127.0.0.1:12345").unwrap();
        let socket2 = SocketAddr::from_str("127.0.0.1:12346").unwrap();

        // Add two users to same channel
        manager
            .add_user_to_channel(
                "user1".to_string(),
                "User1".to_string(),
                "channel1".to_string(),
                socket1,
                Role::Member,
            )
            .unwrap();

        manager
            .add_user_to_channel(
                "user2".to_string(),
                "User2".to_string(),
                "channel1".to_string(),
                socket2,
                Role::Member,
            )
            .unwrap();

        // Get broadcast targets for user1 (should include user2)
        let targets = manager.get_broadcast_targets("user1", true);
        assert_eq!(targets.len(), 1);
        assert_eq!(targets[0].0, "user2");
    }
} 