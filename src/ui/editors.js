// Field editors for each step type. Every type can switch to freeform manual entry (handled by the card shell).
import { el } from './dom.js'
import { iconMarkup } from './icons.js'
import { compoundPicker } from './picker.js'
import { chipRow, field, numberField, onTextInput, row, selectField, textField } from './fields.js'
import { amountBlock, compoundControl, derivedStrip, dissolveFields, pickCompound } from './editor-parts.js'
import { centrifugeEditor, filterEditor } from './editors-workup.js'
import { columnEditor, recrystallizeEditor } from './editors-purify.js'
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

// ── Add ───────────────────────────────────────────────────────────────
function addEditor(step, ctx) {
  const { doc, actions, store, row: metrics } = ctx
  const compound = doc.compounds.find((c) => c.id === step.compoundId) ?? null
  const parts = [
    row([
      field('Compound', compoundControl(ctx, step.compoundId, compoundPicker({
        doc,
        value: step.compoundId,
        onPick: (choice) => pickCompound(ctx, step.id, 'compoundId', choice),
      }))),
      field('Vessel', el('input', {
        type: 'text',
        name: 'vessel',
        value: step.vessel ?? '',
        placeholder: '250 mL round-bottom flask',
        ...onTextInput((vessel) => actions.updateStep(step.id, { vessel }, { key: 'vessel' })),
        onblur: () => store.flush(),
      })),
    ]),
    amountBlock(step, ctx, compound),
    chipRow('Mode', [
      { id: 'once', label: 'All at once', active: step.addMode === 'once' },
      { id: 'dropwise', label: 'Dropwise', active: step.addMode === 'dropwise' },
    ], (item) => actions.updateStep(step.id, { addMode: item.id }), { namespace: 'addMode' }),
    chipRow('Pre-dissolve', [
      { id: 'dissolve', label: 'Dissolve in solvent first', active: Boolean(step.dissolve) },
    ], () => actions.updateDissolve(step.id, step.dissolve ? null : {}), { rank: false, namespace: 'dissolve' }),
  ]
  if (step.dissolve) parts.push(dissolveFields(step, ctx))

  if (step.addMode === 'dropwise') {
    parts.push(row([
      numberField('Addition time', {
        name: 'duration', value: step.duration, suffix: 'min',
        onInput: (value) => actions.updateStep(step.id, { duration: value }, { key: 'duration' }),
        onBlur: () => store.flush(),
      }),
      numberField('Rate', {
        name: 'rate', value: step.rate, suffix: 'mL/min',
        onInput: (value) => actions.updateStep(step.id, { rate: value }, { key: 'rate' }),
        onBlur: () => store.flush(),
      }),
      numberField('Max temp', {
        name: 'tempMax', value: step.tempMax, suffix: '°C',
        onInput: (value) => actions.updateStep(step.id, { tempMax: value }, { key: 'tempMax' }),
        onBlur: () => store.flush(),
      }),
    ], { tight: true }))
  }

  parts.push(derivedStrip(metrics, step))
  return parts
}

