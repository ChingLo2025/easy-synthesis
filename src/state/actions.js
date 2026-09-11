// 所有文件變更集中於此，UI 只負責呼叫。
// 結構性變動（增刪、排序、改 xN）立即各成一筆歷史；欄位輸入以 key 合併。
import { createBranch, createCompound, createStep, findStep, locateStep, mapCompoundRefs, walkSteps } from '../model/schema.js'
import { uid } from '../model/ids.js'
import { MAX_BRANCH_DEPTH } from '../model/steps.js'
import { rememberCompound } from '../model/library.js'
import { recallDefaults, rememberDefaults } from './prefs.js'

export function createActions(store) {
  const structural = { structural: true }

  function addStep(type, { parentId = null } = {}) {
    const defaults = recallDefaults(type, null)
    const step = createStep(type, sanitizeDefaults(type, defaults))
    store.transact((doc) => {
      const list = parentId ? branchList(doc, parentId) : doc.steps
      if (list) list.push(step)
    }, structural)
    store.setUI({ selectedId: step.id })
    return step
  }

  /** 分支上限 2 層（§2）；超過時由呼叫端提示改為另開一份程序 */
  function branchList(doc, parentId) {
    const hit = findStep(doc, parentId)
    if (!hit) return null
    if (hit.depth + 1 > MAX_BRANCH_DEPTH) return null
    if (!hit.step.branch) hit.step.branch = createBranch('')
    return hit.step.branch.steps
  }

  function canBranch(doc, stepId) {
    const hit = findStep(doc, stepId)
    return Boolean(hit) && hit.depth < MAX_BRANCH_DEPTH
  }

  function updateStep(stepId, patch, { key = null } = {}) {
    if (isNoop(findStep(store.getState().doc, stepId)?.step, patch)) return
    store.transact((doc) => {
      const hit = findStep(doc, stepId)
      if (!hit) return
      Object.assign(hit.step, patch)
      rememberStepDefaults(hit.step)
    }, key ? { key: `${stepId}:${key}` } : structural)
  }

  function updateAmount(stepId, patch) {
    const current = findStep(store.getState().doc, stepId)?.step
    if (!current || isNoop(current.amount ?? {}, patch)) return
    store.transact((doc) => {
      const hit = findStep(doc, stepId)
      if (!hit) return
      hit.step.amount = { ...(hit.step.amount ?? {}), ...patch }
      rememberStepDefaults(hit.step)
    }, patch.mode ? structural : { key: `${stepId}:amount` })
  }

  /** 預溶：patch 為 null 表示改回直接加入 */
  function updateDissolve(stepId, patch, { key = null } = {}) {
    const current = findStep(store.getState().doc, stepId)?.step
    if (!current) return
    const next = patch === null ? null : { solventId: null, volume: null, ...(current.dissolve ?? {}), ...patch }
    updateStep(stepId, { dissolve: next }, { key })
  }

  function setRepeat(stepId, repeat) {
    updateStep(stepId, { repeat: Math.max(1, Math.round(repeat) || 1) })
  }

  function removeStep(stepId) {
    store.transact((doc) => {
      const spot = locateStep(doc, stepId)
      if (spot) spot.list.splice(spot.index, 1)
    }, structural)
    if (store.getState().ui.selectedId === stepId) store.setUI({ selectedId: null })
  }

  function duplicateStep(stepId) {
    let copyId = null
    store.transact((doc) => {
      const spot = locateStep(doc, stepId)
      if (!spot) return
      const copy = cloneWithNewIds(spot.list[spot.index])
      copyId = copy.id
      spot.list.splice(spot.index + 1, 0, copy)
    }, structural)
    if (copyId) store.setUI({ selectedId: copyId })
  }

  /** position: 'before' | 'after' | 'into' */
  function moveStep(sourceId, targetId, position = 'after') {
    if (sourceId === targetId) return
    store.transact((doc) => {
      if (isAncestor(doc, sourceId, targetId)) return
      const from = locateStep(doc, sourceId)
      if (!from) return
      const [moved] = from.list.splice(from.index, 1)
      if (position === 'into') {
        const list = branchList(doc, targetId)
        if (list) list.push(moved)
        else from.list.splice(from.index, 0, moved)
        return
      }
      const to = locateStep(doc, targetId)
      if (!to) {
        from.list.splice(from.index, 0, moved)
        return
      }
      to.list.splice(position === 'before' ? to.index : to.index + 1, 0, moved)
    }, structural)
  }

  function toggleFreeform(stepId, enabled) {
    store.transact((doc) => {
      const hit = findStep(doc, stepId)
      if (!hit) return
      hit.step.freeform = enabled ? (hit.step.freeform ?? '') : null
    }, structural)
  }

  function setBranchLabel(stepId, label) {
    if (findStep(store.getState().doc, stepId)?.step.branch?.label === label) return
    store.transact((doc) => {
      const hit = findStep(doc, stepId)
      if (hit?.step.branch) hit.step.branch.label = label
    }, { key: `${stepId}:branchLabel` })
  }

  function removeBranch(stepId) {
    store.transact((doc) => {
      const hit = findStep(doc, stepId)
      if (hit) hit.step.branch = null
    }, structural)
  }

  function startBranch(stepId, label = '') {
    store.transact((doc) => {
      const hit = findStep(doc, stepId)
      if (hit && !hit.step.branch) hit.step.branch = createBranch(label)
    }, structural)
  }

  // ── 化合物 ───────────────────────────────────────────────────────────
  function addCompound(fields = {}) {
    const compound = createCompound(fields)
    store.transact((doc) => {
      doc.compounds.push(compound)
      if (!doc.basis.compoundId) doc.basis.compoundId = compound.id
    }, structural)
    if (compound.name) rememberCompound(compound)
    return compound
  }

  function updateCompound(id, patch, { key = null } = {}) {
    if (isNoop(store.getState().doc.compounds.find((c) => c.id === id), patch)) return
    store.transact((doc) => {
      const compound = doc.compounds.find((c) => c.id === id)
      if (compound) Object.assign(compound, patch)
    }, key ? { key: `${id}:${key}` } : structural)
    // 逐字輸入時不寫入個人庫，否則每個前綴（M、Me、MeO…）都會各成一筆；等欄位提交再記
    if (!key) commitCompound(id)
  }

  /** 欄位提交（blur）時把化合物記進個人庫 */
  function commitCompound(id) {
    const compound = store.getState().doc.compounds.find((c) => c.id === id)
    if (compound?.name?.trim()) rememberCompound(compound)
  }

  function removeCompound(id) {
    store.transact((doc) => {
      doc.compounds = doc.compounds.filter((c) => c.id !== id)
      if (doc.basis.compoundId === id) doc.basis.compoundId = doc.compounds[0]?.id ?? null
      walkSteps(doc.steps, (step) => mapCompoundRefs(step, (ref) => (ref === id ? null : ref)))
    }, structural)
  }

  function setBasis(patch) {
    if (isNoop(store.getState().doc.basis, patch)) return
    const isStructural = 'compoundId' in patch || 'unit' in patch
    store.transact((doc) => {
      doc.basis = { ...doc.basis, ...patch }
    }, isStructural ? structural : { key: 'basis' })
  }

  function setMeta(patch, { key = 'meta' } = {}) {
    if (isNoop(store.getState().doc.meta, patch)) return
    store.transact((doc) => {
      doc.meta = { ...doc.meta, ...patch }
    }, { key })
  }

  return {
    addStep, updateStep, updateAmount, updateDissolve, setRepeat, removeStep, duplicateStep, moveStep,
    toggleFreeform, startBranch, setBranchLabel, removeBranch, canBranch,
    addCompound, updateCompound, commitCompound, removeCompound, setBasis, setMeta,
  }
}

