// JSON import/export. Lossless round-trip: normalize only fills in fields and never drops unknown ones.
import { normalizeDocument, serializeDocument } from '../model/schema.js'

export function downloadDocument(doc) {
  const text = serializeDocument(doc)
  const name = safeFileName(doc.meta?.title || 'synthesis-procedure')
  download(`${name}.json`, text, 'application/json')
}

export function download(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Open a file picker and parse the JSON */
export function pickDocument() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      try {
        resolve(normalizeDocument(JSON.parse(await file.text())))
      } catch (error) {
        reject(new Error(`Could not read the file: ${error.message}`))
      }
    }
    input.click()
  })
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function safeFileName(name) {
  return name.replace(/[\/:*?"<>|]/g, '_').trim().slice(0, 60) || 'procedure'
}
