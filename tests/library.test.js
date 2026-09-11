import { test } from 'node:test'
import assert from 'node:assert/strict'

// node 沒有 localStorage：裝一個記憶體版本，讓個人庫的寫入可以被觀察
const memory = new Map()
globalThis.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
}

const { createStore } = await import('../src/state/store.js')
const { createActions } = await import('../src/state/actions.js')
const { createDocument } = await import('../src/model/schema.js')
const { loadLibrary } = await import('../src/model/library.js')

test('逐字輸入化合物名稱時，不會把每個前綴都記進個人庫', () => {
  memory.clear()
  const actions = createActions(createStore(createDocument()))
  const compound = actions.addCompound({ name: '' })
  for (const name of ['M', 'Me', 'MeO', 'MeOH']) actions.updateCompound(compound.id, { name }, { key: 'name' })
  assert.equal(loadLibrary().length, 0)
  actions.commitCompound(compound.id)
  assert.deepEqual(loadLibrary().map((entry) => entry.name), ['MeOH'])
})

test('結構性修改（例如改角色）立即記入個人庫', () => {
  memory.clear()
  const actions = createActions(createStore(createDocument()))
  const compound = actions.addCompound({ name: 'THF', role: 'reactant' })
  actions.updateCompound(compound.id, { role: 'solvent' })
  assert.equal(loadLibrary().find((entry) => entry.name === 'THF')?.role, 'solvent')
})
