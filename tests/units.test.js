import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dimensionOf, formatAmount, formatDuration, formatEquiv, formatMass, formatVolume,
  concToSI, densityToSI, mwToSI, sig, toSI,
} from '../src/model/units.js'

const close = (actual, expected, tolerance = 1e-12) =>
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `${actual} vs ${expected}: difference too large`)

test('converts lab units to SI', () => {
  close(toSI(10, 'g'), 0.01)
  close(toSI(50, 'mL'), 5e-5)
  close(toSI(2, 'mmol'), 0.002)
  close(mwToSI(197.06), 0.19706)
  close(densityToSI(1.028), 1028)
  close(concToSI(1), 1000)
})

test('detects the dimension of a unit', () => {
  assert.equal(dimensionOf('g'), 'mass')
  assert.equal(dimensionOf('mL'), 'volume')
  assert.equal(dimensionOf('mol'), 'amount')
  assert.equal(dimensionOf('furlong'), null)
})

test('significant figures follow lab-notebook conventions', () => {
  assert.equal(sig(197.06), '197')
  assert.equal(sig(1.0512, 3), '1.05')
  assert.equal(formatMass(0.01), '10.0 g')
  assert.equal(formatMass(0.0191), '19.1 g')
  assert.equal(formatAmount(0.0507), '50.7 mmol')
  assert.equal(formatVolume(5e-5), '50 mL')
  assert.equal(formatEquiv(1), '1.0')
  assert.equal(formatEquiv(1.05), '1.05')
})

test('switches small and large quantities to a readable unit', () => {
  assert.equal(formatMass(1e-6), '1.0 mg')
  assert.equal(formatMass(2), '2.0 kg')
  assert.equal(formatVolume(2e-3), '2 L')
  assert.equal(formatAmount(2e-7), '0.2 µmol')
})

test('formats durations in Chinese for the zh narrative', () => {
  assert.equal(formatDuration(30), '30 分鐘')
  assert.equal(formatDuration(120), '2 小時')
  assert.equal(formatDuration(0.5), '30 秒')
})

test('missing values always return null, never NaN', () => {
  assert.equal(formatMass(null), null)
  assert.equal(formatVolume(undefined), null)
  assert.equal(formatEquiv(Number.NaN), null)
})
