// 每個步驟型別的欄位編輯器。所有型別皆可切換為 freeform 手動輸入（由卡片外殼處理）。
import { el } from './dom.js'
import { compoundPicker } from './picker.js'
import { chipRow, field, numberField, numberInput, row, selectField, textField } from './fields.js'
import {
  AMOUNT_MODES, ATMOSPHERES, DRY_METHODS, EVAPORATE_METHODS,
  MONITOR_METHODS, PHASES, STIR_SPECIALS,
} from '../model/steps.js'
import { formatAmount, formatEquiv, formatMass, formatVolume, isNum } from '../model/units.js'
import { recallDefaults } from '../state/prefs.js'

const TEMP_PRESETS = [0, 25, 40, 60, 80, 100]
const TIME_PRESETS = [15, 30, 60, 120, 720]

export function renderEditor(step, ctx) {
  const build = EDITORS[step.type]
  return build ? build(step, { ...ctx, step }) : []
}

// ── 加入物質 ───────────────────────────────────────────────────────────────
function addEditor(step, ctx) {
  const { doc, actions, store, row: metrics } = ctx
  const compound = doc.compounds.find((c) => c.id === step.compoundId) ?? null
  const parts = [
    row([
      field('化合物', compoundPicker({
        doc,
        value: step.compoundId,
        onPick: (choice) => pickCompound(ctx, step.id, 'compoundId', choice),
      })),
      field('容器', el('input', {
        type: 'text',
        value: step.vessel ?? '',
        placeholder: '250 mL 圓底燒瓶',
        oninput: (event) => actions.updateStep(step.id, { vessel: event.target.value }, { key: 'vessel' }),
        onblur: () => store.flush(),
      })),
    ]),
    amountBlock(step, ctx, compound),
    chipRow('加法', [
      { id: 'once', label: '一次加入', active: step.addMode === 'once' },
      { id: 'dropwise', label: '滴加', active: step.addMode === 'dropwise' },
    ], (item) => actions.updateStep(step.id, { addMode: item.id }), { namespace: 'addMode' }),
  ]

  if (step.addMode === 'dropwise') {
    parts.push(row([
      numberField('滴加時間', {
        value: step.duration, suffix: 'min',
        onInput: (value) => actions.updateStep(step.id, { duration: value }, { key: 'duration' }),
        onBlur: () => store.flush(),
      }),
      numberField('速率', {
        value: step.rate, suffix: 'mL/min',
        onInput: (value) => actions.updateStep(step.id, { rate: value }, { key: 'rate' }),
        onBlur: () => store.flush(),
      }),
      numberField('溫控上限', {
        value: step.tempMax, suffix: '°C',
        onInput: (value) => actions.updateStep(step.id, { tempMax: value }, { key: 'tempMax' }),
        onBlur: () => store.flush(),
      }),
    ], { tight: true }))
  }

  parts.push(derivedStrip(metrics, step))
  return parts
}

// ── 攪拌 ───────────────────────────────────────────────────────────────────
function stirEditor(step, ctx) {
  const { actions, store } = ctx
  const specials = step.special ?? []
  return [
    row([
      numberField('溫度', {
        value: step.temp, suffix: '°C',
        onInput: (value) => actions.updateStep(step.id, { temp: value }, { key: 'temp' }),
        onBlur: () => store.flush(),
      }),
      numberField('時間', {
        value: step.time, suffix: 'min',
        onInput: (value) => actions.updateStep(step.id, { time: value }, { key: 'time' }),
        onBlur: () => store.flush(),
      }),
      numberField('轉速', {
        value: step.rpm, suffix: 'rpm',
        onInput: (value) => actions.updateStep(step.id, { rpm: value }, { key: 'rpm' }),
        onBlur: () => store.flush(),
      }),
    ], { tight: true }),
    chipRow('氣氛', Object.entries(ATMOSPHERES).map(([id, meta]) => ({
      id, label: meta.label, active: step.atm === id,
    })), (item) => actions.updateStep(step.id, { atm: item.id }), { namespace: 'atm' }),
    chipRow('溫度', TEMP_PRESETS.map((value) => ({
      id: `t${value}`, label: `${value} °C`, value, active: step.temp === value,
    })), (item) => actions.updateStep(step.id, { temp: item.value }), { namespace: 'temp' }),
    chipRow('時間', TIME_PRESETS.map((value) => ({
      id: `m${value}`, label: labelMinutes(value), value, active: step.time === value,
    })), (item) => actions.updateStep(step.id, { time: item.value }), { namespace: 'time' }),
    chipRow('條件', Object.entries(STIR_SPECIALS).map(([id, meta]) => ({
      id, label: meta.label, active: specials.includes(id),
    })), (item) => {
      const next = specials.includes(item.id) ? specials.filter((s) => s !== item.id) : [...specials, item.id]
      actions.updateStep(step.id, { special: next })
    }, { namespace: 'special' }),
  ]
}

