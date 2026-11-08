<p align="center">
  <img src="public/tesserae-faber.svg" alt="" width="120">
</p>

<h1 align="center">Tesserae Faber</h1>

<p align="center">
  <strong>Tokens for your games, ready to print.</strong><br>
  Make your own tokens or start from a ready collection, choose their design and download them<br>
  for your 3D printer (each colour its own part) or as a PDF to cut out.
</p>

<p align="center">
  <a href="https://tesserae-faber.web.app"><strong>Open the app</strong></a>
  ·
  <a href="#license-and-credits">Credits</a>
  ·
  <a href="https://ko-fi.com/rexuswolf">Ko-fi</a>
</p>

<p align="center">
  <img src="docs/screenshots/tf-home.png" alt="Tesserae Faber's home: tokens for your games, ready to print" width="820">
</p>

## Pick · Design · Print

1. **Pick** your tokens: make them yourself (a name, an icon from game-icons.net or your own SVG, a colour group),
   or tick them in a ready collection.
2. **Design** them: colours, frame, background pattern, back, relief, a hole for a magnet. Change something and the
   token changes at once.
3. **Print** them: a Bambu Studio project with every colour on its filament, STL files for any printer, or an A4 PDF.

Free, no account, no ads: your collections and designs stay in your browser.

## Ready collections

- ***El Senado***: a hidden-role game in Rome, adapted from Secret Hitler.
- ***5e Fantasy***: conditions, spells and markers, from the SRD 5.2.
- ***Draw Steel***: hero resources, Malice, Victories and conditions.

## Coins, cards, rings and bases

| | |
|---|---|
| **Coins** | 30 to 60 mm, with a front and a back |
| **Cards** | 85 × 55 mm, with their phrase, their icon and their back |
| **Rings** | slip round a miniature's base (25 to 50 mm), the condition all the way round |
| **Bases** | a tray the miniature stands in, with a number or a name on the tab |

## Your designs

A design sets how every token looks at once. Make yours in **Your designs**, from scratch, from a template or from
another of yours, and use it in any collection. Frames of all kinds (laurel, beads, runes, rope…), patterns, five
layouts, a raised name, frame or icon to feel by touch, and a magnet open or hidden inside.

## Printing

- **Bambu Lab A1 / A1 mini with AMS lite**: a ready `.3mf`, plates laid out, each part on its filament, magnet pauses
  included, with the filament and time each plate will take.
- **Any other printer**: STL files, one per colour.
- **Paper**: a double-sided A4 PDF at real size, each back behind its front.

---

Developing it: see [docs/development.md](docs/development.md).

## License and credits

**Tesserae Faber's code** is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE): use, copy, modify
and share it for any **noncommercial** purpose, keeping the license and its copyright notice. That covers only the
code written for this project; everything below belongs to its owners and keeps its own terms.

- ***El Senado*** is based on [Secret Hitler](https://www.secrethitler.com) by Goat, Wolf & Cabbage (Max Temkin, Mike Boxleiter
  and Tommy Maranges), licensed [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). The adaptation
  (`public/collections/senado.json`) is shared under the same licence; it is unofficial and not affiliated with or
  endorsed by Goat, Wolf & Cabbage.
- ***5e Fantasy*** includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at
  <https://www.dndbeyond.com/srd>, licensed under the
  [Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/legalcode).
  The collection is unofficial and not affiliated with or endorsed by Wizards of the Coast.
- ***Draw Steel*** and its rules belong to [MCDM Productions](https://www.mcdmproductions.com). <img src="public/collections/powered-by-draw-steel.png" alt="Powered by Draw Steel" height="28" align="right">
  Tesserae Faber is an independent product published under the DRAW STEEL Creator License and is not affiliated
  with MCDM Productions, LLC. DRAW STEEL © 2026 MCDM Productions, LLC.
- **Icons** come from [game-icons.net](https://game-icons.net) under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/);
  each icon's author is credited in the app (*About the tool*).
- **Language flags** come from [circle-flags](https://github.com/HatScripts/circle-flags) (MIT).
- **Fonts**: the token lettering is Alegreya SC ExtraBold by Juan Pablo del Peral (Huerta Tipográfica), under the
  SIL Open Font License (`public/AlegreyaSC-OFL.txt`). Marcellus, Gloock, Instrument Sans, Bricolage Grotesque and
  UnifrakturMaguntia are also under the OFL, served by Google Fonts. Dumbledor 1 (© GeM), the earlier lettering, is
  still in `public/` for the design prototypes.
- **Libraries**: [three.js](https://threejs.org) (MIT), [Firebase](https://firebase.google.com) (Apache 2.0),
  [JSZip](https://stuk.github.io/jszip/) (MIT or GPLv3), [jsPDF](https://github.com/parallax/jsPDF) (MIT),
  [svg2pdf.js](https://github.com/yWorks/svg2pdf.js) (MIT) and [imagetracerjs](https://github.com/jankovicsandras/imagetracerjs) (public domain).
