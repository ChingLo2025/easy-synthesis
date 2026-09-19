// Quantities table: mol / g / mL / equiv per step, grouped by role.
// The driving field is user input; the other three columns are derived and shown in grey.
import { el } from './dom.js'
import { iconMarkup } from './icons.js'
import { ROLES } from '../model/steps.js'
import { formatAmount, formatEquiv, formatMass, formatVolume } from '../model/units.js'

/** Auxiliary rows are tagged so the table shows why a solvent is listed twice */
const PART_LABELS = { dissolve: 'pre-dissolve', cosolvent: 'co-solvent', antisolvent: 'antisolvent' }

const COLUMNS = [
  ['n', 'mol'],
  ['mass', 'g'],
  ['volume', 'mL'],
  ['equiv', 'eq'],
]

export function renderMetrics(doc, metrics, { hidden = {}, onToggle = null } = {}) {
  const wrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } })
  if (!metrics.rows.some((row) => row.compound)) {
    wrap.append(el('div', { class: 'flow__empty' }, 'Nothing to quantify yet. The table fills in automatically once you add materials.'))
    return wrap
  }

  const table = el('table', { class: 'metrics' })
  table.append(el('thead', {}, el('tr', {}, [
    el('th', {}, 'Compound'),
    el('th', {}, 'Step'),
    ...COLUMNS.map(([, unit]) => el('th', {}, unit)),
  ])))

  const body = el('tbody')
  for (const group of quantityGroups(metrics, hidden)) {
    body.append(groupHeader(group, onToggle))
    if (group.open) for (const row of group.rows) body.append(...dataRows(row))
  }
  table.append(body)
  // Scrolls sideways on narrow screens instead of widening the page
  wrap.append(el('div', { class: 'metrics-scroll' }, table))
  return wrap
}

/** Solvent and yield cards; their own block, so they can be hidden from the printout */
export function renderTotals(doc, metrics) {
  return totals(doc, metrics)
}

/** Role groups with their hide state; ids share the document's hidden-blocks map as `role-<role>` */
export function quantityGroups(metrics, hidden = {}) {
  return metrics.groups.map((group) => {
    const id = `role-${group.role}`
    return { ...group, id, open: !hidden[id] }
  })
}

/** A hidden group keeps its header on screen, so it can be shown again, but prints nothing */
function groupHeader(group, onToggle) {
  const label = ROLES[group.role]?.label ?? group.role
  return el('tr', {
    class: group.open ? 'metrics__group' : 'metrics__group no-print',
    dataset: { hidden: String(!group.open) },
  }, el('th', { colSpan: 2 + COLUMNS.length }, el('span', { class: 'metrics__group-head' }, [
    onToggle
      ? el('button', {
          class: 'btn btn--ghost btn--icon no-print metrics__toggle',
          type: 'button',
          'aria-expanded': String(group.open),
          title: group.open ? `Hide ${label} rows (hidden rows are not printed)` : `Show ${label} rows`,
          onclick: () => onToggle(group.id),
          html: iconMarkup(group.open ? 'chevronDown' : 'chevronRight', { size: 13 }),
        })
      : null,
    el('span', {}, label),
    group.open ? null : el('small', { class: 'muted' }, `${group.rows.length} hidden`),
  ])))
}

function dataRows(row) {
  const rows = [dataRow(row, { copy: 0 })]
  // Expanded into N rows when printing
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
      row.part ? el('small', { class: 'muted' }, ` ${PART_LABELS[row.part] ?? row.part}`) : null,
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
    cards.push(totalCard('Reaction solvent', formatVolume(metrics.solvent.reaction), 'For sizing the vessel'))
  }
  if (metrics.solvent.total !== null) {
    cards.push(totalCard('Total solvent', formatVolume(metrics.solvent.total), 'Incl. workup'))
  }
  if (metrics.basis.ok) {
    cards.push(totalCard('Basis moles', formatAmount(metrics.basis.n), metrics.basis.compound?.name ?? ''))
  }
  if (metrics.theoretical.n !== null) {
    const value = metrics.theoretical.mass !== null
      ? formatMass(metrics.theoretical.mass)
      : formatAmount(metrics.theoretical.n)
    const hint = [
      metrics.theoretical.hasProduct
        ? metrics.theoretical.name || 'Assuming 100% conversion of the basis'
        : 'Set the product MW to get mass',
      metrics.theoretical.equiv !== 1 ? `${formatEquiv(metrics.theoretical.equiv)} eq vs basis` : null,
    ].filter(Boolean).join(' · ')
    cards.push(totalCard('Theoretical yield', value, hint))
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
