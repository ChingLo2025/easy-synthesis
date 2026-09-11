// Short, readable identifiers, unique within a single document.
let counter = 0

export function uid(prefix = 's') {
  counter += 1
  const stamp = Date.now().toString(36).slice(-4)
  return `${prefix}${stamp}${counter.toString(36)}`
}

/** Generate an id that doesn't collide with an existing set, for import or duplication */
export function uniqueId(prefix, taken) {
  let id = uid(prefix)
  while (taken.has(id)) id = uid(prefix)
  taken.add(id)
  return id
}
