//! Finding installed apps, their icons, and opening them, on each system.
//! Windows: shortcuts in the Start menu folders. macOS: .app bundles in the
//! Applications folders. Linux: .desktop entries in the XDG data folders.

#![cfg_attr(not(all(unix, not(target_os = "macos"))), allow(dead_code))]

use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct App {
    /// Stable id: the file the app was found at.
    pub id: String,
    pub name: String,
    /// Extra words search should match (Linux keywords and generic names).
    pub keywords: Vec<String>,
}

/// Shortcuts that aren't apps people want in a launcher.
pub fn is_noise(name: &str) -> bool {
    let n = name.to_lowercase();
    ["uninstall", "readme", "read me", "release notes", "documentation", "help", "website", "license", "changelog", "manual"]
        .iter()
        .any(|w| n.contains(w))
}

fn walk(dir: &Path, ext: &str, depth: usize, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let p = e.path();
        let is_ext = p.extension().is_some_and(|x| x.eq_ignore_ascii_case(ext));
        if is_ext {
            out.push(p);
        } else if depth > 0 && p.is_dir() {
            walk(&p, ext, depth - 1, out);
        }
    }
}

/// Sorted by name, one entry per name.
fn finish(mut apps: Vec<App>) -> Vec<App> {
    apps.retain(|a| !a.name.trim().is_empty() && !is_noise(&a.name));
    apps.sort_by_key(|a| a.name.to_lowercase());
    apps.dedup_by(|a, b| a.name.eq_ignore_ascii_case(&b.name));
    apps
}

// ---------- Windows

#[cfg(target_os = "windows")]
pub fn scan() -> Vec<App> {
    let mut roots = Vec::new();
    for var in ["ProgramData", "APPDATA"] {
        if let Some(base) = std::env::var_os(var) {
            roots.push(PathBuf::from(base).join(r"Microsoft\Windows\Start Menu\Programs"));
        }
    }
    let mut files = Vec::new();
    for r in &roots {
        walk(r, "lnk", 4, &mut files);
        walk(r, "url", 4, &mut files);
    }
    finish(
        files
            .into_iter()
            .map(|p| App { id: p.to_string_lossy().into(), name: p.file_stem().unwrap_or_default().to_string_lossy().into(), keywords: vec![] })
            .collect(),
    )
}

// ---------- macOS

#[cfg(target_os = "macos")]
pub fn scan() -> Vec<App> {
    let mut roots = vec![PathBuf::from("/Applications"), PathBuf::from("/System/Applications")];
    if let Some(home) = std::env::var_os("HOME") {
        roots.push(PathBuf::from(home).join("Applications"));
    }
    let mut files = Vec::new();
    for r in &roots {
        // .app bundles are folders: don't look inside them, but do look in Utilities etc.
        let Ok(entries) = std::fs::read_dir(r) else { continue };
        for e in entries.flatten() {
            let p = e.path();
            if p.extension().is_some_and(|x| x == "app") {
                files.push(p);
            } else if p.is_dir() {
                if let Ok(inner) = std::fs::read_dir(&p) {
                    files.extend(inner.flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|x| x == "app")));
                }
            }
        }
    }
    finish(
        files
            .into_iter()
            .map(|p| App { id: p.to_string_lossy().into(), name: p.file_stem().unwrap_or_default().to_string_lossy().into(), keywords: vec![] })
            .collect(),
    )
}

// ---------- Linux and other Unix

/// The parts of a .desktop file a launcher needs.
#[derive(Debug, Default, PartialEq)]
pub struct DesktopEntry {
    pub name: String,
    pub exec: String,
    pub icon: String,
    pub keywords: Vec<String>,
    pub terminal: bool,
    pub visible: bool,
}

