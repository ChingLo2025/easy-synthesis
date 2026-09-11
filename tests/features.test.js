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

test('預溶溶劑另列一行計量，並計入反應槽溶劑', () => {
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

test('預溶未指定溶劑時提醒', () => {
  const d = doc()
  d.steps = [createStep('add', { compoundId: 'A', amount: { mode: 'equiv', value: 1 }, dissolve: { solventId: null, volume: 20 } })]
  assert.ok(compute(d).warnings.some((w) => w.code === 'dissolve-solvent'))
})

test('預溶的敘述：中文「溶於…後緩慢滴入」，英文「a solution of … in …」', () => {
  const d = doc()
  d.steps = [createStep('add', {
    compoundId: 'A', amount: { mode: 'mass', value: 10 }, dissolve: { solventId: 'THF', volume: 20 },
    addMode: 'dropwise', duration: 30,
  })]
  const n = narrate(d)
  assert.match(n.zh.join(''), /將原料 A \(10\.0 g, 50\.0 mmol, 1\.0 eq\) 溶於 THF \(20 mL\) 後緩慢滴入，滴加時間 30 分鐘/)
  assert.match(n.en.join(' '), /A solution of Material A \(10\.0 g, 50\.0 mmol, 1\.0 eq\) in THF \(20 mL\) was added dropwise over 30 min/)
})

test('預溶的加料步驟不與前一個加料合併成「與」', () => {
  const d = doc()
  d.steps = [
    createStep('add', { compoundId: 'THF', amount: { mode: 'volume', value: 50 } }),
    createStep('add', { compoundId: 'A', amount: { mode: 'mass', value: 10 }, dissolve: { solventId: 'THF', volume: 20 } }),
  ]
  assert.doesNotMatch(narrate(d).zh.join(''), /與/)
})

test('緩慢升溫：中文與英文', () => {
  const d = doc()
  d.steps = [createStep('stir', { atm: 'N2', temp: 80, time: 120, ramp: 'up', rampRate: 2 })]
  const n = narrate(d)
  assert.match(n.zh.join(''), /於 N₂ 下緩慢升溫至 80 °C（2 °C\/min），攪拌 2 小時/)
  assert.match(n.en.join(' '), /slowly heated to 80 °C \(2 °C\/min\) under nitrogen and stirred for 2 h/)
})

test('緩慢降溫沒填速率時省略括號', () => {
  const d = doc()
  d.steps = [createStep('stir', { temp: 0, time: 60, ramp: 'down' })]
  const n = narrate(d)
  assert.match(n.zh.join(''), /緩慢降溫至 0 °C，攪拌 1 小時/)
  assert.match(n.en.join(' '), /slowly cooled to 0 °C and stirred for 1 h/)
})

test('過濾不填洗液也不提醒缺化合物', () => {
  const d = doc()
  d.steps = [createStep('filter', { method: 'celite', kept: 'filtrate' })]
  assert.ok(!compute(d).warnings.some((w) => w.stepId === d.steps[0].id))
  assert.match(narrate(d).zh.join(''), /經矽藻土墊過濾，收集濾液。/)
})

test('過濾的濾餅洗液依洗滌次數計入總量', () => {
  const d = doc()
  d.steps = [createStep('filter', { method: 'vacuum', kept: 'solid', solventId: 'EtOH', amount: { mode: 'volume', value: 10 }, rinseCount: 2 })]
  assert.equal(formatVolume(compute(d).solvent.total), '20 mL')
  const n = narrate(d)
  assert.match(n.zh.join(''), /抽氣過濾，濾餅以乙醇 \(10 mL x 2\) 洗滌，收集濾餅。/)
  assert.match(n.en.join(' '), /filter cake was washed with EtOH \(10 mL x 2\)/)
})

test('離心：轉速、時間、溫度與保留相', () => {
  const d = doc()
  d.steps = [createStep('centrifuge', { speed: 4000, speedUnit: 'rpm', time: 10, temp: 4, kept: 'pellet' })]
  const n = narrate(d)
  assert.match(n.zh.join(''), /以 4000 rpm 離心 10 分鐘（4 °C），收集沉澱。/)
  assert.match(n.en.join(' '), /centrifuged at 4000 rpm for 10 min at 4 °C, and the pellet was collected/)
})

test('離心以 ×g 表示、保留上清液', () => {
  const d = doc()
  d.steps = [createStep('centrifuge', { speed: 3000, speedUnit: 'g', time: 5, kept: 'supernatant' })]
  assert.match(narrate(d).zh.join(''), /以 3000 × g 離心 5 分鐘，收集上清液。/)
})

test('新欄位匯出再匯入不失真', () => {
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

test('刪除化合物也會清掉預溶溶劑的參照', () => {
  const store = createStore(doc())
  const actions = createActions(store)
  actions.addStep('add')
  const id = store.getState().doc.steps[0].id
  actions.updateStep(id, { dissolve: { solventId: 'THF', volume: 20 } })
  actions.removeCompound('THF')
  assert.equal(store.getState().doc.steps[0].dissolve.solventId, null)
})

test('步驟群組展開時，預溶溶劑也重新對應到本文件的化合物', () => {
  const entry = {
    steps: [createStep('add', { compoundId: 'x1', dissolve: { solventId: 'x2', volume: 5 } })],
    compounds: [{ id: 'x1', name: '原料 A', cas: '' }, { id: 'x2', name: 'THF', cas: '' }],
  }
  const { steps, compounds } = expandGroup(entry, doc())
  assert.equal(compounds.length, 0)
  assert.equal(steps[0].compoundId, 'A')
  assert.equal(steps[0].dissolve.solventId, 'THF')
})

test('緩慢升溫搭配減壓時，中文也要寫出減壓', () => {
  const d = doc()
  d.steps = [createStep('stir', { ramp: 'up', temp: 80, rampRate: 2, special: ['vacuum'], time: 60 })]
  assert.match(narrate(d).zh.join(''), /緩慢升溫至 80 °C（2 °C\/min），攪拌 1 小時（減壓）/)
})

test('封管、超音波與轉速在中文敘述中不會漏掉', () => {
  const d = doc()
  d.steps = [createStep('stir', { temp: 80, time: 120, rpm: 300, special: ['sealed', 'sonication'] })]
  assert.match(narrate(d).zh.join(''), /於封管中 80 °C 攪拌 2 小時（超音波輔助，300 rpm）/)
})

test('記住的預溶設定是複本：之後刪除化合物不會改到它', () => {
  const store = createStore(doc())
  const actions = createActions(store)
  actions.addStep('add')
  const id = store.getState().doc.steps[0].id
  actions.updateStep(id, { compoundId: 'A', dissolve: { solventId: 'THF', volume: 20 } })
  actions.removeCompound('THF')
  assert.equal(recallDefaults('add', 'A').dissolve.solventId, 'THF')
})

test('矽藻土過濾並洗滌濾餅時，敘述寫「合併濾液」', () => {
  const d = doc()
  d.steps = [createStep('filter', { method: 'celite', kept: 'filtrate', solventId: 'EtOH', amount: { mode: 'volume', value: 10 }, rinseCount: 2 })]
  assert.match(narrate(d).zh.join(''), /經矽藻土墊過濾，濾餅以乙醇 \(10 mL x 2\) 洗滌，合併濾液。/)
})

test('濃縮沒填時間也沒勾至乾：只寫濃縮', () => {
  const d = doc()
  d.steps = [createStep('evaporate', { method: 'rotary', temp: 40, pressure: 80 })]
  const n = narrate(d)
  assert.match(n.zh.join(''), /以旋轉濃縮（40 °C，80 mbar）移除溶劑。/)
  assert.match(n.en.join(' '), /mixture was concentrated by rotary evaporation \(40 °C, 80 mbar\)/)
})

test('濃縮填了時間就寫出固定時間', () => {
  const d = doc()
  d.steps = [createStep('evaporate', { method: 'vacuum', temp: 40, time: 30 })]
  const n = narrate(d)
  assert.match(n.zh.join(''), /以真空濃縮（40 °C，30 分鐘）移除溶劑。/)
  assert.match(n.en.join(' '), /concentrated by evaporation under vacuum \(40 °C, 30 min\)/)
})

test('勾選至乾才寫 to dryness', () => {
  const d = doc()
  d.steps = [createStep('evaporate', { method: 'rotary', temp: 40, toDryness: true })]
  const n = narrate(d)
  assert.match(n.zh.join(''), /以旋轉濃縮（40 °C）移除溶劑至乾。/)
  assert.match(n.en.join(' '), /concentrated to dryness by rotary evaporation \(40 °C\)/)
})
