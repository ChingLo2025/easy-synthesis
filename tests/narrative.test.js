import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compute } from '../src/engine/compute.js'
import { generateNarrative, isMarker } from '../src/ui/narrative.js'
import { createSampleDocument } from '../src/model/sample.js'
import { createCompound, createDocument, createStep } from '../src/model/schema.js'

function run(doc) {
  return generateNarrative(doc, compute(doc))
}

function simpleDoc() {
  const doc = createDocument()
  doc.compounds = [
    createCompound({ id: 'A', name: '原料 A', nameEn: 'Material A', mw: 200, role: 'reactant' }),
    createCompound({ id: 'S', name: 'THF', nameEn: 'THF', mw: 72.11, density: 0.889, role: 'solvent' }),
  ]
  doc.basis = { compoundId: 'A', amount: 10, unit: 'g' }
  return doc
}

test('純模板步驟：中英文皆生成', () => {
  const doc = simpleDoc()
  doc.steps = [createStep('add', { compoundId: 'A', amount: { mode: 'mass', value: 10 }, vessel: '250 mL 圓底燒瓶' })]
  const narrative = run(doc)
  assert.match(narrative.zh.join(''), /於 250 mL 圓底燒瓶中加入原料 A \(10\.0 g, 50\.0 mmol, 1\.0 eq\)。/)
  assert.match(narrative.en.join(' '), /Material A \(10\.0 g, 50\.0 mmol, 1\.0 eq\)/)
  assert.equal(narrative.pending, 0)
})

test('有 note：中文原樣附加，英文留白', () => {
  const doc = simpleDoc()
  doc.steps = [createStep('stir', { temp: 25, time: 30, note: '需以冰浴輔助' })]
  const narrative = run(doc)
  assert.match(narrative.zh.join(''), /需以冰浴輔助。/)
  assert.equal(narrative.pendingZh, 0)
  assert.equal(narrative.pendingEn, 1)
  assert.ok(narrative.en.every(isMarker))
})

test('有 freeform：中英文皆留白', () => {
  const doc = simpleDoc()
  doc.steps = [createStep('stir', { freeform: '以特殊夾套控溫程式升溫' })]
  const narrative = run(doc)
  assert.equal(narrative.pendingZh, 1)
  assert.equal(narrative.pendingEn, 1)
  assert.equal(narrative.zh.length, 1)
  assert.ok(isMarker(narrative.zh[0]))
  assert.match(narrative.zh[0], /步驟 1：手動輸入，待補寫/)
})

test('清空 freeform 後敘述自動恢復生成', () => {
  const doc = simpleDoc()
  const step = createStep('stir', { temp: 40, time: 60, freeform: '暫時手寫' })
  doc.steps = [step]
  assert.equal(run(doc).pendingZh, 1)
  step.freeform = null
  const restored = run(doc)
  assert.equal(restored.pendingZh, 0)
  assert.match(restored.zh.join(''), /40 °C 攪拌 1 小時/)
})

test('連續加料合併為一句，滴加自成一句', () => {
  const doc = simpleDoc()
  doc.steps = [
    createStep('add', { compoundId: 'A', amount: { mode: 'mass', value: 10 }, vessel: '燒瓶' }),
    createStep('add', { compoundId: 'S', amount: { mode: 'volume', value: 50 } }),
    createStep('add', { compoundId: 'A', amount: { mode: 'equiv', value: 0.5 }, addMode: 'dropwise', duration: 20 }),
  ]
  const narrative = run(doc)
  assert.equal(narrative.zh.length, 2)
  assert.match(narrative.zh[0], /與 THF \(50 mL\)/)
  assert.match(narrative.zh[1], /^緩慢滴入/)
})

test('攪拌接在加料之後成為同一句', () => {
  const doc = simpleDoc()
  doc.steps = [
    createStep('add', { compoundId: 'A', amount: { mode: 'mass', value: 10 } }),
    createStep('stir', { atm: 'N2', temp: 25, time: 15 }),
  ]
  assert.equal(run(doc).zh.length, 1)
  assert.match(run(doc).zh[0], /攪拌 15 分鐘。$/)
})

test('分支自成段落並標出支流名稱', () => {
  const doc = simpleDoc()
  const extract = createStep('extract', { solventId: 'S', amount: { mode: 'volume', value: 30 } })
  extract.branch = { label: '水層', steps: [createStep('monitor', { method: 'retain', interval: 60 })] }
  doc.steps = [extract, createStep('evaporate', { method: 'rotary', temp: 40 })]
  const narrative = run(doc)
  assert.ok(narrative.zh.some((sentence) => sentence.startsWith('水層：')))
  assert.ok(narrative.zh.some((sentence) => sentence.includes('移除溶劑')))
})

test('重複次數寫入敘述', () => {
  const doc = simpleDoc()
  doc.steps = [createStep('wash', { solventId: 'S', amount: { mode: 'volume', value: 20 }, repeat: 3 })]
  assert.match(run(doc).zh.join(''), /洗滌三次/)
  assert.match(run(doc).en.join(' '), /\(20 mL x 3\)/)
})

test('範例程序可完整生成且無待補', () => {
  const narrative = run(createSampleDocument())
  assert.equal(narrative.pending, 0)
  assert.ok(narrative.zh.join('').length > 80)
  assert.ok(narrative.en.join(' ').length > 80)
})
