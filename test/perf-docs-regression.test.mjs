import test from 'node:test'
import assert from 'node:assert/strict'
import { statSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const f = (p) => path.join(root, p)

// P7-5: client bundle budget — single-file web bundle must stay small.
test('perf: client.js bundle stays within budget (220KB)', () => {
  const bytes = statSync(f('lib/client.js')).size
  assert.ok(bytes <= 220 * 1024, `client.js ${bytes} bytes exceeds 220KB budget`)
})

// P7-5: heavy panes must render conditionally (lazy by mode), not eagerly.
test('perf: heavy panes are mode-gated via React.createElement', () => {
  const src = readFileSync(f('lib/client.js'), 'utf8')
  for (const pane of ['MuseAIPane', 'TavernModePane', 'CardWorkbenchPane', 'RegexLabPane']) {
    assert.ok(
      src.includes(`react.createElement(${pane}`),
      `${pane} should be instantiated via React.createElement (mode-gated)`
    )
  }
  // Workspace must gate panes on workspaceMode so only the active pane mounts.
  assert.ok(src.includes("workspaceMode ==="), 'workspace panes should be gated on workspaceMode')
})

// P7-7: required docs present and non-empty.
test('docs: README / INSTALL / STATUS present and non-empty', () => {
  for (const doc of ['README.md', 'docs/INSTALL.md', 'docs/STATUS.md']) {
    assert.ok(existsSync(f(doc)), `${doc} missing`)
    assert.ok(statSync(f(doc)).size > 200, `${doc} looks empty`)
  }
})

// P7-8: minimal regression checklist — core converter round trip still works.
test('regression: converter round trip smoke', async () => {
  const { worldbookToPreset, presetToWorldbook } = await import('../lib/converters.js')
  const wb = { name: 'smoke', entries: [{ keys: ['k'], content: 'c' }] }
  const back = presetToWorldbook(worldbookToPreset(wb))
  assert.equal(back.entries[0].content, 'c')
})
