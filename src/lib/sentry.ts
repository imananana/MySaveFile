/**
 * Sentry initialization for the browser. If VITE_SENTRY_DSN is not set
 * (typical for local dev), Sentry is a silent no-op.
 */
import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Capture all errors; no performance sampling for now.
    tracesSampleRate: 0,
  });
  // Confirmation in the browser console so prod can verify the DSN took effect (G1).
  console.info(`[sentry] browser monitoring enabled (env=${import.meta.env.MODE})`);
}
