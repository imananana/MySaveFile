import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CaretRight } from '@phosphor-icons/react';
import { HelpPage } from '../components/help/chrome';
import { useAuth } from '../store/useAuth';

/**
 * Help. Standalone route — not under a save context, so it's linkable from
 * anywhere (the account menu, the landing footer).
 *
 * ★ This is an INDEX, not an article. Each topic says what the thing is and
 * where you do it, then links onward. It holds no rules, caps, limits or
 * numbers: those live on the topic pages and in `docs/product-facts/surfaces/`.
 * That discipline is the whole point — this page previously carried its own
 * facts and rotted into describing an app that no longer existed (a four-bucket
 * sync review wizard, composition counts, businesses that "don't import yet").
 * A second place to state a fact is a second place for it to go wrong.
 *
 * ★ REGISTER: software reference documentation, the same as
 * `/help/syncing/advanced`. Declarative present tense, the system as subject,
 * one idea per sentence, no em-dash asides, no rhythmic triples, no imperative
 * flourishes. The user writes the warm copy for this product — the syncing
 * guide is theirs — and this page is the plain draft. Rewriting it "nicely" is
 * putting words in their mouth, and has had to be undone twice.
 *
 * ★ It cannot deep-link into the planner. Every planner screen lives under
 * `/saves/:saveFileId/…` and this route has no save in scope, so a topic names
 * where a thing lives rather than linking to it. Only content pages are linked.
 */

/** A run of topics under one quiet label. Order is the user's and is deliberate. */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="text-2xs font-bold uppercase tracking-label text-c-dim m-0 mb-2.5">{label}</h2>
      <div className="bg-c-card border border-c-border rounded-xl overflow-hidden">{children}</div>
    </section>
  );
}

/**
 * One topic. The closed row is the title and nothing else.
 *
 * It carried a one-line summary until the user removed them: thirteen titles
 * with thirteen restatements underneath read as more to parse rather than less.
 * Every row expands, including the two that also link onward — a list where
 * some rows expand and some navigate can't be predicted from the outside.
 */
function Topic({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group border-b border-c-border last:border-b-0">
      <summary className="flex items-center gap-3 px-4 py-3.5 cursor-pointer list-none select-none hover:bg-c-panel transition-colors">
        <CaretRight
          size={13}
          weight="bold"
          className="text-c-dim shrink-0 transition-transform group-open:rotate-90"
        />
        <span className="flex-1 min-w-0 text-sm font-bold text-c-text leading-snug">{title}</span>
      </summary>
      <div className="px-4 pb-4 pl-[2.1rem] flex flex-col gap-2.5 text-sm text-c-muted leading-relaxed">
        {children}
      </div>
    </details>
  );
}


function Onward({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <p className="m-0">
      <Link
        to={to}
        state={{ from: '/help' }}
        className="text-c-secondary font-semibold underline underline-offset-4 decoration-c-secondary-border"
      >
        {children} →
      </Link>
    </p>
  );
}

const Save = () => (
  <code className="text-c-secondary bg-c-secondary-soft border border-c-secondary-border rounded px-1 py-px text-xs font-mono">
    .save
  </code>
);

