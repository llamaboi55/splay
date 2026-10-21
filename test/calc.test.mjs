import test from 'node:test';
import assert from 'node:assert/strict';
import { calc, evaluate, format } from '../src/js/calc.js';

test('does sums the way people type them', () => {
  assert.equal(calc('2+2'), 4);
  assert.equal(calc('12 * 7'), 84);
  assert.equal(calc('12x7'), 84);
  assert.equal(calc('12 × 7 ÷ 2'), 42);
  assert.equal(calc('2^10'), 1024);
  assert.equal(calc('-2^2'), -4);
  assert.equal(calc('(1+2)*3'), 9);
  assert.equal(calc('2(3+4)'), 14);
  assert.equal(calc('1,250 + 750'), 2000);
  assert.equal(calc('sqrt(81)'), 9);
  assert.equal(calc('20% of 150'), 30);
  assert.equal(calc('50%'), 0.5);
  assert.equal(calc('200 + 15%'), 230);
  assert.equal(calc('80 - 25%'), 60);
  assert.equal(calc('2 * 50% + 1'), 2);
  assert.ok(Math.abs(calc('2pi') - 2 * Math.PI) < 1e-12);
  assert.ok(Math.abs(calc('sin(30)') - 0.5) < 1e-12);
});

test('leaves plain words and numbers to the app search', () => {
  for (const q of ['', 'chrome', '2', '42', 'word 2', 'Photoshop 2024', 'C++', '1+', '(2']) assert.equal(calc(q), null, q);
  assert.throws(() => evaluate('alert(1)'));
});

test('formats answers without float noise', () => {
  assert.equal(format(0.1 + 0.2), '0.3');
  assert.equal(format(84), '84');
  assert.equal(format(1234567), '1,234,567');
  assert.equal(format(1 / 3), '0.3333333333');
});
