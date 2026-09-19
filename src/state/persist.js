// Thin localStorage wrapper. Private mode or a full quota must not crash the app, so everything is wrapped in try/catch.
const NAMESPACE = 'easy-synthesis'

export const KEYS = {
  doc: 'doc',
  library: 'library',
  templates: 'templates',
  groups: 'groups',
  frequency: 'frequency',
  lastUsed: 'last-used',
  sections: 'hidden-sections',
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
    /* Ignore: without storage the feature simply degrades */
  }
}

/** Throttled writes, so not every keystroke touches storage */
export function throttledSave(key, delay = 400) {
  let timer = null
  let latest = null
  return (value) => {
    latest = value
    clearTimeout(timer)
    timer = setTimeout(() => save(key, latest), delay)
  }
}
