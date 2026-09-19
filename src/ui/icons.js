// Icons: a single JS module; each icon is an array of path strings, rendered inline (§6).
//
// Drawing rules
//   - 24 x 24 grid regardless of display size; the render size comes from the caller (default 28px)
//   - stroke-width is set in CSS, with vector-effect keeping an actual 1.5px that doesn't thicken when scaled
//   - round cap / join; stroke="currentColor", no hard-coded colours
//   - keep strokes; don't outline them into paths
//   - straight lines centred on .5 coordinates; round shapes drawn slightly larger than square ones for optical balance
//   - containers (flask, funnel, separatory funnel) use closed outlines; actions (stir, dry) use open strokes

export const ICON_SIZE = 28

export const ICONS = Object.freeze({
  // ── Step types ─────────────────────────────────────────────────────────────
  // Add: arrow dropping into an open vessel
  add: ['M12.5 3.5v6.5', 'M9.5 7.5l3 3 3-3', 'M5.5 13.5h14', 'M7.5 13.5v3.6a3.4 3.4 0 0 0 3.4 3.4h3.2a3.4 3.4 0 0 0 3.4-3.4v-3.6'],
  // Stir: rotating arc and stir bar
  stir: ['M18.16 6.84A8 8 0 1 1 6.9 6.9', 'M13.4 5.1l4.9 1.6-1.6 4.9', 'M9.5 12.5h6'],
  // Extract: separatory funnel with phase boundary and stopcock
  extract: ['M8.5 4.5h7l-2.5 7.5v5.5h-2v-5.5z', 'M9.9 9.5h4.4', 'M9.5 15.5h5'],
  // Wash: droplet and waves
  wash: ['M12.5 3.5c3 3.7 4.5 6.2 4.5 8.1a4.5 4.5 0 0 1-9 0c0-1.9 1.5-4.4 4.5-8.1z', 'M4.5 18.5c1.8-1.6 3.2-1.6 5 0s3.2 1.6 5 0 3.2-1.6 5 0'],
  // Concentrate: round-bottom flask with escaping solvent vapour
  evaporate: ['M10.5 3.5h4', 'M11.5 3.5v4.9a5.8 5.8 0 1 0 2 0V3.5', 'M19.5 10.5v-6', 'M17.5 6.5l2-2 2 2'],
  // Dry: droplet with a slash, i.e. water removed
  dry: ['M12.5 5.2c2.4 3 3.7 5 3.7 6.6a3.7 3.7 0 0 1-7.4 0c0-1.6 1.3-3.6 3.7-6.6z', 'M6.5 18.5l12-12'],
  // Monitor: TLC plate with spots
  monitor: ['M7.5 3.5h9a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z', 'M6.5 16.5h11', 'M10.2 11.4a1.3 1.3 0 1 0 0-.01z', 'M14.3 8.4a1.3 1.3 0 1 0 0-.01z'],
  // Recrystallize: two crystals growing on a surface
  recrystallize: ['M10.5 3.8l4.2 4.6-4.2 4.6-4.2-4.6z', 'M17.6 11.5l2.9 3.2-2.9 3.2-2.9-3.2z', 'M4.5 20.5h15'],
  // Column: chromatography column with a band and a drop leaving the tip
  column: ['M10 3.5h5v12.2a2.5 2.5 0 0 1-5 0z', 'M9 3.5h7', 'M10 9.3h5', 'M12.5 19.2a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z'],
  // Filter: funnel with the liquid level on the filter paper
  filter: ['M4.5 4.5h16l-6 7.5v6.5l-4 2v-8.5z', 'M8.2 8.5h8.6'],
  // Centrifuge: rotor seen from above with three tube slots (round shapes slightly larger for optical balance)
  centrifuge: ['M12.5 4a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'M12.5 6.7a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z', 'M16.3 13.4a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z', 'M8.7 13.4a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z'],

  // ── Flow & structure ───────────────────────────────────────────────────────────
  branch: ['M6.5 4.5v9a3 3 0 0 0 3 3h8', 'M14.5 13.5l3 3-3 3', 'M6.5 18.5v1.5'],
  repeat: ['M4.5 9.5h12a3 3 0 0 1 3 3', 'M13.5 6.5l3 3-3 3', 'M19.5 14.5h-12a3 3 0 0 1-3-3', 'M10.5 17.5l-3-3 3-3'],
  drag: ['M9.5 6.5h.01', 'M9.5 12.5h.01', 'M9.5 18.5h.01', 'M15.5 6.5h.01', 'M15.5 12.5h.01', 'M15.5 18.5h.01'],
  vessel: ['M9.5 3.5v5.4L5.2 17a2.6 2.6 0 0 0 2.3 3.9h10a2.6 2.6 0 0 0 2.3-3.9L15.5 8.9V3.5', 'M8.5 3.5h8', 'M7.6 14.5h9.8'],

  // ── Actions ────────────────────────────────────────────────────────────────
  plus: ['M12.5 5.5v14', 'M5.5 12.5h14'],
  minus: ['M5.5 12.5h14'],
  close: ['M6.5 6.5l12 12', 'M18.5 6.5l-12 12'],
  check: ['M5.5 12.9l4.6 4.6 9-9.6'],
  trash: ['M4.5 6.5h16', 'M9.5 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h3.4a1.3 1.3 0 0 1 1.3 1.3v1.7', 'M6.5 6.5l1 12.7a1.5 1.5 0 0 0 1.5 1.3h7a1.5 1.5 0 0 0 1.5-1.3l1-12.7', 'M10.5 10.5v6', 'M14.5 10.5v6'],
  copy: ['M9.5 9.5h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z', 'M5.5 15.5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1'],
  undo: ['M4.5 9.5h10a5 5 0 0 1 0 10h-6', 'M8.5 5.5l-4 4 4 4'],
  redo: ['M20.5 9.5h-10a5 5 0 0 0 0 10h6', 'M16.5 5.5l4 4-4 4'],
  chevronDown: ['M6.5 9.5l6 6 6-6'],
  chevronRight: ['M9.5 5.5l6 7-6 7'],
  search: ['M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z', 'M15.8 15.8l4.7 4.7'],
  print: ['M7.5 9.5v-5h10v5', 'M7.5 17.5h-2a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2', 'M7.5 14.5h10v6h-10z', 'M17 12.5h.01'],
  download: ['M12.5 3.5v11', 'M8 10.5l4.5 4.5 4.5-4.5', 'M4.5 19.5h16'],
  upload: ['M12.5 15.5v-11', 'M8 8.5l4.5-4.5 4.5 4.5', 'M4.5 19.5h16'],
  template: ['M12.5 3.5l8 4-8 4-8-4z', 'M4.5 12.5l8 4 8-4', 'M4.5 17l8 4 8-4'],
  note: ['M6.5 3.5h11a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z', 'M8.5 8.5h7', 'M8.5 12.5h7', 'M8.5 16.5h4'],
  pencil: ['M16.5 4.5l3 3-11 11-4 1 1-4z', 'M14.5 6.5l3 3'],
  warning: ['M12.5 4.5l8.5 15h-17z', 'M12.5 10.5v4', 'M12.5 17.4h.01'],
  info: ['M12.5 4a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'M12.5 11.5v5', 'M12.5 8.4h.01'],
  table: ['M4.5 5.5h16v14h-16z', 'M4.5 10.5h16', 'M4.5 15.5h16', 'M11.5 5.5v14'],
  text: ['M6.5 6.5v-2h12v2', 'M12.5 4.5v16', 'M9.5 20.5h6'],
  flow: ['M12.5 3.5v4', 'M12.5 10.5v4', 'M12.5 17.5v3', 'M9.5 5.5l3-2 3 2', 'M6.5 12.5h-2', 'M18.5 12.5h2'],
})

/**
 * Build an SVG string. Colour and stroke width come from CSS; only geometry here.
 */
export function iconMarkup(name, { size = ICON_SIZE, className = '', title = '' } = {}) {
  const paths = ICONS[name]
  if (!paths) return ''
  const body = paths.map((d) => `<path d="${d}"/>`).join('')
  const label = title ? `<title>${escapeText(title)}</title>` : ''
  const aria = title ? 'role="img"' : 'aria-hidden="true"'
  return `<svg class="icon ${className}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" ${aria}>${label}${body}</svg>`
}

/** Build an SVG element (when events or later changes are needed) */
export function iconElement(name, options = {}) {
  const wrapper = document.createElement('span')
  wrapper.innerHTML = iconMarkup(name, options)
  return wrapper.firstElementChild
}

export function hasIcon(name) {
  return Boolean(ICONS[name])
}

function escapeText(text) {
  return String(text).replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch])
}
