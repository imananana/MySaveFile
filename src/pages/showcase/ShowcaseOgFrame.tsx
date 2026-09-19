// The og:image source. /s/:slug/og renders the save's chosen cover ALONE, in
// the exact 1200×630 box every social card uses, and nothing else — no page
// chrome, no scroll. The server screenshots this element (server/src/lib/
// ogRender.ts) and stores the PNG in R2; visitors never land here.
//
// It exists so the social card and the page share ONE cover implementation.
// Re-drawing the covers a second time in an image library would have meant
// two designs to keep in step, and the one nobody looks at is the one that
// rots — while being the one strangers see first.
//
// The page signals the screenshotter when it is safe to capture by setting
// data-og-ready on <html>; a save that isn't live sets data-og-error instead
// so the render fails fast rather than capturing an empty box.

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { deriveShowcase, resolveHero } from './derive';
import { PosterCover, PostcardCover, buildCoverData } from './Covers';
import type { ShowcasePayload } from './types';
import './showcase.css';

/** Everything the capture waits on: webfonts, then every image in the frame. */
async function framePainted(): Promise<void> {
  try { await document.fonts.ready; } catch { /* no font API — carry on */ }
  const imgs = [...document.querySelectorAll<HTMLImageElement>('.sc-ogFrame img')];
  await Promise.all(imgs.map((img) => (
    img.complete ? Promise.resolve() : new Promise<void>((done) => {
      // A crest that 404s must not hang the render — resolve either way.
      img.addEventListener('load', () => done(), { once: true });
      img.addEventListener('error', () => done(), { once: true });
    })
  )));
  // One frame for the cover's title auto-fit (a layout effect + ResizeObserver)
  // to settle at the final type size before the shutter.
  await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
}

export function ShowcaseOgFrame() {
  const { slug } = useParams<{ slug: string }>();
  const [payload, setPayload] = useState<ShowcasePayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!slug) return;
    api.getShowcaseBySlug(slug)
      .then((data) => {
        // An old slug still has a cover — follow it rather than failing.
        if ('redirectTo' in data && data.redirectTo) {
          return api.getShowcaseBySlug(data.redirectTo as string).then((d2) => setPayload(d2 as unknown as ShowcasePayload));
        }
        setPayload(data as unknown as ShowcasePayload);
      })
      .catch(() => setFailed(true));
  }, [slug]);

  useEffect(() => {
    if (failed) { document.documentElement.dataset.ogError = '1'; return; }
    if (!payload) return;
    let cancelled = false;
    framePainted().then(() => { if (!cancelled) document.documentElement.dataset.ogReady = '1'; });
    return () => { cancelled = true; };
  }, [payload, failed]);

  if (failed) return <div className="sc-ogFrame" />;
  if (!payload) return <div className="sc-ogFrame" />;

  const derived = deriveShowcase(payload);
  const { kind, heroPhoto } = resolveHero(payload);
  const cover = payload.showcase?.cover;
  const data = buildCoverData(payload, derived);

  return (
    <div className="sc-ogFrame">
      {kind === 'photo' && heroPhoto
        // photoUrl doubles the number for retina, so 800 asks the CDN for
        // 1600px — comfortably more than the 1200 the frame is wide. The
        // slack is for a source WIDER than 1.91:1 (an ultrawide screenshot),
        // where cover-fill scales to match the height and the picture has to
        // be wider than the box to fill it without softening.
        ? <img className="sc-ogPhoto" src={api.photoUrl(heroPhoto.filename, 800)} alt="" />
        : kind === 'poster'
          ? <PosterCover data={data} palette={cover?.palette ?? 'green'} />
          : <PostcardCover data={data} palette={cover?.palette ?? 'classic'} />}
    </div>
  );
}

export default ShowcaseOgFrame;
