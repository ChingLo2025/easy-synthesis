// 每個步驟型別的欄位編輯器。所有型別皆可切換為 freeform 手動輸入（由卡片外殼處理）。
import { el } from './dom.js'
import { compoundPicker } from './picker.js'
import { chipRow, field, numberField, onTextInput, row, selectField, textField } from './fields.js'
import { amountBlock, derivedStrip, dissolveFields, pickCompound } from './editor-parts.js'
import { centrifugeEditor, filterEditor } from './editors-workup.js'
import {
  ATMOSPHERES, DRY_METHODS, EVAPORATE_METHODS,
  MONITOR_METHODS, PHASES, RAMPS, STIR_SPECIALS,
} from '../model/steps.js'

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
        name: 'vessel',
        value: step.vessel ?? '',
        placeholder: '250 mL 圓底燒瓶',
        ...onTextInput((vessel) => actions.updateStep(step.id, { vessel }, { key: 'vessel' })),
        onblur: () => store.flush(),
      })),
    ]),
    amountBlock(step, ctx, compound),
    chipRow('加法', [
      { id: 'once', label: '一次加入', active: step.addMode === 'once' },
      { id: 'dropwise', label: '滴加', active: step.addMode === 'dropwise' },
    ], (item) => actions.updateStep(step.id, { addMode: item.id }), { namespace: 'addMode' }),
    chipRow('預溶', [
      { id: 'dissolve', label: '先溶於溶劑再加入', active: Boolean(step.dissolve) },
    ], () => actions.updateDissolve(step.id, step.dissolve ? null : {}), { rank: false, namespace: 'dissolve' }),
  ]
  if (step.dissolve) parts.push(dissolveFields(step, ctx))

  if (step.addMode === 'dropwise') {
    parts.push(row([
      numberField('滴加時間', {
        name: 'duration', value: step.duration, suffix: 'min',
        onInput: (value) => actions.updateStep(step.id, { duration: value }, { key: 'duration' }),
        onBlur: () => store.flush(),
      }),
      numberField('速率', {
        name: 'rate', value: step.rate, suffix: 'mL/min',
        onInput: (value) => actions.updateStep(step.id, { rate: value }, { key: 'rate' }),
        onBlur: () => store.flush(),
      }),
      numberField('溫控上限', {
        name: 'tempMax', value: step.tempMax, suffix: '°C',
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
      numberField(step.ramp ? '目標溫度' : '溫度', {
        name: 'temp', value: step.temp, suffix: '°C',
        onInput: (value) => actions.updateStep(step.id, { temp: value }, { key: 'temp' }),
        onBlur: () => store.flush(),
      }),
      numberField('時間', {
        name: 'time', value: step.time, suffix: 'min',
        onInput: (value) => actions.updateStep(step.id, { time: value }, { key: 'time' }),
        onBlur: () => store.flush(),
      }),
      numberField('轉速', {
        name: 'rpm', value: step.rpm, suffix: 'rpm',
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
    chipRow('升降溫', Object.entries(RAMPS).map(([id, meta]) => ({
      id, label: meta.label, active: step.ramp === id,
    })), (item) => actions.updateStep(step.id, { ramp: step.ramp === item.id ? null : item.id }), { rank: false, namespace: 'ramp' }),
    step.ramp ? row([
      numberField(RAMPS[step.ramp].rateLabel, {
        name: 'rampRate', value: step.rampRate, suffix: '°C/min', placeholder: '選填',
        onInput: (value) => actions.updateStep(step.id, { rampRate: value }, { key: 'rampRate' }),
        onBlur: () => store.flush(),
      }),
    ], { tight: true }) : null,
    chipRow('時間', TIME_PRESETS.map((value) => ({
      id: `m${value}`, label: labelMinutes(value), value, active: step.time === value,
    })), (item) => actions.updateStep(step.id, { time: item.value }), { namespace: 'time' }),
    chipRow('條件', Object.entries(STIR_SPECIALS).map(([id, meta]) => ({
      id, label: meta.label, active: specials.includes(id),
    })), (item) => {
      const next = specials.includes(item.id) ? specials.filter((s) => s !== item.id) : [...specials, item.id]
      actions.updateStep(step.id, { special: next })
    }, { namespace: 'special' }),
  ].filter(Boolean)
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
        name: 'temp', value: step.temp, suffix: '°C',
        onInput: (value) => actions.updateStep(step.id, { temp: value }, { key: 'temp' }),
        onBlur: () => store.flush(),
      }),
      numberField('壓力', {
        name: 'pressure', value: step.pressure, suffix: 'mbar',
        onInput: (value) => actions.updateStep(step.id, { pressure: value }, { key: 'pressure' }),
        onBlur: () => store.flush(),
      }),
      numberField('時間', {
        name: 'time', value: step.time, suffix: 'min', placeholder: '選填',
        onInput: (value) => actions.updateStep(step.id, { time: value }, { key: 'time' }),
        onBlur: () => store.flush(),
      }),
    ], { tight: true }),
    chipRow('終點', [
      { id: 'dry', label: '抽至乾', active: Boolean(step.toDryness) },
    ], () => actions.updateStep(step.id, { toDryness: !step.toDryness }), { rank: false, namespace: 'toDryness' }),
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
      name: 'temp', value: step.temp, suffix: '°C',
      onInput: (value) => actions.updateStep(step.id, { temp: value }, { key: 'temp' }),
      onBlur: () => store.flush(),
    }),
    numberField('時間', {
      name: 'time', value: step.time, suffix: 'min',
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
    name: 'interval', value: step.interval, suffix: 'min',
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
        name: 'criteria',
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
  filter: filterEditor,
  centrifuge: centrifugeEditor,
  evaporate: evaporateEditor,
  dry: dryEditor,
  monitor: monitorEditor,
}

// ── 共用零件 ───────────────────────────────────────────────────────────────

function labelMinutes(value) {
  if (value >= 60 && value % 60 === 0) return `${value / 60} h`
  return `${value} min`
}
