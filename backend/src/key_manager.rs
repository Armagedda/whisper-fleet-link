use std::io;
use std::fs;
use std::path::Path;
use rand::RngCore;

const KEY_FILE: &str = "backend/whisperlink.key";

#[cfg(target_os = "windows")]
mod windows {
    use super::*;
    use dpapi::ProtectionScope;

    pub fn get_or_create_key() -> io::Result<[u8; 32]> {
        if Path::new(KEY_FILE).exists() {
            let enc = fs::read(KEY_FILE)?;
            let key = dpapi::decrypt_data(&enc, None, ProtectionScope::CurrentUser)
                .map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;
            let mut arr = [0u8; 32];
            arr.copy_from_slice(&key);
            Ok(arr)
        } else {
            let mut key = [0u8; 32];
            rand::thread_rng().fill_bytes(&mut key);
            let enc = dpapi::encrypt_data(&key, None, ProtectionScope::CurrentUser)
                .map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;
            fs::write(KEY_FILE, enc)?;
            Ok(key)
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn get_or_create_key() -> io::Result<[u8; 32]> {
    Err(io::Error::new(io::ErrorKind::Other, "Key storage only implemented for Windows"))
}

#[cfg(target_os = "windows")]
pub use windows::get_or_create_key; 