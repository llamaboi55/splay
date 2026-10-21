// Splay: every app on one screen, in pages you arrange. Type to search or do a sum,
// drag onto another app to make a folder, right-click for groups and more.
import { call, listen, native, autostart } from './api.js';
import * as L from './layout.js';
import { search } from './search.js';
import { calc, format } from './calc.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- Storage
const read = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? d;
  } catch {
    return d;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};
const DEFAULTS = { size: 'm', dim: 0.72, labels: true, shortcut: 'Ctrl+Alt+Space', engine: 'duckduckgo' };
let prefs = { ...DEFAULTS, ...read('splay:prefs', {}) };
let layout = read('splay:layout', L.empty());
let uses = read('splay:uses', {});
const saveLayout = () => write('splay:layout', layout);
const savePrefs = () => write('splay:prefs', prefs);

// ---------- Apps and icons
let apps = [];
let byId = {};
let scannedAt = 0;
const icons = {};
let sample = null;

async function scan() {
  if (native) apps = await call('list_apps');
  else {
    sample ||= await import('./sample.js');
    apps = sample.apps;
  }
  byId = Object.fromEntries(apps.map((a) => [a.id, a]));
  layout = L.merge(layout, apps);
  saveLayout();
  scannedAt = Date.now();
}

const COLORS = ['#e5534b', '#f59e0b', '#22a06b', '#2f7cf6', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'];
function letterIcon(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `<span class="letter" style="background:${COLORS[h % COLORS.length]}">${esc(name.trim()[0]?.toUpperCase() || '?')}</span>`;
}
function iconHTML(id) {
  const src = icons[id];
  if (src) return `<img src="${src}" alt="">`;
  return letterIcon(byId[id]?.name || '?');
}
/** Fetches icons for the ids on screen, then swaps them in. */
let iconQueue = Promise.resolve();
function loadIcons(ids) {
  const want = ids.filter((id) => !(id in icons));
  if (!want.length) return;
  for (const id of want) icons[id] = null;
  iconQueue = iconQueue.then(async () => {
    await Promise.all(
      want.map(async (id) => {
        const src = native ? await call('icon', { id }).catch(() => null) : sample?.icon(id);
        icons[id] = src || null;
        if (!src) return;
        for (const el of document.querySelectorAll(`[data-icon="${CSS.escape(id)}"]`)) {
          el.classList.remove('letter');
          el.innerHTML = `<img src="${src}" alt="">`;
        }
      }),
    );
  });
}

// ---------- Tiles
function tileHTML(item, index, where = 'page') {
  if (item.t === 'app') {
    const a = byId[item.id];
    if (!a) return '';
    const ic = icons[item.id];
    return `<div class="tile app" data-i="${index}" data-id="${esc(item.id)}" data-where="${where}" title="${esc(a.name)}">
      <div class="ic ${ic ? '' : 'letter'}" data-icon="${esc(item.id)}">${ic ? `<img src="${ic}" alt="">` : letterIcon(a.name)}</div>
      <div class="name">${esc(a.name)}</div>${where === 'panel' ? '<button class="x" title="Take out">✕</button>' : ''}</div>`;
  }
  const minis = item.apps
    .slice(0, 9)
    .map((id) => `<span data-icon="${esc(id)}">${iconHTML(id)}</span>`)
    .join('');
  return `<div class="tile ${item.t}" data-i="${index}" data-id="${esc(item.id)}" data-where="${where}" title="${esc(item.name)}">
    <div class="ic">${minis}</div>${item.t === 'group' ? `<span class="badge">${item.apps.length}</span>` : ''}
    <div class="name">${esc(item.name)}</div></div>`;
}
const idsOf = (items) => items.flatMap((i) => (i.t === 'app' ? [i.id] : i.apps.slice(0, 9)));

// ---------- Pages
let page = 0;
let dims = L.grid(innerWidth, innerHeight - 160, 132);
function measure() {
  const tile = parseFloat(getComputedStyle(document.body).getPropertyValue('--tile')) || 132;
  const vp = $('viewport');
  dims = L.grid(vp.clientWidth - 40, vp.clientHeight, tile);
  document.body.style.setProperty('--cols', dims.cols);
}
function renderPages() {
  measure();
  const pages = L.pages(layout.items, dims.perPage);
  page = Math.min(page, pages.length - 1);
  $('pages').innerHTML = pages
    .map((items, p) => `<div class="page"><div class="grid">${items.map((it, k) => tileHTML(it, p * dims.perPage + k)).join('')}</div></div>`)
    .join('');
  $('dots').innerHTML = pages.length > 1 ? pages.map((_, p) => `<button data-p="${p}" class="${p === page ? 'on' : ''}" aria-label="Page ${p + 1}"></button>`).join('') : '';
  goPage(page, false);
  loadIcons(idsOf(layout.items));
}
function goPage(p, animate = true) {
  const n = $('pages').children.length;
  page = Math.max(0, Math.min(n - 1, p));
  $('pages').style.transition = animate ? '' : 'none';
  $('pages').style.transform = `translateX(${-page * 100}%)`;
  [...$('dots').children].forEach((d, i) => d.classList.toggle('on', i === page));
  sel = -1;
  paintSel();
}
$('dots').addEventListener('click', (e) => e.target.dataset.p && goPage(Number(e.target.dataset.p)));
let wheelLock = 0;
$('viewport').addEventListener(
  'wheel',
  (e) => {
    if (query || Date.now() < wheelLock) return;
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(d) < 8) return;
    wheelLock = Date.now() + 450;
    goPage(page + Math.sign(d));
  },
  { passive: true },
);

