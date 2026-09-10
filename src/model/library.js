// 個人試劑庫：使用者輸入過的化合物自動存入，第二次使用可直接搜尋帶入。
// 內建清單（reagents.js）只是種子。
import { BUILTIN_REAGENTS, searchReagents } from './reagents.js'
import { KEYS, load, save } from '../state/persist.js'

/** 以名稱＋CAS 當作同一物質的判準 */
function signature(entry) {
  const cas = (entry.cas ?? '').trim()
  return cas ? `cas:${cas.toLowerCase()}` : `name:${(entry.name ?? '').trim().toLowerCase()}`
}

export function loadLibrary() {
  const stored = load(KEYS.library, [])
  return Array.isArray(stored) ? stored : []
}

/** 記錄一筆化合物；同物質則更新欄位與使用次數 */
export function rememberCompound(compound) {
  const name = (compound?.name ?? '').trim()
  if (!name) return loadLibrary()

  const entry = {
    key: signature(compound),
    name,
    nameEn: compound.nameEn ?? '',
    cas: compound.cas ?? '',
    mw: compound.mw ?? null,
    density: compound.density ?? null,
    conc: compound.conc ?? null,
    purity: compound.purity ?? 1,
    role: compound.role ?? 'reactant',
    uses: 1,
    updatedAt: Date.now(),
  }

  const library = loadLibrary()
  const index = library.findIndex((item) => item.key === entry.key)
  if (index >= 0) {
    entry.uses = (library[index].uses ?? 0) + 1
    library[index] = { ...library[index], ...entry }
  } else {
    library.push(entry)
  }
  library.sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0) || a.name.localeCompare(b.name))
  save(KEYS.library, library)
  return library
}

export function forgetCompound(key) {
  const library = loadLibrary().filter((item) => item.key !== key)
  save(KEYS.library, library)
  return library
}

/**
 * 搜尋個人庫與內建庫，個人庫優先。
 * filter: 'drying' 只回乾燥劑、'solvent' 只回溶劑。
 */
export function searchAll(query, { filter = null, limit = 12 } = {}) {
  const personal = loadLibrary().map((item) => ({ ...item, source: 'personal' }))
  const builtin = BUILTIN_REAGENTS.map((item) => ({ ...item, source: 'builtin' }))
  const pool = [...personal, ...builtin].filter((item) => {
    if (filter === 'drying') return item.drying || item.role === 'reagent'
    if (filter === 'solvent') return item.role === 'solvent' || item.role === 'quench'
    return true
  })
  const seen = new Set()
  return searchReagents(query, pool)
    .filter((item) => {
      const sig = signature(item)
      if (seen.has(sig)) return false
      seen.add(sig)
      return true
    })
    .slice(0, limit)
}
