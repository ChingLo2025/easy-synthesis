// 短、可讀、在單份文件內唯一的識別碼。
let counter = 0

export function uid(prefix = 's') {
  counter += 1
  const stamp = Date.now().toString(36).slice(-4)
  return `${prefix}${stamp}${counter.toString(36)}`
}

/** 在既有集合中產生不衝突的 id，用於匯入或複製 */
export function uniqueId(prefix, taken) {
  let id = uid(prefix)
  while (taken.has(id)) id = uid(prefix)
  taken.add(id)
  return id
}
