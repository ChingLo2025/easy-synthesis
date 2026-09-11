// State container with Undo / Redo.
// As in spec §5: the whole state is deep-copied onto stacks (past[] / present / future[]);
// the document is small enough that no command pattern is needed. Snapshots include the selection and scroll position.
import { cloneDocument } from '../model/schema.js'

/** The spec requires at least 100 steps; keep double for headroom */
export const HISTORY_LIMIT = 200
/** Coalescing window for consecutive edits to the same field */
export const COALESCE_MS = 500

export function createStore(initialDoc, initialUI = {}) {
  const listeners = new Set()

  let present = snapshot(initialDoc, { selectedId: null, scrollTop: 0, ...initialUI })
  let past = []
  let future = []

  let pendingKey = null
  let pendingTimer = null
  let flash = []
  let flushHold = 0

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
   * Modify the document.
   * key        — consecutive edits with the same key merge into one entry (for field input)
   * structural — add/remove, reorder, change xN: each becomes its own entry immediately and never merges
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

  /** UI state that stays out of history (selection, scroll, tab) */
  function setUI(partial, { silent = false } = {}) {
    present.ui = { ...present.ui, ...partial }
    if (!silent) notify('ui')
  }

  function restartTimer() {
    clearTimeout(pendingTimer)
    pendingTimer = setTimeout(flushPending, COALESCE_MS)
  }

  /** Commit points: focus leaves, a 500 ms pause, switching steps */
  function flushPending() {
    clearTimeout(pendingTimer)
    pendingTimer = null
    pendingKey = null
  }

  /**
   * A re-render removes the focused input, and Chrome fires blur synchronously at that moment.
   * That isn't the user leaving the field, so flushes during it don't commit; otherwise every keystroke would be its own undo step.
   */
  function holdFlush(fn) {
    flushHold += 1
    try {
      return fn()
    } finally {
      flushHold -= 1
    }
  }

  function flush() {
    if (!flushHold) flushPending()
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

  /** Loading a template or importing a file resets history instead of stacking onto it (§5) */
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
    flush,
    holdFlush,
    clearFlash,
    get historyDepth() {
      return { past: past.length, future: future.length }
    },
  }
}

/** Find steps whose content differs between two documents, for flash highlighting after undo */
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
