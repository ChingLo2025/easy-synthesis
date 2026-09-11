// Two levels of templates: whole-procedure templates (which bring the compound list along) and step groups.
import { KEYS, load, save } from '../state/persist.js'
import { cloneDocument, mapCompoundRefs, normalizeDocument, walkSteps } from '../model/schema.js'
import { uid } from '../model/ids.js'

export function listTemplates() {
  const list = load(KEYS.templates, [])
  return Array.isArray(list) ? list : []
}

export function saveTemplate(name, doc) {
  const list = listTemplates()
  const entry = {
    id: uid('tpl'),
    name: name.trim() || 'Untitled template',
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

/** Load a whole template: the caller must reset history instead of stacking onto it (§5) */
export function templateToDocument(entry) {
  const doc = normalizeDocument(cloneDocument(entry.doc))
  doc.meta = { ...doc.meta, date: new Date().toISOString().slice(0, 10) }
  return doc
}

// ── Step groups ───────────────────────────────────────────────────────────────

export function listGroups() {
  const list = load(KEYS.groups, [])
  return Array.isArray(list) ? list : []
}

/** Save selected steps as a group, e.g. a standard aqueous workup */
export function saveGroup(name, steps, compounds = []) {
  const list = listGroups()
  const used = new Set()
  steps.forEach((step) => walkSteps([step], (node) => mapCompoundRefs(node, (ref) => {
    used.add(ref)
    return ref
  })))
  const entry = {
    id: uid('grp'),
    name: name.trim() || 'Untitled group',
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
 * Expand a group into insertable steps: compounds are matched by name against the existing list, and missing ones are created.
 * Returns { steps, compounds }, where compounds are the ones that must be added to the document.
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
    mapCompoundRefs(node, (ref) => idMap.get(ref) ?? null)
  }))
  return { steps, compounds: additions }
}

function countSteps(doc) {
  let count = 0
  walkSteps(doc.steps, () => { count += 1 })
  return count
}