/// Reads the [Desktop Entry] group. Localised names win when they match `lang` ("de", "pt_BR").
pub fn parse_desktop(text: &str, lang: &str) -> Option<DesktopEntry> {
    let mut in_entry = false;
    let mut e = DesktopEntry { visible: true, ..Default::default() };
    let mut is_app = false;
    let short = lang.split(['_', '.', '@']).next().unwrap_or("");
    let (mut name_rank, mut generic) = (0, String::new());
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            in_entry = line == "[Desktop Entry]";
            continue;
        }
        if !in_entry || line.starts_with('#') {
            continue;
        }
        let Some((k, v)) = line.split_once('=') else { continue };
        let (k, v) = (k.trim(), v.trim());
        match k {
            "Type" => is_app = v == "Application",
            "Name" if name_rank == 0 => {
                e.name = v.into();
                name_rank = 1;
            }
            "Exec" => e.exec = v.into(),
            "Icon" => e.icon = v.into(),
            "Terminal" => e.terminal = v == "true",
            "NoDisplay" | "Hidden" if v == "true" => e.visible = false,
            "Keywords" => e.keywords.extend(v.split(';').filter(|s| !s.is_empty()).map(String::from)),
            "GenericName" => generic = v.into(),
            _ => {
                if let Some(l) = k.strip_prefix("Name[").and_then(|s| s.strip_suffix(']')) {
                    let rank = if l == lang { 3 } else if l == short { 2 } else { 0 };
                    if rank > name_rank {
                        e.name = v.into();
                        name_rank = rank;
                    }
                }
            }
        }
    }
    if !generic.is_empty() {
        e.keywords.push(generic);
    }
    (is_app && !e.name.is_empty() && !e.exec.is_empty()).then_some(e)
}

/// The Exec line without the %f / %U style placeholders, ready for a shell.
pub fn clean_exec(exec: &str) -> String {
    let mut out = String::new();
    let mut chars = exec.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '%' {
            match chars.next() {
                Some('%') => out.push('%'),
                _ => {}
            }
        } else {
            out.push(c);
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(all(unix, not(target_os = "macos")))]
fn data_dirs() -> Vec<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default();
    let mut dirs = vec![std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).unwrap_or_else(|| home.join(".local/share"))];
    let sys = std::env::var("XDG_DATA_DIRS").unwrap_or_else(|_| "/usr/local/share:/usr/share".into());
    dirs.extend(sys.split(':').filter(|s| !s.is_empty()).map(PathBuf::from));
    dirs.push(home.join(".local/share/flatpak/exports/share"));
    dirs.push("/var/lib/flatpak/exports/share".into());
    dirs.push("/var/lib/snapd/desktop".into());
    let mut seen = std::collections::HashSet::new();
    dirs.retain(|d| seen.insert(d.clone()));
    dirs
}

#[cfg(all(unix, not(target_os = "macos")))]
fn lang() -> String {
    std::env::var("LC_MESSAGES").or_else(|_| std::env::var("LANG")).unwrap_or_default().split('.').next().unwrap_or("").into()
}

#[cfg(all(unix, not(target_os = "macos")))]
pub fn scan() -> Vec<App> {
    let lang = lang();
    // Earlier folders win for the same desktop file id (your own entries override the system's).
    // A hidden entry also hides copies further down the list.
    let mut by_id: HashMap<String, Option<App>> = HashMap::new();
    for dir in data_dirs() {
        let apps_dir = dir.join("applications");
        let mut files = Vec::new();
        walk(&apps_dir, "desktop", 3, &mut files);
        for f in files {
            let id = f.strip_prefix(&apps_dir).unwrap_or(&f).to_string_lossy().replace('/', "-");
            if by_id.contains_key(&id) {
                continue;
            }
            let Ok(text) = std::fs::read_to_string(&f) else { continue };
            let app = parse_desktop(&text, &lang).filter(|e| e.visible).map(|e| App { id: f.to_string_lossy().into(), name: e.name, keywords: e.keywords });
            by_id.insert(id, app);
        }
    }
    finish(by_id.into_values().flatten().collect())
}

#[cfg(not(any(unix, target_os = "windows")))]
pub fn scan() -> Vec<App> {
    Vec::new()
}

// ---------- Icons, as data: URLs the page can show directly

fn data_url(mime: &str, bytes: &[u8]) -> String {
    use base64::Engine;
    format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
pub fn icon(id: &str) -> Option<String> {
    let icon = file_icon_provider::get_file_icon(id, 128).ok()?;
    let mut png_bytes = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut png_bytes, icon.width, icon.height);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        let mut w = enc.write_header().ok()?;
        w.write_image_data(&icon.pixels).ok()?;
    }
    Some(data_url("image/png", &png_bytes))
}

