// Flow diagram: central axis. Automatic layout, linear stacking, recursive branches, no layout engine.
import { el } from './dom.js'
import { iconMarkup } from './icons.js'
import { inflowLabel, outflowLabel, stepSummary } from './summary.js'
import { FILTER_KEPT, FILTER_METHODS, STEP_TYPES } from '../model/steps.js'
import { numberSteps } from '../model/schema.js'
import { formatAmount, formatMass } from '../model/units.js'

const ARROW_IN = '<svg class="flow__arrow" width="34" height="12" viewBox="0 0 34 12" aria-hidden="true"><path d="M1 6.5h25"/><polygon points="25.5,3 33,6.5 25.5,10"/></svg>'
const LINK = '<svg width="12" height="24" viewBox="0 0 12 24" aria-hidden="true"><path d="M6.5 1v15"/><polygon points="3,15.5 6.5,22.5 10,15.5"/></svg>'

export function renderFlow(doc, metrics, { selectedId = null, onSelect = null } = {}) {
  const flow = el('div', { class: 'flow' })
  if (!doc.steps.length) {
    flow.append(el('div', { class: 'flow__empty' }, [
      'No steps yet.',
      el('br'),
      'The main stream runs top to bottom along the central axis; added materials enter from the left and removed materials leave to the right.',
    ]))
    return flow
  }

  const numbers = numberSteps(doc.steps)
  appendSteps(flow, doc.steps, { doc, metrics, numbers, selectedId, onSelect, depth: 0 })

  const yieldText = metrics?.theoretical?.hasProduct
    ? [metrics.theoretical.name || 'Product', formatMass(metrics.theoretical.mass) ?? formatAmount(metrics.theoretical.n)]
        .filter(Boolean).join(' ')
    : null
  if (yieldText) {
    flow.append(linkRow())
    flow.append(el('div', { class: 'flow__row' }, [
      el('div'),
      el('div', { class: 'flow__terminus' }, [
        el('span', { html: iconMarkup('vessel', { size: 15 }) }),
        el('span', {}, `Theoretical yield ${yieldText}`),
      ]),
      el('div'),
    ]))
  }
  return flow
}

function appendSteps(host, steps, ctx) {
  steps.forEach((step, index) => {
    if (index > 0 || ctx.depth > 0) host.append(linkRow())
    host.append(stepRow(step, ctx))
    if (step.branch?.steps?.length) host.append(branchRow(step, ctx))
  })
}

function linkRow() {
  return el('div', { class: 'flow__link', html: LINK })
}

function stepRow(step, ctx) {
  const { doc, metrics, numbers, selectedId, onSelect } = ctx
  const meta = STEP_TYPES[step.type]
  const row = metrics?.byStep.get(step.id) ?? null
  const inLabel = inflowLabel(step, row)
  const outLabel = outflowLabel(step, row)

  const node = el('div', {
    class: 'flow__node',
    dataset: {
      family: meta.family,
      selected: String(selectedId === step.id),
      freeform: String(Boolean(step.freeform)),
    },
    onclick: onSelect ? () => onSelect(step.id) : null,
  }, [
    el('span', { class: 'flow__icon', html: iconMarkup(meta.icon) }),
    el('span', { class: 'flow__text' }, [
      el('span', { class: 'flow__title' }, nodeTitle(step, meta, numbers)),
      el('span', { class: 'flow__detail' }, nodeDetail(step, row, doc) || ''),
    ]),
    step.repeat > 1 ? el('span', { class: 'flow__badge' }, `x${step.repeat}`) : null,
  ])

  return el('div', { class: 'flow__row' }, [
    el('div', { class: 'flow__side flow__side--in' }, inLabel ? [
      el('span', { class: 'flow__side-label' }, inLabel),
      el('span', { html: ARROW_IN }),
    ] : []),
    node,
    el('div', { class: 'flow__side flow__side--out' }, outLabel ? [
      el('span', { html: ARROW_IN }),
      el('span', { class: 'flow__side-label' }, outLabel),
    ] : []),
  ])
}

/** Branch: a sub-axis continuing from the right exit, indented to the right, rendered recursively */
function branchRow(step, ctx) {
  const body = el('div', { class: 'flow__branch-body' })
  if (step.branch.label) body.append(el('span', { class: 'flow__branch-label' }, step.branch.label))
  appendSteps(body, step.branch.steps, { ...ctx, depth: ctx.depth + 1 })
  // A branch gets its own row: only indentation on the left, as wide as possible on the right so the sub-axis isn't squeezed
  return el('div', { class: 'flow__branch-row' }, [
    el('div'),
    el('div', { class: 'flow__branch' }, body),
  ])
}

function nodeTitle(step, meta, numbers) {
  const no = numbers.get(step.id)
  return no ? `${no}. ${meta.label}` : meta.label
}

/** Nodes show conditions only; the materials go on the side arrows */
function nodeDetail(step, row, doc) {
  if (step.freeform) return step.freeform.split('\n')[0].slice(0, 48)
  if (step.type === 'add') {
    const bits = []
    if (step.dissolve) bits.push('Pre-dissolve')
    if (step.addMode === 'dropwise') bits.push('Dropwise')
    if (step.vessel) bits.push(step.vessel)
    if (step.note) bits.push(step.note)
    return bits.join(' · ')
  }
  if (step.type === 'filter') {
    return [FILTER_METHODS[step.method]?.label, `Keep ${FILTER_KEPT[step.kept]?.labelEn ?? 'filtrate'}`, step.note]
      .filter(Boolean).join(' · ')
  }
  if (step.type === 'extract' || step.type === 'wash') {
    return step.note || ''
  }
  return stepSummary(step, row, doc)
}
