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
  first.branch = { label: 'aqueous layer', steps: [createStep('wash'), createStep('evaporate')] }
  doc.steps = [first, createStep('stir', { temp: 25 })]
  return doc
}

test('export then import is lossless', () => {
  const doc = sampleDoc()
  const again = normalizeDocument(JSON.parse(serializeDocument(doc)))
  assert.equal(serializeDocument(again), serializeDocument(doc))
})

test('normalization fills in missing fields and drops unknown types', () => {
  const doc = normalizeDocument({
    steps: [{ id: 's1', type: 'stir' }, { id: 's2', type: 'alien-step' }],
    compounds: [{ id: 'c1', name: 'X', mw: '150', purity: null }],
  })
  assert.equal(doc.steps.length, 1)
  assert.equal(doc.steps[0].repeat, 1)
  assert.equal(doc.compounds[0].mw, 150)
  assert.equal(doc.compounds[0].purity, 1)
  assert.equal(doc.version, 1)
})

test('normalization keeps unknown fields for round-trips with future versions', () => {
  const doc = normalizeDocument({ steps: [{ id: 's1', type: 'stir', custom: 'keep me' }] })
  assert.equal(doc.steps[0].custom, 'keep me')
})

test('main-axis numbers 1, 2; branch numbers 1.1, 1.2', () => {
  const numbers = numberSteps(sampleDoc().steps)
  assert.deepEqual([...numbers.values()], ['1', '1.1', '1.2', '2'])
})

test('traversal is depth-first and carries depth and branch label', () => {
  const flat = flattenSteps(sampleDoc().steps)
  assert.deepEqual(flat.map((entry) => entry.depth), [0, 1, 1, 0])
  assert.equal(flat[1].branchLabel, 'aqueous layer')
})

test('findStep searches across branches', () => {
  const doc = sampleDoc()
  const target = doc.steps[0].branch.steps[1]
  const hit = findStep(doc, target.id)
  assert.equal(hit.step.type, 'evaporate')
  assert.equal(hit.depth, 1)
})

test('unknown step types cannot be created', () => {
  assert.throws(() => createStep('explode'), /Unknown step type/)
})
