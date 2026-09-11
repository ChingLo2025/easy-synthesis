// 應用組裝：狀態、三個面板、頂列、鍵盤、自動存檔。
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

// ── 渲染 ─────────────────────────────────────────────────────────────────
function render(reason) {
  const { doc, ui } = store.getState()
  metrics = compute(doc)

  const focus = captureFocus()
  // 重建 DOM 期間，被移除的焦點欄位送出的 blur 不算提交（見 store.holdFlush）
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
 * 全量重繪會換掉輸入框，這裡記下焦點位置，重繪後接回去。
 * 在 data-scope（步驟卡、支流、基準）範圍內找：有 name 的欄位以名稱定位，
 * 按鈕等沒有 name 的元素以順序定位，並比對種類與文字。
 * 找不到同一個元素就不接，寧可失焦，也不把焦點或內容放進別的欄位。
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
  // 打字中保留使用者的原字串（例如 "0."）；復原、重做時以模型值為準，游標放到最後
  if (keepRaw && node.value !== snapshot.raw) node.value = snapshot.raw
  const end = node.value.length
  const selection = keepRaw && snapshot.selection ? snapshot.selection : { start: end, end }
  try {
    node.setSelectionRange(selection.start, selection.end)
  } catch {
    /* 不支援選取範圍的欄位，忽略 */
  }
}

/** 元素種類、名稱與按鈕文字（或提示）；簽名相同才視為同一個元素 */
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
  toast(reason === 'undo' ? `已復原${flash.length ? `（${flash.length} 處變動）` : ''}` : '已重做', {
    icon: reason === 'undo' ? 'undo' : 'redo',
  })
}

// ── 頂列 ─────────────────────────────────────────────────────────────────
// 頂列欄位只建立一次；重繪時只同步數值，不重建使用者正在輸入的欄位
const META_FIELDS = [
  { key: 'title', placeholder: '未命名程序', className: 'meta-input--title' },
  { key: 'author', placeholder: '操作者', className: 'meta-input--sm' },
  { key: 'batchNo', placeholder: '批號', className: 'meta-input--sm' },
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

/** 輸入中的欄位不覆寫；復原、重做、載入範本時才強制同步 */
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
    iconButton('undo', '復原 (Ctrl+Z)', () => store.undo(), !canUndo),
    iconButton('redo', '重做 (Ctrl+Shift+Z)', () => store.redo(), !canRedo),
    el('span', { class: 'sep' }),
    iconButton('upload', '匯入 JSON', importJson),
    iconButton('download', '匯出 JSON', () => downloadDocument(store.getState().doc)),
    el('button', { class: 'btn btn--primary', type: 'button', onclick: () => window.print() }, [
      el('span', { html: iconMarkup('print', { size: 15 }) }),
      el('span', {}, '列印 / PDF'),
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
    el('button', { class: 'btn btn--ghost', type: 'button', onclick: loadSample }, '載入範例'),
  )
}

function renderStatus() {
  const { doc, canUndo } = store.getState()
  const errors = metrics.warnings.filter((w) => w.level === 'error').length
  const warns = metrics.warnings.filter((w) => w.level === 'warn').length
  clear(nodes.status)
  append(nodes.status, [
    statusItem('flow', `${metrics.rows.length} 步驟`),
    statusItem('table', `${doc.compounds.length} 化合物`),
    errors ? statusItem('warning', `${errors} 項待補`, 'error') : null,
    warns ? statusItem('info', `${warns} 項提醒`, 'warn') : null,
    el('span', { class: 'statusbar__spacer' }),
    statusItem('check', canUndo ? `可復原 ${store.historyDepth.past} 步` : '尚無變更'),
    statusItem('download', '已自動存檔'),
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

// ── 指令 ─────────────────────────────────────────────────────────────────
async function importJson() {
  try {
    const doc = await pickDocument()
    if (!doc) return
    store.replace(doc, { resetHistory: true, ui: { selectedId: null } })
    toast('已匯入程序', { icon: 'upload' })
  } catch (error) {
    toast(error.message, { tone: 'error', icon: 'warning' })
  }
}

function loadSample() {
  store.replace(createSampleDocument(), { resetHistory: true, ui: { selectedId: null } })
  toast('已載入範例程序', { icon: 'template' })
}

function saveWholeTemplate() {
  promptModal({
    title: '另存為範本',
    label: '範本名稱',
    value: store.getState().doc.meta?.title ?? '',
    onConfirm: (name) => {
      saveTemplate(name, store.getState().doc)
      toast(`已儲存範本「${name}」`, { icon: 'template' })
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
      // 載入範本時重置歷史，不疊加
      store.replace(templateToDocument(entry), { resetHistory: true, ui: { selectedId: null } })
      toast(`已載入範本「${entry.name}」`, { icon: 'template' })
    },
    onInsertGroup: (entry) => {
      const { steps, compounds } = expandGroup(entry, store.getState().doc)
      store.transact((doc) => {
        doc.compounds.push(...compounds)
        doc.steps.push(...steps)
      }, { structural: true })
      toast(`已插入「${entry.name}」共 ${steps.length} 步`, { icon: 'template' })
    },
    onSaveGroup: (name, steps) => {
      saveGroup(name, steps, store.getState().doc.compounds)
      toast(`已儲存群組「${name}」`, { icon: 'template' })
    },
  })
}

async function handleCopy(text, hasPending) {
  const ok = await copyText(text)
  if (!ok) return toast('瀏覽器拒絕存取剪貼簿', { tone: 'error', icon: 'warning' })
  toast(hasPending ? '已複製（仍含待補標記）' : '已複製純文字', {
    tone: hasPending ? 'warn' : 'info',
    icon: hasPending ? 'warning' : 'copy',
  })
}

// ── 鍵盤：全域攔截 Ctrl+Z 並 preventDefault，不與輸入框原生 undo 並存 ──────
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

// 捲動位置進入快照，復原後回到原處
nodes.sequencePanel?.addEventListener('scroll', () => {
  store.setUI({ scrollTop: nodes.sequencePanel.scrollTop }, { silent: true })
}, { passive: true })

const metaInputs = mountMeta()
store.subscribe((_state, reason) => render(reason))
render('init')

// 首次開啟且沒有內容時，提示可載入範例
if (!store.getState().doc.steps.length && !load(KEYS.doc, null)) {
  toast('點右上「載入範例」可看完整程序', { icon: 'info', duration: 4000 })
}
