import test from 'node:test'
import assert from 'node:assert/strict'
import { renderCardTemplate } from '../lib/helper-runtime.js'

const render = (content, variables) => renderCardTemplate({ rawCard: { data: { extensions: { mes_template: content } } }, variables })

test('template full semantics: if, else, nested variables, each and escaping', async () => {
  const out = await render('{{#if profile.active}}{{profile.name}}:{{#each profile.items}}[{{name}}/{{meta.label}}/{{@index}}]{{/each}}{{else}}inactive{{/if}}', {
    profile: { active: true, name: '<Alice>', items: [{ name: 'one', meta: { label: 'A&B' } }, { name: 'two', meta: { label: 'C' } }] }
  })
  assert.equal(out.text, '&lt;Alice&gt;:[one/A&amp;B/0][two/C/1]')
})

test('template full semantics: set supports literals, paths and later interpolation', async () => {
  const out = await render('{{set profile.title="Writer"}}{{set count=2}}{{profile.title}}/{{count}}/{{profile.missing}}', { profile: {} })
  assert.equal(out.text, 'Writer/2/')
})

test('template full semantics: legacy var macro and explicit raw escape are compatible', async () => {
  const out = await render('{{var::name}}|{{name}}|{{&name}}', { name: '<b>x</b>' })
  assert.equal(out.text, '&lt;b&gt;x&lt;/b&gt;|&lt;b&gt;x&lt;/b&gt;|<b>x</b>')
})
