// 對話框：化合物清單、範本、命名輸入。
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

/** 命名輸入 */
export function promptModal({ title, label, value = '', confirmText = '儲存', onConfirm }) {
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
      el('button', { class: 'btn', type: 'button', onclick: close }, '取消'),
      el('button', { class: 'btn btn--primary', type: 'button', onclick: submit }, confirmText),
    ],
  })
  input.focus()
  input.onkeydown = (event) => {
    if (event.key === 'Enter' && !event.isComposing) submit()
  }
}

/** 化合物清單：基準也在這裡設定 */
export function compoundsModal({ store, actions, onChange }) {
  const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } })

  function render() {
    const { doc } = store.getState()
    clear(body)

    const header = el('div', { class: 'compound-row compound-row__head' }, [
      '名稱', 'CAS', 'MW', '密度', '純度', '濃度 M', '角色', '',
    ].map((text) => el('span', {}, text)))
    body.append(header)

    const list = el('div', { class: 'compounds' })
    for (const compound of doc.compounds) list.append(compoundRow(compound, doc))
    if (!doc.compounds.length) list.append(el('div', { class: 'picker__empty' }, '尚未建立化合物。'))
    body.append(list)

    body.append(el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [
      el('div', { style: { flex: '1' } }, compoundPicker({
        doc,
        value: null,
        placeholder: '從試劑庫加入…',
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
      }, [el('span', { html: iconMarkup('plus', { size: 14 }) }), el('span', {}, '空白列')]),
    ]))

    body.append(basisRow(doc))
    body.append(productRow(doc))
  }

  function compoundRow(compound, doc) {
    const isBasis = doc.basis.compoundId === compound.id
    // 名稱逐字輸入時不寫入個人庫，欄位提交（blur）才記
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

    return el('div', { class: 'compound-row', dataset: { basis: String(isBasis) } }, [
      text('name', '化合物名稱'),
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
        title: '刪除',
        onclick: () => { actions.removeCompound(compound.id); render(); onChange?.() },
        html: iconMarkup('trash', { size: 14 }),
      }),
    ])
  }

  /** 產物只用於理論產量換算，不參與流程 */
  function productRow(doc) {
    const product = doc.meta?.product ?? {}
    const patch = (fields) => actions.setMeta(
      { product: { ...(store.getState().doc.meta.product ?? {}), ...fields } },
      { key: 'meta:product' },
    )
    return el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [
      el('span', { class: 'field__label' }, '產物（選填）'),
      el('input', {
        type: 'text',
        style: { width: '200px' },
        value: product.name ?? '',
        placeholder: '產物名稱',
        ...onTextInput((name) => patch({ name })),
        onblur: () => { store.flush(); onChange?.() },
      }),
      applyWidth(numberInput({
        value: product.mw,
        placeholder: 'MW g/mol',
        onInput: (mw) => patch({ mw }),
        onBlur: () => { store.flush(); onChange?.() },
      }), '110px'),
      el('span', { class: 'muted', style: { fontSize: '12px' } }, '填分子量才能換算理論產量質量'),
    ])
  }

  function basisRow(doc) {
    return el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid var(--line)' } }, [
      el('span', { class: 'field__label' }, '基準（限量試劑）'),
      el('select', {
        style: { width: '200px' },
        onchange: (event) => { actions.setBasis({ compoundId: event.target.value || null }); render(); onChange?.() },
      }, [
        el('option', { value: '' }, '未設定'),
        ...doc.compounds.map((c) => el('option', { value: c.id, selected: doc.basis.compoundId === c.id }, c.name || '（未命名）')),
      ]),
      el('span', { class: 'muted', style: { fontSize: '12px' } }, '所有當量以此為分母'),
    ])
  }

  render()
  return openModal({ title: '化合物與基準', body, wide: true, actions: [el('button', { class: 'btn btn--primary', type: 'button', onclick: close }, '完成')] })
}

/** 範本：整份程序、步驟群組 */
export function templatesModal({ store, onLoadTemplate, onInsertGroup, listTemplates, listGroups, deleteTemplate, deleteGroup, onSaveGroup }) {
  const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } })

  function render() {
    clear(body)
    const templates = listTemplates()
    const groups = listGroups()

    body.append(sectionTitle('整份範本', '載入時連化合物清單一併帶入，並重置復原歷史'))
    body.append(templates.length
      ? el('div', { class: 'modal__list' }, templates.map((entry) => entryRow(entry, `${entry.steps} 步`, () => {
          close()
          onLoadTemplate(entry)
        }, () => { deleteTemplate(entry.id); render() })))
      : el('div', { class: 'picker__empty' }, '尚無範本。可從目前程序「另存為範本」。'))

    body.append(sectionTitle('步驟群組', '例如標準水相後處理'))
    body.append(groups.length
      ? el('div', { class: 'modal__list' }, groups.map((entry) => entryRow(entry, `${entry.steps.length} 步`, () => {
          close()
          onInsertGroup(entry)
        }, () => { deleteGroup(entry.id); render() })))
      : el('div', { class: 'picker__empty' }, '尚無群組。'))

    body.append(sectionTitle('從目前程序建立群組', '勾選要收進群組的步驟'))
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

    if (!doc.steps.length) return el('div', { class: 'picker__empty' }, '目前程序沒有步驟。')

    wrap.append(el('button', {
      class: 'btn',
      type: 'button',
      style: { alignSelf: 'flex-start' },
      onclick: () => {
        const selected = doc.steps.filter((step) => checks.get(step.id)?.checked)
        if (!selected.length) return
        promptModal({
          title: '儲存步驟群組',
          label: '群組名稱',
          onConfirm: (name) => onSaveGroup(name, selected),
        })
      },
    }, '儲存為群組'))
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
        title: '刪除',
        onclick: onDelete,
        html: iconMarkup('trash', { size: 14 }),
      }),
    ])
  }

  render()
  return openModal({ title: '範本', body })
}
