// 短暫提示。復原後的提示文字也走這裡。
import { iconMarkup } from './icons.js'

const DURATION = 2400
let host = null

export function initToaster(node) {
  host = node
}

export function toast(message, { tone = 'info', icon = null, duration = DURATION } = {}) {
  if (!host) return
  const node = document.createElement('div')
  node.className = 'toast'
  node.dataset.tone = tone
  node.innerHTML = `${icon ? iconMarkup(icon, { size: 15 }) : ''}<span></span>`
  node.querySelector('span').textContent = message
  host.append(node)
  setTimeout(() => {
    node.style.transition = 'opacity 160ms'
    node.style.opacity = '0'
    setTimeout(() => node.remove(), 180)
  }, duration)
}