export default function Help() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();

  // Help is reached from the account menu inside a plan and from the landing
  // footer, so "back to saves" was wrong for at least half of its visitors.
  //
  // Two signals are needed, because the two entry points arrive differently.
  // A router link leaves `location.key` set, but the top bar's Help entry is a
  // plain anchor and so reloads the document, which resets the key — that case
  // is caught by a same-origin referrer instead. Neither present means a cold
  // visit with nothing to step back into.
  const cameFromApp =
    location.key !== 'default' || document.referrer.startsWith(window.location.origin);
  const goBack = () => (cameFromApp ? navigate(-1) : navigate(user ? '/saves' : '/login'));

  return (
    <HelpPage
      title="Help"
      backLabel="Back"
      onBack={goBack}
    >
      <Group label="Start here">
        <Topic
          title="What is MySaveFile?"
          defaultOpen
        >
          <p className="m-0">
            MySaveFile reads a <Save /> file and creates a plan containing everything in it: lots,
            households, sims, clubs, small businesses, holidays, dynasties, custom venues, and the
            family tree. You then edit that plan. Syncing again updates it with whatever changed in
            the game.
          </p>
          <p className="m-0">
            A plan can also be created without a save file and linked to one later.
          </p>
        </Topic>
      </Group>

      <Group label="Your save file">
        <Topic
          title="Syncing & Re-Syncing"
        >
          <p className="m-0">
            The first sync fills an empty plan. Every re-sync after that applies what the game
            changed. Your own work is not touched: notes, photos, descriptions, build statuses, and
            anything you planned.
          </p>
          <Onward to="/help/syncing">How syncing works</Onward>
        </Topic>

        <Topic
          title="Merge Specifics"
        >
          <p className="m-0">
            The complete model. Which fields the save owns, which fields are yours, how a conflict
            is resolved, what happens when a plan becomes impossible, and the treatment for every
            surface in the app.
          </p>
          <Onward to="/help/syncing/advanced">Re-sync merge reference</Onward>
        </Topic>

        <Topic
          title="Saves & Backups"
        >
          <p className="m-0">
            A save file in MySaveFile is one plan, with its own worlds, lots, households, and
            photos. There is no limit on how many you create, and each holds its own link to a{' '}
            <Save /> file.
          </p>
          <p className="m-0">
            A backup is taken automatically before every sync, and a deleted plan is recoverable.
            Both appear in <strong className="text-c-text font-semibold">Deleted &amp; backups</strong>{' '}
            at the foot of your save list. A plan can also be downloaded as a{' '}
            <code className="text-c-secondary bg-c-secondary-soft border border-c-secondary-border rounded px-1 py-px text-xs font-mono">.s4plan</code>{' '}
            file, which includes every photo. This is the only way to move a plan to another
            account.
          </p>
        </Topic>
      </Group>

      <Group label="Photos">
        <Topic
          title="Inspo & Photos"
        >
          <p className="m-0">
            An inspo photo is uploaded once, tagged in your own words, and filed to a world or to a
            specific lot. The pool belongs to your account rather than to one plan, so the same photo
            is available everywhere. Filing is a tag rather than a move, so one photo can be filed
            differently in each plan.
          </p>
        </Topic>

        <Topic
          title="Showcase"
        >
          <p className="m-0">
            A showcase photo is a photo of a build you have finished. An inspo photo is a reference
            for a build that does not exist yet. A showcase photo takes a caption and a gallery
            credit, and adding one to a lot sets that lot to{' '}
            <strong className="text-c-text font-semibold">Built</strong>.
          </p>
          <p className="m-0">
            A shared plan displays showcase photos only. The public link is read-only, and the
            person you send it to does not need an account.
          </p>
        </Topic>
      </Group>

      <Group label="Planning">
        <Topic
          title="Lots & Worlds"
        >
          <p className="m-0">
            All thirty worlds and every lot in them exist in a plan from the moment it is created,
            and are shown on the game's own maps. Opening a lot allows you to rename it, change its
            type, move a household in, attach photos, and write notes.
          </p>
          <p className="m-0">
            A lot's status is{' '}
            <strong className="text-c-text font-semibold">Unplanned</strong>,{' '}
            <strong className="text-c-text font-semibold">Planned</strong>, or{' '}
            <strong className="text-c-text font-semibold">Built</strong>. It records your build
            progress rather than the game's, and only changes when you change it.
          </p>
        </Topic>

        <Topic
          title="Households"
        >
          <p className="m-0">
            Households are separated into the ones that are yours and the rest of the save, so
            generated townies and service sims stay out of the list you work in. Planned moves, funds
            targets, planned skills, and authored careers are all set here.
          </p>
          <p className="m-0">
            This surface is also the sim editor. Name, gender, lifestage, occult, traits,
            aspiration, career, degrees, skill goals, and planned moves are edited here rather than
            on the sim roster. The roster is a read-only index that can be searched, filtered, and
            sorted.
          </p>
        </Topic>

        <Topic
          title="Other Managers"
        >
          <p className="m-0">
            Each of these lists every record of its kind in your save on one screen. The game shows
            them one at a time. You can also create the ones you intend to make in-game, with the
            same detail the game holds.
          </p>
          <p className="m-0">
            A record read from your save is read-only apart from its notes. A record you create in
            MySaveFile is fully editable.
          </p>
        </Topic>
      </Group>

      <Group label="More in the planner">
        <Topic
          title="Mods & CC"
        >
          <p className="m-0">
            A Sims save records nothing about installed mods. This is the only surface with no
            connection to your <Save /> file, and every entry is one you added. Each can be marked
            required or recommended and given a link.
          </p>
          <p className="m-0">
            The list belongs to your account rather than to one plan, so it appears in all of them.
            An entry can be hidden from a particular plan without being deleted.
          </p>
        </Topic>

        <Topic
          title="Family Tree"
        >
          <p className="m-0">
            When a sim has been dead long enough, The Sims removes their record and everything
            attached to it, leaving an Unknown in the in-game tree. MySaveFile retains those sims. It
            also reads the game's hidden households, so sims that cannot be reached in the game still
            appear in the tree.
          </p>
          <p className="m-0">
            This is the only surface where family relationships can be added by hand. You can name
            an Unknown, add a parent further up the line, and record a marriage the save no longer
            holds.
          </p>
        </Topic>

        <Topic
          title="Diversity"
        >
          <p className="m-0">
            Diversity measures the whole plan at once: the spread of ages and genders, which traits
            and aspirations are used most and least, which careers and skills are represented, the
            shapes your households take, and which lot types each world is short of.
          </p>
          <p className="m-0">
            It reads the plan rather than the save, so anything you have planned is counted as
            though it has happened. No figure on this surface is stored, and nothing can be edited
            from it.
          </p>
        </Topic>

        <Topic
          title="Randomizer"
        >
          <p className="m-0">
            The randomizer generates a household. Names, ages, traits, and aspirations are drawn
            from the game's own catalogs. Individual sims can be locked and the rest rerolled, any
            sim can be renamed, and the result is saved into your plan.
          </p>
          <p className="m-0">
            It also generates a build prompt, consisting of a world, a lot type, and a lot size. A
            third mode selects an unplanned lot from your save to work on.
          </p>
        </Topic>
      </Group>

      <div className="rounded-xl border border-c-border bg-c-card p-5 text-center">
        <p className="text-sm text-c-muted leading-relaxed m-0">
          Didn't find what you were looking for?{' '}
          <a href="/about" className="text-c-secondary font-semibold hover:underline no-underline">
            Read more about the project →
          </a>
        </p>
      </div>
    </HelpPage>
  );
}