#[cfg(all(unix, not(target_os = "macos")))]
pub fn icon(id: &str) -> Option<String> {
    let text = std::fs::read_to_string(id).ok()?;
    let e = parse_desktop(&text, "")?;
    let path = if e.icon.starts_with('/') {
        PathBuf::from(&e.icon)
    } else {
        let theme = freedesktop_icons::default_theme_gtk().unwrap_or_else(|| "hicolor".into());
        freedesktop_icons::lookup(&e.icon)
            .with_size(128)
            .with_theme(&theme)
            .with_cache()
            .find()
            .or_else(|| freedesktop_icons::lookup(&e.icon).with_size(64).find())
            .or_else(|| ["png", "svg", "xpm"].iter().map(|x| PathBuf::from(format!("/usr/share/pixmaps/{}.{x}", e.icon))).find(|p| p.exists()))?
    };
    let bytes = std::fs::read(&path).ok()?;
    match path.extension().and_then(|x| x.to_str()) {
        Some("svg") => Some(data_url("image/svg+xml", &bytes)),
        Some("png") => Some(data_url("image/png", &bytes)),
        _ => None,
    }
}

#[cfg(not(any(unix, target_os = "windows")))]
pub fn icon(_id: &str) -> Option<String> {
    None
}

// ---------- Opening

#[cfg(all(unix, not(target_os = "macos")))]
pub fn launch(id: &str) -> Result<(), String> {
    use std::process::{Command, Stdio};
    let quiet = |c: &mut Command| {
        c.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    };
    // gio knows every detail of the spec (startup notification, D-Bus activation).
    let mut gio = Command::new("gio");
    gio.args(["launch", id]);
    quiet(&mut gio);
    if gio.status().map(|s| s.success()).unwrap_or(false) {
        return Ok(());
    }
    let text = std::fs::read_to_string(id).map_err(|e| e.to_string())?;
    let e = parse_desktop(&text, "").ok_or("not an app")?;
    let mut cmd = clean_exec(&e.exec);
    if e.terminal {
        cmd = format!("x-terminal-emulator -e {cmd}");
    }
    // Run it in the background so it outlives Splay and leaves no zombie behind.
    let mut sh = Command::new("sh");
    sh.arg("-c").arg(format!("({cmd}) &"));
    quiet(&mut sh);
    sh.status().map(|_| ()).map_err(|e| e.to_string())
}

/// Cache so each icon is only looked up once per run.
#[derive(Default)]
pub struct IconCache(pub std::sync::Mutex<HashMap<String, Option<String>>>);

#[cfg(test)]
mod tests {
    use super::*;

    const FIREFOX: &str = "[Desktop Entry]\nVersion=1.0\nName=Firefox Web Browser\nName[de]=Firefox-Webbrowser\nGenericName=Web Browser\nKeywords=Internet;WWW;Browser;\nExec=firefox %u\nIcon=firefox\nTerminal=false\nType=Application\n\n[Desktop Action new-window]\nName=Open a New Window\nExec=firefox --new-window %u\n";

    #[test]
    fn reads_desktop_entries() {
        let e = parse_desktop(FIREFOX, "en_US").unwrap();
        assert_eq!(e.name, "Firefox Web Browser");
        assert_eq!(e.exec, "firefox %u");
        assert_eq!(e.icon, "firefox");
        assert_eq!(e.keywords, vec!["Internet", "WWW", "Browser", "Web Browser"]);
        assert!(e.visible && !e.terminal);
        assert_eq!(parse_desktop(FIREFOX, "de_DE").unwrap().name, "Firefox-Webbrowser");
    }

    #[test]
    fn skips_hidden_and_non_apps() {
        assert!(!parse_desktop("[Desktop Entry]\nType=Application\nName=X\nExec=x\nNoDisplay=true\n", "").unwrap().visible);
        assert!(parse_desktop("[Desktop Entry]\nType=Link\nName=X\nURL=http://x\n", "").is_none());
        assert!(parse_desktop("[Desktop Entry]\nType=Application\nName=X\n", "").is_none());
    }

    #[test]
    fn strips_field_codes() {
        assert_eq!(clean_exec("firefox %u"), "firefox");
        assert_eq!(clean_exec("env FOO=1 app --x %F --pct=50%%"), "env FOO=1 app --x --pct=50%");
    }

    #[test]
    fn leaves_out_uninstallers_and_dupes() {
        let a = |n: &str| App { id: n.into(), name: n.into(), keywords: vec![] };
        let out = finish(vec![a("Zoom"), a("Uninstall Zoom"), a("zoom"), a("Notepad"), a("Read Me")]);
        assert_eq!(out.iter().map(|a| a.name.as_str()).collect::<Vec<_>>(), vec!["Notepad", "Zoom"]);
    }
}
