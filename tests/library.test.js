import { test } from 'node:test'
import assert from 'node:assert/strict'

// Node has no localStorage: install an in-memory one so writes to the personal library can be observed
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

test('typing a compound name char by char does not record every prefix in the personal library', () => {
  memory.clear()
  const actions = createActions(createStore(createDocument()))
  const compound = actions.addCompound({ name: '' })
  for (const name of ['M', 'Me', 'MeO', 'MeOH']) actions.updateCompound(compound.id, { name }, { key: 'name' })
  assert.equal(loadLibrary().length, 0)
  actions.commitCompound(compound.id)
  assert.deepEqual(loadLibrary().map((entry) => entry.name), ['MeOH'])
})

test('structural changes (e.g. changing the role) are recorded in the personal library immediately', () => {
  memory.clear()
  const actions = createActions(createStore(createDocument()))
  const compound = actions.addCompound({ name: 'THF', role: 'reactant' })
  actions.updateCompound(compound.id, { role: 'solvent' })
  assert.equal(loadLibrary().find((entry) => entry.name === 'THF')?.role, 'solvent')
})
