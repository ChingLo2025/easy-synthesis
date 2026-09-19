// Dialogs: compound list, templates, name prompt.
import { el, clear } from './dom.js'
import { iconMarkup } from './icons.js'
import { ROLES, ROLE_ORDER, STEP_TYPES } from '../model/steps.js'
import { compoundPicker } from './picker.js'
import { numberInput, onTextInput } from './fields.js'

let host = null

export function initModals(node) {
  host = node
}

export function openModal({ title, body, actions = [], wide = false }) {
  close()
  const backdrop = el('div', {
    class: 'modal-backdrop',
    onclick: (event) => {
      if (event.target === backdrop) close()
    },
  })
  const modal = el('div', { class: `modal${wide ? ' modal--wide' : ''}` }, [
    el('header', { class: 'modal__head' }, [
      el('h3', {}, title),
      el('button', { class: 'btn btn--ghost btn--icon', type: 'button', onclick: close, html: iconMarkup('close', { size: 15 }) }),
    ]),
    el('div', { class: 'modal__body' }, body),
    actions.length ? el('footer', { class: 'modal__foot' }, actions) : null,
  ])
  backdrop.append(modal)
  host.append(backdrop)
  document.addEventListener('keydown', onEscape)
  return { close, body: modal.querySelector('.modal__body') }
}

export function close() {
  clear(host)
  document.removeEventListener('keydown', onEscape)
}

function applyWidth(node, width) {
  node.style.width = width
  return node
}

function onEscape(event) {
  if (event.key === 'Escape') close()
}

/** Name prompt */
export function promptModal({ title, label, value = '', confirmText = 'Save', onConfirm }) {
  const input = el('input', { type: 'text', value, placeholder: label })
  const submit = () => {
    const text = input.value.trim()
    if (!text) return input.focus()
    close()
    onConfirm(text)
  }
  openModal({
    title,
    body: [el('div', { class: 'field' }, [el('span', { class: 'field__label' }, label), input])],
    actions: [
      el('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'),
      el('button', { class: 'btn btn--primary', type: 'button', onclick: submit }, confirmText),
    ],
  })
  input.focus()
  input.onkeydown = (event) => {
    if (event.key === 'Enter' && !event.isComposing) submit()
  }
}

/**
 * Compound list; the basis is set here too.
 * focusId: when opened from a step card, scroll to that compound's row and highlight it.
 */
export function compoundsModal({ store, actions, onChange, focusId = null }) {
  const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } })

  function render() {
    const { doc } = store.getState()
    clear(body)

    const header = el('div', { class: 'compound-row compound-row__head' }, [
      'Name', 'CAS', 'MW', 'Density', 'Purity', 'Conc. (M)', 'Role', '',
    ].map((text) => el('span', {}, text)))
    body.append(header)

    const list = el('div', { class: 'compounds' })
    for (const compound of doc.compounds) list.append(compoundRow(compound, doc))
    if (!doc.compounds.length) list.append(el('div', { class: 'picker__empty' }, 'No compounds yet.'))
    body.append(list)

    body.append(el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [
      el('div', { style: { flex: '1' } }, compoundPicker({
        doc,
        value: null,
        placeholder: 'Add from reagent library…',
        onPick: (choice) => {
          if (choice.create) actions.addCompound(choice.create)
          render()
          onChange?.()
        },
      })),
      el('button', {
        class: 'btn',
        type: 'button',
        onclick: () => {
          actions.addCompound({ name: '' })
          render()
          onChange?.()
        },
      }, [el('span', { html: iconMarkup('plus', { size: 14 }) }), el('span', {}, 'Blank row')]),
    ]))

    body.append(basisRow(doc))
    body.append(productRow(doc))
  }

  function compoundRow(compound, doc) {
    const isBasis = doc.basis.compoundId === compound.id
    // Typing a name char by char doesn't write to the personal library; it's recorded when the field commits (blur)
    const commit = () => { store.flush(); actions.commitCompound(compound.id); onChange?.() }
    const text = (field, placeholder) => el('input', {
      type: 'text',
      value: compound[field] ?? '',
      placeholder,
      ...onTextInput((value) => actions.updateCompound(compound.id, { [field]: value }, { key: field })),
      onblur: commit,
    })
    const number = (field, placeholder) => numberInput({
      value: compound[field],
      placeholder,
      onInput: (value) => actions.updateCompound(compound.id, { [field]: value }, { key: field }),
      onBlur: commit,
    })

    return el('div', { class: 'compound-row', dataset: { basis: String(isBasis), compoundId: compound.id, focus: String(compound.id === focusId) } }, [
      text('name', 'Compound name'),
      text('cas', 'CAS'),
      number('mw', 'g/mol'),
      number('density', 'g/mL'),
      number('purity', '1.0'),
      number('conc', 'mol/L'),
      el('select', {
        onchange: (event) => { actions.updateCompound(compound.id, { role: event.target.value }); onChange?.(); render() },
      }, ROLE_ORDER.map((role) => el('option', { value: role, selected: compound.role === role }, ROLES[role].label))),
      el('button', {
        class: 'btn btn--ghost btn--icon btn--danger',
        type: 'button',
        title: 'Delete',
        onclick: () => { actions.removeCompound(compound.id); render(); onChange?.() },
        html: iconMarkup('trash', { size: 14 }),
      }),
    ])
  }

  /** The product is only used for the theoretical yield and is not part of the flow */
  function productRow(doc) {
    const product = doc.meta?.product ?? {}
    const patch = (fields) => actions.setMeta(
      { product: { ...(store.getState().doc.meta.product ?? {}), ...fields } },
      { key: 'meta:product' },
    )
    return el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [
      el('span', { class: 'field__label' }, 'Product (optional)'),
      el('input', {
        type: 'text',
        style: { width: '200px' },
        value: product.name ?? '',
        placeholder: 'Product name',
        ...onTextInput((name) => patch({ name })),
        onblur: () => { store.flush(); onChange?.() },
      }),
      applyWidth(numberInput({
        value: product.mw,
        placeholder: 'MW g/mol',
        onInput: (mw) => patch({ mw }),
        onBlur: () => { store.flush(); onChange?.() },
      }), '110px'),
      applyWidth(numberInput({
        value: product.equiv,
        placeholder: 'eq vs basis',
        onInput: (equiv) => patch({ equiv }),
        onBlur: () => { store.flush(); onChange?.() },
      }), '110px'),
      el('span', { class: 'muted', style: { fontSize: '12px' } }, 'Equivalents against the basis (1 when empty); the MW converts the yield to mass'),
    ])
  }

  function basisRow(doc) {
    return el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid var(--line)' } }, [
      el('span', { class: 'field__label' }, 'Basis (limiting reagent)'),
      el('select', {
        style: { width: '200px' },
        onchange: (event) => { actions.setBasis({ compoundId: event.target.value || null }); render(); onChange?.() },
      }, [
        el('option', { value: '' }, 'Not set'),
        ...doc.compounds.map((c) => el('option', { value: c.id, selected: doc.basis.compoundId === c.id }, c.name || '(unnamed)')),
      ]),
      el('span', { class: 'muted', style: { fontSize: '12px' } }, 'All equivalents are relative to this'),
    ])
  }

  render()
  const modal = openModal({ title: 'Compounds & basis', body, wide: true, actions: [el('button', { class: 'btn btn--primary', type: 'button', onclick: close }, 'Done')] })
  const target = focusId ? body.querySelector(`[data-compound-id="${CSS.escape(focusId)}"]`) : null
  if (target) {
    target.scrollIntoView({ block: 'nearest' })
    target.querySelector('input')?.focus({ preventScroll: true })
  }
  return modal
}

