import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseStoryProject } from '../lib/story-parser.js'

test('parseStoryProject returns [] when no chapters dir', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'story-'))
  const out = await parseStoryProject(dir)
  assert.deepEqual(out, [])
})

test('parseStoryProject parses md chapters', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'story-'))
  const ch = join(dir, 'chapters')
  mkdirSync(ch, { recursive: true })
  writeFileSync(join(dir, 'outline.md'), '# Test Outline\n')
  writeFileSync(join(ch, '01-第一节.md'), '# 第一章 标题\n内容...')
  writeFileSync(join(ch, '02-第二节.md'), '## 第二章 另一个标题\n更多内容...')
  writeFileSync(join(ch, '00-前言.md'), '# 前言\n前言内容')
  const out = await parseStoryProject(dir)
  assert.equal(out.length, 3)
  assert.equal(out[0].id, '00-前言')
  assert.equal(out[0].title, '前言')
  assert.equal(out[0].order, 0)
  assert.match(out[0].contentPath, /chapters/)
  assert.equal(out[1].id, '01-第一节')
  assert.equal(out[1].title, '第一章 标题')
  assert.equal(out[1].order, 1)
  assert.equal(out[2].id, '02-第二节')
  assert.equal(out[2].title, '第二章 另一个标题')
  assert.equal(out[2].order, 2)
})
