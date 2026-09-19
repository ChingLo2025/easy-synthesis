// Calculation engine. Pure function: (procedure) => (table, warnings). Recomputed in full on every change, never incrementally.
//
//   n = m x purity / MW        m = n x MW / purity
//   V = m / rho                neat liquid
//   n = C x V                  solution
//   equiv_i = n_i / n_basis
//
// Driving-field rule: each compound has exactly one driving field per step (amount.mode);
// the rest are derived values. No general constraint solver.
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
        message: `Branch depth has reached ${depth} levels; consider starting a separate procedure.`,
      })
    }
    const number = numbers.get(step.id)
    const row = buildRow({ doc, step, depth, branchLabel, number, basis, warnings })
    rows.push(row)
    for (const aux of auxRows({ doc, step, row, number, basis, warnings })) {
      row[aux.part] = aux
      rows.push(aux)
    }
  }

  // Auxiliary rows (pre-dissolve, co-solvent, antisolvent) are extra; the step still maps to its main row
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
// Basis
// ---------------------------------------------------------------------------

function resolveBasis(doc, warnings) {
  const empty = { compound: null, n: null, mass: null, volume: null, ok: false }
  const compound = compoundById(doc, doc.basis?.compoundId)
  if (!compound) {
    warnings.push({ level: WARN.error, code: 'basis-missing', message: 'No limiting reagent or basis amount set, so equivalents cannot be calculated.' })
    return empty
  }
  const { amount, unit } = doc.basis
  if (!isNum(amount) || amount <= 0) {
    warnings.push({ level: WARN.error, code: 'basis-amount', message: `Basis compound ${label(compound)} has no basis amount.` })
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
      message: `Cannot derive the moles of ${label(compound)} from the basis amount; add its ${missingProp(props, unit)}.`,
    })
  }
  return { compound, ...quantity, ok: isNum(quantity.n) && quantity.n > 0 }
}

// ---------------------------------------------------------------------------
// One row per step
// ---------------------------------------------------------------------------

function buildRow({ doc, step, depth, branchLabel, number, basis, warnings }) {
  const meta = STEP_TYPES[step.type]
  const field = meta.compoundField
  const compound = field ? compoundById(doc, step[field]) : null
  // The filter cake rinse is quantified by the number of rinses
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

  if (step.freeform) return row // Freeform (replacing) entries are excluded from quantities

  // The sampling interval is required (§3)
  if (step.type === 'monitor' && !isNum(step.interval)) {
    warnings.push({
      level: WARN.warn,
      stepId: step.id,
      code: 'monitor-interval',
      message: `Step ${number} (Monitor): the sampling interval is not set.`,
    })
  }

  // Column chromatography: the eluent is written in the narrative but never quantified
  if (step.type === 'column' && !step.eluent?.length) {
    warnings.push({
      level: WARN.warn,
      stepId: step.id,
      code: 'eluent-missing',
      message: `Step ${number} (Column): no eluent set.`,
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
        message: `Step ${number} (${meta.label}): no compound selected.`,
      })
    }
    return row
  }

  const props = properties(compound)
  const quantity = quantify(shareOf(step, 0), props, basis)
  Object.assign(row, quantity.value)
  row.equiv = basis.ok && isNum(row.n) ? row.n / basis.n : null
  row.incomplete = quantity.missing

  if (quantity.missing.length) {
    warnings.push({
      level: WARN.warn,
      stepId: step.id,
      code: 'incomplete',
      message: `Step ${number} ${label(compound)}: ${quantity.missing.join('; ')}.`,
    })
  }

  row.totalN = scale(row.n, repeat)
  row.totalMass = scale(row.mass, repeat)
  row.totalVolume = scale(row.volume, repeat)
  return row
}

/**
 * Extraction with a co-solvent: one portion is shared between the two solvents by the ratio.
 * Index 0 is the main solvent, index 1 the co-solvent.
 */
function shareOf(step, index) {
  if (step.type !== 'extract' || !step.solvent2Id || !isNum(step.amount?.value)) {
    return index === 0 ? step.amount : null
  }
  const [a, b] = ratioParts(step)
  return { ...step.amount, value: step.amount.value * ((index === 0 ? a : b) / (a + b)) }
}

function ratioParts(step) {
  const [a, b] = Array.isArray(step.ratio) ? step.ratio : [1, 1]
  return [isNum(a) && a > 0 ? a : 1, isNum(b) && b > 0 ? b : 1]
}

/**
 * Auxiliary rows belong to a step but are not the step's own compound: the pre-dissolve solvent,
 * the extraction co-solvent and the recrystallisation antisolvent. They are quantified and counted
 * in the solvent totals, while the step itself still maps to its main row.
 */
