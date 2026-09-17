# Synthesis Flowchart

A tool for writing synthesis procedures. You enter a procedure once as structured steps; the flow diagram, quantities table, printout, and the Chinese and English Experimental sections are all generated from it.

**Open it here:** <https://chinglo2025.github.io/easy-synthesis/>

## Usage

Nothing to install. It runs in any modern browser, on a computer or a phone.

### Getting started

1. **Set the basis.** In the left panel, pick the limiting reagent under *Basis* and enter its amount. All equivalents are calculated against it.
2. **Add steps.** Click a module (Add, Stir, Extract, Wash, Filter, Centrifuge, Concentrate, Dry, Monitor) to append a step, then click the card to fill it in. Drag the handle on the left of a card to reorder.
3. **Edit compound details.** The pencil button next to a compound opens the compounds dialog on that compound, where you set MW, density, CAS, purity and concentration. The *Compounds* button in the left panel opens the full list.
4. **Check the output.** The right panel shows the flow diagram and quantities table (*Flow & quantities*) and the generated Chinese and English text (*Experimental*), each with *Copy plain text*.
5. **Print.** *Print / PDF* prints the tab that is showing; choose "Save as PDF" in the print dialog to get a PDF.

Click *Load example* at the top of the right panel to see a complete procedure.

### Handy to know

- **Repeat, branches and manual entry**: open a card to set *Repeat* (xN), start a *Branch* (e.g. the aqueous layer), or switch to *Manual entry* for conditions the templates don't cover. Manual-entry steps are left blank in the narrative and marked for you to write.
- **Theoretical yield**: set the product name and MW at the bottom of the compounds dialog; without a MW only moles are shown.
- **Undo**: Ctrl+Z to undo, Ctrl+Shift+Z or Ctrl+Y to redo.
- **Templates**: save a whole procedure, or a group of steps such as a standard workup, and reuse it from *Templates* in the left panel.
- **Phones and small windows**: at 1024 px wide and below, the layout switches to *Steps* / *Preview* tabs.

### Saving your work

Everything is saved automatically, but only in this browser (localStorage). Nothing is uploaded, and nothing syncs between devices or browsers.

- **Keep a copy or move to another device**: *Export JSON* (download icon at the top, or Ctrl+S), then *Import JSON* (upload icon) on the other device.
- **Before clearing browser data or switching browsers**, export first, or the procedure, personal reagent library and templates are lost.

### Not supported yet

Scale recalculation, one-line shorthand entry, portion-wise addition, planned vs actual columns, structure drawing, stream merging (several feeds into one step), ranges and tolerances, safety warnings, free-canvas drag and drop, conditional loops, multi-user collaboration.

## Development

### Run locally

```bash
npm run dev     # http://localhost:5173
npm test        # node --test
```

No dependencies and no build step. ES modules need an http(s) origin, so use `npm run dev` instead of opening `index.html` via `file://`. GitHub Pages serves the site straight from the `main` branch, so every push to `main` updates it.

### Layout

```
index.html            App shell (three-column workspace)
styles/
  base.css            Design tokens, controls
  layout.css          Shell and panels, narrow-screen tabs
  cards.css           Step cards, dialogs, toasts
  flow.css            Central-axis flow diagram
  table.css           Document, quantities table, narrative
  print.css           @media print
src/
  model/
    units.js          SI conversion and formatting (internally mol / kg / m³)
    steps.js          Central definition of the nine step types and enums
    schema.js         Construction, traversal, normalization, round-trip
    reagents.js       Built-in reagent library (33 solvents/reagents + 8 drying agents, with CAS/MW/density/bp)
    library.js        Personal reagent library (localStorage)
    sample.js         Example procedure
    ids.js
  engine/
    compute.js        Pure function (procedure) => (table, warnings)
  state/
    store.js          past[] / present / future[] and coalescing rules
    actions.js        All document changes
    prefs.js          Button usage frequency, last-used values
    persist.js        Thin localStorage wrapper
  ui/
    palette.js        Left panel: nine modules, basis, templates
    sequence.js       Card sequence, xN, branches, freeform, drag-to-reorder
    editors.js        Field editors per step type
    editors-workup.js Filtration and centrifugation editors
    editor-parts.js   Shared editor parts (amounts, derived values, compound edit button, pre-dissolve)
    fields.js         Field widgets and quick condition buttons
    picker.js         Compound picker
    flow.js           Central-axis flow diagram
    metrics.js        Quantities table and totals
    narrative.js      Experimental section (Chinese and English)
    document.js       Document panel assembly
    modals.js         Compound, template and name dialogs
    icons.js          24x24 grid icons (path strings)
    summary.js        One-line step summaries
    dom.js / toast.js
  io/
    json.js           Import/export, clipboard
    templates.js      Procedure templates and step groups
tools/serve.mjs       Zero-dependency static server (local development)
tests/                node:test tests
```

### Design decisions

- **Interface language**: the interface is in English. The Chinese Experimental section is still generated alongside the English one; it is output, not interface.
- **Units**: JSON uses lab units (g/mol, g/mL, mol/L); everything is converted to SI before calculation and formatted again for display. Mass, moles and equivalents keep at least one decimal (10 → 10.0), following lab-notebook convention.
- **Driving field**: `amount.mode` is the driving field; the other three columns are derived by the engine and shown in grey. There is no general constraint solver.
- **Narrative merging**: consecutive simple additions merge into one sentence ("A and B were added"), and a following stir joins the same sentence. Dropwise additions and steps with a note or freeform text get their own sentence. Blanking is decided per step.
- **Blank markers**: a step with a note is left blank in English; a step with freeform text is left blank in both languages. The Chinese marker is `［步驟 N：手動輸入，待補寫］` and the English one is `[Step N: manual entry, to be written]`, both on a grey background. Until nothing is pending, copied plain text keeps the markers.
- **Printing**: prints the current tab. The flow diagram and quantities table are stacked on one page; the narrative is a separate tab. Batch, date and operator appear once, beside the title (with a signature blank that only prints), instead of in a separate footer, so long procedures take fewer pages.
- **Narrow screens**: at 1024 px and below, the three columns collapse into Steps / Preview tabs, each keeping its own scroll position. The flow diagram adapts with a container query, so it also fits the narrow right column of a small window.
- **Theoretical yield**: stored as the optional `meta.product = { name, mw }`, capped by the basis moles.
- **Branch depth**: soft limit of two levels. A third level can't be created; the second level is flagged under "To review".
- **Frequency ordering**: applies to quick condition buttons (atmosphere, temperature, time, method, etc.); the nine modules keep a fixed order so the interface doesn't jump around.
- **Storage**: all state lives in localStorage behind `persist.js`, which never lets a full quota or private mode crash the app. JSON export/import round-trips losslessly and keeps unknown fields.
