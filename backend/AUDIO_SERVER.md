# UDP Audio Streaming Server

A high-performance UDP audio streaming server for real-time voice communication in the Whisper Fleet application. Built with Rust and Tokio for maximum performance and scalability.

## Features

- **JWT Authentication**: Secure token-based authentication for all audio connections
- **Real-time Audio Streaming**: Low-latency UDP packet routing
- **Channel-based Broadcasting**: Efficient audio routing to channel members only
- **User State Management**: Track mute/unmute states and user presence
- **Scalable Architecture**: Designed to handle thousands of concurrent users
- **Zero-copy Buffers**: Optimized for high-performance audio streaming
- **Automatic Cleanup**: Session and user timeout management
- **WebSocket Integration**: Hooks for integration with WebSocket connection state

## Architecture

### Server Components

1. **AudioServer**: Main server instance managing UDP socket and packet processing
2. **AudioAuth**: JWT authentication and session management
3. **AudioStateManager**: User and channel state management
4. **Packet Handler**: UDP packet parsing and routing

### Data Flow

```
Client → UDP Packet → Authentication → State Management → Broadcast → Other Clients
```

## Configuration

### AudioServerConfig

```rust
pub struct AudioServerConfig {
    pub bind_addr: String,           // UDP bind address (default: "0.0.0.0:8080")
    pub max_packet_size: usize,      // Maximum packet size (default: 1024)
    pub buffer_size: usize,          // Socket buffer size (default: 8192)
    pub cleanup_interval: Duration,  // Cleanup interval (default: 60s)
    pub user_timeout: Duration,      // User timeout (default: 300s)
    pub heartbeat_interval: Duration, // Heartbeat interval (default: 30s)
    pub jwt_secret: String,          // JWT secret key
}
```

## Packet Format

### Packet Header (16 bytes)

All packets start with a 16-byte header:

```
+--------+--------+--------+--------+--------+--------+--------+--------+
| Type   | Sequence Number (4 bytes)        | User ID (8 bytes)        |
+--------+--------+--------+--------+--------+--------+--------+--------+
| Channel ID (4 bytes)                      | Timestamp (4 bytes)      |
+--------+--------+--------+--------+--------+--------+--------+--------+
```

**Fields:**
- **Type** (1 byte): Packet type identifier
- **Sequence** (4 bytes): Sequence number for ordering
- **User ID** (8 bytes): User identifier (null-padded)
- **Channel ID** (4 bytes): Channel identifier (null-padded)
- **Timestamp** (4 bytes): Unix timestamp

### Packet Types

| Type | Value | Description |
|------|-------|-------------|
| Handshake | 0x01 | Initial authentication with JWT token |
| Audio | 0x02 | Audio data packet |
| JoinChannel | 0x03 | Join voice channel request |
| LeaveChannel | 0x04 | Leave voice channel request |
| SetMute | 0x05 | Set mute/unmute state |
| Heartbeat | 0x06 | Keep-alive packet |
| Error | 0x07 | Error response |
| Ack | 0x08 | Acknowledgment |

## Packet Examples

### Handshake Packet

**Header:**
```
Type: 0x01 (Handshake)
Sequence: 0x00000000
User ID: "user123\0"
Channel ID: "chan1"
Timestamp: 0x5F3E1234
```

**Payload:**
```
Token Length (2 bytes) + JWT Token
```

**Example:**
```
01 00 00 00 00 75 73 65 72 31 32 33 00 63 68 61 6E 31 5F 3E 12 34 00 0D 65 79 4A 30 65 58 61 6D 70 6C 65
```

### Audio Packet

**Header:**
```
Type: 0x02 (Audio)
Sequence: 0x00000001
User ID: "user123\0"
Channel ID: "chan1"
Timestamp: 0x5F3E1235
```

**Payload:**
```
Audio Length (2 bytes) + Audio Data
```

**Example:**
```
02 00 00 00 01 75 73 65 72 31 32 33 00 63 68 61 6E 31 5F 3E 12 35 00 80 [80 bytes of audio data]
```

### Set Mute Packet

**Header:**
```
Type: 0x05 (SetMute)
Sequence: 0x00000000
User ID: "user123\0"
Channel ID: "chan1"
Timestamp: 0x5F3E1236
```

**Payload:**
```
Mute State (1 byte): 0x01 for muted, 0x00 for unmuted
```

## API Reference

### Starting the Server

