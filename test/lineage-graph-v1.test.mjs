import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyStore, lineageGraphFor } from '../lib/index.js'

function resource(store, kind, id, lineage = {}) {
  store.data.resources[kind][id] = { id, kind, name: id, version: 1, lineage }
}

test('lineage graph v1 includes derivedFrom, basedOn, node and edge types', () => {
  const store = { data: emptyStore() }
  resource(store, 'novels', 'novel-1')
  resource(store, 'worldbooks', 'worldbook-1', { derivedFrom: [{ kind: 'novels', id: 'novel-1' }] })
  resource(store, 'scripts', 'script-1', { basedOn: [{ kind: 'worldbooks', id: 'worldbook-1' }] })
  const graph = lineageGraphFor(store, 'novels', 'novel-1', { mode: 'full', maxDepth: 4 })
  assert.equal(graph.mode, 'full')
  assert.ok(graph.nodes.every(node => node.nodeType === 'resource'))
  assert.ok(graph.edges.some(edge => edge.edgeType === 'derived-from'))
  assert.ok(graph.edges.some(edge => edge.edgeType === 'based-on'))
  assert.equal(graph.truncated, false)
})

test('lineage graph v1 marks missing parents and cycles', () => {
  const store = { data: emptyStore() }
  resource(store, 'cards', 'card-1', { derivedFrom: [{ kind: 'novels', id: 'gone' }] })
  const missing = lineageGraphFor(store, 'cards', 'card-1', { mode: 'full' })
  assert.equal(missing.nodes.find(node => node.id === 'gone').nodeType, 'missing')
  assert.equal(missing.edges.find(edge => edge.to.id === 'card-1').missingParent, true)

  resource(store, 'styles', 'cycle-1', { derivedFrom: [{ kind: 'styles', id: 'cycle-1' }] })
  const cycle = lineageGraphFor(store, 'styles', 'cycle-1', { mode: 'full' })
  assert.equal(cycle.cycleDetected, true)
  assert.ok(cycle.edges.some(edge => edge.cycle === true))
})