// ── Stir ───────────────────────────────────────────────────────────────────
function stirEditor(step, ctx) {
  const { actions, store } = ctx
  const specials = step.special ?? []
  return [
    row([
      numberField(step.ramp ? 'Target temp' : 'Temp', {
        name: 'temp', value: step.temp, suffix: '°C',
        onInput: (value) => actions.updateStep(step.id, { temp: value }, { key: 'temp' }),
        onBlur: () => store.flush(),
      }),
      numberField('Time', {
        name: 'time', value: step.time, suffix: 'min',
        onInput: (value) => actions.updateStep(step.id, { time: value }, { key: 'time' }),
        onBlur: () => store.flush(),
      }),
      numberField('Stir rate', {
        name: 'rpm', value: step.rpm, suffix: 'rpm',
        onInput: (value) => actions.updateStep(step.id, { rpm: value }, { key: 'rpm' }),
        onBlur: () => store.flush(),
      }),
    ], { tight: true }),
    chipRow('Atmosphere', Object.entries(ATMOSPHERES).map(([id, meta]) => ({
      id, label: meta.label, active: step.atm === id,
    })), (item) => actions.updateStep(step.id, { atm: item.id }), { namespace: 'atm' }),
    chipRow('Temp', TEMP_PRESETS.map((value) => ({
      id: `t${value}`, label: `${value} °C`, value, active: step.temp === value,
    })), (item) => actions.updateStep(step.id, { temp: item.value }), { namespace: 'temp' }),
    chipRow('Ramp', Object.entries(RAMPS).map(([id, meta]) => ({
      id, label: meta.label, active: step.ramp === id,
    })), (item) => actions.updateStep(step.id, { ramp: step.ramp === item.id ? null : item.id }), { rank: false, namespace: 'ramp' }),
    step.ramp ? row([
      numberField(RAMPS[step.ramp].rateLabel, {
        name: 'rampRate', value: step.rampRate, suffix: '°C/min', placeholder: 'Optional',
        onInput: (value) => actions.updateStep(step.id, { rampRate: value }, { key: 'rampRate' }),
        onBlur: () => store.flush(),
      }),
    ], { tight: true }) : null,
    chipRow('Time', TIME_PRESETS.map((value) => ({
      id: `m${value}`, label: labelMinutes(value), value, active: step.time === value,
    })), (item) => actions.updateStep(step.id, { time: item.value }), { namespace: 'time' }),
    chipRow('Conditions', Object.entries(STIR_SPECIALS).map(([id, meta]) => ({
      id, label: meta.label, active: specials.includes(id),
    })), (item) => {
      const next = specials.includes(item.id) ? specials.filter((s) => s !== item.id) : [...specials, item.id]
      actions.updateStep(step.id, { special: next })
    }, { namespace: 'special' }),
  ].filter(Boolean)
}

// ── Extract / Wash ────────────────────────────────────────────────────────────
function extractEditor(step, ctx) {
  const { doc, actions, store, row: metrics } = ctx
  const compound = doc.compounds.find((c) => c.id === step.solventId) ?? null
  const ratio = Array.isArray(step.ratio) ? step.ratio : [1, 1]
  const setRatio = (index, value) => actions.updateStep(step.id, {
    ratio: ratio.map((part, i) => (i === index ? (value ?? 1) : part)),
  }, { key: `ratio${index}` })

  const parts = [
    row([
      field('Solvent', compoundControl(ctx, step.solventId, compoundPicker({
        doc, value: step.solventId, filter: 'solvent', placeholder: 'Select solvent',
        onPick: (choice) => pickCompound(ctx, step.id, 'solventId', choice),
      }))),
      selectField('Keep phase', {
        value: step.phaseKept,
        options: Object.entries(PHASES).map(([id, meta]) => [id, meta.label]),
        onChange: (value) => actions.updateStep(step.id, { phaseKept: value }),
      }),
    ]),
    // A co-solvent is mixed into the same portion; the ratio splits the amount between the two
    el('div', { style: { display: 'flex', gap: '6px', alignItems: 'flex-end' } }, [
      el('div', { style: { flex: '1', minWidth: '0' } }, field('Co-solvent (optional)', compoundControl(ctx, step.solvent2Id, compoundPicker({
        doc, value: step.solvent2Id, filter: 'solvent', placeholder: 'None',
        onPick: (choice) => {
          const id = choice.compoundId ?? actions.addCompound(choice.create).id
          actions.updateStep(step.id, { solvent2Id: id })
        },
      })))),
      step.solvent2Id
        ? el('button', {
            class: 'btn btn--ghost btn--icon',
            type: 'button',
            title: 'No co-solvent',
            onclick: () => actions.updateStep(step.id, { solvent2Id: null }),
            html: iconMarkup('close', { size: 14 }),
          })
        : null,
    ]),
  ]

  if (step.solvent2Id) {
    parts.push(row([
      numberField('Parts solvent', {
        name: 'ratioA', value: ratio[0],
        onInput: (value) => setRatio(0, value),
        onBlur: () => store.flush(),
      }),
      numberField('Parts co-solvent', {
        name: 'ratioB', value: ratio[1],
        onInput: (value) => setRatio(1, value),
        onBlur: () => store.flush(),
      }),
    ], { tight: true }))
  }

  parts.push(amountBlock(step, ctx, compound), derivedStrip(metrics, step))
  return parts
}

