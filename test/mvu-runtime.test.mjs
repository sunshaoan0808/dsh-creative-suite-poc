import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStatData,
  validateSchema,
  applySettlement,
  rollMvuCheck,
  renderStatusPanel,
} from '../lib/mvu-runtime.js';

// --- parseStatData ---
test('parseStatData: unwraps stat_data envelope', () => {
  assert.deepEqual(parseStatData({ stat_data: { hp: 10, name: 'a' } }), { hp: 10, name: 'a' });
});
test('parseStatData: plain object passthrough', () => {
  assert.deepEqual(parseStatData({ hp: 5 }), { hp: 5 });
});
test('parseStatData: non-object inputs return {}', () => {
  for (const bad of [null, undefined, 0, 42, 'x', true, [1, 2]]) {
    assert.deepEqual(parseStatData(bad), {}, `input: ${JSON.stringify(bad)}`);
  }
});
test('parseStatData: empty object returns {}', () => {
  assert.deepEqual(parseStatData({}), {});
});

// --- validateSchema ---
test('validateSchema: ok on matching types', () => {
  const r = validateSchema({ hp: 10, name: 'a', alive: true }, { hp: 'number', name: 'string', alive: 'boolean' });
  assert.deepEqual(r, { ok: true, errors: [] });
});
test('validateSchema: reports type mismatch + missing', () => {
  const r = validateSchema({ hp: 'x' }, { hp: 'number', mp: 'number' });
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 2);
});
test('validateSchema: illegal schema type reported', () => {
  const r = validateSchema({ hp: 1 }, { hp: 'integer' });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /invalid schema type/);
});
test('validateSchema: non-object stat/schema fail', () => {
  assert.equal(validateSchema(null, { a: 'number' }).ok, false);
  assert.equal(validateSchema({}, null).ok, false);
  assert.equal(validateSchema([], { a: 'number' }).ok, false);
});

// --- applySettlement ---
test('applySettlement: numeric delta adds, new keys set, no mutation', () => {
  const base = { hp: 10, name: 'a' };
  const next = applySettlement(base, { hp: -3, mp: 5 });
  assert.deepEqual(next, { hp: 7, name: 'a', mp: 5 });
  assert.deepEqual(base, { hp: 10, name: 'a' }); // input untouched
  assert.notEqual(next, base);
});
test('applySettlement: null/empty delta returns shallow copy', () => {
  const base = { hp: 1 };
  assert.deepEqual(applySettlement(base, null), { hp: 1 });
  assert.deepEqual(applySettlement(null, null), {});
  assert.deepEqual(applySettlement('bad', { hp: 1 }), { hp: 1 });
});

// --- rollMvuCheck ---
test('rollMvuCheck: deterministic rng, modifier applied', () => {
  const r = rollMvuCheck({ str: 10 }, 'str', 12, () => 0.5); // roll=11, mod=5 -> 16
  assert.deepEqual(r, { roll: 11, total: 16, success: true });
});
test('rollMvuCheck: failure case + roll range 1..20', () => {
  const r = rollMvuCheck({ str: 0 }, 'str', 20, () => 0.0); // roll=1, mod=0
  assert.deepEqual(r, { roll: 1, total: 1, success: false });
  const hi = rollMvuCheck({}, 'x', 1, () => 0.9999);
  assert.equal(hi.roll, 20);
});
test('rollMvuCheck: negative dc always succeeds; missing field = +0 mod', () => {
  const r = rollMvuCheck({}, 'nope', -5, () => 0.0);
  assert.equal(r.success, true);
  assert.equal(r.total, r.roll);
});

// --- renderStatusPanel ---
test('renderStatusPanel: renders title + all fields', () => {
  const s = renderStatusPanel({ hp: 7, name: 'a' }, { title: 'Hero' });
  assert.ok(s.includes('== Hero =='));
  assert.ok(s.includes('hp: 7'));
  assert.ok(s.includes('name: a'));
});
test('renderStatusPanel: field filter + empty/null stat', () => {
  assert.ok(renderStatusPanel({ hp: 1, mp: 2 }, { fields: ['mp'] }).includes('mp: 2'));
  assert.ok(!renderStatusPanel({ hp: 1, mp: 2 }, { fields: ['mp'] }).includes('hp:'));
  assert.ok(renderStatusPanel({}, {}).includes('(empty)'));
  assert.ok(renderStatusPanel(null).includes('STATUS'));
});
