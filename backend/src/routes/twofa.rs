use oath::totp_raw_now;
use rand::RngCore;
use base32::{Alphabet, encode as base32_encode};
use std::env;

pub fn generate_totp_secret() -> (String, String) {
    let mut secret_bytes = [0u8; 20];
    rand::thread_rng().fill_bytes(&mut secret_bytes);
    let secret = base32_encode(Alphabet::RFC4648 { padding: false }, &secret_bytes);
    let username = "user"; // Replace with real username in handler
    let qr_svg = get_qr_svg(&secret, username);
    (secret, qr_svg)
}

pub fn verify_totp(secret: &str, code: &str) -> bool {
    if code.len() != 6 { return false; }
    let secret_bytes = match base32::decode(Alphabet::RFC4648 { padding: false }, secret) {
        Some(bytes) => bytes,
        None => return false,
    };
    let now = totp_raw_now(&secret_bytes, 6, 0, 30, &oath::HashType::SHA1);
    let code_int = code.parse::<u32>().unwrap_or(0);
    now == code_int
}

pub fn get_qr_svg(secret: &str, username: &str) -> String {
    let issuer = env::var("2FA_ISSUER").unwrap_or_else(|_| "VoiceLink".to_string());
    let url = format!(
        "otpauth://totp/{}:{}?secret={}&issuer={}&algorithm=SHA1&digits=6&period=30",
        issuer, username, secret, issuer
    );
    let code = qrcode::QrCode::new(url.as_bytes()).unwrap();
    code.render::<qrcode::render::svg::Color>().min_dimensions(200, 200).build()
} 