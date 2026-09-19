import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nodeDetail } from '../src/ui/flow.js'
import { stepSummary } from '../src/ui/summary.js'
import { docMetaItems } from '../src/ui/document.js'
import { quantityGroups } from '../src/ui/metrics.js'
import { createStep } from '../src/model/schema.js'

test('the flow node for a dropwise addition shows addition time, rate and max temperature', () => {
  const step = createStep('add', { addMode: 'dropwise', duration: 30, rate: 1.5, tempMax: 5, vessel: '250 mL flask' })
  assert.equal(nodeDetail(step, null, null), 'Dropwise over 30 min · 1.5 mL/min · below 5 °C · 250 mL flask')
})

test('the flow node for a dropwise addition without conditions just says dropwise', () => {
  const step = createStep('add', { addMode: 'dropwise' })
  assert.equal(nodeDetail(step, null, null), 'Dropwise')
})

test('the flow node for a pre-dissolved addition says so', () => {
  const step = createStep('add', { dissolve: { solventId: 'THF', volume: 20 } })
  assert.equal(nodeDetail(step, null, null), 'Pre-dissolved')
})

test('the card summary for a dropwise addition lists the same conditions', () => {
  const step = createStep('add', { addMode: 'dropwise', duration: 30, rate: 1.5, tempMax: 5 })
  assert.equal(stepSummary(step, null, null), 'Dropwise over 30 min · 1.5 mL/min · below 5 °C')
})

test('each role group in the quantities table can be hidden on its own', () => {
  const metrics = { groups: [{ role: 'reactant', rows: [1] }, { role: 'solvent', rows: [1, 2] }] }
  const groups = quantityGroups(metrics, { 'role-solvent': true })
  assert.deepEqual(groups.map((group) => [group.id, group.open]), [['role-reactant', true], ['role-solvent', false]])
  assert.equal(groups[1].rows.length, 2)
})

test('the document header lists batch, date and operator once, keeping empty ones as blanks', () => {
  assert.deepEqual(docMetaItems({ batchNo: 'B-001', date: '2026-09-14', author: '' }), [
    ['Batch', 'B-001'],
    ['Date', '2026-09-14'],
    ['Operator', ''],
  ])
})
