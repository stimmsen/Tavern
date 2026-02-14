mod commands;
mod shortcuts;
mod tray;

use tauri::Manager;

#[derive(Default)]
struct AppState {
  ptt_key: std::sync::Mutex<String>,
}

pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_fs::init())
    .manage(AppState {
      ptt_key: std::sync::Mutex::new("`".to_string()),
    })
    .invoke_handler(tauri::generate_handler![
      commands::set_tray_state,
      commands::set_global_ptt_key,
      commands::notify_desktop,
      commands::list_skins,
      commands::focus_main_window
    ])
    .setup(|app| {
      tray::setup_tray(app)?;
      shortcuts::register_global_ptt(app.handle().clone(), "`")?;

      if let Some(window) = app.get_webview_window("main") {
        let app_handle = app.handle().clone();
        window.on_window_event(move |event| {
          if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();

            if let Some(main_window) = app_handle.get_webview_window("main") {
              let _ = main_window.hide();
            }
          }
        });
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tavern desktop app");
}
