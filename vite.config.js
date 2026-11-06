import { VitePWA } from "vite-plugin-pwa";

// three ships as one big file, which a bundle can't split. Its source, file by file, lets the
// WebGL renderer go with the 3D preview (src/engine/viewer.js), loaded after the app starts.
export const threeBySource = { find: /^three$/, replacement: "three/src/Three.js" };

// An installable app (PWA): the app's files are kept by a service worker, so moving between its
// pages (/, /colecciones, /c/<id>, /botc) and opening it again doesn't fetch them again, and it
// works offline. A new version takes over on its own (autoUpdate) the next time a page opens.
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
    globIgnores: ["collections/*.json", "guide/**"],   // big and seldom needed: kept when first used (below)
    maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
    navigateFallback: "/index.html",   // every address is the one page (firebase.json's rewrite)
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      { urlPattern: ({ url }) => url.origin === self.location.origin && /^\/(collections|guide)\//.test(url.pathname), handler: "StaleWhileRevalidate", options: { cacheName: "app-extras" } },
      { urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com", handler: "StaleWhileRevalidate", options: { cacheName: "font-css" } },
      { urlPattern: ({ url }) => url.origin === "https://fonts.gstatic.com", handler: "CacheFirst", options: { cacheName: "fonts", expiration: { maxEntries: 40, maxAgeSeconds: 365 * 86400 }, cacheableResponse: { statuses: [0, 200] } } },
    ],
  },
});

export default {
  resolve: { alias: [threeBySource] },
  plugins: [pwa],
};
