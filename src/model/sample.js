// Example procedure: the narrative example from spec §7, loadable in one click on first open.
import { createCompound, createDocument, createStep, today } from './schema.js'

export function createSampleDocument() {
  const doc = createDocument()
  doc.meta = { title: 'BMI amidation', author: '', date: today(), batchNo: 'B-001', product: { name: 'Amide product', mw: 452.4 } }

  const sm = createCompound({ name: '4-BCB-Br', nameEn: '4-BCB-Br', mw: 197.06, purity: 1, role: 'reactant' })
  const nmp = createCompound({ name: 'NMP', nameEn: 'NMP', cas: '872-50-4', mw: 99.13, density: 1.028, role: 'solvent' })
  const bmi = createCompound({ name: 'BMI', nameEn: 'BMI', mw: 358.3, density: 1.2, role: 'reactant' })
  const etoac = createCompound({ name: 'Ethyl acetate', nameEn: 'EtOAc', cas: '141-78-6', mw: 88.11, density: 0.902, role: 'solvent' })
  const brine = createCompound({ name: 'Brine', nameEn: 'brine', density: 1.2, role: 'solvent' })
  const mgso4 = createCompound({ name: 'MgSO4 (anhydrous)', nameEn: 'MgSO4', cas: '7487-88-9', mw: 120.37, role: 'reagent' })
  doc.compounds = [sm, nmp, bmi, etoac, brine, mgso4]
  doc.basis = { compoundId: sm.id, amount: 10, unit: 'g' }

  const extract = createStep('extract', {
    solventId: etoac.id, amount: { mode: 'volume', value: 50 }, repeat: 3, phaseKept: 'organic',
  })
  extract.branch = {
    label: 'aqueous layer',
    steps: [createStep('monitor', { method: 'retain', interval: 60, criteria: 'kept for reference' })],
  }

  doc.steps = [
    createStep('add', { compoundId: sm.id, amount: { mode: 'mass', value: 10 }, vessel: '250 mL round-bottom flask' }),
    createStep('add', { compoundId: nmp.id, amount: { mode: 'volume', value: 50 } }),
    createStep('stir', { atm: 'N2', temp: 25, time: 15 }),
    createStep('add', {
      compoundId: bmi.id, amount: { mode: 'equiv', value: 1.05 },
      addMode: 'dropwise', duration: 30, tempMax: 30,
    }),
    createStep('monitor', { method: 'TLC', interval: 30, criteria: 'starting material consumed' }),
    extract,
    createStep('wash', { solventId: brine.id, amount: { mode: 'volume', value: 20 }, repeat: 2 }),
    createStep('dry', { method: 'agent', agentId: mgso4.id }),
    createStep('evaporate', { method: 'rotary', temp: 40, pressure: 80 }),
  ]
  return doc
}
