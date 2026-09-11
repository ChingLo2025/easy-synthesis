import { test } from 'node:test'
import assert from 'node:assert/strict'
import { onTextInput, toNumber } from '../src/ui/fields.js'

const typing = (value, isComposing) => ({ isComposing, target: { value } })

test('組字中（注音、倉頡）的 input 不送出，避免重繪打斷輸入法', () => {
  const seen = []
  const handlers = onTextInput((value) => seen.push(value))
  handlers.oninput(typing('ㄅ', true))
  handlers.oninput(typing('ㄅㄧ', true))
  assert.deepEqual(seen, [])
})

test('組字結束時送出最終文字', () => {
  const seen = []
  const handlers = onTextInput((value) => seen.push(value))
  handlers.oninput(typing('ㄅㄧ', true))
  handlers.oncompositionend(typing('筆', false))
  assert.deepEqual(seen, ['筆'])
})

test('一般英數輸入每個字元都送出', () => {
  const seen = []
  const handlers = onTextInput((value) => seen.push(value))
  handlers.oninput(typing('B', false))
  handlers.oninput(typing('B-', false))
  assert.deepEqual(seen, ['B', 'B-'])
})

test('數值寬鬆解析：輸入中的 "0." 不會變成空值', () => {
  assert.equal(toNumber('0.'), 0)
  assert.equal(toNumber(' 1,000 '), 1000)
  assert.equal(toNumber(''), null)
  assert.equal(toNumber('abc'), null)
})

test('保險：沒收到 compositionend 時，離開欄位的 change 事件仍會提交', () => {
  const seen = []
  const handlers = onTextInput((value) => seen.push(value))
  handlers.oninput(typing('ㄅ', true))
  handlers.onchange(typing('筆', false))
  assert.deepEqual(seen, ['筆'])
})
