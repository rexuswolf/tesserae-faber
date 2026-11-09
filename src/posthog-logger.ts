import posthog, { posthogEnabled } from "./posthog.ts";

type LogAttributes = Record<string, string | number | boolean>;

/** Sends only this integration's purpose-written application logs to PostHog. */
export const posthogAppLogger = {
  info(message: string, attributes: LogAttributes = {}) {
    if (!posthogEnabled) return;
    posthog.logger.info(message, { component: "tesserae-faber", ...attributes });
  },
};
