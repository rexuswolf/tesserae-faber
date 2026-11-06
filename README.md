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
  <a href="https://tesserae-faber.web.app/botc">Blood on the Clocktower</a>
  ·
  <a href="#license-and-credits">License and credits</a>
</p>

![The front page: what the app does, its three steps, and a honeycomb of tokens made with it](docs/screenshots/tf-home.png)

*Tesserae Faber* is Latin for "the token's maker". It's free, needs no account, and keeps your work in your browser.

## Collections

Tokens come in **collections**. Open one, pick its tokens, design them, print them.

- **Ready to use**: collections that come with the app, read-only (*Make a copy* gives you one to change):
  ***Blood on the Clocktower***, as [Midnight Mint](#midnight-mint-blood-on-the-clocktower), at `/botc`, and
  ***Draw Steel*** (heroic resources, Malice, Victories, conditions and condition rings), at `/c/drawsteel`.
- **Your own**: make one from scratch, or import one. You create and edit its tokens (a name, an icon from
  game-icons.net or an SVG, a colour group) and their **linked tokens**, which come and go with them, as a
  character's reminders do.

![The collections: Blood on the Clocktower as a cover, and your own as a list](docs/screenshots/tf-collections.png)

A collection is laid out like this:

- **Types**: the fixed entries at the top of the sidebar ("All characters", "Grimoire"). A type also says its
  tokens' shape: coins, cards, or condition rings (a flat ring that slips over a miniature's base, its name
  repeated all the way round; for 25, 32 or 40 mm bases, chosen in the design's Coin section).
- **Groups**: the colours, and the filters and order of the sheet (Clocktower's teams).
- **Tokens**: each of one type and one group, with its linked tokens. Names can come in several languages.
- **Sections**: the sidebar's headings, each **closed** (it comes with the collection, like Clocktower's
  editions) or **open** (yours to add **catalogs** to, from scratch or from a list such as a Script Tool script).
- **Styles**: the looks it comes with, per shape (a name and a design): its tokens start with the first, and
  the rest are a click away in the style menu. Without them, a collection has one basic style per shape.

Each collection also has its own look: its name and logo, its colours (a ready theme or your own), what its
loading screen says, and what its *About* says, with its credits and links. Blood on the Clocktower content can
carry the Community Created Content mark in *About*.

A whole collection goes in and out as one JSON file (`"format": "midnight-mint/collection"`, see
`src/collection.ts`), with its icons inside, so you can keep it or share it.

## Midnight Mint: Blood on the Clocktower

<p align="center"><img src="docs/banner.png" alt="Midnight Mint" width="560"></p>

![The design step: the token's editor on the left, a big 3D token, and your tokens in a strip beneath it](docs/screenshots/app.png)

<p align="center"><img src="public/ccc-sleeve.png" alt="Community Created Content" width="172"></p>

<p align="center">
  Midnight Mint is Tesserae Faber's <em>Blood on the Clocktower</em> collection, a free, community-made tool.<br>
  It is not affiliated with or endorsed by The Pandemonium Institute. It used to live at midnight-mint.web.app,
  which now takes you (and what your browser kept there) to <code>/botc</code>.
</p>

**Find your tokens**
- Every character and reminder token of each edition, in English or in 12 community translations from
  [Villacuervos](https://villacuervos.es): six Spanish ones, Asturian, Catalan, Valencian, Basque, Galician
  and Portuguese. Where a translation has them, characters can also take their feminine form.
- **All characters** (every edition at once, each row naming its edition) and the **Grimoire** sit above the editions;
  the app opens on All characters and comes back to the view you left.
- Search by character or reminder text, including the names you gave them, and filter by team.
- Click anywhere on a character's row to add it with its reminders. Reminders are chips under its name; identical ones
  share a chip ("Correct ×5"). *Add to queue* adds everything on screen: characters, their reminders, or both.
- Keep your own **scripts**: import the Script Tool's JSON and the script sits beside the editions.
  Scripts live in your browser; share one with a link (the script travels inside it) or download it as JSON.
- **Homebrew** scripts work too: characters a script defines itself (a name, a team, an ability) become tokens of
  that script, with their reminders. Their pictures, PNG included, are traced into printable icons in your browser.

| Token language | A shared script |
|---|---|
| ![Choosing the token language: the list of languages with Spanish unfolded into its six versions, and the tokens redrawn in the one pointed at](docs/screenshots/token-language.png) | ![Opening a shared script link: its 13 tokens and a button to save it](docs/screenshots/script-shared.png) |

## Designing and printing

The same for every collection.

**Design them**
- Your own icons: give any character another icon from game-icons.net (searched in the workshop, credited in *About the tool*) or an SVG of your own; its reminders share it. A script can bring its own names and icons in the Script Tool's `image` (a game-icons.net link, an SVG, or a picture to trace), and *Download JSON* keeps them.
- Four layouts: the name in an arc under the icon (the classic token); a coloured window over the top half with
  the name straight and large below; the symbol alone, as large as it fits; or the name twice, at the bottom and
  turned round at the top, so it reads right way up from both sides of the table.
- Relief, part by part: the name, the frame and the icon each flush with the coin or raised (0.4 to 1.2 mm).
  Flush, nobody can feel which token it is and it prints face-down; with anything raised it prints face-up.
- Styles that come with each collection, made for it. Clocktower's: *Edition* (the default: the edition's name in gold on the back), *Fast print* (1.2 mm,
  the thinnest that holds up), *Pitch-black night*, *Midnight*, *Ivory coin* and *High legibility* (the window layout), all with the frame in the team colour.
  Draw Steel's: *Steel*, *Parchment* (raised letters on white) and *Legible* for its coins, *Fine ring* and *Bold ring* for its rings; your own collections start with *Basic*.
  The style menu adds the collection's styles you don't have yet, and a style can be reset to one. A magnet (glued into a pocket, or hidden inside with a pause) is a choice of its own and stays when you reset a style.
- 12 frame designs, and 7 back designs plus the edition's name (a homebrew's script) or your own SVG, each drawn on your character as you choose.
- Any of the 10 filament colours for the coin, the frame and the back; the name and icon take the team's (or group's) colour.
- A big live 3D preview you can turn around, with front and back views; it turns by itself to the part you're editing.
- Styles: named looks (*Edition*, *Ivory*, your own) for each shape, each token using one. Changing the look changes the token's style, every token using it, and says how many, with *Only this token* to keep the change to that one. A pen marks the tokens with changes of their own and takes you straight back to them; *Back to the style* takes them away. *New style* makes a copy of the token's style to change, and a token's look can be saved as a new style.
- One editor for changing a token and, in your own collections, for making one: its shape, its style, what it says (name, icon, group, catalogs, linked tokens, its other state) and how it looks, with *Create* and *Create and another*.

