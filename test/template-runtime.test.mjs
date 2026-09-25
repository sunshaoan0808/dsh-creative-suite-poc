import test from 'node:test'
import assert from 'node:assert/strict'
import { renderCardTemplate, listCardTemplates, closeTemplateBrowser, templateBrowserStatus } from '../lib/helper-runtime.js'

test('template: list + render with macros and variables', async () => {
  const rawCard = { data: { name: 't', extensions: { mes_template: '<div><h1>{{char}}</h1><p>hp={{var::hp}}</p><p>{{last_message}}</p></div>' } } }
  const list = listCardTemplates(rawCard)
  assert.equal(list.length, 1)
  assert.equal(list[0].source, 'extensions.mes_template')
  const out = await renderCardTemplate({ rawCard, variables: { hp: 42 }, messages: [{ message: 'hi there' }], cardName: 'Alice', userName: 'Bob' })
  assert.equal(out.ok, true)
  assert.ok(out.text.includes('Alice'))
  assert.ok(out.text.includes('hp=42'))
  assert.ok(out.text.includes('hi there'))
})

test('template: no template throws NO_TEMPLATE', async () => {
  await assert.rejects(
    () => renderCardTemplate({ rawCard: { data: { name: 'x', extensions: {} } } }),
    (e) => e.code === 'NO_TEMPLATE'
  )
})

test('template: empty templates list', async () => {
  assert.deepEqual(listCardTemplates({ data: { name: 'x', extensions: {} } }), [])
  assert.deepEqual(listCardTemplates(null), [])
})

test('template: browser status + close', async () => {
  const s = templateBrowserStatus()
  assert.equal(typeof s.started, 'boolean')
  await closeTemplateBrowser()
  assert.equal(templateBrowserStatus().started, false)
})
