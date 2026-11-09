// Writes the Secret Caesar collection (César secreto; its id, senado) that comes with the app (public/collections/senado.json) and its
// logo; the strip of tokens on its cover is tools/make-crear-art.mjs. Tokens to play the hidden-role
// game of Secret Hitler (Goat, Wolf & Cabbage, CC BY-NC-SA 4.0: its attribution is in the
// collection's About, src/builtins.ts), rethemed to the Roman Senate: the theme and the names are
// ours, none of the game's on the tokens; game-icons.net icons.
//   node tools/make-senado-collection.mjs
// Types: sides (who you are), government (Consul and Tribune, two-sided: turned over when their
// term ends), the vote (two-sided), unrest (the election tracker, for playing without the board) as
// coins, and the laws as cards. No executive powers.
import fs from "node:fs";
import path from "node:path";
import { BUILT_INS } from "../src/builtins.ts";   // its theme, loading line and About: one place
import { FILAMENTS } from "../src/engine/token-engine.ts";
import { cardDesigns } from "../src/shape-designs.ts";
import { asLists } from "./collection-model.mjs";
const SEN = BUILT_INS.find((b) => b.id === "senado");

const root = path.resolve(import.meta.dirname, "..");
const GI = JSON.parse(fs.readFileSync(path.join(root, "node_modules/@iconify-json/game-icons/icons.json"), "utf8")).icons;
const INDEX = JSON.parse(fs.readFileSync(path.join(root, "public/game-icons.json"), "utf8"));   // "author/name"
const author = (name) => INDEX.find((x) => x.endsWith(`/${name}`))?.split("/")[0];
// placed as the app places game-icons.net icons (src/icons.ts: GI_PLACE)
const PLACE = "translate(28.063 19.134) scale(0.139518)";
const bare = (name) => { const body = GI[name]?.body; if (!body) throw new Error(`no icon ${name}`); return body.replace(/\s(fill)="[^"]*"/g, ""); };
const icon = (name) => {
  if (!author(name)) throw new Error(`no author for ${name}`);
  return { icon: { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.559055 127.559055"><g transform="${PLACE}">${bare(name)}</g></svg>` }, iconCredit: { name, author: author(name) } };
};

// Colours are filaments the printer has (src/collection.ts GROUP_COLOURS), each group its own: the
// Republic marble white, the conspiracy red (the daggers), its would-be Caesar Tyrian purple,
// the offices silver, the vote bronze (the tablets), the unrest yellow (the torches).
const C = { bone: FILAMENTS.white, red: "#b3191e", purple: "#8a3d9e", silver: FILAMENTS.silver, bronze: FILAMENTS.bronze, yellow: "#d4a72c" };
const tok = (id, type, group, name, ic, extra = {}) => ({ id, type, group, name, ...(ic ? icon(ic) : { icon: null }), linked: [], ...extra });
const flip = (name, ic) => ({ flip: { name, ...icon(ic) } });

const SIDES = [
  // the uninformed majority; those who know each other; their hidden leader
  tok("republicano", "fichas", "republica", { es: "Republicano", en: "Republican" }, "greek-temple"),
  tok("conspirador", "fichas", "conjura", { es: "Conspirador", en: "Conspirator" }, "cloak-dagger"),
  tok("cesar", "fichas", "conjura", { es: "Aspirante a César", en: "Aspiring Caesar" }, "caesar", { colour: C.purple }),
];
const GOVERNMENT = [
  // turned over when their term ends: the ex can't be named again at once
  tok("consul", "fichas", "gobierno", { es: "Cónsul", en: "Consul" }, "laurel-crown", flip({ es: "Excónsul", en: "Ex-Consul" }, "laurels")),
  tok("tribuno", "fichas", "gobierno", { es: "Tribuno", en: "Tribune" }, "scroll-unfurled", flip({ es: "Extribuno", en: "Ex-Tribune" }, "tied-scroll")),
];
// each player's, shown at once: the Senate's own Latin (placet: it pleases), the same in both languages
const VOTE = [tok("voto", "fichas", "votos", { es: "Placet", en: "Placet" }, "thumb-up", flip({ es: "Non placet", en: "Non placet" }, "thumb-down"))];
// the election tracker, for playing without the board: the third, chaos (the top law passes)
// Unrest is public: its back needn't hide anything, so it's a face too, in its own colour (the
// torch in front, the fire behind) rather than the coins' shared laurel crown
const UNREST = [1, 2, 3].map((n) => { const name = { es: `Tumultos ${n}`, en: `Unrest ${n}` }; return { ...tok(`tumultos-${n}`, "fichas", "tumultos", name, "torch"), ...flip(name, "flame") }; });
// the laws, as cards: 6 of the Republic's and 11 of the tyrant's in the deck, each with its icon
// beside its phrase (the Republic's temple, the would-be Caesar)
const LAWS = [
  tok("ley", "leyes", "republica", { es: "Ley de la República", en: "Law of the Republic" }, "greek-temple"),
  tok("decreto", "leyes", "conjura", { es: "Decreto del Tirano", en: "Tyrant's Decree" }, "caesar"),
];
const tokens = [...SIDES, ...GOVERNMENT, ...VOTE, ...UNREST, ...LAWS];
const ids = (list) => list.map((t) => t.id);

// The styles it comes with (src/collection.ts StyleDef), per shape; "team" is the token's group
// colour. Its own, then the app's (src/shape-designs.ts APP_DESIGNS), offered in every collection.
const styles = {
  coin: [
    // the default: black, a laurel wreath round it, icon and name in the group colour; behind, a laurel
    // crown in gold, the same on every coin (a role dealt face-down shows nothing)
    { id: "senado", name: { es: "Senado", en: "Senate" },
      help: { es: "Negra, con una corona de laurel, el icono y el nombre del color del bando; al reverso, una corona de laurel en oro, igual en todas.", en: "Black, with a laurel wreath, the icon and the name in the side's colour; on the back, a laurel crown in gold, the same on every coin." },
      spec: { style: "classic", frame: "laurel", frameWidth: 0.8, back: "custom", customSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${GI["laurel-crown"].body.replace(/\s(fill)="[^"]*"/g, "")}</svg>`, depth: 0.4, colours: { base: FILAMENTS.black, front: "team", frame: "team", back: FILAMENTS.gold } } },
  ],
  // the laws: every one black (the deck shows nothing face-down or edge-on), the icon, the phrase
  // and the laurels in the side's colour (a marble law, a red decree); their back one for all: the
  // laurels and a laurel crown in gold. Then the app's.
  card: [
    { id: "ley", name: { es: "Ley del Senado", en: "Senate law" },
      help: { es: "Negra, como todas: el icono a la izquierda, la frase y una ramita de laurel en cada esquina del color del bando; al reverso, igual para todas, los laureles y una corona de laurel en oro. Boca abajo o de canto no se distinguen.", en: "Black, like every law: the icon on the left, the phrase and a sprig of laurel in each corner in the side's colour; on the back, the same for all, the laurels and a laurel crown in gold. Face-down or edge-on, you can't tell them apart." },
      spec: { frame: "laurel", frameWidth: 0.6, height: 2, depth: 0.4, cardIcon: "left", cardJoin: "spread", cardIconSize: 30,
        cardBack: { on: true, text: "", cardIcon: "only", cardIconSize: 34, frame: "laurel", frameWidth: 0.6,
          icon: { id: `${author("laurel-crown")}/laurel-crown`, source: "game-icons", name: "laurel-crown", author: author("laurel-crown"), g: PLACE, body: bare("laurel-crown") },
          colours: { text: FILAMENTS.gold, frame: FILAMENTS.gold } },
        colours: { base: FILAMENTS.black, front: "team", frame: "team", backBase: FILAMENTS.black } } },
    ...cardDesigns("laureles", "placa", "contraste"),
  ],
};
const collection = {
  format: "midnight-mint/collection", version: 1,
  name: SEN.name,
  theme: SEN.theme,
  brand: { logo: "/collections/senado-logo.svg" },
  loader: SEN.loader,
  about: SEN.about,
  languages: ["es", "en"],
  // two types: a game's coins and its law cards (the groups sort and colour the coins)
  types: [
    { id: "fichas", name: { es: "Fichas", en: "Tokens" }, title: { es: "Fichas", en: "Tokens" }, shape: "coin", icon: "laurel-crown" },
    { id: "leyes", name: { es: "Leyes", en: "Laws" }, title: { es: "Leyes", en: "Laws" }, shape: "card", icon: "scroll-unfurled" },
  ],
  groups: [
    // each with an icon of its own (its filter on the sheet, its plates)
    { id: "republica", name: { es: "La República", en: "Republic" }, colour: C.bone, iconBody: bare("greek-temple") },
    { id: "conjura", name: { es: "La Conjura", en: "Conspiracy" }, colour: C.red, iconBody: bare("plain-dagger") },
    { id: "gobierno", name: { es: "Gobierno", en: "Government" }, colour: C.silver, iconBody: bare("laurel-crown") },
    { id: "votos", name: { es: "Votos", en: "Votes" }, colour: "#2f86e0", iconBody: bare("thumb-up") },
    { id: "tumultos", name: { es: "Tumultos", en: "Unrest" }, colour: C.bronze, iconBody: bare("torch") },
  ],
  tokens,
  sections: [
    { id: "senado", title: { es: "César secreto", en: "Secret Caesar" }, open: false, catalogs: [
      // the whole game, to queue in one go
      { id: "partida", name: { es: "Partida completa", en: "Full game" }, tokens: [...ids(SIDES), ...ids(GOVERNMENT), ...ids(VOTE), ...ids(UNREST), ...ids(LAWS)] },
    ] },
    { id: "partidas", title: { es: "Partidas", en: "Games" }, open: true, catalogs: [] },
  ],
  styles,
};
const out = path.join(root, "public/collections/senado.json");
fs.writeFileSync(out, JSON.stringify(asLists(collection)));   // as the app keeps it: shapes on the tokens, the sections' catalogs as its own lists
console.log(`wrote ${out}: ${tokens.length} tokens (${SIDES.length} sides, ${GOVERNMENT.length + VOTE.length} two-sided, ${UNREST.length} unrest (two-sided too), ${LAWS.length} laws)`);
if (SEN.tokens !== tokens.length) console.warn(`src/builtins.ts says ${SEN.tokens} tokens: make it ${tokens.length}`);

// its logo: a laurel wreath with a dagger through it, bone on Pompeian red
const wreath = bare("laurels"), dagger = bare("plain-dagger");
fs.writeFileSync(path.join(root, "public/collections/senado-logo.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><title>${SEN.name.en}</title>
<circle cx="50" cy="50" r="46" fill="#5c1a13" stroke="#c9a227" stroke-width="4"/><g transform="translate(17 17) scale(${66 / 512})" fill="#efe8dc">${wreath}</g><g transform="translate(50 50) rotate(45) scale(${50 / 512}) translate(-256 -256)" fill="#c9a227">${dagger}</g></svg>\n`);
console.log("wrote senado-logo.svg");
