use serde::{Deserialize, Serialize};
use std::io::{Cursor, Read, Write};
use byteorder::{BigEndian, ReadBytesExt, WriteBytesExt};

/// Packet types for different audio operations
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum PacketType {
    /// Initial handshake packet with JWT token
    Handshake = 0x01,
    /// Audio data packet
    Audio = 0x02,
    /// Join channel request
    JoinChannel = 0x03,
    /// Leave channel request
    LeaveChannel = 0x04,
    /// Mute/unmute request
    SetMute = 0x05,
    /// Heartbeat to keep connection alive
    Heartbeat = 0x06,
    /// Error response
    Error = 0x07,
    /// Acknowledgment
    Ack = 0x08,
}

impl PacketType {
    pub fn from_u8(value: u8) -> Option<Self> {
        match value {
            0x01 => Some(PacketType::Handshake),
            0x02 => Some(PacketType::Audio),
            0x03 => Some(PacketType::JoinChannel),
            0x04 => Some(PacketType::LeaveChannel),
            0x05 => Some(PacketType::SetMute),
            0x06 => Some(PacketType::Heartbeat),
            0x07 => Some(PacketType::Error),
            0x08 => Some(PacketType::Ack),
            _ => None,
        }
    }

    pub fn to_u8(self) -> u8 {
        self as u8
    }
}

/// Packet header structure (16 bytes)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PacketHeader {
    /// Packet type
    pub packet_type: PacketType,
    /// Sequence number for ordering
    pub sequence: u32,
    /// User ID (8 bytes)
    pub user_id: [u8; 8],
    /// Channel ID (4 bytes)
    pub channel_id: [u8; 4],
    /// Timestamp
    pub timestamp: u32,
}

impl PacketHeader {
    pub const SIZE: usize = 16;

    /// Create a new packet header
    pub fn new(
        packet_type: PacketType,
        sequence: u32,
        user_id: &str,
        channel_id: &str,
        timestamp: u32,
    ) -> Self {
        let mut user_id_bytes = [0u8; 8];
        let mut channel_id_bytes = [0u8; 4];
        
        user_id_bytes[..user_id.len().min(8)].copy_from_slice(&user_id.as_bytes()[..user_id.len().min(8)]);
        channel_id_bytes[..channel_id.len().min(4)].copy_from_slice(&channel_id.as_bytes()[..channel_id.len().min(4)]);

        Self {
            packet_type,
            sequence,
            user_id: user_id_bytes,
            channel_id: channel_id_bytes,
            timestamp,
        }
    }

    /// Serialize header to bytes
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(Self::SIZE);
        buf.write_u8(self.packet_type.to_u8()).unwrap();
        buf.write_u32::<BigEndian>(self.sequence).unwrap();
        buf.extend_from_slice(&self.user_id);
        buf.extend_from_slice(&self.channel_id);
        buf.write_u32::<BigEndian>(self.timestamp).unwrap();
        buf
    }

    /// Deserialize header from bytes
    pub fn from_bytes(data: &[u8]) -> Result<Self, PacketError> {
        if data.len() < Self::SIZE {
            return Err(PacketError::InvalidSize);
        }

        let mut cursor = Cursor::new(data);
        
        let packet_type_byte = cursor.read_u8()?;
        let packet_type = PacketType::from_u8(packet_type_byte)
            .ok_or(PacketError::InvalidPacketType)?;
        
        let sequence = cursor.read_u32::<BigEndian>()?;
        
        let mut user_id = [0u8; 8];
        cursor.read_exact(&mut user_id)?;
        
        let mut channel_id = [0u8; 4];
        cursor.read_exact(&mut channel_id)?;
        
        let timestamp = cursor.read_u32::<BigEndian>()?;

        Ok(Self {
            packet_type,
            sequence,
            user_id,
            channel_id,
            timestamp,
        })
    }

    /// Get user ID as string
    pub fn user_id_str(&self) -> String {
        String::from_utf8_lossy(&self.user_id)
            .trim_matches('\0')
            .to_string()
    }

    /// Get channel ID as string
    pub fn channel_id_str(&self) -> String {
        String::from_utf8_lossy(&self.channel_id)
            .trim_matches('\0')
            .to_string()
    }
}

/// JSON handshake structure for UDP authentication
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandshakeData {
    pub token: String,
    pub channel_id: String,
}

