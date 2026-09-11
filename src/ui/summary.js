// 步驟的一行摘要，卡片與流程圖共用。
import {
  ATMOSPHERES, CENTRIFUGE_KEPT, DRY_METHODS, EVAPORATE_METHODS, FILTER_KEPT, FILTER_METHODS,
  MONITOR_METHODS, PHASES, RAMPS, SPEED_UNITS, STIR_SPECIALS,
} from '../model/steps.js'
import { formatAmount, formatDuration, formatEquiv, formatMass, formatVolume, isNum, sig } from '../model/units.js'

const DOT = ' · '

export function stepSummary(step, row, doc) {
  if (step.freeform) return step.freeform.split('\n')[0].slice(0, 60) || '手動輸入'
  const parts = SUMMARIES[step.type]?.(step, row, doc) ?? []
  const text = parts.filter(Boolean).join(DOT)
  return step.note ? `${text}${text ? DOT : ''}${step.note}` : text
}

const SUMMARIES = {
  add: (step, row, doc) => [
    compoundName(row),
    quantityText(step, row),
    dissolveText(step, row, doc),
    step.addMode === 'dropwise' ? dropwiseText(step) : null,
    step.vessel || null,
  ],
  stir: (step) => [
    step.atm && step.atm !== 'air' ? ATMOSPHERES[step.atm]?.label : null,
    stirTempText(step),
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
  filter: (step, row) => [
    FILTER_METHODS[step.method]?.label,
    `保留${FILTER_KEPT[step.kept]?.label ?? '濾液'}`,
    row?.compound ? `${row.compound.name} ${quantityText(step, row, { primaryOnly: true }) ?? ''}`.trim() + ' 洗滌' : null,
  ],
  centrifuge: (step) => [
    speedText(step),
    formatDuration(step.time),
    isNum(step.temp) ? `${sig(step.temp)} °C` : null,
    `保留${CENTRIFUGE_KEPT[step.kept]?.label ?? '沉澱'}`,
  ],
  evaporate: (step) => [
    EVAPORATE_METHODS[step.method]?.label,
    step.temp !== null && step.temp !== undefined ? `${sig(step.temp)} °C` : null,
    step.pressure ? `${sig(step.pressure)} mbar` : null,
    isNum(step.time) ? formatDuration(step.time) : null,
    step.toDryness ? '至乾' : null,
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

/** 攪拌溫度；緩慢升降溫時寫成「緩慢升溫至 80 °C（2 °C/min）」 */
function stirTempText(step) {
  const temp = isNum(step.temp) ? `${sig(step.temp)} °C` : null
  if (!step.ramp) return temp
  const rate = isNum(step.rampRate) ? `（${sig(step.rampRate)} °C/min）` : ''
  return `${RAMPS[step.ramp]?.label ?? ''}${temp ? `至 ${temp}` : ''}${rate}`
}

/** 預溶：溶於 THF 20 mL */
function dissolveText(step, row, doc) {
  if (!step.dissolve) return null
  const solvent = row?.dissolve?.compound ?? doc?.compounds?.find((c) => c.id === step.dissolve.solventId)
  const name = solvent?.name || '（未指定溶劑）'
  const volume = isNum(step.dissolve.volume) ? ` ${formatVolume(step.dissolve.volume * 1e-6)}` : ''
  return `溶於${/^[A-Za-z0-9(]/.test(name) ? ' ' : ''}${name}${volume}`
}

/** 離心轉速：4000 rpm、3000 × g */
export function speedText(step) {
  if (!isNum(step.speed)) return null
  return `${Math.round(step.speed)} ${SPEED_UNITS[step.speedUnit]?.text ?? 'rpm'}`
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
  if (['add', 'extract', 'wash', 'filter'].includes(step.type)) {
    const name = compoundName(row)
    if (!name) return null
    const label = [name, quantityText(step, row, { primaryOnly: true })].filter(Boolean).join(' ')
    const dissolve = step.type === 'add' ? dissolveText(step, row) : null
    return dissolve ? `${label}（${dissolve}）` : label
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
    case 'filter':
      return step.kept === 'solid' ? '濾液' : '濾餅'
    case 'centrifuge':
      return step.kept === 'pellet' ? '上清液' : '沉澱'
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
