// Experimental section: narrative text generated from structured data via templates, one Chinese and one English.
//
// Blank rules (per step; never disables the whole document)
//   Pure template step: both Chinese and English are generated normally
//   With a note       : Chinese is generated with the note appended verbatim; English is left blank
//   With freeform     : both Chinese and English are left blank
import { numberSteps, flattenSteps } from '../model/schema.js'
import { ATMOSPHERES, DRY_METHODS, EVAPORATE_METHODS, FILTER_METHODS, MONITOR_METHODS, PHASES, RAMPS, STIR_SPECIALS } from '../model/steps.js'
import { speedText } from './summary.js'
import {
  formatAmount, formatDuration, formatDurationEn, formatEquiv,
  formatMass, formatVolume, isNum, sig,
} from '../model/units.js'

const CN_NUMERALS = ['', '一', '兩', '三', '四', '五', '六', '七', '八', '九', '十']

export function generateNarrative(doc, metrics) {
  const numbers = numberSteps(doc.steps)
  const rowOf = (step) => metrics?.byStep.get(step.id) ?? null
  const units = groupSegments(flattenSteps(doc.steps)).map((segment) => {
    const [first] = segment
    const blankZh = Boolean(first.freeform)
    const blankEn = blankZh || Boolean(first.note?.trim())
    return {
      stepId: first.id,
      number: numbers.get(first.id),
      branchLabel: first.branchLabel ?? null,
      zh: blankZh ? null : spaceZh(segmentZh(segment, rowOf, doc)),
      en: blankEn ? null : segmentEn(segment, rowOf, doc),
      note: first.note?.trim() ?? '',
      joinPrev: canJoinPrevious(first),
      blankZh,
      blankEn,
    }
  })

  return {
    zh: assemble(units, 'zh'),
    en: assemble(units, 'en'),
    pendingZh: units.filter((unit) => unit.blankZh).length,
    pendingEn: units.filter((unit) => unit.blankEn).length,
    pending: units.filter((unit) => unit.blankZh || unit.blankEn).length,
  }
}

/** Consecutive simple additions merge into one clause, so the narrative doesn't read "add A, add B" */
function groupSegments(entries) {
  const segments = []
  let run = null
  const mergeable = (step) =>
    step.type === 'add' && step.addMode !== 'dropwise' && !step.dissolve && !step.freeform && !step.note?.trim() && (step.repeat ?? 1) === 1

  for (const { step, branchLabel } of entries) {
    const tagged = Object.assign(Object.create(Object.getPrototypeOf(step)), step, { branchLabel })
    if (mergeable(step) && (!run || run[0].branchLabel === branchLabel)) {
      if (run) run.push(tagged)
      else segments.push((run = [tagged]))
      continue
    }
    run = null
    segments.push([tagged])
  }
  return segments
}

/** Build paragraphs. Blank markers form their own sentence and never merge with neighbours. */
function assemble(units, lang) {
  const sentences = []
  let current = []
  let branch = null

  const flush = () => {
    if (!current.length) return
    sentences.push(lang === 'zh' ? `${current.join('，')}。` : `${capitalize(joinEnClauses(current))}.`)
    current = []
  }

  for (const unit of units) {
    // Branches form their own paragraph; the sentence also breaks when returning to the main axis
    const switched = (unit.branchLabel ?? null) !== branch
    if (switched) flush()

    const blank = lang === 'zh' ? unit.blankZh : unit.blankEn
    if (blank) {
      flush()
      sentences.push(marker(unit.number, lang))
      branch = unit.branchLabel ?? null
      continue
    }
    const text = lang === 'zh' ? unit.zh : unit.en
    if (!text) {
      branch = unit.branchLabel ?? null
      continue
    }
    if (!unit.joinPrev || !current.length) flush()
    const prefix = switched && unit.branchLabel
      ? (lang === 'zh' ? `${unit.branchLabel}：` : `for the ${unit.branchLabel}, `)
      : ''
    current.push(prefix + text)
    branch = unit.branchLabel ?? null

    if (lang === 'zh' && unit.note) {
      flush()
      sentences.push(unit.note.endsWith('。') ? unit.note : `${unit.note}。`)
    }
  }
  flush()
  return sentences
}

