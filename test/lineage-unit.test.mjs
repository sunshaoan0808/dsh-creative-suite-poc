import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyStore, lineageGraphFor } from '../lib/index.js'
test('P6-6: lineage graph builds from novel->worldbook->card (unit)', async () => {
  const store = { data: emptyStore() }
  const now = Date.now()
  // novel
  const novelId = 'n1'
  store.data.resources.novels[novelId] = {
    id: novelId,
    kind: 'novels',
    name: 'Novel 1',
    source: 'test',
    version: 1,
    createdAt: now,
    updatedAt: now,
    data: { format: 'novel-text', text: 'hello' }
  }
  // worldbook derived from novel
  const wbId = 'wb1'
  store.data.resources.worldbooks[wbId] = {
    id: wbId,
    kind: 'worldbooks',
    name: 'Worldbook 1',
    source: 'generated-from-novel',
    version: 1,
    createdAt: now + 1,
    updatedAt: now + 1,
    data: { format: 'sillytavern-worldbook', entryCount: 0 },
    lineage: { derivedFrom: [{ kind: 'novels', id: novelId }], derivation: 'llm-worldbook' }
  }
  // card derived from character and worldbook
  const cardId = 'card1'
  store.data.resources.cards[cardId] = {
    id: cardId,
    kind: 'cards',
    name: 'Card 1',
    source: 'generated-from-novel',
    version: 1,
    createdAt: now + 2,
    updatedAt: now + 2,
    data: { format: 'sillytavern-json' },
    lineage: { derivedFrom: [
      { kind: 'novels', id: novelId },
      { kind: 'worldbooks', id: wbId }
    ], derivation: 'novel-to-card' }
  }
  // build graph from novel
  const graph = lineageGraphFor(store, 'novels', novelId, { maxDepth: 5 })
  assert.ok(graph, 'graph should exist')
  assert.equal(graph.root.kind, 'novels')
  assert.equal(graph.root.id, novelId)
  const nodeMap = new Map(graph.nodes.map(n => [n.kind + ':' + n.id, n]))
  assert.ok(nodeMap.has('novels:' + novelId), 'novel node')
  assert.ok(nodeMap.has('worldbooks:' + wbId), 'worldbook node')
  assert.ok(nodeMap.has('cards:' + cardId), 'card node')
  const novelNode = nodeMap.get('novels:' + novelId)
  assert.equal(novelNode.depth, 0)
  assert.equal(novelNode.direction, 'root')
  const wbNode = nodeMap.get('worldbooks:' + wbId)
  assert.equal(wbNode.depth, 1)
  assert.equal(wbNode.direction, 'descendant')
  const cardNode = nodeMap.get('cards:' + cardId)
  assert.equal(cardNode.depth, 1)
  assert.equal(cardNode.direction, 'descendant')
  // edges
  const edgeSet = new Set(graph.edges.map(e => e.from.kind + ':' + e.from.id + '->' + e.to.kind + ':' + e.to.id + (e.derivation ? ':' + e.derivation : '')))
  assert.ok(edgeSet.has('novels:n1->worldbooks:wb1:llm-worldbook'), 'novel->worldbook edge')
  assert.ok(edgeSet.has('novels:n1->cards:card1:novel-to-card'), 'novel->card edge')
  assert.ok(edgeSet.has('worldbooks:wb1->cards:card1:novel-to-card'), 'worldbook->card edge')
})
test('P6-6: maxDepth truncation works', async () => {
  const store = { data: emptyStore() }
  const now = Date.now()
  const novelId = 'novel-deep'
  store.data.resources.novels[novelId] = { id: novelId, kind: 'novels', name: 'Deep', source: 'test', version: 1, createdAt: now, updatedAt: now, data: {} }
  let prev = novelId
  for (let i = 1; i <= 6; i++) {
    const id = `level${i}`
    store.data.resources.scripts[id] = { id, kind: 'scripts', name: `Level ${i}`, source: 'test', version: 1, createdAt: now + i, updatedAt: now + i, data: {}, lineage: { derivedFrom: [{ kind: i === 1 ? 'novels' : 'scripts', id: prev }], derivation: 'step' } }
    prev = id
  }
  const graph = lineageGraphFor(store, 'novels', novelId, { maxDepth: 3 })
  assert.ok(graph.truncated, 'should be truncated')
  const depths = new Map(graph.nodes.map(n => [n.kind + ':' + n.id, n.depth]))
  // only nodes up to maxDepth should appear
  assert.equal(depths.get('novels:novel-deep'), 0)
  assert.equal(depths.get('scripts:level1'), 1)
  assert.equal(depths.get('scripts:level2'), 2)
  assert.equal(depths.get('scripts:level3'), 3)
  // level4 and beyond should NOT be present in nodes when truncated
  assert.ok(!depths.has('scripts:level4'), 'level4 should be omitted when truncated')
  assert.ok(!depths.has('scripts:level5'), 'level5 should be omitted when truncated')
  assert.ok(!depths.has('scripts:level6'), 'level6 should be omitted when truncated')
})
