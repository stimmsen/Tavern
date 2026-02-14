use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

pub fn register_global_ptt(app: AppHandle, accelerator: &str) -> tauri::Result<()> {
    let global = app.global_shortcut();

    let _ = global.unregister_all();

    global.on_shortcut(accelerator, move |app_handle, _shortcut, event| {
        if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.emit("ptt-down", ());
            }
            return;
        }

        if let Some(window) = app_handle.get_webview_window("main") {
            let _ = window.emit("ptt-up", ());
        }
    }).map_err(|e| tauri::Error::Anyhow(e.into()))?;

    Ok(())
}
