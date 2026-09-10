// 化合物選擇器：先列本文件既有化合物，再列個人庫與內建庫。
// 選到庫中項目時回傳待建立的化合物，由呼叫端寫入文件。
import { el, clear } from './dom.js'
import { iconMarkup } from './icons.js'
import { searchAll } from '../model/library.js'
import { reagentToCompound } from '../model/reagents.js'
import { ROLES } from '../model/steps.js'

/**
 * onPick({ compoundId }) 或 onPick({ create: {...} })
 * filter: null | 'solvent' | 'drying'
 */
export function compoundPicker({ doc, value, filter = null, placeholder = '選擇化合物', onPick }) {
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
      placeholder: '搜尋名稱或 CAS…',
      style: { marginBottom: '3px' },
      oninput: () => render(search.value),
      onkeydown: (event) => {
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
        results.append(sectionLabel('本程序'))
        for (const compound of inDoc) {
          results.append(option(compound.name || '（未命名）', compound.cas, ROLES[compound.role]?.label, () => {
            onPick({ compoundId: compound.id })
            close()
          }))
        }
      }
      const library = searchAll(q, { filter }).filter(
        (item) => !inDoc.some((c) => c.name === item.name && (c.cas || '') === (item.cas || '')),
      )
      if (library.length) {
        results.append(sectionLabel('試劑庫'))
        for (const item of library) {
          const hint = [item.cas, item.bp ? `bp ${item.bp} °C` : null].filter(Boolean).join(' · ')
          results.append(option(item.name, hint, item.source === 'personal' ? '個人' : '內建', () => {
            onPick({ create: reagentToCompound(item) })
            close()
          }))
        }
      }
      if (q && !inDoc.length && !library.length) {
        results.append(
          option(`新增「${query}」`, '', '新化合物', () => {
            onPick({ create: { name: query, role: filter === 'solvent' ? 'solvent' : 'reactant' } })
            close()
          }),
        )
      }
      if (!results.children.length) results.append(el('div', { class: 'picker__empty' }, '尚無化合物，請直接輸入名稱新增'))
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
