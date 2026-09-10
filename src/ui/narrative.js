// Experimental section：由結構化資料套模板生成敘述文字，中英文各一份。
//
// 留白規則（逐步驟，不停用整份文件）
//   純模板步驟：中英文皆正常生成
//   有 note   ：中文生成後原樣附加該句，英文留白
//   有 freeform：中英文皆留白
import { numberSteps, flattenSteps } from '../model/schema.js'
import { ATMOSPHERES, DRY_METHODS, EVAPORATE_METHODS, MONITOR_METHODS, PHASES, STIR_SPECIALS } from '../model/steps.js'
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
      zh: blankZh ? null : segmentZh(segment, rowOf, doc),
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

/** 連續、單純的加料步驟併為一段，敘述才不會變成「加入 A，加入 B」 */
function groupSegments(entries) {
  const segments = []
  let run = null
  const mergeable = (step) =>
    step.type === 'add' && step.addMode !== 'dropwise' && !step.freeform && !step.note?.trim() && (step.repeat ?? 1) === 1

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

/** 產生段落。留白標記自成一句，前後不合併。 */
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
    // 支流自成段落，回到主軸時同樣斷句
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

/** 英文列舉用牛津逗號：a, b, and c */
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

// ── 中文 ───────────────────────────────────────────────────────────────────
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
      if (step.addMode === 'dropwise') {
        const bits = [`緩慢滴入${sp(name)}${detail}`]
        if (isNum(step.duration)) bits.push(`滴加時間 ${formatDuration(step.duration)}`)
        if (isNum(step.rate)) bits.push(`速率 ${sig(step.rate)} mL/min`)
        if (isNum(step.tempMax)) bits.push(`控溫低於 ${sig(step.tempMax)} °C`)
        return bits.join('，')
      }
      return `${step.vessel ? `於${sp(step.vessel)}中` : ''}加入${sp(name)}${detail}${repeatZh(step)}`
    }
    case 'stir': {
      const specials = (step.special ?? []).map((id) => STIR_SPECIALS[id]?.label).filter(Boolean)
      const bits = []
      if (step.atm && step.atm !== 'air') bits.push(`於 ${ATMOSPHERES[step.atm].label} 下`)
      if (specials.includes('遮光')) bits.push('避光')
      if (isNum(step.temp)) bits.push(`${sig(step.temp)} °C`)
      else if (specials.includes('迴流')) bits.push('迴流')
      if (specials.includes('減壓')) bits.push('減壓')
      bits.push('攪拌')
      if (isNum(step.time)) bits.push(formatDuration(step.time))
      if (isNum(step.rpm)) bits.push(`（${sig(step.rpm)} rpm）`)
      return bits.join(' ').replace(/\s+/g, ' ').trim()
    }
    case 'extract': {
      const kept = PHASES[step.phaseKept]?.label ?? '有機層'
      return `以${sp(compoundName(row, 'zh'))}${volumeParen(row)} 萃取${countZh(step.repeat)}，合併${kept}`
    }
    case 'wash':
      return `以${sp(compoundName(row, 'zh'))}${volumeParen(row)} 洗滌${countZh(step.repeat)}`
    case 'evaporate': {
      const conditions = []
      if (isNum(step.temp)) conditions.push(`${sig(step.temp)} °C`)
      if (isNum(step.pressure)) conditions.push(`${sig(step.pressure)} mbar`)
      const suffix = conditions.length ? `（${conditions.join('，')}）` : ''
      return `以${EVAPORATE_METHODS[step.method]?.label ?? '濃縮'}${suffix}移除溶劑`
    }
    case 'dry': {
      if (step.method === 'agent') return `以${sp(compoundName(row, 'zh'))}乾燥後過濾`
      const bits = [`於${DRY_METHODS[step.method]?.label ?? '乾燥'}`]
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
    default:
      return ''
  }
}

// ── 英文 ───────────────────────────────────────────────────────────────────
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
      if (step.addMode === 'dropwise') {
        const bits = [`${name}${detail} was added dropwise`]
        if (isNum(step.duration)) bits.push(`over ${formatDurationEn(step.duration)}`)
        if (isNum(step.rate)) bits.push(`at ${sig(step.rate)} mL/min`)
        if (isNum(step.tempMax)) bits.push(`keeping the temperature below ${sig(step.tempMax)} °C`)
        return bits.join(', ')
      }
      return step.vessel
        ? `to a ${step.vessel} was added ${name}${detail}`
        : `${name}${detail} was added`
    }
    case 'stir': {
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
      const suffix = conditions.length ? ` (${conditions.join(', ')})` : ''
      return `the solvent was removed by ${EVAPORATE_METHODS[step.method]?.labelEn ?? 'concentration'}${suffix}`
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
    default:
      return ''
  }
}

// ── 共用零件 ───────────────────────────────────────────────────────────────
/** 中英混排：以拉丁字母或數字開頭時補一個半形空格 */
function sp(text) {
  return /^[A-Za-z0-9(]/.test(String(text ?? '')) ? ` ${text}` : String(text ?? '')
}

function compoundName(row, lang) {
  const compound = row?.compound
  if (!compound) return lang === 'zh' ? '（未指定）' : '(unspecified)'
  if (lang === 'en') return compound.nameEn || compound.name || '(unnamed)'
  return compound.name || '（未命名）'
}

/** 反應物：(10.0 g, 50.7 mmol, 1.0 eq)；溶劑：(50 mL) */
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

/** 純文字複製：待補歸零前仍保留方括號標記，避免帶洞的文件被直接送出 */
export function narrativeToText(sentences, lang = 'zh') {
  return sentences.join(lang === 'zh' ? '' : ' ')
}