function auxRows({ doc, step, row, number, basis, warnings }) {
  if (step.freeform) return []
  const out = []

  if (step.type === 'add' && step.dissolve) {
    const solvent = compoundById(doc, step.dissolve.solventId)
    if (!solvent) {
      warnings.push({ level: WARN.warn, stepId: step.id, code: 'dissolve-solvent', message: `Step ${number}: no pre-dissolve solvent selected.` })
    } else {
      if (!isNum(step.dissolve.volume)) {
        warnings.push({ level: WARN.warn, stepId: step.id, code: 'dissolve-volume', message: `Step ${number}: the pre-dissolve solvent volume is not set.` })
      }
      out.push(auxRow('dissolve', solvent, { mode: 'volume', value: step.dissolve.volume }, { step, row, number, basis }))
    }
  }

  if (step.type === 'extract' && step.solvent2Id) {
    const solvent = compoundById(doc, step.solvent2Id)
    if (solvent) out.push(auxRow('cosolvent', solvent, shareOf(step, 1), { step, row, number, basis }))
  }

  if (step.type === 'recrystallize' && step.antisolventId) {
    const solvent = compoundById(doc, step.antisolventId)
    if (solvent) {
      if (!isNum(step.antisolventVolume)) {
        warnings.push({ level: WARN.warn, stepId: step.id, code: 'antisolvent-volume', message: `Step ${number}: the antisolvent volume is not set.` })
      }
      out.push(auxRow('antisolvent', solvent, { mode: 'volume', value: step.antisolventVolume }, { step, row, number, basis }))
    }
  }

  return out
}

function auxRow(part, compound, amount, { step, row, number, basis }) {
  const quantity = quantify(amount, properties(compound), basis)
  const { n, mass, volume } = quantity.value
  return {
    stepId: step.id,
    part,
    number,
    type: step.type,
    depth: row.depth,
    branchLabel: row.branchLabel,
    repeat: row.repeat,
    compound,
    role: compound.role,
    driver: amount?.mode ?? 'volume',
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

/** Derive the other three columns from the driving field */
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
        missing.push('missing density or concentration, so mass cannot be derived from volume')
      }
      break
    }
    case 'equiv':
    case 'mol%': {
      const factor = amount.mode === 'equiv' ? amount.value : amount.value / 100
      if (!basis.ok) {
        missing.push('basis amount not set, so equivalents cannot be converted')
        break
      }
      value.n = factor * basis.n
      value.mass = massFromAmount(value.n, props, missing)
      value.volume = volumeFrom(value, props)
      break
    }
    case 'vol_per_g': {
      if (!isNum(basis.mass)) {
        missing.push('basis mass unknown, so V/W cannot be converted')
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
    // Solvents are measured by volume; a missing MW doesn't matter for them and isn't flagged
    if (props.role !== 'solvent') missing?.push('missing MW, so moles cannot be derived')
    return null
  }
  return (mass * props.purity) / props.mw
}

function massFromAmount(n, props, missing) {
  if (!isNum(n)) return null
  if (props.conc && props.density) return (n / props.conc) * props.density
  if (!props.mw) {
    missing?.push('missing MW, so mass cannot be derived')
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
  if (dim === 'volume' && !props.density && !props.conc) return 'density or concentration'
  return 'molecular weight'
}

// ---------------------------------------------------------------------------
// Totals
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

/** Total solvent: vessel sizing uses main-axis additions; whole-process usage is counted separately */
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

/**
 * Theoretical yield: basis moles x the product equivalents (1 unless set), converted to mass with the MW.
 * A dimer is 0.5 eq, two products from one substrate are 2 eq.
 */
function theoreticalYield(doc, basis) {
  const product = doc.meta?.product ?? null
  const mw = mwToSI(product?.mw)
  const equiv = isNum(product?.equiv) && product.equiv > 0 ? product.equiv : 1
  const n = basis.ok ? basis.n * equiv : null
  return {
    name: product?.name ?? '',
    equiv,
    n,
    mass: isNum(n) && mw ? n * mw : null,
    hasProduct: Boolean(product?.name || product?.mw),
  }
}

function scale(value, repeat) {
  return isNum(value) ? value * repeat : null
}

function label(compound) {
  return compound?.name?.trim() || compound?.id || 'compound'
}

function pushOnce(list, item) {
  if (!list.some((w) => w.code === item.code && w.stepId === item.stepId)) list.push(item)
}

const LEVEL_RANK = { error: 0, warn: 1, info: 2 }
function byLevel(a, b) {
  return LEVEL_RANK[a.level] - LEVEL_RANK[b.level]
}