// ── 萃取 / 水洗 ────────────────────────────────────────────────────────────
function extractEditor(step, ctx) {
  const { doc, actions, row: metrics } = ctx
  const compound = doc.compounds.find((c) => c.id === step.solventId) ?? null
  return [
    row([
      field('溶劑', compoundPicker({
        doc, value: step.solventId, filter: 'solvent', placeholder: '選擇溶劑',
        onPick: (choice) => pickCompound(ctx, step.id, 'solventId', choice),
      })),
      selectField('保留相', {
        value: step.phaseKept,
        options: Object.entries(PHASES).map(([id, meta]) => [id, meta.label]),
        onChange: (value) => actions.updateStep(step.id, { phaseKept: value }),
      }),
    ]),
    amountBlock(step, ctx, compound),
    derivedStrip(metrics, step),
  ]
}

function washEditor(step, ctx) {
  const { doc, row: metrics } = ctx
  const compound = doc.compounds.find((c) => c.id === step.solventId) ?? null
  return [
    field('洗液', compoundPicker({
      doc, value: step.solventId, filter: 'solvent', placeholder: '選擇洗液',
      onPick: (choice) => pickCompound(ctx, step.id, 'solventId', choice),
    })),
    amountBlock(step, ctx, compound),
    derivedStrip(metrics, step),
  ]
}

// ── 濃縮 ───────────────────────────────────────────────────────────────────
function evaporateEditor(step, ctx) {
  const { actions, store } = ctx
  return [
    chipRow('方式', Object.entries(EVAPORATE_METHODS).map(([id, meta]) => ({
      id, label: meta.label, active: step.method === id,
    })), (item) => actions.updateStep(step.id, { method: item.id }), { namespace: 'evapMethod' }),
    row([
      numberField('水浴溫度', {
        value: step.temp, suffix: '°C',
        onInput: (value) => actions.updateStep(step.id, { temp: value }, { key: 'temp' }),
        onBlur: () => store.flush(),
      }),
      numberField('壓力', {
        value: step.pressure, suffix: 'mbar',
        onInput: (value) => actions.updateStep(step.id, { pressure: value }, { key: 'pressure' }),
        onBlur: () => store.flush(),
      }),
    ], { tight: true }),
  ]
}

// ── 乾燥 ───────────────────────────────────────────────────────────────────
function dryEditor(step, ctx) {
  const { doc, actions, store } = ctx
  const parts = [
    chipRow('方式', Object.entries(DRY_METHODS).map(([id, meta]) => ({
      id, label: meta.label, active: step.method === id,
    })), (item) => actions.updateStep(step.id, { method: item.id }), { namespace: 'dryMethod' }),
  ]
  if (step.method === 'agent') {
    parts.push(field('乾燥劑', compoundPicker({
      doc, value: step.agentId, filter: 'drying', placeholder: 'MgSO4 / Na2SO4…',
      onPick: (choice) => pickCompound(ctx, step.id, 'agentId', choice),
    })))
  }
  parts.push(row([
    numberField('溫度', {
      value: step.temp, suffix: '°C',
      onInput: (value) => actions.updateStep(step.id, { temp: value }, { key: 'temp' }),
      onBlur: () => store.flush(),
    }),
    numberField('時間', {
      value: step.time, suffix: 'min',
      onInput: (value) => actions.updateStep(step.id, { time: value }, { key: 'time' }),
      onBlur: () => store.flush(),
    }),
  ], { tight: true }))
  return parts
}

// ── 取樣 / 追蹤 ────────────────────────────────────────────────────────────
function monitorEditor(step, ctx) {
  const { actions, store } = ctx
  const missingInterval = step.interval === null || step.interval === undefined
  const intervalField = numberField('取樣間隔（必填）', {
    value: step.interval, suffix: 'min',
    onInput: (value) => actions.updateStep(step.id, { interval: value }, { key: 'interval' }),
    onBlur: () => store.flush(),
  })
  if (missingInterval) intervalField.querySelector('input').style.borderColor = 'var(--warn)'

  return [
    chipRow('方法', Object.entries(MONITOR_METHODS).map(([id, meta]) => ({
      id, label: meta.label, active: step.method === id,
    })), (item) => actions.updateStep(step.id, { method: item.id }), { namespace: 'monitorMethod' }),
    row([
      intervalField,
      textField('終點判定', {
        value: step.criteria,
        placeholder: '原料點消失',
        onInput: (value) => actions.updateStep(step.id, { criteria: value }, { key: 'criteria' }),
        onBlur: () => store.flush(),
      }),
    ]),
  ]
}

