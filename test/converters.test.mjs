import test from 'node:test'
import assert from 'node:assert/strict'
import { worldbookToPreset, presetToWorldbook, museaiToWorldbook } from '../lib/converters.js'

test('worldbook -> preset keeps entries and keys', () => {
  const out = worldbookToPreset({ name: 'wb', entries: [{ keys: ['a', 'b'], content: 'hello', enabled: true }] })
  assert.equal(out.prompts.length, 1)
  assert.equal(out.prompts[0].content, 'hello')
  assert.equal(out.prompts[0].label, 'a,b')
})

test('preset -> worldbook round trip', () => {
  const wb = { name: 'wb', entries: [{ keys: ['x'], content: 'c1' }] }
  const preset = worldbookToPreset(wb)
  const back = presetToWorldbook(preset)
  assert.equal(back.entries.length, 1)
  assert.equal(back.entries[0].content, 'c1')
  assert.deepEqual(back.entries[0].keys, ['x'])
})

test('museai -> worldbook maps pages', () => {
  const out = museaiToWorldbook({ title: 'doc', pages: [{ heading: 'h1', body: 'b1' }] })
  assert.equal(out.entries.length, 1)
  assert.equal(out.entries[0].content, 'b1')
})
