import { VitePWA } from "vite-plugin-pwa";

// three ships as one big file, which a bundle can't split. Its source, file by file, lets the
// WebGL renderer go with the 3D preview (src/engine/viewer.js), loaded after the app starts.
export const threeBySource = { find: /^three$/, replacement: "three/src/Three.js" };

// An installable app (PWA): the app's files are kept by a service worker, so moving between its
// pages (/, /colecciones, /c/<id>, /botc) and opening it again doesn't fetch them again, and it
// works offline. The page itself is always asked of the network first (below), so a visit gets the latest.
const pwa = VitePWA({
  registerType: "autoUpdate",
  injectRegister: false,   // registered in src/main.ts, which also says when a new version has arrived
  manifest: {
    name: "Tesserae Faber",
    short_name: "Tesserae Faber",
    description: "Design tokens for your games and download them ready to print: in 3D or on paper.",
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#1c1a18",
    theme_color: "#1c1a18",
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/pwa/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Blood on the Clocktower", url: "/botc", icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }] },
      { name: "Colecciones", url: "/colecciones", icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }] },
    ],
  },
  workbox: {
    globPatterns: ["**/*.{js,css,html,svg,png,ttf,json,webp}"],
    globIgnores: ["collections/*.json"],   // kept when first used (below)
    maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
    // The page itself comes from the network whenever there is one, so each visit gets the latest
    // version (its files have new names, fetched then); offline, the one kept. Every address is the
    // one page (firebase.json's rewrite), so an address never visited offline falls back to it.
    navigateFallback: null,
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      { urlPattern: ({ request }) => request.mode === "navigate", handler: "NetworkFirst", options: { cacheName: "pages", networkTimeoutSeconds: 4, precacheFallback: { fallbackURL: "/index.html" } } },
      // a collection's file changes with the app (its designs): the network's first, the kept copy offline
      { urlPattern: ({ url }) => url.origin === self.location.origin && /^\/collections\//.test(url.pathname), handler: "NetworkFirst", options: { cacheName: "collections", networkTimeoutSeconds: 4 } },
      { urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com", handler: "StaleWhileRevalidate", options: { cacheName: "font-css" } },
      { urlPattern: ({ url }) => url.origin === "https://fonts.gstatic.com", handler: "CacheFirst", options: { cacheName: "fonts", expiration: { maxEntries: 40, maxAgeSeconds: 365 * 86400 }, cacheableResponse: { statuses: [0, 200] } } },
    ],
  },
});

import { execSync } from "node:child_process";
// the version a page runs, shown at the foot of About (which build a phone is on)
let BUILD = "dev";
try { BUILD = `${execSync("git rev-parse --short HEAD").toString().trim()} · ${new Date().toISOString().slice(0, 16).replace("T", " ")}`; } catch { /* no git */ }
export default {
  define: { __BUILD__: JSON.stringify(BUILD) },
  resolve: { alias: [threeBySource] },
  plugins: [pwa],
};
