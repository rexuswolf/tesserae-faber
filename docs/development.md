# Developing Tesserae Faber

## Running it locally

```bash
npm install
npx playwright install chromium   # once: the browser the end-to-end tests run in
npm run dev        # local dev server (needs the Firebase project)
npm run typecheck  # TypeScript check (tsc, no output files)
npm run lint       # ESLint
npm test           # unit tests (Vitest)
npm run test:e2e   # end-to-end tests (Playwright, on the test server below)
npm run check      # all four
npm run build      # production build in dist/
npm run deploy     # check, build, then deploy to tesserae-faber (hosting and Firestore rules); stops if a check fails
```

The app lives in the Firebase project `tesserae-faber`: `/`, `/colecciones`, `/c/<id>` and `/taller`.

To work on the interface without Firebase, run the test server. It swaps the Firebase adapters for local
ones (signed in as the admin with `?admin`):

```bash
npx vite --config tools/ui-test/vite.config.js   # http://localhost:5198
```

The collections that come with the app are written by tools: `node tools/make-drawsteel-collection.mjs`,
`make-srd5e-collection.mjs` and `make-senado-collection.mjs` (each with its logo), `node tools/make-faber-logo.mjs`
the Tesserae Faber logos in `public/`, and `node tools/make-crear-art.mjs` the covers' strips of tokens (it needs
the test server running).

## Collections

A collection is laid out like this:

- **Types**: the fixed entries at the top of the sidebar (Draw Steel's "Resources", "Conditions"); a collection of more
  than one type also gets **Everything**. A type also says its tokens' shape: coins, cards (85 × 55 mm, with a back of
  their own), condition rings (a flat ring over a miniature's base, its name all the way round) or base trays (a tray the
  miniature's base sits in, with a tab carrying a number or a name). Rings and trays are for 25, 32, 40 or 50 mm bases.
- **Groups**: the colours, and the filters and order of the sheet (Draw Steel's classes, El Senado's sides).
- **Tokens**: each of one type and one group, with its **linked tokens**, which come and go with it. Names can come in
  several languages. A token can have a colour of its own (`colour`), worn instead of its group's.
- **Sections**: the sidebar's headings, each **closed** (it comes with the collection, with its own catalogs)
  or **open** (yours to add **catalogs** to).
- **Designs**: the looks it comes with, per shape (`styles` in its file): the first of a shape is its tokens' default.
  Without them, a collection has *Basic*.

A whole collection goes in and out as one JSON file (`"format": "midnight-mint/collection"`, see
`src/collection.ts`), with its icons inside.

## How it's put together

The app is TypeScript, served and bundled by Vite. `src/types.ts` has the shapes the parts share: a
token's content (`Role`), a token's design (`TokenSpec`), a built `Token`, queue entries, plates and estimates.

- `src/engine/token-engine.ts`: the token geometry (three.js) for every shape, 2D thumbnails and STL export;
  `src/engine/viewer.ts` the 3D view. A token is a coin plus coloured inlays (name, icon, frame, back), so each colour
  is its own part; a raised inlay stands above the face, and the token is then laid face-up on the plate.
- `src/bambu/bambu3mf.ts`: the Bambu Studio project writer (plates, filaments, prime tower, magnet pauses).
  Its printer settings come from one template per printer and nozzle (`a1`, `a1mini`, and `-n02` for 0.2 mm),
  generated with Bambu Studio by `tools/make_bambu_template.py <any.stl> [a1|a1mini|a1-n02|a1mini-n02]`. On top of
  them it asks for Arachne walls and first-layer lines at the nozzle's normal width, a denser prime tower on the
  0.2 mm nozzle, prints each plate's inlay colours before the coin's, and purges what Bambu Studio's own
  auto-calculation gives for each pair of colours plus 20 % (`src/bambu/flush.json`, from `tools/make_flush_table.py`).
- `src/pdf/print-pdf.ts`: the double-sided A4 PDF, loaded only when you ask for it.
- `src/main.ts` and `src/app/`, `src/i18n.ts`, `src/style.css`: the app (one module per part: `context.ts` the shared
  state and page helpers, `boot.ts` loading, `sheet.ts`, `workshop.ts`, `design-sheet.ts`, `queue.ts` the three steps,
  `taller.ts`, `creator.ts` collections of your own, …; `events.ts`: a change is said once,
  `emit("picks" | "looks" | "all")`, and each view listens with `on(…)` and redraws itself), its Spanish and English
  text, and its look.
- `src/collection.ts`: the collections: their shape, their JSON file, and where they're kept.
  `public/collections/` holds the ones that come with the app; `src/shape-designs.ts` the designs made for rings and cards.
- `src/ports.ts`, `src/services.ts`, `src/adapters/`: what the app needs from outside (a private library, the admin's
  sign-in, what this browser keeps) as interfaces of its own; everything kept in the browser goes through
  `services.ts` (`local`, `session`, `readJSON`, `writeJSON`), never `localStorage` directly. `services.ts` picks the
  adapters (Firebase today, loaded only when needed) and the test server swaps in local ones
  (`tools/ui-test/mock-*.js`). With `firestore.rules`.
- `src/icons.ts`: a token's own icon: an SVG, a game-icons.net icon, or a picture traced into shapes.
- `tests/`: unit tests (`tests/unit`, Vitest) and end-to-end tests (`tests/e2e`, Playwright: every page, printing on
  paper and in 3D, designing, the Taller, collections).
- `tools/`: the collections' generators, the UI test server, the Bambu template and `tools/guide/`, which takes the
  guide's and the README's pictures. Design prototypes (`tools/*-protos/`) are kept locally, not in the repo.
