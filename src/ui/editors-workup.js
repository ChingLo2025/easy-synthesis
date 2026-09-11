// 後處理的分離步驟：過濾、離心。
import { el } from './dom.js'
import { iconMarkup } from './icons.js'
import { compoundPicker } from './picker.js'
import { chipRow, field, numberField, row } from './fields.js'
import { amountBlock, derivedStrip, pickCompound } from './editor-parts.js'
import { CENTRIFUGE_KEPT, FILTER_KEPT, FILTER_METHODS, SPEED_UNITS } from '../model/steps.js'

/** 過濾：方式、保留濾液或濾餅；濾餅洗液選填，選了才顯示計量與洗滌次數 */
export function filterEditor(step, ctx) {
  const { doc, actions, store, row: metrics } = ctx
  const rinse = doc.compounds.find((c) => c.id === step.solventId) ?? null
  const parts = [
    chipRow('方式', Object.entries(FILTER_METHODS).map(([id, meta]) => ({
      id, label: meta.label, active: step.method === id,
    })), (item) => actions.updateStep(step.id, { method: item.id }), { namespace: 'filterMethod' }),
    chipRow('保留', Object.entries(FILTER_KEPT).map(([id, meta]) => ({
      id, label: meta.label, active: step.kept === id,
    })), (item) => actions.updateStep(step.id, { kept: item.id }), { rank: false, namespace: 'filterKept' }),
    el('div', { style: { display: 'flex', gap: '6px', alignItems: 'flex-end' } }, [
      el('div', { style: { flex: '1', minWidth: '0' } }, field('濾餅洗液（選填）', compoundPicker({
        doc,
        value: step.solventId,
        filter: 'solvent',
        placeholder: '不洗滌',
        onPick: (choice) => pickCompound(ctx, step.id, 'solventId', choice),
      }))),
      rinse
        ? el('button', {
            class: 'btn btn--ghost btn--icon',
            type: 'button',
            title: '不洗滌',
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
      numberField('洗滌次數', {
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

/** 離心：轉速（rpm 或 ×g）、時間、溫度、保留沉澱或上清液 */
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
      number('轉速', 'speed', SPEED_UNITS[step.speedUnit]?.label ?? 'rpm'),
      number('時間', 'time', 'min'),
      number('溫度', 'temp', '°C'),
    ], { tight: true }),
    chipRow('單位', Object.entries(SPEED_UNITS).map(([id, meta]) => ({
      id, label: meta.label, active: step.speedUnit === id,
    })), (item) => actions.updateStep(step.id, { speedUnit: item.id }), { rank: false, namespace: 'speedUnit' }),
    chipRow('保留', Object.entries(CENTRIFUGE_KEPT).map(([id, meta]) => ({
      id, label: meta.label, active: step.kept === id,
    })), (item) => actions.updateStep(step.id, { kept: item.id }), { rank: false, namespace: 'centrifugeKept' }),
  ]
}
