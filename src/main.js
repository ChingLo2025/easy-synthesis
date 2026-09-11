// App assembly: state, the three panels, top bar, keyboard, autosave.
import { compute } from './engine/compute.js'
import { createDocument, normalizeDocument } from './model/schema.js'
import { createSampleDocument } from './model/sample.js'
import { createStore } from './state/store.js'
import { createActions } from './state/actions.js'
import { KEYS, load, throttledSave } from './state/persist.js'
import { createPalette } from './ui/palette.js'
import { createSequence } from './ui/sequence.js'
import { DOC_TABS, renderDocument } from './ui/document.js'
import { compoundsModal, initModals, promptModal, templatesModal } from './ui/modals.js'
import { initToaster, toast } from './ui/toast.js'
import { append, clear, el, replaceChildren } from './ui/dom.js'
import { iconMarkup } from './ui/icons.js'
import { onTextInput } from './ui/fields.js'
import { copyText, downloadDocument, pickDocument } from './io/json.js'
import {
  deleteGroup, deleteTemplate, expandGroup, listGroups, listTemplates,
  saveGroup, saveTemplate, templateToDocument,
} from './io/templates.js'

const nodes = {
  palette: document.getElementById('palette'),
  sequence: document.getElementById('sequence'),
  document: document.getElementById('document'),
  documentBody: document.getElementById('documentBody'),
  meta: document.getElementById('metaFields'),
  topActions: document.getElementById('topActions'),
  docTabs: document.getElementById('docTabs'),
  documentActions: document.getElementById('documentActions'),
  sequenceActions: document.getElementById('sequenceActions'),
  status: document.getElementById('statusbar'),
  sequencePanel: document.querySelector('.panel--sequence .panel__body'),
}

initToaster(document.getElementById('toaster'))
initModals(document.getElementById('modalRoot'))

const store = createStore(restoreDocument(), { selectedId: null, scrollTop: 0, tab: 'flow' })
const actions = createActions(store)
const autosave = throttledSave(KEYS.doc)

let metrics = compute(store.getState().doc)

const palette = createPalette({
  root: nodes.palette,
  store,
  actions,
  onOpenCompounds: () => compoundsModal({ store, actions, onChange: () => render('change') }),
  onOpenTemplates: openTemplates,
  onSaveTemplate: saveWholeTemplate,
})

const sequence = createSequence({
  root: nodes.sequence,
  store,
  actions,
  getMetrics: () => metrics,
})

function restoreDocument() {
  const stored = load(KEYS.doc, null)
  if (!stored) return createDocument()
  try {
    return normalizeDocument(stored)
  } catch {
    return createDocument()
  }
}

// ── Rendering ─────────────────────────────────────────────────────────────────
function render(reason) {
  const { doc, ui } = store.getState()
  metrics = compute(doc)

  const focus = captureFocus()
  // While the DOM is rebuilt, blur from the removed focused field is not a commit (see store.holdFlush)
  store.holdFlush(() => {
    palette.render()
    sequence.render()
    syncMeta(doc, { force: reason !== 'change' })
    renderTopActions()
    renderTabs(ui.tab)
    renderDocument(nodes.document, {
      doc,
      metrics,
      tab: ui.tab ?? 'flow',
      selectedId: ui.selectedId,
      onSelectStep: (stepId) => store.setUI({ selectedId: stepId }),
      onCopy: handleCopy,
    })
    renderStatus()
    restoreFocus(focus, { keepRaw: reason === 'change' })
  })

  if (reason === 'undo' || reason === 'redo') {
    nodes.sequencePanel.scrollTop = ui.scrollTop ?? 0
    flashHint(reason)
    store.clearFlash()
  }
  autosave(doc)
}

/**
 * A full re-render replaces the inputs, so the focus position is recorded here and reattached afterwards.
 * The search stays within data-scope (step card, branch, basis): fields with a name are located by name,
 * elements without a name (buttons etc.) by order, checked against kind and text.
 * If the same element can't be found, focus isn't reattached: losing focus beats putting focus or content in another field.
 */
function captureFocus() {
  const active = document.activeElement
  if (!active || active === document.body) return null
  const container = [nodes.palette, nodes.sequence, nodes.document].find((node) => node.contains(active))
  if (!container) return null
  const scopeNode = active.closest('[data-scope]')
  const scope = scopeNode && container.contains(scopeNode) ? scopeNode.dataset.scope : null
  return {
    container,
    scope,
    name: active.getAttribute('name'),
    index: focusables(scope ? scopeNode : container).indexOf(active),
    signature: signatureOf(active),
    raw: active.value,
    selection: readSelection(active),
  }
}

