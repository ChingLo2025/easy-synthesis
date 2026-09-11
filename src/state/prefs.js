// Usage habits: buttons re-rank by usage frequency; fields of the same type and compound default to the last-used value.
import { KEYS, load, save, throttledSave } from './persist.js'

let frequency = null
let lastUsed = null
// Also called while typing char by char; the localStorage write is deferred until a pause
const saveLastUsed = throttledSave(KEYS.lastUsed)

function freq() {
  if (!frequency) frequency = load(KEYS.frequency, {}) ?? {}
  return frequency
}

function recent() {
  if (!lastUsed) lastUsed = load(KEYS.lastUsed, {}) ?? {}
  return lastUsed
}

/** Record one click */
export function bumpUsage(id) {
  const table = freq()
  table[id] = (table[id] ?? 0) + 1
  save(KEYS.frequency, table)
}

export function usageCount(id) {
  return freq()[id] ?? 0
}

/**
 * Re-rank by usage frequency; ties keep the original order (stable sort).
 * Unused buttons keep the design order so the interface doesn't jump around on first use.
 */
export function rankByUsage(items, keyOf = (item) => item.id) {
  return items
    .map((item, index) => ({ item, index, count: usageCount(keyOf(item)) }))
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .map((entry) => entry.item)
}

function defaultsKey(type, compoundId) {
  return compoundId ? `${type}:${compoundId}` : type
}

/** Remember the last-used field values for a type (or type + compound) */
export function rememberDefaults(type, compoundId, fields) {
  const table = recent()
  // Store a copy: later changes to steps in the document (e.g. deleting a compound) won't alter the remembered values
  table[defaultsKey(type, compoundId)] = { ...(table[defaultsKey(type, compoundId)] ?? {}), ...structuredClone(fields) }
  saveLastUsed(table)
}

/** Recall defaults: compound-specific first, then type-wide */
export function recallDefaults(type, compoundId) {
  const table = recent()
  return structuredClone({ ...(table[type] ?? {}), ...(compoundId ? (table[defaultsKey(type, compoundId)] ?? {}) : {}) })
}

/** For tests: clear the cache and force a re-read */
export function resetPrefsCache() {
  frequency = null
  lastUsed = null
}
