use std::fs;
use std::io::{self, Write};
use std::path::Path;
mod key_manager;
use crate::letsencrypt;
use serde::Deserialize;

#[derive(Deserialize)]
struct AppConfig {
    domain: String,
    email: String,
    // ... other fields ...
}

pub async fn run_first_time_setup() {
    // 1. Get or create encryption key
    let key = match key_manager::get_or_create_key() {
        Ok(k) => k,
        Err(e) => {
            eprintln!("[setup] Failed to get encryption key: {}", e);
            return;
        }
    };
    // 2. Decrypt config.json in memory
    let config: Option<AppConfig> = if Path::new("backend/backend/config.json.enc").exists() {
        match decrypt_file_in_memory("backend/backend/config.json.enc", &key) {
            Ok(config_bytes) => {
                match serde_json::from_slice(&config_bytes) {
                    Ok(cfg) => Some(cfg),
                    Err(e) => {
                        eprintln!("[setup] Failed to parse config.json: {}", e);
                        None
                    }
                }
            }
            Err(e) => {
                eprintln!("[setup] Failed to decrypt config.json.enc: {}", e);
                None
            }
        }
    } else { None };
    // 3. Obtain or generate TLS certs
    if let Some(cfg) = &config {
        match crate::letsencrypt::obtain_certificate(&cfg.domain, &cfg.email).await {
            Ok((cert, key)) => {
                std::fs::write("backend/cert.pem", &cert).ok();
                std::fs::write("backend/key.pem", &key).ok();
                println!("[setup] TLS certificate ready for {}", cfg.domain);
            }
            Err(e) => {
                eprintln!("[setup] Failed to obtain/generate TLS cert: {}", e);
            }
        }
    } else {
        eprintln!("[setup] No config found, skipping Let's Encrypt");
    }
}

fn decrypt_file_in_memory(input: &str, key: &[u8]) -> io::Result<Vec<u8>> {
    let data = fs::read(input)?;
    if data.len() < 16 { return Err(io::Error::new(io::ErrorKind::InvalidData, "File too short")); }
    let iv = &data[..16];
    let ciphertext = &data[16..];
    use aes::Aes256;
    use block_modes::{BlockMode, Cbc};
    use block_modes::block_padding::Pkcs7;
    type Aes256Cbc = Cbc<Aes256, Pkcs7>;
    let cipher = Aes256Cbc::new_from_slices(key, iv).map_err(|_| io::Error::new(io::ErrorKind::Other, "Cipher init failed"))?;
    let decrypted = cipher.decrypt_vec(ciphertext).map_err(|_| io::Error::new(io::ErrorKind::Other, "Decryption failed"))?;
    Ok(decrypted)
}

fn decrypt_file(input: &str, output: &str) -> io::Result<()> {
    // Use a built-in key for demonstration (replace with secure key management in production)
    let key = b"0123456789abcdef0123456789abcdef"; // 32 bytes for AES-256
    let data = fs::read(input)?;
    if data.len() < 16 { return Err(io::Error::new(io::ErrorKind::InvalidData, "File too short")); }
    let iv = &data[..16];
    let ciphertext = &data[16..];
    use aes::Aes256;
    use block_modes::{BlockMode, Cbc};
    use block_modes::block_padding::Pkcs7;
    type Aes256Cbc = Cbc<Aes256, Pkcs7>;
    let cipher = Aes256Cbc::new_from_slices(key, iv).map_err(|_| io::Error::new(io::ErrorKind::Other, "Cipher init failed"))?;
    let decrypted = cipher.decrypt_vec(ciphertext).map_err(|_| io::Error::new(io::ErrorKind::Other, "Decryption failed"))?;
    fs::write(output, decrypted)?;
    Ok(())
}

fn generate_self_signed_cert(cert_path: &str, key_path: &str) -> io::Result<()> {
    use openssl::rsa::Rsa;
    use openssl::x509::{X509, X509NameBuilder};
    use openssl::pkey::PKey;
    use openssl::x509::X509Builder;
    use openssl::x509::extension::SubjectAlternativeName;
    use openssl::hash::MessageDigest;
    use openssl::asn1::Asn1Time;
    // Generate key
    let rsa = Rsa::generate(4096).map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;
    let pkey = PKey::from_rsa(rsa).map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;
    // Build cert
    let mut name = X509NameBuilder::new().unwrap();
    name.append_entry_by_text("CN", "WhisperFleetLink").unwrap();
    let name = name.build();
    let mut builder = X509Builder::new().unwrap();
    builder.set_version(2).unwrap();
    builder.set_subject_name(&name).unwrap();
    builder.set_issuer_name(&name).unwrap();
    builder.set_pubkey(&pkey).unwrap();
    builder.set_not_before(&Asn1Time::days_from_now(0).unwrap()).unwrap();
    builder.set_not_after(&Asn1Time::days_from_now(365).unwrap()).unwrap();
    let mut san = SubjectAlternativeName::new();
    san.dns("localhost");
    let san_ext = san.build(&builder.x509v3_context(None, None)).unwrap();
    builder.append_extension(san_ext).unwrap();
    builder.sign(&pkey, MessageDigest::sha256()).unwrap();
    let cert = builder.build();
    // Write files
    let cert_pem = cert.to_pem().unwrap();
    let key_pem = pkey.private_key_to_pem_pkcs8().unwrap();
    fs::write(cert_path, cert_pem)?;
    fs::write(key_path, key_pem)?;
    Ok(())
} 