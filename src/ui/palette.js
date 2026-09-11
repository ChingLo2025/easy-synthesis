// Left panel: step modules (click to append to the end of the sequence), basis settings, compound and template entry points.
import { el, clear } from './dom.js'
import { iconMarkup } from './icons.js'
import { compoundPicker } from './picker.js'
import { STEP_ORDER, STEP_TYPES } from '../model/steps.js'
import { BASIS_UNITS } from '../model/units.js'
import { bumpUsage } from '../state/prefs.js'
import { numberInput } from './fields.js'

const MODULE_HINTS = {
  add: 'Solid, liquid, solution',
  stir: 'Temp, atmosphere, time',
  extract: 'Separate, keep a phase',
  wash: 'Water, brine',
  filter: 'Vacuum, Celite',
  centrifuge: 'Speed, keep a phase',
  evaporate: 'Rotavap, distillation',
  dry: 'Drying agent, oven',
  monitor: 'TLC, HPLC',
}

export function createPalette({ root, store, actions, onOpenCompounds, onOpenTemplates, onSaveTemplate }) {
  function render() {
    const { doc } = store.getState()
    clear(root)
    root.append(
      moduleGroup(),
      basisGroup(doc),
      compoundGroup(doc),
      templateGroup(),
    )
  }

  function moduleGroup() {
    const list = el('div', { class: 'palette__list' })
    for (const type of STEP_ORDER) {
      const meta = STEP_TYPES[type]
      list.append(
        el('button', {
          class: 'module',
          type: 'button',
          dataset: { family: meta.family, type },
          title: `Add a ${meta.label} step`,
          onclick: () => {
            bumpUsage(`module:${type}`)
            actions.addStep(type)
          },
        }, [
          el('span', { class: 'module__icon', html: iconMarkup(meta.icon) }),
          el('span', { class: 'module__text' }, [
            el('span', { class: 'module__label' }, meta.label),
            el('span', { class: 'module__hint' }, MODULE_HINTS[type]),
          ]),
        ]),
      )
    }
    return group('Steps', list)
  }

  function basisGroup(doc) {
    const basis = doc.basis ?? {}
    const picker = compoundPicker({
      doc,
      value: basis.compoundId,
      placeholder: 'Select limiting reagent',
      onPick: (choice) => {
        const id = choice.compoundId ?? actions.addCompound(choice.create).id
        actions.setBasis({ compoundId: id })
      },
    })

    const amount = numberInput({
      name: 'basisAmount',
      value: basis.amount,
      placeholder: 'Basis amount',
      onInput: (value) => actions.setBasis({ amount: value }),
      onBlur: () => store.flush(),
    })

    const unit = el('select', {
      onchange: (event) => actions.setBasis({ unit: event.target.value }),
    }, BASIS_UNITS.map((u) => el('option', { value: u, selected: basis.unit === u }, u)))

    return group('Basis', el('div', { style: { display: 'grid', gap: '6px' }, dataset: { scope: 'basis' } }, [
      picker,
      el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 74px', gap: '6px' } }, [amount, unit]),
      el('div', { class: 'module__hint', style: { padding: '0 2px' } }, 'All equivalents are relative to this'),
    ]))
  }

  function compoundGroup(doc) {
    const count = doc.compounds.length
    return group('Compounds', el('button', {
      class: 'btn',
      type: 'button',
      style: { width: '100%', justifyContent: 'space-between' },
      onclick: onOpenCompounds,
    }, [
      el('span', {}, count ? `${count} compound${count === 1 ? '' : 's'}` : 'None yet'),
      el('span', { class: 'muted', html: iconMarkup('pencil', { size: 14 }) }),
    ]))
  }

  function templateGroup() {
    return group('Templates', el('div', { style: { display: 'grid', gap: '6px' } }, [
      el('button', { class: 'btn', type: 'button', style: { width: '100%' }, onclick: onOpenTemplates }, [
        el('span', { html: iconMarkup('template', { size: 14 }) }),
        el('span', {}, 'Load template'),
      ]),
      el('button', { class: 'btn', type: 'button', style: { width: '100%' }, onclick: onSaveTemplate }, [
        el('span', { html: iconMarkup('download', { size: 14 }) }),
        el('span', {}, 'Save as template'),
      ]),
    ]))
  }

  function group(title, body) {
    return el('div', { class: 'palette__group' }, [el('div', { class: 'palette__title' }, title), body])
  }

  return { render }
}