/// Audio packet structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioPacket {
    /// Packet header
    pub header: PacketHeader,
    /// JWT token for authentication (handshake packets)
    pub jwt_token: Option<String>,
    /// JSON handshake data (for new handshake format)
    pub handshake_data: Option<HandshakeData>,
    /// Audio data (audio packets)
    pub audio_data: Option<Vec<u8>>,
    /// Mute state (set mute packets)
    pub mute_state: Option<bool>,
    /// Error message (error packets)
    pub error_message: Option<String>,
}

impl AudioPacket {
    /// Create a handshake packet (legacy format)
    pub fn handshake(jwt_token: String, user_id: &str, channel_id: &str) -> Self {
        Self {
            header: PacketHeader::new(
                PacketType::Handshake,
                0,
                user_id,
                channel_id,
                chrono::Utc::now().timestamp() as u32,
            ),
            jwt_token: Some(jwt_token),
            handshake_data: None,
            audio_data: None,
            mute_state: None,
            error_message: None,
        }
    }

    /// Create a JSON handshake packet (new format)
    pub fn json_handshake(token: String, channel_id: String) -> Self {
        Self {
            header: PacketHeader::new(
                PacketType::Handshake,
                0,
                "", // user_id will be extracted from JWT
                &channel_id,
                chrono::Utc::now().timestamp() as u32,
            ),
            jwt_token: None,
            handshake_data: Some(HandshakeData { token, channel_id }),
            audio_data: None,
            mute_state: None,
            error_message: None,
        }
    }

    /// Create an audio packet
    pub fn audio(
        sequence: u32,
        user_id: &str,
        channel_id: &str,
        audio_data: Vec<u8>,
    ) -> Self {
        Self {
            header: PacketHeader::new(
                PacketType::Audio,
                sequence,
                user_id,
                channel_id,
                chrono::Utc::now().timestamp() as u32,
            ),
            jwt_token: None,
            audio_data: Some(audio_data),
            mute_state: None,
            error_message: None,
        }
    }

    /// Create a join channel packet
    pub fn join_channel(user_id: &str, channel_id: &str) -> Self {
        Self {
            header: PacketHeader::new(
                PacketType::JoinChannel,
                0,
                user_id,
                channel_id,
                chrono::Utc::now().timestamp() as u32,
            ),
            jwt_token: None,
            audio_data: None,
            mute_state: None,
            error_message: None,
        }
    }

    /// Create a leave channel packet
    pub fn leave_channel(user_id: &str, channel_id: &str) -> Self {
        Self {
            header: PacketHeader::new(
                PacketType::LeaveChannel,
                0,
                user_id,
                channel_id,
                chrono::Utc::now().timestamp() as u32,
            ),
            jwt_token: None,
            audio_data: None,
            mute_state: None,
            error_message: None,
        }
    }

    /// Create a set mute packet
    pub fn set_mute(user_id: &str, channel_id: &str, mute: bool) -> Self {
        Self {
            header: PacketHeader::new(
                PacketType::SetMute,
                0,
                user_id,
                channel_id,
                chrono::Utc::now().timestamp() as u32,
            ),
            jwt_token: None,
            audio_data: None,
            mute_state: Some(mute),
            error_message: None,
        }
    }

    /// Create a heartbeat packet
    pub fn heartbeat(user_id: &str, channel_id: &str) -> Self {
        Self {
            header: PacketHeader::new(
                PacketType::Heartbeat,
                0,
                user_id,
                channel_id,
                chrono::Utc::now().timestamp() as u32,
            ),
            jwt_token: None,
            audio_data: None,
            mute_state: None,
            error_message: None,
        }
    }

    /// Create an error packet
    pub fn error(user_id: &str, channel_id: &str, error_message: String) -> Self {
        Self {
            header: PacketHeader::new(
                PacketType::Error,
                0,
                user_id,
                channel_id,
                chrono::Utc::now().timestamp() as u32,
            ),
            jwt_token: None,
            audio_data: None,
            mute_state: None,
            error_message: Some(error_message),
        }
    }

    /// Create an acknowledgment packet
    pub fn ack(user_id: &str, channel_id: &str, sequence: u32) -> Self {
        Self {
            header: PacketHeader::new(
                PacketType::Ack,
                sequence,
                user_id,
                channel_id,
                chrono::Utc::now().timestamp() as u32,
            ),
            jwt_token: None,
            audio_data: None,
            mute_state: None,
            error_message: None,
        }
    }