```rust
use audio::{AudioServer, AudioServerConfig};

let config = AudioServerConfig {
    bind_addr: "0.0.0.0:8080".to_string(),
    max_packet_size: 1024,
    buffer_size: 8192,
    cleanup_interval: Duration::from_secs(60),
    user_timeout: Duration::from_secs(300),
    heartbeat_interval: Duration::from_secs(30),
    jwt_secret: "your-secret-key".to_string(),
};

let mut audio_server = AudioServer::new(config, channel_state);
audio_server.start().await?;
```

### Event Handling

```rust
let mut event_rx = audio_server.take_event_receiver().unwrap();

while let Some(event) = event_rx.recv().await {
    match event {
        AudioServerEvent::UserJoined { user_id, channel_id, socket_addr } => {
            println!("User {} joined channel {}", user_id, channel_id);
        }
        AudioServerEvent::UserLeft { user_id, channel_id, socket_addr } => {
            println!("User {} left channel {}", user_id, channel_id);
        }
        AudioServerEvent::UserMuted { user_id, channel_id, muted } => {
            println!("User {} {} in channel {}", user_id, if muted { "muted" } else { "unmuted" }, channel_id);
        }
        AudioServerEvent::AudioPacket { from_user_id, channel_id, sequence, data } => {
            println!("Audio packet from {} in channel {} (seq: {})", from_user_id, channel_id, sequence);
        }
        AudioServerEvent::Error { socket_addr, error } => {
            println!("Error from {}: {}", socket_addr, error);
        }
    }
}
```

### Sending Packets

```rust
// Send packet to specific address
let packet = AudioPacket::audio(1, "user123", "chan1", audio_data);
audio_server.send_packet(packet, addr).await?;

// Broadcast to channel
let packet = AudioPacket::audio(1, "user123", "chan1", audio_data);
audio_server.broadcast_to_channel(packet, "user123", false).await?;
```

## Client Implementation

### Python Example

```python
import socket
import struct
import time
import jwt

class AudioClient:
    def __init__(self, server_addr, jwt_token, user_id, channel_id):
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.server_addr = server_addr
        self.jwt_token = jwt_token
        self.user_id = user_id
        self.channel_id = channel_id
        self.sequence = 0

    def create_header(self, packet_type, sequence, user_id, channel_id, timestamp):
        # Pad user_id to 8 bytes and channel_id to 4 bytes
        user_id_padded = user_id.ljust(8, '\0')[:8]
        channel_id_padded = channel_id.ljust(4, '\0')[:4]
        
        return struct.pack('!BIII', packet_type, sequence, 
                          int.from_bytes(user_id_padded.encode(), 'big'),
                          int.from_bytes(channel_id_padded.encode(), 'big'),
                          timestamp)

    def send_handshake(self):
        header = self.create_header(0x01, 0, self.user_id, self.channel_id, int(time.time()))
        
        # New JSON handshake format
        import json
        handshake_data = {
            "token": self.jwt_token,
            "channel_id": self.channel_id
        }
        json_data = json.dumps(handshake_data)
        json_len = struct.pack('!H', len(json_data))
        packet = header + json_len + json_data.encode()
        self.socket.sendto(packet, self.server_addr)

    def send_audio(self, audio_data):
        self.sequence += 1
        header = self.create_header(0x02, self.sequence, self.user_id, self.channel_id, int(time.time()))
        audio_len = struct.pack('!H', len(audio_data))
        packet = header + audio_len + audio_data
        self.socket.sendto(packet, self.server_addr)

    def send_join_channel(self):
        header = self.create_header(0x03, 0, self.user_id, self.channel_id, int(time.time()))
        self.socket.sendto(header, self.server_addr)

    def send_leave_channel(self):
        header = self.create_header(0x04, 0, self.user_id, self.channel_id, int(time.time()))
        self.socket.sendto(header, self.server_addr)

    def send_set_mute(self, muted):
        header = self.create_header(0x05, 0, self.user_id, self.channel_id, int(time.time()))
        mute_byte = struct.pack('!B', 1 if muted else 0)
        packet = header + mute_byte
        self.socket.sendto(packet, self.server_addr)

    def send_heartbeat(self):
        header = self.create_header(0x06, 0, self.user_id, self.channel_id, int(time.time()))
        self.socket.sendto(header, self.server_addr)

# Usage
client = AudioClient(('127.0.0.1', 8080), 'jwt.token.here', 'user123', 'chan1')
client.send_handshake()
client.send_join_channel()

# Send audio data
audio_data = b'\x00' * 80  # 80 bytes of silence
client.send_audio(audio_data)

# Mute/unmute
client.send_set_mute(True)   # Mute
client.send_set_mute(False)  # Unmute

# Heartbeat
client.send_heartbeat()

# Leave
client.send_leave_channel()
```

