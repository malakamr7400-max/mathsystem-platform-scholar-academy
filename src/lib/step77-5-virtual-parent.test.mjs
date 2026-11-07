import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('../src/lib/questionBankService.ts', import.meta.url), 'utf8')
const method = source.split('async createCollectionAndPersist(')[1]?.split('async updateCollectionAndPersist(')[0]
test('collection creation refreshes database-backed folders before checking parent', () => {
  assert.ok(method)
  assert.match(method, /await this\.fetchCollectionsFromDatabase\(\)/)
})
test('visible virtual folders can be persisted as parents without changing questions', () => {
  assert.match(method, /this\.getCollectionsList\(\)/)
  assert.match(method, /col-auto-/)
  assert.match(method, /\.\.\.\_collectionsCache/)
  assert.match(method, /resolvedParent/)
  assert.doesNotMatch(method, /deleteQuestion|delete from|updateQuestion/)
})
test('missing parent folders still stop saving', () => {
  assert.match(method, /if \(!inferredParent\)/)
  assert.match(method, /Refresh Question Bank and choose another folder/)
})
