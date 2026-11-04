<p align="center">
  <img src="docs/banner.png" alt="Midnight Mint" width="720">
</p>

<p align="center">
  Design 3D-printable character tokens for <em>Blood on the Clocktower</em>, preview them in 3D,<br>
  and send them straight to your printer, or print them on paper.
</p>

<p align="center">
  <a href="https://midnight-mint.web.app"><strong>Open the app</strong></a>
  ·
  <a href="#license-and-credits">License and credits</a>
</p>

![The app: the Trouble Brewing sheet, the token workshop and the print queue](docs/screenshots/app.png)

Midnight Mint is a free, community-made tool. It is not affiliated with or endorsed by
The Pandemonium Institute. No account needed: open it and start designing.

## Features

**Find your tokens**
- Every character and reminder token of each edition, in English or in 12 community translations from
  [Villacuervos](https://villacuervos.es): six Spanish ones, Asturian, Catalan, Valencian, Basque, Galician
  and Portuguese. Where a translation has them, characters can also take their feminine form.
- Search by character or reminder text, and filter by team.
- Add a whole edition (or whatever is on screen) to the print queue in one click, with or without its reminders.

**Design them**
- Ready-made designs to start from: *Fast print*, *Ivory coin*, *High legibility*, *Glued magnet* and *Hidden magnet*.
- Two layouts: **classic** (name curved along the edge) and **window** (a framed picture with a straight name).
  The window can be flat, so nobody can feel which character they drew.
- 9 frame designs, and 6 back designs plus the edition's name or your own SVG, each drawn on your character as you choose.
- Any of the 10 filament colours for the coin, the frame and the back; the name and icon take the team colour.
- A live 3D preview you can turn around, with front and back views.
- Style the whole set at once, or give a single token its own look, and save designs in your browser.

| Frames | Backs |
|---|---|
| ![Ten frame designs, from a plain rim to laurel branches](docs/screenshots/frame-designs.png) | ![Seven back designs: plain, Midnight clock, guilloché, compass rose, sunburst, eclipse and edition name](docs/screenshots/back-designs.png) |

**Add magnets**
- **Back pocket**: an open hole in the centre of the back, to glue a magnet into after printing.
- **Hidden magnet**: a sealed cavity inside the coin. The printer pauses at exactly the right layer so you can drop the magnet in.
- Eight common magnet sizes. The coin gets thicker automatically when the magnet needs it, and an **X-ray** view shows where the magnet sits.

![X-ray view of a token with a hidden 6×2 mm magnet](docs/screenshots/magnet.png)

**Print them**
- **Bambu Lab A1 with AMS lite**: download a ready-to-print `.3mf`. Every part already has its filament,
  tokens are grouped onto plates by team with at most 4 colours each, and hidden magnets come with their pause.
- **Any other printer**: download STL files, one per colour, with instructions.
- **Paper**: download a double-sided A4 PDF at real size. Each back lands behind its front, with cut guides.

| PDF, fronts | PDF, backs |
|---|---|
| ![A4 sheet of token fronts](docs/screenshots/pdf-front.png) | ![The matching sheet of backs, mirrored for double-sided printing](docs/screenshots/pdf-back.png) |

It also works on phones:

<p align="center"><img src="docs/screenshots/mobile.png" alt="The app on a phone" width="320"></p>

## Running it locally

```bash
npm install
npm run dev        # local dev server (needs the Firebase project)
npm run build      # production build in dist/
npm run deploy     # build, then deploy hosting and Firestore rules
```

To work on the interface without Firebase, run the test server. It uses a mocked sign-in
and the character library in `admin-data/`:

```bash
npx vite --config tools/ui-test/vite.config.js   # http://localhost:5198
```

The character library lives in Firestore. `admin-data/` (not in git) holds the source files;
`node tools/fetch-translations.mjs` adds the Villacuervos translations to `admin-data/roles_game_icons.json`,
and `node tools/upload-library.mjs` replaces the library with it.

## How it's put together

- `src/engine/token-engine.js`: the token geometry (three.js), the 3D viewer, 2D thumbnails and STL export.
  A token is a coin plus flush coloured inlays (name and icon, frame, back), so each colour is its own part.
- `src/bambu/bambu3mf.js`: the Bambu Studio project writer (plates, filaments, prime tower, magnet pauses).
  Its printer settings come from `a1-template.json`, generated with Bambu Studio by `tools/make_bambu_template.py`.
- `src/pdf/print-pdf.js`: the double-sided A4 PDF, loaded only when you ask for it.
- `src/main.js`, `src/i18n.js`, `src/style.css`: the app, its Spanish and English text, and its look.
- `src/translations.js`: the languages tokens can be printed in, and who translated each one.
- `src/firebase.js`, `firestore.rules`: the public character library. Only the admin signs in (open the app with `?admin`) to upload it.
- `tools/`: test pages and helpers (UI test server, design sheets, icon review, Bambu template).

## License and credits

**Midnight Mint's code** is licensed under the
[PolyForm Noncommercial License 1.0.0](LICENSE). You may use, copy, modify and share it
for any **noncommercial** purpose, as long as you keep the license and its copyright notice.
Selling it, or using it to make money, is not allowed.

That license covers only the code written for this project. Everything below belongs to its owners
and keeps its own terms:

- ***Blood on the Clocktower*** and its character names, editions and rules belong to
  [The Pandemonium Institute](https://bloodontheclocktower.com). Midnight Mint is an unofficial fan tool,
  not affiliated with or endorsed by them. It uses none of the game's original artwork.
- **Translations** of character names and reminders come from [Villacuervos](https://villacuervos.es)
  and belong to their translators: Rovortox, Bumble3ee, Castelgard, Chiromyiforme, Pedro and Solrax (Spanish),
  uriell (Portuguese) and the Villacuervos community (Asturian, Catalan, Valencian, Basque and Galician).
- **Character icons** come from [game-icons.net](https://game-icons.net) under
  [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Each icon's author is credited in the app
  (*Credits*, at the bottom of the sidebar).
- **Language flags** come from [circle-flags](https://github.com/HatScripts/circle-flags) (MIT).
- **Fonts**: Gloock, Instrument Sans and UnifrakturMaguntia are under the SIL Open Font License, served by
  Google Fonts. Dumbledor 1 (© GeM), used for the token lettering, is a free font distributed by its author;
  check its terms before reusing it elsewhere.
- **Libraries**: [three.js](https://threejs.org) (MIT), [Firebase](https://firebase.google.com) (Apache 2.0),
  [JSZip](https://stuk.github.io/jszip/) (MIT or GPLv3), [jsPDF](https://github.com/parallax/jsPDF) (MIT)
  and [svg2pdf.js](https://github.com/yWorks/svg2pdf.js) (MIT).
