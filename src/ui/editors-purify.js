// Purification steps: recrystallisation and column chromatography.
import { el } from './dom.js'
import { iconMarkup } from './icons.js'
import { compoundPicker } from './picker.js'
import { chipRow, field, numberField, numberInput, row } from './fields.js'
import { amountBlock, compoundControl, derivedStrip, pickCompound } from './editor-parts.js'
import { eluentSummary } from './summary.js'

/** Recrystallise: dissolve hot, optional antisolvent, then cool and collect */
export function recrystallizeEditor(step, ctx) {
  const { doc, actions, store, row: metrics } = ctx
  const solvent = doc.compounds.find((c) => c.id === step.solventId) ?? null
  const number = (label, name, suffix) => numberField(label, {
    name,
    value: step[name],
    suffix,
    onInput: (value) => actions.updateStep(step.id, { [name]: value }, { key: name }),
    onBlur: () => store.flush(),
  })

  const parts = [
    field('Solvent', compoundControl(ctx, step.solventId, compoundPicker({
      doc,
      value: step.solventId,
      filter: 'solvent',
      placeholder: 'Select solvent',
      onPick: (choice) => pickCompound(ctx, step.id, 'solventId', choice),
    }))),
    amountBlock(step, ctx, solvent),
    row([
      number('Dissolve at', 'tempHot', '°C'),
      number('Cool to', 'tempCold', '°C'),
      number('Hold', 'time', 'min'),
    ], { tight: true }),
    el('div', { style: { display: 'flex', gap: '6px', alignItems: 'flex-end' } }, [
      el('div', { style: { flex: '1', minWidth: '0' } }, field('Antisolvent (optional)', compoundControl(ctx, step.antisolventId, compoundPicker({
        doc,
        value: step.antisolventId,
        filter: 'solvent',
        placeholder: 'None',
        onPick: (choice) => {
          const id = choice.compoundId ?? actions.addCompound(choice.create).id
          actions.updateStep(step.id, { antisolventId: id })
        },
      })))),
      step.antisolventId
        ? el('button', {
            class: 'btn btn--ghost btn--icon',
            type: 'button',
            title: 'No antisolvent',
            onclick: () => actions.updateStep(step.id, { antisolventId: null, antisolventVolume: null }),
            html: iconMarkup('close', { size: 14 }),
          })
        : null,
    ]),
  ]

  if (step.antisolventId) {
    parts.push(row([number('Antisolvent volume', 'antisolventVolume', 'mL')], { tight: true }))
  }

  parts.push(
    chipRow('Collect', [
      { id: 'filtered', label: 'By filtration', active: Boolean(step.filtered) },
    ], () => actions.updateStep(step.id, { filtered: !step.filtered }), { rank: false, namespace: 'filtered' }),
    derivedStrip(metrics, step),
  )
  return parts
}

/**
 * Column chromatography: the eluent is required, several solvents and a gradient are optional.
 * Nothing here is quantified, so no silica or solvent amounts reach the quantities table.
 */
export function columnEditor(step, ctx) {
  const { doc, actions, store } = ctx
  const eluent = step.eluent ?? []
  const hasGradient = Array.isArray(step.gradient)

  const setEluent = (next, gradient = step.gradient) => actions.updateStep(step.id, { eluent: next, gradient })

  const list = el('div', { class: 'eluent-list' }, [
    ...eluent.map((item, index) => el('div', { class: 'eluent-row', dataset: { gradient: String(hasGradient) } }, [
      compoundPicker({
        doc,
        value: item.solventId,
        filter: 'solvent',
        placeholder: 'Select solvent',
        onPick: (choice) => {
          const id = choice.compoundId ?? actions.addCompound(choice.create).id
          setEluent(eluent.map((entry, i) => (i === index ? { ...entry, solventId: id } : entry)))
        },
      }),
      numberInput({
        name: `parts${index}`,
        value: item.parts,
        placeholder: 'parts',
        onInput: (value) => setEluent(eluent.map((entry, i) => (i === index ? { ...entry, parts: value ?? 1 } : entry))),
        onBlur: () => store.flush(),
      }),
      hasGradient
        ? numberInput({
            name: `gradient${index}`,
            value: step.gradient[index],
            placeholder: 'to',
            onInput: (value) => setEluent(eluent, eluent.map((_, i) => (i === index ? (value ?? 1) : (step.gradient?.[i] ?? 1)))),
            onBlur: () => store.flush(),
          })
        : null,
      el('button', {
        class: 'btn btn--ghost btn--icon',
        type: 'button',
        title: 'Remove solvent',
        onclick: () => setEluent(
          eluent.filter((_, i) => i !== index),
          hasGradient ? step.gradient.filter((_, i) => i !== index) : null,
        ),
        html: iconMarkup('close', { size: 14 }),
      }),
    ].filter(Boolean))),
    el('button', {
      class: 'btn',
      type: 'button',
      onclick: () => setEluent(
        [...eluent, { solventId: null, parts: 1 }],
        hasGradient ? [...step.gradient, 1] : null,
      ),
    }, [el('span', { html: iconMarkup('plus', { size: 14 }) }), el('span', {}, 'Add solvent')]),
  ])

  return [
    field(hasGradient ? 'Eluent (parts, then gradient target)' : 'Eluent (parts)', list),
    chipRow('Elution', [
      { id: 'gradient', label: 'Gradient', active: hasGradient },
    ], () => actions.updateStep(step.id, {
      gradient: hasGradient ? null : eluent.map((item) => item.parts ?? 1),
    }), { rank: false, namespace: 'gradient' }),
    el('div', { class: 'module__hint' }, eluent.length
      ? eluentSummary(step, doc)
      : 'Add at least one eluent solvent; the ratio is written into the narrative.'),
  ]
}
