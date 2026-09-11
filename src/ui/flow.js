// 流程圖：中軸線。自動排版，線性堆疊，遞迴渲染分支，不需布局引擎。
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
      '尚未建立任何步驟。',
      el('br'),
      '主物流沿中央垂直軸由上而下，加入的物質從左側進入，移除的物質從右側離開。',
    ]))
    return flow
  }

  const numbers = numberSteps(doc.steps)
  appendSteps(flow, doc.steps, { doc, metrics, numbers, selectedId, onSelect, depth: 0 })

  const yieldText = metrics?.theoretical?.hasProduct
    ? [metrics.theoretical.name || '產物', formatMass(metrics.theoretical.mass) ?? formatAmount(metrics.theoretical.n)]
        .filter(Boolean).join(' ')
    : null
  if (yieldText) {
    flow.append(linkRow())
    flow.append(el('div', { class: 'flow__row' }, [
      el('div'),
      el('div', { class: 'flow__terminus' }, [
        el('span', { html: iconMarkup('vessel', { size: 15 }) }),
        el('span', {}, `理論產量 ${yieldText}`),
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

/** 分支：右側出口接續的子軸，向右縮排，遞迴渲染 */
function branchRow(step, ctx) {
  const body = el('div', { class: 'flow__branch-body' })
  if (step.branch.label) body.append(el('span', { class: 'flow__branch-label' }, step.branch.label))
  appendSteps(body, step.branch.steps, { ...ctx, depth: ctx.depth + 1 })
  // 分支自成一列：左側只留縮排，右側盡量寬，避免子軸被擠爆
  return el('div', { class: 'flow__branch-row' }, [
    el('div'),
    el('div', { class: 'flow__branch' }, body),
  ])
}

function nodeTitle(step, meta, numbers) {
  const no = numbers.get(step.id)
  return no ? `${no}. ${meta.label}` : meta.label
}

/** 節點只放條件；物質本身在側向箭頭上 */
function nodeDetail(step, row, doc) {
  if (step.freeform) return step.freeform.split('\n')[0].slice(0, 48)
  if (step.type === 'add') {
    const bits = []
    if (step.dissolve) bits.push('預溶')
    if (step.addMode === 'dropwise') bits.push('滴加')
    if (step.vessel) bits.push(step.vessel)
    if (step.note) bits.push(step.note)
    return bits.join(' · ')
  }
  if (step.type === 'filter') {
    return [FILTER_METHODS[step.method]?.label, `保留${FILTER_KEPT[step.kept]?.label ?? '濾液'}`, step.note]
      .filter(Boolean).join(' · ')
  }
  if (step.type === 'extract' || step.type === 'wash') {
    return step.note || ''
  }
  return stepSummary(step, row, doc)
}
