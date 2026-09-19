// JSON import/export. Lossless round-trip: normalize only fills in fields and never drops unknown ones.
import { normalizeDocument, serializeDocument } from '../model/schema.js'

/** Suggested file name from the procedure title */
export function defaultFileName(doc) {
  return `${safeFileName(doc.meta?.title || 'synthesis-procedure')}.json`
}

/** Chrome and Edge can open a real save dialog, where both the name and the folder are chosen */
export function hasSaveDialog() {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function'
}

/**
 * Save through the browser's save dialog.
 * { saved: true, name } when written, { cancelled: true } when dismissed,
 * { saved: false, suggestedName } when the dialog is unavailable and the caller should ask for a name.
 */
export async function saveDocumentAs(doc) {
  const suggestedName = defaultFileName(doc)
  if (!hasSaveDialog()) return { saved: false, suggestedName }
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName,
      types: [{ description: 'Procedure JSON', accept: { 'application/json': ['.json'] } }],
    })
    const stream = await handle.createWritable()
    await stream.write(serializeDocument(doc))
    await stream.close()
    return { saved: true, name: handle.name }
  } catch (error) {
    if (error?.name === 'AbortError') return { cancelled: true }
    return { saved: false, suggestedName }
  }
}

/** Fallback for browsers without a save dialog: download under the given name */
export function downloadDocument(doc, fileName = null) {
  const name = (fileName ?? '').trim() || defaultFileName(doc)
  download(name.toLowerCase().endsWith('.json') ? name : `${name}.json`, serializeDocument(doc), 'application/json')
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
