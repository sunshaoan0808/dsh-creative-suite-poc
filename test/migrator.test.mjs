import test from 'node:test'
import assert from 'node:assert/strict'
import { migrateLegacyStore } from '../lib/migrator.js'

test('migrator: empty input returns empty store', () => {
  const store = migrateLegacyStore(null)
  assert.ok(store)
  assert.equal(store.version, 1)
  assert.ok(store.resources)
})

test('migrator: migrates cards and worldbooks', () => {
  const legacy = {
    version: '0.16.0',
    updatedAt: 12345,
    resources: {
      cards: { c1: { id: 'c1', name: 'Hero', data: { a: 1 } } },
      worldbooks: { w1: { id: 'w1', name: 'World', entries: [] } },
      presets: {},
      styles: {},
      novels: {},
      scripts: {},
      summaries: {},
      sessions: {},
      stories: {}
    },
    resourceHistories: {}
  }
  const store = migrateLegacyStore(legacy)
  assert.equal(store.version, '0.16.0')
  assert.equal(store.updatedAt, 12345)
  assert.ok(store.resources.cards.c1)
  assert.equal(store.resources.cards.c1.name, 'Hero')
  assert.ok(store.resources.worldbooks.w1)
  assert.equal(store.resources.worldbooks.w1.name, 'World')
})