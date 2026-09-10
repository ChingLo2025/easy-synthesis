// 左側面板：七個步驟模組（點擊即追加到序列末尾）、基準設定、化合物與範本入口。
import { el, clear } from './dom.js'
import { iconMarkup } from './icons.js'
import { compoundPicker } from './picker.js'
import { STEP_ORDER, STEP_TYPES } from '../model/steps.js'
import { BASIS_UNITS } from '../model/units.js'
import { bumpUsage } from '../state/prefs.js'
import { numberInput } from './fields.js'

const MODULE_HINTS = {
  add: '固體、液體、溶液',
  stir: '溫度、氣氛、時間',
  extract: '分液、保留相',
  wash: '水洗、鹽水洗',
  evaporate: '旋濃、蒸餾',
  dry: '乾燥劑、烘箱',
  monitor: 'TLC、HPLC 追蹤',
}

export function createPalette({ root, store, actions, onOpenCompounds, onOpenTemplates, onSaveTemplate }) {
  function render() {
    const { doc } = store.getState()
    clear(root)
    root.append(
      moduleGroup(),
      basisGroup(doc),
      compoundGroup(doc),
      templateGroup(),
    )
  }

  function moduleGroup() {
    const list = el('div', { class: 'palette__list' })
    for (const type of STEP_ORDER) {
      const meta = STEP_TYPES[type]
      list.append(
        el('button', {
          class: 'module',
          type: 'button',
          dataset: { family: meta.family, type },
          title: `新增「${meta.label}」步驟`,
          onclick: () => {
            bumpUsage(`module:${type}`)
            actions.addStep(type)
          },
        }, [
          el('span', { class: 'module__icon', html: iconMarkup(meta.icon) }),
          el('span', { class: 'module__text' }, [
            el('span', { class: 'module__label' }, meta.label),
            el('span', { class: 'module__hint' }, MODULE_HINTS[type]),
          ]),
        ]),
      )
    }
    return group('程序模組', list)
  }

  function basisGroup(doc) {
    const basis = doc.basis ?? {}
    const picker = compoundPicker({
      doc,
      value: basis.compoundId,
      placeholder: '選擇限量試劑',
      onPick: (choice) => {
        const id = choice.compoundId ?? actions.addCompound(choice.create).id
        actions.setBasis({ compoundId: id })
      },
    })

    const amount = numberInput({
      value: basis.amount,
      placeholder: '基準量',
      onInput: (value) => actions.setBasis({ amount: value }),
      onBlur: () => store.flush(),
    })

    const unit = el('select', {
      onchange: (event) => actions.setBasis({ unit: event.target.value }),
    }, BASIS_UNITS.map((u) => el('option', { value: u, selected: basis.unit === u }, u)))

    return group('基準', el('div', { style: { display: 'grid', gap: '6px' } }, [
      picker,
      el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 74px', gap: '6px' } }, [amount, unit]),
      el('div', { class: 'module__hint', style: { padding: '0 2px' } }, '所有當量以此為分母'),
    ]))
  }

  function compoundGroup(doc) {
    const count = doc.compounds.length
    return group('化合物', el('button', {
      class: 'btn',
      type: 'button',
      style: { width: '100%', justifyContent: 'space-between' },
      onclick: onOpenCompounds,
    }, [
      el('span', {}, count ? `${count} 種化合物` : '尚未建立'),
      el('span', { class: 'muted', html: iconMarkup('pencil', { size: 14 }) }),
    ]))
  }

  function templateGroup() {
    return group('範本', el('div', { style: { display: 'grid', gap: '6px' } }, [
      el('button', { class: 'btn', type: 'button', style: { width: '100%' }, onclick: onOpenTemplates }, [
        el('span', { html: iconMarkup('template', { size: 14 }) }),
        el('span', {}, '載入範本'),
      ]),
      el('button', { class: 'btn', type: 'button', style: { width: '100%' }, onclick: onSaveTemplate }, [
        el('span', { html: iconMarkup('download', { size: 14 }) }),
        el('span', {}, '另存為範本'),
      ]),
    ]))
  }

  function group(title, body) {
    return el('div', { class: 'palette__group' }, [el('div', { class: 'palette__title' }, title), body])
  }

  return { render }
}
