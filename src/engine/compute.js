// 計算引擎。純函數：(procedure) => (table, warnings)。每次變更全量重算，不做增量。
//
//   n = m x purity / MW        m = n x MW / purity
//   V = m / rho                純液體
//   n = C x V                  溶液
//   equiv_i = n_i / n_basis
//
// 驅動欄位規則：每個化合物在每個步驟只有一個驅動欄位（amount.mode），
// 其餘為推導值。不實作通用約束求解器。
import { flattenSteps, numberSteps, compoundById } from '../model/schema.js'
import { STEP_TYPES, MAX_BRANCH_DEPTH, ROLE_ORDER } from '../model/steps.js'
import { concToSI, densityToSI, dimensionOf, gToKg, isNum, mwToSI, toSI } from '../model/units.js'

export const WARN = { error: 'error', warn: 'warn', info: 'info' }

export function compute(doc) {
  const warnings = []
  const numbers = numberSteps(doc.steps)
  const basis = resolveBasis(doc, warnings)
  const rows = []

  for (const entry of flattenSteps(doc.steps)) {
    const { step, depth, branchLabel } = entry
    if (depth >= MAX_BRANCH_DEPTH) {
      pushOnce(warnings, {
        level: WARN.warn,
        stepId: step.id,
        code: 'depth',
        message: `分歧深度已達 ${depth} 層，建議改為另開一份程序。`,
      })
    }
    const number = numbers.get(step.id)
    const row = buildRow({ doc, step, depth, branchLabel, number, basis, warnings })
    rows.push(row)
    const dissolve = dissolveRow({ doc, step, row, number, basis, warnings })
    if (dissolve) {
      row.dissolve = dissolve
      rows.push(dissolve)
    }
  }

  // 預溶溶劑是附屬列；步驟本身仍對應主列
  const byStep = new Map(rows.filter((row) => !row.part).map((row) => [row.stepId, row]))
  return {
    basis,
    rows,
    byStep,
    groups: groupByRole(rows),
    solvent: solventTotals(rows),
    theoretical: theoreticalYield(doc, basis),
    warnings: warnings.sort(byLevel),
  }
}

// ---------------------------------------------------------------------------
// 基準
// ---------------------------------------------------------------------------

function resolveBasis(doc, warnings) {
  const empty = { compound: null, n: null, mass: null, volume: null, ok: false }
  const compound = compoundById(doc, doc.basis?.compoundId)
  if (!compound) {
    warnings.push({ level: WARN.error, code: 'basis-missing', message: '尚未設定限量試劑與基準量，當量無法計算。' })
    return empty
  }
  const { amount, unit } = doc.basis
  if (!isNum(amount) || amount <= 0) {
    warnings.push({ level: WARN.error, code: 'basis-amount', message: `基準物 ${label(compound)} 尚未填入基準量。` })
    return { ...empty, compound }
  }

  const si = toSI(amount, unit)
  const dim = dimensionOf(unit)
  const props = properties(compound)
  const quantity = { n: null, mass: null, volume: null }

  if (dim === 'amount') {
    quantity.n = si
    quantity.mass = massFromAmount(si, props)
    quantity.volume = volumeFrom(quantity, props)
  } else if (dim === 'mass') {
    quantity.mass = si
    quantity.n = amountFromMass(si, props)
    quantity.volume = volumeFrom(quantity, props)
  } else if (dim === 'volume') {
    quantity.volume = si
    quantity.mass = props.density ? si * props.density : null
    quantity.n = props.conc ? props.conc * si : amountFromMass(quantity.mass, props)
  }

  if (!isNum(quantity.n)) {
    warnings.push({
      level: WARN.error,
      code: 'basis-mol',
      message: `無法由基準量推算 ${label(compound)} 的莫耳數，請補上${missingProp(props, unit)}。`,
    })
  }
  return { compound, ...quantity, ok: isNum(quantity.n) && quantity.n > 0 }
}

// ---------------------------------------------------------------------------
// 每步驟一列
// ---------------------------------------------------------------------------

