/**
 * Sentry initialization for the server.
 *
 * Must be imported BEFORE any other module in src/index.ts so the SDK can
 * instrument http / Express auto-integrations. If SENTRY_DSN is not set,
 * Sentry is a silent no-op — safe for local dev with no DSN configured.
 */
import 'dotenv/config';
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    // Capture all errors; no performance sampling for now (free tier mindful).
    tracesSampleRate: 0,
  });
  // One-line confirmation in the boot logs so prod can verify the DSN took
  // effect (G1). Prints only the env, never the DSN value.
  console.log(`[sentry] server monitoring enabled (env=${process.env.NODE_ENV ?? 'development'})`);
} else {
  console.log('[sentry] server monitoring disabled (no SENTRY_DSN set)');
}