### JavaScript/Node.js Example

```javascript
const dgram = require('dgram');
const crypto = require('crypto');

class AudioClient {
    constructor(serverAddr, jwtToken, userId, channelId) {
        this.socket = dgram.createSocket('udp4');
        this.serverAddr = serverAddr;
        this.jwtToken = jwtToken;
        this.userId = userId;
        this.channelId = channelId;
        this.sequence = 0;
    }

    createHeader(packetType, sequence, userId, channelId, timestamp) {
        // Pad user_id to 8 bytes and channel_id to 4 bytes
        const userIdPadded = userId.padEnd(8, '\0').slice(0, 8);
        const channelIdPadded = channelId.padEnd(4, '\0').slice(0, 4);
        
        const buffer = Buffer.alloc(16);
        buffer.writeUInt8(packetType, 0);
        buffer.writeUInt32BE(sequence, 1);
        buffer.write(userIdPadded, 5, 8);
        buffer.write(channelIdPadded, 13, 4);
        buffer.writeUInt32BE(timestamp, 17);
        
        return buffer;
    }

    sendHandshake() {
        const header = this.createHeader(0x01, 0, this.userId, this.channelId, Math.floor(Date.now() / 1000));
        
        // New JSON handshake format
        const handshakeData = {
            token: this.jwtToken,
            channel_id: this.channelId
        };
        const jsonData = JSON.stringify(handshakeData);
        const jsonLen = Buffer.alloc(2);
        jsonLen.writeUInt16BE(jsonData.length);
        const packet = Buffer.concat([header, jsonLen, Buffer.from(jsonData)]);
        this.socket.send(packet, this.serverAddr.port, this.serverAddr.address);
    }

    sendAudio(audioData) {
        this.sequence++;
        const header = this.createHeader(0x02, this.sequence, this.userId, this.channelId, Math.floor(Date.now() / 1000));
        const audioLen = Buffer.alloc(2);
        audioLen.writeUInt16BE(audioData.length);
        const packet = Buffer.concat([header, audioLen, audioData]);
        this.socket.send(packet, this.serverAddr.port, this.serverAddr.address);
    }

    sendJoinChannel() {
        const header = this.createHeader(0x03, 0, this.userId, this.channelId, Math.floor(Date.now() / 1000));
        this.socket.send(header, this.serverAddr.port, this.serverAddr.address);
    }

    sendLeaveChannel() {
        const header = this.createHeader(0x04, 0, this.userId, this.channelId, Math.floor(Date.now() / 1000));
        this.socket.send(header, this.serverAddr.port, this.serverAddr.address);
    }

    sendSetMute(muted) {
        const header = this.createHeader(0x05, 0, this.userId, this.channelId, Math.floor(Date.now() / 1000));
        const muteByte = Buffer.alloc(1);
        muteByte.writeUInt8(muted ? 1 : 0);
        const packet = Buffer.concat([header, muteByte]);
        this.socket.send(packet, this.serverAddr.port, this.serverAddr.address);
    }

    sendHeartbeat() {
        const header = this.createHeader(0x06, 0, this.userId, this.channelId, Math.floor(Date.now() / 1000));
        this.socket.send(header, this.serverAddr.port, this.serverAddr.address);
    }
}

// Usage
const client = new AudioClient(
    { address: '127.0.0.1', port: 8080 },
    'jwt.token.here',
    'user123',
    'chan1'
);

client.sendHandshake();
client.sendJoinChannel();

// Send audio data
const audioData = Buffer.alloc(80, 0); // 80 bytes of silence
client.sendAudio(audioData);

// Mute/unmute
client.sendSetMute(true);   // Mute
client.sendSetMute(false);  // Unmute

// Heartbeat
client.sendHeartbeat();

// Leave
client.sendLeaveChannel();
```

## Performance Considerations

### Optimization Features

1. **Zero-copy Buffers**: Minimizes memory allocations for audio data
2. **Async Tokio**: Non-blocking I/O for high concurrency
3. **Efficient Routing**: Direct socket address mapping for fast lookups
4. **Batch Processing**: Grouped packet processing for better throughput
5. **Memory Pooling**: Reusable buffers for packet handling

### Scalability

- **Horizontal Scaling**: Multiple server instances can be deployed
- **Load Balancing**: UDP packets can be load balanced across instances
- **State Management**: Efficient in-memory state with cleanup
- **Connection Limits**: Configurable limits for user sessions