// The pages slide with a transform; never let the browser scroll them instead.
$('viewport').addEventListener('scroll', (e) => (e.target.scrollLeft = 0));

// ---------- Search, calculator, web
let query = '';
let results = [];
let sel = -1; // selected tile on the page or in the results; -2 = calculator, -3 = web search
const ENGINES = {
  duckduckgo: ['DuckDuckGo', 'https://duckduckgo.com/?q='],
  google: ['Google', 'https://www.google.com/search?q='],
  bing: ['Bing', 'https://www.bing.com/search?q='],
  brave: ['Brave Search', 'https://search.brave.com/search?q='],
  startpage: ['Startpage', 'https://www.startpage.com/do/search?q='],
};
function renderSearch() {
  query = $('q').value;
  const q = query.trim();
  const answer = calc(q);
  $('calc').hidden = answer === null;
  if (answer !== null) $('calc').innerHTML = `<big>= ${format(answer)}</big><small>Enter copies it</small>`;
  $('pages').hidden = Boolean(q);
  $('dots').style.visibility = q ? 'hidden' : '';
  $('results').hidden = !q;
  if (!q) {
    sel = -1;
    paintSel();
    return;
  }
  const visible = apps.filter((a) => !layout.hidden.includes(a.id));
  results = search(visible, q, uses).slice(0, dims.cols * Math.max(1, dims.rows - 1));
  const engine = ENGINES[prefs.engine] || ENGINES.duckduckgo;
  $('results').innerHTML = `<div>${results.length ? `<div class="grid" style="--cols:${Math.min(results.length, dims.cols)}">${results.map((a, i) => tileHTML({ t: 'app', id: a.id }, i, 'result')).join('')}</div>` : answer === null ? `<p class="none">No apps called “${esc(q)}”.</p>` : ''}
    ${answer === null ? `<div class="web"><button id="web">Search ${engine[0]} for “${esc(q)}”</button></div>` : ''}</div>`;
  loadIcons(results.map((a) => a.id));
  sel = answer !== null ? -2 : results.length ? 0 : -3;
  paintSel();
}
$('q').addEventListener('input', renderSearch);
$('results').addEventListener('click', (e) => e.target.id === 'web' && webSearch());
function webSearch() {
  const engine = ENGINES[prefs.engine] || ENGINES.duckduckgo;
  const url = engine[1] + encodeURIComponent(query.trim());
  if (native) call('open_url', { url });
  else window.open(url, '_blank');
  close();
}
async function copyAnswer() {
  const v = calc(query.trim());
  if (v === null) return;
  const text = Number.parseFloat(v.toPrecision(12)).toString();
  try {
    await navigator.clipboard.writeText(text);
    toast(`Copied ${text}`);
  } catch {
    toast(`= ${text}`);
  }
}

