// The arrangement: a list of tiles (apps, folders and groups) plus hidden apps.
// Pure functions that return a new layout, so they're easy to test.
//   { items: [{ t: 'app', id } | { t: 'folder', id, name, apps: [ids] } | { t: 'group', id, name, apps: [ids] }], hidden: [ids] }

export const empty = () => ({ items: [], hidden: [] });
const clone = (l) => ({ items: l.items.map((i) => (i.apps ? { ...i, apps: [...i.apps] } : { ...i })), hidden: [...l.hidden] });
const uid = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Every app id placed somewhere (top level or inside a folder). Groups only point at apps. */
export function placed(l) {
  const s = new Set();
  for (const i of l.items) {
    if (i.t === 'app') s.add(i.id);
    if (i.t === 'folder') i.apps.forEach((a) => s.add(a));
  }
  return s;
}

/** Brings a saved layout up to date with the apps installed now. */
export function merge(layout, apps) {
  const l = clone(layout || empty());
  const ids = new Set(apps.map((a) => a.id));
  l.items = l.items
    .map((i) => (i.apps ? { ...i, apps: i.apps.filter((a) => ids.has(a)) } : i))
    .filter((i) => (i.t === 'app' ? ids.has(i.id) : i.apps.length > 0));
  l.hidden = l.hidden.filter((h) => ids.has(h));
  const have = placed(l);
  const hidden = new Set(l.hidden);
  const fresh = apps.filter((a) => !have.has(a.id) && !hidden.has(a.id)).sort((a, b) => a.name.localeCompare(b.name));
  l.items.push(...fresh.map((a) => ({ t: 'app', id: a.id })));
  return l;
}

/** Moves the tile at `from` so it lands at `to`. */
export function move(layout, from, to) {
  const l = clone(layout);
  const [it] = l.items.splice(from, 1);
  l.items.splice(Math.max(0, Math.min(l.items.length, to)), 0, it);
  return l;
}

/** Drops app tile `from` onto tile `onto`: makes a folder, or adds to the folder or group there. */
export function drop(layout, from, onto, name = 'New folder') {
  const l = clone(layout);
  const src = l.items[from];
  const dst = l.items[onto];
  if (!src || !dst || from === onto || src.t !== 'app') return l;
  if (dst.t === 'folder') {
    dst.apps.push(src.id);
    l.items.splice(from, 1);
  } else if (dst.t === 'group') {
    if (!dst.apps.includes(src.id)) dst.apps.push(src.id); // the app also stays where it is
  } else {
    l.items[onto] = { t: 'folder', id: uid('f'), name, apps: [dst.id, src.id] };
    l.items.splice(from, 1);
  }
  return l;
}

const find = (l, id) => l.items.findIndex((i) => i.id === id && i.t !== 'app');

/** Takes an app out of a folder and puts it back on the page at `at` (default: after the folder). */
export function unfolder(layout, folderId, appId, at) {
  const l = clone(layout);
  const fi = find(l, folderId);
  if (fi < 0) return l;
  const f = l.items[fi];
  f.apps = f.apps.filter((a) => a !== appId);
  let pos = at ?? fi + 1;
  if (f.t === 'folder') {
    if (f.apps.length === 0) {
      l.items.splice(fi, 1);
      if (pos > fi) pos--;
    }
    l.items.splice(pos, 0, { t: 'app', id: appId });
  } else if (f.apps.length === 0) l.items.splice(fi, 1);
  return l;
}

/** Breaks a folder up into its apps, in place. A group just goes away. */
export function ungroup(layout, id) {
  const l = clone(layout);
  const i = find(l, id);
  if (i < 0) return l;
  const f = l.items[i];
  l.items.splice(i, 1, ...(f.t === 'folder' ? f.apps.map((a) => ({ t: 'app', id: a })) : []));
  return l;
}

export function rename(layout, id, name) {
  const l = clone(layout);
  const i = find(l, id);
  if (i >= 0 && name.trim()) l.items[i].name = name.trim().slice(0, 40);
  return l;
}

/** A new group (opens several apps at once) starting with one app, placed after `at`. */
export function newGroup(layout, appId, at, name = 'New group') {
  const l = clone(layout);
  const g = { t: 'group', id: uid('g'), name, apps: [appId] };
  l.items.splice(Math.min(l.items.length, at + 1), 0, g);
  return { layout: l, id: g.id };
}

export function addToGroup(layout, groupId, appId) {
  const l = clone(layout);
  const i = find(l, groupId);
  if (i >= 0 && !l.items[i].apps.includes(appId)) l.items[i].apps.push(appId);
  return l;
}

export function hide(layout, appId) {
  let l = clone(layout);
  l.items = l.items.filter((i) => !(i.t === 'app' && i.id === appId));
  for (const i of l.items) if (i.apps) i.apps = i.apps.filter((a) => a !== appId);
  l.items = l.items.filter((i) => !i.apps || i.apps.length);
  if (!l.hidden.includes(appId)) l.hidden.push(appId);
  return l;
}

export function unhide(layout, appId) {
  const l = clone(layout);
  l.hidden = l.hidden.filter((h) => h !== appId);
  l.items.push({ t: 'app', id: appId });
  return l;
}

/** Puts everything back to A to Z with no folders or groups. */
export const reset = (apps) => merge(empty(), apps);

/** Splits tiles into pages. */
export function pages(items, perPage) {
  const out = [];
  for (let i = 0; i < items.length; i += perPage) out.push(items.slice(i, i + perPage));
  return out.length ? out : [[]];
}

/** How many columns and rows of tiles fit. */
export function grid(width, height, tile) {
  const cols = Math.max(3, Math.min(9, Math.floor(width / tile)));
  const rows = Math.max(2, Math.min(6, Math.floor(height / (tile * 1.05))));
  return { cols, rows, perPage: cols * rows };
}
