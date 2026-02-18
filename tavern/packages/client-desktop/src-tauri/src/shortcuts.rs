use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

pub fn register_global_ptt(app: AppHandle, accelerator: &str) -> tauri::Result<()> {
    let global = app.global_shortcut();

    if let Err(error) = global.unregister_all() {
        eprintln!("[shortcuts] Failed to unregister existing shortcuts: {error}");
    }

    let result = global
        .on_shortcut(accelerator, move |app_handle, _shortcut, event| {
            if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.emit("ptt-down", ());
                }
                return;
            }

            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.emit("ptt-up", ());
            }
        })
        .map_err(|e| tauri::Error::Anyhow(e.into()));

    if let Err(error) = result {
        let message = error.to_string().to_lowercase();
        if message.contains("already registered") {
            eprintln!("[shortcuts] Shortcut already registered for '{accelerator}', skipping registration");
            return Ok(());
        }

        return Err(error);
    }

    Ok(())
}
