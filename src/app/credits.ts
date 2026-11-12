// Credits: the game, translators, icon authors, fonts and libraries.
import { tokenLang, tlName } from "./token-language.ts";
import { esc, state, coll, $, REPO_PUBLIC, REPO_URL, hit } from "./context.ts";
import { TRANSLATIONS, VILLACUERVOS_URL, TPI_TRANSLATIONS_URL } from "../translations.ts";
import { t, uiLang } from "../i18n.ts";
import type { TokenIcon } from "../types.ts";
import { UI_ICONS } from "../ui-icons.ts";
import { builtIn, OWN, OWN_ID, nameIn, hasCcc } from "../collection.ts";
import { drawer } from "./scripts-ui.ts";
import { markdown } from "../markdown.ts";

// ------------------------------------------------------------ credits

const AUTHOR_NAMES: Record<string, string> = {
  lorc: "Lorc", delapouite: "Delapouite", "caro-asercion": "Caro Asercion", skoll: "Skoll", "carl-olsen": "Carl Olsen",
  "lord-berandas": "Lord Berandas", "various-artists": "Various artists", cathelineau: "Cathelineau", zajkonur: "Zajkonur",
  aussiesim: "AussieSim", faithtoken: "Faithtoken", starseeker: "Starseeker", willdabeast: "Willdabeast",
};
const authorName = (a: string) => AUTHOR_NAMES[a] || a.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Credits: the game, the translators (the translation in use first), the icon authors
 * (CC BY 3.0 asks for author credit) and the fonts and libraries.
 */
function openCredits() {
  const cur = tokenLang();
  const link = (href: string, text: string) => `<a href="${href}" target="_blank" rel="noopener">${esc(text)}</a>`;
  const translations = [...TRANSLATIONS].sort((a, b) => Number(b.id === cur) - Number(a.id === cur)).map((x) => `<li${x.id === cur ? ' aria-current="true"' : ""}>
    <b>${esc(tlName(x))}</b><span>${esc(x.tpi ? t("credits.tpi") : x.pack ? x.by ?? t("credits.community") : t("credits.official"))}${x.fem ? ` <small>· ${esc(t("credits.feminine"))}</small>` : ""}</span>
    ${x.id === cur ? `<em>${esc(t("credits.inUse"))}</em>` : ""}</li>`).join("");

  const byAuthor = new Map<string, Set<string>>();
  // the library's icons, and the game-icons.net ones you've chosen for tokens
  const ownGame = [...state.overrides.values()].map((o) => o.icon).filter((i): i is TokenIcon => i?.source === "game-icons").map((i) => ({ icon: i.name, author: i.author }));
  // and the interface's own (team filters, the add menu)
  const ui = Object.entries(UI_ICONS).map(([icon, { author }]) => ({ icon, author }));
  // a two-state token's other state has an icon of its own
  const flips = (state.lib?.roles || []).flatMap((r) => (r.flip ? [r.flip] : []));
  for (const r of [...(state.lib?.roles || []), ...flips, ...ownGame, ...ui]) {
    if (!r.icon) continue;
    if (!byAuthor.has(r.author!)) byAuthor.set(r.author!, new Set());
    byAuthor.get(r.author!)!.add(r.icon);
  }
  const icons = [...byAuthor].sort((a, b) => b[1].size - a[1].size).map(([a, set]) => `<li><details>
    <summary><b>${esc(authorName(a))}</b> <small>${esc(t("credits.count", { n: set.size }))}</small></summary>
    <p>${[...set].sort().map((i) => link(`https://game-icons.net/1x1/${encodeURIComponent(a)}/${encodeURIComponent(i)}.html`, i)).join(", ")}</p></details></li>`).join("");

  // First the collection: what it says about itself, its credits and links in it (Markdown; a built-in one's: in the code, src/builtins.ts), and its mark
  const lang = uiLang(), built = builtIn(OWN ? OWN_ID ?? "" : "botc");
  const a = built?.about ?? (OWN ? coll.about : undefined), cname = nameIn(built?.name ?? coll.name, lang);
  const own = a?.text ? `<section class="about own-about"><h3>${esc(cname)}</h3><div class="about-md">${markdown(nameIn(a.text, lang))}</div></section>` : "";
  const mark = built?.mark ? `<div class="about-ccc about-mark"><img src="${esc(built.mark.src)}" alt="${esc(built.mark.alt)}"${built.mark.invert ? ' class="invert"' : ""}><p>${esc(nameIn(built.mark.notice, lang))}</p></div>` : "";
  const ccc = (built ? built.ccc : hasCcc(coll)) ? `<div class="about-ccc"><img src="/ccc-sleeve.png" alt="Community Created Content"><p>${esc(t("ccc.app"))}</p></div>` : "";
  // About: what the app is and how it treats your things, then the credits
  $("#creditsBody").innerHTML = `${own}${ccc}${mark}<h2 class="credits-h">${esc(t("about.title"))}</h2><section class="about"><p>${esc(t(OWN ? "own.aboutApp" : "about.what"))}</p>
      <p class="hint">${esc(t("about.data"))}</p>
      <p class="about-actions"><button type="button" class="action" data-guide>${esc(t("guide.open"))}</button></p></section>
    <h2 class="credits-h">${esc(t("credits.title"))}</h2>
    ${!OWN ? `<section><h3>${esc(t("credits.translations"))}</h3>
      <p class="hint">${esc(t("credits.translationsIntro")).replace("Villacuervos", link(VILLACUERVOS_URL, "Villacuervos")).replace("The Pandemonium Institute", link(TPI_TRANSLATIONS_URL, "The Pandemonium Institute"))}</p>
      <ul class="credit-grid">${translations}</ul></section>` : ""}
    <section><h3>${esc(t("credits.icons"))}</h3>
      <p class="hint">${esc(t("credits.iconsIntro")).replace("game-icons.net", link("https://game-icons.net", "game-icons.net"))}</p>
      <ul class="credit-icons">${icons}</ul></section>
    <section><h3>${esc(t("credits.more"))}</h3>
      <p class="hint">${esc(t("credits.moreText"))}</p>
      <p class="hint">${esc(t("credits.code"))}: ${REPO_PUBLIC ? `${link(REPO_URL, "GitHub")} · ` : ""}PolyForm Noncommercial 1.0.0 · ${link("https://ko-fi.com/rexuswolf", t("app.kofi"))}</p></section>`;
  $<HTMLDialogElement>("#credits").showModal();
}
document.addEventListener("click", (e) => { if (hit(e, "[data-about], [data-credits]")) { e.preventDefault(); drawer(false); openCredits(); } });