| Frames | Backs |
|---|---|
| ![Ten frame designs, from a plain rim to laurel branches](docs/screenshots/frame-designs.png) | ![The back designs: plain, Midnight clock, guilloché, compass rose, sunburst, eclipse, orbits and edition name](docs/screenshots/back-designs.png) |

**Add magnets**
- **Back pocket**: an open hole in the centre of the back, to glue a magnet into after printing.
- **Hidden magnet**: a sealed cavity inside the coin. The printer pauses at exactly the right layer so you can drop the magnet in.
- Eight common magnet sizes. The coin gets thicker automatically when the magnet needs it, and an **X-ray** view shows where the magnet sits.

![X-ray view of a token with a hidden 6×2 mm magnet](docs/screenshots/magnet.png)

**Info tokens**
- The **Grimoire** edition has the 10 info tokens the Storyteller shows players ("This is the Demon", "You are"…)
  as 85 × 55 mm cards, in the set's colours and frame. English is the game's wording; Spanish is the app's own.
  They print like the coins: 8 a plate on the A1, 2 on the A1 mini, 8 an A4 sheet.

**Print them**
- Three steps: **pick** the tokens, **design** them (one design for the set, or one of their own), then **print**:
  see the plates (with their filaments) or the A4 sheets before you download. Copies are set in the queue,
  which lists the characters and the reminders apart, each with its own count.
- **Bambu Lab A1 or A1 mini, with AMS lite**: download a ready-to-print `.3mf`. Every part already has its filament,
  tokens are grouped onto plates by team with at most 4 colours each, and hidden magnets come with their pause.
  The A1 mini's smaller plate holds 8 characters or 14 reminders (the A1: 24 and 34). Choose the nozzle too:
  the standard 0.4 mm, or 0.2 mm for finer lettering (0.10 mm layers, slower). Before you download, each
  plate shows its estimated filament and time (calibrated against Bambu Studio), and names too small to print are flagged.
- **Any other printer**: download a token's STL files from the workshop, one per colour, with instructions.
- **Paper**: download a double-sided A4 PDF at real size. Each back lands behind its front, with cut guides.

