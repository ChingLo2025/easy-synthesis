// Unit conversion and formatting.
// Internally always SI: amount mol, mass kg, volume m³, concentration mol/m³, molar mass kg/mol, density kg/m³.
// JSON and the interface use lab units (g, mL, mol/L, g/mol, g/mL), converted only at the boundary.

export const MASS_UNITS = { kg: 1, g: 1e-3, mg: 1e-6, µg: 1e-9 }
export const VOLUME_UNITS = { L: 1e-3, mL: 1e-6, µL: 1e-9 }
export const AMOUNT_UNITS = { mol: 1, mmol: 1e-3, µmol: 1e-6 }

export const BASIS_UNITS = ['g', 'mg', 'kg', 'mL', 'L', 'mol', 'mmol']

/** Which dimension a basis unit belongs to */
export function dimensionOf(unit) {
  if (unit in MASS_UNITS) return 'mass'
  if (unit in VOLUME_UNITS) return 'volume'
  if (unit in AMOUNT_UNITS) return 'amount'
  return null
}

/** User unit → SI */
export function toSI(value, unit) {
  if (!isNum(value)) return null
  const factor = MASS_UNITS[unit] ?? VOLUME_UNITS[unit] ?? AMOUNT_UNITS[unit]
  return factor == null ? null : value * factor
}

// Named shortcuts between lab units and SI, so callers don't scatter magic numbers.
export const gToKg = (g) => (isNum(g) ? g * 1e-3 : null)
export const kgToG = (kg) => (isNum(kg) ? kg * 1e3 : null)
export const mlToM3 = (ml) => (isNum(ml) ? ml * 1e-6 : null)
export const m3ToMl = (m3) => (isNum(m3) ? m3 * 1e6 : null)
export const molToMmol = (mol) => (isNum(mol) ? mol * 1e3 : null)

/** g/mol → kg/mol */
export const mwToSI = (gPerMol) => (isNum(gPerMol) && gPerMol > 0 ? gPerMol * 1e-3 : null)
/** g/mL → kg/m³ */
export const densityToSI = (gPerMl) => (isNum(gPerMl) && gPerMl > 0 ? gPerMl * 1e3 : null)
/** mol/L → mol/m³ */
export const concToSI = (molPerL) => (isNum(molPerL) && molPerL > 0 ? molPerL * 1e3 : null)

export function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v)
}

const SIG_DIGITS = 3

/**
 * Significant-figure formatting. Lab-notebook convention: no decimals for large integers, keep significant digits for trace amounts.
 */
export function sig(value, digits = SIG_DIGITS, minDecimals = 0) {
  if (!isNum(value)) return '—'
  if (value === 0) return minDecimals ? (0).toFixed(minDecimals) : '0'
  const abs = Math.abs(value)
  if (abs >= 1e5 || abs < 1e-4) return value.toExponential(Math.max(0, digits - 1)).replace('e', '×10^')
  const magnitude = Math.floor(Math.log10(abs))
  const decimals = Math.min(6, Math.max(0, digits - 1 - magnitude))
  const text = value.toFixed(decimals)
  // Lab-notebook convention: mass, moles and equivalents keep at least one decimal (10 -> 10.0)
  return minDecimals ? keepDecimals(text, minDecimals) : trimZeros(text)
}

function keepDecimals(text, minDecimals) {
  const trimmed = trimZeros(text)
  const decimals = trimmed.includes('.') ? trimmed.split('.')[1].length : 0
  return decimals >= minDecimals ? trimmed : Number(trimmed).toFixed(minDecimals)
}

function trimZeros(text) {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text
}

/** Pick a readable mass unit automatically (SI kg → display string) */
export function formatMass(kg, { unit, minDecimals = 1 } = {}) {
  if (!isNum(kg)) return null
  if (unit) return `${sig(kg / MASS_UNITS[unit], SIG_DIGITS, minDecimals)} ${unit}`
  const g = kgToG(kg)
  if (Math.abs(g) >= 1000) return `${sig(g / 1000, SIG_DIGITS, minDecimals)} kg`
  if (Math.abs(g) >= 0.1) return `${sig(g, SIG_DIGITS, minDecimals)} g`
  return `${sig(g * 1000, SIG_DIGITS, minDecimals)} mg`
}

/** SI m³ → display string */
export function formatVolume(m3, { unit } = {}) {
  if (!isNum(m3)) return null
  if (unit) return `${sig(m3 / VOLUME_UNITS[unit])} ${unit}`
  const ml = m3ToMl(m3)
  if (Math.abs(ml) >= 1000) return `${sig(ml / 1000)} L`
  if (Math.abs(ml) >= 0.1) return `${sig(ml)} mL`
  return `${sig(ml * 1000)} µL`
}

/** SI mol → display string */
export function formatAmount(mol, { minDecimals = 1 } = {}) {
  if (!isNum(mol)) return null
  if (Math.abs(mol) >= 1) return `${sig(mol, SIG_DIGITS, minDecimals)} mol`
  if (Math.abs(mol) >= 1e-3) return `${sig(mol * 1e3, SIG_DIGITS, minDecimals)} mmol`
  return `${sig(mol * 1e6, SIG_DIGITS, minDecimals)} µmol`
}

export function formatEquiv(equiv) {
  if (!isNum(equiv)) return null
  return equiv >= 100 ? sig(equiv, 4) : sig(equiv, 3, 1)
}

/** Scalars such as temperature and time, with unit */
export function withUnit(value, unit, digits) {
  return isNum(value) ? `${sig(value, digits)} ${unit}` : null
}

/** Minutes → readable Chinese duration (used only by the Chinese narrative) */
export function formatDuration(min) {
  if (!isNum(min)) return null
  if (min < 1) return `${sig(min * 60)} 秒`
  if (min < 60) return `${sig(min)} 分鐘`
  const hours = min / 60
  if (Number.isInteger(hours)) return `${hours} 小時`
  return `${sig(hours)} 小時`
}

/** Minutes → English duration */
export function formatDurationEn(min) {
  if (!isNum(min)) return null
  if (min < 1) return `${sig(min * 60)} s`
  if (min < 60) return `${sig(min)} min`
  const hours = min / 60
  return `${Number.isInteger(hours) ? hours : sig(hours)} h`
}