// ---------- Selection with the keyboard
function visibleTiles() {
  if (query.trim()) return [...$('results').querySelectorAll('.tile')];
  return [...($('pages').children[page]?.querySelectorAll('.tile') || [])];
}
function paintSel() {
  document.querySelectorAll('.tile.sel').forEach((t) => t.classList.remove('sel'));
  $('calc').classList.toggle('sel', sel === -2);
  $('results').querySelector('.web')?.classList.toggle('sel', sel === -3);
  if (sel >= 0) visibleTiles()[sel]?.classList.add('sel');
}
function moveSel(dx, dy) {
  const tiles = visibleTiles();
  if (!tiles.length) return;
  if (sel < 0) sel = 0;
  else {
    const next = sel + dx + dy * dims.cols;
    if (!query && dx && (next < 0 || next >= tiles.length || Math.floor(next / dims.cols) !== Math.floor(sel / dims.cols))) {
      // Off the edge of the page: go to the next one.
      const dir = dx > 0 ? 1 : -1;
      if ((dir > 0 && page < $('pages').children.length - 1) || (dir < 0 && page > 0)) {
        goPage(page + dir);
        sel = dir > 0 ? 0 : visibleTiles().length - 1;
        return paintSel();
      }
    }
    sel = Math.max(0, Math.min(tiles.length - 1, next));
  }
  paintSel();
}

addEventListener('keydown', (e) => {
  if (!$('settings').hidden && e.key === 'Escape') return closeSettings();
  if (!$('menu').hidden && e.key === 'Escape') return hideMenu();
  if (!$('panel').hidden && e.key === 'Escape' && document.activeElement !== $('panel-title')) return closePanel();
  if (e.target === $('panel-title') || !$('settings').hidden) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    if ($('q').value) {
      $('q').value = '';
      renderSearch();
    } else close();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === ',') return openSettings();
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (arrows[e.key] && !(query && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && sel < 0)) {
    e.preventDefault();
    if (sel === -2 || sel === -3) sel = e.key === 'ArrowDown' && results.length ? 0 : sel;
    else moveSel(...arrows[e.key]);
    return paintSel();
  }
  if (e.key === 'PageDown' || e.key === 'PageUp') return goPage(page + (e.key === 'PageDown' ? 1 : -1));
  if (e.key === 'Enter') {
    e.preventDefault();
    if (sel === -2) return copyAnswer();
    if (sel === -3) return webSearch();
    const t = visibleTiles()[Math.max(0, sel)];
    if (t) activate(t);
    else if (query.trim()) webSearch();
    return;
  }
  if (document.activeElement !== $('q') && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) $('q').focus();
});

// ---------- Opening things
function itemOf(tile) {
  const where = tile.dataset.where;
  if (where === 'result' || where === 'panel') return { t: 'app', id: tile.dataset.id };
  return layout.items[Number(tile.dataset.i)];
}
async function launch(id) {
  uses[id] = (uses[id] || 0) + 1;
  write('splay:uses', uses);
  if (native) {
    try {
      await call('launch', { id });
    } catch (err) {
      toast(`Couldn't open ${byId[id]?.name || 'that'}: ${err}`);
      return false;
    }
  } else toast(`Opening ${byId[id]?.name}`);
  return true;
}
async function activate(tile) {
  const it = itemOf(tile);
  if (!it) return;
  if (it.t === 'folder') return openPanel(it.id);
  if (it.t === 'group') {
    for (const id of it.apps) {
      await launch(id);
      await new Promise((r) => setTimeout(r, 150));
    }
    return close();
  }
  if (await launch(it.id)) close();
}

// ---------- Folder and group panel
let panelId = null;
function openPanel(id) {
  const it = layout.items.find((i) => i.id === id);
  if (!it) return closePanel();
  panelId = id;
  $('panel-title').value = it.name;
  $('panel-hint').textContent = it.t === 'group' ? 'Opens all of these at once. Right-click any app and choose “Add to group” to add more.' : 'Drag an app out to take it out of the folder.';
  $('panel-grid').style.setProperty('--cols', Math.min(it.apps.length, Math.max(3, Math.min(6, Math.ceil(Math.sqrt(it.apps.length))))));
  $('panel-grid').innerHTML = it.apps.map((a, k) => tileHTML({ t: 'app', id: a }, k, 'panel')).join('');
  $('panel-actions').innerHTML =
    it.t === 'group' ? '<button class="primary" data-do="run">Open all</button><button data-do="ungroup">Delete group</button>' : '<button data-do="ungroup">Ungroup folder</button>';
  $('panel').hidden = false;
  loadIcons(it.apps);
}
function closePanel() {
  $('panel').hidden = true;
  panelId = null;
}
$('panel').addEventListener('click', (e) => {
  if (e.target === $('panel')) return closePanel();
  const x = e.target.closest('.x');
  if (x) {
    const id = x.closest('.tile').dataset.id;
    layout = L.unfolder(layout, panelId, id);
    saveLayout();
    renderPages();
    return openPanel(panelId);
  }
  const b = e.target.closest('[data-do]');
  if (b?.dataset.do === 'run') {
    const it = layout.items.find((i) => i.id === panelId);
    closePanel();
    (async () => {
      for (const id of it.apps) {
        await launch(id);
        await new Promise((r) => setTimeout(r, 150));
      }
      close();
    })();
  }
  if (b?.dataset.do === 'ungroup') {
    layout = L.ungroup(layout, panelId);
    saveLayout();
    closePanel();
    renderPages();
  }
});
$('panel-title').addEventListener('change', (e) => {
  layout = L.rename(layout, panelId, e.target.value);
  saveLayout();
  renderPages();
});
$('panel-title').addEventListener('keydown', (e) => e.key === 'Enter' && e.target.blur());

