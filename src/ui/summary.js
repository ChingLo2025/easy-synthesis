// One-line step summary, shared by cards and the flow diagram.
import {
  ATMOSPHERES, CENTRIFUGE_KEPT, DRY_METHODS, EVAPORATE_METHODS, FILTER_KEPT, FILTER_METHODS,
  MONITOR_METHODS, PHASES, RAMPS, SPEED_UNITS, STIR_SPECIALS,
} from '../model/steps.js'
import { formatAmount, formatDurationEn, formatEquiv, formatMass, formatVolume, isNum, sig } from '../model/units.js'

const DOT = ' · '

export function stepSummary(step, row, doc) {
  if (step.freeform) return step.freeform.split('\n')[0].slice(0, 60) || 'Manual entry'
  const parts = SUMMARIES[step.type]?.(step, row, doc) ?? []
  const text = parts.filter(Boolean).join(DOT)
  return step.note ? `${text}${text ? DOT : ''}${step.note}` : text
}

const SUMMARIES = {
  add: (step, row, doc) => [
    compoundName(row),
    quantityText(step, row),
    dissolveText(step, row, doc),
    ...(step.addMode === 'dropwise' ? dropwiseParts(step) : []),
    step.vessel || null,
  ],
  stir: (step) => [
    step.atm && step.atm !== 'air' ? ATMOSPHERES[step.atm]?.label : null,
    stirTempText(step),
    formatDurationEn(step.time),
    step.rpm ? `${sig(step.rpm)} rpm` : null,
    (step.special ?? []).map((id) => STIR_SPECIALS[id]?.label).filter(Boolean).join(', ') || null,
  ],
  extract: (step, row) => [
    compoundName(row),
    quantityText(step, row),
    `Keep ${PHASES[step.phaseKept]?.labelEn ?? 'organic layer'}`,
  ],
  wash: (step, row) => [compoundName(row), quantityText(step, row)],
  filter: (step, row) => [
    FILTER_METHODS[step.method]?.label,
    `Keep ${FILTER_KEPT[step.kept]?.labelEn ?? 'filtrate'}`,
    row?.compound ? `${row.compound.name} ${quantityText(step, row, { primaryOnly: true }) ?? ''}`.trim() + ' rinse' : null,
  ],
  centrifuge: (step) => [
    speedText(step),
    formatDurationEn(step.time),
    isNum(step.temp) ? `${sig(step.temp)} °C` : null,
    `Keep ${CENTRIFUGE_KEPT[step.kept]?.labelEn ?? 'pellet'}`,
  ],
  evaporate: (step) => [
    EVAPORATE_METHODS[step.method]?.label,
    step.temp !== null && step.temp !== undefined ? `${sig(step.temp)} °C` : null,
    step.pressure ? `${sig(step.pressure)} mbar` : null,
    isNum(step.time) ? formatDurationEn(step.time) : null,
    step.toDryness ? 'to dryness' : null,
  ],
  dry: (step, row) => [
    DRY_METHODS[step.method]?.label,
    step.method === 'agent' ? compoundName(row) : null,
    step.temp !== null && step.temp !== undefined ? `${sig(step.temp)} °C` : null,
    formatDurationEn(step.time),
  ],
  monitor: (step) => [
    MONITOR_METHODS[step.method]?.label,
    step.interval ? `every ${formatDurationEn(step.interval)}` : 'no interval',
    step.criteria || null,
  ],
}

function compoundName(row) {
  return row?.compound?.name || null
}

/** Show the driving field's number, plus moles or equivalents when derivable */
export function quantityText(step, row, { primaryOnly = false } = {}) {
  if (!row) return null
  const mode = step.amount?.mode
  const primary =
    mode === 'mass' ? formatMass(row.mass)
    : mode === 'volume' || mode === 'vol_per_g' ? formatVolume(row.volume)
    : row.equiv !== null ? `${formatEquiv(row.equiv)} eq`
    : null
  const secondary = primaryOnly ? null :
    mode === 'equiv' || mode === 'mol%'
      ? formatMass(row.mass) ?? formatVolume(row.volume)
      : row.equiv !== null && row.compound?.role !== 'solvent'
        ? `${formatEquiv(row.equiv)} eq`
        : null
  const both = [primary, secondary].filter(Boolean).join(', ')
  return row.repeat > 1 && both ? `${both} x${row.repeat}` : both || null
}

