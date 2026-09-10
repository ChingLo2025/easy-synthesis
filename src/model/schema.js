// 資料模型：建構、正規化、走訪。整份程序是唯一資料來源，其餘皆為它的投影。
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
  }),
  stir: () => ({ atm: 'air', temp: null, time: null, rpm: null, special: [] }),
  extract: () => ({
    solventId: null,
    amount: { mode: 'volume', value: null },
    phaseKept: 'organic',
  }),
  wash: () => ({ solventId: null, amount: { mode: 'volume', value: null } }),
  evaporate: () => ({ method: 'rotary', temp: null, pressure: null }),
  dry: () => ({ method: 'agent', agentId: null, temp: null, time: null }),
  monitor: () => ({ method: 'TLC', interval: null, criteria: '' }),
}

export function createStep(type, overrides = {}) {
  if (!STEP_TYPES[type]) throw new Error(`未知步驟型別：${type}`)
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
// 走訪：分歧是樹，處處遞迴。以下集中處理，其餘模組不自行遞迴。
// ---------------------------------------------------------------------------

/**
 * 深度優先走訪所有步驟（含分支）。
 * visit(step, context) 的 context 為 { parent, list, index, depth, path, branchLabel }
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

/** 攤平為線性陣列，保留樹狀資訊 */
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

/** 取得某步驟所在的陣列與索引，供增刪與排序使用 */
export function locateStep(doc, stepId) {
  const hit = findStep(doc, stepId)
  return hit ? { list: hit.list, index: hit.index, depth: hit.depth, parent: hit.parent } : null
}

export function compoundById(doc, id) {
  return id ? (doc.compounds.find((c) => c.id === id) ?? null) : null
}

/** 主軸步驟編號（1, 2, 3…），分支則為 3.1, 3.2… */
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
// 正規化：匯入外部 JSON 時補齊欄位、剔除壞值，但保留未知欄位以維持 round-trip。
// ---------------------------------------------------------------------------

export function normalizeDocument(input) {
  if (!input || typeof input !== 'object') throw new Error('不是有效的 JSON 物件')
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
  step.branch = raw.branch
    ? {
        label: str(raw.branch.label),
        steps: Array.isArray(raw.branch.steps) ? raw.branch.steps.map(normalizeStep).filter(Boolean) : [],
      }
    : null
  return step
}

function num(v) {
  if (v === null || v === undefined || v === '') return null
  const parsed = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(parsed) ? parsed : null
}

function str(v) {
  return typeof v === 'string' ? v : ''
}

/** 匯出用：移除 undefined，保持鍵序穩定，round-trip 不失真 */
export function serializeDocument(doc) {
  return JSON.stringify(doc, null, 2)
}

export function cloneDocument(doc) {
  return structuredClone(doc)
}
