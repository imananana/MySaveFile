/**
 * Build-time render entry. Compiled via `vite build --ssr` and consumed by
 * scripts/prerender.mjs. Nothing here ships to the browser.
 *
 * App pages reuse the *real* React components (Landing/About/legal) so there's
 * a single source of truth; guide pages reuse the shared PublicShell chrome.
 * Everything is rendered with renderToStaticMarkup (no hydration) — on app
 * routes the live SPA simply boots over the prefilled markup via createRoot.
 */
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';

import Landing from './pages/Landing';
import { About } from './pages/About';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsOfService } from './pages/TermsOfService';

import { GuidePage, GuideIndex, type GuideMeta } from './seo/GuidePage';
import { GuideCTA } from './seo/GuideCTA';

function atRoute(node: ReactElement, location: string): string {
  return renderToStaticMarkup(<StaticRouter location={location}>{node}</StaticRouter>);
}

export type AppPage = 'landing' | 'about' | 'privacy' | 'terms';

/** Render one of the existing public React pages to static markup. */
export function renderAppPage(page: AppPage): string {
  switch (page) {
    case 'landing': return atRoute(<Landing />, '/');
    case 'about':   return atRoute(<About />, '/about');
    case 'privacy': return atRoute(<PrivacyPolicy />, '/privacy');
    case 'terms':   return atRoute(<TermsOfService />, '/terms');
  }
}

export function renderGuideArticle(meta: GuideMeta, bodyHtml: string): string {
  return renderToStaticMarkup(<GuidePage meta={meta} bodyHtml={bodyHtml} />);
}

export function renderGuideIndex(guides: GuideMeta[]): string {
  return renderToStaticMarkup(<GuideIndex guides={guides} />);
}

/** HTML for an inline `:::cta` marker inside a guide body. */
export function renderGuideCTA(props?: { heading?: string; body?: string; label?: string; href?: string }): string {
  return renderToStaticMarkup(<GuideCTA {...props} />);
}
