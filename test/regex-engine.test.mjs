import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyRegexRules, expandWorldbookMacros, substituteParams } from '../lib/regex-engine.js';

describe('applyRegexRules', () => {
  it('basic replacement + capture groups + sequential order', () => {
    const r = applyRegexRules('hello foo world', [
      { findRegex: '/foo/', replaceString: 'bar' },
      { findRegex: '/(bar) (world)/', replaceString: '$2 $1' },
    ]);
    assert.equal(r.text, 'hello world bar');
    assert.equal(r.applied.length, 2);
    assert.equal(r.errors.length, 0);
  });

  it('empty rules returns original text', () => {
    for (const rules of [[], undefined, null]) {
      const r = applyRegexRules('abc', rules);
      assert.equal(r.text, 'abc');
      assert.deepEqual(r.applied, []);
      assert.deepEqual(r.errors, []);
    }
  });

  it('invalid regex is recorded, not thrown; other rules still apply', () => {
    const r = applyRegexRules('aaa', [
      { findRegex: '/([/', replaceString: 'X' },
      { findRegex: '/a/g', replaceString: 'b' },
    ], { phase: 'display' });
    assert.equal(r.errors.length, 1);
    assert.equal(r.errors[0].index, 0);
    assert.equal(r.text, 'bbb');
  });

  it('display phase skips promptOnly rules', () => {
    const r = applyRegexRules('a-b', [{ findRegex: '/-/', replaceString: '+', promptOnly: true }], { phase: 'display' });
    assert.equal(r.text, 'a-b');
  });

  it('prompt phase skips markdownOnly rules', () => {
    const r = applyRegexRules('a-b', [{ findRegex: '/-/', replaceString: '+', markdownOnly: true }], { phase: 'prompt' });
    assert.equal(r.text, 'a-b');
  });

  it('promptOnly applies in prompt phase; disabled:false-rule skipped', () => {
    const r1 = applyRegexRules('a-b', [{ findRegex: '/-/', replaceString: '+', promptOnly: true }], { phase: 'prompt' });
    assert.equal(r1.text, 'a+b');
    const r2 = applyRegexRules('a-b', [{ findRegex: '/-/', replaceString: '+', enabled: false }]);
    assert.equal(r2.text, 'a-b');
  });

  it('respects placement and runOnEdit gating', () => {
    const miss = applyRegexRules('a-b', [{ findRegex: '/-/', replaceString: '+' }], { placement: 3 });
    // rule without placement array: not filtered
    assert.equal(miss.text, 'a+b');
    const filtered = applyRegexRules('a-b', [{ findRegex: '/-/', replaceString: '+', placement: [1] }], { placement: 3 });
    assert.equal(filtered.text, 'a-b');
    const gated = applyRegexRules('x', [{ findRegex: '/x/', replaceString: 'y' }], { isEdit: true });
    assert.equal(gated.text, 'x');
    const allowed = applyRegexRules('x', [{ findRegex: '/x/', replaceString: 'y', runOnEdit: true }], { isEdit: true });
    assert.equal(allowed.text, 'y');
  });

  it('{{match}} maps to whole match; substituteRegex:false is literal', () => {
    const r = applyRegexRules('hi foo', [{ findRegex: '/foo/', replaceString: '[{{match}}]' }]);
    assert.equal(r.text, 'hi [foo]');
    const lit = applyRegexRules('a', [{ findRegex: '/a/', replaceString: '$&-X', substituteRegex: false }]);
    assert.equal(lit.text, '$&-X');
  });
});

describe('expandWorldbookMacros', () => {
  it('replaces {{w::key}} by keys/content', () => {
    const out = expandWorldbookMacros('meet {{w::hero}}!', [{ keys: ['hero'], content: 'Alice' }]);
    assert.equal(out, 'meet Alice!');
  });

  it('unknown placeholder kept verbatim; key alias supported', () => {
    const out = expandWorldbookMacros('a {{w::ghost}} b', [{ keys: ['hero'], content: 'Alice' }]);
    assert.equal(out, 'a {{w::ghost}} b');
    const alias = expandWorldbookMacros('x {{w::HERO}} y', [{ key: 'hero', content: 'Bob' }]);
    assert.equal(alias, 'x Bob y');
  });

  it('non-array entries yields original text', () => {
    assert.equal(expandWorldbookMacros('{{w::a}}', null), '{{w::a}}');
  });
});

describe('substituteParams', () => {
  it('replaces {{arg::name}} family', () => {
    assert.equal(substituteParams('hi {{arg::name}}', { name: 'Zed' }), 'hi Zed');
    assert.equal(substituteParams('v={{var::n}}', { n: 7 }), 'v=7');
    assert.equal(substituteParams('v={{params::n}}', { n: 7 }), 'v=7');
  });

  it('unknown placeholder kept; null params safe', () => {
    assert.equal(substituteParams('x {{arg::unknown}} y', { a: 1 }), 'x {{arg::unknown}} y');
    assert.equal(substituteParams('x {{arg::a}}', null), 'x {{arg::a}}');
  });
});
