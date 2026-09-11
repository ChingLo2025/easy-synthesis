import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStore } from '../src/state/store.js'
import { createActions } from '../src/state/actions.js'
import { createCompound, createDocument, createStep, findStep, numberSteps } from '../src/model/schema.js'
import { MAX_BRANCH_DEPTH } from '../src/model/steps.js'

function setup() {
  const doc = createDocument()
  doc.compounds = [createCompound({ id: 'A', name: 'A', mw: 100 })]
  doc.basis = { compoundId: 'A', amount: 1, unit: 'g' }
  const store = createStore(doc)
  return { store, actions: createActions(store), doc: () => store.getState().doc }
}

test('clicking a module appends to the end of the sequence', () => {
  const { actions, doc, store } = setup()
  actions.addStep('add')
  actions.addStep('stir')
  assert.deepEqual(doc().steps.map((s) => s.type), ['add', 'stir'])
  assert.equal(store.getState().ui.selectedId, doc().steps[1].id)
})

test('drag reorder: insert before and after', () => {
  const { actions, doc } = setup()
  actions.addStep('add')
  actions.addStep('stir')
  actions.addStep('wash')
  const [first, , third] = doc().steps
  actions.moveStep(third.id, first.id, 'before')
  assert.deepEqual(doc().steps.map((s) => s.type), ['wash', 'add', 'stir'])
})

test('a step cannot be dragged into its own branch', () => {
  const { actions, doc } = setup()
  actions.addStep('extract')
  const parent = doc().steps[0]
  actions.startBranch(parent.id, 'aqueous layer')
  actions.addStep('wash', { parentId: parent.id })
  const child = doc().steps[0].branch.steps[0]
  actions.moveStep(parent.id, child.id, 'after')
  assert.equal(doc().steps.length, 1)
  assert.equal(doc().steps[0].id, parent.id)
})

test('duplicating a step copies its branch with new ids', () => {
  const { actions, doc } = setup()
  actions.addStep('extract')
  const original = doc().steps[0]
  actions.startBranch(original.id, 'aqueous layer')
  actions.addStep('monitor', { parentId: original.id })
  actions.duplicateStep(original.id)
  const [a, b] = doc().steps
  assert.notEqual(a.id, b.id)
  assert.equal(b.branch.steps.length, 1)
  assert.notEqual(a.branch.steps[0].id, b.branch.steps[0].id)
})

test('branch depth is capped at two levels', () => {
  const { actions, doc } = setup()
  actions.addStep('extract')
  const level0 = doc().steps[0]
  actions.addStep('wash', { parentId: level0.id })
  const level1 = doc().steps[0].branch.steps[0]
  actions.addStep('dry', { parentId: level1.id })
  const level2 = doc().steps[0].branch.steps[0].branch.steps[0]
  assert.equal(actions.canBranch(doc(), level1.id), MAX_BRANCH_DEPTH > 1)
  assert.equal(actions.canBranch(doc(), level2.id), false)
  actions.addStep('stir', { parentId: level2.id })
  assert.equal(level2.branch, null)
})

test('deleting a compound clears step references and the basis', () => {
  const { actions, doc } = setup()
  actions.addStep('add')
  actions.updateStep(doc().steps[0].id, { compoundId: 'A' })
  actions.removeCompound('A')
  assert.equal(doc().steps[0].compoundId, null)
  assert.equal(doc().basis.compoundId, null)
})

test('xN is structural; each change is its own history entry', () => {
  const { actions, doc, store } = setup()
  actions.addStep('wash')
  const before = store.historyDepth.past
  actions.setRepeat(doc().steps[0].id, 3)
  actions.setRepeat(doc().steps[0].id, 4)
  assert.equal(doc().steps[0].repeat, 4)
  assert.equal(store.historyDepth.past, before + 2)
})

test('xN cannot go below 1', () => {
  const { actions, doc } = setup()
  actions.addStep('wash')
  actions.setRepeat(doc().steps[0].id, 0)
  assert.equal(doc().steps[0].repeat, 1)
})

test('switching to freeform and back keeps the template fields', () => {
  const { actions, doc } = setup()
  actions.addStep('stir')
  const id = doc().steps[0].id
  actions.updateStep(id, { temp: 60 })
  actions.toggleFreeform(id, true)
  actions.updateStep(id, { freeform: 'special conditions' })
  assert.equal(findStep(doc(), id).step.freeform, 'special conditions')
  actions.toggleFreeform(id, false)
  assert.equal(findStep(doc(), id).step.freeform, null)
  assert.equal(findStep(doc(), id).step.temp, 60)
})

test('removing a branch renumbers the steps', () => {
  const { actions, doc } = setup()
  actions.addStep('extract')
  const parent = doc().steps[0]
  actions.addStep('wash', { parentId: parent.id })
  actions.addStep('dry')
  assert.deepEqual([...numberSteps(doc().steps).values()], ['1', '1.1', '2'])
  actions.removeBranch(parent.id)
  assert.deepEqual([...numberSteps(doc().steps).values()], ['1', '2'])
})

test('edits that change nothing do not enter history or clear redo', () => {
  const { actions, doc, store } = setup()
  actions.addStep('stir')
  const id = doc().steps[0].id
  actions.updateStep(id, { temp: 25 })
  store.undo()
  const depth = store.historyDepth.past
  actions.updateStep(id, { temp: doc().steps[0].temp })
  assert.equal(store.historyDepth.past, depth)
  assert.equal(store.getState().canRedo, true)
})

test('minus at x1, re-clicking the same condition button, or rewriting the same title adds no undo step', () => {
  const { actions, doc, store } = setup()
  actions.addStep('stir')
  const id = doc().steps[0].id
  const depth = store.historyDepth.past
  actions.setRepeat(id, 0)
  actions.updateStep(id, { atm: doc().steps[0].atm })
  actions.setMeta({ title: doc().meta.title })
  assert.equal(store.historyDepth.past, depth)
})
