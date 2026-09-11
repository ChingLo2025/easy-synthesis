// Central definition of step types: panel order, visual family, defaults, compound fields.
// Adding a type only touches this file and the narrative/flow lookup tables.
//
// `label` is interface text (English). `zh` holds the Chinese wording used only by
// the Chinese Experimental narrative; `labelEn` / `en` are the English narrative wording.

/** Three family hues: input / transform / separate. Everything else is near-monochrome. */
export const FAMILY = {
  input: 'input',
  transform: 'transform',
  separate: 'separate',
}

export const STEP_TYPES = {
  add: {
    label: 'Add',
    labelEn: 'Addition',
    family: FAMILY.input,
    icon: 'add',
    compoundField: 'compoundId',
    flowSide: 'in',
  },
  stir: {
    label: 'Stir',
    labelEn: 'Stirring',
    family: FAMILY.transform,
    icon: 'stir',
    compoundField: null,
    flowSide: null,
  },
  extract: {
    label: 'Extract',
    labelEn: 'Extraction',
    family: FAMILY.separate,
    icon: 'extract',
    compoundField: 'solventId',
    flowSide: 'both',
  },
  wash: {
    label: 'Wash',
    labelEn: 'Washing',
    family: FAMILY.separate,
    icon: 'wash',
    compoundField: 'solventId',
    flowSide: 'both',
  },
  filter: {
    label: 'Filter',
    labelEn: 'Filtration',
    family: FAMILY.separate,
    icon: 'filter',
    // The cake rinse is optional; leaving it empty is not a missing value
    compoundField: 'solventId',
    compoundOptional: true,
    flowSide: 'both',
  },
  centrifuge: {
    label: 'Centrifuge',
    labelEn: 'Centrifugation',
    family: FAMILY.separate,
    icon: 'centrifuge',
    compoundField: null,
    flowSide: 'out',
  },
  evaporate: {
    label: 'Concentrate',
    labelEn: 'Concentration',
    family: FAMILY.separate,
    icon: 'evaporate',
    compoundField: null,
    flowSide: 'out',
  },
  dry: {
    label: 'Dry',
    labelEn: 'Drying',
    family: FAMILY.separate,
    icon: 'dry',
    compoundField: 'agentId',
    flowSide: 'both',
  },
  monitor: {
    label: 'Monitor',
    labelEn: 'Monitoring',
    family: FAMILY.separate,
    icon: 'monitor',
    compoundField: null,
    flowSide: 'out',
  },
}

export const STEP_ORDER = ['add', 'stir', 'extract', 'wash', 'filter', 'centrifuge', 'evaporate', 'dry', 'monitor']

export const AMOUNT_MODES = {
  mass: { label: 'Mass', unit: 'g', hint: 'g' },
  volume: { label: 'Volume', unit: 'mL', hint: 'mL' },
  equiv: { label: 'Equiv', unit: 'eq', hint: 'eq' },
  'mol%': { label: 'mol%', unit: 'mol%', hint: 'mol%' },
  vol_per_g: { label: 'V/W', unit: 'mL/g', hint: 'mL per g of basis' },
}

export const ROLES = {
  reactant: { label: 'Reactant', labelEn: 'reactant' },
  solvent: { label: 'Solvent', labelEn: 'solvent' },
  reagent: { label: 'Reagent', labelEn: 'reagent' },
  catalyst: { label: 'Catalyst', labelEn: 'catalyst' },
  quench: { label: 'Quench', labelEn: 'quench' },
}

export const ROLE_ORDER = ['reactant', 'reagent', 'catalyst', 'solvent', 'quench']

export const ATMOSPHERES = {
  air: { label: 'Air', zh: '空氣', labelEn: 'air' },
  N2: { label: 'N₂', zh: 'N₂', labelEn: 'nitrogen' },
  Ar: { label: 'Ar', zh: 'Ar', labelEn: 'argon' },
}

export const STIR_SPECIALS = {
  dark: { label: 'Dark', labelEn: 'protected from light' },
  reflux: { label: 'Reflux', labelEn: 'at reflux' },
  vacuum: { label: 'Vacuum', labelEn: 'under reduced pressure' },
  sealed: { label: 'Sealed tube', labelEn: 'in a sealed tube' },
  sonication: { label: 'Sonication', labelEn: 'under sonication' },
}

export const EVAPORATE_METHODS = {
  rotary: { label: 'Rotavap', zh: '旋轉濃縮', labelEn: 'rotary evaporation' },
  vacuum: { label: 'Vacuum', zh: '真空濃縮', labelEn: 'evaporation under vacuum' },
  distill: { label: 'Distillation', zh: '蒸餾', labelEn: 'distillation' },
}

export const DRY_METHODS = {
  agent: { label: 'Drying agent', zh: '乾燥劑', labelEn: 'drying agent' },
  vacuum_oven: { label: 'Vacuum oven', zh: '真空烘箱', labelEn: 'vacuum oven' },
  nitrogen: { label: 'N₂ stream', zh: '氮氣吹乾', labelEn: 'nitrogen stream' },
  lyophilize: { label: 'Freeze-dry', zh: '冷凍乾燥', labelEn: 'lyophilisation' },
}

export const MONITOR_METHODS = {
  TLC: { label: 'TLC', labelEn: 'TLC' },
  HPLC: { label: 'HPLC', labelEn: 'HPLC' },
  GC: { label: 'GC', labelEn: 'GC' },
  NMR: { label: 'NMR', labelEn: 'NMR' },
  retain: { label: 'Retain sample', labelEn: 'sample retained' },
}

export const PHASES = {
  organic: { label: 'Organic layer', zh: '有機層', labelEn: 'organic layer' },
  aqueous: { label: 'Aqueous layer', zh: '水層', labelEn: 'aqueous layer' },
}

/** Slow heating/cooling while stirring; the temperature field is the target temperature */
export const RAMPS = {
  up: { label: 'Slow heating', zh: '緩慢升溫', labelEn: 'slowly heated', rateLabel: 'Heating rate' },
  down: { label: 'Slow cooling', zh: '緩慢降溫', labelEn: 'slowly cooled', rateLabel: 'Cooling rate' },
}

export const FILTER_METHODS = {
  vacuum: { label: 'Vacuum', zh: '抽氣過濾', en: 'filtered under reduced pressure' },
  gravity: { label: 'Gravity', zh: '重力過濾', en: 'filtered by gravity' },
  celite: { label: 'Celite', zh: '經矽藻土墊過濾', en: 'filtered through a pad of Celite' },
  syringe: { label: 'Syringe filter', zh: '以針筒過濾器過濾', en: 'passed through a syringe filter' },
}

export const FILTER_KEPT = {
  filtrate: { label: 'Filtrate', labelEn: 'filtrate' },
  solid: { label: 'Solid', labelEn: 'solid' },
}

export const CENTRIFUGE_KEPT = {
  pellet: { label: 'Pellet', labelEn: 'pellet' },
  supernatant: { label: 'Supernatant', labelEn: 'supernatant' },
}

export const SPEED_UNITS = {
  rpm: { label: 'rpm', text: 'rpm' },
  g: { label: '×g', text: '× g' },
}

/** Soft cap on branch depth (§2). Beyond it, suggest starting a separate procedure. */
export const MAX_BRANCH_DEPTH = 2
