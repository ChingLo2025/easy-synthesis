// 卡片內的欄位小工具。所有輸入都在 blur 時 flush，讓連續輸入合併為一筆歷史。
import { el } from './dom.js'
import { bumpUsage, rankByUsage } from '../state/prefs.js'

/** 寬鬆解析：輸入中的 "0." 不該被吃掉，交給焦點還原保留原字串 */
export function toNumber(value) {
  if (value === null || value === undefined) return null
  const text = String(value).trim().replace(/,/g, '')
  if (!text) return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * 文字輸入事件。組字中（注音、倉頡等）的 input 不送出，等 compositionend 才更新：
 * 全量重繪會換掉輸入框，組字途中重繪會讓輸入法的候選字整段消失。
 */
export function onTextInput(handler) {
  return {
    oninput: (event) => {
      if (!event.isComposing) handler(event.target.value)
    },
    oncompositionend: (event) => handler(event.target.value),
    // 保險：萬一瀏覽器沒送 compositionend，離開欄位時仍會提交；值沒變時由 actions 略過
    onchange: (event) => handler(event.target.value),
  }
}

/**
 * 數值輸入一律用 type="text" + inputmode="decimal"。
 * type="number" 在輸入 "0." 這類中間狀態時會把值清成空字串，游標與內容都會跳掉。
 */
export function numberInput({ value, placeholder = '', name = null, onInput, onBlur }) {
  return el('input', {
    type: 'text',
    class: 'num',
    inputmode: 'decimal',
    autocomplete: 'off',
    value: value ?? '',
    placeholder,
    name,
    ...onTextInput((text) => onInput(toNumber(text))),
    onblur: onBlur,
  })
}

export function field(label, control) {
  return el('div', { class: 'field' }, [label ? el('span', { class: 'field__label' }, label) : null, control])
}

export function numberField(label, { value, onInput, onBlur, placeholder = '', suffix = '', name = null }) {
  return field(suffix ? `${label}（${suffix}）` : label, numberInput({ value, placeholder, name, onInput, onBlur }))
}

export function textField(label, { value, onInput, onBlur, placeholder = '', name = null }) {
  return field(label, el('input', {
    type: 'text',
    value: value ?? '',
    placeholder,
    name,
    ...onTextInput(onInput),
    onblur: onBlur,
  }))
}

export function selectField(label, { value, options, onChange }) {
  const select = el('select', { onchange: (event) => onChange(event.target.value) },
    options.map(([val, text]) => el('option', { value: val, selected: value === val }, text)))
  return field(label, select)
}

/**
 * 常用條件按鈕。順序依使用頻率自動重排（§5），同分維持設計順序。
 * items: [{ id, label, active }]
 */
export function chipRow(label, items, onPick, { rank = true, namespace = 'chip' } = {}) {
  const ordered = rank ? rankByUsage(items, (item) => `${namespace}:${item.id}`) : items
  return el('div', { class: 'card__chips' }, [
    label ? el('span', { class: 'card__chips-label' }, label) : null,
    ...ordered.map((item) =>
      el('button', {
        class: 'chip',
        type: 'button',
        'aria-pressed': item.active ? 'true' : 'false',
        onclick: () => {
          bumpUsage(`${namespace}:${item.id}`)
          onPick(item)
        },
      }, item.label),
    ),
  ])
}

export function row(children, { tight = false } = {}) {
  return el('div', { class: tight ? 'card__row card__row--tight' : 'card__row' }, children)
}
