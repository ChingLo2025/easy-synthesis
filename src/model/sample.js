// 範例程序：規格 §7 的敘述例子，供首次開啟時一鍵載入。
import { createCompound, createDocument, createStep, today } from './schema.js'

export function createSampleDocument() {
  const doc = createDocument()
  doc.meta = { title: 'BMI 醯胺化', author: '', date: today(), batchNo: 'B-001', product: { name: '醯胺產物', mw: 452.4 } }

  const sm = createCompound({ name: '4-BCB-Br', nameEn: '4-BCB-Br', mw: 197.06, purity: 1, role: 'reactant' })
  const nmp = createCompound({ name: 'NMP', nameEn: 'NMP', cas: '872-50-4', mw: 99.13, density: 1.028, role: 'solvent' })
  const bmi = createCompound({ name: 'BMI', nameEn: 'BMI', mw: 358.3, density: 1.2, role: 'reactant' })
  const etoac = createCompound({ name: '乙酸乙酯', nameEn: 'EtOAc', cas: '141-78-6', mw: 88.11, density: 0.902, role: 'solvent' })
  const brine = createCompound({ name: '飽和食鹽水', nameEn: 'brine', density: 1.2, role: 'solvent' })
  const mgso4 = createCompound({ name: '無水硫酸鎂', nameEn: 'MgSO4', cas: '7487-88-9', mw: 120.37, role: 'reagent' })
  doc.compounds = [sm, nmp, bmi, etoac, brine, mgso4]
  doc.basis = { compoundId: sm.id, amount: 10, unit: 'g' }

  const extract = createStep('extract', {
    solventId: etoac.id, amount: { mode: 'volume', value: 50 }, repeat: 3, phaseKept: 'organic',
  })
  extract.branch = {
    label: '水層',
    steps: [createStep('monitor', { method: 'retain', interval: 60, criteria: '留樣備查' })],
  }

  doc.steps = [
    createStep('add', { compoundId: sm.id, amount: { mode: 'mass', value: 10 }, vessel: '250 mL 圓底燒瓶' }),
    createStep('add', { compoundId: nmp.id, amount: { mode: 'volume', value: 50 } }),
    createStep('stir', { atm: 'N2', temp: 25, time: 15 }),
    createStep('add', {
      compoundId: bmi.id, amount: { mode: 'equiv', value: 1.05 },
      addMode: 'dropwise', duration: 30, tempMax: 30,
    }),
    createStep('monitor', { method: 'TLC', interval: 30, criteria: '原料點消失' }),
    extract,
    createStep('wash', { solventId: brine.id, amount: { mode: 'volume', value: 20 }, repeat: 2 }),
    createStep('dry', { method: 'agent', agentId: mgso4.id }),
    createStep('evaporate', { method: 'rotary', temp: 40, pressure: 80 }),
  ]
  return doc
}
