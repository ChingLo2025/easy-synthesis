import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compute } from '../src/engine/compute.js'
import { generateNarrative } from '../src/ui/narrative.js'
import { createCompound, createDocument, createStep, normalizeDocument, serializeDocument } from '../src/model/schema.js'
import { formatAmount, formatMass, formatVolume } from '../src/model/units.js'

function doc() {
  const d = createDocument()
  d.compounds = [
    createCompound({ id: 'A', name: 'Material A', nameEn: 'Material A', mw: 200, role: 'reactant' }),
    createCompound({ id: 'EA', name: 'EtOAc', nameEn: 'EtOAc', mw: 88.11, density: 0.902, role: 'solvent' }),
    createCompound({ id: 'HEX', name: 'Hexane', nameEn: 'hexane', mw: 86.18, density: 0.659, role: 'solvent' }),
  ]
  d.basis = { compoundId: 'A', amount: 10, unit: 'g' }
  return d
}
const narrate = (d) => generateNarrative(d, compute(d))

test('an extraction with a co-solvent splits the volume by the mixing ratio', () => {
  const d = doc()
  d.steps = [createStep('extract', {
    solventId: 'EA', solvent2Id: 'HEX', ratio: [1, 1], amount: { mode: 'volume', value: 50 }, repeat: 3,
  })]
  const m = compute(d)
  const rows = m.rows.filter((r) => r.stepId === d.steps[0].id)
  assert.equal(rows.length, 2)
  assert.equal(formatVolume(rows[0].volume), '25 mL')
  assert.equal(rows[1].part, 'cosolvent')
  assert.equal(formatVolume(rows[1].volume), '25 mL')
  assert.equal(formatVolume(m.solvent.total), '150 mL')
})

test('the extraction narrative writes the mixed solvent and its ratio', () => {
  const d = doc()
  d.steps = [createStep('extract', {
    solventId: 'EA', solvent2Id: 'HEX', ratio: [1, 1], amount: { mode: 'volume', value: 50 }, repeat: 3,
  })]
  const n = narrate(d)
  assert.ok(n.zh.join('').includes('以 EtOAc/Hexane (1:1, 50 mL) 萃取三次'), n.zh.join(''))
  assert.ok(n.en.join(' ').includes('EtOAc/hexane (1:1, 50 mL x 3)'), n.en.join(' '))
})

test('a single-solvent extraction is unchanged', () => {
  const d = doc()
  d.steps = [createStep('extract', { solventId: 'EA', amount: { mode: 'volume', value: 50 }, repeat: 3 })]
  const m = compute(d)
  assert.equal(m.rows.filter((r) => r.stepId === d.steps[0].id).length, 1)
  assert.ok(narrate(d).zh.join('').includes('以 EtOAc (50 mL) 萃取三次'))
})

test('recrystallisation quantifies the antisolvent and writes both languages', () => {
  const d = doc()
  d.steps = [createStep('recrystallize', {
    solventId: 'EA', amount: { mode: 'volume', value: 20 }, tempHot: 70,
    antisolventId: 'HEX', antisolventVolume: 40, tempCold: 4, time: 120,
  })]
  const m = compute(d)
  const rows = m.rows.filter((r) => r.stepId === d.steps[0].id)
  assert.equal(rows.length, 2)
  assert.equal(rows[1].part, 'antisolvent')
  assert.equal(formatVolume(rows[1].volume), '40 mL')

  const n = generateNarrative(d, m)
  assert.ok(
    n.zh.join('').includes('以 EtOAc (20 mL) 於 70 °C 溶解，加入 Hexane (40 mL)，降溫至 4 °C 保持 2 小時，過濾收集晶體'),
    n.zh.join(''),
  )
  assert.ok(n.en.join(' ').includes('recrystallised from EtOAc (20 mL) at 70 °C'), n.en.join(' '))
  assert.ok(n.en.join(' ').includes('the crystals were collected by filtration'), n.en.join(' '))
})

