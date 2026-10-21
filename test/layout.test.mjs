import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/js/layout.js';

const apps = ['Mail', 'Notes', 'Zoom', 'Calendar'].map((n) => ({ id: n, name: n }));
const ids = (l) => l.items.map((i) => (i.t === 'app' ? i.id : `${i.t}:${i.name}:${i.apps.join('+')}`));

test('a new layout lists every app A to Z', () => {
  assert.deepEqual(ids(L.reset(apps)), ['Calendar', 'Mail', 'Notes', 'Zoom']);
});

test('merging keeps your order, drops uninstalled apps and adds new ones at the end', () => {
  let l = L.move(L.reset(apps), 3, 0); // Zoom first
  l = L.merge(l, [...apps.filter((a) => a.id !== 'Notes'), { id: 'Arc', name: 'Arc' }]);
  assert.deepEqual(ids(l), ['Zoom', 'Calendar', 'Mail', 'Arc']);
});

test('dropping an app on another makes a folder; on a folder adds to it', () => {
  let l = L.reset(apps); // Calendar Mail Notes Zoom
  l = L.drop(l, 1, 0, 'Work'); // Mail onto Calendar
  assert.deepEqual(ids(l), ['folder:Work:Calendar+Mail', 'Notes', 'Zoom']);
  l = L.drop(l, 2, 0); // Zoom into the folder
  assert.deepEqual(ids(l), ['folder:Work:Calendar+Mail+Zoom', 'Notes']);
  const fid = l.items[0].id;
  l = L.unfolder(l, fid, 'Mail');
  assert.deepEqual(ids(l), ['folder:Work:Calendar+Zoom', 'Mail', 'Notes']);
  l = L.rename(l, fid, '  Office  ');
  assert.equal(l.items[0].name, 'Office');
  l = L.ungroup(l, fid);
  assert.deepEqual(ids(l), ['Calendar', 'Zoom', 'Mail', 'Notes']);
});

test('the last app out of a folder removes the folder', () => {
  let l = L.drop(L.reset(apps), 1, 0);
  const fid = l.items[0].id;
  l = L.unfolder(l, fid, 'Calendar');
  l = L.unfolder(l, fid, 'Mail');
  assert.deepEqual(ids(l), ['Mail', 'Calendar', 'Notes', 'Zoom']);
});

test('groups point at apps without moving them', () => {
  let { layout: l, id } = L.newGroup(L.reset(apps), 'Mail', 1, 'Morning');
  l = L.addToGroup(l, id, 'Calendar');
  l = L.drop(l, 4, 2); // Zoom dropped on the group
  assert.deepEqual(ids(l), ['Calendar', 'Mail', 'group:Morning:Mail+Calendar+Zoom', 'Notes', 'Zoom']);
  l = L.merge(l, apps.filter((a) => a.id !== 'Calendar'));
  assert.deepEqual(ids(l), ['Mail', 'group:Morning:Mail+Zoom', 'Notes', 'Zoom']);
});

test('hiding and unhiding', () => {
  let l = L.hide(L.drop(L.reset(apps), 1, 0), 'Mail');
  assert.deepEqual(ids(l), ['folder:New folder:Calendar', 'Notes', 'Zoom']);
  assert.deepEqual(ids(L.merge(l, apps)), ids(l), 'hidden apps stay hidden after a rescan');
  l = L.unhide(l, 'Mail');
  assert.deepEqual(ids(l).at(-1), 'Mail');
  assert.deepEqual(l.hidden, []);
});

test('pages and grid size', () => {
  assert.deepEqual(L.pages([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(L.pages([], 4), [[]]);
  assert.deepEqual(L.grid(1920, 800, 150), { cols: 9, rows: 5, perPage: 45 });
  assert.deepEqual(L.grid(400, 200, 150), { cols: 3, rows: 2, perPage: 6 });
});
