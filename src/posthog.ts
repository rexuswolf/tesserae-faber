import posthog from "posthog-js";

const posthogKey = import.meta.env.VITE_POSTHOG_KEY?.trim();
const posthogHost = import.meta.env.VITE_POSTHOG_HOST?.trim();
export const posthogEnabled = Boolean(posthogKey && posthogHost);

if (!posthogKey) {
  if (import.meta.env.DEV) {
    throw new Error("VITE_POSTHOG_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_POSTHOG_KEY is configured");
  }
} else if (!posthogHost) {
  if (import.meta.env.DEV) {
    throw new Error("VITE_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_POSTHOG_HOST is configured");
  }
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
