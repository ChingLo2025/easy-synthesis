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

test('點擊模組即追加到序列末尾', () => {
  const { actions, doc, store } = setup()
  actions.addStep('add')
  actions.addStep('stir')
  assert.deepEqual(doc().steps.map((s) => s.type), ['add', 'stir'])
  assert.equal(store.getState().ui.selectedId, doc().steps[1].id)
})

test('拖曳排序：前後插入', () => {
  const { actions, doc } = setup()
  actions.addStep('add')
  actions.addStep('stir')
  actions.addStep('wash')
  const [first, , third] = doc().steps
  actions.moveStep(third.id, first.id, 'before')
  assert.deepEqual(doc().steps.map((s) => s.type), ['wash', 'add', 'stir'])
})

test('不得把步驟拖進自己的分支', () => {
  const { actions, doc } = setup()
  actions.addStep('extract')
  const parent = doc().steps[0]
  actions.startBranch(parent.id, '水層')
  actions.addStep('wash', { parentId: parent.id })
  const child = doc().steps[0].branch.steps[0]
  actions.moveStep(parent.id, child.id, 'after')
  assert.equal(doc().steps.length, 1)
  assert.equal(doc().steps[0].id, parent.id)
})

test('複製步驟會連分支一起複製並換新 id', () => {
  const { actions, doc } = setup()
  actions.addStep('extract')
  const original = doc().steps[0]
  actions.startBranch(original.id, '水層')
  actions.addStep('monitor', { parentId: original.id })
  actions.duplicateStep(original.id)
  const [a, b] = doc().steps
  assert.notEqual(a.id, b.id)
  assert.equal(b.branch.steps.length, 1)
  assert.notEqual(a.branch.steps[0].id, b.branch.steps[0].id)
})

test('分歧深度上限為兩層', () => {
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

test('刪除化合物會清掉步驟中的參照與基準', () => {
  const { actions, doc } = setup()
  actions.addStep('add')
  actions.updateStep(doc().steps[0].id, { compoundId: 'A' })
  actions.removeCompound('A')
  assert.equal(doc().steps[0].compoundId, null)
  assert.equal(doc().basis.compoundId, null)
})

test('xN 為結構性變動，各成一筆歷史', () => {
  const { actions, doc, store } = setup()
  actions.addStep('wash')
  const before = store.historyDepth.past
  actions.setRepeat(doc().steps[0].id, 3)
  actions.setRepeat(doc().steps[0].id, 4)
  assert.equal(doc().steps[0].repeat, 4)
  assert.equal(store.historyDepth.past, before + 2)
})

test('xN 不得小於 1', () => {
  const { actions, doc } = setup()
  actions.addStep('wash')
  actions.setRepeat(doc().steps[0].id, 0)
  assert.equal(doc().steps[0].repeat, 1)
})

test('切到 freeform 再切回模板，模板欄位仍在', () => {
  const { actions, doc } = setup()
  actions.addStep('stir')
  const id = doc().steps[0].id
  actions.updateStep(id, { temp: 60 })
  actions.toggleFreeform(id, true)
  actions.updateStep(id, { freeform: '特殊條件' })
  assert.equal(findStep(doc(), id).step.freeform, '特殊條件')
  actions.toggleFreeform(id, false)
  assert.equal(findStep(doc(), id).step.freeform, null)
  assert.equal(findStep(doc(), id).step.temp, 60)
})

test('移除分支後編號重新連號', () => {
  const { actions, doc } = setup()
  actions.addStep('extract')
  const parent = doc().steps[0]
  actions.addStep('wash', { parentId: parent.id })
  actions.addStep('dry')
  assert.deepEqual([...numberSteps(doc().steps).values()], ['1', '1.1', '2'])
  actions.removeBranch(parent.id)
  assert.deepEqual([...numberSteps(doc().steps).values()], ['1', '2'])
})

test('內容沒變的修改不進歷史，也不清掉重做', () => {
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

test('在 x1 按減號、重點同一顆條件按鈕、寫回相同標題，都不會多出復原步驟', () => {
  const { actions, doc, store } = setup()
  actions.addStep('stir')
  const id = doc().steps[0].id
  const depth = store.historyDepth.past
  actions.setRepeat(id, 0)
  actions.updateStep(id, { atm: doc().steps[0].atm })
  actions.setMeta({ title: doc().meta.title })
  assert.equal(store.historyDepth.past, depth)
})
