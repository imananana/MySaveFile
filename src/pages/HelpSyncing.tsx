import { Link, useLocation } from 'react-router-dom';
import { HelpPage, Part, Fact } from '../components/help/chrome';
import { VideoEmbed } from '../components/common/VideoEmbed';

/**
 * The import walkthrough, on YouTube (unlisted).
 *
 * ★ Empty until the video is up, and VideoEmbed renders nothing while it is —
 * so this page carries the slot with no half-built state on screen. Paste the
 * id from the share link (the part after `?v=` or after `youtu.be/`) and the
 * player appears; nothing else needs touching.
 *
 * The import modal's "How importing works" link already opens this page, so
 * filling this in is what puts the walkthrough one click from the import
 * itself — no second copy of the video anywhere.
 */
const IMPORT_VIDEO_ID = '';

/**
 * The two block types the page alternates between.
 *
 * Green is the save and the game's truth; plum is your hand. This section says
 * "here is what the game gives you", then "here is what you do with it" — the
 * two tokens already mean exactly that, so the blocks are colour-coded rather
 * than decorated.
 */
function GameBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-c-card border border-c-border rounded-xl px-5 py-4">
      <h3 className="text-2xs font-bold uppercase tracking-label text-c-green m-0 mb-3.5">{label}</h3>
      {children}
    </div>
  );
}

function YoursBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-c-secondary-soft border border-c-secondary-border rounded-xl px-5 py-4">
      <h3 className="text-2xs font-bold uppercase tracking-label text-c-secondary m-0 mb-2.5">{label}</h3>
      <div className="text-sm text-c-muted leading-relaxed">{children}</div>
    </div>
  );
}

/**
 * One entry of "what comes in": the thing, then what's inside it.
 *
 * Divided rows, thing left and detail right — the same shape as the table in
 * part 2, so the page has one list grammar rather than two. The previous go
 * mixed paired rows with full-width ones, and the alternation is what made it
 * look arbitrary: every row a different height for no reason a reader could
 * see. One row structure, repeated, is what makes a list scan.
 */
function Comes({ thing, detail }: { thing: string; detail: string }) {
  return (
    <li className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_1.25fr] gap-x-5 gap-y-0.5 py-3 border-b border-c-border last:border-b-0 last:pb-0 first:pt-0">
      <span className="text-sm font-bold text-c-text leading-snug">{thing}</span>
      <span className="text-sm text-c-dim leading-snug">{detail}</span>
    </li>
  );
}

export default function HelpSyncing() {
  // Reached from the Help index, and from a footer link in both sync modals —
  // which open a new tab, so there is no history to go back through.
  const from = (useLocation().state as { from?: string } | null)?.from;
  const back = from === '/help' ? { to: '/help', label: 'Help' } : { to: '/', label: 'Back' };

  return (
    <HelpPage
      title="How syncing works"
      backTo={back.to}
      backLabel={back.label}
      lede="You keep planning, the game keeps changing, and sync keeps the two in step."
    >
        <Part n="1" title="Your first sync">
          <p className="text-base text-c-muted leading-relaxed m-0">
            Syncing lets MySaveFile read your save file and fill your plan with{' '}
            everything that's really in your game.
          </p>

          {/* After the sentence that frames it, before the list of what lands.
              Reads as: here's what syncing is → watch it happen → here's what
              comes in. Part 1 is the right part: the video is about your FIRST
              sync, not about re-syncing. */}
          <VideoEmbed
            id={IMPORT_VIDEO_ID}
            title="Importing your Sims 4 save into MySaveFile"
            caption="One minute, start to finish."
          />

          <GameBlock label="What comes in from your save file?">
            <ul className="list-none p-0 m-0">
              <Comes thing="Lots" detail="Name, lot type, and who lives on them" />
              <Comes
                thing="Households"
                detail="The premades, the ones you've made, and every townie the game has generated"
              />
              <Comes thing="Sims" detail="Traits, skills, aspirations, careers, degrees, relationships" />
              <Comes
                thing="Clubs, Small Businesses, Holidays, Dynasties and Custom Venues"
                detail="Including members, activities, rules and the rest"
              />
              <Comes thing="Family Tree" detail="Including ancestors!" />
              <Comes
                thing="Which packs you own"
                detail="Worked out from what's in your save — correct it in Settings if we miss one"
              />
            </ul>
          </GameBlock>

          <YoursBlock label="Now what?">
            Once your save is linked, you can start planning. Create new households (or move the
            ones you have around), edit lots, plan out your clubs ahead of time. Then go build in
            game! It won't go stale — that's what re-sync is for.
          </YoursBlock>
        </Part>

        <Part n="2" title="Every re-sync">
          <p className="text-base text-c-muted leading-relaxed m-0">
            You synced, you planned, you played, and now your plan's out of date. Re-sync time!
          </p>

          <div className="bg-c-card border border-c-border rounded-xl px-5 py-4">
            <ul className="list-none p-0 m-0">
              <Comes
                thing="Refresh every time"
                detail="Households, sims, lots, clubs, small businesses, holidays, dynasties, custom venues and your family tree"
              />
              <Comes
                thing="Refresh never"
                detail="Notes, photos, statuses, mods — plus anything new you've made here, like plan-only households, custom venues and clubs. They have no counterpart in your save, so a re-sync can't see them at all."
              />
              <Comes
                thing="Refresh sometimes"
                detail="What if you changed something and the game did too? This is handled field by field. Our goal is to keep any changes you've made, unless it creates an impossibility with the way the save is now set up."
              />
            </ul>
          </div>

          <div className="bg-c-secondary-soft border border-c-secondary-border rounded-xl px-5 py-4">
            <p className="text-sm text-c-muted leading-relaxed m-0">
              For a detailed explanation, take a look at{' '}
              <Link
                to="/help/syncing/advanced"
                state={{ from: '/help/syncing' }}
                className="text-c-secondary font-semibold underline underline-offset-4 decoration-c-secondary-border"
              >
                the full merge reference
              </Link>
              .
            </p>
          </div>
        </Part>

        <Part n="3" title="Anything else">
          <Fact title="Can I undo a sync?">
            <p className="m-0">
              No. But each time you sync, a backup is created and kept for seven days. If
              you accidentally sync the wrong <code className="text-c-secondary bg-c-secondary-soft border border-c-secondary-border rounded px-1 py-px text-xs font-mono">.save</code>,
              you can pick your backup and try again.
            </p>
          </Fact>

          <Fact title="Can I pick which changes to sync?">
            <p className="m-0">
              No. We have to ingest the entire{' '}
              <code className="text-c-secondary bg-c-secondary-soft border border-c-secondary-border rounded px-1 py-px text-xs font-mono">.save</code>{' '}
              every time, or re-sync gets more and more complicated. Trust us, we tested this!
            </p>
          </Fact>

          <Fact title="Can I sync from my phone?">
            <p className="m-0">No, but your save file probably lives on your desktop anyway.</p>
          </Fact>

        </Part>
    </HelpPage>
  );
}
