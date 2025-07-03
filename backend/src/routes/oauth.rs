use axum::{extract::{Query, State}, response::Redirect, http::StatusCode, Json as JsonResponse};
use oauth2::{AuthorizationCode, CsrfToken, Scope, TokenResponse, basic::BasicClient, AuthUrl, ClientId, ClientSecret, RedirectUrl, TokenUrl};
use oauth2::reqwest::async_http_client;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;
use std::env;
use crate::routes::user::User;
use jsonwebtoken::{encode, EncodingKey, Header};
use chrono::{Utc, Duration};

#[derive(Debug, Deserialize)]
pub struct OAuthCallback {
    code: String,
    state: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user_id: Uuid,
    pub roles: Vec<String>,
}

fn google_client() -> BasicClient {
    BasicClient::new(
        ClientId::new(env::var("GOOGLE_CLIENT_ID").unwrap()),
        Some(ClientSecret::new(env::var("GOOGLE_CLIENT_SECRET").unwrap())),
        AuthUrl::new("https://accounts.google.com/o/oauth2/v2/auth".to_string()).unwrap(),
        Some(TokenUrl::new("https://oauth2.googleapis.com/token".to_string()).unwrap()),
    )
    .set_redirect_uri(RedirectUrl::new(env::var("FRONTEND_URL").unwrap() + "/oauth/google/callback").unwrap())
}

fn github_client() -> BasicClient {
    BasicClient::new(
        ClientId::new(env::var("GITHUB_CLIENT_ID").unwrap()),
        Some(ClientSecret::new(env::var("GITHUB_CLIENT_SECRET").unwrap())),
        AuthUrl::new("https://github.com/login/oauth/authorize".to_string()).unwrap(),
        Some(TokenUrl::new("https://github.com/login/oauth/access_token".to_string()).unwrap()),
    )
    .set_redirect_uri(RedirectUrl::new(env::var("FRONTEND_URL").unwrap() + "/oauth/github/callback").unwrap())
}

pub async fn google_oauth_start() -> Redirect {
    let (auth_url, _csrf) = google_client()
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("openid email profile".to_string()))
        .url();
    Redirect::temporary(auth_url.to_string())
}

pub async fn google_oauth_callback(State(pool): State<PgPool>, Query(cb): Query<OAuthCallback>) -> Result<JsonResponse<AuthResponse>, (StatusCode, JsonResponse<String>)> {
    let client = google_client();
    let token = client.exchange_code(AuthorizationCode::new(cb.code)).request_async(async_http_client).await.map_err(|_| (StatusCode::UNAUTHORIZED, JsonResponse("OAuth token exchange failed".to_string())))?;
    let access_token = token.access_token().secret();
    let userinfo: serde_json::Value = reqwest::Client::new()
        .get("https://openidconnect.googleapis.com/v1/userinfo")
        .bearer_auth(access_token)
        .send().await.map_err(|_| (StatusCode::UNAUTHORIZED, JsonResponse("Failed to fetch user info".to_string())))?
        .json().await.map_err(|_| (StatusCode::UNAUTHORIZED, JsonResponse("Invalid user info".to_string())))?;
    let email = userinfo["email"].as_str().unwrap();
    let username = userinfo["name"].as_str().unwrap_or(email);
    // Upsert user
    let user = match User::get_by_email(&pool, email).await.unwrap() {
        Some(u) => u,
        None => User::create(&pool, username, email, "oauth", &vec!["user".to_string()]).await.unwrap(),
    };
    // Issue JWT
    let now = Utc::now();
    let exp = (now + Duration::hours(24)).timestamp() as usize;
    let iat = now.timestamp() as usize;
    let claims = crate::routes::auth::Claims { sub: user.id.to_string(), roles: user.roles.clone(), exp, iat };
    let secret = env::var("JWT_SECRET").unwrap();
    let token = encode(&Header::default(), &claims, &EncodingKey::from_secret(secret.as_ref())).unwrap();
    Ok(JsonResponse(AuthResponse { token, user_id: user.id, roles: user.roles }))
}

pub async fn github_oauth_start() -> Redirect {
    let (auth_url, _csrf) = github_client()
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("read:user user:email".to_string()))
        .url();
    Redirect::temporary(auth_url.to_string())
}

pub async fn github_oauth_callback(State(pool): State<PgPool>, Query(cb): Query<OAuthCallback>) -> Result<JsonResponse<AuthResponse>, (StatusCode, JsonResponse<String>)> {
    let client = github_client();
    let token = client.exchange_code(AuthorizationCode::new(cb.code)).request_async(async_http_client).await.map_err(|_| (StatusCode::UNAUTHORIZED, JsonResponse("OAuth token exchange failed".to_string())))?;
    let access_token = token.access_token().secret();
    let userinfo: serde_json::Value = reqwest::Client::new()
        .get("https://api.github.com/user")
        .bearer_auth(access_token)
        .header("User-Agent", "VoiceLink")
        .send().await.map_err(|_| (StatusCode::UNAUTHORIZED, JsonResponse("Failed to fetch user info".to_string())))?
        .json().await.map_err(|_| (StatusCode::UNAUTHORIZED, JsonResponse("Invalid user info".to_string())))?;
    let email = userinfo["email"].as_str().unwrap_or("");
    let username = userinfo["login"].as_str().unwrap_or(email);
    // Upsert user
    let user = match User::get_by_email(&pool, email).await.unwrap() {
        Some(u) => u,
        None => User::create(&pool, username, email, "oauth", &vec!["user".to_string()]).await.unwrap(),
    };
    // Issue JWT
    let now = Utc::now();
    let exp = (now + Duration::hours(24)).timestamp() as usize;
    let iat = now.timestamp() as usize;
    let claims = crate::routes::auth::Claims { sub: user.id.to_string(), roles: user.roles.clone(), exp, iat };
    let secret = env::var("JWT_SECRET").unwrap();
    let token = encode(&Header::default(), &claims, &EncodingKey::from_secret(secret.as_ref())).unwrap();
    Ok(JsonResponse(AuthResponse { token, user_id: user.id, roles: user.roles }))
} 