function buildRow({ doc, step, depth, branchLabel, number, basis, warnings }) {
  const meta = STEP_TYPES[step.type]
  const field = meta.compoundField
  const compound = field ? compoundById(doc, step[field]) : null
  // 過濾的濾餅洗液按洗滌次數計量
  const portions = step.type === 'filter' ? Math.max(1, Math.round(step.rinseCount ?? 1)) : 1
  const repeat = Math.max(1, Math.round(step.repeat ?? 1)) * portions

  const row = {
    stepId: step.id,
    number,
    type: step.type,
    depth,
    branchLabel,
    repeat,
    compound,
    role: compound?.role ?? null,
    driver: step.amount?.mode ?? null,
    freeform: Boolean(step.freeform),
    n: null,
    mass: null,
    volume: null,
    equiv: null,
    totalN: null,
    totalMass: null,
    totalVolume: null,
    incomplete: [],
  }

  if (step.freeform) return row // 取代型手動輸入不參與計量

  // 取樣間隔為必填（§3）
  if (step.type === 'monitor' && !isNum(step.interval)) {
    warnings.push({
      level: WARN.warn,
      stepId: step.id,
      code: 'monitor-interval',
      message: `步驟 ${number}（取樣／追蹤）尚未填取樣間隔。`,
    })
  }

  if (!field) return row

  if (!compound) {
    const optional = meta.compoundOptional || (step.type === 'dry' && step.method !== 'agent')
    if (!optional) {
      warnings.push({
        level: WARN.warn,
        stepId: step.id,
        code: 'compound-missing',
        message: `步驟 ${number}（${meta.label}）尚未指定化合物。`,
      })
    }
    return row
  }

  const props = properties(compound)
  const quantity = quantify(step.amount, props, basis)
  Object.assign(row, quantity.value)
  row.equiv = basis.ok && isNum(row.n) ? row.n / basis.n : null
  row.incomplete = quantity.missing

  if (quantity.missing.length) {
    warnings.push({
      level: WARN.warn,
      stepId: step.id,
      code: 'incomplete',
      message: `步驟 ${number} ${label(compound)}：${quantity.missing.join('、')}。`,
    })
  }

  row.totalN = scale(row.n, repeat)
  row.totalMass = scale(row.mass, repeat)
  row.totalVolume = scale(row.volume, repeat)
  return row
}

/** 預溶溶劑：跟著加料一起進反應槽，另列一行計量並計入溶劑總量 */
function dissolveRow({ doc, step, row, number, basis, warnings }) {
  if (step.type !== 'add' || !step.dissolve || step.freeform) return null
  const solvent = compoundById(doc, step.dissolve.solventId)
  if (!solvent) {
    warnings.push({ level: WARN.warn, stepId: step.id, code: 'dissolve-solvent', message: `步驟 ${number}：尚未指定預溶溶劑。` })
    return null
  }
  if (!isNum(step.dissolve.volume)) {
    warnings.push({ level: WARN.warn, stepId: step.id, code: 'dissolve-volume', message: `步驟 ${number}：尚未填預溶溶劑體積。` })
  }
  const quantity = quantify({ mode: 'volume', value: step.dissolve.volume }, properties(solvent), basis)
  const { n, mass, volume } = quantity.value
  return {
    stepId: step.id,
    part: 'dissolve',
    number,
    type: step.type,
    depth: row.depth,
    branchLabel: row.branchLabel,
    repeat: row.repeat,
    compound: solvent,
    role: solvent.role,
    driver: 'volume',
    freeform: false,
    n,
    mass,
    volume,
    equiv: basis.ok && isNum(n) ? n / basis.n : null,
    totalN: scale(n, row.repeat),
    totalMass: scale(mass, row.repeat),
    totalVolume: scale(volume, row.repeat),
    incomplete: quantity.missing,
  }
}