| The queue | 3D printer | Paper |
|---|---|---|
| ![The print queue: the characters by team, then the reminders, each with its copies](docs/screenshots/queue-list.png) | ![Printing on a 3D printer: the filaments and the plates, grouped by team](docs/screenshots/queue-print-3d.png) | ![Printing on paper: each A4 sheet's front and back](docs/screenshots/queue-print-paper.png) |

| PDF, fronts | PDF, backs |
|---|---|
| ![A4 sheet of token fronts](docs/screenshots/pdf-front.png) | ![The matching sheet of backs, mirrored for double-sided printing](docs/screenshots/pdf-back.png) |

It also works on phones: the sidebar becomes a menu, with *How it works*, the app's language and *About the tool* at its foot.

<p align="center">
  <img src="docs/screenshots/mobile.png" alt="The app on a phone: the Trouble Brewing sheet" width="280">
  &nbsp;
  <img src="docs/screenshots/mobile-menu.png" alt="The phone menu: all characters, the grimoire, editions, scripts, and the guide, language and About at its foot" width="280">
</p>

## Running it locally

```bash
npm install
npm run dev        # local dev server (needs the Firebase project)
npm run typecheck  # TypeScript check (tsc, no output files)
npm run build      # production build in dist/
npm run deploy     # typecheck and build, then deploy to tesserae-faber (hosting and Firestore rules)
npm run deploy:legacy   # the old address (midnight-mint.web.app): its one page, which redirects to /botc
```

The app lives in the Firebase project `tesserae-faber`: Tesserae Faber at `/`, `/colecciones` and `/c/<id>`,
Midnight Mint at `/botc`. The old project `midnight-mint` only serves `legacy/index.html`.

To work on the interface without Firebase, run the test server. It uses a mocked sign-in
and the character library in `admin-data/`:

```bash
npx vite --config tools/ui-test/vite.config.js   # http://localhost:5198 (Clocktower at /botc)
```

The character library lives in Firestore. `admin-data/` (not in git) holds the source files;
`node tools/fetch-translations.mjs` adds the Villacuervos translations to `admin-data/roles_game_icons.json`,
and `node tools/upload-library.mjs` replaces the library with it (or, signed in as the admin,
upload it from `/botc?admin`). The art the app draws once comes from tools too:
`node tools/make-botc-collection.mjs` writes the Clocktower collection in `public/collections/` (and its numbers,
`src/builtins-facts.ts`), `node tools/make-drawsteel-collection.mjs` the Draw Steel one with its logo and cover,
`node tools/make-faber-logo.mjs` the Tesserae Faber logos in `public/`, and `node tools/make-crear-art.mjs` the
front page's honeycomb and the Clocktower cover's tokens (it needs the test server running).

## How it's put together

The app is TypeScript, served and bundled by Vite. `src/types.ts` has the shapes the parts share: a
character (`Role`), a token's design (`TokenSpec`), a built `Token`, queue entries, plates and estimates.

- `src/engine/token-engine.ts`: the token geometry (three.js), the 3D viewer, 2D thumbnails and STL export.
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
- `src/main.ts`, `src/i18n.ts`, `src/style.css`: the app, its Spanish and English text, and its look. One app serves
  both: Midnight Mint at `/botc`, Tesserae Faber everywhere else (`MODE` in `src/collection.ts`).
- `src/collection.ts`: Tesserae Faber's collections: their shape, their JSON file, and where they're kept.
  `public/collections/` holds the ones that come with the app.
- `src/handoff.ts`, `legacy/`: the way over from midnight-mint.web.app, with what each browser kept there.
- `src/translations.ts`: the languages tokens can be printed in, and who translated each one.
- `src/firebase.ts`, `firestore.rules`: the public character library. Only the admin signs in (open the app with `?admin`) to upload it.
- `src/icons.ts`: a token's own icon: an SVG, a game-icons.net icon, or a script's picture traced into shapes.
- `tools/`: test pages and helpers (UI test server, design sheets, icon review, Bambu template, and
  `tools/guide/`, which takes the guide's and this README's pictures).

## License and credits

**Tesserae Faber's code** (Midnight Mint's included) is licensed under the
[PolyForm Noncommercial License 1.0.0](LICENSE). You may use, copy, modify and share it
for any **noncommercial** purpose, as long as you keep the license and its copyright notice.
Selling it, or using it to make money, is not allowed.

That license covers only the code written for this project. Everything below belongs to its owners
and keeps its own terms:

- ***Blood on the Clocktower*** and its character names, editions and rules belong to
  [The Pandemonium Institute](https://bloodontheclocktower.com). Midnight Mint, its collection here, is an unofficial fan tool,
  not affiliated with or endorsed by them. It uses none of the game's original artwork.
- ***Draw Steel*** and its rules belong to [MCDM Productions](https://www.mcdmproductions.com). <img src="public/collections/powered-by-draw-steel.png" alt="Powered by Draw Steel" height="28" align="right">
  Tesserae Faber is an independent product published under the DRAW STEEL Creator License and is not affiliated
  with MCDM Productions, LLC. DRAW STEEL © 2026 MCDM Productions, LLC.
- **Translations** of character names and reminders come from [Villacuervos](https://villacuervos.es)
  and belong to their translators. Spanish: Roberto (the Rovortox and Bumble3ee versions), Castelgard,
  Chiromyiforme, Pedro and Carlos (Solrax). Asturian: Hugo. Catalan: Ren. Valencian: Carlos. Basque: JUMA.
  Galician: Dumis. Portuguese: uriell.
- **Icons** (the characters', and the ones you choose for your own tokens) come from [game-icons.net](https://game-icons.net) under
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
