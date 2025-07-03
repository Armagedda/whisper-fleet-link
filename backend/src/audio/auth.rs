use jsonwebtoken::{decode, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use crate::routes::channels::{AppState as ChannelAppState, Channel, Role};

/// JWT claims structure for audio authentication
#[derive(Debug, Serialize, Deserialize)]
pub struct AudioClaims {
    pub sub: String, // user_id
    pub roles: Vec<String>,
    pub exp: usize, // expiration time
    pub iat: usize, // issued at
}

/// Authenticated user session
#[derive(Debug, Clone)]
pub struct AudioSession {
    pub user_id: String,
    pub username: String,
    pub roles: Vec<String>,
    pub authenticated_at: Instant,
    pub last_activity: Instant,
}

impl AudioSession {
    pub fn new(user_id: String, username: String, roles: Vec<String>) -> Self {
        let now = Instant::now();
        Self {
            user_id,
            username,
            roles,
            authenticated_at: now,
            last_activity: now,
        }
    }

    pub fn update_activity(&mut self) {
        self.last_activity = Instant::now();
    }

    pub fn is_expired(&self, max_age: Duration) -> bool {
        self.last_activity.elapsed() > max_age
    }
}

/// Audio authentication manager
pub struct AudioAuth {
    sessions: Arc<Mutex<HashMap<String, AudioSession>>>,
    jwt_secret: String,
    session_timeout: Duration,
    channel_state: Arc<ChannelAppState>,
}

impl AudioAuth {
    pub fn new(jwt_secret: String, channel_state: Arc<ChannelAppState>) -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            jwt_secret,
            session_timeout: Duration::from_secs(3600), // 1 hour
            channel_state,
        }
    }

    /// Authenticate a user with JWT token
    pub fn authenticate(&self, token: &str) -> Result<AudioSession, AuthError> {
        // Decode and validate JWT token
        let token_data = decode::<AudioClaims>(
            token,
            &DecodingKey::from_secret(self.jwt_secret.as_ref()),
            &Validation::default(),
        )
        .map_err(|_| AuthError::InvalidToken)?;

        let claims = token_data.claims;
        let user_id = claims.sub;
        let username = self.get_username_by_id(&user_id)?;

        // Create new session
        let session = AudioSession::new(user_id.clone(), username, claims.roles);

        // Store session
        let mut sessions = self.sessions.lock().unwrap();
        sessions.insert(user_id.clone(), session.clone());

        Ok(session)
    }

    /// Authenticate user with JWT token and verify channel membership
    pub fn authenticate_with_channel(&self, token: &str, channel_id: &str) -> Result<AudioSession, AuthError> {
        // First authenticate the JWT token
        let session = self.authenticate(token)?;
        
        // Verify user is a member of the specified channel
        let channels = self.channel_state.channels.lock().unwrap();
        let channel = channels.get(channel_id)
            .ok_or(AuthError::ChannelNotFound)?;

        // Check if user is banned
        if channel.banned_users.iter().any(|banned| banned.user_id == session.user_id) {
            return Err(AuthError::UserBanned);
        }

        // Check if user is a member (owner, moderator, or member)
        let is_member = channel.owner == session.user_id ||
                       channel.moderators.contains(&session.user_id) ||
                       channel.members.contains(&session.user_id);

        if !is_member {
            return Err(AuthError::NotChannelMember);
        }

        Ok(session)
    }

    /// Get existing session for user
    pub fn get_session(&self, user_id: &str) -> Result<AudioSession, AuthError> {
        let mut sessions = self.sessions.lock().unwrap();
        
        if let Some(session) = sessions.get_mut(user_id) {
            if session.is_expired(self.session_timeout) {
                sessions.remove(user_id);
                return Err(AuthError::SessionExpired);
            }
            
            session.update_activity();
            Ok(session.clone())
        } else {
            Err(AuthError::SessionNotFound)
        }
    }

    /// Remove user session
    pub fn remove_session(&self, user_id: &str) {
        let mut sessions = self.sessions.lock().unwrap();
        sessions.remove(user_id);
    }

    /// Clean up expired sessions
    pub fn cleanup_expired_sessions(&self) {
        let mut sessions = self.sessions.lock().unwrap();
        sessions.retain(|_, session| !session.is_expired(self.session_timeout));
    }

    /// Get username by user ID (placeholder implementation)
    fn get_username_by_id(&self, user_id: &str) -> Result<String, AuthError> {
        // In a real implementation, this would query a user database
        // For now, we'll use the user_id as username
        Ok(user_id.to_string())
    }

    /// Set session timeout
    pub fn set_session_timeout(&mut self, timeout: Duration) {
        self.session_timeout = timeout;
    }

    /// Get session count
    pub fn session_count(&self) -> usize {
        self.sessions.lock().unwrap().len()
    }
}

/// Authentication errors
#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("Invalid JWT token")]
    InvalidToken,
    #[error("Session not found")]
    SessionNotFound,
    #[error("Session expired")]
    SessionExpired,
    #[error("User not found")]
    UserNotFound,
    #[error("Permission denied")]
    PermissionDenied,
    #[error("Channel not found")]
    ChannelNotFound,
    #[error("User not a member of channel")]
    NotChannelMember,
    #[error("User is banned from channel")]
    UserBanned,
}

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{encode, EncodingKey, Header};
    use chrono::Utc;

    fn create_test_token(user_id: &str) -> String {
        let now = Utc::now();
        let exp = (now + chrono::Duration::hours(1)).timestamp() as usize;
        let iat = now.timestamp() as usize;

        let claims = AudioClaims {
            sub: user_id.to_string(),
            roles: vec!["user".to_string()],
            exp,
            iat,
        };

        encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret("test-secret".as_ref()),
        )
        .unwrap()
    }

    #[test]
    fn test_authentication() {
        let auth = AudioAuth::new("test-secret".to_string());
        let token = create_test_token("test_user");

        let session = auth.authenticate(&token).unwrap();
        assert_eq!(session.user_id, "test_user");
        assert_eq!(session.username, "test_user");
    }

    #[test]
    fn test_session_management() {
        let auth = AudioAuth::new("test-secret".to_string());
        let token = create_test_token("test_user");

        // Authenticate
        let session = auth.authenticate(&token).unwrap();
        assert_eq!(session.user_id, "test_user");

        // Get existing session
        let session2 = auth.get_session("test_user").unwrap();
        assert_eq!(session2.user_id, "test_user");

        // Remove session
        auth.remove_session("test_user");
        assert!(auth.get_session("test_user").is_err());
    }

    #[test]
    fn test_invalid_token() {
        let auth = AudioAuth::new("test-secret".to_string());
        
        assert!(auth.authenticate("invalid.token.here").is_err());
    }
} 