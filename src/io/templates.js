// 兩層範本：整份程序範本（連化合物清單一併帶入），以及步驟群組。
import { KEYS, load, save } from '../state/persist.js'
import { cloneDocument, normalizeDocument, walkSteps } from '../model/schema.js'
import { uid } from '../model/ids.js'

export function listTemplates() {
  const list = load(KEYS.templates, [])
  return Array.isArray(list) ? list : []
}

export function saveTemplate(name, doc) {
  const list = listTemplates()
  const entry = {
    id: uid('tpl'),
    name: name.trim() || '未命名範本',
    savedAt: Date.now(),
    steps: countSteps(doc),
    doc: cloneDocument(doc),
  }
  list.unshift(entry)
  save(KEYS.templates, list.slice(0, 40))
  return entry
}

export function deleteTemplate(id) {
  save(KEYS.templates, listTemplates().filter((item) => item.id !== id))
}

/** 載入整份範本：呼叫端需重置歷史，不疊加（§5） */
export function templateToDocument(entry) {
  const doc = normalizeDocument(cloneDocument(entry.doc))
  doc.meta = { ...doc.meta, date: new Date().toISOString().slice(0, 10) }
  return doc
}

// ── 步驟群組 ───────────────────────────────────────────────────────────────

export function listGroups() {
  const list = load(KEYS.groups, [])
  return Array.isArray(list) ? list : []
}

/** 選取數個步驟存為群組，例：標準水相後處理 */
export function saveGroup(name, steps, compounds = []) {
  const list = listGroups()
  const used = new Set()
  steps.forEach((step) => walkSteps([step], (node) => {
    for (const field of ['compoundId', 'solventId', 'agentId']) if (node[field]) used.add(node[field])
  }))
  const entry = {
    id: uid('grp'),
    name: name.trim() || '未命名群組',
    savedAt: Date.now(),
    steps: structuredClone(steps),
    compounds: compounds.filter((compound) => used.has(compound.id)),
  }
  list.unshift(entry)
  save(KEYS.groups, list.slice(0, 60))
  return entry
}

export function deleteGroup(id) {
  save(KEYS.groups, listGroups().filter((item) => item.id !== id))
}

/**
 * 把群組展開成可插入的步驟：化合物以名稱比對既有清單，缺的補建。
 * 回傳 { steps, compounds } —— compounds 為需要新增到文件的化合物。
 */
export function expandGroup(entry, doc) {
  const idMap = new Map()
  const additions = []
  for (const compound of entry.compounds ?? []) {
    const existing = doc.compounds.find((c) => c.name === compound.name && (c.cas ?? '') === (compound.cas ?? ''))
    if (existing) {
      idMap.set(compound.id, existing.id)
    } else {
      const copy = { ...structuredClone(compound), id: uid('c') }
      idMap.set(compound.id, copy.id)
      additions.push(copy)
    }
  }

  const steps = structuredClone(entry.steps)
  steps.forEach((step) => walkSteps([step], (node) => {
    node.id = uid('s')
    for (const field of ['compoundId', 'solventId', 'agentId']) {
      if (node[field]) node[field] = idMap.get(node[field]) ?? null
    }
  }))
  return { steps, compounds: additions }
}

function countSteps(doc) {
  let count = 0
  walkSteps(doc.steps, () => { count += 1 })
  return count
}
