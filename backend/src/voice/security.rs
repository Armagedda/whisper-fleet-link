//! Security hardening middleware and helpers for Rocket backend.
//!
//! Features:
//! - Rate limiting (per IP/user, configurable)
//! - Input validation/sanitization
//! - JWT validation and revocation
//! - WebSocket origin checks
//! - UDP packet authentication (token/key)
//! - Logging and DoS detection
//!
//! # Configuration
//! See README for setup and deployment instructions.

use rocket::{Request, Data, Response, http::Status, fairing::{Fairing, Info, Kind}, outcome::Outcome, request::{self, FromRequest}, State};
use rocket::serde::json::Json;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use jsonwebtoken::{decode, DecodingKey, Validation, TokenData, Algorithm, errors::Error as JwtError};
use log::{warn, info, error};
use rocket::tokio::sync::RwLock;
use rocket::tokio::time::sleep;

// --- Rate Limiting ---
#[derive(Clone)]
pub struct RateLimiter {
    pub max_requests: u32,
    pub window: Duration,
    // Map: (IP or user_id) -> (count, window_start)
    pub counts: Arc<Mutex<HashMap<String, (u32, Instant)>>>,
}

impl RateLimiter {
    pub fn new(max_requests: u32, window: Duration) -> Self {
        Self {
            max_requests,
            window,
            counts: Arc::new(Mutex::new(HashMap::new())),
        }
    }
    pub fn check(&self, key: &str) -> bool {
        let mut counts = self.counts.lock().unwrap();
        let now = Instant::now();
        let entry = counts.entry(key.to_string()).or_insert((0, now));
        if now.duration_since(entry.1) > self.window {
            *entry = (1, now);
            true
        } else {
            if entry.0 < self.max_requests {
                entry.0 += 1;
                true
            } else {
                false
            }
        }
    }
}

// Rocket Fairing for Rate Limiting
pub struct RateLimitFairing {
    pub limiter: RateLimiter,
}

#[rocket::async_trait]
impl Fairing for RateLimitFairing {
    fn info(&self) -> Info {
        Info { name: "Rate Limiting", kind: Kind::Request }
    }
    async fn on_request(&self, req: &mut Request<'_>, _: &mut Data<'_>) {
        let ip = req.client_ip().map(|ip| ip.to_string()).unwrap_or_else(|| "unknown".to_string());
        if !self.limiter.check(&ip) {
            warn!("Rate limit exceeded for IP: {}", ip);
            req.local_cache(|| Some(Status::TooManyRequests));
        }
    }
}

// --- Input Validation and Sanitization ---
pub fn validate_id(id: &str) -> Result<(), &'static str> {
    if id.len() < 3 || id.len() > 64 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        Err("Invalid ID format")
    } else {
        Ok(())
    }
}

pub fn validate_token(token: &str) -> Result<(), &'static str> {
    if token.len() < 10 || token.len() > 512 || !token.chars().all(|c| c.is_ascii_graphic()) {
        Err("Invalid token format")
    } else {
        Ok(())
    }
}

// --- JWT Handling ---
pub struct JwtConfig {
    pub secret: String,
    pub issuer: String,
    pub audience: String,
    pub blacklist: Arc<RwLock<HashSet<String>>>,
}

pub async fn is_token_revoked(token: &str, config: &JwtConfig) -> bool {
    let blacklist = config.blacklist.read().await;
    blacklist.contains(token)
}

pub fn validate_jwt(token: &str, config: &JwtConfig) -> Result<TokenData<serde_json::Value>, JwtError> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_audience(&[&config.audience]);
    validation.set_issuer(&[&config.issuer]);
    decode::<serde_json::Value>(token, &DecodingKey::from_secret(config.secret.as_bytes()), &validation)
}

// --- WebSocket Origin Check ---
pub fn check_ws_origin(origin: &str, allowed_origins: &[&str]) -> bool {
    allowed_origins.iter().any(|&o| o == origin)
}

// --- UDP Packet Authentication ---
pub fn validate_udp_token(token: &str, config: &JwtConfig) -> bool {
    // Could use JWT or a shared secret
    validate_jwt(token, config).is_ok()
}
// Suggestion: For future, use DTLS for full encryption/authentication

// --- Logging and Monitoring ---
pub fn log_auth_failure(ip: &str, reason: &str) {
    warn!("Auth failure from {}: {}", ip, reason);
}

pub fn log_rate_limit(ip: &str) {
    warn!("Rate limit hit for {}", ip);
}

pub fn log_suspicious(ip: &str, msg: &str) {
    warn!("Suspicious activity from {}: {}", ip, msg);
}

// --- DoS Detection (simple traffic spike detection) ---
pub struct DosDetector {
    pub threshold: u32,
    pub window: Duration,
    pub hits: Arc<Mutex<HashMap<String, (u32, Instant)>>>,
}

impl DosDetector {
    pub fn new(threshold: u32, window: Duration) -> Self {
        Self { threshold, window, hits: Arc::new(Mutex::new(HashMap::new())) }
    }
    pub fn check(&self, ip: &str) -> bool {
        let mut hits = self.hits.lock().unwrap();
        let now = Instant::now();
        let entry = hits.entry(ip.to_string()).or_insert((0, now));
        if now.duration_since(entry.1) > self.window {
            *entry = (1, now);
            false
        } else {
            entry.0 += 1;
            entry.0 > self.threshold
        }
    }
}

// --- Rocket Integration Example ---
// Attach RateLimitFairing and use guards for JWT, input validation, etc.
// See README for full integration details.

// --- Tests ---
#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    #[test]
    fn test_rate_limiter() {
        let limiter = RateLimiter::new(2, Duration::from_secs(1));
        assert!(limiter.check("user1"));
        assert!(limiter.check("user1"));
        assert!(!limiter.check("user1"));
    }
    #[test]
    fn test_validate_id() {
        assert!(validate_id("abc-123").is_ok());
        assert!(validate_id("bad id!").is_err());
    }
    #[test]
    fn test_validate_token() {
        assert!(validate_token("goodtoken123").is_ok());
        assert!(validate_token("bad token!").is_err());
    }
    #[test]
    fn test_dos_detector() {
        let dos = DosDetector::new(2, Duration::from_secs(1));
        assert!(!dos.check("ip1"));
        assert!(!dos.check("ip1"));
        assert!(dos.check("ip1"));
    }
} 