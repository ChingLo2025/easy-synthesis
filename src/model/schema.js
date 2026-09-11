// Data model: construction, normalization, traversal. The whole procedure is the single source of truth; everything else is a projection of it.
import { uid } from './ids.js'
import { STEP_TYPES } from './steps.js'

export const SCHEMA_VERSION = 1

export function createDocument(overrides = {}) {
  return {
    version: SCHEMA_VERSION,
    meta: { title: '', author: '', date: today(), batchNo: '', product: null },
    basis: { compoundId: null, amount: null, unit: 'g' },
    compounds: [],
    steps: [],
    ...overrides,
  }
}

export function today() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function createCompound(overrides = {}) {
  return {
    id: uid('c'),
    name: '',
    cas: '',
    mw: null,
    density: null,
    purity: 1,
    conc: null,
    role: 'reactant',
    ...overrides,
  }
}

const STEP_DEFAULTS = {
  add: () => ({
    compoundId: null,
    amount: { mode: 'equiv', value: 1 },
    addMode: 'once',
    duration: null,
    rate: null,
    tempMax: null,
    vessel: '',
    // Pre-dissolve: { solventId, volume(mL) }; null means added directly
    dissolve: null,
  }),
  stir: () => ({ atm: 'air', temp: null, time: null, rpm: null, special: [], ramp: null, rampRate: null }),
  extract: () => ({
    solventId: null,
    amount: { mode: 'volume', value: null },
    phaseKept: 'organic',
  }),
  wash: () => ({ solventId: null, amount: { mode: 'volume', value: null } }),
  filter: () => ({
    method: 'vacuum',
    kept: 'filtrate',
    solventId: null,
    amount: { mode: 'volume', value: null },
    rinseCount: 1,
  }),
  centrifuge: () => ({ speed: null, speedUnit: 'rpm', time: null, temp: null, kept: 'pellet' }),
  // Concentrate: time is optional; to-dryness is a separate toggle
  evaporate: () => ({ method: 'rotary', temp: null, pressure: null, time: null, toDryness: false }),
  dry: () => ({ method: 'agent', agentId: null, temp: null, time: null }),
  monitor: () => ({ method: 'TLC', interval: null, criteria: '' }),
}

export function createStep(type, overrides = {}) {
  if (!STEP_TYPES[type]) throw new Error(`Unknown step type: ${type}`)
  return {
    id: uid('s'),
    type,
    repeat: 1,
    ...STEP_DEFAULTS[type](),
    note: '',
    freeform: null,
    branch: null,
    ...overrides,
  }
}

export function createBranch(label = '') {
  return { label, steps: [] }
}

// ---------------------------------------------------------------------------
// Traversal: branches form a tree, so recursion is everywhere. It is centralized here; other modules don't recurse on their own.
// ---------------------------------------------------------------------------

/**
 * Depth-first walk over all steps (including branches).
 * visit(step, context) receives context { parent, list, index, depth, path, branchLabel }
 */
export function walkSteps(steps, visit, context = {}) {
  const { depth = 0, path = [], parent = null, branchLabel = null } = context
  steps.forEach((step, index) => {
    const stepPath = [...path, step.id]
    visit(step, { parent, list: steps, index, depth, path: stepPath, branchLabel })
    if (step.branch?.steps?.length) {
      walkSteps(step.branch.steps, visit, {
        depth: depth + 1,
        path: stepPath,
        parent: step,
        branchLabel: step.branch.label,
      })
    }
  })
}

/** Flatten into a linear array, keeping the tree information */
export function flattenSteps(steps) {
  const out = []
  walkSteps(steps, (step, ctx) => out.push({ step, ...ctx }))
  return out
}

export function findStep(doc, stepId) {
  let hit = null
  walkSteps(doc.steps, (step, ctx) => {
    if (step.id === stepId && !hit) hit = { step, ...ctx }
  })
  return hit
}

/** Get the array and index that hold a step, for insert, delete and reorder */
export function locateStep(doc, stepId) {
  const hit = findStep(doc, stepId)
  return hit ? { list: hit.list, index: hit.index, depth: hit.depth, parent: hit.parent } : null
}

export function compoundById(doc, id) {
  return id ? (doc.compounds.find((c) => c.id === id) ?? null) : null
}