/** Templates: whole procedures and step groups */
export function templatesModal({ store, onLoadTemplate, onInsertGroup, listTemplates, listGroups, deleteTemplate, deleteGroup, onSaveGroup }) {
  const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } })

  function render() {
    clear(body)
    const templates = listTemplates()
    const groups = listGroups()

    body.append(sectionTitle('Procedure templates', 'Loading also brings in the compound list and resets undo history'))
    body.append(templates.length
      ? el('div', { class: 'modal__list' }, templates.map((entry) => entryRow(entry, `${entry.steps} steps`, () => {
          close()
          onLoadTemplate(entry)
        }, () => { deleteTemplate(entry.id); render() })))
      : el('div', { class: 'picker__empty' }, 'No templates yet. Use “Save as template” on the current procedure.'))

    body.append(sectionTitle('Step groups', 'e.g. a standard aqueous workup'))
    body.append(groups.length
      ? el('div', { class: 'modal__list' }, groups.map((entry) => entryRow(entry, `${entry.steps.length} steps`, () => {
          close()
          onInsertGroup(entry)
        }, () => { deleteGroup(entry.id); render() })))
      : el('div', { class: 'picker__empty' }, 'No groups yet.'))

    body.append(sectionTitle('Create a group from this procedure', 'Tick the steps to include'))
    body.append(groupBuilder())
  }

  function groupBuilder() {
    const { doc } = store.getState()
    const wrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } })
    const checks = new Map()

    doc.steps.forEach((step, index) => {
      const input = el('input', { type: 'checkbox', style: { width: 'auto', minHeight: 'auto' } })
      checks.set(step.id, input)
      wrap.append(el('label', {
        style: { display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', color: 'var(--ink)' },
      }, [
        input,
        el('span', {}, `${index + 1}. ${STEP_TYPES[step.type]?.label ?? step.type}`),
        el('span', { class: 'muted' }, step.note || ''),
      ]))
    })

    if (!doc.steps.length) return el('div', { class: 'picker__empty' }, 'This procedure has no steps.')

    wrap.append(el('button', {
      class: 'btn',
      type: 'button',
      style: { alignSelf: 'flex-start' },
      onclick: () => {
        const selected = doc.steps.filter((step) => checks.get(step.id)?.checked)
        if (!selected.length) return
        promptModal({
          title: 'Save step group',
          label: 'Group name',
          onConfirm: (name) => onSaveGroup(name, selected),
        })
      },
    }, 'Save as group'))
    return wrap
  }

  function sectionTitle(title, hint) {
    return el('div', { class: 'doc-section__head', style: { paddingBottom: '4px' } }, [
      el('h3', {}, title),
      hint ? el('small', {}, hint) : null,
    ])
  }

  function entryRow(entry, hint, onPick, onDelete) {
    return el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, [
      el('button', { class: 'modal__item', type: 'button', onclick: onPick }, [
        el('span', { html: iconMarkup('template', { size: 15 }) }),
        el('span', {}, entry.name),
        el('small', {}, hint),
      ]),
      el('button', {
        class: 'btn btn--ghost btn--icon btn--danger',
        type: 'button',
        title: 'Delete',
        onclick: onDelete,
        html: iconMarkup('trash', { size: 14 }),
      }),
    ])
  }

  render()
  return openModal({ title: 'Templates', body })
}
