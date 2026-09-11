// Built-in reagent library: common solvents and drying agents, bundled with the app and available offline.
// It is only a seed; compounds the user enters are saved to the personal library automatically (library.js).
// mw: g/mol, density: g/mL @20 °C, bp: °C (atmospheric)
// nameZh is kept for search only, so typing a Chinese name still finds the reagent.

export const BUILTIN_REAGENTS = [
  { key: 'water', name: 'Water', nameZh: '水', nameEn: 'Water', cas: '7732-18-5', mw: 18.02, density: 0.998, bp: 100, role: 'solvent' },
  { key: 'meoh', name: 'Methanol', nameZh: '甲醇', nameEn: 'Methanol', cas: '67-56-1', mw: 32.04, density: 0.792, bp: 64.7, role: 'solvent' },
  { key: 'etoh', name: 'Ethanol', nameZh: '乙醇', nameEn: 'Ethanol', cas: '64-17-5', mw: 46.07, density: 0.789, bp: 78.4, role: 'solvent' },
  { key: 'ipa', name: 'Isopropanol', nameZh: '異丙醇', nameEn: 'Isopropanol', cas: '67-63-0', mw: 60.10, density: 0.786, bp: 82.6, role: 'solvent' },
  { key: 'acetone', name: 'Acetone', nameZh: '丙酮', nameEn: 'Acetone', cas: '67-64-1', mw: 58.08, density: 0.791, bp: 56.1, role: 'solvent' },
  { key: 'mek', name: 'MEK', nameZh: '丁酮', nameEn: 'MEK', cas: '78-93-3', mw: 72.11, density: 0.805, bp: 79.6, role: 'solvent' },
  { key: 'etoac', name: 'EtOAc', nameZh: '乙酸乙酯', nameEn: 'Ethyl acetate', cas: '141-78-6', mw: 88.11, density: 0.902, bp: 77.1, role: 'solvent' },
  { key: 'dcm', name: 'DCM', nameZh: '二氯甲烷', nameEn: 'Dichloromethane', cas: '75-09-2', mw: 84.93, density: 1.326, bp: 39.6, role: 'solvent' },
  { key: 'chcl3', name: 'Chloroform', nameZh: '氯仿', nameEn: 'Chloroform', cas: '67-66-3', mw: 119.38, density: 1.489, bp: 61.2, role: 'solvent' },
  { key: 'thf', name: 'THF', nameZh: '四氫呋喃', nameEn: 'Tetrahydrofuran', cas: '109-99-9', mw: 72.11, density: 0.889, bp: 66, role: 'solvent' },
  { key: 'metthf', name: '2-MeTHF', nameZh: '2-甲基四氫呋喃', nameEn: '2-Methyltetrahydrofuran', cas: '96-47-9', mw: 86.13, density: 0.854, bp: 80, role: 'solvent' },
  { key: 'dioxane', name: '1,4-Dioxane', nameZh: '1,4-二噁烷', nameEn: '1,4-Dioxane', cas: '123-91-1', mw: 88.11, density: 1.033, bp: 101, role: 'solvent' },
  { key: 'et2o', name: 'Et2O', nameZh: '乙醚', nameEn: 'Diethyl ether', cas: '60-29-7', mw: 74.12, density: 0.713, bp: 34.6, role: 'solvent' },
  { key: 'mtbe', name: 'MTBE', nameZh: '甲基第三丁基醚', nameEn: 'tert-Butyl methyl ether', cas: '1634-04-4', mw: 88.15, density: 0.740, bp: 55.2, role: 'solvent' },
  { key: 'toluene', name: 'Toluene', nameZh: '甲苯', nameEn: 'Toluene', cas: '108-88-3', mw: 92.14, density: 0.867, bp: 110.6, role: 'solvent' },
  { key: 'xylene', name: 'Xylene', nameZh: '二甲苯', nameEn: 'Xylene', cas: '1330-20-7', mw: 106.17, density: 0.864, bp: 138.5, role: 'solvent' },
  { key: 'hexane', name: 'n-Hexane', nameZh: '正己烷', nameEn: 'n-Hexane', cas: '110-54-3', mw: 86.18, density: 0.659, bp: 68.7, role: 'solvent' },
  { key: 'heptane', name: 'n-Heptane', nameZh: '正庚烷', nameEn: 'n-Heptane', cas: '142-82-5', mw: 100.21, density: 0.684, bp: 98.4, role: 'solvent' },
  { key: 'dmf', name: 'DMF', nameZh: '二甲基甲醯胺', nameEn: 'N,N-Dimethylformamide', cas: '68-12-2', mw: 73.09, density: 0.944, bp: 153, role: 'solvent' },
  { key: 'dmac', name: 'DMAc', nameZh: '二甲基乙醯胺', nameEn: 'N,N-Dimethylacetamide', cas: '127-19-5', mw: 87.12, density: 0.937, bp: 165, role: 'solvent' },
  { key: 'nmp', name: 'NMP', nameZh: 'N-甲基吡咯烷酮', nameEn: 'N-Methyl-2-pyrrolidone', cas: '872-50-4', mw: 99.13, density: 1.028, bp: 202, role: 'solvent' },
  { key: 'dmso', name: 'DMSO', nameZh: '二甲基亞碸', nameEn: 'Dimethyl sulfoxide', cas: '67-68-5', mw: 78.13, density: 1.100, bp: 189, role: 'solvent' },
  { key: 'mecn', name: 'MeCN', nameZh: '乙腈', nameEn: 'Acetonitrile', cas: '75-05-8', mw: 41.05, density: 0.786, bp: 81.6, role: 'solvent' },
  { key: 'pyridine', name: 'Pyridine', nameZh: '吡啶', nameEn: 'Pyridine', cas: '110-86-1', mw: 79.10, density: 0.982, bp: 115.2, role: 'solvent' },
  { key: 'aa', name: 'AcOH', nameZh: '乙酸', nameEn: 'Acetic acid', cas: '64-19-7', mw: 60.05, density: 1.049, bp: 118, role: 'solvent' },
  { key: 'tfa', name: 'TFA', nameZh: '三氟乙酸', nameEn: 'Trifluoroacetic acid', cas: '76-05-1', mw: 114.02, density: 1.489, bp: 72.4, role: 'reagent' },
  { key: 'dmc', name: 'Dimethyl carbonate', nameZh: '碳酸二甲酯', nameEn: 'Dimethyl carbonate', cas: '616-38-6', mw: 90.08, density: 1.069, bp: 90, role: 'solvent' },
  { key: 'cyclohexane', name: 'Cyclohexane', nameZh: '環己烷', nameEn: 'Cyclohexane', cas: '110-82-7', mw: 84.16, density: 0.779, bp: 80.7, role: 'solvent' },
  { key: 'brine', name: 'Brine', nameZh: '飽和食鹽水', nameEn: 'Brine', cas: '', mw: null, density: 1.20, bp: null, role: 'solvent' },
  { key: 'nahco3aq', name: 'Sat. aq. NaHCO3', nameZh: '飽和碳酸氫鈉水溶液', nameEn: 'Sat. aq. NaHCO3', cas: '144-55-8', mw: 84.01, density: 1.05, bp: null, role: 'quench' },
  { key: 'nh4claq', name: 'Sat. aq. NH4Cl', nameZh: '飽和氯化銨水溶液', nameEn: 'Sat. aq. NH4Cl', cas: '12125-02-9', mw: 53.49, density: 1.07, bp: null, role: 'quench' },
  { key: 'hcl1n', name: '1 N HCl (aq)', nameZh: '1 N 鹽酸', nameEn: '1 N HCl (aq)', cas: '7647-01-0', mw: 36.46, density: 1.02, bp: null, role: 'quench', conc: 1 },
  { key: 'naoh1n', name: '1 N NaOH (aq)', nameZh: '1 N 氫氧化鈉水溶液', nameEn: '1 N NaOH (aq)', cas: '1310-73-2', mw: 40.00, density: 1.04, bp: null, role: 'quench', conc: 1 },
  { key: 'mgso4', name: 'MgSO4 (anhydrous)', nameZh: '硫酸鎂（無水）', nameEn: 'MgSO4 (anhydrous)', cas: '7487-88-9', mw: 120.37, density: null, bp: null, role: 'reagent', drying: true },
  { key: 'na2so4', name: 'Na2SO4 (anhydrous)', nameZh: '硫酸鈉（無水）', nameEn: 'Na2SO4 (anhydrous)', cas: '7757-82-6', mw: 142.04, density: null, bp: null, role: 'reagent', drying: true },
  { key: 'caso4', name: 'CaSO4 (Drierite)', nameZh: '硫酸鈣（Drierite）', nameEn: 'CaSO4 (Drierite)', cas: '7778-18-9', mw: 136.14, density: null, bp: null, role: 'reagent', drying: true },
  { key: 'cacl2', name: 'CaCl2 (anhydrous)', nameZh: '氯化鈣（無水）', nameEn: 'CaCl2 (anhydrous)', cas: '10043-52-4', mw: 110.98, density: null, bp: null, role: 'reagent', drying: true },
  { key: 'k2co3', name: 'K2CO3 (anhydrous)', nameZh: '碳酸鉀（無水）', nameEn: 'K2CO3 (anhydrous)', cas: '584-08-7', mw: 138.21, density: null, bp: null, role: 'reagent', drying: true },
  { key: 'ms4a', name: '4A molecular sieves', nameZh: '4A 分子篩', nameEn: '4A molecular sieves', cas: '70955-01-0', mw: null, density: null, bp: null, role: 'reagent', drying: true },
  { key: 'ms3a', name: '3A molecular sieves', nameZh: '3A 分子篩', nameEn: '3A molecular sieves', cas: '308080-99-1', mw: null, density: null, bp: null, role: 'reagent', drying: true },
  { key: 'p2o5', name: 'P2O5', nameZh: '五氧化二磷', nameEn: 'P2O5', cas: '1314-56-3', mw: 141.94, density: null, bp: null, role: 'reagent', drying: true },
]

export const DRYING_AGENTS = BUILTIN_REAGENTS.filter((r) => r.drying)

/** Convert to a document compound (without id; the caller assigns it) */
export function reagentToCompound(reagent) {
  return {
    name: reagent.name,
    nameEn: reagent.nameEn ?? '',
    cas: reagent.cas ?? '',
    mw: reagent.mw ?? null,
    density: reagent.density ?? null,
    purity: 1,
    conc: reagent.conc ?? null,
    role: reagent.role ?? 'solvent',
    bp: reagent.bp ?? null,
  }
}

/** Loose search over name, Chinese name, English name and CAS */
export function searchReagents(query, pool = BUILTIN_REAGENTS) {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return pool.slice(0, 12)
  const fields = (r) => [r.name, r.nameZh, r.nameEn, r.cas, r.key]
  return pool.filter((r) => fields(r).some((f) => typeof f === 'string' && f.toLowerCase().includes(q))).slice(0, 12)
}