/** 由驅動欄位推導其餘三欄 */
function quantify(amount, props, basis) {
  const missing = []
  const value = { n: null, mass: null, volume: null }
  if (!amount || !isNum(amount.value)) return { value, missing }

  switch (amount.mode) {
    case 'mass': {
      value.mass = gToKg(amount.value)
      value.n = amountFromMass(value.mass, props, missing)
      value.volume = volumeFrom(value, props)
      break
    }
    case 'volume': {
      value.volume = toSI(amount.value, 'mL')
      if (props.conc) {
        value.n = props.conc * value.volume
        value.mass = props.density ? value.volume * props.density : null
      } else if (props.density) {
        value.mass = value.volume * props.density
        value.n = amountFromMass(value.mass, props, missing)
      } else {
        missing.push('缺少密度或濃度，無法由體積推算質量')
      }
      break
    }
    case 'equiv':
    case 'mol%': {
      const factor = amount.mode === 'equiv' ? amount.value : amount.value / 100
      if (!basis.ok) {
        missing.push('基準量未定，當量無法換算')
        break
      }
      value.n = factor * basis.n
      value.mass = massFromAmount(value.n, props, missing)
      value.volume = volumeFrom(value, props)
      break
    }
    case 'vol_per_g': {
      if (!isNum(basis.mass)) {
        missing.push('基準物質量未知，V/W 無法換算')
        break
      }
      const grams = basis.mass * 1e3
      value.volume = toSI(amount.value * grams, 'mL')
      value.mass = props.density ? value.volume * props.density : null
      value.n = props.conc ? props.conc * value.volume : amountFromMass(value.mass, props)
      break
    }
    default:
      break
  }
  return { value, missing }
}

function amountFromMass(mass, props, missing) {
  if (!isNum(mass)) return null
  if (props.conc && props.density) return props.conc * (mass / props.density)
  if (!props.mw) {
    // 溶劑以體積計，沒有分子量不影響使用，不視為缺漏
    if (props.role !== 'solvent') missing?.push('缺少分子量，無法推算莫耳數')
    return null
  }
  return (mass * props.purity) / props.mw
}

function massFromAmount(n, props, missing) {
  if (!isNum(n)) return null
  if (props.conc && props.density) return (n / props.conc) * props.density
  if (!props.mw) {
    missing?.push('缺少分子量，無法推算質量')
    return null
  }
  return (n * props.mw) / props.purity
}

function volumeFrom(value, props) {
  if (props.conc && isNum(value.n)) return value.n / props.conc
  if (props.density && isNum(value.mass)) return value.mass / props.density
  return null
}

function properties(compound) {
  return {
    role: compound.role,
    mw: mwToSI(compound.mw),
    density: densityToSI(compound.density),
    conc: concToSI(compound.conc),
    purity: isNum(compound.purity) && compound.purity > 0 ? compound.purity : 1,
  }
}

function missingProp(props, unit) {
  const dim = dimensionOf(unit)
  if (dim === 'volume' && !props.density && !props.conc) return '密度或濃度'
  return '分子量'
}

// ---------------------------------------------------------------------------
// 匯總
// ---------------------------------------------------------------------------

function groupByRole(rows) {
  const groups = new Map(ROLE_ORDER.map((role) => [role, []]))
  for (const row of rows) {
    if (!row.compound) continue
    const bucket = groups.get(row.compound.role) ?? groups.get('reagent')
    bucket.push(row)
  }
  return [...groups.entries()].filter(([, list]) => list.length).map(([role, list]) => ({ role, rows: list }))
}

/** 溶劑總量：反應槽容積看主軸加入量，全程用量另計 */
function solventTotals(rows) {
  let reaction = 0
  let total = 0
  let hasReaction = false
  let hasTotal = false
  for (const row of rows) {
    if (row.compound?.role !== 'solvent' || !isNum(row.totalVolume)) continue
    total += row.totalVolume
    hasTotal = true
    if (row.type === 'add' && row.depth === 0) {
      reaction += row.totalVolume
      hasReaction = true
    }
  }
  return { reaction: hasReaction ? reaction : null, total: hasTotal ? total : null }
}

/** 理論產量：以基準物莫耳數為上限；產物分子量選填於 meta.product */
function theoreticalYield(doc, basis) {
  const product = doc.meta?.product ?? null
  const mw = mwToSI(product?.mw)
  return {
    name: product?.name ?? '',
    n: basis.ok ? basis.n : null,
    mass: basis.ok && mw ? basis.n * mw : null,
    hasProduct: Boolean(product?.name || product?.mw),
  }
}

function scale(value, repeat) {
  return isNum(value) ? value * repeat : null
}

function label(compound) {
  return compound?.name?.trim() || compound?.id || '化合物'
}

function pushOnce(list, item) {
  if (!list.some((w) => w.code === item.code && w.stepId === item.stepId)) list.push(item)
}

const LEVEL_RANK = { error: 0, warn: 1, info: 2 }
function byLevel(a, b) {
  return LEVEL_RANK[a.level] - LEVEL_RANK[b.level]
}