/** All compound references in a step (including the pre-dissolve solvent). fn returns the new id; null clears it */
export function mapCompoundRefs(step, fn) {
  for (const field of ['compoundId', 'solventId', 'agentId']) {
    if (step[field]) step[field] = fn(step[field])
  }
  if (step.dissolve?.solventId) step.dissolve.solventId = fn(step.dissolve.solventId)
}

/** Main-axis step numbers (1, 2, 3…); branches are 3.1, 3.2… */
export function numberSteps(steps) {
  const numbers = new Map()
  const assign = (list, prefix) => {
    list.forEach((step, index) => {
      const label = prefix ? `${prefix}.${index + 1}` : String(index + 1)
      numbers.set(step.id, label)
      if (step.branch?.steps?.length) assign(step.branch.steps, label)
    })
  }
  assign(steps, '')
  return numbers
}

// ---------------------------------------------------------------------------
// Normalization: on importing external JSON, fill in fields and drop bad values, but keep unknown fields for round-trip.
// ---------------------------------------------------------------------------

export function normalizeDocument(input) {
  if (!input || typeof input !== 'object') throw new Error('Not a valid JSON object')
  const base = createDocument()
  const doc = {
    ...input,
    version: SCHEMA_VERSION,
    meta: { ...base.meta, ...(input.meta ?? {}) },
    basis: { ...base.basis, ...(input.basis ?? {}) },
    compounds: Array.isArray(input.compounds) ? input.compounds.map(normalizeCompound) : [],
    steps: Array.isArray(input.steps) ? input.steps.map(normalizeStep).filter(Boolean) : [],
  }
  return doc
}

function normalizeCompound(raw) {
  const base = createCompound()
  return {
    ...base,
    ...raw,
    id: raw?.id ?? base.id,
    name: str(raw?.name),
    cas: str(raw?.cas),
    mw: num(raw?.mw),
    density: num(raw?.density),
    purity: num(raw?.purity) ?? 1,
    conc: num(raw?.conc),
    role: raw?.role in ROLE_SET ? raw.role : 'reactant',
  }
}

const ROLE_SET = { reactant: 1, solvent: 1, reagent: 1, catalyst: 1, quench: 1 }

function normalizeStep(raw) {
  if (!raw || !STEP_TYPES[raw.type]) return null
  const base = createStep(raw.type)
  const step = { ...base, ...raw, id: raw.id ?? base.id }
  step.repeat = Math.max(1, Math.round(num(raw.repeat) ?? 1))
  step.note = str(raw.note)
  step.freeform = raw.freeform ? String(raw.freeform) : null
  if (step.amount) {
    step.amount = {
      mode: base.amount?.mode ?? 'equiv',
      ...step.amount,
      value: num(step.amount.value),
    }
  }
  if (Array.isArray(raw.special)) step.special = raw.special.filter((s) => typeof s === 'string')
  if ('dissolve' in step) step.dissolve = normalizeDissolve(raw.dissolve)
  if ('toDryness' in step) step.toDryness = Boolean(step.toDryness)
  if ('ramp' in step) step.ramp = raw.ramp === 'up' || raw.ramp === 'down' ? raw.ramp : null
  if ('rampRate' in step) step.rampRate = num(step.rampRate)
  if ('rinseCount' in step) step.rinseCount = Math.max(1, Math.round(num(raw.rinseCount) ?? 1))
  step.branch = raw.branch
    ? {
        label: str(raw.branch.label),
        steps: Array.isArray(raw.branch.steps) ? raw.branch.steps.map(normalizeStep).filter(Boolean) : [],
      }
    : null
  return step
}

function normalizeDissolve(raw) {
  if (!raw || typeof raw !== 'object') return null
  return { solventId: raw.solventId ?? null, volume: num(raw.volume) }
}

function num(v) {
  if (v === null || v === undefined || v === '') return null
  const parsed = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(parsed) ? parsed : null
}

function str(v) {
  return typeof v === 'string' ? v : ''
}

/** For export: drop undefined and keep key order stable so the round-trip is lossless */
export function serializeDocument(doc) {
  return JSON.stringify(doc, null, 2)
}

export function cloneDocument(doc) {
  return structuredClone(doc)
}
