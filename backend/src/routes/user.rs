use serde::{Serialize, Deserialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub password_hash: String,
    pub roles: Vec<String>,
    pub twofa_secret: Option<String>,
    pub reset_token: Option<String>,
    pub reset_token_expiry: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl User {
    pub async fn get_by_id(pool: &PgPool, id: Uuid) -> sqlx::Result<Option<Self>> {
        sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await
    }
    pub async fn get_by_username(pool: &PgPool, username: &str) -> sqlx::Result<Option<Self>> {
        sqlx::query_as::<_, User>("SELECT * FROM users WHERE username = $1")
            .bind(username)
            .fetch_optional(pool)
            .await
    }
    pub async fn get_by_email(pool: &PgPool, email: &str) -> sqlx::Result<Option<Self>> {
        sqlx::query_as::<_, User>("SELECT * FROM users WHERE email = $1")
            .bind(email)
            .fetch_optional(pool)
            .await
    }
    pub async fn create(pool: &PgPool, username: &str, email: &str, password_hash: &str, roles: &[String]) -> sqlx::Result<Self> {
        let rec = sqlx::query_as::<_, User>(
            "INSERT INTO users (id, username, email, password_hash, roles, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, now(), now()) RETURNING *"
        )
        .bind(Uuid::new_v4())
        .bind(username)
        .bind(email)
        .bind(password_hash)
        .bind(roles)
        .fetch_one(pool)
        .await?;
        Ok(rec)
    }
    pub async fn update_password(&self, pool: &PgPool, new_hash: &str) -> sqlx::Result<()> {
        sqlx::query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2")
            .bind(new_hash)
            .bind(self.id)
            .execute(pool)
            .await?;
        Ok(())
    }
    pub async fn set_2fa_secret(&self, pool: &PgPool, secret: &str) -> sqlx::Result<()> {
        sqlx::query("UPDATE users SET twofa_secret = $1, updated_at = now() WHERE id = $2")
            .bind(secret)
            .bind(self.id)
            .execute(pool)
            .await?;
        Ok(())
    }
    pub async fn set_reset_token(&self, pool: &PgPool, token: &str, expiry: DateTime<Utc>) -> sqlx::Result<()> {
        sqlx::query("UPDATE users SET reset_token = $1, reset_token_expiry = $2, updated_at = now() WHERE id = $3")
            .bind(token)
            .bind(expiry)
            .bind(self.id)
            .execute(pool)
            .await?;
        Ok(())
    }
    pub async fn clear_reset_token(&self, pool: &PgPool) -> sqlx::Result<()> {
        sqlx::query("UPDATE users SET reset_token = NULL, reset_token_expiry = NULL, updated_at = now() WHERE id = $1")
            .bind(self.id)
            .execute(pool)
            .await?;
        Ok(())
    }
} 