/** Stir temperature; with a slow ramp it reads "Slow heating to 80 °C (2 °C/min)" */
function stirTempText(step) {
  const temp = isNum(step.temp) ? `${sig(step.temp)} °C` : null
  if (!step.ramp) return temp
  const rate = isNum(step.rampRate) ? ` (${sig(step.rampRate)} °C/min)` : ''
  return `${RAMPS[step.ramp]?.label ?? ''}${temp ? ` to ${temp}` : ''}${rate}`
}

/** Pre-dissolve: in THF 20 mL */
function dissolveText(step, row, doc) {
  if (!step.dissolve) return null
  const solvent = row?.dissolve?.compound ?? doc?.compounds?.find((c) => c.id === step.dissolve.solventId)
  const name = solvent?.name || '(no solvent)'
  const volume = isNum(step.dissolve.volume) ? ` ${formatVolume(step.dissolve.volume * 1e-6)}` : ''
  return `in ${name}${volume}`
}

/** Centrifuge speed: 4000 rpm, 3000 × g */
export function speedText(step) {
  if (!isNum(step.speed)) return null
  return `${Math.round(step.speed)} ${SPEED_UNITS[step.speedUnit]?.text ?? 'rpm'}`
}

/** Dropwise conditions, shared by the card summary and the flow node */
export function dropwiseParts(step) {
  return [
    isNum(step.duration) ? `Dropwise over ${formatDurationEn(step.duration)}` : 'Dropwise',
    isNum(step.rate) ? `${sig(step.rate)} mL/min` : null,
    isNum(step.tempMax) ? `below ${sig(step.tempMax)} °C` : null,
  ].filter(Boolean)
}

/** Flow diagram left side: material entering the main stream */
export function inflowLabel(step, row) {
  if (step.freeform) return null
  if (['add', 'extract', 'wash', 'filter'].includes(step.type)) {
    const name = compoundName(row)
    if (!name) return null
    const label = [name, quantityText(step, row, { primaryOnly: true })].filter(Boolean).join(' ')
    const dissolve = step.type === 'add' ? dissolveText(step, row) : null
    return dissolve ? `${label} (${dissolve})` : label
  }
  if (step.type === 'dry' && step.method === 'agent') return compoundName(row)
  return null
}

/** Flow diagram right side: material leaving the main stream */
export function outflowLabel(step, row) {
  if (step.freeform) return null
  switch (step.type) {
    case 'extract': {
      const dropped = step.phaseKept === 'organic' ? PHASES.aqueous.label : PHASES.organic.label
      return `${dropped}${row?.repeat > 1 ? ` x${row.repeat}` : ''}`
    }
    case 'wash':
      return `Washings${row?.repeat > 1 ? ` x${row.repeat}` : ''}`
    case 'filter':
      return step.kept === 'solid' ? 'Filtrate' : 'Filter cake'
    case 'centrifuge':
      return step.kept === 'pellet' ? 'Supernatant' : 'Pellet'
    case 'evaporate':
      return 'Solvent removed'
    case 'dry':
      return step.method === 'agent' ? 'Drying agent filtered off' : 'Water removed'
    case 'monitor':
      return `Sample (${MONITOR_METHODS[step.method]?.label ?? ''})`
    default:
      return null
  }
}

/** Detail to the right of the card title, e.g. moles added */
export function detailLine(step, row) {
  if (!row || step.freeform) return null
  const bits = []
  if (row.n !== null) bits.push(formatAmount(row.n))
  if (row.equiv !== null && row.compound?.role !== 'solvent') bits.push(`${formatEquiv(row.equiv)} eq`)
  return bits.join(DOT) || null
}
