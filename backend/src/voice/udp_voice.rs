use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tokio::net::UdpSocket;
use tokio::sync::mpsc;
use tokio::task;
use serde::Deserialize;
use bytes::BytesMut;
use log::{info, warn};

#[derive(Deserialize, Debug)]
pub struct AudioPacket {
    pub user_id: String,
    pub channel_id: String,
    pub sequence: u64,
    pub timestamp: u64,
    pub payload: Vec<u8>, // Raw audio bytes (e.g., Opus or PCM)
}

// State for each user
#[derive(Debug, Clone)]
pub struct UserState {
    pub addr: SocketAddr,
    pub channel_id: String,
    pub last_sequence: u64,
}

type UserMap = Arc<Mutex<HashMap<String, UserState>>>;

pub async fn run_udp_voice_server() -> tokio::io::Result<()> {
    let socket = UdpSocket::bind("0.0.0.0:8080").await?;
    // Increase OS socket buffer size for high-throughput/low-loss
    socket.set_recv_buffer_size(1 << 20)?; // 1MB
    info!("UDP voice server listening on 0.0.0.0:8080 with 1MB buffer");

    let user_map: UserMap = Arc::new(Mutex::new(HashMap::new()));
    let (tx, mut rx) = mpsc::channel::<(BytesMut, SocketAddr)>(2048);

    // Spawn a task to receive UDP packets
    let recv_socket = socket.try_clone()?;
    let tx_recv = tx.clone();
    task::spawn(async move {
        let mut buf = [0u8; 4096];
        loop {
            match recv_socket.recv_from(&mut buf).await {
                Ok((len, addr)) => {
                    let mut data = BytesMut::with_capacity(len);
                    data.extend_from_slice(&buf[..len]);
                    if tx_recv.send((data, addr)).await.is_err() {
                        break;
                    }
                }
                Err(e) => {
                    warn!("UDP receive error: {}", e);
                }
            }
        }
    });

    // Track last sequence per user/channel to drop duplicates/late packets
    let mut last_seq_map: HashMap<(String, String), u64> = HashMap::new();

    // Main loop: handle packets
    while let Some((data, addr)) = rx.recv().await {
        // Parse as AudioPacket (assume JSON for now)
        let packet: Result<AudioPacket, _> = serde_json::from_slice(&data);
        match packet {
            Ok(audio_packet) => {
                let key = (audio_packet.user_id.clone(), audio_packet.channel_id.clone());
                let last_seq = last_seq_map.get(&key).copied().unwrap_or(0);
                if audio_packet.sequence <= last_seq {
                    // Drop duplicate/late packet
                    warn!("Dropped late/duplicate packet from {} seq {} (last {})", audio_packet.user_id, audio_packet.sequence, last_seq);
                    continue;
                }
                last_seq_map.insert(key.clone(), audio_packet.sequence);
                // Update user map
                let mut users = user_map.lock().unwrap();
                users.insert(
                    audio_packet.user_id.clone(),
                    UserState {
                        addr,
                        channel_id: audio_packet.channel_id.clone(),
                        last_sequence: audio_packet.sequence,
                    },
                );
                drop(users);
                info!("Received audio packet from {} in channel {} seq {} ({} bytes)",
                    audio_packet.user_id,
                    audio_packet.channel_id,
                    audio_packet.sequence,
                    audio_packet.payload.len()
                );
                // TODO: Forward to other users in the same channel
            }
            Err(e) => {
                warn!("Failed to parse AudioPacket from {}: {}", addr, e);
            }
        }
    }
    Ok(())
} 