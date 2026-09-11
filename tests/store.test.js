import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStore, HISTORY_LIMIT } from '../src/state/store.js'
import { createDocument, createStep } from '../src/model/schema.js'

function newStore() {
  const doc = createDocument()
  doc.steps = [createStep('stir', { temp: 20 })]
  return createStore(doc)
}

test('structural changes are each their own history entry', () => {
  const store = newStore()
  store.transact((doc) => doc.steps.push(createStep('add')), { structural: true })
  store.transact((doc) => doc.steps.push(createStep('wash')), { structural: true })
  assert.equal(store.getState().doc.steps.length, 3)
  store.undo()
  assert.equal(store.getState().doc.steps.length, 2)
  store.undo()
  assert.equal(store.getState().doc.steps.length, 1)
  assert.equal(store.getState().canUndo, false)
})

test('consecutive edits to the same field merge into one entry', () => {
  const store = newStore()
  const id = store.getState().doc.steps[0].id
  for (const temp of [21, 22, 23]) {
    store.transact((doc) => { doc.steps[0].temp = temp }, { key: `${id}:temp` })
  }
  assert.equal(store.historyDepth.past, 1)
  store.undo()
  assert.equal(store.getState().doc.steps[0].temp, 20)
})

test('switching fields starts a new entry', () => {
  const store = newStore()
  store.transact((doc) => { doc.steps[0].temp = 30 }, { key: 'a:temp' })
  store.transact((doc) => { doc.steps[0].time = 15 }, { key: 'a:time' })
  assert.equal(store.historyDepth.past, 2)
})

test('after a flush the same key no longer merges', () => {
  const store = newStore()
  store.transact((doc) => { doc.steps[0].temp = 30 }, { key: 'a:temp' })
  store.flush()
  store.transact((doc) => { doc.steps[0].temp = 40 }, { key: 'a:temp' })
  assert.equal(store.historyDepth.past, 2)
})

test('redo is cleared by a new change', () => {
  const store = newStore()
  store.transact((doc) => doc.steps.push(createStep('add')), { structural: true })
  store.undo()
  assert.equal(store.getState().canRedo, true)
  store.transact((doc) => doc.steps.push(createStep('wash')), { structural: true })
  assert.equal(store.getState().canRedo, false)
})

test('undo reports the changed steps for flash highlighting', () => {
  const store = newStore()
  const id = store.getState().doc.steps[0].id
  store.transact((doc) => { doc.steps[0].temp = 80 }, { structural: true })
  store.undo()
  assert.deepEqual(store.getState().flash, [id])
})

test('the history depth limit keeps the most recent changes', () => {
  const store = newStore()
  for (let i = 0; i < HISTORY_LIMIT + 20; i += 1) {
    store.transact((doc) => { doc.steps[0].temp = i }, { structural: true })
  }
  assert.equal(store.historyDepth.past, HISTORY_LIMIT)
  assert.equal(store.getState().doc.steps[0].temp, HISTORY_LIMIT + 19)
})

test('loading a template resets history instead of stacking', () => {
  const store = newStore()
  store.transact((doc) => doc.steps.push(createStep('add')), { structural: true })
  store.replace(createDocument(), { resetHistory: true })
  assert.equal(store.getState().canUndo, false)
  assert.equal(store.getState().canRedo, false)
})

test('snapshots include selection and scroll position', () => {
  const store = newStore()
  store.setUI({ selectedId: 'x', scrollTop: 120 })
  store.transact((doc) => doc.steps.push(createStep('add')), { structural: true })
  store.setUI({ selectedId: 'y', scrollTop: 400 })
  store.undo()
  assert.equal(store.getState().ui.selectedId, 'x')
  assert.equal(store.getState().ui.scrollTop, 120)
})

test('UI state does not enter history', () => {
  const store = newStore()
  store.setUI({ selectedId: 'a' })
  assert.equal(store.getState().canUndo, false)
})

test('a flush during re-render (blur when Chrome removes a focused field) does not break same-field coalescing', () => {
  const store = newStore()
  store.transact((doc) => { doc.steps[0].temp = 21 }, { key: 'a:temp' })
  store.holdFlush(() => store.flush())
  store.transact((doc) => { doc.steps[0].temp = 22 }, { key: 'a:temp' })
  assert.equal(store.historyDepth.past, 1)
})

test('a flush outside re-render (really leaving the field) commits as usual', () => {
  const store = newStore()
  store.transact((doc) => { doc.steps[0].temp = 21 }, { key: 'a:temp' })
  store.holdFlush(() => {})
  store.flush()
  store.transact((doc) => { doc.steps[0].temp = 22 }, { key: 'a:temp' })
  assert.equal(store.historyDepth.past, 2)
})
