import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createCompound, createDocument, createStep, findStep, flattenSteps,
  normalizeDocument, numberSteps, serializeDocument,
} from '../src/model/schema.js'

function sampleDoc() {
  const doc = createDocument()
  doc.compounds = [createCompound({ id: 'A', name: 'A', mw: 100 })]
  doc.basis = { compoundId: 'A', amount: 5, unit: 'g' }
  const first = createStep('add', { compoundId: 'A', amount: { mode: 'mass', value: 5 } })
  first.branch = { label: '水層', steps: [createStep('wash'), createStep('evaporate')] }
  doc.steps = [first, createStep('stir', { temp: 25 })]
  return doc
}

test('匯出後再匯入不失真', () => {
  const doc = sampleDoc()
  const again = normalizeDocument(JSON.parse(serializeDocument(doc)))
  assert.equal(serializeDocument(again), serializeDocument(doc))
})

test('正規化補齊缺欄位並丟掉未知型別', () => {
  const doc = normalizeDocument({
    steps: [{ id: 's1', type: 'stir' }, { id: 's2', type: '外星步驟' }],
    compounds: [{ id: 'c1', name: 'X', mw: '150', purity: null }],
  })
  assert.equal(doc.steps.length, 1)
  assert.equal(doc.steps[0].repeat, 1)
  assert.equal(doc.compounds[0].mw, 150)
  assert.equal(doc.compounds[0].purity, 1)
  assert.equal(doc.version, 1)
})

test('正規化保留未知欄位，供未來版本 round-trip', () => {
  const doc = normalizeDocument({ steps: [{ id: 's1', type: 'stir', 自訂: '保留我' }] })
  assert.equal(doc.steps[0]['自訂'], '保留我')
})

test('主軸編號 1、2，分支編號 1.1、1.2', () => {
  const numbers = numberSteps(sampleDoc().steps)
  assert.deepEqual([...numbers.values()], ['1', '1.1', '1.2', '2'])
})

test('走訪為深度優先，並帶出深度與支流名稱', () => {
  const flat = flattenSteps(sampleDoc().steps)
  assert.deepEqual(flat.map((entry) => entry.depth), [0, 1, 1, 0])
  assert.equal(flat[1].branchLabel, '水層')
})

test('findStep 可跨分支尋找', () => {
  const doc = sampleDoc()
  const target = doc.steps[0].branch.steps[1]
  const hit = findStep(doc, target.id)
  assert.equal(hit.step.type, 'evaporate')
  assert.equal(hit.depth, 1)
})

test('未知步驟型別不得建立', () => {
  assert.throws(() => createStep('炸掉'), /未知步驟型別/)
})
