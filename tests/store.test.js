import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStore, HISTORY_LIMIT } from '../src/state/store.js'
import { createDocument, createStep } from '../src/model/schema.js'

function newStore() {
  const doc = createDocument()
  doc.steps = [createStep('stir', { temp: 20 })]
  return createStore(doc)
}

test('結構性變動各成一筆歷史', () => {
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

test('同一欄位的連續修改合併為一筆', () => {
  const store = newStore()
  const id = store.getState().doc.steps[0].id
  for (const temp of [21, 22, 23]) {
    store.transact((doc) => { doc.steps[0].temp = temp }, { key: `${id}:temp` })
  }
  assert.equal(store.historyDepth.past, 1)
  store.undo()
  assert.equal(store.getState().doc.steps[0].temp, 20)
})

test('切換欄位即分筆', () => {
  const store = newStore()
  store.transact((doc) => { doc.steps[0].temp = 30 }, { key: 'a:temp' })
  store.transact((doc) => { doc.steps[0].time = 15 }, { key: 'a:time' })
  assert.equal(store.historyDepth.past, 2)
})

test('flush 之後同 key 也不再合併', () => {
  const store = newStore()
  store.transact((doc) => { doc.steps[0].temp = 30 }, { key: 'a:temp' })
  store.flush()
  store.transact((doc) => { doc.steps[0].temp = 40 }, { key: 'a:temp' })
  assert.equal(store.historyDepth.past, 2)
})

test('重做在新的變更後被清空', () => {
  const store = newStore()
  store.transact((doc) => doc.steps.push(createStep('add')), { structural: true })
  store.undo()
  assert.equal(store.getState().canRedo, true)
  store.transact((doc) => doc.steps.push(createStep('wash')), { structural: true })
  assert.equal(store.getState().canRedo, false)
})

test('復原後回報變動的步驟，供閃爍高亮', () => {
  const store = newStore()
  const id = store.getState().doc.steps[0].id
  store.transact((doc) => { doc.steps[0].temp = 80 }, { structural: true })
  store.undo()
  assert.deepEqual(store.getState().flash, [id])
})

test('歷史深度上限保留最近的變更', () => {
  const store = newStore()
  for (let i = 0; i < HISTORY_LIMIT + 20; i += 1) {
    store.transact((doc) => { doc.steps[0].temp = i }, { structural: true })
  }
  assert.equal(store.historyDepth.past, HISTORY_LIMIT)
  assert.equal(store.getState().doc.steps[0].temp, HISTORY_LIMIT + 19)
})

test('載入範本時重置歷史，不疊加', () => {
  const store = newStore()
  store.transact((doc) => doc.steps.push(createStep('add')), { structural: true })
  store.replace(createDocument(), { resetHistory: true })
  assert.equal(store.getState().canUndo, false)
  assert.equal(store.getState().canRedo, false)
})

test('快照包含選取與捲動位置', () => {
  const store = newStore()
  store.setUI({ selectedId: 'x', scrollTop: 120 })
  store.transact((doc) => doc.steps.push(createStep('add')), { structural: true })
  store.setUI({ selectedId: 'y', scrollTop: 400 })
  store.undo()
  assert.equal(store.getState().ui.selectedId, 'x')
  assert.equal(store.getState().ui.scrollTop, 120)
})

test('介面狀態不進入歷史', () => {
  const store = newStore()
  store.setUI({ selectedId: 'a' })
  assert.equal(store.getState().canUndo, false)
})

test('重繪期間的 flush（Chrome 移除有焦點欄位時送出的 blur）不打斷同欄位合併', () => {
  const store = newStore()
  store.transact((doc) => { doc.steps[0].temp = 21 }, { key: 'a:temp' })
  store.holdFlush(() => store.flush())
  store.transact((doc) => { doc.steps[0].temp = 22 }, { key: 'a:temp' })
  assert.equal(store.historyDepth.past, 1)
})

test('重繪以外的 flush（真的離開欄位）照常提交', () => {
  const store = newStore()
  store.transact((doc) => { doc.steps[0].temp = 21 }, { key: 'a:temp' })
  store.holdFlush(() => {})
  store.flush()
  store.transact((doc) => { doc.steps[0].temp = 22 }, { key: 'a:temp' })
  assert.equal(store.historyDepth.past, 2)
})
