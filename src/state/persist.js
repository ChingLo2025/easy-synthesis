// localStorage 薄封裝。瀏覽器隱私模式或配額滿時不得讓整個應用崩潰，故一律 try/catch。
const NAMESPACE = 'easy-synthesis'

export const KEYS = {
  doc: 'doc',
  library: 'library',
  templates: 'templates',
  groups: 'groups',
  frequency: 'frequency',
  lastUsed: 'last-used',
}

function fullKey(key) {
  return `${NAMESPACE}:${key}`
}

export function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(fullKey(key))
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(fullKey(key), JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(fullKey(key))
  } catch {
    /* 忽略：無儲存空間時功能降級即可 */
  }
}

/** 節流寫入，避免每次輸入都碰硬碟 */
export function throttledSave(key, delay = 400) {
  let timer = null
  let latest = null
  return (value) => {
    latest = value
    clearTimeout(timer)
    timer = setTimeout(() => save(key, latest), delay)
  }
}