// ---------- Right-click menu
function showMenu(x, y, entries) {
  const m = $('menu');
  m.innerHTML = entries.map((e) => (e === '-' ? '<hr>' : e.label ? `<small>${esc(e.label)}</small>` : `<button data-k="${e.k}">${esc(e.text)}</button>`)).join('');
  m.hidden = false;
  m.style.left = `${Math.min(x, innerWidth - m.offsetWidth - 8)}px`;
  m.style.top = `${Math.min(y, innerHeight - m.offsetHeight - 8)}px`;
  m.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    hideMenu();
    entries.find((en) => en.k === b.dataset.k)?.run();
  };
}
const hideMenu = () => ($('menu').hidden = true);
addEventListener('pointerdown', (e) => !$('menu').contains(e.target) && hideMenu(), true);

addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const tile = e.target.closest('.tile');
  if (!tile) return;
  const it = itemOf(tile);
  const entries = [];
  if (it.t === 'app') {
    const id = it.id;
    entries.push({ k: 'open', text: 'Open', run: () => activate(tile) });
    if (tile.dataset.where === 'panel') entries.push({ k: 'out', text: 'Take out of folder', run: () => ((layout = L.unfolder(layout, panelId, id)), saveLayout(), renderPages(), openPanel(panelId)) });
    entries.push('-');
    entries.push({
      k: 'newgroup',
      text: 'New group with this app…',
      run: () => {
        const at = layout.items.findIndex((i) => i.t === 'app' && i.id === id);
        const r = L.newGroup(layout, id, at < 0 ? layout.items.length - 1 : at);
        layout = r.layout;
        saveLayout();
        renderPages();
        openPanel(r.id);
        $('panel-title').select();
      },
    });
    const groups = layout.items.filter((i) => i.t === 'group' && !i.apps.includes(id));
    if (groups.length) {
      entries.push({ label: 'Add to group' });
      for (const g of groups) entries.push({ k: `g:${g.id}`, text: g.name, run: () => ((layout = L.addToGroup(layout, g.id, id)), saveLayout(), renderPages(), toast(`Added to ${g.name}`)) });
    }
    entries.push('-');
    entries.push({ k: 'hide', text: 'Hide from Splay', run: () => ((layout = L.hide(layout, id)), saveLayout(), renderPages(), panelId && openPanel(panelId), query && renderSearch(), toast(`Hidden. Bring it back in Settings.`)) });
  } else {
    entries.push({ k: 'open', text: it.t === 'group' ? 'Open all' : 'Open folder', run: () => activate(tile) });
    entries.push({ k: 'edit', text: it.t === 'group' ? 'Edit group' : 'Rename', run: () => (openPanel(it.id), $('panel-title').select()) });
    entries.push({ k: 'ungroup', text: it.t === 'group' ? 'Delete group' : 'Ungroup', run: () => ((layout = L.ungroup(layout, it.id)), saveLayout(), renderPages()) });
  }
  showMenu(e.clientX, e.clientY, entries);
});

