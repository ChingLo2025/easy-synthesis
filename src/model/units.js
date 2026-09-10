// 單位轉換與格式化。
// 內部一律 SI：物質量 mol、質量 kg、體積 m³、濃度 mol/m³、莫耳質量 kg/mol、密度 kg/m³。
// JSON 與介面使用實驗室慣用單位（g、mL、mol/L、g/mol、g/mL），僅在進出邊界轉換。

export const MASS_UNITS = { kg: 1, g: 1e-3, mg: 1e-6, µg: 1e-9 }
export const VOLUME_UNITS = { L: 1e-3, mL: 1e-6, µL: 1e-9 }
export const AMOUNT_UNITS = { mol: 1, mmol: 1e-3, µmol: 1e-6 }

export const BASIS_UNITS = ['g', 'mg', 'kg', 'mL', 'L', 'mol', 'mmol']

/** 判斷 basis 單位屬於哪個維度 */
export function dimensionOf(unit) {
  if (unit in MASS_UNITS) return 'mass'
  if (unit in VOLUME_UNITS) return 'volume'
  if (unit in AMOUNT_UNITS) return 'amount'
  return null
}

/** 使用者單位 → SI */
export function toSI(value, unit) {
  if (!isNum(value)) return null
  const factor = MASS_UNITS[unit] ?? VOLUME_UNITS[unit] ?? AMOUNT_UNITS[unit]
  return factor == null ? null : value * factor
}

// 慣用單位 ↔ SI 的具名捷徑，避免呼叫端散落魔術數字。
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
 * 有效位數格式化。實驗記錄慣例：整數位多時不留小數，微量時保留有效位。
 */
export function sig(value, digits = SIG_DIGITS, minDecimals = 0) {
  if (!isNum(value)) return '—'
  if (value === 0) return minDecimals ? (0).toFixed(minDecimals) : '0'
  const abs = Math.abs(value)
  if (abs >= 1e5 || abs < 1e-4) return value.toExponential(Math.max(0, digits - 1)).replace('e', '×10^')
  const magnitude = Math.floor(Math.log10(abs))
  const decimals = Math.min(6, Math.max(0, digits - 1 - magnitude))
  const text = value.toFixed(decimals)
  // 實驗記錄慣例：質量、莫耳數、當量至少留一位小數（10 -> 10.0）
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

/** 自動挑選好讀的質量單位（SI kg → 顯示字串） */
export function formatMass(kg, { unit, minDecimals = 1 } = {}) {
  if (!isNum(kg)) return null
  if (unit) return `${sig(kg / MASS_UNITS[unit], SIG_DIGITS, minDecimals)} ${unit}`
  const g = kgToG(kg)
  if (Math.abs(g) >= 1000) return `${sig(g / 1000, SIG_DIGITS, minDecimals)} kg`
  if (Math.abs(g) >= 0.1) return `${sig(g, SIG_DIGITS, minDecimals)} g`
  return `${sig(g * 1000, SIG_DIGITS, minDecimals)} mg`
}

/** SI m³ → 顯示字串 */
export function formatVolume(m3, { unit } = {}) {
  if (!isNum(m3)) return null
  if (unit) return `${sig(m3 / VOLUME_UNITS[unit])} ${unit}`
  const ml = m3ToMl(m3)
  if (Math.abs(ml) >= 1000) return `${sig(ml / 1000)} L`
  if (Math.abs(ml) >= 0.1) return `${sig(ml)} mL`
  return `${sig(ml * 1000)} µL`
}

/** SI mol → 顯示字串 */
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

/** 顯示溫度、時間等純量，附單位 */
export function withUnit(value, unit, digits) {
  return isNum(value) ? `${sig(value, digits)} ${unit}` : null
}

/** 分鐘 → 好讀的中文時間 */
export function formatDuration(min) {
  if (!isNum(min)) return null
  if (min < 1) return `${sig(min * 60)} 秒`
  if (min < 60) return `${sig(min)} 分鐘`
  const hours = min / 60
  if (Number.isInteger(hours)) return `${hours} 小時`
  return `${sig(hours)} 小時`
}

/** 分鐘 → 英文時間 */
export function formatDurationEn(min) {
  if (!isNum(min)) return null
  if (min < 1) return `${sig(min * 60)} s`
  if (min < 60) return `${sig(min)} min`
  const hours = min / 60
  return `${Number.isInteger(hours) ? hours : sig(hours)} h`
}