function restoreFocus(snapshot, { keepRaw = false } = {}) {
  if (!snapshot) return
  const root = snapshot.scope
    ? snapshot.container.querySelector(`[data-scope="${CSS.escape(snapshot.scope)}"]`)
    : snapshot.container
  if (!root) return
  const node = snapshot.name
    ? root.querySelector(`[name="${CSS.escape(snapshot.name)}"]`)
    : focusables(root)[snapshot.index]
  if (!node || signatureOf(node) !== snapshot.signature) return
  node.focus({ preventScroll: true })
  if (!isTextual(node)) return
  // While typing, keep the user's raw string (e.g. "0."); on undo/redo use the model value and put the caret at the end
  if (keepRaw && node.value !== snapshot.raw) node.value = snapshot.raw
  const end = node.value.length
  const selection = keepRaw && snapshot.selection ? snapshot.selection : { start: end, end }
  try {
    node.setSelectionRange(selection.start, selection.end)
  } catch {
    /* Field doesn't support selection ranges; ignore */
  }
}

/** Element kind, name and button text (or title); the same signature means the same element */
function signatureOf(node) {
  const label = node.tagName === 'BUTTON' ? node.textContent.trim() || node.title : ''
  return [node.tagName, node.type ?? '', node.getAttribute('name') ?? '', label].join('|')
}

function readSelection(node) {
  try {
    return typeof node.selectionStart === 'number' ? { start: node.selectionStart, end: node.selectionEnd } : null
  } catch {
    return null
  }
}

function isTextual(node) {
  return node.tagName === 'TEXTAREA' || (node.tagName === 'INPUT' && node.type === 'text')
}

function focusables(root) {
  return [...root.querySelectorAll('input, textarea, select, button, [tabindex]')]
}

function flashHint(reason) {
  const { flash } = store.getState()
  toast(reason === 'undo' ? `Undone${flash.length ? ` (${flash.length} changed)` : ''}` : 'Redone', {
    icon: reason === 'undo' ? 'undo' : 'redo',
  })
}

// ── Top bar ─────────────────────────────────────────────────────────────────
// Top bar fields are built once; re-renders only sync values and never rebuild a field the user is typing in
const META_FIELDS = [
  { key: 'title', placeholder: 'Untitled procedure', className: 'meta-input--title' },
  { key: 'author', placeholder: 'Operator', className: 'meta-input--sm' },
  { key: 'batchNo', placeholder: 'Batch no.', className: 'meta-input--sm' },
  { key: 'date', placeholder: '', className: 'meta-input--sm', type: 'date' },
]

function mountMeta() {
  const inputs = new Map(META_FIELDS.map(({ key, placeholder, className, type = 'text' }) => [key, el('input', {
    type,
    class: `meta-input ${className}`,
    placeholder,
    ...onTextInput((value) => actions.setMeta({ [key]: value }, { key: `meta:${key}` })),
    onblur: () => store.flush(),
  })]))
  replaceChildren(nodes.meta, [
    inputs.get('title'), el('span', { class: 'sep' }), inputs.get('author'), inputs.get('batchNo'), inputs.get('date'),
  ])
  return inputs
}

/** Don't overwrite a field being edited; force a sync only on undo, redo and template load */
function syncMeta(doc, { force = false } = {}) {
  const meta = doc.meta ?? {}
  for (const [key, input] of metaInputs) {
    const value = meta[key] ?? ''
    if (input.value === value) continue
    if (!force && input === document.activeElement) continue
    input.value = value
  }
}

function renderTopActions() {
  const { canUndo, canRedo } = store.getState()
  clear(nodes.topActions)
  nodes.topActions.append(
    iconButton('undo', 'Undo (Ctrl+Z)', () => store.undo(), !canUndo),
    iconButton('redo', 'Redo (Ctrl+Shift+Z)', () => store.redo(), !canRedo),
    el('span', { class: 'sep' }),
    iconButton('upload', 'Import JSON', importJson),
    iconButton('download', 'Export JSON', () => downloadDocument(store.getState().doc)),
    el('button', { class: 'btn btn--primary', type: 'button', onclick: () => window.print() }, [
      el('span', { html: iconMarkup('print', { size: 15 }) }),
      el('span', {}, 'Print / PDF'),
    ]),
  )
}

function renderTabs(active = 'flow') {
  clear(nodes.docTabs)
  for (const tab of DOC_TABS) {
    nodes.docTabs.append(el('button', {
      class: 'tab',
      type: 'button',
      role: 'tab',
      'aria-selected': String((active ?? 'flow') === tab.id),
      onclick: () => store.setUI({ tab: tab.id }),
    }, [el('span', { html: iconMarkup(tab.icon, { size: 15 }) }), el('span', {}, tab.label)]))
  }

  clear(nodes.documentActions)
  nodes.documentActions.append(
    el('button', { class: 'btn btn--ghost', type: 'button', onclick: loadSample }, 'Load example'),
  )
}

