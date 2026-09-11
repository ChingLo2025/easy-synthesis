import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compute } from '../src/engine/compute.js'
import { generateNarrative } from '../src/ui/narrative.js'
import { createCompound, createDocument, createStep, normalizeDocument, serializeDocument } from '../src/model/schema.js'
import { createStore } from '../src/state/store.js'
import { createActions } from '../src/state/actions.js'
import { expandGroup } from '../src/io/templates.js'
import { formatVolume } from '../src/model/units.js'
import { recallDefaults } from '../src/state/prefs.js'

function doc() {
  const d = createDocument()
  d.compounds = [
    createCompound({ id: 'A', name: '原料 A', nameEn: 'Material A', mw: 200, role: 'reactant' }),
    createCompound({ id: 'THF', name: 'THF', nameEn: 'THF', mw: 72.11, density: 0.889, role: 'solvent' }),
    createCompound({ id: 'EtOH', name: '乙醇', nameEn: 'EtOH', mw: 46.07, density: 0.789, role: 'solvent' }),
  ]
  d.basis = { compoundId: 'A', amount: 10, unit: 'g' }
  return d
}
const narrate = (d) => generateNarrative(d, compute(d))

test('the pre-dissolve solvent gets its own quantity row and counts toward reaction solvent', () => {
  const d = doc()
  d.steps = [createStep('add', { compoundId: 'A', amount: { mode: 'equiv', value: 1 }, dissolve: { solventId: 'THF', volume: 20 } })]
  const m = compute(d)
  const rows = m.rows.filter((row) => row.stepId === d.steps[0].id)
  assert.equal(rows.length, 2)
  assert.equal(rows[1].part, 'dissolve')
  assert.equal(formatVolume(rows[1].volume), '20 mL')
  assert.equal(m.byStep.get(d.steps[0].id).compound.id, 'A')
  assert.equal(formatVolume(m.solvent.reaction), '20 mL')
})

test('the Chinese narrative puts a space between English names and Chinese text', () => {
  const d = doc()
  d.compounds.push(createCompound({ id: 'MG', name: 'MgSO4 (anhydrous)', nameEn: 'MgSO4', role: 'reagent' }))
  d.steps = [
    createStep('add', { compoundId: 'A', amount: { mode: 'mass', value: 10 }, vessel: '250 mL round-bottom flask' }),
    createStep('dry', { method: 'agent', agentId: 'MG' }),
  ]
  const zh = narrate(d).zh.join('')
  assert.ok(zh.includes('於 250 mL round-bottom flask 中加入原料 A'), zh)
  assert.ok(zh.includes('以 MgSO4 (anhydrous) 乾燥後過濾'), zh)
})

test('warns when the pre-dissolve solvent is not set', () => {
  const d = doc()
  d.steps = [createStep('add', { compoundId: 'A', amount: { mode: 'equiv', value: 1 }, dissolve: { solventId: null, volume: 20 } })]
  assert.ok(compute(d).warnings.some((w) => w.code === 'dissolve-solvent'))
})

test('pre-dissolve narrative: zh dissolves then adds dropwise, en "a solution of … in …"', () => {
  const d = doc()
  d.steps = [createStep('add', {
    compoundId: 'A', amount: { mode: 'mass', value: 10 }, dissolve: { solventId: 'THF', volume: 20 },
    addMode: 'dropwise', duration: 30,
  })]
  const n = narrate(d)
  assert.match(n.zh.join(''), /將原料 A \(10\.0 g, 50\.0 mmol, 1\.0 eq\) 溶於 THF \(20 mL\) 後緩慢滴入，滴加時間 30 分鐘/)
  assert.match(n.en.join(' '), /A solution of Material A \(10\.0 g, 50\.0 mmol, 1\.0 eq\) in THF \(20 mL\) was added dropwise over 30 min/)
})

