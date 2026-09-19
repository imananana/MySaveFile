/**
 * Does the scrim actually cover the sidebar?
 *
 * Written because eyeballing a downscaled screenshot is unreliable — a dimmed
 * sidebar and a bright one look the same once the image is shrunk. This probes
 * the real DOM instead: elementFromPoint over the sidebar, the content area and
 * the far right edge must all return the SAME backdrop node.
 *
 * The classic failure it catches: a modal whose z-index looks correct but which
 * lives inside an ancestor that has its own stacking context or a transform, so
 * `fixed` stops meaning "the viewport" and the scrim covers only part of the
 * screen. Layer numbers can't tell you that; only the rendered tree can.
 */
/**
 * The same question asked of a whole PAGE instead of one open modal.
 *
 * probeBackdrop can only judge an overlay you managed to open, and a lot of
 * them are three clicks deep. This scans for the actual cause instead: an
 * element with a transform, filter, backdrop-filter, perspective, contain or
 * will-change becomes the containing block for its fixed descendants, so a
 * scrim inside one is clipped to that element's box no matter what its z-index
 * says. If a page has no such element holding an overlay, nothing mounted in it
 * can be trapped — which covers the modals you never got around to opening.
 *
 * Returns { traps, viewport }. A trap only matters when `clips` (smaller than
 * the viewport) and `hasFixedChild` are both true.
 */
export function scanFixedTraps(page) {
  return page.evaluate(() => {
    const traps = [];
    for (const el of document.querySelectorAll('body *')) {
      const s = getComputedStyle(el);
      const why = [];
      if (s.transform && s.transform !== 'none') why.push('transform');
      if (s.filter && s.filter !== 'none') why.push('filter');
      if (s.backdropFilter && s.backdropFilter !== 'none') why.push('backdrop-filter');
      if (s.perspective && s.perspective !== 'none') why.push('perspective');
      if (/paint|layout|strict|content/.test(s.contain || '')) why.push('contain');
      if (/transform|filter|perspective/.test(s.willChange || '')) why.push('will-change');
      if (!why.length) continue;
      const r = el.getBoundingClientRect();
      traps.push({
        tag: el.tagName.toLowerCase(),
        cls: (typeof el.className === 'string' ? el.className : '').slice(0, 70),
        why: why.join(' + '),
        box: [Math.round(r.width), Math.round(r.height)],
        clips: r.width < innerWidth - 1 || r.height < innerHeight - 1,
        hasFixedChild: !!el.querySelector('.fixed.inset-0'),
      });
    }
    return { traps, viewport: [innerWidth, innerHeight] };
  });
}

export function probeBackdrop(page) {
  return page.evaluate(() => {
    const bds = [...document.querySelectorAll('.fixed.inset-0')]
      .filter((d) => /bg-black|backdrop-blur/.test(d.className) || /rgba\(/.test(d.style.backgroundColor));
    if (!bds.length) return { ok: false, why: 'no backdrop found' };
    const bd = bds[bds.length - 1];
    const r = bd.getBoundingClientRect();
    const pts = [[60, innerHeight / 2], [innerWidth / 2, 40], [innerWidth - 12, innerHeight - 12], [12, 12]];
    const hits = pts.map(([x, y]) => document.elementFromPoint(x, y));
    const covered = hits.every((h) => h && (h === bd || bd.contains(h)));
    return {
      ok: covered && r.width >= innerWidth && r.height >= innerHeight,
      rect: [Math.round(r.width), Math.round(r.height)],
      viewport: [innerWidth, innerHeight],
      uncovered: pts.filter((_, i) => !(hits[i] && (hits[i] === bd || bd.contains(hits[i]))))
                    .map(([x, y]) => `${Math.round(x)},${Math.round(y)}`),
    };
  });
}