function renderStatus() {
  const { doc, canUndo } = store.getState()
  const errors = metrics.warnings.filter((w) => w.level === 'error').length
  const warns = metrics.warnings.filter((w) => w.level === 'warn').length
  clear(nodes.status)
  append(nodes.status, [
    statusItem('flow', `${metrics.rows.length} steps`),
    statusItem('table', `${doc.compounds.length} compounds`),
    errors ? statusItem('warning', `${errors} to fix`, 'error') : null,
    warns ? statusItem('info', `${warns} warnings`, 'warn') : null,
    el('span', { class: 'statusbar__spacer' }),
    statusItem('check', canUndo ? `${store.historyDepth.past} undo steps` : 'No changes'),
    statusItem('download', 'Autosaved'),
  ])
}

function statusItem(icon, text, tone = '') {
  return el('span', { class: `statusbar__item${tone ? ` statusbar__item--${tone}` : ''}` }, [
    el('span', { html: iconMarkup(icon, { size: 13 }) }),
    el('span', {}, text),
  ])
}

function iconButton(icon, title, onclick, disabled = false) {
  return el('button', {
    class: 'btn btn--icon',
    type: 'button',
    title,
    disabled,
    onclick,
    html: iconMarkup(icon, { size: 15 }),
  })
}

// ── Commands ─────────────────────────────────────────────────────────────────
async function importJson() {
  try {
    const doc = await pickDocument()
    if (!doc) return
    store.replace(doc, { resetHistory: true, ui: { selectedId: null } })
    toast('Procedure imported', { icon: 'upload' })
  } catch (error) {
    toast(error.message, { tone: 'error', icon: 'warning' })
  }
}

function loadSample() {
  store.replace(createSampleDocument(), { resetHistory: true, ui: { selectedId: null } })
  toast('Example procedure loaded', { icon: 'template' })
}

function saveWholeTemplate() {
  promptModal({
    title: 'Save as template',
    label: 'Template name',
    value: store.getState().doc.meta?.title ?? '',
    onConfirm: (name) => {
      saveTemplate(name, store.getState().doc)
      toast(`Template “${name}” saved`, { icon: 'template' })
    },
  })
}

function openTemplates() {
  templatesModal({
    store,
    listTemplates,
    listGroups,
    deleteTemplate,
    deleteGroup,
    onLoadTemplate: (entry) => {
      // Loading a template resets history instead of stacking onto it
      store.replace(templateToDocument(entry), { resetHistory: true, ui: { selectedId: null } })
      toast(`Template “${entry.name}” loaded`, { icon: 'template' })
    },
    onInsertGroup: (entry) => {
      const { steps, compounds } = expandGroup(entry, store.getState().doc)
      store.transact((doc) => {
        doc.compounds.push(...compounds)
        doc.steps.push(...steps)
      }, { structural: true })
      toast(`Inserted “${entry.name}” (${steps.length} steps)`, { icon: 'template' })
    },
    onSaveGroup: (name, steps) => {
      saveGroup(name, steps, store.getState().doc.compounds)
      toast(`Group “${name}” saved`, { icon: 'template' })
    },
  })
}

async function handleCopy(text, hasPending) {
  const ok = await copyText(text)
  if (!ok) return toast('The browser denied clipboard access', { tone: 'error', icon: 'warning' })
  toast(hasPending ? 'Copied (still contains to-be-written markers)' : 'Plain text copied', {
    tone: hasPending ? 'warn' : 'info',
    icon: hasPending ? 'warning' : 'copy',
  })
}

// ── Keyboard: Ctrl+Z is intercepted globally with preventDefault, never mixed with native input undo ──────
window.addEventListener('keydown', (event) => {
  const meta = event.ctrlKey || event.metaKey
  if (!meta) return
  const key = event.key.toLowerCase()
  if (key === 'z') {
    event.preventDefault()
    if (event.shiftKey) store.redo()
    else store.undo()
  } else if (key === 'y') {
    event.preventDefault()
    store.redo()
  } else if (key === 's') {
    event.preventDefault()
    downloadDocument(store.getState().doc)
  }
}, true)

// The scroll position is part of the snapshot, so undo returns to the same place
nodes.sequencePanel?.addEventListener('scroll', () => {
  store.setUI({ scrollTop: nodes.sequencePanel.scrollTop }, { silent: true })
}, { passive: true })

const metaInputs = mountMeta()
store.subscribe((_state, reason) => render(reason))
render('init')

// On first open with no content, hint that the example can be loaded
if (!store.getState().doc.steps.length && !load(KEYS.doc, null)) {
  toast('Click “Load example” at the top right to see a full procedure', { icon: 'info', duration: 4000 })
}
