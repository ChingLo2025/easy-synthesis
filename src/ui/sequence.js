// Step sequence: card list, expanded editing, xN, branches, freeform, drag-to-reorder.
// Clicking a module on the left appends to the end; dragging only reorders existing steps (§5).
import { el, clear } from './dom.js'
import { iconMarkup } from './icons.js'
import { renderEditor } from './editors.js'
import { onTextInput } from './fields.js'
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
        'Click a module on the left to add a step.',
        el('br'),
        'Set the basis compound and amount first so equivalents can be calculated.',
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
        scope: step.id,
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

    // Only the handle is draggable, so touching an input inside the card doesn't start a drag
    const handle = el('span', {
      class: 'card__handle',
      draggable: 'true',
      title: 'Drag to reorder',
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
        el('span', { class: 'card__summary' }, summary || 'Not filled in'),
      ]),
      el('span', { class: 'card__tools' }, [
        toolButton('copy', 'Duplicate step', () => actions.duplicateStep(step.id)),
        toolButton('trash', 'Delete step', () => actions.removeStep(step.id), 'btn--danger'),
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

  /** freeform replaces all template fields; clearing it brings them back (§2) */
  function freeformBlock(step) {
    const area = el('textarea', {
      name: 'freeform',
      value: step.freeform ?? '',
      placeholder: 'Describe the special conditions of this step…',
      ...onTextInput((freeform) => actions.updateStep(step.id, { freeform }, { key: 'freeform' })),
      onblur: () => store.flush(),
    })
    return el('div', { class: 'freeform' }, [
      el('div', { class: 'freeform__head' }, [
        el('span', {}, 'Manual entry (replaces template fields)'),
        el('button', {
          class: 'btn btn--ghost',
          type: 'button',
          onclick: () => actions.toggleFreeform(step.id, false),
        }, 'Back to template'),
      ]),
      area,
      el('div', { class: 'module__hint' }, 'Both the Chinese and English narrative will be left blank for this step.'),
    ])
  }

  /** note is an annotation inserted verbatim into the Chinese narrative; it doesn't affect the output otherwise */
  function noteRow(step) {
    return el('div', { class: 'note-row' }, [
      el('span', { html: iconMarkup('note', { size: 15 }) }),
      el('input', {
        type: 'text',
        name: 'note',
        value: step.note ?? '',
        placeholder: 'Note (appended to the Chinese narrative)',
        ...onTextInput((note) => actions.updateStep(step.id, { note }, { key: 'note' })),
        onblur: () => store.flush(),
      }),
    ])
  }

  function cardFooter(step, depth) {
    const canBranch = depth < MAX_BRANCH_DEPTH && !step.branch
    return el('div', { class: 'card__chips', style: { justifyContent: 'space-between' } }, [
      el('div', { class: 'card__chips' }, [
        el('span', { class: 'card__chips-label' }, 'Repeat'),
        el('button', { class: 'chip', type: 'button', onclick: () => actions.setRepeat(step.id, (step.repeat ?? 1) - 1) }, '−'),
        el('span', { class: 'num', style: { minWidth: '18px', textAlign: 'center' } }, `x${step.repeat ?? 1}`),
        el('button', { class: 'chip', type: 'button', onclick: () => actions.setRepeat(step.id, (step.repeat ?? 1) + 1) }, '+'),
      ]),
      el('div', { class: 'card__chips' }, [
        step.freeform === null
          ? el('button', { class: 'chip', type: 'button', onclick: () => actions.toggleFreeform(step.id, true) }, 'Manual entry')
          : null,
        el('button', {
          class: 'chip',
          type: 'button',
          disabled: !canBranch,
          title: canBranch ? 'Start a branch after this step' : `Branch depth limit: ${MAX_BRANCH_DEPTH} levels`,
          onclick: () => {
            if (!canBranch) {
              toast(`Branch depth is limited to ${MAX_BRANCH_DEPTH} levels; start a separate procedure instead`, { tone: 'warn', icon: 'warning' })
              return
            }
            actions.startBranch(step.id)
          },
        }, [el('span', { html: iconMarkup('branch', { size: 14 }) }), el('span', {}, 'Branch')]),
      ]),
    ])
  }

  /** Branches: recursively reuse the same cards and rendering rules */
  function branchBlock(step, ctx) {
    const branch = step.branch
    const block = el('div', { class: 'branch-block' })
    block.append(el('div', { class: 'branch-block__head', dataset: { scope: `${step.id}:branch` } }, [
      el('span', { html: iconMarkup('branch', { size: 15 }) }),
      el('input', {
        type: 'text',
        name: 'branchLabel',
        value: branch.label ?? '',
        placeholder: 'Branch name (aqueous layer, for analysis…)',
        ...onTextInput((label) => actions.setBranchLabel(step.id, label)),
        onblur: () => store.flush(),
      }),
      el('button', {
        class: 'btn btn--ghost btn--icon',
        type: 'button',
        title: 'Remove the whole branch',
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
        title: `Add ${STEP_TYPES[type].label} to the branch`,
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