    /// Serialize packet to bytes
    pub fn to_bytes(&self) -> Result<Vec<u8>, PacketError> {
        let mut buf = Vec::new();
        
        // Write header
        buf.extend_from_slice(&self.header.to_bytes());
        
        // Write payload based on packet type
        match self.header.packet_type {
            PacketType::Handshake => {
                if let Some(ref handshake) = self.handshake_data {
                    // JSON handshake format
                    let json = serde_json::to_string(handshake)
                        .map_err(|_| PacketError::InvalidJson)?;
                    let json_bytes = json.as_bytes();
                    buf.write_u16::<BigEndian>(json_bytes.len() as u16)?;
                    buf.extend_from_slice(json_bytes);
                } else if let Some(ref token) = self.jwt_token {
                    // Legacy format
                    let token_bytes = token.as_bytes();
                    buf.write_u16::<BigEndian>(token_bytes.len() as u16)?;
                    buf.extend_from_slice(token_bytes);
                } else {
                    return Err(PacketError::MissingToken);
                }
            }
            PacketType::Audio => {
                if let Some(ref audio) = self.audio_data {
                    buf.write_u16::<BigEndian>(audio.len() as u16)?;
                    buf.extend_from_slice(audio);
                } else {
                    return Err(PacketError::MissingAudioData);
                }
            }
            PacketType::SetMute => {
                if let Some(mute) = self.mute_state {
                    buf.write_u8(if mute { 1 } else { 0 })?;
                } else {
                    return Err(PacketError::MissingMuteState);
                }
            }
            PacketType::Error => {
                if let Some(ref error) = self.error_message {
                    let error_bytes = error.as_bytes();
                    buf.write_u16::<BigEndian>(error_bytes.len() as u16)?;
                    buf.extend_from_slice(error_bytes);
                } else {
                    return Err(PacketError::MissingErrorMessage);
                }
            }
            _ => {
                // Other packet types have no additional payload
            }
        }
        
        Ok(buf)
    }

    /// Deserialize packet from bytes
    pub fn from_bytes(data: &[u8]) -> Result<Self, PacketError> {
        if data.len() < PacketHeader::SIZE {
            return Err(PacketError::InvalidSize);
        }

        let header = PacketHeader::from_bytes(&data[..PacketHeader::SIZE])?;
        let mut cursor = Cursor::new(&data[PacketHeader::SIZE..]);
        
        let (jwt_token, handshake_data) = match header.packet_type {
            PacketType::Handshake => {
                let payload_len = cursor.read_u16::<BigEndian>()? as usize;
                let mut payload_bytes = vec![0u8; payload_len];
                cursor.read_exact(&mut payload_bytes)?;
                let payload_str = String::from_utf8(payload_bytes).map_err(|_| PacketError::InvalidUtf8)?;
                
                // Try to parse as JSON handshake first
                if let Ok(handshake) = serde_json::from_str::<HandshakeData>(&payload_str) {
                    (None, Some(handshake))
                } else {
                    // Fall back to legacy format
                    (Some(payload_str), None)
                }
            }
            _ => (None, None),
        };

        let audio_data = match header.packet_type {
            PacketType::Audio => {
                let audio_len = cursor.read_u16::<BigEndian>()? as usize;
                let mut audio_bytes = vec![0u8; audio_len];
                cursor.read_exact(&mut audio_bytes)?;
                Some(audio_bytes)
            }
            _ => None,
        };

        let mute_state = match header.packet_type {
            PacketType::SetMute => {
                let mute_byte = cursor.read_u8()?;
                Some(mute_byte != 0)
            }
            _ => None,
        };

        let error_message = match header.packet_type {
            PacketType::Error => {
                let error_len = cursor.read_u16::<BigEndian>()? as usize;
                let mut error_bytes = vec![0u8; error_len];
                cursor.read_exact(&mut error_bytes)?;
                Some(String::from_utf8(error_bytes).map_err(|_| PacketError::InvalidUtf8)?)
            }
            _ => None,
        };

        Ok(Self {
            header,
            jwt_token,
            handshake_data,
            audio_data,
            mute_state,
            error_message,
        })
    }
}

/// Binary Opus voice packet structure
#[derive(Debug, Clone, PartialEq)]
pub struct VoicePacket {
    /// Packet type (0x01 for voice data)
    pub packet_type: u8,
    /// Monotonic sequence number
    pub sequence_number: u32,
    /// UNIX timestamp in ms
    pub timestamp: u64,
    /// Opus-compressed audio data
    pub payload: Vec<u8>,
}

impl VoicePacket {
    /// Minimum header size (1 + 4 + 8 + 2 = 15 bytes)
    pub const HEADER_SIZE: usize = 15;
    pub const VOICE_PACKET_TYPE: u8 = 0x01;