test('a pre-dissolved addition does not merge with the previous addition', () => {
  const d = doc()
  d.steps = [
    createStep('add', { compoundId: 'THF', amount: { mode: 'volume', value: 50 } }),
    createStep('add', { compoundId: 'A', amount: { mode: 'mass', value: 10 }, dissolve: { solventId: 'THF', volume: 20 } }),
  ]
  assert.doesNotMatch(narrate(d).zh.join(''), /與/)
})

test('slow heating: Chinese and English', () => {
  const d = doc()
  d.steps = [createStep('stir', { atm: 'N2', temp: 80, time: 120, ramp: 'up', rampRate: 2 })]
  const n = narrate(d)
  assert.match(n.zh.join(''), /於 N₂ 下緩慢升溫至 80 °C（2 °C\/min），攪拌 2 小時/)
  assert.match(n.en.join(' '), /slowly heated to 80 °C \(2 °C\/min\) under nitrogen and stirred for 2 h/)
})

test('slow cooling without a rate omits the parentheses', () => {
  const d = doc()
  d.steps = [createStep('stir', { temp: 0, time: 60, ramp: 'down' })]
  const n = narrate(d)
  assert.match(n.zh.join(''), /緩慢降溫至 0 °C，攪拌 1 小時/)
  assert.match(n.en.join(' '), /slowly cooled to 0 °C and stirred for 1 h/)
})

test('filtration without a rinse does not warn about a missing compound', () => {
  const d = doc()
  d.steps = [createStep('filter', { method: 'celite', kept: 'filtrate' })]
  assert.ok(!compute(d).warnings.some((w) => w.stepId === d.steps[0].id))
  assert.match(narrate(d).zh.join(''), /經矽藻土墊過濾，收集濾液。/)
})

test('the filter cake rinse counts toward the total by number of rinses', () => {
  const d = doc()
  d.steps = [createStep('filter', { method: 'vacuum', kept: 'solid', solventId: 'EtOH', amount: { mode: 'volume', value: 10 }, rinseCount: 2 })]
  assert.equal(formatVolume(compute(d).solvent.total), '20 mL')
  const n = narrate(d)
  assert.match(n.zh.join(''), /抽氣過濾，濾餅以乙醇 \(10 mL x 2\) 洗滌，收集濾餅。/)
  assert.match(n.en.join(' '), /filter cake was washed with EtOH \(10 mL x 2\)/)
})

test('centrifugation: speed, time, temperature and kept phase', () => {
  const d = doc()
  d.steps = [createStep('centrifuge', { speed: 4000, speedUnit: 'rpm', time: 10, temp: 4, kept: 'pellet' })]
  const n = narrate(d)
  assert.match(n.zh.join(''), /以 4000 rpm 離心 10 分鐘（4 °C），收集沉澱。/)
  assert.match(n.en.join(' '), /centrifuged at 4000 rpm for 10 min at 4 °C, and the pellet was collected/)
})

test('centrifugation in × g, keeping the supernatant', () => {
  const d = doc()
  d.steps = [createStep('centrifuge', { speed: 3000, speedUnit: 'g', time: 5, kept: 'supernatant' })]
  assert.match(narrate(d).zh.join(''), /以 3000 × g 離心 5 分鐘，收集上清液。/)
})

test('new fields survive export and re-import', () => {
  const d = doc()
  d.steps = [
    createStep('add', { compoundId: 'A', dissolve: { solventId: 'THF', volume: 20 } }),
    createStep('stir', { ramp: 'down', rampRate: 1 }),
    createStep('filter', { solventId: 'EtOH', rinseCount: 3 }),
    createStep('centrifuge', { speed: 4000 }),
  ]
  const again = normalizeDocument(JSON.parse(serializeDocument(d)))
  assert.equal(serializeDocument(again), serializeDocument(d))
})

