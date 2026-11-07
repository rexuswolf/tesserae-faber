// Midnight Mint used to live at midnight-mint.web.app. Its old address now hands each browser's
// keepings over (scripts, picks, designs, collections: every "midnight-mint…" entry of its
// storage) to /botc here, gzipped in the address's fragment: #mm-import=<base64url>&<the rest>.
// This takes them in, without overwriting anything this browser already has here, and reloads
// with the rest of the fragment (a shared script, "#s=…", carries on). It runs before the app
// reads its storage; see legacy/index.html for the other side.
import { local } from "./services.ts";

const match = location.hash.match(/^#mm-import=([^&]*)(?:&(.*))?$/);
if (match) {
  const [, data, rest] = match;
  (async () => {
    try {
      const bytes = Uint8Array.from(atob(data.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
      const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
      const kept = JSON.parse(text) as Record<string, unknown>;
      for (const [k, v] of Object.entries(kept)) {
        if (k.startsWith("midnight-mint") && typeof v === "string" && local.get(k) == null) local.set(k, v);
      }
    } catch { /* nothing usable came: carry on as a fresh browser */ }
    // only the fragment changes, which by itself wouldn't load the page again: set it, then reload
    history.replaceState(null, "", location.pathname + location.search + (rest ? `#${rest}` : ""));
    location.reload();
  })();
}
export const handingOver = !!match;
