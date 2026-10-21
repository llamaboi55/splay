import test from 'node:test';
import assert from 'node:assert/strict';
import { score, search } from '../src/js/search.js';

const apps = ['Visual Studio Code', 'Google Chrome', 'Calculator', 'Calendar', 'Slack', 'Spotify', 'System Settings', 'Firefox Web Browser'].map((name) => ({ id: name, name, keywords: name === 'Firefox Web Browser' ? ['Internet', 'WWW'] : [] }));
const names = (q, uses) => search(apps, q, uses).map((a) => a.name);

test('prefix, word start, initials, anywhere, keywords, letters in order', () => {
  assert.equal(names('cal')[0], 'Calculator');
  assert.equal(names('chrome')[0], 'Google Chrome');
  assert.equal(names('vsc')[0], 'Visual Studio Code');
  assert.ok(names('tify').includes('Spotify'));
  assert.ok(names('internet').includes('Firefox Web Browser'));
  assert.ok(names('chrm').includes('Google Chrome'));
  assert.deepEqual(names('zzz'), []);
  assert.equal(score('', 'Slack'), 0);
});

test('accents and case do not matter', () => {
  assert.ok(score('cafe', 'Café Menu') > 0);
  assert.ok(score('SLACK', 'Slack') > 0);
});

test('the app you open more often comes first when matches tie', () => {
  assert.deepEqual(names('s').slice(0, 3), ['Slack', 'Spotify', 'System Settings']);
  assert.equal(names('s', { Spotify: 9 })[0], 'Spotify');
});
