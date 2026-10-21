// Pretend apps for the browser preview, drawn as simple coloured icons.
const LIST = [
  ['Calculator', '🧮', '#5b6270'], ['Calendar', '📅', '#e5534b'], ['Camera', '📷', '#3d4452'], ['Chess', '♞', '#8a6a4a'],
  ['Clock', '⏰', '#2b2f3a'], ['Contacts', '👤', '#9a8c7a'], ['Discord', '🎧', '#5865f2'], ['Figma', '✏️', '#a259ff'],
  ['Files', '📁', '#3b82f6'], ['Firefox', '🦊', '#ff7139'], ['GIMP', '🖌️', '#6b5e4a'], ['Google Chrome', '🌐', '#34a853'],
  ['Mail', '✉️', '#2f7cf6'], ['Maps', '🗺️', '#46b06d'], ['Music', '🎵', '#fa2d48'], ['Notes', '🗒️', '#f5c542'],
  ['Notion', '📓', '#2f2f2f'], ['OBS Studio', '⏺️', '#302e3a'], ['Obsidian', '💎', '#7c3aed'], ['Photos', '🌸', '#f472b6'],
  ['Podcasts', '🎙️', '#9b4dff'], ['Preview', '🖼️', '#4f8cc9'], ['Reminders', '✅', '#f97316'], ['Slack', '💬', '#4a154b'],
  ['Spotify', '🎶', '#1db954'], ['Steam', '🎮', '#1b2838'], ['System Settings', '⚙️', '#6b7280'], ['Telegram', '✈️', '#2aabee'],
  ['Terminal', '⌨️', '#111827'], ['Text Editor', '📝', '#4b5563'], ['Thunderbird', '🐦', '#0a84ff'], ['VLC', '🔶', '#ff8800'],
  ['Visual Studio Code', '🧩', '#0078d4'], ['Weather', '⛅', '#38bdf8'], ['WhatsApp', '📞', '#25d366'], ['Zoom', '🎥', '#2d8cff'],
  ['Audacity', '🎚️', '#1f4fa0'], ['Blender', '🧊', '#e87d0d'], ['Books', '📚', '#f59e0b'], ['Krita', '🎨', '#3a7bd5'],
  ['LibreOffice Writer', '📄', '#2b6cb0'], ['LibreOffice Calc', '📊', '#2f855a'], ['Signal', '🔒', '#3a76f0'], ['Stocks', '📈', '#111827'],
  ['Voice Memos', '🎤', '#dc2626'], ['Activity Monitor', '📉', '#374151'], ['Kdenlive', '🎬', '#3d7ab8'], ['Inkscape', '✒️', '#222'],
];

export const apps = LIST.map(([name]) => ({ id: `/apps/${name}`, name, keywords: [] }));

export function icon(id) {
  const row = LIST.find(([n]) => `/apps/${n}` === id);
  if (!row) return null;
  const [, glyph, color] = row;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient></defs><rect x="4" y="4" width="92" height="92" rx="22" fill="${color}"/><rect x="4" y="4" width="92" height="92" rx="22" fill="url(#g)"/><text x="50" y="66" font-size="48" text-anchor="middle">${glyph}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