### Monitoring

```rust
// Get server statistics
let stats = audio_server.get_stats();
println!("Active sessions: {}", stats.auth_sessions);
println!("Total channels: {}", stats.state_stats.total_channels);
println!("Total users: {}", stats.state_stats.total_users);
```

## Security

### Authentication

The UDP audio server implements a secure authentication handshake process that validates both JWT tokens and channel membership.

#### Handshake Process

1. **Client sends handshake**: Client sends a handshake packet with JWT token and channel ID
2. **Server validates JWT**: Server decodes and validates the JWT token
3. **Channel membership check**: Server verifies the user is a member of the specified channel
4. **Ban check**: Server checks if the user is banned from the channel
5. **Session creation**: If all checks pass, server creates an authenticated session
6. **Acknowledgment**: Server sends an acknowledgment packet back to the client

#### Handshake Formats

The server supports two handshake formats:

**New JSON Handshake Format (Recommended):**
```json
{
  "token": "<jwt-token>",
  "channel_id": "<voice-channel-id>"
}
```

**Legacy Format:**
```
JWT Token (variable length)
```

#### Authentication Errors

The server will reject handshakes and log errors for the following reasons:

- **Invalid JWT token**: Token is malformed, expired, or signed with wrong key
- **Channel not found**: The specified channel ID doesn't exist
- **User not a member**: The authenticated user is not a member of the specified channel
- **User banned**: The user has been banned from the channel
- **Handshake timeout**: Client doesn't complete handshake within 5 seconds

#### Timeout Handling

- **Handshake timeout**: 5 seconds to complete authentication
- **Session timeout**: 30 seconds of inactivity before session expiration
- **User timeout**: 300 seconds before user cleanup

### Authentication Features

- **JWT Tokens**: Secure token-based authentication
- **Session Management**: Automatic session expiration
- **Token Validation**: Strict JWT validation with expiration checks
- **Channel Membership**: Verification of user membership in requested channel
- **Ban Enforcement**: Automatic rejection of banned users

### Packet Validation

- **Size Limits**: Configurable maximum packet sizes
- **Type Validation**: Strict packet type checking
- **Sequence Numbers**: Protection against replay attacks
- **Timestamp Validation**: Time-based packet validation

### Rate Limiting

- **Packet Rate**: Configurable limits on packet frequency
- **Connection Limits**: Maximum concurrent connections per user
- **Channel Limits**: Maximum users per channel

## Error Handling

### Common Errors

- **Invalid Token**: JWT token validation failed
- **Session Expired**: User session has timed out
- **Channel Not Found**: Requested channel doesn't exist
- **Permission Denied**: User lacks required permissions
- **Packet Too Large**: Packet exceeds maximum size
- **Invalid Packet Type**: Unknown packet type received

### Error Responses

Error packets include:
- Error type identifier
- Human-readable error message
- Suggested action for client

## Testing

### Unit Tests

```bash
cargo test audio::packet
cargo test audio::auth
cargo test audio::state
cargo test audio::server
```

### Integration Tests

```bash
cargo test audio_integration
```

### Performance Tests

```bash
cargo test audio_performance
```

## Deployment

### Docker

```dockerfile
FROM rust:1.70 as builder
WORKDIR /app
COPY . .
RUN cargo build --release

FROM debian:bullseye-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/main /usr/local/bin/
EXPOSE 3000 8080
CMD ["main"]
```

### Environment Variables

```bash
RUST_LOG=info
AUDIO_BIND_ADDR=0.0.0.0:8080
AUDIO_MAX_PACKET_SIZE=1024
AUDIO_BUFFER_SIZE=8192
JWT_SECRET=your-secret-key
```

## Troubleshooting

### Common Issues

1. **High Latency**: Check network configuration and buffer sizes
2. **Packet Loss**: Increase buffer sizes or reduce packet frequency
3. **Authentication Failures**: Verify JWT token format and secret
4. **Memory Usage**: Monitor session cleanup and adjust timeouts
5. **CPU Usage**: Profile packet processing and optimize routing

### Debugging

Enable debug logging:
```bash
RUST_LOG=debug cargo run
```

Monitor packet flow:
```bash
# Capture UDP packets
tcpdump -i any udp port 8080
```

## Contributing

1. Follow Rust coding standards
2. Add tests for new features
3. Update documentation
4. Run performance benchmarks
5. Ensure security best practices

## License

This project is licensed under the MIT License. 