/** English lists use the Oxford comma: a, b, and c */
function joinEnClauses(clauses) {
  if (clauses.length === 1) return clauses[0]
  if (clauses.length === 2) return `${clauses[0]}, and ${clauses[1]}`
  return `${clauses.slice(0, -1).join(', ')}, and ${clauses[clauses.length - 1]}`
}

export function marker(number, lang) {
  return lang === 'zh' ? `［步驟 ${number}：手動輸入，待補寫］` : `[Step ${number}: manual entry, to be written]`
}

export function isMarker(text) {
  return text.startsWith('［步驟') || text.startsWith('[Step ')
}

function canJoinPrevious(step) {
  if (step.type === 'stir') return true
  if (step.type === 'add') return step.addMode !== 'dropwise'
  return ['wash', 'evaporate', 'dry'].includes(step.type)
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Chinese/Latin spacing on generated clauses: a half-width space at every boundary between a
 * CJK character and a Latin letter or digit (e.g. "MgSO4 (anhydrous) 乾燥", "直至 starting material").
 * sp() only covers text that starts with Latin; English names followed by Chinese need this too.
 */
function spaceZh(text) {
  return text
    .replace(/([A-Za-z0-9)])(?=[一-鿿])/g, '$1 ')
    .replace(/([一-鿿])(?=[A-Za-z0-9(])/g, '$1 ')
}

// ── Chinese ───────────────────────────────────────────────────────────────────
function segmentZh(segment, rowOf, doc) {
  if (segment.length > 1) {
    const vessel = segment.find((step) => step.vessel)?.vessel
    const items = segment.map((step) => `${compoundName(rowOf(step), 'zh')}${quantityParen(step, rowOf(step))}`)
    return `${vessel ? `於${sp(vessel)}中` : ''}加入${sp(joinZh(items))}`
  }
  return clauseZh(segment[0], rowOf(segment[0]), doc)
}

function clauseZh(step, row, doc) {
  switch (step.type) {
    case 'add': {
      const name = compoundName(row, 'zh')
      const detail = quantityParen(step, row)
      // Pre-dissolve (zh): dissolve X in THF (20 mL), then add it or add it dropwise
      const lead = step.dissolve ? `將${sp(name)}${detail} 溶於${sp(dissolveName(row, 'zh'))}${volumeParen(row?.dissolve)} 後` : ''
      if (step.addMode === 'dropwise') {
        const bits = [lead ? `${lead}緩慢滴入` : `緩慢滴入${sp(name)}${detail}`]
        if (isNum(step.duration)) bits.push(`滴加時間 ${formatDuration(step.duration)}`)
        if (isNum(step.rate)) bits.push(`速率 ${sig(step.rate)} mL/min`)
        if (isNum(step.tempMax)) bits.push(`控溫低於 ${sig(step.tempMax)} °C`)
        return bits.join('，')
      }
      if (lead) return `${lead}加入${step.vessel ? `${sp(step.vessel)}中` : ''}${repeatZh(step)}`
      return `${step.vessel ? `於${sp(step.vessel)}中` : ''}加入${sp(name)}${detail}${repeatZh(step)}`
    }
    case 'stir': {
      if (step.ramp) return rampZh(step)
      const { lead, extra } = stirConditionsZh(step)
      const heat = isNum(step.temp) ? `${sig(step.temp)} °C` : (step.special ?? []).includes('reflux') ? '迴流' : null
      const main = [...lead, heat, '攪拌', isNum(step.time) ? formatDuration(step.time) : null].filter(Boolean).join(' ')
      return `${main}${extra}`
    }
    case 'extract': {
      const kept = PHASES[step.phaseKept]?.zh ?? '有機層'
      return `以${sp(compoundName(row, 'zh'))}${volumeParen(row)} 萃取${countZh(step.repeat)}，合併${kept}`
    }
    case 'wash':
      return `以${sp(compoundName(row, 'zh'))}${volumeParen(row)} 洗滌${countZh(step.repeat)}`
    case 'evaporate': {
      const conditions = []
      if (isNum(step.temp)) conditions.push(`${sig(step.temp)} °C`)
      if (isNum(step.pressure)) conditions.push(`${sig(step.pressure)} mbar`)
      // Time is optional; to-dryness is a separate toggle
      if (isNum(step.time)) conditions.push(formatDuration(step.time))
      const suffix = conditions.length ? `（${conditions.join('，')}）` : ''
      return `以${EVAPORATE_METHODS[step.method]?.zh ?? '濃縮'}${suffix}移除溶劑${step.toDryness ? '至乾' : ''}`
    }
    case 'dry': {
      if (step.method === 'agent') return `以${sp(compoundName(row, 'zh'))}乾燥後過濾`
      const bits = [`於${DRY_METHODS[step.method]?.zh ?? '乾燥'}`]
      if (isNum(step.temp)) bits.push(` ${sig(step.temp)} °C`)
      bits.push(' 乾燥')
      if (isNum(step.time)) bits.push(` ${formatDuration(step.time)}`)
      return bits.join('')
    }
    case 'monitor': {
      const interval = isNum(step.interval) ? `每 ${formatDuration(step.interval)}` : '定期'
      if (step.method === 'retain') return `${interval}取樣留存${step.criteria ? `，${step.criteria}` : ''}`
      const method = MONITOR_METHODS[step.method]?.label ?? 'TLC'
      return `以${sp(method)} ${interval}追蹤反應${step.criteria ? `，直至${step.criteria}` : ''}`
    }
    case 'filter': {
      const rinse = row?.compound
        ? `濾餅以${sp(compoundName(row, 'zh'))}${volumeParen(row, rinseCount(step))} 洗滌`
        : null
      const collect = step.kept === 'solid' ? '收集濾餅' : rinse ? '合併濾液' : '收集濾液'
      return [FILTER_METHODS[step.method]?.zh ?? '過濾', rinse, collect].filter(Boolean).join('，') + repeatZh(step)
    }
    case 'centrifuge': {
      const speed = speedText(step)
      const time = isNum(step.time) ? ` ${formatDuration(step.time)}` : ''
      const temp = isNum(step.temp) ? `（${sig(step.temp)} °C）` : ''
      const collect = step.kept === 'supernatant' ? '收集上清液' : '收集沉澱'
      return `${speed ? `以 ${speed} ` : ''}離心${time}${temp}${repeatZh(step)}，${collect}`
    }
    default:
      return ''
  }
}

// ── English ───────────────────────────────────────────────────────────────────
function segmentEn(segment, rowOf, doc) {
  if (segment.length > 1) {
    const vessel = segment.find((step) => step.vessel)?.vessel
    const items = segment.map((step) => `${compoundName(rowOf(step), 'en')}${quantityParen(step, rowOf(step), 'en')}`)
    const target = vessel ? `to a ${vessel}` : 'to the flask'
    return `${target} were added ${joinEn(items)}`
  }
  return clauseEn(segment[0], rowOf(segment[0]), doc)
}

function clauseEn(step, row, doc) {
  switch (step.type) {
    case 'add': {
      const name = compoundName(row, 'en')
      const detail = quantityParen(step, row, 'en')
      // Pre-dissolve: a solution of X in THF (20 mL)
      const subject = step.dissolve
        ? `a solution of ${name}${detail} in ${dissolveName(row, 'en')}${volumeParen(row?.dissolve)}`
        : `${name}${detail}`
      if (step.addMode === 'dropwise') {
        const over = isNum(step.duration) ? ` over ${formatDurationEn(step.duration)}` : ''
        const bits = [`${subject} was added dropwise${over}`]
        if (isNum(step.rate)) bits.push(`at ${sig(step.rate)} mL/min`)
        if (isNum(step.tempMax)) bits.push(`keeping the temperature below ${sig(step.tempMax)} °C`)
        return bits.join(', ')
      }
      return step.vessel ? `to a ${step.vessel} was added ${subject}` : `${subject} was added`
    }
    case 'stir': {
      if (step.ramp) return rampEn(step)
      const bits = ['the mixture was stirred']
      if (isNum(step.temp)) bits.push(`at ${sig(step.temp)} °C`)
      if (step.atm && step.atm !== 'air') bits.push(`under ${ATMOSPHERES[step.atm].labelEn}`)
      const specials = (step.special ?? []).map((id) => STIR_SPECIALS[id]?.labelEn).filter(Boolean)
      if (specials.length) bits.push(specials.join(' and '))
      if (isNum(step.time)) bits.push(`for ${formatDurationEn(step.time)}`)
      if (isNum(step.rpm)) bits.push(`at ${sig(step.rpm)} rpm`)
      return bits.join(' ')
    }
    case 'extract': {
      const kept = PHASES[step.phaseKept]?.labelEn ?? 'organic layer'
      return `the mixture was extracted with ${compoundName(row, 'en')}${volumeParen(row, step.repeat)} and the combined ${kept}s were kept`
    }
    case 'wash':
      return `washed with ${compoundName(row, 'en')}${volumeParen(row, step.repeat)}`
    case 'evaporate': {
      const conditions = []
      if (isNum(step.temp)) conditions.push(`${sig(step.temp)} °C`)
      if (isNum(step.pressure)) conditions.push(`${sig(step.pressure)} mbar`)
      if (isNum(step.time)) conditions.push(formatDurationEn(step.time))
      const suffix = conditions.length ? ` (${conditions.join(', ')})` : ''
      const method = EVAPORATE_METHODS[step.method]?.labelEn ?? 'evaporation'
      return `the mixture was concentrated${step.toDryness ? ' to dryness' : ''} by ${method}${suffix}`
    }
    case 'dry': {
      if (step.method === 'agent') return `dried over anhydrous ${compoundName(row, 'en')} and filtered`
      const bits = [`dried in a ${DRY_METHODS[step.method]?.labelEn ?? 'drying'}`]
      if (isNum(step.temp)) bits.push(`at ${sig(step.temp)} °C`)
      if (isNum(step.time)) bits.push(`for ${formatDurationEn(step.time)}`)
      return bits.join(' ')
    }
    case 'monitor': {
      const interval = isNum(step.interval) ? ` every ${formatDurationEn(step.interval)}` : ''
      if (step.method === 'retain') return `samples were retained${interval}`
      const method = MONITOR_METHODS[step.method]?.labelEn ?? 'TLC'
      return `the reaction was monitored by ${method}${interval}${step.criteria ? ` until ${step.criteria}` : ''}`
    }
    case 'filter': {
      const bits = [`the mixture was ${FILTER_METHODS[step.method]?.en ?? 'filtered'}${repeatEn(step)}`]
      if (row?.compound) bits.push(`the filter cake was washed with ${compoundName(row, 'en')}${volumeParen(row, rinseCount(step))}`)
      if (step.kept === 'solid') bits.push('the solid was collected')
      else bits.push(row?.compound ? 'the combined filtrates were collected' : 'the filtrate was collected')
      return joinEnClauses(bits)
    }
    case 'centrifuge': {
      const speed = speedText(step)
      const at = speed ? ` at ${speed}` : ''
      const time = isNum(step.time) ? ` for ${formatDurationEn(step.time)}` : ''
      const temp = isNum(step.temp) ? ` at ${sig(step.temp)} °C` : ''
      const kept = step.kept === 'supernatant' ? 'the supernatant was collected' : 'the pellet was collected'
      return `the mixture was centrifuged${at}${time}${temp}${repeatEn(step)}, and ${kept}`
    }
    default:
      return ''
  }
}

// ── Shared parts ───────────────────────────────────────────────────────────────
/** Mixed CJK/Latin text: prepend a half-width space when the text starts with a Latin letter or digit */
function sp(text) {
  return /^[A-Za-z0-9(]/.test(String(text ?? '')) ? ` ${text}` : String(text ?? '')
}

function compoundName(row, lang) {
  const compound = row?.compound
  if (!compound) return lang === 'zh' ? '（未指定）' : '(unspecified)'
  if (lang === 'en') return compound.nameEn || compound.name || '(unnamed)'
  return compound.name || '（未命名）'
}

/** Reactants: (10.0 g, 50.7 mmol, 1.0 eq); solvents: (50 mL) */
function quantityParen(step, row, lang = 'zh') {
  if (!row) return ''
  const bits = []
  if (row.compound?.role === 'solvent') {
    bits.push(formatVolume(row.volume) ?? formatMass(row.mass))
  } else {
    if (row.mass !== null) bits.push(formatMass(row.mass))
    else if (row.volume !== null) bits.push(formatVolume(row.volume))
    if (row.n !== null) bits.push(formatAmount(row.n))
    if (row.equiv !== null) bits.push(`${formatEquiv(row.equiv)} eq`)
  }
  const clean = bits.filter(Boolean)
  if (row.repeat > 1) clean.push(lang === 'zh' ? `每次，共 ${row.repeat} 次` : `x ${row.repeat}`)
  return clean.length ? ` (${clean.join(', ')})` : ''
}

function volumeParen(row, repeat = 1) {
  if (!row || row.volume === null) return ''
  const volume = formatVolume(row.volume)
  return repeat > 1 ? ` (${volume} x ${repeat})` : ` (${volume})`
}

function repeatZh(step) {
  return step.repeat > 1 ? `，共 ${countZh(step.repeat)}` : ''
}

function countZh(repeat) {
  if (!repeat || repeat <= 1) return '一次'
  return `${repeat <= 10 ? CN_NUMERALS[repeat] : String(repeat)}次`
}

function joinZh(items) {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join('、')} 與 ${items[items.length - 1]}`
}

function joinEn(items) {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** Slow ramp (zh): slowly heated to 80 °C under N₂ (2 °C/min), then stirred for 2 h */
function rampZh(step) {
  const { lead, extra } = stirConditionsZh(step)
  const reflux = (step.special ?? []).includes('reflux') && step.ramp === 'up'
  const target = isNum(step.temp) ? `至 ${sig(step.temp)} °C` : reflux ? '至迴流' : ''
  const rate = isNum(step.rampRate) ? `（${sig(step.rampRate)} °C/min）` : ''
  const tail = ['攪拌', isNum(step.time) ? formatDuration(step.time) : null].filter(Boolean).join(' ')
  return `${lead.join(' ')}${RAMPS[step.ramp].zh}${target}${rate}，${tail}${extra}`
}

/** Stir conditions: atmosphere, sealed tube and darkness go before the verb; vacuum, sonication and rpm go in a trailing parenthesis */
function stirConditionsZh(step) {
  const has = (id) => (step.special ?? []).includes(id)
  const lead = [
    step.atm && step.atm !== 'air' ? `於 ${ATMOSPHERES[step.atm].zh} 下` : null,
    has('sealed') ? '於封管中' : null,
    has('dark') ? '避光' : null,
  ].filter(Boolean)
  const notes = [
    has('vacuum') ? '減壓' : null,
    has('sonication') ? '超音波輔助' : null,
    isNum(step.rpm) ? `${sig(step.rpm)} rpm` : null,
  ].filter(Boolean)
  return { lead, extra: notes.length ? `（${notes.join('，')}）` : '' }
}

/** the mixture was slowly heated to 80 °C (2 °C/min) under nitrogen and stirred for 2 h */
function rampEn(step) {
  const special = step.special ?? []
  const refluxTarget = special.includes('reflux') && step.ramp === 'up' ? ' to reflux' : ''
  const target = isNum(step.temp) ? ` to ${sig(step.temp)} °C` : refluxTarget
  const rate = isNum(step.rampRate) ? ` (${sig(step.rampRate)} °C/min)` : ''
  const atm = step.atm && step.atm !== 'air' ? ` under ${ATMOSPHERES[step.atm].labelEn}` : ''
  const others = special.filter((id) => id !== 'reflux').map((id) => STIR_SPECIALS[id]?.labelEn).filter(Boolean)
  const extra = others.length ? ` ${others.join(' and ')}` : ''
  const time = isNum(step.time) ? ` for ${formatDurationEn(step.time)}` : ''
  return `the mixture was ${RAMPS[step.ramp].labelEn}${target}${rate}${atm}${extra} and stirred${time}`
}

function dissolveName(row, lang) {
  return compoundName(row?.dissolve ?? null, lang)
}

/** Number of filter cake rinses */
function rinseCount(step) {
  return Math.max(1, Math.round(step.rinseCount ?? 1))
}

function repeatEn(step) {
  return step.repeat > 1 ? ` (${step.repeat} times)` : ''
}

/** Plain-text copy: bracket markers stay until nothing is pending, so a document with holes isn't sent out as is */
export function narrativeToText(sentences, lang = 'zh') {
  return sentences.join(lang === 'zh' ? '' : ' ')
}