// ---------- Clicking and dragging tiles
let drag = null;
let edgeTimer = 0;
let mergeTimer = 0;
document.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const tile = e.target.closest('.tile');
  if (!tile || e.target.closest('.x')) return;
  drag = { tile, sx: e.clientX, sy: e.clientY, on: false, target: null, mode: null };
});
document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.on) {
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 8 || drag.tile.dataset.where === 'result') return;
    drag.on = true;
    drag.ghost = drag.tile.cloneNode(true);
    drag.ghost.className = 'tile ghost-tile';
    document.body.appendChild(drag.ghost);
    drag.tile.classList.add('dragging');
  }
  drag.ghost.style.left = `${e.clientX}px`;
  drag.ghost.style.top = `${e.clientY}px`;
  // Dragging out of an open folder closes it, so the app can land on the page.
  if (drag.tile.dataset.where === 'panel' && !$('panel').hidden && !e.target.closest('.panel-card')) {
    drag.fromFolder = panelId;
    $('panel').hidden = true;
  }
  // Near the screen edge: turn the page.
  const edge = e.clientX < 40 ? -1 : e.clientX > innerWidth - 40 ? 1 : 0;
  if (edge && !edgeTimer) edgeTimer = setTimeout(() => ((edgeTimer = 0), goPage(page + edge)), 600);
  if (!edge) clearTimeout(edgeTimer), (edgeTimer = 0);

  const under = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el.classList?.contains('tile') && !el.classList.contains('ghost-tile') && el.dataset.where === 'page');
  document.querySelectorAll('.tile.merge, .tile.before, .tile.after').forEach((t) => t.classList.remove('merge', 'before', 'after'));
  if (!under || under === drag.tile) {
    drag.target = null;
    clearTimeout(mergeTimer);
    return;
  }
  const r = under.getBoundingClientRect();
  const fx = (e.clientX - r.left) / r.width;
  const centre = fx > 0.25 && fx < 0.75;
  const draggedIsApp = drag.tile.classList.contains('app');
  if (drag.target !== under) {
    clearTimeout(mergeTimer);
    drag.mode = null;
    drag.target = under;
    if (draggedIsApp) mergeTimer = setTimeout(() => drag && drag.target === under && (drag.mode = 'merge'), 350);
  }
  if (drag.mode === 'merge' && centre) under.classList.add('merge');
  else {
    drag.mode = drag.mode === 'merge' && !centre ? null : drag.mode;
    drag.side = fx < 0.5 ? 'before' : 'after';
    under.classList.add(drag.side);
  }
});
document.addEventListener('pointerup', (e) => {
  const d = drag;
  drag = null;
  clearTimeout(edgeTimer);
  clearTimeout(mergeTimer);
  edgeTimer = 0;
  if (!d) return;
  if (!d.on) {
    if (e.button === 0 && d.tile.contains(e.target)) activate(d.tile);
    return;
  }
  d.ghost.remove();
  d.tile.classList.remove('dragging');
  document.querySelectorAll('.tile.merge, .tile.before, .tile.after').forEach((t) => t.classList.remove('merge', 'before', 'after'));
  const fromPanel = d.tile.dataset.where === 'panel';
  if (fromPanel) {
    const id = d.tile.dataset.id;
    if (!d.fromFolder) return; // dropped inside the folder: nothing to do
    let at;
    if (d.target) at = Number(d.target.dataset.i) + (d.side === 'after' ? 1 : 0);
    layout = L.unfolder(layout, d.fromFolder, id, at);
    if (d.target && d.mode === 'merge') {
      const from = layout.items.findIndex((i) => i.t === 'app' && i.id === id);
      const onto = layout.items.findIndex((i) => i.id === d.target.dataset.id && (i.t !== 'app' || i.id !== id));
      if (from >= 0 && onto >= 0) layout = L.drop(layout, from, onto);
    }
    panelId = null;
  } else if (d.target) {
    const from = Number(d.tile.dataset.i);
    const onto = Number(d.target.dataset.i);
    if (d.mode === 'merge') layout = L.drop(layout, from, onto);
    else {
      let to = onto + (d.side === 'after' ? 1 : 0);
      if (from < to) to--;
      layout = L.move(layout, from, to);
    }
  } else return;
  saveLayout();
  renderPages();
});

// Clicking empty space closes Splay, like pressing Escape.
$('main').addEventListener('click', (e) => {
  if (e.target === $('main') || e.target === $('viewport') || e.target.classList.contains('page') || e.target.classList.contains('grid') || e.target === $('results')) close();
});

