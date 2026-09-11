import { test } from 'node:test'
import assert from 'node:assert/strict'
import { onTextInput, toNumber } from '../src/ui/fields.js'

const typing = (value, isComposing) => ({ isComposing, target: { value } })

test('input during composition (Zhuyin, Cangjie) is not sent, so re-renders do not interrupt the IME', () => {
  const seen = []
  const handlers = onTextInput((value) => seen.push(value))
  handlers.oninput(typing('ㄅ', true))
  handlers.oninput(typing('ㄅㄧ', true))
  assert.deepEqual(seen, [])
})

test('sends the final text when composition ends', () => {
  const seen = []
  const handlers = onTextInput((value) => seen.push(value))
  handlers.oninput(typing('ㄅㄧ', true))
  handlers.oncompositionend(typing('筆', false))
  assert.deepEqual(seen, ['筆'])
})

test('plain alphanumeric input is sent on every character', () => {
  const seen = []
  const handlers = onTextInput((value) => seen.push(value))
  handlers.oninput(typing('B', false))
  handlers.oninput(typing('B-', false))
  assert.deepEqual(seen, ['B', 'B-'])
})

test('lenient number parsing: an in-progress "0." does not become empty', () => {
  assert.equal(toNumber('0.'), 0)
  assert.equal(toNumber(' 1,000 '), 1000)
  assert.equal(toNumber(''), null)
  assert.equal(toNumber('abc'), null)
})

test('safety net: without compositionend, the change event on leaving the field still commits', () => {
  const seen = []
  const handlers = onTextInput((value) => seen.push(value))
  handlers.oninput(typing('ㄅ', true))
  handlers.onchange(typing('筆', false))
  assert.deepEqual(seen, ['筆'])
})
