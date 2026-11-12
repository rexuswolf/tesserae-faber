import posthog from "posthog-js";
import { BUILT_INS } from "./builtins.ts";

// the e2e tests' build ("test") sends nothing: their visits aren't anyone's
const testing = __BUILD__ === "test";
const posthogKey = testing ? undefined : import.meta.env.VITE_POSTHOG_KEY?.trim();
const posthogHost = testing ? undefined : import.meta.env.VITE_POSTHOG_HOST?.trim();
export const posthogEnabled = Boolean(posthogKey && posthogHost);

// without its key or host (a .env, see .env.example), the app works and sends nothing; in development it says so
if (!posthogEnabled) {
  if (import.meta.env.DEV && !testing) console.warn("PostHog is off: VITE_POSTHOG_KEY and VITE_POSTHOG_HOST aren't set (see .env.example).");
} else {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    defaults: "2026-08-30",
    logs: {
      serviceName: "tesserae-faber-web",
      environment: import.meta.env.MODE,
    },
    // the recordings show the 3D preview too (a few frames a second, light): what people saw while designing
    session_recording: { captureCanvas: { recordCanvas: true, canvasFps: 2, canvasQuality: "0.4" } },
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
  });
  // Which collection every event of this page happened in, to tell Clocktower's from the app's others
  // and from yours (a funnel, a download): set on each page, so the last page's never carries over.
  const id = /^\/botc(\/|$)/.test(location.pathname) ? "botc" : location.pathname.match(/^\/c\/([\w-]+)/)?.[1] ?? null;
  posthog.register({
    collection_kind: !id ? "none" : id === "botc" ? "botc" : BUILT_INS.some((x) => x.id === id) ? "built_in" : "own",
    collection_id: id,
  });
  // ?admin is the admin's door: this browser is ours, not a visitor's, from now on
  if (new URLSearchParams(location.search).has("admin")) markInternal();
}

/** This browser is the team's (the admin's): its sessions are left out of the analyses (the project's test-account filter). */
export function markInternal() {
  if (!posthogEnabled) return;
  posthog.register({ is_internal: true });
  posthog.setPersonProperties({ is_internal: true });
}

export default posthog;
