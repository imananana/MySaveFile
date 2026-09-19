import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// Source-map upload to Sentry (G2) is gated on SENTRY_AUTH_TOKEN. Without it
// (local dev, CI without secrets), the plugin is simply not added and the build
// runs exactly as before — no upload, no failure. In prod, set:
//   SENTRY_AUTH_TOKEN  (org auth token with project:releases scope)
//   SENTRY_ORG         (Sentry org slug)
//   SENTRY_PROJECT     (Sentry project slug for the browser app)
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN
const uploadSourcemaps = Boolean(sentryAuthToken)

export default defineConfig({
  plugins: [
    react(),
    ...(uploadSourcemaps
      ? [
          sentryVitePlugin({
            authToken: sentryAuthToken,
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            // Upload the maps, then delete them so they're never served publicly.
            sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.js.map'] },
          }),
        ]
      : []),
  ],
  build: {
    // Generate maps so Sentry can symbolicate; 'hidden' keeps the
    // //# sourceMappingURL comment out of the shipped JS.
    sourcemap: uploadSourcemaps ? 'hidden' : false,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
