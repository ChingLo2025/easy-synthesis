// Document panel: title row with batch / date / operator, flow diagram, quantities table; the other tab is the Experimental section.
import { el, clear } from './dom.js'
import { iconMarkup } from './icons.js'
import { renderFlow } from './flow.js'
import { renderMetrics, renderWarnings } from './metrics.js'
import { generateNarrative, isMarker, narrativeToText } from './narrative.js'

export const DOC_TABS = [
  { id: 'flow', label: 'Flow & quantities', icon: 'flow' },
  { id: 'text', label: 'Experimental', icon: 'text' },
]

export function renderDocument(host, { doc, metrics, tab, selectedId, onSelectStep, onCopy }) {
  clear(host)
  host.append(titleBlock(doc))

  if (tab === 'text') {
    host.append(narrativeSection(doc, metrics, onCopy))
  } else {
    host.append(section('Flow diagram', `${countSteps(doc)} steps`, renderFlow(doc, metrics, { selectedId, onSelect: onSelectStep })))
    host.append(section('Quantities', metrics.basis.compound ? `Basis: ${metrics.basis.compound.name}` : 'No basis set', renderMetrics(doc, metrics)))
    const warnings = renderWarnings(metrics)
    if (warnings) host.append(section('To review', `${metrics.warnings.length} items`, warnings))
  }
}

/** Batch, date and operator, shown once beside the title; empty values stay as blanks to fill in by hand */
export function docMetaItems(meta = {}) {
  return [
    ['Batch', meta.batchNo ?? ''],
    ['Date', meta.date ?? ''],
    ['Operator', meta.author ?? ''],
  ]
}

/** Title row: the title on the left, batch / date / operator beside it; the signature blank only prints */
function titleBlock(doc) {
  const meta = doc.meta ?? {}
  const item = (label, value, extra = '') => el('span', { class: `doc-title__item${extra}` }, [
    el('span', { class: 'doc-title__label' }, label),
    value ? el('span', { class: 'doc-title__value' }, value) : el('span', { class: 'doc-title__blank' }),
  ])
  return el('div', { class: 'doc-title' }, [
    el('h1', {}, meta.title || 'Untitled procedure'),
    el('div', { class: 'doc-title__meta' }, [
      ...docMetaItems(meta).map(([label, value]) => item(label, value)),
      item('Signature', '', ' only-print-inline'),
    ]),
  ])
}

function section(title, hint, body) {
  return el('section', { class: 'doc-section' }, [
    el('div', { class: 'doc-section__head' }, [el('h3', {}, title), hint ? el('small', {}, hint) : null]),
    body,
  ])
}

function narrativeSection(doc, metrics, onCopy) {
  const narrative = generateNarrative(doc, metrics)
  const wrap = el('div', { class: 'narrative' })

  const pending = narrative.pending
    ? el('div', { class: 'narrative__pending' }, [
        el('span', { html: iconMarkup('warning', { size: 14 }) }),
        el('span', {}, `${narrative.pending} to be written (Chinese ${narrative.pendingZh}, English ${narrative.pendingEn})`),
      ])
    : el('div', { class: 'narrative__pending', style: { color: 'var(--separate)', background: 'var(--separate-soft)', borderColor: 'var(--separate-line)' } }, [
        el('span', { html: iconMarkup('check', { size: 14 }) }),
        el('span', {}, 'Nothing pending'),
      ])

  wrap.append(el('div', { class: 'doc-section__head' }, [
    el('h3', {}, 'Experimental section'),
    el('small', {}, 'Generated from structured data via templates'),
    el('span', { style: { marginLeft: 'auto' } }, pending),
  ]))

  wrap.append(block('Chinese', narrative.zh, 'zh', onCopy))
  wrap.append(block('English', narrative.en, 'en', onCopy))
  return wrap
}

function block(label, sentences, lang, onCopy) {
  const text = el('p', { class: `narrative__text${lang === 'en' ? ' narrative__text--en' : ''}` })
  if (!sentences.length) {
    text.append(el('span', { class: 'muted' }, 'No content yet'))
  }
  for (const sentence of sentences) {
    // Blank markers get a grey background so they are clearly not final text
    text.append(isMarker(sentence) ? el('span', { class: 'blank-marker' }, sentence) : document.createTextNode(sentence))
    if (lang === 'en') text.append(document.createTextNode(' '))
  }
  return el('div', { class: 'narrative__block' }, [
    el('div', { class: 'narrative__label', style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
      el('span', {}, label),
      el('button', {
        class: 'btn btn--ghost no-print',
        type: 'button',
        style: { height: '22px', fontSize: '11.5px' },
        onclick: () => onCopy?.(narrativeToText(sentences, lang), sentences.some(isMarker)),
      }, [el('span', { html: iconMarkup('copy', { size: 13 }) }), el('span', {}, 'Copy plain text')]),
    ]),
    text,
  ])
}

function countSteps(doc) {
  let count = 0
  const walk = (steps) => steps.forEach((step) => {
    count += 1
    if (step.branch?.steps) walk(step.branch.steps)
  })
  walk(doc.steps)
  return count
}
