// 文件面板：上半流程圖、下半計量表、頁尾簽名欄；另一分頁為 Experimental section。
import { el, clear } from './dom.js'
import { iconMarkup } from './icons.js'
import { renderFlow } from './flow.js'
import { renderMetrics, renderWarnings } from './metrics.js'
import { generateNarrative, isMarker, narrativeToText } from './narrative.js'

export const DOC_TABS = [
  { id: 'flow', label: '流程圖與計量表', icon: 'flow' },
  { id: 'text', label: 'Experimental', icon: 'text' },
]

export function renderDocument(host, { doc, metrics, tab, selectedId, onSelectStep, onCopy }) {
  clear(host)
  host.append(titleBlock(doc))

  if (tab === 'text') {
    host.append(narrativeSection(doc, metrics, onCopy))
  } else {
    host.append(section('流程圖', `${countSteps(doc)} 個步驟`, renderFlow(doc, metrics, { selectedId, onSelect: onSelectStep })))
    host.append(section('計量表', metrics.basis.compound ? `基準：${metrics.basis.compound.name}` : '尚未設定基準', renderMetrics(doc, metrics)))
    const warnings = renderWarnings(metrics)
    if (warnings) host.append(section('待確認', `${metrics.warnings.length} 項`, warnings))
  }

  host.append(footer(doc))
}

function titleBlock(doc) {
  const meta = doc.meta ?? {}
  const bits = [
    meta.author ? `操作者 ${meta.author}` : null,
    meta.batchNo ? `批號 ${meta.batchNo}` : null,
    meta.date || null,
  ].filter(Boolean)
  return el('div', { class: 'doc-title' }, [
    el('h1', {}, meta.title || '未命名程序'),
    bits.length ? el('div', { class: 'doc-title__meta' }, bits.map((text) => el('span', {}, text))) : null,
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
        el('span', {}, `待補寫 ${narrative.pending} 處（中文 ${narrative.pendingZh}、英文 ${narrative.pendingEn}）`),
      ])
    : el('div', { class: 'narrative__pending', style: { color: 'var(--separate)', background: 'var(--separate-soft)', borderColor: 'var(--separate-line)' } }, [
        el('span', { html: iconMarkup('check', { size: 14 }) }),
        el('span', {}, '沒有待補處'),
      ])

  wrap.append(el('div', { class: 'doc-section__head' }, [
    el('h3', {}, 'Experimental section'),
    el('small', {}, '由結構化資料套模板生成'),
    el('span', { style: { marginLeft: 'auto' } }, pending),
  ]))

  wrap.append(block('中文', narrative.zh, 'zh', onCopy))
  wrap.append(block('English', narrative.en, 'en', onCopy))
  return wrap
}

function block(label, sentences, lang, onCopy) {
  const text = el('p', { class: `narrative__text${lang === 'en' ? ' narrative__text--en' : ''}` })
  if (!sentences.length) {
    text.append(el('span', { class: 'muted' }, '尚無內容'))
  }
  for (const sentence of sentences) {
    // 留白標記加灰底，視覺上明確非最終稿
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
      }, [el('span', { html: iconMarkup('copy', { size: 13 }) }), el('span', {}, '複製純文字')]),
    ]),
    text,
  ])
}

/** 頁尾：批號、日期、操作者、簽名欄 */
function footer(doc) {
  const meta = doc.meta ?? {}
  const cells = [
    ['批號', meta.batchNo],
    ['日期', meta.date],
    ['操作者', meta.author],
    ['簽名', ''],
  ]
  return el('footer', { class: 'doc-footer' }, cells.map(([label, value]) =>
    el('div', { class: 'doc-footer__cell' }, [
      el('div', {}, [
        el('div', { class: 'doc-footer__label' }, label),
        el('div', { class: 'doc-footer__value' }, value || ''),
      ]),
      el('div', { class: 'doc-footer__line' }),
    ]),
  ))
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
