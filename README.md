<p align="center">
  <img src="public/tesserae-faber.svg" alt="" width="120">
</p>

<h1 align="center">Tesserae Faber</h1>

<p align="center">
  Design tokens for your games and download them ready to print:<br>
  in 3D, with every colour its own part, or on paper.
</p>

<p align="center">
  <a href="https://tesserae-faber.web.app"><strong>Open the app</strong></a>
  ·
  <a href="https://tesserae-faber.web.app/c/senado">El Senado</a>
  ·
  <a href="#license-and-credits">License and credits</a>
  ·
  <a href="https://ko-fi.com/rexuswolf">Ko-fi</a>
</p>

*Tesserae Faber* is Latin for "the token's maker". It's free, needs no account, and keeps your work in your browser.

## Collections

Tokens come in **collections**. Open one, pick its tokens, design them, print them.

- **Ready to use**: collections that come with the app, read-only (*Make a copy* gives you one to change):
  - ***El Senado*** (*The Senate*), at `/c/senado`: a hidden-role game in the Roman Senate (sides, Consul and Tribune,
    *Placet* / *Non placet*, Unrest and the laws as cards), adapted from Secret Hitler;
  - ***5e Fantasy***, at `/c/srd5e`: the fifteen conditions as coins and rings, table markers and spell effects, from the
    System Reference Document 5.2;
  - ***Draw Steel*** (heroic resources, Malice, Victories, conditions and condition rings), at `/c/drawsteel`.
