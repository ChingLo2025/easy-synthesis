// Small field widgets inside cards. Every input flushes on blur, so continuous typing merges into one history entry.
import { el } from './dom.js'
import { bumpUsage, rankByUsage } from '../state/prefs.js'

/** Lenient parse: an in-progress "0." must not be swallowed; focus restore keeps the raw string */
export function toNumber(value) {
  if (value === null || value === undefined) return null
  const text = String(value).trim().replace(/,/g, '')
  if (!text) return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Text input events. Input during composition (Zhuyin, Cangjie, etc.) is not sent; update on compositionend instead:
 * a full re-render replaces the input, and re-rendering mid-composition wipes out the IME candidates.
 */
export function onTextInput(handler) {
  return {
    oninput: (event) => {
      if (!event.isComposing) handler(event.target.value)
    },
    oncompositionend: (event) => handler(event.target.value),
    // Safety net: if the browser never fires compositionend, leaving the field still commits; unchanged values are skipped by actions
    onchange: (event) => handler(event.target.value),
  }
}

/**
 * Numeric inputs always use type="text" + inputmode="decimal".
 * type="number" clears the value on intermediate states such as "0.", making the caret and content jump.
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
  return field(suffix ? `${label} (${suffix})` : label, numberInput({ value, placeholder, name, onInput, onBlur }))
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
 * Quick condition buttons. Order is re-ranked by usage frequency (§5); ties keep the design order.
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
