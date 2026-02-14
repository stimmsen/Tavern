use tauri::{App, Emitter, Manager};

pub fn setup_tray(app: &mut App) -> tauri::Result<()> {
    let menu = tauri::menu::MenuBuilder::new(app)
        .item(&tauri::menu::MenuItem::with_id(
            app,
            "toggle_window",
            "Show / Hide Tavern",
            true,
            None::<&str>,
        )?)
        .item(&tauri::menu::MenuItem::with_id(
            app,
            "toggle_mute",
            "Mute / Unmute",
            true,
            None::<&str>,
        )?)
        .item(&tauri::menu::MenuItem::with_id(
            app,
            "disconnect",
            "Disconnect",
            true,
            None::<&str>,
        )?)
        .item(&tauri::menu::MenuItem::with_id(
            app,
            "quit",
            "Quit Tavern",
            true,
            None::<&str>,
        )?)
        .build()?;

    let app_handle = app.handle().clone();

    tauri::tray::TrayIconBuilder::new()
        .menu(&menu)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "toggle_window" => {
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
            "toggle_mute" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("tray-toggle-mute", ());
                }
            }
            "disconnect" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("tray-disconnect", ());
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(move |tray, event| {
            if let tauri::tray::TrayIconEvent::Click { .. } = event {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    let _ = app_handle;
    Ok(())
}