// 記住上次使用值的欄位（§5：同型別、同化合物的欄位，預設帶入上次使用值）
const REMEMBERED_FIELDS = {
  add: ['addMode', 'duration', 'rate', 'tempMax', 'vessel'],
  stir: ['atm', 'temp', 'time', 'rpm', 'special'],
  extract: ['phaseKept'],
  wash: [],
  filter: ['method', 'kept', 'rinseCount'],
  centrifuge: ['speed', 'speedUnit', 'time', 'temp', 'kept'],
  evaporate: ['method', 'temp', 'pressure'],
  dry: ['method', 'temp', 'time'],
  monitor: ['method', 'interval', 'criteria'],
}

// 只在「同型別＋同化合物」時帶入：某試劑習慣先溶於 THF，不代表每次加料都要預溶
const COMPOUND_FIELDS = {
  add: ['dissolve'],
}

function rememberStepDefaults(step) {
  const fields = REMEMBERED_FIELDS[step.type] ?? []
  const payload = {}
  for (const field of fields) {
    if (step[field] !== null && step[field] !== '' && step[field] !== undefined) payload[field] = step[field]
  }
  if (step.amount?.mode) payload.amountMode = step.amount.mode
  rememberDefaults(step.type, null, payload)
  const compoundId = step.compoundId ?? step.solventId ?? step.agentId ?? null
  if (!compoundId) return
  const own = {}
  for (const field of COMPOUND_FIELDS[step.type] ?? []) own[field] = step[field] ?? null
  rememberDefaults(step.type, compoundId, { ...payload, ...own })
}

/** 新值與現值相同就略過：重複點同一顆按鈕、change 事件補送，都不該多出一步復原或清掉重做 */
function isNoop(target, patch) {
  if (!target) return true
  return Object.entries(patch).every(
    ([field, value]) => target[field] === value || JSON.stringify(target[field]) === JSON.stringify(value),
  )
}

function sanitizeDefaults(type, defaults) {
  const allowed = REMEMBERED_FIELDS[type] ?? []
  const patch = {}
  for (const field of allowed) if (field in defaults) patch[field] = defaults[field]
  if (defaults.amountMode) patch.amount = { mode: defaults.amountMode, value: null }
  return patch
}

function cloneWithNewIds(step) {
  const copy = structuredClone(step)
  const reid = (node) => {
    node.id = uid('s')
    node.branch?.steps?.forEach(reid)
  }
  reid(copy)
  return copy
}

/** 防止把步驟拖進自己的分支而造成孤兒 */
function isAncestor(doc, ancestorId, nodeId) {
  const hit = findStep(doc, ancestorId)
  if (!hit) return false
  let found = false
  walkSteps([hit.step], (step) => {
    if (step.id === nodeId && step.id !== ancestorId) found = true
  })
  return found
}
