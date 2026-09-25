// N5 Session Surface: regen / rollback / undo / candidates / branch（真实语义测试）
import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { createHelperRuntime } from '../lib/helper-runtime.js'

describe('N5: regenLast', () => {
  it('删除最后一条assistant消息并返回上下文', async () => {
    const rt = createHelperRuntime({ cardId: 'c1' })
    await rt.ready()
    rt.createMessage({ role: 'user', content: 'hi' })
    const a1 = rt.createMessage({ role: 'assistant', content: 'hello' })
    const out = rt.regenLast()
    assert.equal(out.removed.id, a1.id)
    assert.equal(rt.getMessages().length, 1)
    assert.equal(rt.rollbackDepth(), 1)
    rt.stop('done')
  })
  it('无assistant消息时返回removed null', async () => {
    const rt = createHelperRuntime({ cardId: 'c1' })
    await rt.ready()
    rt.createMessage({ role: 'user', content: 'hi' })
    const out = rt.regenLast()
    assert.equal(out.removed, null)
    rt.stop('done')
  })
})

describe('N5: rollbackTo / undoRollback', () => {
  it('回退到指定index并可undo恢复', async () => {
    const rt = createHelperRuntime({ cardId: 'c1' })
    await rt.ready()
    rt.createMessage({ role: 'user', content: 'm0' })
    rt.createMessage({ role: 'assistant', content: 'm1' })
    rt.createMessage({ role: 'user', content: 'm2' })
    rt.setVariable('hp', 100)
    const rb = rt.rollbackTo(0)
    assert.equal(rb.at, 0)
    assert.equal(rb.kept.length, 1)
    assert.equal(rb.removed.length, 2)
    assert.equal(rt.getMessages().length, 1)
    const undo = rt.undoRollback()
    assert.ok(undo)
    assert.equal(rt.getMessages().length, 3)
    assert.equal(rt.getVariable('hp'), 100)
    rt.stop('done')
  })
  it('空栈undo返回null', async () => {
    const rt = createHelperRuntime({ cardId: 'c1' })
    assert.equal(rt.undoRollback(), null)
    rt.stop('done')
  })
})

describe('N5: candidates', () => {
  it('建槽位/填充/选中落消息', async () => {
    const rt = createHelperRuntime({ cardId: 'c1' })
    await rt.ready()
    const batch = rt.createCandidates(3, { label: 'turn1' })
    assert.equal(batch.items.length, 3)
    rt.fillCandidate(batch.batchId, batch.items[0].id, '候选A')
    rt.fillCandidate(batch.batchId, batch.items[1].id, '候选B')
    const picked = rt.selectCandidate(batch.batchId, batch.items[1].id)
    assert.equal(picked.candidate.text, '候选B')
    assert.equal(picked.message.content, '候选B')
    assert.equal(picked.message.role, 'assistant')
    rt.stop('done')
  })
  it('count越界钳制1..10，无效batch返回null', async () => {
    const rt = createHelperRuntime({ cardId: 'c1' })
    const b0 = rt.createCandidates(0)
    assert.equal(b0.items.length, 3)
    const b99 = rt.createCandidates(99)
    assert.equal(b99.items.length, 10)
    assert.equal(rt.selectCandidate('nope', 'nope'), null)
    assert.equal(rt.fillCandidate('nope', 'nope', 'x'), null)
    rt.stop('done')
  })
})

describe('N5: branch', () => {
  it('分叉隔离：fork改变量不影响原runtime', async () => {
    const rt = createHelperRuntime({ cardId: 'c1', variables: { hp: 100 } })
    rt.createMessage({ role: 'user', content: 'hi' })
    const fork = rt.branch()
    assert.notEqual(fork.id, rt.id)
    assert.equal(fork.getMessages().length, 1)
    fork.setVariable('hp', 1)
    fork.createMessage({ role: 'assistant', content: 'forked' })
    assert.equal(rt.getVariable('hp'), 100)
    assert.equal(rt.getMessages().length, 1)
    assert.equal(fork.getMessages().length, 2)
    fork.stop('done'); rt.stop('done')
  })
})
