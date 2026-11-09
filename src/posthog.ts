import posthog from "posthog-js";

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
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
  });
}

export default posthog;
