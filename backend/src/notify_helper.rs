pub fn notify_user(title: &str, message: &str) {
    #[cfg(target_os = "windows")]
    {
        if let Err(e) = notify_rust::Notification::new()
            .summary(title)
            .body(message)
            .show() {
            eprintln!("[notify] Failed to show notification: {}", e);
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        // No-op on non-Windows
    }
} 