test('deleting a compound also clears the pre-dissolve solvent reference', () => {
  const store = createStore(doc())
  const actions = createActions(store)
  actions.addStep('add')
  const id = store.getState().doc.steps[0].id
  actions.updateStep(id, { dissolve: { solventId: 'THF', volume: 20 } })
  actions.removeCompound('THF')
  assert.equal(store.getState().doc.steps[0].dissolve.solventId, null)
})

test('expanding a step group remaps the pre-dissolve solvent to compounds in this document', () => {
  const entry = {
    steps: [createStep('add', { compoundId: 'x1', dissolve: { solventId: 'x2', volume: 5 } })],
    compounds: [{ id: 'x1', name: '原料 A', cas: '' }, { id: 'x2', name: 'THF', cas: '' }],
  }
  const { steps, compounds } = expandGroup(entry, doc())
  assert.equal(compounds.length, 0)
  assert.equal(steps[0].compoundId, 'A')
  assert.equal(steps[0].dissolve.solventId, 'THF')
})

test('slow heating under vacuum also mentions reduced pressure in Chinese', () => {
  const d = doc()
  d.steps = [createStep('stir', { ramp: 'up', temp: 80, rampRate: 2, special: ['vacuum'], time: 60 })]
  assert.match(narrate(d).zh.join(''), /緩慢升溫至 80 °C（2 °C\/min），攪拌 1 小時（減壓）/)
})

test('sealed tube, sonication and rpm are not dropped from the Chinese narrative', () => {
  const d = doc()
  d.steps = [createStep('stir', { temp: 80, time: 120, rpm: 300, special: ['sealed', 'sonication'] })]
  assert.match(narrate(d).zh.join(''), /於封管中 80 °C 攪拌 2 小時（超音波輔助，300 rpm）/)
})

test('remembered pre-dissolve settings are a copy: deleting a compound later does not change them', () => {
  const store = createStore(doc())
  const actions = createActions(store)
  actions.addStep('add')
  const id = store.getState().doc.steps[0].id
  actions.updateStep(id, { compoundId: 'A', dissolve: { solventId: 'THF', volume: 20 } })
  actions.removeCompound('THF')
  assert.equal(recallDefaults('add', 'A').dissolve.solventId, 'THF')
})

test('Celite filtration with a cake rinse says the filtrates are combined', () => {
  const d = doc()
  d.steps = [createStep('filter', { method: 'celite', kept: 'filtrate', solventId: 'EtOH', amount: { mode: 'volume', value: 10 }, rinseCount: 2 })]
  assert.match(narrate(d).zh.join(''), /經矽藻土墊過濾，濾餅以乙醇 \(10 mL x 2\) 洗滌，合併濾液。/)
})

test('concentration without time or to-dryness just says concentrated', () => {
  const d = doc()
  d.steps = [createStep('evaporate', { method: 'rotary', temp: 40, pressure: 80 })]
  const n = narrate(d)
  assert.match(n.zh.join(''), /以旋轉濃縮（40 °C，80 mbar）移除溶劑。/)
  assert.match(n.en.join(' '), /mixture was concentrated by rotary evaporation \(40 °C, 80 mbar\)/)
})

test('concentration with a time states the fixed time', () => {
  const d = doc()
  d.steps = [createStep('evaporate', { method: 'vacuum', temp: 40, time: 30 })]
  const n = narrate(d)
  assert.match(n.zh.join(''), /以真空濃縮（40 °C，30 分鐘）移除溶劑。/)
  assert.match(n.en.join(' '), /concentrated by evaporation under vacuum \(40 °C, 30 min\)/)
})

test('to dryness is written only when checked', () => {
  const d = doc()
  d.steps = [createStep('evaporate', { method: 'rotary', temp: 40, toDryness: true })]
  const n = narrate(d)
  assert.match(n.zh.join(''), /以旋轉濃縮（40 °C）移除溶劑至乾。/)
  assert.match(n.en.join(' '), /concentrated to dryness by rotary evaporation \(40 °C\)/)
})
