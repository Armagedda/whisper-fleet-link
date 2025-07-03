use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::IntoResponse,
};
use futures::{sink::SinkExt, stream::StreamExt};
use jsonwebtoken::{decode, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
use uuid::Uuid;

// JWT Claims structure (reused from auth)
#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String,
    roles: Vec<String>,
    exp: usize,
    iat: usize,
}

// WebSocket message types
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WsMessage {
    #[serde(rename = "join_channel")]
    JoinChannel {
        channel_id: String,
    },
    #[serde(rename = "leave_channel")]
    LeaveChannel,
    #[serde(rename = "mute")]
    Mute,
    #[serde(rename = "unmute")]
    Unmute,
    #[serde(rename = "user_joined")]
    UserJoined {
        user_id: String,
        username: String,
        is_muted: bool,
    },
    #[serde(rename = "user_left")]
    UserLeft {
        user_id: String,
    },
    #[serde(rename = "user_state_update")]
    UserStateUpdate {
        user_id: String,
        is_muted: bool,
    },
    #[serde(rename = "error")]
    Error {
        message: String,
    },
    #[serde(rename = "channel_info")]
    ChannelInfo {
        channel_id: String,
        users: Vec<UserInfo>,
    },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserInfo {
    pub user_id: String,
    pub username: String,
    pub is_muted: bool,
    pub is_speaking: bool,
}

// User connection state
#[derive(Debug, Clone)]
pub struct UserConnection {
    pub user_id: String,
    pub username: String,
    pub channel_id: Option<String>,
    pub is_muted: bool,
    pub is_speaking: bool,
    pub tx: broadcast::Sender<WsMessage>,
}

// Voice channel state
#[derive(Debug)]
pub struct VoiceChannel {
    pub id: String,
    pub name: String,
    pub users: HashMap<String, UserConnection>,
    pub tx: broadcast::Sender<WsMessage>,
}

// App state for WebSocket connections
#[derive(Clone)]
pub struct WsAppState {
    pub connections: Arc<Mutex<HashMap<String, UserConnection>>>,
    pub channels: Arc<Mutex<HashMap<String, VoiceChannel>>>,
}

impl WsAppState {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
            channels: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

// Query parameters for WebSocket upgrade
#[derive(Debug, Deserialize)]
pub struct WsQuery {
    token: String,
}

// WebSocket handler
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<WsQuery>,
    State(state): State<WsAppState>,
) -> impl IntoResponse {
    // Authenticate JWT token
    let user_id = match authenticate_token(&query.token) {
        Ok(user_id) => user_id,
        Err(_) => {
            return ws.on_upgrade(|socket| async {
                let _ = handle_ws_connection(socket, None, state).await;
            });
        }
    };

    ws.on_upgrade(move |socket| async move {
        handle_ws_connection(socket, Some(user_id), state).await;
    })
}

// Authenticate JWT token
fn authenticate_token(token: &str) -> Result<String, ()> {
    let secret = "your-secret-key"; // Should match auth.rs
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_ref()),
        &Validation::default(),
    )
    .map_err(|_| ())?;

    Ok(token_data.claims.sub)
}

// Handle WebSocket connection
async fn handle_ws_connection(
    mut socket: WebSocket,
    user_id: Option<String>,
    state: WsAppState,
) {
    let user_id = match user_id {
        Some(id) => id,
        None => {
            let error_msg = WsMessage::Error {
                message: "Authentication failed".to_string(),
            };
            if let Ok(msg) = serde_json::to_string(&error_msg) {
                let _ = socket.send(Message::Text(msg)).await;
            }
            return;
        }
    };

    // Create broadcast channel for this user
    let (tx, mut rx) = broadcast::channel::<WsMessage>(100);
    
    // Store user connection
    let user_connection = UserConnection {
        user_id: user_id.clone(),
        username: user_id.clone(), // In real app, get from database
        channel_id: None,
        is_muted: false,
        is_speaking: false,
        tx: tx.clone(),
    };

    {
        let mut connections = state.connections.lock().unwrap();
        connections.insert(user_id.clone(), user_connection);
    }

    // Send welcome message
    let welcome_msg = WsMessage::ChannelInfo {
        channel_id: "".to_string(),
        users: vec![],
    };
    if let Ok(msg) = serde_json::to_string(&welcome_msg) {
        let _ = socket.send(Message::Text(msg)).await;
    }

    // Handle incoming messages
    let mut socket_rx = socket.split();
    let mut socket_tx = socket_rx.1;

    loop {
        tokio::select! {
            // Handle incoming WebSocket messages
            msg = socket_rx.0.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                            if let Err(_) = handle_ws_message(ws_msg, &user_id, &state).await {
                                break;
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) => {
                        break;
                    }
                    Some(Err(_)) => {
                        break;
                    }
                    None => {
                        break;
                    }
                    _ => {}
                }
            }
            // Handle broadcast messages
            msg = rx.recv() => {
                match msg {
                    Ok(ws_msg) => {
                        if let Ok(msg_str) = serde_json::to_string(&ws_msg) {
                            if let Err(_) = socket_tx.send(Message::Text(msg_str)).await {
                                break;
                            }
                        }
                    }
                    Err(_) => {
                        break;
                    }
                }
            }
        }
    }

    // Cleanup on disconnect
    cleanup_user_connection(&user_id, &state).await;
}

