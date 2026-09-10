// 步驟序列：卡片列表、展開編輯、xN、分支、freeform、拖曳排序。
// 點擊左側模組即追加到末尾；拖曳僅用於既有步驟的重新排序（§5）。
import { el, clear } from './dom.js'
import { iconMarkup } from './icons.js'
import { renderEditor } from './editors.js'
import { stepSummary } from './summary.js'
import { STEP_TYPES, STEP_ORDER, MAX_BRANCH_DEPTH } from '../model/steps.js'
import { numberSteps } from '../model/schema.js'
import { toast } from './toast.js'

export function createSequence({ root, store, actions, getMetrics }) {
  let dragId = null

  root.addEventListener('dragover', (event) => {
    if (dragId) event.preventDefault()
  })

  function render() {
    const { doc, ui, flash } = store.getState()
    const numbers = numberSteps(doc.steps)
    clear(root)

    if (!doc.steps.length) {
      root.append(el('div', { class: 'sequence__empty' }, [
        '左側點擊模組即可加入步驟。',
        el('br'),
        '先設定基準物與基準量，當量才會算。',
      ]))
      return
    }

    root.append(renderList(doc.steps, { doc, ui, flash, numbers, depth: 0 }))
  }

  function renderList(steps, ctx) {
    const list = el('div', { class: 'sequence' })
    for (const step of steps) list.append(renderCard(step, ctx))
    return list
  }

  function renderCard(step, ctx) {
    const { doc, ui, flash, numbers, depth } = ctx
    const meta = STEP_TYPES[step.type]
    const metrics = getMetrics()?.byStep.get(step.id) ?? null
    const selected = ui.selectedId === step.id
    const wrapper = el('div', {})

    const card = el('article', {
      class: 'card',
      dataset: {
        family: meta.family,
        stepId: step.id,
        selected: String(selected),
        freeform: String(Boolean(step.freeform)),
        flash: String(flash.includes(step.id)),
      },
      ondragover: (event) => {
        if (!dragId || dragId === step.id) return
        event.preventDefault()
        const box = card.getBoundingClientRect()
        card.dataset.drop = event.clientY < box.top + box.height / 2 ? 'before' : 'after'
      },
      ondragleave: () => delete card.dataset.drop,
      ondrop: (event) => {
        event.preventDefault()
        event.stopPropagation()
        const position = card.dataset.drop ?? 'after'
        delete card.dataset.drop
        if (dragId && dragId !== step.id) actions.moveStep(dragId, step.id, position)
        dragId = null
      },
    })

    // 只有把手可拖曳，卡片內的輸入框才不會一碰就變成拖曳
    const handle = el('span', {
      class: 'card__handle',
      draggable: 'true',
      title: '拖曳排序',
      html: iconMarkup('drag', { size: 16 }),
      ondragstart: (event) => {
        dragId = step.id
        card.dataset.dragging = 'true'
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', step.id)
        event.dataTransfer.setDragImage(card, 12, 16)
      },
      ondragend: () => {
        dragId = null
        delete card.dataset.dragging
        delete card.dataset.drop
      },
    })

    if (step.repeat > 1) card.append(el('span', { class: 'badge-repeat' }, `x${step.repeat}`))
    card.append(cardHead(step, { meta, metrics, doc, numbers, selected, handle }))
    if (selected) card.append(cardBody(step, { doc, metrics, depth }))

    wrapper.append(card)
    if (step.branch) wrapper.append(branchBlock(step, ctx))
    return wrapper
  }

  function cardHead(step, { meta, metrics, doc, numbers, selected, handle }) {
    const summary = stepSummary(step, metrics, doc)
    return el('header', {
      class: 'card__head',
      onclick: (event) => {
        if (event.target.closest('button')) return
        store.flush()
        store.setUI({ selectedId: selected ? null : step.id })
      },
    }, [
      handle,
      el('span', { class: 'card__no' }, numbers.get(step.id) ?? ''),
      el('span', { class: 'card__icon', html: iconMarkup(meta.icon) }),
      el('span', { class: 'card__title' }, [
        el('span', { class: 'card__name' }, meta.label),
        el('span', { class: 'card__summary' }, summary || '尚未填寫'),
      ]),
      el('span', { class: 'card__tools' }, [
        toolButton('copy', '複製步驟', () => actions.duplicateStep(step.id)),
        toolButton('trash', '刪除步驟', () => actions.removeStep(step.id), 'btn--danger'),
      ]),
    ])
  }

  function cardBody(step, { doc, metrics, depth }) {
    const body = el('div', { class: 'card__body' })

    if (step.freeform !== null) {
      body.append(freeformBlock(step))
    } else {
      for (const node of renderEditor(step, { doc, actions, store, row: metrics })) body.append(node)
      body.append(noteRow(step))
    }

    body.append(cardFooter(step, depth))
    return body
  }

  /** freeform 取代整組模板欄位；清空後模板欄位自動恢復（§2） */
  function freeformBlock(step) {
    const area = el('textarea', {
      value: step.freeform ?? '',
      placeholder: '直接描述這個步驟的特殊條件…',
      oninput: (event) => actions.updateStep(step.id, { freeform: event.target.value }, { key: 'freeform' }),
      onblur: () => store.flush(),
    })
    return el('div', { class: 'freeform' }, [
      el('div', { class: 'freeform__head' }, [
        el('span', {}, '手動輸入（取代模板欄位）'),
        el('button', {
          class: 'btn btn--ghost',
          type: 'button',
          onclick: () => actions.toggleFreeform(step.id, false),
        }, '改回模板'),
      ]),
      area,
      el('div', { class: 'module__hint' }, '此步驟的中英文敘述皆會留白待補。'),
    ])
  }

  /** note 為附註型，原樣插入中文敘述，不影響輸出 */
  function noteRow(step) {
    return el('div', { class: 'note-row' }, [
      el('span', { html: iconMarkup('note', { size: 15 }) }),
      el('input', {
        type: 'text',
        value: step.note ?? '',
        placeholder: '補充說明（附加於中文敘述之後）',
        oninput: (event) => actions.updateStep(step.id, { note: event.target.value }, { key: 'note' }),
        onblur: () => store.flush(),
      }),
    ])
  }

  function cardFooter(step, depth) {
    const canBranch = depth < MAX_BRANCH_DEPTH && !step.branch
    return el('div', { class: 'card__chips', style: { justifyContent: 'space-between' } }, [
      el('div', { class: 'card__chips' }, [
        el('span', { class: 'card__chips-label' }, '重複'),
        el('button', { class: 'chip', type: 'button', onclick: () => actions.setRepeat(step.id, (step.repeat ?? 1) - 1) }, '−'),
        el('span', { class: 'num', style: { minWidth: '18px', textAlign: 'center' } }, `x${step.repeat ?? 1}`),
        el('button', { class: 'chip', type: 'button', onclick: () => actions.setRepeat(step.id, (step.repeat ?? 1) + 1) }, '+'),
      ]),
      el('div', { class: 'card__chips' }, [
        step.freeform === null
          ? el('button', { class: 'chip', type: 'button', onclick: () => actions.toggleFreeform(step.id, true) }, '手動輸入')
          : null,
        el('button', {
          class: 'chip',
          type: 'button',
          disabled: !canBranch,
          title: canBranch ? '在此步驟後開一條支流' : `分歧深度上限 ${MAX_BRANCH_DEPTH} 層`,
          onclick: () => {
            if (!canBranch) {
              toast(`分歧深度上限 ${MAX_BRANCH_DEPTH} 層，請改為另開一份程序`, { tone: 'warn', icon: 'warning' })
              return
            }
            actions.startBranch(step.id)
          },
        }, [el('span', { html: iconMarkup('branch', { size: 14 }) }), el('span', {}, '分支')]),
      ]),
    ])
  }

  /** 分支：遞迴使用同一套卡片與渲染規則 */
  function branchBlock(step, ctx) {
    const branch = step.branch
    const block = el('div', { class: 'branch-block' })
    block.append(el('div', { class: 'branch-block__head' }, [
      el('span', { html: iconMarkup('branch', { size: 15 }) }),
      el('input', {
        type: 'text',
        value: branch.label ?? '',
        placeholder: '支流名稱（水層、送測…）',
        oninput: (event) => actions.setBranchLabel(step.id, event.target.value),
        onblur: () => store.flush(),
      }),
      el('button', {
        class: 'btn btn--ghost btn--icon',
        type: 'button',
        title: '移除整條支流',
        onclick: () => actions.removeBranch(step.id),
        html: iconMarkup('close', { size: 14 }),
      }),
    ]))

    if (branch.steps.length) {
      block.append(renderList(branch.steps, { ...ctx, depth: ctx.depth + 1 }))
    }
    block.append(branchPalette(step.id))
    return block
  }

  function branchPalette(parentId) {
    return el('div', { class: 'card__chips' }, STEP_ORDER.map((type) =>
      el('button', {
        class: 'chip',
        type: 'button',
        title: `在支流加入「${STEP_TYPES[type].label}」`,
        onclick: () => actions.addStep(type, { parentId }),
      }, [
        el('span', { html: iconMarkup(STEP_TYPES[type].icon, { size: 15 }) }),
        el('span', {}, STEP_TYPES[type].label),
      ]),
    ))
  }

  function toolButton(icon, title, onclick, extra = '') {
    return el('button', {
      class: `btn btn--ghost btn--icon ${extra}`,
      type: 'button',
      title,
      onclick,
      html: iconMarkup(icon, { size: 15 }),
    })
  }

  return { render }
}