// ---------- Settings
function openSettings() {
  $('settings').hidden = false;
  $('s-shortcut').value = prefs.shortcut;
  for (const b of $('s-size').children) b.classList.toggle('on', b.dataset.v === prefs.size);
  $('s-dim').value = prefs.dim;
  $('s-labels').checked = prefs.labels;
  $('s-engine').value = prefs.engine;
  $('s-auto-wrap').hidden = !native;
  autostart.isEnabled().then((on) => ($('s-auto').checked = on)).catch(() => {});
  renderHidden();
}
function closeSettings() {
  $('settings').hidden = true;
  $('q').focus();
}
function renderHidden() {
  const list = layout.hidden.map((id) => byId[id]).filter(Boolean);
  $('s-hidden').innerHTML = list.length ? list.map((a) => `<div><span>${esc(a.name)}</span><button data-id="${esc(a.id)}">Show again</button></div>`).join('') : '<p class="hint">None.</p>';
}
$('gear').addEventListener('click', (e) => (e.stopPropagation(), openSettings()));
$('s-close').addEventListener('click', closeSettings);
$('s-hidden').addEventListener('click', (e) => {
  const id = e.target.dataset.id;
  if (!id) return;
  layout = L.unhide(layout, id);
  saveLayout();
  renderHidden();
  renderPages();
});
function applyPrefs() {
  document.body.classList.remove('size-s', 'size-m', 'size-l');
  document.body.classList.add(`size-${prefs.size}`);
  document.body.classList.toggle('nolabels', !prefs.labels);
  document.documentElement.style.setProperty('--dim', prefs.dim);
  $('q').placeholder = `Search apps, or type a sum`;
}
$('s-size').addEventListener('click', (e) => {
  const v = e.target.dataset.v;
  if (!v) return;
  prefs.size = v;
  savePrefs();
  applyPrefs();
  openSettings();
  renderPages();
});
$('s-dim').addEventListener('input', (e) => ((prefs.dim = Number(e.target.value)), savePrefs(), applyPrefs()));
$('s-labels').addEventListener('change', (e) => ((prefs.labels = e.target.checked), savePrefs(), applyPrefs()));
$('s-engine').addEventListener('change', (e) => ((prefs.engine = e.target.value), savePrefs()));
$('s-auto').addEventListener('change', (e) => autostart.set(e.target.checked));
$('s-shortcut').addEventListener('change', async (e) => {
  prefs.shortcut = e.target.value;
  savePrefs();
  await registerShortcut();
});
async function registerShortcut() {
  if (!native) return ($('s-shortcut-note').textContent = '');
  try {
    const used = await call('set_shortcut', { accel: prefs.shortcut });
    $('s-shortcut-note').textContent = `Press ${used.replace(/\+/g, ' ')} anywhere to open Splay.`;
  } catch (err) {
    $('s-shortcut-note').textContent = String(err);
  }
}
$('s-rescan').addEventListener('click', async () => {
  await scan();
  renderPages();
  toast(`Found ${apps.length} apps`);
});
$('s-reset').addEventListener('click', () => {
  if ($('s-reset').dataset.armed) {
    layout = L.reset(apps);
    saveLayout();
    renderPages();
    delete $('s-reset').dataset.armed;
    $('s-reset').textContent = 'Sort everything A to Z';
    toast('Sorted A to Z. Folders and groups removed.');
  } else {
    $('s-reset').dataset.armed = '1';
    $('s-reset').textContent = 'Click again: removes folders and groups';
    setTimeout(() => {
      delete $('s-reset').dataset.armed;
      $('s-reset').textContent = 'Sort everything A to Z';
    }, 3500);
  }
});
$('s-quit').addEventListener('click', () => call('quit'));

// ---------- Showing and hiding
let toastTimer = 0;
function toast(text) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').hidden = true), 2600);
}
function close() {
  closePanel();
  hideMenu();
  $('settings').hidden = true;
  if (native) call('hide');
}
async function shown() {
  $('q').value = '';
  renderSearch();
  closePanel();
  if (Date.now() - scannedAt > 60000) {
    await scan();
    renderPages();
  }
  document.body.classList.remove('opening');
  void document.body.offsetWidth;
  document.body.classList.add('opening');
  $('q').focus();
}
listen('splay://shown', shown);
addEventListener('blur', () => {
  // Clicking another app hides Splay, but not while a menu or drag is in progress.
  if (native && !drag) setTimeout(() => !document.hasFocus() && call('hide'), 120);
});
let resizeTimer = 0;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderPages, 80);
});

// ---------- Start
if (!native) document.body.classList.add('preview');
applyPrefs();
await scan();
renderPages();
registerShortcut();
$('q').focus();
window.splay = { get layout() { return layout; }, set layout(l) { layout = l; saveLayout(); renderPages(); }, openPanel, openSettings, goPage, L };