function washEditor(step, ctx) {
  const { doc, row: metrics } = ctx
  const compound = doc.compounds.find((c) => c.id === step.solventId) ?? null
  return [
    field('Wash solution', compoundControl(ctx, step.solventId, compoundPicker({
      doc, value: step.solventId, filter: 'solvent', placeholder: 'Select wash solution',
      onPick: (choice) => pickCompound(ctx, step.id, 'solventId', choice),
    }))),
    amountBlock(step, ctx, compound),
    derivedStrip(metrics, step),
  ]
}

// ── Concentrate ───────────────────────────────────────────────────────────────────
function evaporateEditor(step, ctx) {
  const { actions, store } = ctx
  return [
    chipRow('Method', Object.entries(EVAPORATE_METHODS).map(([id, meta]) => ({
      id, label: meta.label, active: step.method === id,
    })), (item) => actions.updateStep(step.id, { method: item.id }), { namespace: 'evapMethod' }),
    row([
      numberField('Bath temp', {
        name: 'temp', value: step.temp, suffix: '°C',
        onInput: (value) => actions.updateStep(step.id, { temp: value }, { key: 'temp' }),
        onBlur: () => store.flush(),
      }),
      numberField('Pressure', {
        name: 'pressure', value: step.pressure, suffix: 'mbar',
        onInput: (value) => actions.updateStep(step.id, { pressure: value }, { key: 'pressure' }),
        onBlur: () => store.flush(),
      }),
      numberField('Time', {
        name: 'time', value: step.time, suffix: 'min', placeholder: 'Optional',
        onInput: (value) => actions.updateStep(step.id, { time: value }, { key: 'time' }),
        onBlur: () => store.flush(),
      }),
    ], { tight: true }),
    chipRow('End point', [
      { id: 'dry', label: 'To dryness', active: Boolean(step.toDryness) },
    ], () => actions.updateStep(step.id, { toDryness: !step.toDryness }), { rank: false, namespace: 'toDryness' }),
  ]
}

// ── Dry ───────────────────────────────────────────────────────────────────
function dryEditor(step, ctx) {
  const { doc, actions, store } = ctx
  const parts = [
    chipRow('Method', Object.entries(DRY_METHODS).map(([id, meta]) => ({
      id, label: meta.label, active: step.method === id,
    })), (item) => actions.updateStep(step.id, { method: item.id }), { namespace: 'dryMethod' }),
  ]
  if (step.method === 'agent') {
    parts.push(field('Drying agent', compoundControl(ctx, step.agentId, compoundPicker({
      doc, value: step.agentId, filter: 'drying', placeholder: 'MgSO4 / Na2SO4…',
      onPick: (choice) => pickCompound(ctx, step.id, 'agentId', choice),
    }))))
  }
  parts.push(row([
    numberField('Temp', {
      name: 'temp', value: step.temp, suffix: '°C',
      onInput: (value) => actions.updateStep(step.id, { temp: value }, { key: 'temp' }),
      onBlur: () => store.flush(),
    }),
    numberField('Time', {
      name: 'time', value: step.time, suffix: 'min',
      onInput: (value) => actions.updateStep(step.id, { time: value }, { key: 'time' }),
      onBlur: () => store.flush(),
    }),
  ], { tight: true }))
  return parts
}

// ── Monitor ────────────────────────────────────────────────────────────
function monitorEditor(step, ctx) {
  const { actions, store } = ctx
  const missingInterval = step.interval === null || step.interval === undefined
  const intervalField = numberField('Interval (required)', {
    name: 'interval', value: step.interval, suffix: 'min',
    onInput: (value) => actions.updateStep(step.id, { interval: value }, { key: 'interval' }),
    onBlur: () => store.flush(),
  })
  if (missingInterval) intervalField.querySelector('input').style.borderColor = 'var(--warn)'

  return [
    chipRow('Method', Object.entries(MONITOR_METHODS).map(([id, meta]) => ({
      id, label: meta.label, active: step.method === id,
    })), (item) => actions.updateStep(step.id, { method: item.id }), { namespace: 'monitorMethod' }),
    row([
      intervalField,
      textField('End point', {
        name: 'criteria',
        value: step.criteria,
        placeholder: 'Starting material consumed',
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
  recrystallize: recrystallizeEditor,
  column: columnEditor,
  dry: dryEditor,
  monitor: monitorEditor,
}

// ── Shared parts ───────────────────────────────────────────────────────────────

function labelMinutes(value) {
  if (value >= 60 && value % 60 === 0) return `${value / 60} h`
  return `${value} min`
}
