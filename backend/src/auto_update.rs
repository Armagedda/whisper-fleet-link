use std::fs;
use std::io::Write;
use std::process::Command;
use reqwest::Client;
use ring::signature::{UnparsedPublicKey, ED25519_PUBLIC_KEY_LEN, ED25519};

const UPDATE_URL: &str = "https://updates.whisperfleet.link/latest.json";
const PUBLIC_KEY: &[u8; ED25519_PUBLIC_KEY_LEN] = b"<YOUR_ED25519_PUBLIC_KEY_BYTES_HERE>";

pub async fn check_and_apply_update(current_version: &str) -> Result<(), String> {
    let client = Client::new();
    let resp = client.get(UPDATE_URL).send().await.map_err(|e| e.to_string())?;
    let meta: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let latest_version = meta["version"].as_str().ok_or("No version in update meta")?;
    if latest_version == current_version {
        println!("[update] Already up to date.");
        return Ok(());
    }
    let exe_url = meta["exe_url"].as_str().ok_or("No exe_url in update meta")?;
    let sig_url = meta["sig_url"].as_str().ok_or("No sig_url in update meta")?;
    let exe_bytes = client.get(exe_url).send().await.map_err(|e| e.to_string())?.bytes().await.map_err(|e| e.to_string())?;
    let sig_bytes = client.get(sig_url).send().await.map_err(|e| e.to_string())?.bytes().await.map_err(|e| e.to_string())?;
    // Verify signature
    let pubkey = UnparsedPublicKey::new(&ED25519, PUBLIC_KEY);
    pubkey.verify(&exe_bytes, &sig_bytes).map_err(|_| "Signature verification failed".to_string())?;
    // Write to temp file
    let tmp_path = "backend/updated_backend.exe";
    let mut f = fs::File::create(tmp_path).map_err(|e| e.to_string())?;
    f.write_all(&exe_bytes).map_err(|e| e.to_string())?;
    f.sync_all().map_err(|e| e.to_string())?;
    println!("[update] Update downloaded and verified. Replacing executable...");
    // Replace current exe (Windows: need to schedule replace on next restart or use a helper)
    // For now, just log and exit
    println!("[update] Please manually replace backend.exe with updated_backend.exe and restart.");
    Ok(())
} 