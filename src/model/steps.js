// 步驟型別的中央定義：面板順序、視覺分類、預設值、可帶入的化合物欄位。
// 新增型別時只動這裡與 narrative/flow 的對應表。

/** 三類色相：投入 / 轉化 / 分離。其餘近乎單色。 */
export const FAMILY = {
  input: 'input',
  transform: 'transform',
  separate: 'separate',
}

export const STEP_TYPES = {
  add: {
    label: '加入物質',
    labelEn: 'Addition',
    family: FAMILY.input,
    icon: 'add',
    compoundField: 'compoundId',
    flowSide: 'in',
  },
  stir: {
    label: '攪拌',
    labelEn: 'Stirring',
    family: FAMILY.transform,
    icon: 'stir',
    compoundField: null,
    flowSide: null,
  },
  extract: {
    label: '萃取',
    labelEn: 'Extraction',
    family: FAMILY.separate,
    icon: 'extract',
    compoundField: 'solventId',
    flowSide: 'both',
  },
  wash: {
    label: '水洗',
    labelEn: 'Washing',
    family: FAMILY.separate,
    icon: 'wash',
    compoundField: 'solventId',
    flowSide: 'both',
  },
  filter: {
    label: '過濾',
    labelEn: 'Filtration',
    family: FAMILY.separate,
    icon: 'filter',
    // 濾餅洗液選填，沒填不算缺漏
    compoundField: 'solventId',
    compoundOptional: true,
    flowSide: 'both',
  },
  centrifuge: {
    label: '離心',
    labelEn: 'Centrifugation',
    family: FAMILY.separate,
    icon: 'centrifuge',
    compoundField: null,
    flowSide: 'out',
  },
  evaporate: {
    label: '濃縮',
    labelEn: 'Concentration',
    family: FAMILY.separate,
    icon: 'evaporate',
    compoundField: null,
    flowSide: 'out',
  },
  dry: {
    label: '乾燥',
    labelEn: 'Drying',
    family: FAMILY.separate,
    icon: 'dry',
    compoundField: 'agentId',
    flowSide: 'both',
  },
  monitor: {
    label: '取樣／追蹤',
    labelEn: 'Monitoring',
    family: FAMILY.separate,
    icon: 'monitor',
    compoundField: null,
    flowSide: 'out',
  },
}

export const STEP_ORDER = ['add', 'stir', 'extract', 'wash', 'filter', 'centrifuge', 'evaporate', 'dry', 'monitor']

export const AMOUNT_MODES = {
  mass: { label: '質量', unit: 'g', hint: 'g' },
  volume: { label: '體積', unit: 'mL', hint: 'mL' },
  equiv: { label: '當量', unit: 'eq', hint: 'eq' },
  'mol%': { label: 'mol%', unit: 'mol%', hint: 'mol%' },
  vol_per_g: { label: 'V/W', unit: 'mL/g', hint: 'mL per g of basis' },
}

export const ROLES = {
  reactant: { label: '反應物', labelEn: 'reactant' },
  solvent: { label: '溶劑', labelEn: 'solvent' },
  reagent: { label: '試劑', labelEn: 'reagent' },
  catalyst: { label: '催化劑', labelEn: 'catalyst' },
  quench: { label: '淬熄劑', labelEn: 'quench' },
}

export const ROLE_ORDER = ['reactant', 'reagent', 'catalyst', 'solvent', 'quench']

export const ATMOSPHERES = {
  air: { label: '空氣', labelEn: 'air' },
  N2: { label: 'N₂', labelEn: 'nitrogen' },
  Ar: { label: 'Ar', labelEn: 'argon' },
}

export const STIR_SPECIALS = {
  dark: { label: '遮光', labelEn: 'protected from light' },
  reflux: { label: '迴流', labelEn: 'at reflux' },
  vacuum: { label: '減壓', labelEn: 'under reduced pressure' },
  sealed: { label: '封管', labelEn: 'in a sealed tube' },
  sonication: { label: '超音波', labelEn: 'under sonication' },
}

export const EVAPORATE_METHODS = {
  rotary: { label: '旋轉濃縮', labelEn: 'rotary evaporation' },
  vacuum: { label: '真空濃縮', labelEn: 'evaporation under vacuum' },
  distill: { label: '蒸餾', labelEn: 'distillation' },
}

export const DRY_METHODS = {
  agent: { label: '乾燥劑', labelEn: 'drying agent' },
  vacuum_oven: { label: '真空烘箱', labelEn: 'vacuum oven' },
  nitrogen: { label: '氮氣吹乾', labelEn: 'nitrogen stream' },
  lyophilize: { label: '冷凍乾燥', labelEn: 'lyophilisation' },
}

export const MONITOR_METHODS = {
  TLC: { label: 'TLC', labelEn: 'TLC' },
  HPLC: { label: 'HPLC', labelEn: 'HPLC' },
  GC: { label: 'GC', labelEn: 'GC' },
  NMR: { label: 'NMR', labelEn: 'NMR' },
  retain: { label: '取樣留存', labelEn: 'sample retained' },
}

export const PHASES = {
  organic: { label: '有機層', labelEn: 'organic layer' },
  aqueous: { label: '水層', labelEn: 'aqueous layer' },
}

/** 攪拌的緩慢升降溫；溫度欄位即目標溫度 */
export const RAMPS = {
  up: { label: '緩慢升溫', labelEn: 'slowly heated', rateLabel: '升溫速率' },
  down: { label: '緩慢降溫', labelEn: 'slowly cooled', rateLabel: '降溫速率' },
}

export const FILTER_METHODS = {
  vacuum: { label: '抽氣過濾', zh: '抽氣過濾', en: 'filtered under reduced pressure' },
  gravity: { label: '重力過濾', zh: '重力過濾', en: 'filtered by gravity' },
  celite: { label: '矽藻土', zh: '經矽藻土墊過濾', en: 'filtered through a pad of Celite' },
  syringe: { label: '針筒過濾器', zh: '以針筒過濾器過濾', en: 'passed through a syringe filter' },
}

export const FILTER_KEPT = {
  filtrate: { label: '濾液', labelEn: 'filtrate' },
  solid: { label: '濾餅', labelEn: 'solid' },
}

export const CENTRIFUGE_KEPT = {
  pellet: { label: '沉澱', labelEn: 'pellet' },
  supernatant: { label: '上清液', labelEn: 'supernatant' },
}

export const SPEED_UNITS = {
  rpm: { label: 'rpm', text: 'rpm' },
  g: { label: '×g', text: '× g' },
}

/** 分歧深度軟性上限（§2）。超過時提示改為另開一份程序。 */
export const MAX_BRANCH_DEPTH = 2
