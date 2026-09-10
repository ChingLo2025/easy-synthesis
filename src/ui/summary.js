// 步驟的一行摘要，卡片與流程圖共用。
import {
  ATMOSPHERES, DRY_METHODS, EVAPORATE_METHODS, MONITOR_METHODS, PHASES, STIR_SPECIALS,
} from '../model/steps.js'
import { formatAmount, formatDuration, formatEquiv, formatMass, formatVolume, sig } from '../model/units.js'

const DOT = ' · '

export function stepSummary(step, row, doc) {
  if (step.freeform) return step.freeform.split('\n')[0].slice(0, 60) || '手動輸入'
  const parts = SUMMARIES[step.type]?.(step, row, doc) ?? []
  const text = parts.filter(Boolean).join(DOT)
  return step.note ? `${text}${text ? DOT : ''}${step.note}` : text
}

const SUMMARIES = {
  add: (step, row) => [
    compoundName(row),
    quantityText(step, row),
    step.addMode === 'dropwise' ? dropwiseText(step) : null,
    step.vessel || null,
  ],
  stir: (step) => [
    step.atm && step.atm !== 'air' ? ATMOSPHERES[step.atm]?.label : null,
    step.temp !== null && step.temp !== undefined ? `${sig(step.temp)} °C` : null,
    formatDuration(step.time),
    step.rpm ? `${sig(step.rpm)} rpm` : null,
    (step.special ?? []).map((id) => STIR_SPECIALS[id]?.label).filter(Boolean).join('、') || null,
  ],
  extract: (step, row) => [
    compoundName(row),
    quantityText(step, row),
    `保留${PHASES[step.phaseKept]?.label ?? '有機層'}`,
  ],
  wash: (step, row) => [compoundName(row), quantityText(step, row)],
  evaporate: (step) => [
    EVAPORATE_METHODS[step.method]?.label,
    step.temp !== null && step.temp !== undefined ? `${sig(step.temp)} °C` : null,
    step.pressure ? `${sig(step.pressure)} mbar` : null,
  ],
  dry: (step, row) => [
    DRY_METHODS[step.method]?.label,
    step.method === 'agent' ? compoundName(row) : null,
    step.temp !== null && step.temp !== undefined ? `${sig(step.temp)} °C` : null,
    formatDuration(step.time),
  ],
  monitor: (step) => [
    MONITOR_METHODS[step.method]?.label,
    step.interval ? `每 ${formatDuration(step.interval)}` : '未填間隔',
    step.criteria || null,
  ],
}

function compoundName(row) {
  return row?.compound?.name || null
}

/** 顯示驅動欄位的數字，並在可推導時補上莫耳數或當量 */
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
  const both = [primary, secondary].filter(Boolean).join('，')
  return row.repeat > 1 && both ? `${both} x${row.repeat}` : both || null
}

function dropwiseText(step) {
  const bits = ['滴加']
  if (step.duration) bits.push(formatDuration(step.duration))
  if (step.tempMax !== null && step.tempMax !== undefined) bits.push(`控溫 < ${sig(step.tempMax)} °C`)
  return bits.join(' ')
}

/** 流程圖左側：進入主流的物質 */
export function inflowLabel(step, row) {
  if (step.freeform) return null
  if (step.type === 'add' || step.type === 'extract' || step.type === 'wash') {
    const name = compoundName(row)
    if (!name) return null
    return [name, quantityText(step, row, { primaryOnly: true })].filter(Boolean).join(' ')
  }
  if (step.type === 'dry' && step.method === 'agent') return compoundName(row)
  return null
}

/** 流程圖右側：離開主流的物質 */
export function outflowLabel(step, row) {
  if (step.freeform) return null
  switch (step.type) {
    case 'extract': {
      const dropped = step.phaseKept === 'organic' ? PHASES.aqueous.label : PHASES.organic.label
      return `${dropped}${row?.repeat > 1 ? ` x${row.repeat}` : ''}`
    }
    case 'wash':
      return `洗液${row?.repeat > 1 ? ` x${row.repeat}` : ''}`
    case 'evaporate':
      return '蒸除溶劑'
    case 'dry':
      return step.method === 'agent' ? '濾除乾燥劑' : '除去水分'
    case 'monitor':
      return `取樣（${MONITOR_METHODS[step.method]?.label ?? ''}）`
    default:
      return null
  }
}

/** 卡片標題右側的細節，例如加入的莫耳數 */
export function detailLine(step, row) {
  if (!row || step.freeform) return null
  const bits = []
  if (row.n !== null) bits.push(formatAmount(row.n))
  if (row.equiv !== null && row.compound?.role !== 'solvent') bits.push(`${formatEquiv(row.equiv)} eq`)
  return bits.join(DOT) || null
}
