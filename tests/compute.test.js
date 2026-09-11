import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compute } from '../src/engine/compute.js'
import { createCompound, createDocument, createStep } from '../src/model/schema.js'
import { formatAmount, formatMass, formatVolume } from '../src/model/units.js'

const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `${actual} vs ${expected}: difference too large`)

function baseDoc(overrides = {}) {
  const doc = createDocument()
  doc.compounds = [
    createCompound({ id: 'SM', name: 'SM', mw: 200, purity: 0.98, role: 'reactant' }),
    createCompound({ id: 'SOL', name: 'Solvent', mw: 100, density: 1.25, role: 'solvent' }),
    createCompound({ id: 'AQ', name: '1 N HCl', mw: 36.46, density: 1.02, conc: 1, role: 'quench' }),
  ]
  doc.basis = { compoundId: 'SM', amount: 10, unit: 'g' }
  return { ...doc, ...overrides }
}

test('n = m x purity / MW', () => {
  const doc = baseDoc()
  doc.steps = [createStep('add', { compoundId: 'SM', amount: { mode: 'mass', value: 10 } })]
  const { rows, basis } = compute(doc)
  close(basis.n, (0.01 * 0.98) / 0.2)
  close(rows[0].n, 0.049)
  assert.equal(rows[0].equiv, 1)
})

test('equivalents use the basis as denominator and back-calculate mass', () => {
  const doc = baseDoc()
  doc.compounds.push(createCompound({ id: 'R', name: 'R', mw: 150, purity: 1, role: 'reagent' }))
  doc.steps = [createStep('add', { compoundId: 'R', amount: { mode: 'equiv', value: 1.5 } })]
  const { rows } = compute(doc)
  close(rows[0].n, 0.049 * 1.5)
  close(rows[0].mass, 0.049 * 1.5 * 0.15)
  assert.equal(formatMass(rows[0].mass), '11.0 g')
})

test('mol% equals equivalents divided by one hundred', () => {
  const doc = baseDoc()
  doc.compounds.push(createCompound({ id: 'CAT', name: 'Pd', mw: 106.4, role: 'catalyst' }))
  doc.steps = [createStep('add', { compoundId: 'CAT', amount: { mode: 'mol%', value: 5 } })]
  const { rows } = compute(doc)
  close(rows[0].equiv, 0.05)
})

test('neat liquid V = m / rho; volume-driven rows back-calculate mass', () => {
  const doc = baseDoc()
  doc.steps = [createStep('add', { compoundId: 'SOL', amount: { mode: 'volume', value: 40 } })]
  const { rows } = compute(doc)
  close(rows[0].mass, 4e-5 * 1250)
  assert.equal(formatVolume(rows[0].volume), '40 mL')
})

test('solution n = C x V', () => {
  const doc = baseDoc()
  doc.steps = [createStep('add', { compoundId: 'AQ', amount: { mode: 'volume', value: 25 } })]
  const { rows } = compute(doc)
  close(rows[0].n, 0.025)
  assert.equal(formatAmount(rows[0].n), '25.0 mmol')
})

test('V/W converts solvent volume from the basis mass', () => {
  const doc = baseDoc()
  doc.steps = [createStep('add', { compoundId: 'SOL', amount: { mode: 'vol_per_g', value: 5 } })]
  const { rows } = compute(doc)
  assert.equal(formatVolume(rows[0].volume), '50 mL')
})

test('repeat repeats N times as is; total = N x single amount', () => {
  const doc = baseDoc()
  doc.steps = [createStep('wash', { solventId: 'SOL', amount: { mode: 'volume', value: 20 }, repeat: 3 })]
  const { rows } = compute(doc)
  close(rows[0].volume, 2e-5)
  close(rows[0].totalVolume, 6e-5)
})

test('total solvent splits into reaction vessel and whole process', () => {
  const doc = baseDoc()
  doc.steps = [
    createStep('add', { compoundId: 'SOL', amount: { mode: 'volume', value: 50 } }),
    createStep('wash', { solventId: 'SOL', amount: { mode: 'volume', value: 20 }, repeat: 2 }),
  ]
  const { solvent } = compute(doc)
  assert.equal(formatVolume(solvent.reaction), '50 mL')
  assert.equal(formatVolume(solvent.total), '90 mL')
})

test('theoretical yield is capped by basis moles; mass only with a product MW', () => {
  const doc = baseDoc()
  const withoutProduct = compute(doc)
  assert.equal(withoutProduct.theoretical.mass, null)
  doc.meta.product = { name: 'P', mw: 300 }
  const withProduct = compute(doc)
  close(withProduct.theoretical.mass, 0.049 * 0.3)
})

test('freeform steps are excluded from quantities', () => {
  const doc = baseDoc()
  doc.steps = [createStep('add', {
    compoundId: 'SM', amount: { mode: 'mass', value: 10 }, freeform: 'custom description',
  })]
  const { rows } = compute(doc)
  assert.equal(rows[0].n, null)
  assert.equal(rows[0].freeform, true)
})

test('a missing basis gives an error, a missing MW gives a warning', () => {
  const doc = createDocument()
  doc.compounds = [createCompound({ id: 'X', name: 'X', role: 'reactant' })]
  doc.steps = [createStep('add', { compoundId: 'X', amount: { mode: 'mass', value: 1 } })]
  const { warnings } = compute(doc)
  assert.ok(warnings.some((w) => w.code === 'basis-missing' && w.level === 'error'))
  assert.ok(warnings.some((w) => w.code === 'incomplete'))
})

test('branch steps are included, with a warning at the depth limit', () => {
  const doc = baseDoc()
  const outer = createStep('extract', { solventId: 'SOL', amount: { mode: 'volume', value: 30 } })
  const inner = createStep('wash', { solventId: 'SOL', amount: { mode: 'volume', value: 10 } })
  inner.branch = { label: 'second level', steps: [createStep('evaporate')] }
  outer.branch = { label: 'aqueous layer', steps: [inner] }
  doc.steps = [outer]
  const { rows, warnings } = compute(doc)
  assert.equal(rows.length, 3)
  assert.equal(rows[1].branchLabel, 'aqueous layer')
  assert.ok(warnings.some((w) => w.code === 'depth'))
})

test('the basis can be expressed as volume or moles', () => {
  const doc = baseDoc()
  doc.basis = { compoundId: 'SOL', amount: 10, unit: 'mL' }
  close(compute(doc).basis.n, (1e-5 * 1250) / 0.1)
  doc.basis = { compoundId: 'SM', amount: 25, unit: 'mmol' }
  close(compute(doc).basis.n, 0.025)
})