test('column chromatography writes the eluent but is not quantified', () => {
  const d = doc()
  d.steps = [createStep('column', { eluent: [{ solventId: 'EA', parts: 1 }, { solventId: 'HEX', parts: 4 }] })]
  const m = compute(d)
  assert.equal(m.rows.filter((r) => r.stepId === d.steps[0].id).length, 1)
  assert.equal(m.rows[0].compound, null)
  assert.equal(m.solvent.total, null)

  const n = narrate(d)
  assert.ok(n.zh.join('').includes('以 EtOAc/Hexane (1:4) 進行矽膠管柱層析'), n.zh.join(''))
  assert.ok(n.en.join(' ').includes('silica gel column chromatography (EtOAc/hexane, 1:4)'), n.en.join(' '))
})

test('a column gradient is written as a range', () => {
  const d = doc()
  d.steps = [createStep('column', {
    eluent: [{ solventId: 'EA', parts: 1 }, { solventId: 'HEX', parts: 4 }],
    gradient: [1, 1],
  })]
  const n = narrate(d)
  assert.ok(n.zh.join('').includes('(1:4 → 1:1)'), n.zh.join(''))
  assert.ok(n.en.join(' ').includes('1:4 → 1:1'), n.en.join(' '))
})

test('a column without an eluent is flagged', () => {
  const d = doc()
  d.steps = [createStep('column')]
  assert.ok(compute(d).warnings.some((w) => w.code === 'eluent-missing'))
})

test('the theoretical yield uses the product equivalents against the basis', () => {
  const d = doc()
  d.meta.product = { name: 'Dimer', mw: 300, equiv: 0.5 }
  d.steps = [createStep('add', { compoundId: 'A', amount: { mode: 'mass', value: 10 } })]
  const m = compute(d)
  assert.equal(formatAmount(m.theoretical.n), '25.0 mmol')
  assert.equal(formatMass(m.theoretical.mass), '7.5 g')
})

test('a product without equivalents still assumes one', () => {
  const d = doc()
  d.meta.product = { name: 'P', mw: 200 }
  d.steps = [createStep('add', { compoundId: 'A', amount: { mode: 'mass', value: 10 } })]
  const m = compute(d)
  assert.equal(formatAmount(m.theoretical.n), '50.0 mmol')
})

test('the new step fields survive export and re-import', () => {
  const d = doc()
  d.steps = [
    createStep('extract', { solventId: 'EA', solvent2Id: 'HEX', ratio: [1, 3], amount: { mode: 'volume', value: 50 } }),
    createStep('recrystallize', { solventId: 'EA', antisolventId: 'HEX', antisolventVolume: 40, tempHot: 70, tempCold: 4 }),
    createStep('column', { eluent: [{ solventId: 'EA', parts: 1 }], gradient: [3] }),
  ]
  d.meta.product = { name: 'P', mw: 300, equiv: 0.5 }
  const back = normalizeDocument(JSON.parse(serializeDocument(d)))
  assert.deepEqual(back.steps[0].ratio, [1, 3])
  assert.equal(back.steps[1].antisolventVolume, 40)
  assert.deepEqual(back.steps[2].eluent, [{ solventId: 'EA', parts: 1 }])
  assert.deepEqual(back.steps[2].gradient, [3])
  assert.equal(back.meta.product.equiv, 0.5)
})

test('deleting a compound clears co-solvent, antisolvent and eluent references', async () => {
  const { createStore } = await import('../src/state/store.js')
  const { createActions } = await import('../src/state/actions.js')
  const d = doc()
  d.steps = [
    createStep('extract', { solventId: 'EA', solvent2Id: 'HEX', amount: { mode: 'volume', value: 50 } }),
    createStep('recrystallize', { solventId: 'EA', antisolventId: 'HEX' }),
    createStep('column', { eluent: [{ solventId: 'HEX', parts: 1 }] }),
  ]
  const store = createStore(d)
  const actions = createActions(store)
  actions.removeCompound('HEX')
  const steps = store.getState().doc.steps
  assert.equal(steps[0].solvent2Id, null)
  assert.equal(steps[1].antisolventId, null)
  assert.equal(steps[2].eluent[0].solventId, null)
})
