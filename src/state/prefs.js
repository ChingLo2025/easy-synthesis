// 使用習慣：按鈕順序依使用頻率自動重排；同型別、同化合物的欄位帶入上次使用值。
import { KEYS, load, save, throttledSave } from './persist.js'

let frequency = null
let lastUsed = null
// 逐字輸入時也會呼叫；寫入 localStorage 延後到停頓之後
const saveLastUsed = throttledSave(KEYS.lastUsed)

function freq() {
  if (!frequency) frequency = load(KEYS.frequency, {}) ?? {}
  return frequency
}

function recent() {
  if (!lastUsed) lastUsed = load(KEYS.lastUsed, {}) ?? {}
  return lastUsed
}

/** 記錄一次點擊 */
export function bumpUsage(id) {
  const table = freq()
  table[id] = (table[id] ?? 0) + 1
  save(KEYS.frequency, table)
}

export function usageCount(id) {
  return freq()[id] ?? 0
}

/**
 * 依使用頻率重排，同分維持原始順序（穩定排序）。
 * 未使用過的按鈕保持設計順序，避免介面在初次使用時亂跳。
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

/** 記住某型別（或某型別＋化合物）最後使用的欄位值 */
export function rememberDefaults(type, compoundId, fields) {
  const table = recent()
  table[defaultsKey(type, compoundId)] = { ...(table[defaultsKey(type, compoundId)] ?? {}), ...fields }
  saveLastUsed(table)
}

/** 取回預設值：化合物專屬優先，其次型別通用 */
export function recallDefaults(type, compoundId) {
  const table = recent()
  return { ...(table[type] ?? {}), ...(compoundId ? (table[defaultsKey(type, compoundId)] ?? {}) : {}) }
}

/** 測試用：清空快取，強制重讀 */
export function resetPrefsCache() {
  frequency = null
  lastUsed = null
}