// Handle WebSocket messages
async fn handle_ws_message(
    msg: WsMessage,
    user_id: &str,
    state: &WsAppState,
) -> Result<(), ()> {
    match msg {
        WsMessage::JoinChannel { channel_id } => {
            join_voice_channel(user_id, &channel_id, state).await?;
        }
        WsMessage::LeaveChannel => {
            leave_voice_channel(user_id, state).await?;
        }
        WsMessage::Mute => {
            set_user_mute_state(user_id, true, state).await?;
        }
        WsMessage::Unmute => {
            set_user_mute_state(user_id, false, state).await?;
        }
        _ => {
            // Ignore other message types
        }
    }
    Ok(())
}

// Join voice channel
async fn join_voice_channel(
    user_id: &str,
    channel_id: &str,
    state: &WsAppState,
) -> Result<(), ()> {
    let mut channels = state.channels.lock().unwrap();
    let mut connections = state.connections.lock().unwrap();

    // Get or create channel
    let channel = channels.entry(channel_id.to_string()).or_insert_with(|| {
        let (tx, _) = broadcast::channel::<WsMessage>(100);
        VoiceChannel {
            id: channel_id.to_string(),
            name: format!("Voice Channel {}", channel_id),
            users: HashMap::new(),
            tx,
        }
    });

    // Get user connection
    let user_connection = connections
        .get_mut(user_id)
        .ok_or(())?;

    // Leave current channel if any
    if let Some(current_channel_id) = &user_connection.channel_id {
        if let Some(current_channel) = channels.get_mut(current_channel_id) {
            current_channel.users.remove(user_id);
            broadcast_user_left(current_channel, user_id).await;
        }
    }

    // Join new channel
    user_connection.channel_id = Some(channel_id.to_string());
    user_connection.is_muted = false;
    user_connection.is_speaking = false;

    let user_info = UserInfo {
        user_id: user_id.to_string(),
        username: user_connection.username.clone(),
        is_muted: user_connection.is_muted,
        is_speaking: user_connection.is_speaking,
    };

    channel.users.insert(user_id.to_string(), user_connection.clone());

    // Broadcast user joined to channel
    let join_msg = WsMessage::UserJoined {
        user_id: user_id.to_string(),
        username: user_connection.username.clone(),
        is_muted: user_connection.is_muted,
    };

    if let Ok(msg_str) = serde_json::to_string(&join_msg) {
        let _ = channel.tx.send(join_msg);
    }

    // Send channel info to joining user
    let channel_users: Vec<UserInfo> = channel
        .users
        .values()
        .map(|conn| UserInfo {
            user_id: conn.user_id.clone(),
            username: conn.username.clone(),
            is_muted: conn.is_muted,
            is_speaking: conn.is_speaking,
        })
        .collect();

    let channel_info = WsMessage::ChannelInfo {
        channel_id: channel_id.to_string(),
        users: channel_users,
    };

    if let Ok(msg_str) = serde_json::to_string(&channel_info) {
        let _ = user_connection.tx.send(channel_info);
    }

    Ok(())
}

// Leave voice channel
async fn leave_voice_channel(user_id: &str, state: &WsAppState) -> Result<(), ()> {
    let mut channels = state.channels.lock().unwrap();
    let mut connections = state.connections.lock().unwrap();

    let user_connection = connections
        .get_mut(user_id)
        .ok_or(())?;

    if let Some(channel_id) = &user_connection.channel_id {
        if let Some(channel) = channels.get_mut(channel_id) {
            channel.users.remove(user_id);
            broadcast_user_left(channel, user_id).await;
        }
        user_connection.channel_id = None;
    }

    Ok(())
}

// Set user mute state
async fn set_user_mute_state(
    user_id: &str,
    is_muted: bool,
    state: &WsAppState,
) -> Result<(), ()> {
    let mut channels = state.channels.lock().unwrap();
    let mut connections = state.connections.lock().unwrap();

    let user_connection = connections
        .get_mut(user_id)
        .ok_or(())?;

    user_connection.is_muted = is_muted;

    if let Some(channel_id) = &user_connection.channel_id {
        if let Some(channel) = channels.get_mut(channel_id) {
            if let Some(channel_user) = channel.users.get_mut(user_id) {
                channel_user.is_muted = is_muted;
            }

            // Broadcast state update
            let state_msg = WsMessage::UserStateUpdate {
                user_id: user_id.to_string(),
                is_muted,
            };

            if let Ok(msg_str) = serde_json::to_string(&state_msg) {
                let _ = channel.tx.send(state_msg);
            }
        }
    }

    Ok(())
}

// Broadcast user left message
async fn broadcast_user_left(channel: &VoiceChannel, user_id: &str) {
    let left_msg = WsMessage::UserLeft {
        user_id: user_id.to_string(),
    };

    if let Ok(msg_str) = serde_json::to_string(&left_msg) {
        let _ = channel.tx.send(left_msg);
    }
}

// Cleanup user connection on disconnect
async fn cleanup_user_connection(user_id: &str, state: &WsAppState) {
    let mut channels = state.channels.lock().unwrap();
    let mut connections = state.connections.lock().unwrap();

    // Remove from connections
    let user_connection = connections.remove(user_id);
    
    if let Some(connection) = user_connection {
        // Remove from channel
        if let Some(channel_id) = connection.channel_id {
            if let Some(channel) = channels.get_mut(&channel_id) {
                channel.users.remove(user_id);
                broadcast_user_left(channel, user_id).await;
                
                // Remove empty channels
                if channel.users.is_empty() {
                    channels.remove(&channel_id);
                }
            }
        }
    }
}

// Prepare for UDP audio packet forwarding (placeholder)
pub async fn handle_audio_packet(
    _channel_id: &str,
    _user_id: &str,
    _audio_data: Vec<u8>,
) {
    // TODO: Implement UDP audio packet forwarding
    // This will be implemented in a future update
    // For now, this is a placeholder for the audio handling system
} 