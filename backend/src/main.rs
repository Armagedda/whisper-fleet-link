use axum::{
    routing::{get, post},
    Router,
};
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use std::fs;
use std::path::PathBuf;
use tracing_appender::rolling;

mod routes;
mod ws;
mod audio;
use routes::channels::AppState;
use ws::WsAppState;
use audio::AudioServer;
mod setup;
mod notify_helper;

#[tokio::main]
async fn main() {
    // Set up file logging to %APPDATA%/WhisperFleetLink/log.txt
    let log_dir = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    let log_dir = log_dir.join("WhisperFleetLink");
    fs::create_dir_all(&log_dir).ok();
    let file_appender = rolling::never(&log_dir, "log.txt");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer().with_writer(non_blocking))
        .init();

    // Orchestrate all setup, cert, and update logic
    if let Err(e) = run_startup().await {
        tracing::error!("Critical startup error: {}", e);
        notify_helper::notify_user("Whisper Fleet Link Error", &format!("Critical startup error: {}", e));
        std::process::exit(1);
    }

    // Configure CORS
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Create shared state
    let state = AppState::new();
    let ws_state = WsAppState::new();

    // Create audio server
    let audio_config = audio::AudioServerConfig {
        bind_addr: "0.0.0.0:8080".to_string(),
        max_packet_size: 1024,
        buffer_size: 8192,
        cleanup_interval: std::time::Duration::from_secs(60),
        user_timeout: std::time::Duration::from_secs(300),
        heartbeat_interval: std::time::Duration::from_secs(30),
        jwt_secret: "your-secret-key".to_string(),
    };
    
    let mut audio_server = AudioServer::new(audio_config, state.clone());

    // Create auth router
    let auth_router = Router::new()
        .route("/login", post(routes::auth::login))
        .route("/google", get(routes::auth::google_oauth))
        .route("/github", get(routes::auth::github_oauth))
        .route("/reset", post(routes::auth::reset_password))
        .route("/reset/confirm", post(routes::auth::confirm_reset))
        .route("/2fa/verify", post(routes::auth::verify_2fa));

    // Create channels router with new role management endpoints
    let channels_router = Router::new()
        .route("/", post(routes::channels::create_channel))
        .route("/:id/join", post(routes::channels::join_channel))
        .route("/:id/users", get(routes::channels::list_users))
        .route("/:id/invite", post(routes::channels::invite_user))
        .route("/:id/invites", get(routes::channels::list_invites))
        .route("/:id/invites/:token", post(routes::channels::revoke_invite))
        .route("/:id/users/:user_id/role", post(routes::channels::change_user_role))
        .route("/:id/users/:user_id/kick", post(routes::channels::kick_user))
        .route("/:id/users/:user_id/ban", post(routes::channels::ban_user))
        .route("/:id/users/:user_id/unban", post(routes::channels::unban_user))
        .with_state(state.clone());

    // Create WebSocket router
    let ws_router = Router::new()
        .route("/", ws::ws_handler)
        .with_state(ws_state);

    // Create main router
    let app = Router::new()
        .nest("/auth", auth_router)
        .nest("/channels", channels_router)
        .nest("/ws", ws_router)
        .layer(cors);

    // Start HTTP server
    let http_listener = tokio::net::TcpListener::bind("127.0.0.1:3000")
        .await
        .unwrap();
    
    tracing::info!("HTTP server running on http://127.0.0.1:3000");
    tracing::info!("UDP audio server starting on 0.0.0.0:8080");

    // Start both servers concurrently
    tokio::select! {
        _ = axum::serve(http_listener, app) => {
            tracing::info!("HTTP server stopped");
        }
        _ = async {
            if let Err(e) = audio_server.start().await {
                tracing::error!("Audio server error: {}", e);
            }
        } => {
            tracing::info!("Audio server stopped");
        }
    }
}

async fn run_startup() -> Result<(), String> {
    // 1. Setup (keys, config, certs)
    setup::run_first_time_setup().await;
    // 2. Auto-update (non-blocking)
    tokio::spawn(async {
        if let Err(e) = crate::auto_update::check_and_apply_update(env!("CARGO_PKG_VERSION")).await {
            tracing::warn!("Auto-update failed: {}", e);
        }
    });
    Ok(())
} 