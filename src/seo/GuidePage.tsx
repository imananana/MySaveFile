import { PublicShell } from './PublicShell';
import { btn } from '../components/common/btn';

/** Shape the prerender script passes in for each guide. */
export interface GuideMeta {
  title: string;
  slug: string;
  metaDescription: string;
  audience: string;
  datePublished: string;
  dateUpdated?: string;
  coverImage?: string;
  coverImageAlt?: string;
}

// Article typography for markdown-rendered HTML. Tailwind is loaded via CDN
// without the typography plugin, so we hand-roll prose styles with arbitrary
// child variants (same technique as About.tsx / LegalLayout.tsx).
const ARTICLE =
  'text-c-text leading-relaxed ' +
  '[&>p]:text-c-muted [&>p]:mb-5 [&>p]:leading-relaxed [&>p]:text-base ' +
  '[&_h2]:text-xl [&_h2]:sm:text-2xl [&_h2]:font-bold [&_h2]:text-c-text [&_h2]:tracking-headline [&_h2]:mt-10 [&_h2]:mb-3 ' +
  '[&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-c-text [&_h3]:mt-8 [&_h3]:mb-2 ' +
  '[&_a]:text-c-secondary [&_a]:font-semibold [&_a:hover]:underline ' +
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:text-c-muted ' +
  '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-5 [&_ol]:flex [&_ol]:flex-col [&_ol]:gap-2 [&_ol]:text-c-muted ' +
  '[&_li]:leading-relaxed ' +
  '[&_strong]:text-c-text [&_strong]:font-semibold ' +
  '[&_blockquote]:border-l-4 [&_blockquote]:border-c-secondary-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-c-muted [&_blockquote]:my-6 ' +
  '[&_img]:rounded-2xl [&_img]:my-6 [&_img]:w-full [&_img]:border [&_img]:border-c-border ' +
  '[&_code]:text-c-secondary [&_code]:bg-c-secondary-soft [&_code]:border [&_code]:border-c-secondary-border [&_code]:rounded [&_code]:px-1 [&_code]:py-px [&_code]:text-sm [&_code]:font-mono ' +
  '[&_hr]:border-c-border [&_hr]:my-10';

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Dates are date-only (YYYY-MM-DD = UTC midnight); render in UTC so they don't
  // slip to the previous day on build boxes west of GMT.
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** A single guide article. `bodyHtml` is markdown already rendered to HTML. */
export function GuidePage({ meta, bodyHtml }: { meta: GuideMeta; bodyHtml: string }) {
  return (
    <PublicShell>
      <article className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <a href="/guides" className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-label text-c-dim hover:text-c-text no-underline mb-8">
          ← All guides
        </a>

        {meta.audience && (
          <p className="text-2xs font-bold uppercase tracking-label-lg text-c-secondary mb-3">
            {meta.audience}
          </p>
        )}
        <h1 className="text-3xl sm:text-4xl font-bold text-c-text tracking-headline leading-[1.1] mb-3">
          {meta.title}
        </h1>
        <p className="text-2xs text-c-faint mb-8">
          {formatDate(meta.datePublished)}
          {meta.dateUpdated && meta.dateUpdated !== meta.datePublished && (
            <> · updated {formatDate(meta.dateUpdated)}</>
          )}
        </p>

        {meta.coverImage && (
          <img
            src={meta.coverImage}
            alt={meta.coverImageAlt ?? ''}
            className="w-full rounded-2xl border border-c-border mb-8"
            loading="eager"
            fetchPriority="high"
            width={1200}
            height={630}
          />
        )}

        <div className={ARTICLE} dangerouslySetInnerHTML={{ __html: bodyHtml }} />

        {/* End-of-article CTA — just the button; guides usually write their own
            closing line, so we don't repeat a full headline/body block here.
            The full GuideCTA box is still available inline via a :::cta marker. */}
        <div className="mt-12 pt-8 border-t border-c-border text-center">
          <a
            href="/register"
            className={btn('primary', { size: 'hero', elevated: true })}
          >
            Get started — it’s free
          </a>
        </div>
      </article>
    </PublicShell>
  );
}

/** The /guides index: a grid of published guides, newest first. */
export function GuideIndex({ guides }: { guides: GuideMeta[] }) {
  return (
    <PublicShell>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <header className="text-center mb-12">
          <p className="text-2xs font-bold uppercase tracking-label-lg text-c-secondary mb-3">Guides</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-c-text tracking-headline mb-3">
            Sims 4 planning guides
          </h1>
          <p className="text-sm sm:text-base text-c-muted max-w-xl mx-auto leading-relaxed">
            How-tos and ideas for planning, organizing, and showing off your Sims 4 save.
          </p>
        </header>

        {guides.length === 0 ? (
          <p className="text-center text-sm text-c-faint">New guides are on the way.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {guides.map((g) => (
              <a
                key={g.slug}
                href={`/guides/${g.slug}`}
                className="group block bg-c-card border border-c-border rounded-2xl overflow-hidden no-underline hover:border-c-accent hover:shadow-lg transition-all"
              >
                <div className="relative w-full aspect-video bg-c-panel overflow-hidden">
                  {g.coverImage ? (
                    <img
                      src={g.coverImage}
                      alt={g.coverImageAlt ?? ''}
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <img src="/3d-clay-plumbob.svg" alt="" className="h-14 w-auto opacity-40" />
                    </div>
                  )}
                </div>
                <div className="p-5">
                  {g.audience && (
                    <p className="text-2xs font-bold uppercase tracking-label text-c-secondary mb-1.5">{g.audience}</p>
                  )}
                  <h2 className="text-lg font-bold text-c-text tracking-headline leading-snug group-hover:text-c-accent transition-colors">
                    {g.title}
                  </h2>
                  <p className="text-sm text-c-dim mt-2 line-clamp-3 leading-relaxed">{g.metaDescription}</p>
                  <p className="text-2xs text-c-faint mt-3">{formatDate(g.datePublished)}</p>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </PublicShell>
  );
}
