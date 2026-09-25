import test from 'node:test'
import assert from 'node:assert/strict'
import { buildVersionMatrix, renderVersionMatrixMarkdown } from '../lib/version-matrix.js'

test('version matrix: builds and renders host/poc fields', () => {
  const matrix = buildVersionMatrix({
    pocVersion: '0.17.1',
    nodeVersion: 'v20.0.0',
    dshVersion: '0.1.0-rc.8',
    cordisVersion: '4.0.1',
    reactVersion: '18.3.1',
    storeVersion: 1,
    storageDomain: 'creative-suite'
  })
  assert.equal(matrix.pocVersion, '0.17.1')
  assert.equal(matrix.cordisVersion, '4.0.1')
  assert.equal(matrix.storageDomain, 'creative-suite')
  const markdown = renderVersionMatrixMarkdown(matrix)
  assert.match(markdown, /Host\/Version Matrix/)
  assert.match(markdown, /0\.17\.1/)
  assert.match(markdown, /creative-suite/)
  assert.match(markdown, /TBD/)
})
