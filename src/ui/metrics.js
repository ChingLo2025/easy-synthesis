// 計量表：各步驟 mol / g / mL / equiv 四欄，依 role 分組。
// 驅動欄位為使用者輸入，其餘三欄為推導值，以灰色顯示。
import { el } from './dom.js'
import { iconMarkup } from './icons.js'
import { ROLES } from '../model/steps.js'
import { formatAmount, formatEquiv, formatMass, formatVolume } from '../model/units.js'

const COLUMNS = [
  ['n', 'mol'],
  ['mass', 'g'],
  ['volume', 'mL'],
  ['equiv', 'eq'],
]

export function renderMetrics(doc, metrics) {
  const wrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } })
  if (!metrics.rows.some((row) => row.compound)) {
    wrap.append(el('div', { class: 'flow__empty' }, '尚無可計量的步驟。加入物質後這裡會自動生成計量表。'))
    return wrap
  }

  const table = el('table', { class: 'metrics' })
  table.append(el('thead', {}, el('tr', {}, [
    el('th', {}, '化合物'),
    el('th', {}, '步驟'),
    ...COLUMNS.map(([, unit]) => el('th', {}, unit)),
  ])))

  const body = el('tbody')
  for (const group of metrics.groups) {
    body.append(el('tr', { class: 'metrics__group' }, el('th', { colSpan: 2 + COLUMNS.length }, ROLES[group.role]?.label ?? group.role)))
    for (const row of group.rows) body.append(...dataRows(row))
  }
  table.append(body)
  wrap.append(table)
  wrap.append(totals(doc, metrics))
  return wrap
}

function dataRows(row) {
  const rows = [dataRow(row, { copy: 0 })]
  // 列印時展開為 N 列
  for (let index = 1; index < row.repeat; index += 1) rows.push(dataRow(row, { copy: index }))
  return rows
}

function dataRow(row, { copy }) {
  const compound = row.compound
  const cells = COLUMNS.map(([key]) => {
    const text = formatCell(key, row)
    const isDriver = driverMatches(row.driver, key)
    return el('td', { class: text === null ? 'blank-cell' : isDriver ? 'driver-cell' : 'derived-cell' }, text ?? '—')
  })

  return el('tr', {
    class: copy > 0 ? 'only-print' : '',
    dataset: { depth: String(Math.min(row.depth, 1)), freeform: String(row.freeform) },
  }, [
    el('td', {}, [
      el('span', {}, compound?.name || '—'),
      compound?.cas ? el('small', { class: 'muted' }, ` ${compound.cas}`) : null,
    ]),
    el('td', {}, [
      el('span', { class: 'metrics__no' }, row.number + (row.repeat > 1 ? ` (${copy + 1}/${row.repeat})` : '')),
      row.branchLabel ? el('small', { class: 'muted' }, row.branchLabel) : null,
      row.part === 'dissolve' ? el('small', { class: 'muted' }, ' 預溶') : null,
      row.repeat > 1 && copy === 0 ? el('span', { class: 'metrics__repeat screen-only' }, `x${row.repeat}`) : null,
    ]),
    ...cells,
  ])
}

function formatCell(key, row) {
  switch (key) {
    case 'n': return row.n === null ? null : formatAmount(row.n)
    case 'mass': return row.mass === null ? null : formatMass(row.mass)
    case 'volume': return row.volume === null ? null : formatVolume(row.volume)
    case 'equiv':
      if (row.equiv === null) return null
      if (row.compound?.role === 'solvent' && !driverMatches(row.driver, 'equiv')) return null
      return `${formatEquiv(row.equiv)}`
    default: return null
  }
}

function driverMatches(driver, key) {
  if (driver === key) return true
  if (driver === 'mol%' && key === 'equiv') return true
  if (driver === 'vol_per_g' && key === 'volume') return true
  return false
}

function totals(doc, metrics) {
  const cards = []
  if (metrics.solvent.reaction !== null) {
    cards.push(totalCard('反應槽溶劑', formatVolume(metrics.solvent.reaction), '判斷反應槽容積用'))
  }
  if (metrics.solvent.total !== null) {
    cards.push(totalCard('溶劑總用量', formatVolume(metrics.solvent.total), '含後處理'))
  }
  if (metrics.basis.ok) {
    cards.push(totalCard('基準莫耳數', formatAmount(metrics.basis.n), metrics.basis.compound?.name ?? ''))
  }
  if (metrics.theoretical.n !== null) {
    const value = metrics.theoretical.mass !== null
      ? formatMass(metrics.theoretical.mass)
      : formatAmount(metrics.theoretical.n)
    cards.push(totalCard('理論產量', value, metrics.theoretical.hasProduct
      ? metrics.theoretical.name || '以基準物 100% 轉化計'
      : '設定產物分子量後可換算質量'))
  }
  return el('div', { class: 'totals' }, cards)
}

function totalCard(label, value, hint) {
  return el('div', { class: 'total-card' }, [
    el('div', { class: 'total-card__label' }, label),
    el('div', { class: 'total-card__value' }, value ?? '—'),
    hint ? el('div', { class: 'total-card__hint' }, hint) : null,
  ])
}

export function renderWarnings(metrics) {
  if (!metrics.warnings.length) return null
  return el('div', { class: 'warnings' }, metrics.warnings.map((warning) =>
    el('div', { class: 'warning-item', dataset: { level: warning.level } }, [
      el('span', { html: iconMarkup(warning.level === 'error' ? 'warning' : 'info', { size: 14 }) }),
      el('span', {}, warning.message),
    ]),
  ))
}
