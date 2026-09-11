// Compound picker: this document's compounds first, then the personal and built-in libraries.
// Picking a library item returns a compound to create; the caller writes it to the document.
import { el, clear } from './dom.js'
import { iconMarkup } from './icons.js'
import { searchAll } from '../model/library.js'
import { reagentToCompound } from '../model/reagents.js'
import { ROLES } from '../model/steps.js'

/**
 * onPick({ compoundId }) or onPick({ create: {...} })
 * filter: null | 'solvent' | 'drying'
 */
export function compoundPicker({ doc, value, filter = null, placeholder = 'Select compound', onPick }) {
  const current = doc.compounds.find((c) => c.id === value) ?? null
  const root = el('div', { class: 'picker' })

  const trigger = el('button', {
    class: 'btn',
    type: 'button',
    style: { width: '100%', justifyContent: 'space-between' },
    onclick: () => (root.querySelector('.picker__list') ? close() : open()),
  }, [
    el('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, current?.name || placeholder),
    el('span', { class: 'muted', html: iconMarkup('chevronDown', { size: 14 }) }),
  ])
  if (!current) trigger.style.color = 'var(--ink-4)'
  root.append(trigger)

  function close() {
    root.querySelector('.picker__list')?.remove()
    document.removeEventListener('pointerdown', onOutside, true)
  }

  function onOutside(event) {
    if (!root.contains(event.target)) close()
  }

  function open() {
    const list = el('div', { class: 'picker__list' })
    const search = el('input', {
      type: 'text',
      placeholder: 'Search name or CAS…',
      style: { marginBottom: '3px' },
      oninput: () => render(search.value),
      onkeydown: (event) => {
        if (event.isComposing) return // Enter pressed while choosing an IME candidate doesn't submit
        if (event.key === 'Escape') close()
        if (event.key === 'Enter') {
          event.preventDefault()
          list.querySelector('.picker__option')?.click()
        }
      },
    })
    const results = el('div')
    list.append(search, results)
    root.append(list)
    search.focus()
    document.addEventListener('pointerdown', onOutside, true)

    function render(query) {
      clear(results)
      const q = (query ?? '').trim().toLowerCase()
      const inDoc = doc.compounds.filter((c) => {
        if (filter === 'solvent' && !['solvent', 'quench'].includes(c.role)) return false
        return !q || [c.name, c.cas].some((f) => (f ?? '').toLowerCase().includes(q))
      })
      if (inDoc.length) {
        results.append(sectionLabel('This procedure'))
        for (const compound of inDoc) {
          results.append(option(compound.name || '(unnamed)', compound.cas, ROLES[compound.role]?.label, () => {
            onPick({ compoundId: compound.id })
            close()
          }))
        }
      }
      const library = searchAll(q, { filter }).filter(
        (item) => !inDoc.some((c) => c.name === item.name && (c.cas || '') === (item.cas || '')),
      )
      if (library.length) {
        results.append(sectionLabel('Library'))
        for (const item of library) {
          const hint = [item.cas, item.bp ? `bp ${item.bp} °C` : null].filter(Boolean).join(' · ')
          results.append(option(item.name, hint, item.source === 'personal' ? 'Personal' : 'Built-in', () => {
            onPick({ create: reagentToCompound(item) })
            close()
          }))
        }
      }
      if (q && !inDoc.length && !library.length) {
        results.append(
          option(`Add “${query}”`, '', 'New compound', () => {
            onPick({ create: { name: query, role: filter === 'solvent' ? 'solvent' : 'reactant' } })
            close()
          }),
        )
      }
      if (!results.children.length) results.append(el('div', { class: 'picker__empty' }, 'No compounds yet. Type a name to add one'))
    }

    render('')
  }

  return root
}

function sectionLabel(text) {
  return el('div', { class: 'picker__empty', style: { padding: '4px 7px 2px', fontSize: '10.5px', letterSpacing: '0.05em' } }, text)
}

function option(name, cas, tag, onclick) {
  return el('button', { class: 'picker__option', type: 'button', onclick }, [
    el('span', {}, name),
    cas ? el('small', {}, cas) : null,
    tag ? el('span', { class: 'picker__tag' }, tag) : null,
  ])
}
