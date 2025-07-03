use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use std::env;

pub async fn send_reset_email(to: &str, token: &str) -> Result<(), String> {
    let smtp_host = env::var("SMTP_HOST").unwrap();
    let smtp_port = env::var("SMTP_PORT").unwrap().parse().unwrap();
    let smtp_user = env::var("SMTP_USER").unwrap();
    let smtp_pass = env::var("SMTP_PASS").unwrap();
    let email_from = env::var("EMAIL_FROM").unwrap();
    let frontend_url = env::var("FRONTEND_URL").unwrap();
    let reset_link = format!("{}/reset/confirm?token={}", frontend_url, token);
    let email = Message::builder()
        .from(email_from.parse().unwrap())
        .to(to.parse().unwrap())
        .subject("Reset your VoiceLink password")
        .body(format!("Click the link to reset your password: {}\nIf you did not request this, ignore this email.", reset_link))
        .unwrap();
    let creds = lettre::transport::smtp::authentication::Credentials::new(smtp_user, smtp_pass);
    let mailer = AsyncSmtpTransport::<Tokio1Executor>::relay(&smtp_host)
        .unwrap()
        .port(smtp_port)
        .credentials(creds)
        .build();
    mailer.send(email).await.map_err(|e| format!("Email error: {}", e))?;
    Ok(())
}

pub async fn send_2fa_email(to: &str, code: &str) -> Result<(), String> {
    let smtp_host = env::var("SMTP_HOST").unwrap();
    let smtp_port = env::var("SMTP_PORT").unwrap().parse().unwrap();
    let smtp_user = env::var("SMTP_USER").unwrap();
    let smtp_pass = env::var("SMTP_PASS").unwrap();
    let email_from = env::var("EMAIL_FROM").unwrap();
    let email = Message::builder()
        .from(email_from.parse().unwrap())
        .to(to.parse().unwrap())
        .subject("Your VoiceLink 2FA Code")
        .body(format!("Your 2FA code is: {}\nIf you did not request this, ignore this email.", code))
        .unwrap();
    let creds = lettre::transport::smtp::authentication::Credentials::new(smtp_user, smtp_pass);
    let mailer = AsyncSmtpTransport::<Tokio1Executor>::relay(&smtp_host)
        .unwrap()
        .port(smtp_port)
        .credentials(creds)
        .build();
    mailer.send(email).await.map_err(|e| format!("Email error: {}", e))?;
    Ok(())
} 