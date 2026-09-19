/**
 * Puppeteer is a dev-only tool for rendering guide/OG cover images
 * (scripts/render-guide-covers.mjs). The deploy never renders covers, so skip
 * the ~150MB Chromium download on install — it also fails on the Railway build
 * image (no unzip/tar to extract). Puppeteer reads this file during install.
 *
 * To render covers locally on a fresh clone, install the browser once:
 *   npx puppeteer browsers install chrome
 *
 * @type {import('puppeteer').Configuration}
 */
module.exports = { skipDownload: true };
