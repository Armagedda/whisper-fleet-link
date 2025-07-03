use axum::{
    routing::{get, post},
    Router,
};
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod routes;
mod ws;
mod audio;
use routes::channels::AppState;
use ws::WsAppState;
use audio::AudioServer;

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

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
        .route("/login", post(routes::auth::login));

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