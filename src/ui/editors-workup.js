// Workup separation steps: filtration and centrifugation.
import { el } from './dom.js'
import { iconMarkup } from './icons.js'
import { compoundPicker } from './picker.js'
import { chipRow, field, numberField, row } from './fields.js'
import { amountBlock, derivedStrip, pickCompound } from './editor-parts.js'
import { CENTRIFUGE_KEPT, FILTER_KEPT, FILTER_METHODS, SPEED_UNITS } from '../model/steps.js'

/** Filter: method, keep filtrate or solid; the cake rinse is optional, and its amount and rinse count show only once chosen */
export function filterEditor(step, ctx) {
  const { doc, actions, store, row: metrics } = ctx
  const rinse = doc.compounds.find((c) => c.id === step.solventId) ?? null
  const parts = [
    chipRow('Method', Object.entries(FILTER_METHODS).map(([id, meta]) => ({
      id, label: meta.label, active: step.method === id,
    })), (item) => actions.updateStep(step.id, { method: item.id }), { namespace: 'filterMethod' }),
    chipRow('Keep', Object.entries(FILTER_KEPT).map(([id, meta]) => ({
      id, label: meta.label, active: step.kept === id,
    })), (item) => actions.updateStep(step.id, { kept: item.id }), { rank: false, namespace: 'filterKept' }),
    el('div', { style: { display: 'flex', gap: '6px', alignItems: 'flex-end' } }, [
      el('div', { style: { flex: '1', minWidth: '0' } }, field('Cake rinse (optional)', compoundPicker({
        doc,
        value: step.solventId,
        filter: 'solvent',
        placeholder: 'No rinse',
        onPick: (choice) => pickCompound(ctx, step.id, 'solventId', choice),
      }))),
      rinse
        ? el('button', {
            class: 'btn btn--ghost btn--icon',
            type: 'button',
            title: 'No rinse',
            onclick: () => actions.updateStep(step.id, { solventId: null }),
            html: iconMarkup('close', { size: 14 }),
          })
        : null,
    ]),
  ]
  if (!rinse) return parts

  return [
    ...parts,
    amountBlock(step, ctx, rinse),
    row([
      numberField('Rinses', {
        name: 'rinseCount',
        value: step.rinseCount,
        placeholder: '1',
        onInput: (value) => actions.updateStep(step.id, { rinseCount: Math.max(1, Math.round(value ?? 1)) }, { key: 'rinseCount' }),
        onBlur: () => store.flush(),
      }),
    ], { tight: true }),
    derivedStrip(metrics, step),
  ]
}

/** Centrifuge: speed (rpm or ×g), time, temperature, keep pellet or supernatant */
export function centrifugeEditor(step, ctx) {
  const { actions, store } = ctx
  const number = (label, name, suffix) => numberField(label, {
    name,
    value: step[name],
    suffix,
    onInput: (value) => actions.updateStep(step.id, { [name]: value }, { key: name }),
    onBlur: () => store.flush(),
  })
  return [
    row([
      number('Speed', 'speed', SPEED_UNITS[step.speedUnit]?.label ?? 'rpm'),
      number('Time', 'time', 'min'),
      number('Temp', 'temp', '°C'),
    ], { tight: true }),
    chipRow('Unit', Object.entries(SPEED_UNITS).map(([id, meta]) => ({
      id, label: meta.label, active: step.speedUnit === id,
    })), (item) => actions.updateStep(step.id, { speedUnit: item.id }), { rank: false, namespace: 'speedUnit' }),
    chipRow('Keep', Object.entries(CENTRIFUGE_KEPT).map(([id, meta]) => ({
      id, label: meta.label, active: step.kept === id,
    })), (item) => actions.updateStep(step.id, { kept: item.id }), { rank: false, namespace: 'centrifugeKept' }),
  ]
}
