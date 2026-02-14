use std::{fs, path::PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::{shortcuts, AppState};

#[derive(Deserialize)]
pub struct TrayStatePayload {
    state: String,
}

#[derive(Deserialize)]
pub struct PttPayload {
    accelerator: String,
}

#[derive(Deserialize)]
pub struct NotifyPayload {
    title: String,
    body: String,
}

#[derive(Serialize)]
pub struct SkinEntry {
    name: String,
    css: String,
}

#[tauri::command]
pub fn set_tray_state(app: AppHandle, payload: TrayStatePayload) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("tray-state", payload.state);
    }

    Ok(())
}

#[tauri::command]
pub fn set_global_ptt_key(
    app: AppHandle,
    payload: PttPayload,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    if payload.accelerator.trim().is_empty() {
        return Err("PTT key cannot be empty".to_string());
    }

    if let Ok(mut key) = state.ptt_key.lock() {
        *key = payload.accelerator.clone();
    }

    shortcuts::register_global_ptt(app, payload.accelerator.as_str())
        .map_err(|error| format!("Failed to register shortcut: {error}"))
}

#[tauri::command]
pub fn notify_desktop(app: AppHandle, payload: NotifyPayload) -> Result<(), String> {
    let notification = tauri_plugin_notification::NotificationExt::notification(&app)
        .builder()
        .title(payload.title)
        .body(payload.body)
        .show();

    notification.map_err(|error| format!("Notification failed: {error}"))
}

fn skins_dir() -> Option<PathBuf> {
    let home = std::env::var("HOME")
        .ok()
        .or_else(|| std::env::var("USERPROFILE").ok())?;
    Some(PathBuf::from(home).join(".tavern").join("skins"))
}

#[tauri::command]
pub fn list_skins() -> Result<Vec<SkinEntry>, String> {
    let Some(directory) = skins_dir() else {
        return Ok(Vec::new());
    };

    if !directory.exists() {
        return Ok(Vec::new());
    }

    let mut skins = Vec::new();

    for entry in fs::read_dir(directory).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();

        let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
            continue;
        };

        if extension != "css" && extension != "tavern-skin" {
            continue;
        }

        let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("skin")
            .to_string();

        if extension == "css" {
            skins.push(SkinEntry {
                name: file_name,
                css: content,
            });
            continue;
        }

        let parsed = serde_json::from_str::<serde_json::Value>(&content)
            .map_err(|error| error.to_string())?;

        let name = parsed
            .get("name")
            .and_then(|value| value.as_str())
            .unwrap_or(file_name.as_str())
            .to_string();

        let css = parsed
            .get("css")
            .and_then(|value| value.as_str())
            .ok_or_else(|| "Skin manifest missing css field".to_string())?
            .to_string();

        skins.push(SkinEntry { name, css });
    }

    Ok(skins)
}

#[tauri::command]
pub fn focus_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }

    Ok(())
}