    /// Parse a VoicePacket from raw bytes
    pub fn from_bytes(data: &[u8]) -> Result<Self, PacketError> {
        if data.len() < Self::HEADER_SIZE {
            return Err(PacketError::InvalidVoicePacket("Packet too short".into()));
        }
        let packet_type = data[0];
        if packet_type != Self::VOICE_PACKET_TYPE {
            return Err(PacketError::InvalidVoicePacket("Invalid packet type".into()));
        }
        let sequence_number = u32::from_be_bytes([data[1], data[2], data[3], data[4]]);
        let timestamp = u64::from_be_bytes([
            data[5], data[6], data[7], data[8], data[9], data[10], data[11], data[12],
        ]);
        let payload_length = u16::from_be_bytes([data[13], data[14]]) as usize;
        if data.len() != Self::HEADER_SIZE + payload_length {
            return Err(PacketError::InvalidVoicePacket("Payload length mismatch".into()));
        }
        let payload = data[15..].to_vec();
        Ok(Self {
            packet_type,
            sequence_number,
            timestamp,
            payload,
        })
    }

    /// Serialize VoicePacket to bytes
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(Self::HEADER_SIZE + self.payload.len());
        buf.push(self.packet_type);
        buf.extend_from_slice(&self.sequence_number.to_be_bytes());
        buf.extend_from_slice(&self.timestamp.to_be_bytes());
        buf.extend_from_slice(&(self.payload.len() as u16).to_be_bytes());
        buf.extend_from_slice(&self.payload);
        buf
    }
}

/// Packet parsing errors
#[derive(Debug, thiserror::Error)]
pub enum PacketError {
    #[error("Invalid packet size")]
    InvalidSize,
    #[error("Invalid packet type")]
    InvalidPacketType,
    #[error("Missing JWT token")]
    MissingToken,
    #[error("Missing audio data")]
    MissingAudioData,
    #[error("Missing mute state")]
    MissingMuteState,
    #[error("Missing error message")]
    MissingErrorMessage,
    #[error("Invalid UTF-8 encoding")]
    InvalidUtf8,
    #[error("Invalid JSON format")]
    InvalidJson,
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Invalid voice packet: {0}")]
    InvalidVoicePacket(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_packet_header_serialization() {
        let header = PacketHeader::new(
            PacketType::Audio,
            12345,
            "user123",
            "chan1",
            1234567890,
        );

        let bytes = header.to_bytes();
        let deserialized = PacketHeader::from_bytes(&bytes).unwrap();

        assert_eq!(header.packet_type, deserialized.packet_type);
        assert_eq!(header.sequence, deserialized.sequence);
        assert_eq!(header.user_id_str(), deserialized.user_id_str());
        assert_eq!(header.channel_id_str(), deserialized.channel_id_str());
        assert_eq!(header.timestamp, deserialized.timestamp);
    }

    #[test]
    fn test_audio_packet_serialization() {
        let packet = AudioPacket::audio(
            12345,
            "user123",
            "chan1",
            vec![1, 2, 3, 4, 5],
        );

        let bytes = packet.to_bytes().unwrap();
        let deserialized = AudioPacket::from_bytes(&bytes).unwrap();

        assert_eq!(packet.header.packet_type, deserialized.header.packet_type);
        assert_eq!(packet.header.sequence, deserialized.header.sequence);
        assert_eq!(packet.audio_data, deserialized.audio_data);
    }

    #[test]
    fn test_handshake_packet_serialization() {
        let packet = AudioPacket::handshake(
            "jwt.token.here".to_string(),
            "user123",
            "chan1",
        );

        let bytes = packet.to_bytes().unwrap();
        let deserialized = AudioPacket::from_bytes(&bytes).unwrap();

        assert_eq!(packet.header.packet_type, deserialized.header.packet_type);
        assert_eq!(packet.jwt_token, deserialized.jwt_token);
    }

    #[test]
    fn test_set_mute_packet_serialization() {
        let packet = AudioPacket::set_mute("user123", "chan1", true);

        let bytes = packet.to_bytes().unwrap();
        let deserialized = AudioPacket::from_bytes(&bytes).unwrap();

        assert_eq!(packet.header.packet_type, deserialized.header.packet_type);
        assert_eq!(packet.mute_state, deserialized.mute_state);
    }

    #[test]
    fn test_error_packet_serialization() {
        let packet = AudioPacket::error("user123", "chan1", "Test error".to_string());

        let bytes = packet.to_bytes().unwrap();
        let deserialized = AudioPacket::from_bytes(&bytes).unwrap();

        assert_eq!(packet.header.packet_type, deserialized.header.packet_type);
        assert_eq!(packet.error_message, deserialized.error_message);
    }
} 