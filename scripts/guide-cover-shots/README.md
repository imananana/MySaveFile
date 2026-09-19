# Guide cover screenshots (input)

Drop one screenshot per guide here, **named by the guide's `slug`**, e.g.:

```
how-to-share-sims-4-save-file.png
how-to-build-a-sims-4-save-file.png
how-to-organize-a-large-sims-4-save.png
```

Accepted extensions: `.png` `.jpg` `.jpeg` `.webp`. Aim for roughly **16:10**
(the template's screenshot slot) — a Showcase, world map, or Diversity view
works well. Then render the covers:

```
node scripts/render-guide-covers.mjs
```

For each published guide **with** a screenshot here, the script writes
`public/guides/<slug>.jpg` and sets that guide's `cover_image` +
`cover_image_alt` frontmatter. Guides without a screenshot fall back to the
site-wide branded card (`public/og-default.png`), so nothing is ever coverless.

## First-time setup

`.puppeteerrc.cjs` skips Puppeteer's Chromium download on install (so it doesn't
break / bloat the deploy). On a fresh clone, install the browser once before
rendering:

```
npx puppeteer browsers install chrome
```

This folder is input-only and is not deployed.
