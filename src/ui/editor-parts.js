// 編輯器共用零件：計量欄位、推導值、選定化合物後帶入上次使用值、預溶欄位。
import { el } from './dom.js'
import { compoundPicker } from './picker.js'
import { field, numberField, numberInput, row } from './fields.js'
import { AMOUNT_MODES } from '../model/steps.js'
import { formatAmount, formatEquiv, formatMass, formatVolume, isNum } from '../model/units.js'
import { recallDefaults } from '../state/prefs.js'

/** 計量按鈕即 amount.mode 的切換，各模式共用同一組數值欄位 */
export function amountBlock(step, ctx, compound) {
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
    name: 'amount',
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
export function derivedStrip(metrics, step) {
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
export function pickCompound(ctx, stepId, fieldName, choice) {
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

/** 預溶：選溶劑、填體積（mL） */
export function dissolveFields(step, ctx) {
  const { doc, actions, store } = ctx
  return row([
    field('預溶溶劑', compoundPicker({
      doc,
      value: step.dissolve?.solventId ?? null,
      filter: 'solvent',
      placeholder: '選擇溶劑',
      onPick: (choice) => {
        const solventId = choice.compoundId ?? actions.addCompound(choice.create).id
        actions.updateDissolve(step.id, { solventId })
      },
    })),
    numberField('溶劑體積', {
      name: 'dissolveVolume', value: step.dissolve?.volume, suffix: 'mL',
      onInput: (volume) => actions.updateDissolve(step.id, { volume }, { key: 'dissolveVolume' }),
      onBlur: () => store.flush(),
    }),
  ])
}