const EDITORS = {
  add: addEditor,
  stir: stirEditor,
  extract: extractEditor,
  wash: washEditor,
  evaporate: evaporateEditor,
  dry: dryEditor,
  monitor: monitorEditor,
}

// ── 共用零件 ───────────────────────────────────────────────────────────────

/** 計量按鈕即 amount.mode 的切換，各模式共用同一組數值欄位 */
function amountBlock(step, ctx, compound) {
  const { actions, store } = ctx
  const isSolvent = compound?.role === 'solvent' || compound?.role === 'quench'
  const modes = ['mass', 'volume', 'equiv', 'mol%', ...(isSolvent ? ['vol_per_g'] : [])]
  const mode = step.amount?.mode ?? 'equiv'

  const switcher = el('div', { class: 'modes' }, modes.map((id) =>
    el('button', {
      class: 'mode',
      type: 'button',
      'aria-pressed': mode === id ? 'true' : 'false',
      title: AMOUNT_MODES[id].hint,
      onclick: () => actions.updateAmount(step.id, { mode: id }),
    }, AMOUNT_MODES[id].label),
  ))

  const input = numberInput({
    value: step.amount?.value,
    placeholder: AMOUNT_MODES[mode].unit,
    onInput: (value) => actions.updateAmount(step.id, { value }),
    onBlur: () => store.flush(),
  })

  return el('div', { style: { display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' } }, [
    field('計量', switcher),
    el('div', { class: 'field', style: { flex: '1 1 110px' } }, [
      el('span', { class: 'field__label' }, AMOUNT_MODES[mode].unit),
      input,
    ]),
  ])
}

/** 推導值：驅動欄位以外的三欄為灰色，不可直接編輯 */
function derivedStrip(metrics, step) {
  const strip = el('div', { class: 'derived' })
  if (!metrics) return strip
  const driver = step.amount?.mode ?? null
  const cells = [
    ['mass', 'm', formatMass(metrics.mass)],
    ['volume', 'V', formatVolume(metrics.volume)],
    ['n', 'n', formatAmount(metrics.n)],
    ['equiv', 'eq', metrics.equiv === null ? null : formatEquiv(metrics.equiv)],
  ]
  for (const [key, label, text] of cells) {
    const isDriver = driver === key || (driver === 'mol%' && key === 'equiv') || (driver === 'vol_per_g' && key === 'volume')
    strip.append(el('span', { class: 'derived__item', dataset: { driver: String(isDriver) } }, [
      el('span', {}, label),
      el('b', {}, text ?? '—'),
    ]))
  }
  if (metrics.repeat > 1) {
    strip.append(el('span', { class: 'derived__item' }, [
      el('span', {}, `x${metrics.repeat} 合計`),
      el('b', {}, formatVolume(metrics.totalVolume) ?? formatMass(metrics.totalMass) ?? '—'),
    ]))
  }
  for (const note of metrics.incomplete ?? []) {
    strip.append(el('span', { class: 'derived__item derived__warn' }, note))
  }
  return strip
}

/** 選定化合物後，帶入同型別、同化合物的上次使用值（只填目前還空著的欄位） */
function pickCompound(ctx, stepId, fieldName, choice) {
  const { actions, step } = ctx
  const compoundId = choice.compoundId ?? actions.addCompound(choice.create).id
  const patch = { [fieldName]: compoundId }
  const remembered = recallDefaults(step.type, compoundId)

  for (const [field, value] of Object.entries(remembered)) {
    if (field === 'amountMode') continue
    if (isEmpty(step[field])) patch[field] = value
  }
  if (remembered.amountMode && !isNum(step.amount?.value)) {
    patch.amount = { ...(step.amount ?? {}), mode: remembered.amountMode }
  }
  actions.updateStep(stepId, patch)
}

function isEmpty(value) {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)
}

function labelMinutes(value) {
  if (value >= 60 && value % 60 === 0) return `${value / 60} h`
  return `${value} min`
}
