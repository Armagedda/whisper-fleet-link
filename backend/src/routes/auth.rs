use axum::{
    extract::{Json, Query},
    http::StatusCode,
    response::{Json as JsonResponse, IntoResponse},
};
use jsonwebtoken::{encode, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    username: String,
    password: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    token: String,
    user_id: String,
    roles: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    error: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String, // user_id
    roles: Vec<String>,
    exp: usize, // expiration time
    iat: usize, // issued at
}

#[derive(Debug, Deserialize)]
pub struct OAuthQuery {
    code: Option<String>,
    state: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ResetRequest {
    email: String,
}

#[derive(Debug, Deserialize)]
pub struct ResetConfirmRequest {
    token: String,
    new_password: String,
}

#[derive(Debug, Deserialize)]
pub struct TwoFARequest {
    username: String,
    code: String,
}

pub async fn login(Json(payload): Json<LoginRequest>) -> Result<JsonResponse<LoginResponse>, (StatusCode, JsonResponse<ErrorResponse>)> {
    // Dummy credential validation
    if !validate_credentials(&payload.username, &payload.password) {
        return Err((
            StatusCode::UNAUTHORIZED,
            JsonResponse(ErrorResponse {
                error: "Invalid credentials".to_string(),
            }),
        ));
    }

    // Get user roles (dummy data)
    let roles = get_user_roles(&payload.username);
    
    // Create JWT claims
    let now = chrono::Utc::now();
    let exp = (now + chrono::Duration::hours(24)).timestamp() as usize;
    let iat = now.timestamp() as usize;
    
    let claims = Claims {
        sub: payload.username.clone(),
        roles,
        exp,
        iat,
    };

    // Sign the JWT token
    let secret = "your-secret-key"; // In production, use environment variable
    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_ref()),
    )
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            JsonResponse(ErrorResponse {
                error: "Failed to generate token".to_string(),
            }),
        )
    })?;

    Ok(JsonResponse(LoginResponse {
        token,
        user_id: payload.username,
        roles: claims.roles,
    }))
}

fn validate_credentials(username: &str, password: &str) -> bool {
    // Dummy validation - in production, check against database
    username == "admin" && password == "password123"
}

fn get_user_roles(username: &str) -> Vec<String> {
    // Dummy role assignment - in production, fetch from database
    match username {
        "admin" => vec!["admin".to_string(), "user".to_string()],
        "user" => vec!["user".to_string()],
        _ => vec!["user".to_string()],
    }
}

// GET /auth/google (stub)
pub async fn google_oauth(Query(_query): Query<OAuthQuery>) -> impl IntoResponse {
    // In real implementation, redirect to Google, handle callback, exchange code for user info
    // For now, simulate success
    let username = "google_user";
    let roles = get_user_roles(username);
    let now = chrono::Utc::now();
    let exp = (now + chrono::Duration::hours(24)).timestamp() as usize;
    let iat = now.timestamp() as usize;
    let claims = Claims { sub: username.to_string(), roles, exp, iat };
    let secret = env::var("JWT_SECRET").unwrap_or_else(|_| "your-secret-key".to_string());
    let token = encode(&Header::default(), &claims, &EncodingKey::from_secret(secret.as_ref())).unwrap();
    Json(LoginResponse { token, user_id: username.to_string(), roles: claims.roles })
}

// GET /auth/github (stub)
pub async fn github_oauth(Query(_query): Query<OAuthQuery>) -> impl IntoResponse {
    // In real implementation, redirect to GitHub, handle callback, exchange code for user info
    let username = "github_user";
    let roles = get_user_roles(username);
    let now = chrono::Utc::now();
    let exp = (now + chrono::Duration::hours(24)).timestamp() as usize;
    let iat = now.timestamp() as usize;
    let claims = Claims { sub: username.to_string(), roles, exp, iat };
    let secret = env::var("JWT_SECRET").unwrap_or_else(|_| "your-secret-key".to_string());
    let token = encode(&Header::default(), &claims, &EncodingKey::from_secret(secret.as_ref())).unwrap();
    Json(LoginResponse { token, user_id: username.to_string(), roles: claims.roles })
}

// POST /auth/reset (stub)
pub async fn reset_password(Json(payload): Json<ResetRequest>) -> impl IntoResponse {
    // In real implementation, send reset email
    if payload.email.contains('@') {
        Json(serde_json::json!({ "status": "ok", "message": "Reset link sent" }))
    } else {
        (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Invalid email" })))
    }
}

// POST /auth/reset/confirm (stub)
pub async fn confirm_reset(Json(payload): Json<ResetConfirmRequest>) -> impl IntoResponse {
    // In real implementation, verify token, update password
    if payload.token == "valid-token" && payload.new_password.len() >= 8 {
        Json(serde_json::json!({ "status": "ok", "message": "Password updated" }))
    } else {
        (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Invalid token or password" })))
    }
}

// POST /auth/2fa/verify (stub)
pub async fn verify_2fa(Json(payload): Json<TwoFARequest>) -> impl IntoResponse {
    // In real implementation, check code for user
    if payload.code == "123456" {
        let roles = get_user_roles(&payload.username);
        let now = chrono::Utc::now();
        let exp = (now + chrono::Duration::hours(24)).timestamp() as usize;
        let iat = now.timestamp() as usize;
        let claims = Claims { sub: payload.username.clone(), roles, exp, iat };
        let secret = env::var("JWT_SECRET").unwrap_or_else(|_| "your-secret-key".to_string());
        let token = encode(&Header::default(), &claims, &EncodingKey::from_secret(secret.as_ref())).unwrap();
        Json(LoginResponse { token, user_id: payload.username, roles: claims.roles })
    } else {
        (StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Invalid 2FA code" })))
    }
} 