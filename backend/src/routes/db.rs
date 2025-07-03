use sqlx::{postgres::PgPoolOptions, PgPool};
use dotenvy::dotenv;
use std::env;

pub async fn get_pool() -> PgPool {
    dotenv().ok();
    let db_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    PgPoolOptions::new()
        .max_connections(10)
        .connect(&db_url)
        .await
        .expect("Failed to connect to Postgres")
}

pub async fn run_migrations(pool: &PgPool) {
    sqlx::migrate!("migrations").run(pool).await.expect("Migrations failed");
}

pub type DbPool = PgPool; 