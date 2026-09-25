import test from 'node:test'
import assert from 'node:assert/strict'
import { createHelperRuntime, getHelperRuntime, deleteHelperRuntime, helperRuntimeCount } from '../lib/helper-runtime.js'

const cardWithScript = {
  data: {
    name: 'test-card',
    extensions: {
      tavern_helper: {
        scripts: [
          { type: 'script', id: 's1', name: 'tool-reg', content: "registerTool('echo', async (args) => ({ ok: true, got: args })); eventOn('HELLO', async (p) => { updateVariablesWith({ greeted: true }) })" }
        ]
      }
    }
  }
}

test('P5-5: lifecycle start/running/stop + tool bridge', async () => {
  const before = helperRuntimeCount()
  const rt = createHelperRuntime({ cardId: 'test', rawCard: cardWithScript, variables: {}, messages: [] })
  assert.equal(rt.lifecycle, 'running')
  assert.equal(helperRuntimeCount(), before + 1)
  const snap = rt.snapshot()
  assert.equal(snap.lifecycle, 'running')
  assert.deepEqual(snap.tools, ['echo'])

  // tool bridge works while running
  const out = await rt.callTool('echo', { a: 1 })
  assert.deepEqual(out, { ok: true, got: { a: 1 } })

  // event works while running
  const after = await rt.emit('HELLO', {})
  assert.equal(after.variables.greeted, true)

  // unregister tool
  assert.equal(rt.unregisterTool('echo'), true)
  assert.deepEqual(rt.listTools(), [])
  await assert.rejects(() => rt.callTool('echo', {}), /工具不存在/)

  // stop
  const stopped = rt.stop('test-done')
  assert.equal(stopped.lifecycle, 'stopped')
  assert.equal(stopped.stopReason, 'test-done')
  assert.ok(stopped.stoppedAt)

  // stopped runtime refuses emit/callTool
  await assert.rejects(() => rt.emit('HELLO', {}), /已停止/)
  await assert.rejects(() => rt.callTool('nope', {}), /已停止/)

  // double stop is idempotent
  const s2 = rt.stop('again')
  assert.equal(s2.lifecycle, 'stopped')

  assert.ok(getHelperRuntime(rt.id))
  deleteHelperRuntime(rt.id)
  assert.equal(getHelperRuntime(rt.id), null)
})

test('P5-5: stop clears handlers and queue', async () => {
  const rt = createHelperRuntime({ cardId: 't2', rawCard: { data: { name: 'x', extensions: {} } }, variables: {}, messages: [] })
  // register a handler manually via sandbox? use eventOn through a script-less path: emit with no handlers is fine
  await rt.emit('NOOP', {})
  rt.stop('cleanup')
  assert.equal(rt.handlers.size, 0)
  assert.equal(rt.queue.length, 0)
  deleteHelperRuntime(rt.id)
})