- **Your own**: make one from scratch, or import one. You create and edit its tokens (a name, an icon from
  game-icons.net or an SVG, a colour group) and their **linked tokens**, which come and go with them (a condition's duration, say): *+ Token* and each token's *Edit* open its panel over the sheet, with the token
  drawn as it prints beside its fields (*Create*, *Create and another*, *Done*).

A collection is laid out like this:

- **Types**: the fixed entries at the top of the sidebar (Draw Steel's "Resources", "Conditions"); a collection of more than one
  type also gets **Everything**, all its tokens together, to queue at once. A type also says its tokens' shape:
  - coins;
  - cards (85 × 55 mm, with a back of their own);
  - condition rings: a flat ring that slips over a miniature's base, its name repeated all the way round;
  - base trays: a tray the miniature's own base sits in, with a tab in front carrying a number or a name
    (the tab grows with its text, its sides parallel, its outer corners rounded; it prints face-up).
  Rings and trays are for 25, 32, 40 or 50 mm bases, chosen in the design's body section.
- **Groups**: the colours, and the filters and order of the sheet (Draw Steel's classes, El Senado's sides).
- **Tokens**: each of one type and one group, with its linked tokens. Names can come in several languages. A token can
  have a colour of its own (`colour`, in its panel: *Colour*), worn instead of its group's wherever its design says the group's colour
  (its linked tokens and other state too): Draw Steel's conditions each have one, coin and ring alike.
- **Sections**: the sidebar's headings, each **closed** (it comes with the collection, with its own catalogs)
  or **open** (yours to add **catalogs** to, from scratch or from a list of names).
- **Designs**: the looks it comes with, per shape (a name and a design, `styles` in its file): the first of a
  shape is its tokens' default. Without them, a collection has *Basic*.

Each collection also has its own look: its name and logo, its colours (a ready theme or your own), what its
loading screen says, and what its *About* says, with its credits and links.

A whole collection goes in and out as one JSON file (`"format": "midnight-mint/collection"`, see
`src/collection.ts`), with its icons inside, so you can keep it or share it.

## Designing and printing

The same for every collection.

**Design them**
- Your own icons: give any token an icon from game-icons.net (searched in the workshop, credited in *About the tool*) or an SVG of your own; its linked tokens share it.
- Five layouts: the name in an arc under the icon (the classic token); a coloured window over the top half with
  the name straight and large below; the symbol alone, as large as it fits; the name twice, at the bottom and
  turned round at the top, so it reads right way up from both sides of the table; or the text alone, straight in
  the middle on one line or two (votes, numbers, markers: «+1», «PLACET»).
- Relief, part by part: the name, the frame and the icon each flush with the coin or raised (0.4 to 1.2 mm).
  Flush, nobody can feel which token it is and it prints face-down; with anything raised it prints face-up.
- Designs in three places:
  - **The Taller** (`/taller`, from the collection menu or *Edit this design in the Taller*): where designs are made, for every
    shape (coins, rings, base trays, cards). Yours are kept once for all your collections (a colour that is the group's stays the
    group's, so a design fits any collection); you make one from *Basic* or by duplicating any, rename it, change it with the same
    controls as the design step and delete it (what used it goes back to its default). The collections' designs are there too, read-only,
    with *Duplicate to edit*. A design is shown on tokens of the collection the Taller was opened from, or on samples of its own.
  - **The collection's default per shape**, over the sheet in Pick (*Design: Coins Steel ▾ · Rings High relief ▾*): any of the collection's
    designs or yours, for all its tokens of that shape at once. *Original design* sets them back to the collection's own; tokens with a
    design or changes of their own are asked about first (kept, or given the new one too).
  - **A token's own**, in the design step: another design for it, or changes to its look (colours, frame, size…), marked with a pen
    on the sheet and the strip, and *Back to the default*. Changes there are that token's only.
- Collections' designs, made for them. Draw Steel's coins: *Steel*, *Parchment* (raised letters on white) and *Legible*; El Senado's:
  *Senate* (laurels in the side's colour, a gold laurel crown behind, the same on every coin); 5e Fantasy's: *Dungeon*, *Runes* and *Gold piece*.
- Rings and cards have designs made for them (`src/shape-designs.ts`), each collection listing the ones that suit it, its default first.
  Rings: *Colour ring* (the ring in the group colour), *High relief* (the name as large as fits, raised 0.8 mm), *Bold edges* (thick raised
  lines in the group colour) and *Express* (1.2 mm, two filaments). Cards: *Contrast*, *Colour plate*, *Parchment*, *Gold trim*, *Corners*
  (a bracket at each corner instead of a whole frame), *Laurels* (the line with a sprig of laurel in each corner) and *Express*.
  Base trays: *Colour tray*, *Black tray* and *Raised text*. Draw Steel's rings start on *High relief*; El Senado's laws on their own *Senate law* (black,
  the side's colour on the face, one back for all); *Basic* (your own collections) on *Colour ring* and *Contrast*.
- A card's face: its phrase alone, or with the token's icon on the left or the right, or the icon alone (Front → Icon); beside the
  phrase, the icon at the card's side with the phrase centred in the rest, with a thin line between them and the phrase against it,
  or the two together as one block in the middle; its size from 12 to 40 mm.
- A card's back (Back): plain, or a face of its own kept with the design, so every card of a deck has the same one: its own text (or
  the collection's name), its own icon (game-icons.net or an SVG), laid out like a face, its own frame and colours, on the card's
  colour or a background of its own (the whole card that colour, its face a plate: edge-on, a deck shows nothing either).
- A ring's mark between repeats of its name: a dot, a diamond, a star or none (Front → Text).
- 12 frame designs, and 7 back designs plus the collection's name or your own SVG, each drawn on your token as you choose.
- Any of the 10 filament colours for the coin, the frame and the back; the name and icon take the group's colour.
- A big live 3D preview you can turn around, with front and back views; it turns by itself to the part you're editing.
- What a token says is kept apart from how it looks: your collections' tokens are made and changed in their panel (from the sheet, or
  *Edit content* in the design step); a closed collection's keep their printed text and icon in the design step, under *What it says*.

**Add magnets**
- **Back pocket**: an open hole in the centre of the back, to glue a magnet into after printing.
- **Hidden magnet**: a sealed cavity inside the coin. The printer pauses at exactly the right layer so you can drop the magnet in.
- Eight common magnet sizes. The coin gets thicker automatically when the magnet needs it, and an **X-ray** view shows where the magnet sits.

**Print them**
- Three steps: **pick** the tokens, **design** them (the collection's design, or one of their own), then **print**:
  see the plates (with their filaments) or the A4 sheets before you download. Copies are set in the queue,
  each token with its own count.
- **Bambu Lab A1 or A1 mini, with AMS lite**: download a ready-to-print `.3mf`. Every part already has its filament,
  tokens are grouped onto plates by group with at most 4 colours each, and hidden magnets come with their pause.
  The A1 mini's smaller plate holds 8 coins of 45 mm (the A1: 24). Choose the nozzle too:
  the standard 0.4 mm, or 0.2 mm for finer lettering (0.10 mm layers, slower). Before you download, each
  plate shows its estimated filament and time (calibrated against Bambu Studio), and names too small to print are flagged.
- **Any other printer**: download a token's STL files from the workshop, one per colour, with instructions.
- **Paper**: download a double-sided A4 PDF at real size. Each back lands behind its front, with cut guides.

It also works on phones: the sidebar becomes a menu, with *How it works*, the app's language and *About the tool* at its foot.

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

## How it's put together

The app is TypeScript, served and bundled by Vite. `src/types.ts` has the shapes the parts share: a
token's content (`Role`), a token's design (`TokenSpec`), a built `Token`, queue entries, plates and estimates.

- `src/engine/token-engine.ts`: the token geometry (three.js) for every shape (coins, cards, rings, base trays), 2D thumbnails and STL export; `src/engine/viewer.ts` the 3D view.
  A token is a coin plus coloured inlays (name, icon, frame, back), so each colour is its own part; a raised
  inlay simply stands above the face, and the token is then laid face-up on the plate.
- `src/bambu/bambu3mf.ts`: the Bambu Studio project writer (plates, filaments, prime tower, magnet pauses).
  Its printer settings come from one template per printer and nozzle (`a1`, `a1mini`, and `-n02` for 0.2 mm),
  generated with Bambu Studio by `tools/make_bambu_template.py <any.stl> [a1|a1mini|a1-n02|a1mini-n02]`. On top of
  them it asks for Arachne walls and first-layer lines at the nozzle's normal width (the lettering is the first
  layer), a denser prime tower on the 0.2 mm nozzle so it keeps to its space, prints each plate's inlay colours
  before the coin's,
  and purges what Bambu Studio's own auto-calculation gives for each pair of colours plus 20 %
  (`src/bambu/flush.json`, from `tools/make_flush_table.py`).
- `src/pdf/print-pdf.ts`: the double-sided A4 PDF, loaded only when you ask for it.
- `src/main.ts` and `src/app/`, `src/i18n.ts`, `src/style.css`: the app (one module per part: `context.ts` the shared state and page helpers, `boot.ts` loading, `sheet.ts`, `workshop.ts`, `design-sheet.ts`, `queue.ts` the three steps, `taller.ts`, `creator.ts` collections of your own, …; `events.ts`: a change is said once, `emit("picks" | "looks" | "all")`, and each view listens with `on(…)` and redraws itself), its Spanish and English text, and its look.
- `src/collection.ts`: Tesserae Faber's collections: their shape, their JSON file, and where they're kept.
  `public/collections/` holds the ones that come with the app.
- `src/ports.ts`, `src/services.ts`, `src/adapters/`: what the app needs from outside (a private library, the admin's sign-in, what this browser keeps) as interfaces of its own; everything kept in the browser goes through `services.ts` (`local`, `session`, `readJSON`, `writeJSON`), never `localStorage` directly; `services.ts` picks the adapters (Firebase today, loaded only when needed) and the test server swaps in local ones (`tools/ui-test/mock-*.js`). With `firestore.rules`.
- `src/icons.ts`: a token's own icon: an SVG, a game-icons.net icon, or a script's picture traced into shapes.
- `tests/`: unit tests (`tests/unit`, Vitest) and end-to-end tests (`tests/e2e`, Playwright: every page, printing on
  paper and in 3D, designing, the Taller, collections).
- `tools/`: the collections' generators, the UI test server, the Bambu template and `tools/guide/`, which takes the
  guide's and this README's pictures. Design prototypes (`tools/*-protos/`) are kept locally, not in the repo.

## License and credits

**Tesserae Faber's code** is licensed under the
[PolyForm Noncommercial License 1.0.0](LICENSE). You may use, copy, modify and share it
for any **noncommercial** purpose, as long as you keep the license and its copyright notice.
Selling it, or using it to make money, is not allowed.

That license covers only the code written for this project. Everything below belongs to its owners
and keeps its own terms:

- ***El Senado*** is based on [Secret Hitler](https://www.secrethitler.com) by Goat, Wolf & Cabbage (Max Temkin, Mike Boxleiter
  and Tommy Maranges), licensed [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). The adaptation (its Roman
  theme and names, `public/collections/senado.json`) is shared under the same licence, noncommercial; it is unofficial and not
  affiliated with or endorsed by Goat, Wolf & Cabbage.
- ***5e Fantasy*** includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at
  <https://www.dndbeyond.com/srd>. The SRD 5.2 is licensed under the
  [Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/legalcode).
  The collection is unofficial and not affiliated with or endorsed by Wizards of the Coast.
- ***Draw Steel*** and its rules belong to [MCDM Productions](https://www.mcdmproductions.com). <img src="public/collections/powered-by-draw-steel.png" alt="Powered by Draw Steel" height="28" align="right">
  Tesserae Faber is an independent product published under the DRAW STEEL Creator License and is not affiliated
  with MCDM Productions, LLC. DRAW STEEL © 2026 MCDM Productions, LLC.
- **Icons** (the collections', and the ones you choose for your own tokens) come from [game-icons.net](https://game-icons.net) under
  [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Each icon's author is credited in the app
  (*About the tool*, at the bottom of the sidebar).
- **Language flags** come from [circle-flags](https://github.com/HatScripts/circle-flags) (MIT).
- **Fonts**: the token lettering is Alegreya SC ExtraBold by Juan Pablo del Peral (Huerta Tipográfica),
  under the SIL Open Font License (`public/AlegreyaSC-OFL.txt`); it was picked for strokes a 0.4 mm nozzle
  can print. Marcellus (Tesserae Faber's lettering), Gloock, Instrument Sans, Bricolage Grotesque and
  UnifrakturMaguntia are also under the OFL, served by Google Fonts.
  Dumbledor 1 (© GeM), the earlier lettering, is still in `public/` for the design prototypes in `tools/`.
- **Libraries**: [three.js](https://threejs.org) (MIT), [Firebase](https://firebase.google.com) (Apache 2.0),
  [JSZip](https://stuk.github.io/jszip/) (MIT or GPLv3), [jsPDF](https://github.com/parallax/jsPDF) (MIT)
  [svg2pdf.js](https://github.com/yWorks/svg2pdf.js) (MIT) and [imagetracerjs](https://github.com/jankovicsandras/imagetracerjs) (public domain).
