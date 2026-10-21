//! Splay: a full-screen app launcher. One shortcut fills the screen with all your apps,
//! in pages and folders you arrange, with search, a calculator and app groups.

mod apps;

use apps::{App, IconCache};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub const DEFAULT_SHORTCUT: &str = "Ctrl+Alt+Space";

fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

/// Which monitor (index into the list) contains a point, or the first one.
pub fn monitor_at(rects: &[(i32, i32, u32, u32)], p: (f64, f64)) -> usize {
    rects
        .iter()
        .position(|&(x, y, w, h)| p.0 >= x as f64 && p.0 < x as f64 + w as f64 && p.1 >= y as f64 && p.1 < y as f64 + h as f64)
        .unwrap_or(0)
}

/// Fills the screen the mouse is on and brings Splay to the front.
fn show(app: &AppHandle) {
    let Some(win) = window(app) else { return };
    if let Ok(monitors) = app.available_monitors() {
        let rects: Vec<_> = monitors.iter().map(|m| (m.position().x, m.position().y, m.size().width, m.size().height)).collect();
        let cursor = app.cursor_position().map(|c| (c.x, c.y)).unwrap_or((0.0, 0.0));
        if let Some(m) = monitors.get(monitor_at(&rects, cursor)) {
            let _ = win.set_position(PhysicalPosition::new(m.position().x, m.position().y));
            let _ = win.set_size(PhysicalSize::new(m.size().width, m.size().height));
        }
    }
    let _ = win.show();
    let _ = win.set_focus();
    let _ = app.emit("splay://shown", ());
}

#[tauri::command]
fn hide(app: AppHandle) {
    if let Some(win) = window(&app) {
        let _ = win.hide();
    }
}

fn toggle(app: &AppHandle) {
    match window(app) {
        Some(w) if w.is_visible().unwrap_or(false) => {
            let _ = w.hide();
        }
        _ => show(app),
    }
}

#[tauri::command]
async fn list_apps() -> Vec<App> {
    tauri::async_runtime::spawn_blocking(apps::scan).await.unwrap_or_default()
}

#[tauri::command]
async fn icon(app: AppHandle, id: String) -> Option<String> {
    if let Some(hit) = app.state::<IconCache>().0.lock().unwrap().get(&id) {
        return hit.clone();
    }
    let key = id.clone();
    let found = tauri::async_runtime::spawn_blocking(move || apps::icon(&key)).await.ok().flatten();
    app.state::<IconCache>().0.lock().unwrap().insert(id, found.clone());
    found
}

#[tauri::command]
fn launch(app: AppHandle, id: String) -> Result<(), String> {
    #[cfg(all(unix, not(target_os = "macos")))]
    let r = {
        let _ = &app;
        apps::launch(&id)
    };
    #[cfg(not(all(unix, not(target_os = "macos"))))]
    let r = {
        use tauri_plugin_opener::OpenerExt;
        app.opener().open_path(&id, None::<&str>).map_err(|e| e.to_string())
    };
    r
}

#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("only web addresses".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// Swaps the global shortcut. Returns the one now in use.
#[tauri::command]
fn set_shortcut(app: AppHandle, accel: String) -> Result<String, String> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    match gs.register(accel.as_str()) {
        Ok(()) => Ok(accel),
        Err(e) => {
            let _ = gs.register(DEFAULT_SHORTCUT);
            Err(format!("{accel} is taken or not valid ({e}), so Splay is using {DEFAULT_SHORTCUT}"))
        }
    }
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

pub fn run() {
    tauri::Builder::default()
        .manage(IconCache::default())
        .plugin(tauri_plugin_single_instance::init(|app, _, _| show(app)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _, event| {
                    if event.state == ShortcutState::Pressed {
                        toggle(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![list_apps, icon, launch, open_url, hide, set_shortcut, quit])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            let handle = app.handle().clone();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Splay")
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .skip_taskbar(true)
                .shadow(false)
                .min_inner_size(2.0, 2.0)
                .visible(false)
                .build()?;
            let _ = app.global_shortcut().register(DEFAULT_SHORTCUT);

            let open = MenuItem::with_id(app, "open", "Open Splay", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Splay", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&open, &sep, &quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().expect("app icon"))
                .tooltip("Splay")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        show(tray.app_handle());
                    }
                })
                .build(app)?;

            // The first launch opens Splay once so you see how it works.
            if let Ok(marker) = handle.path().app_config_dir().map(|d| d.join("launched")) {
                if !marker.exists() {
                    let _ = std::fs::create_dir_all(marker.parent().unwrap());
                    let _ = std::fs::write(&marker, b"1");
                    let h = handle.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(800));
                        let h2 = h.clone();
                        let _ = h.run_on_main_thread(move || show(&h2));
                    });
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Splay");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opens_on_the_screen_with_the_mouse() {
        let screens = [(0, 0, 1920, 1080), (1920, -200, 2560, 1440)];
        assert_eq!(monitor_at(&screens, (100.0, 100.0)), 0);
        assert_eq!(monitor_at(&screens, (2000.0, -100.0)), 1);
        assert_eq!(monitor_at(&screens, (-50.0, 0.0)), 0);
    }
}
