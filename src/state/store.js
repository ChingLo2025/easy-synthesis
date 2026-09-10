// 狀態容器與 Undo / Redo。
// 實作方式依規格 §5：整份狀態深拷貝推入堆疊（past[] / present / future[]），
// 文件夠小，不需 command pattern。快照包含選取狀態與捲動位置。
import { cloneDocument } from '../model/schema.js'

/** 規格要求至少 100 步，留一倍餘裕 */
export const HISTORY_LIMIT = 200
/** 連續修改同一欄位的合併視窗 */
export const COALESCE_MS = 500

export function createStore(initialDoc, initialUI = {}) {
  const listeners = new Set()

  let present = snapshot(initialDoc, { selectedId: null, scrollTop: 0, ...initialUI })
  let past = []
  let future = []

  let pendingKey = null
  let pendingTimer = null
  let flash = []

  function snapshot(doc, ui) {
    return { doc: cloneDocument(doc), ui: { ...ui } }
  }

  function notify(reason) {
    const state = getState()
    listeners.forEach((fn) => fn(state, reason))
  }

  function getState() {
    return {
      doc: present.doc,
      ui: present.ui,
      canUndo: past.length > 0,
      canRedo: future.length > 0,
      flash,
    }
  }

  function pushHistory() {
    past.push(snapshot(present.doc, present.ui))
    if (past.length > HISTORY_LIMIT) past.shift()
    future = []
  }

  /**
   * 修改文件。
   * key        — 同一 key 的連續修改合併為一筆（欄位輸入用）
   * structural — 增刪、排序、改 xN，立即各成一筆，且不與前後合併
   */
  function transact(mutate, { key = null, structural = false, silent = false } = {}) {
    if (structural || !key) {
      flushPending()
      pushHistory()
    } else if (pendingKey !== key) {
      flushPending()
      pushHistory()
      pendingKey = key
      restartTimer()
    } else {
      restartTimer()
    }

    const result = mutate(present.doc)
    if (result && typeof result === 'object' && result !== present.doc) present.doc = result
    flash = []
    if (!silent) notify('change')
    return present.doc
  }

  /** 不進入歷史的介面狀態（選取、捲動、分頁） */
  function setUI(partial, { silent = false } = {}) {
    present.ui = { ...present.ui, ...partial }
    if (!silent) notify('ui')
  }

  function restartTimer() {
    clearTimeout(pendingTimer)
    pendingTimer = setTimeout(flushPending, COALESCE_MS)
  }

  /** 提交時機：焦點離開、停頓 500 ms、切換步驟 */
  function flushPending() {
    clearTimeout(pendingTimer)
    pendingTimer = null
    pendingKey = null
  }

  function undo() {
    flushPending()
    if (!past.length) return false
    future.unshift(snapshot(present.doc, present.ui))
    const previous = past.pop()
    flash = diffStepIds(present.doc, previous.doc)
    present = previous
    notify('undo')
    return true
  }

  function redo() {
    flushPending()
    if (!future.length) return false
    past.push(snapshot(present.doc, present.ui))
    const next = future.shift()
    flash = diffStepIds(present.doc, next.doc)
    present = next
    notify('redo')
    return true
  }

  /** 載入範本或匯入檔案時重置歷史，不疊加（§5） */
  function replace(doc, { ui = {}, resetHistory = false } = {}) {
    flushPending()
    if (resetHistory) {
      past = []
      future = []
    } else {
      pushHistory()
    }
    present = snapshot(doc, { ...present.ui, ...ui })
    flash = []
    notify('replace')
  }

  function clearFlash() {
    flash = []
  }

  function subscribe(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  return {
    getState,
    subscribe,
    transact,
    setUI,
    undo,
    redo,
    replace,
    flush: flushPending,
    clearFlash,
    get historyDepth() {
      return { past: past.length, future: future.length }
    },
  }
}

/** 找出兩份文件間內容不同的步驟，供復原後閃爍高亮 */
function diffStepIds(before, after) {
  const map = (doc) => {
    const out = new Map()
    const walk = (steps) => {
      for (const step of steps) {
        out.set(step.id, JSON.stringify(step))
        if (step.branch?.steps) walk(step.branch.steps)
      }
    }
    walk(doc.steps ?? [])
    return out
  }
  const a = map(before)
  const b = map(after)
  const ids = []
  for (const [id, json] of b) if (a.get(id) !== json) ids.push(id)
  for (const [id] of a) if (!b.has(id)) ids.push(id)
  return ids
}
