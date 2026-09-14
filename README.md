# Synthesis Flowchart

A whole synthesis procedure is a single JSON document. The flow diagram, quantities table, printout, and the Chinese and English Experimental sections are all generated from it.

Live: <https://chinglo2025.github.io/easy-synthesis/>

## Run

```bash
npm run dev     # http://localhost:5173
npm test        # node --test
```

No dependencies and no build step. ES modules need an http(s) origin, so run `npm run dev` locally instead of opening `index.html` via `file://`.

## Layout

```
index.html            App shell (three-column workspace)
styles/
  base.css            Design tokens, controls
  layout.css          Shell and panels
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
    editor-parts.js   Shared editor parts (amounts, derived values, pre-dissolve)
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

## Design decisions

- **Interface language**: the interface is in English. The Chinese Experimental section is still generated alongside the English one; it is output, not interface.
- **Units**: JSON uses lab units (g/mol, g/mL, mol/L); everything is converted to SI before calculation and formatted again for display. Mass, moles and equivalents keep at least one decimal (10 → 10.0), following lab-notebook convention.
- **Driving field**: `amount.mode` is the driving field; the other three columns are derived by the engine and shown in grey. There is no general constraint solver.
- **Narrative merging**: consecutive simple additions merge into one sentence ("A and B were added"), and a following stir joins the same sentence. Dropwise additions and steps with a note or freeform text get their own sentence. Blanking is decided per step.
- **Blank markers**: a step with a note is left blank in English; a step with freeform text is left blank in both languages. The Chinese marker is `［步驟 N：手動輸入，待補寫］` and the English one is `[Step N: manual entry, to be written]`, both on a grey background. Until nothing is pending, copied plain text keeps the markers.
- **Printing**: prints the current tab. The flow diagram and quantities table are stacked on one page; the narrative is a separate tab. Batch, date and operator appear once, beside the title (with a signature blank that only prints), instead of in a separate footer, so long procedures take fewer pages.
- **Narrow screens**: at 1024 px and below, the three columns collapse into Steps / Preview tabs, and the step modules become a horizontal strip above the cards.
- **Compound details**: every compound picker in a step card has an edit button that opens the compounds dialog on that compound.
- **Theoretical yield**: the product is set via the optional `meta.product = { name, mw }` (bottom of the compounds dialog); without a MW only moles are shown.
- **Branch depth**: soft limit of two levels. A third level can't be created; the second level is flagged under "To review".
- **Frequency ordering**: applies to quick condition buttons (atmosphere, temperature, time, method, etc.); the nine modules on the left keep a fixed order so the interface doesn't jump around.
- **Storage**: the current procedure, personal reagent library, templates, groups and usage frequencies live only in the browser's localStorage. Nothing is uploaded or synced across devices. Export JSON before switching devices or clearing browser data.

## Not supported yet

Scale recalculation, one-line shorthand entry, portion-wise addition, planned vs actual columns, structure drawing, stream merging (several feeds into one step), ranges and tolerances, safety warnings, free-canvas drag and drop, conditional loops, multi-user collaboration.
