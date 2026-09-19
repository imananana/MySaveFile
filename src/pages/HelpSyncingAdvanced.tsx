import { useLocation } from 'react-router-dom';
import { CaretRight } from '@phosphor-icons/react';
import { HelpPage, Part, Fact, Row, Table, B } from '../components/help/chrome';

/**
 * The full merge reference — everything `/help/syncing` deliberately doesn't say.
 *
 * ★ Transcribed from marketing's re-sync merge reference, which is derived from
 * the spec rather than from live app copy. Three kinds of thing were stripped on
 * the way in, and must stay stripped: internal provenance (which PRODUCT_FACTS
 * revision it companions, that the public help copy is a "known liability"),
 * citations to documents no reader can open (`do-not-claim §2`, `glossary §2`),
 * and the copy-desk style guide, whose substance survives as "Terminology"
 * because Import ≠ Sync ≠ Restore genuinely helps a reader.
 *
 * ★ REGISTER: software reference documentation, per the Google developer
 * documentation and Microsoft writing style guides. Declarative present tense,
 * active voice, the system as subject. One idea per sentence. One term per
 * concept, every time. Headings are plain noun phrases. No meta-commentary, no
 * reassurance, no em-dash asides carrying half the meaning, no contractions.
 *
 * This deliberately does NOT match `/help/syncing`, which is warm and written in
 * the user's own voice. Two pages, two jobs. Do not unify them.
 *
 * If the source document is revised, re-check this page against it — and against
 * `docs/product-facts/surfaces/*.md`, which is what the sibling page is written
 * from. A claim here that contradicts a surface sheet is a bug in one of them.
 */

/** A surface's treatment. Collapsed by default: sixteen open at once is a wall,
 *  and nobody arrives wanting all sixteen. */
function Surface({ name, note, children }: { name: string; note?: string; children: React.ReactNode }) {
  return (
    <details className="group bg-c-card border border-c-border rounded-xl overflow-hidden">
      <summary className="flex items-center gap-2.5 px-4 py-3 cursor-pointer list-none select-none hover:bg-c-panel transition-colors">
        <CaretRight
          size={13}
          weight="bold"
          className="text-c-dim shrink-0 transition-transform group-open:rotate-90"
        />
        <span className="text-sm font-bold text-c-text">{name}</span>
        {note && <span className="text-xs text-c-dim">{note}</span>}
      </summary>
      <div className="px-4 pb-4 pt-1 pl-[2.1rem] flex flex-col gap-2 text-sm text-c-muted leading-relaxed border-t border-c-border">
        {children}
      </div>
    </details>
  );
}

/** One labelled line inside a surface. The label is a term, not emphasis. */
function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="m-0">
      <strong className="text-c-text font-semibold">{label}</strong> {children}
    </p>
  );
}

const Save = () => (
  <code className="text-c-secondary bg-c-secondary-soft border border-c-secondary-border rounded px-1 py-px text-xs font-mono">
    .save
  </code>
);

export default function HelpSyncingAdvanced() {
  // This page has two parents: the syncing guide links to it, and so does the
  // Help index. Back has to mean the page you actually came from. A direct
  // visit has no state, and the guide is the right home for that case.
  const from = (useLocation().state as { from?: string } | null)?.from;
  const back = from === '/help'
    ? { to: '/help', label: 'Help' }
    : { to: '/help/syncing', label: 'How syncing works' };

  return (
    <HelpPage
      title="Re-sync merge reference"
      backTo={back.to}
      backLabel={back.label}
      lede={
        <>
          This page documents the complete merge model: every rule, every surface, and every field.
          It is reference material. You do not need it to use MySaveFile.
        </>
      }
    >
      <Part n="1" title="Overview">
        <p className="text-base text-c-muted leading-relaxed m-0">
          Sync is one-directional. MySaveFile reads your <Save /> file and writes to your plan. It
          never writes to the <Save /> file.
        </p>
        <p className="text-sm text-c-muted leading-relaxed m-0">
          Each field in a plan has one owner: the save, or you. A re-sync updates save-owned fields.
          It does not change fields you own. If you edit a save-owned field and the game does not
          change the same field, your value is kept.
        </p>
      </Part>

      <Part
        n="2"
        title="Field ownership"
        lede="A plan contains three categories of data. Every surface in MySaveFile is an instance of one of them."
      >
        <Table>
          <Row
            when={<><B>Save-backed field</B> on a save-backed record: household members, sim traits, lot type, club members</>}
            then="Merged on every re-sync. The save's value is applied unless you edited the field and the game did not change it."
          />
          <Row
            when={<><B>Field you authored</B>: notes, descriptions you wrote, funds target, planned move, planned skill, planned career, portraits, inspo, tags</>}
            then="Never read, compared, counted, or overwritten."
          />
          <Row
            when={<><B>Record you created</B>: a club, holiday, business, dynasty, venue, household, or sim created in MySaveFile; a randomized household; a named move destination</>}
            then="Not visible to the comparison. It has no counterpart in the save. It is never updated and never removed for being absent."
          />
        </Table>
        <p className="text-sm text-c-muted leading-relaxed m-0">
          Records you created have two exceptions. A record can lose an attachment that the save
          makes impossible, described in section 6. A plan-only household can be matched to a real
          household, described in section 7.
        </p>
        <Fact title="Scope of the guarantee">
          <p className="m-0">
            An edit is kept when the game has not changed the same field. When the game has changed
            that field, the save's value replaces yours.
          </p>
        </Fact>
      </Part>

      <Part
        n="3"
        title="Merge resolution"
        lede="Each sync stores a snapshot of the save's values for every record. The next re-sync compares three values for each save-backed field."
      >
        <Table>
          <Row when={<><B>Plan</B></>} then="The current value in your plan." />
          <Row when={<><B>Snapshot</B></>} then="The save's value at the last sync." />
          <Row when={<><B>Current</B></>} then="The save's value now." />
        </Table>

        <Fact title="Resolution rules">
          <ul className="list-disc pl-5 flex flex-col gap-1.5 m-0">
            <li>Plan and current both match the snapshot: no change is made.</li>
            <li>Plan differs from the snapshot and current matches it: your value is kept.</li>
            <li>Current differs from the snapshot: the save's value is applied, including when you also edited the field.</li>
          </ul>
        </Fact>

        <Fact title="Resolution is per field, not per record">
          <p className="m-0">
            A household you renamed whose members changed in the game keeps your name and receives
            the new members. A lot you renamed whose type the game changed keeps your name and
            receives the new type. A change to one field does not revert the other fields on the
            same record.
          </p>
        </Fact>

        <Fact title="Counts do not indicate replacement">
          <p className="m-0">
            The count on the sync screen reports the number of records that changed. It does not
            indicate that a record was replaced.
          </p>
        </Fact>

        <Fact title="Goal fields are excluded from the comparison">
          <p className="m-0">
            Planned career, planned skill, planned move, and funds target are stored twice: the
            save's value, and your goal. The comparison reads the save's value only. A goal is
            therefore never treated as a change made by the game, and is never overwritten by a
            later re-sync.
          </p>
          <p className="m-0">
            Where the app displays one of these fields, it resolves to a single value: your goal if
            you set one, otherwise the save's value.
          </p>
          <p className="m-0">
            Planned skill is additive. Planning Guitar does not remove Cooking.
          </p>
        </Fact>
      </Part>

      <Part
        n="4"
        title="Comparison methods"
        lede="Save-backed data is applied in one of two ways. Both reach the count."
      >
        <Table>
          <Row
            when={<><B>Compared field by field</B></>}
            then="Each field is resolved individually. Edits the game did not change are kept."
          />
          <Row
            when={<><B>Applied whole</B></>}
            then="The entire set is replaced with the save's values. The record counts as changed once."
          />
        </Table>
        <p className="text-sm text-c-muted leading-relaxed m-0">
          Identity fields are compared field by field: name, icon, description, owner, head,
          members, and hangout lot. Rule sets are applied whole: requirements, activities, leader,
          invite setting, traditions, day off, decorations, alliances, rivalries, and schedules.
          Section 9 lists the method for each surface.
        </p>
      </Part>

      <Part n="5" title="Silent refresh">
        <Fact title="Fields excluded from all counts">
          <p className="m-0">
            Skills, household funds, and cause of death are updated on every re-sync and never
            appear in a count. These values change during normal play. Counting them would report
            every record on every re-sync.
          </p>
        </Fact>
        <Fact title="Effect on the sync screen">
          <p className="m-0">
            A re-sync with no counted changes reports <em>No new households, sims or lots</em>,
            followed by <em>Skills, careers, funds and relationships refresh too</em>. A count of
            zero does not mean that no data changed.
          </p>
        </Fact>
      </Part>

      <Part
        n="6"
        title="Constraint conflicts"
        lede="A plan can specify a state that the save makes impossible. In each case the record is retained and only the impossible attachment is removed. No message is shown."
      >
        <Table>
          <Row
            when="A household occupies a lot you assigned to a business or venue"
            then="The lot reverts to the save's type. The business or venue is retained without a lot."
          />
          <Row
            when="The game rezones a lot occupied by a business to an incompatible type"
            then="The business is removed from the lot."
          />
          <Row
            when="The game converts a club's hangout to a rental, vacation rental, or university housing"
            then="The club's hangout is cleared."
          />
          <Row
            when="The game rezones a custom venue's lot away from Custom Venue"
            then="The venue retains its schedule and loses the lot."
          />
        </Table>
        <p className="text-sm text-c-muted leading-relaxed m-0">
          These rules apply to records you created. A business created in MySaveFile releases its
          lot under the same conditions. Lot type conflicts are resolved first, so a lot type you
          set is not treated as a rezone performed by the game.
        </p>
      </Part>

      <Part
        n="7"
        title="Household adoption"
        lede="A plan-only household can become a real household in the game. The re-sync matches the two records and merges them instead of creating a duplicate."
      >
        <Fact title="Match conditions">
          <p className="m-0">
            The household is matched when your planned movers appear together in a new household, or
            when a new household appears on the lot you assigned.
          </p>
        </Fact>
        <Fact title="Merge result">
          <p className="m-0">
            Your record becomes the matched household. It retains its identity in MySaveFile, its
            notes, and its funds target. It receives the save's name, members, lot, and description.
          </p>
        </Fact>
        <Fact title="Sims created in the household">
          <p className="m-0">
            Sims you created in the household are deleted and replaced by the save's roster. Notes
            on the household are retained. Notes on the deleted sims are not. A family link you drew
            to a deleted sim is removed with that sim.
          </p>
        </Fact>
        <Fact title="Conditions">
          <p className="m-0">
            Adoption runs only on a save you have re-synced before, and only against households that
            are new in that re-sync. Movers joining a household already present in the plan do not
            trigger it. No count or message is shown.
          </p>
        </Fact>
        <Fact title="Unused move destinations">
          <p className="m-0">
            A plan-only household with no members and no planned moves referencing it is deleted
            during the re-sync. A household you created manually retains at least one sim, so this
            applies only to name-only destinations.
          </p>
        </Fact>
      </Part>

      <Part n="8" title="Global rules">
        <Fact title="Planned moves">
          <p className="m-0">
            A planned move is cleared when the sim changes household in the game, regardless of
            which household the sim joined. It is not cleared when the sim is absent from the save,
            and it is never cleared on a first sync.
          </p>
        </Fact>
        <Fact title="Backups">
          <p className="m-0">
            The plan is copied to Deleted &amp; backups before any data is written. Backups are
            retained for seven days. If the backup cannot be created, the re-sync stops. The
            first-link <em>Duplicate this planner first</em> option does not create a backup,
            because it does not write to the original plan.
          </p>
        </Fact>
        <Fact title="Scope and history">
          <p className="m-0">
            A re-sync applies all changes. There is no selection step and no approval step. No
            history is recorded. Each record stores only the save's most recent values, so previous
            values are not retained. A count reports the number of records that changed, not which
            fields changed.
          </p>
        </Fact>
        <Fact title="Save file linkage">
          <p className="m-0">
            The filename and the save's name are recorded again on every re-sync, so an in-game{' '}
            <em>Save As</em> is followed. A plan takes the save's name on the first link, and
            afterwards until you rename the plan.
          </p>
        </Fact>
        <Fact title="Pack detection">
          <p className="m-0">
            Each re-sync adds the packs it detects to your account. Packs are never removed.
            Detection is account-wide, so re-syncing one plan changes the content offered in every
            plan. Pack ownership does not affect what a re-sync adds, updates, removes, or releases.
          </p>
        </Fact>
        <Fact title="Household classification">
          <p className="m-0">
            A premade household you have played, edited, or moved sims into is reclassified from
            Rest of Town to Yours.
          </p>
        </Fact>
        <Fact title="Season length">
          <p className="m-0">
            The save's season length is applied only when it has changed since the last re-sync.
          </p>
        </Fact>
        <Fact title="Partial failure">
          <p className="m-0">
            A re-sync that fails partway is not rolled back. The number of changes that did not
            apply is reported. Applied changes are retained. Running the re-sync again retries the
            remainder.
          </p>
        </Fact>
        <Fact title="First link">
          <p className="m-0">
            The <em>Your save is linked</em> confirmation appears on a first link only. Routine
            re-syncs do not display it.
          </p>
        </Fact>
      </Part>

      <Part
        n="9"
        title="Surface reference"
        lede="Each surface is either read from your save or authored in MySaveFile. This section lists the treatment for each. Sims are edited on the Households surface, so the per-field sim merge is documented there."
      >
        <Surface name="Sims" note="roster only — sims are edited in Households">
          <Line label="What this surface is:">
            a read-only index of every active sim. The only fields you can set here are notes and
            the portrait. Names, gender, lifestage, occult, traits, aspiration, career, degrees,
            skill goals, and planned moves are all edited in the per-sim editor inside Households,
            and their merge behaviour is documented under that surface.
          </Line>
          <Line label="Which sims appear:">
            active sims only. A plan holds more sim records than the roster shows, because the
            family tree keeps records the save has released: tree-only, where the save still holds
            the record but no household MySaveFile tracks; culled, where the record is gone; and
            stub, an ancestor the game names but does not store. None appear in the table. The
            detail panel opens all of them and states which they are.
          </Line>
          <Line label="Sim absent from the save:">
            the sim is deleted unless the family tree requires the record. A ghost, a sim another
            sim is related to, and a sim already linked in the tree are moved off the roster into
            the tree instead of being deleted. A sim who returns is promoted back onto the roster
            rather than duplicated, and keeps their notes and portrait.
          </Line>
          <Line label="New sims:">a sim born since the last re-sync is added without any action from you.</Line>
          <Line label="Never modified:">notes and the portrait.</Line>
          <Line label="Sim created in MySaveFile:">
            not visible to the comparison. Never updated and never removed. This is the planned half
            of the roster count.
          </Line>
        </Surface>

        <Surface name="Households" note="also the sim editor">
          <Line label="Household fields compared field by field:">name, members, description, and lot.</Line>
          <Line label="Sim fields compared field by field:">
            first name, last name, gender, lifestage, species, pet subtype, pet breed, occult, ghost
            state, cause of death, traits, aspiration, university enrolment, career, and which
            household the sim belongs to. Each is resolved independently, so a sim you renamed who
            gained a trait in the game keeps your name and receives the trait.
          </Line>
          <Line label="Updated without a count:">household funds and sim skills.</Line>
          <Line label="Never modified:">
            notes, showcase photos, funds targets, planned moves, planned skills, authored careers,
            and every household or sim created in MySaveFile.
          </Line>
          <Line label="Fields stored twice:">
            planned career, planned skill, planned move, and the funds target. The save's value is
            kept alongside your goal so the editor can offer a revert. The comparison reads the
            save's value only. Every other surface resolves them to a single value.
          </Line>
          <Line label="Deleting a household:">
            members that appear in any family relationship are retained as tree-only records.
            Remaining members are deleted. Planned moves referencing the household are cleared.
          </Line>
          <Line label="Portraits:">
            Sync photos reads the game's thumbnail cache and applies to matched households only, so
            a smaller cache cannot clear portraits it does not contain. A matched household's
            existing portrait is replaced.
          </Line>
        </Surface>

        <Surface name="Lots and world view">
          <Line label="Compared field by field:">
            the lot's name and its type. These are the only two fields a re-sync reads.
          </Line>
          <Line label="Never modified:">
            status, notes, the description, inspo photos, and showcase photos. Status is your build
            progress, not the game's, so a lot the save reports as occupied still reads Unplanned
            until you change it.
          </Line>
          <Line label="Never synced:">
            size, neighbourhood, map art, and pin positions. These are built into the app and are
            identical in every plan.
          </Line>
          <Line label="Set by another surface:">
            the occupant follows the household merge, the club hangout follows the club merge, and
            the business follows the business reconciliation. The lot displays them; it does not
            resolve them.
          </Line>
          <Line label="Constraint conflicts:">
            a lot you set to Small Business Venue that the save reports as occupied takes the save's
            type. A club loses a hangout the save reports as a Rental, Vacation Rental, or
            University Housing. A business is removed from a lot occupied by a household other than
            its owner, or from a lot rezoned to a type a business cannot occupy.
          </Line>
          <Line label="Occupancy limits:">
            a re-sync is the one case that overrides them. The save is authoritative, so a household
            the save places on a lot is moved in regardless of capacity, and a household you had
            assigned there is displaced.
          </Line>
          <Line label="Lot inventory:">
            all 402 lots are created when the plan is created. A re-sync never adds or removes a lot.
          </Line>
        </Surface>

        <Surface name="Clubs">
          <Line label="Compared field by field:">name, icon, description, members, and hangout lot.</Line>
          <Line label="Applied whole:">
            leader, requirements, activities, invite setting, and general-venue hangout. Each still
            reaches the count.
          </Line>
          <Line label="Never modified:">notes.</Line>
          <Line label="Members:">
            a member the save no longer contains is removed from the club. On a first import, a
            member that cannot be placed is omitted without a message, so a club can arrive with
            fewer members than the game shows.
          </Line>
          <Line label="Club created in MySaveFile:">
            never updated, renamed, or removed, with one exception. If the lot you assigned as its
            hangout becomes a Rental, Vacation Rental, or University Housing, the hangout is cleared.
          </Line>
          <Line label="Counting:">
            one per club, regardless of how many fields changed. Clubs appear on the sync screen as
            a single figure covering new, changed, and disbanded clubs together.
          </Line>
        </Surface>

        <Surface name="Small businesses">
          <Line label="Compared field by field:">name, icon, description, and owner.</Line>
          <Line label="Applied whole:">
            employees, customer requirements, activities, fee mode, price modifier, renown,
            alignment, and perk points. Each still reaches the count.
          </Line>
          <Line label="Locations are reconciled, not applied:">
            the lot set is compared against the lots the save reported at the previous re-sync. A
            lot the game added is adopted. A lot the game removed is dropped. A lot you added that
            the game has never reported is retained, so a planned location survives every re-sync.
          </Line>
          <Line label="Write ordering:">
            the reconciled locations and the record of what the save reported are written in one
            operation, so a re-sync that fails partway leaves the locations for the next re-sync to
            resolve. This matters more here than elsewhere, because a business read from the save
            has no location controls on the page.
          </Line>
          <Line label="Constraint conflicts:">
            a household moving onto the lot, with the owner not among its members, releases the lot,
            and a lot MySaveFile had typed as a Small Business Venue takes back the type the save
            reports. A lot rezoned to a type a business cannot occupy is released even if nobody
            lives there. Both apply to businesses created in MySaveFile.
          </Line>
          <Line label="Never modified:">
            notes. A business created in MySaveFile is otherwise not visible to the comparison.
          </Line>
        </Surface>

        <Surface name="Custom venues">
          <Line label="Identity:">
            a venue read from the save is identified by its lot rather than by a game id. One lot
            holds one venue.
          </Line>
          <Line label="Compared against the save:">
            the venue's name, its roles, and its time slots — the full schedule.
          </Line>
          <Line label="Order is normalised before comparison.">
            The game rewrites roles, requirements, requirement values, activities, slots, and
            per-slot lists in a different order on each save. Both sides are sorted into a fixed
            order first, so identical content compares as unchanged. Without this, every re-sync
            would report every venue as changed.
          </Line>
          <Line label="Never modified:">notes.</Line>
          <Line label="Venue created in MySaveFile:">
            never updated, renamed, or removed. This is an explicit guard rather than a consequence
            of the ownership model: identity is the lot, and a venue you built can hold one, so
            without the guard every re-sync would read it as deleted in the game.
          </Line>
          <Line label="Constraint conflicts:">
            if you assign a venue to a lot and then build a venue on that lot in the game, the venue
            from the save takes the lot and yours is retained without one. The same applies when the
            game rezones the lot away from Custom Venue. Lot type is resolved first, so a lot you
            converted to Custom Venue is not treated as a rezone performed by the game.
          </Line>
          <Line label="A venue you planned and then built in the game arrives as a second record.">
            Nothing identifies the venue you built as the one you designed, so the two are not
            merged. Both remain until you delete one.
          </Line>
          <Line label="Preset library:">
            replaced whole on every re-sync, outside the review and without a count. Presets read
            from the save are replaced. Presets you created are retained. Maxis presets are a
            built-in catalog of 11 schedules and 36 roles and are not stored.
          </Line>
          <Line label="Removing a venue read from the save is reversed by the next re-sync,">
            because the save still contains it. It returns without the notes you had written.
          </Line>
        </Surface>

        <Surface name="Holidays">
          <Line label="Compared field by field:">name and icon.</Line>
          <Line label="Placement is compared as the full set of dates,">
            one per season length, rather than as a single day. A plan drawn at a different season
            length from the save is therefore not reported as changed.
          </Line>
          <Line label="Applied whole:">
            traditions, day off, decoration theme, and the day the holiday falls on at your plan's
            season length. Each still reaches the count.
          </Line>
          <Line label="Naming:">
            the game stores a name only for a holiday you have edited or created. Winterfest, Love
            Day, Harvestfest, and New Year&rsquo;s Eve therefore arrive as dates and are named from
            a table MySaveFile keeps. Every other holiday carries its own name in the save, and a
            stored name always takes precedence, including names in other languages.
          </Line>
          <Line label="Season length:">
            the save's length is applied only when it has changed since the last re-sync, so a
            length you set by hand survives routine re-syncs. When the two differ, the rail states
            both.
          </Line>
          <Line label="Date conflicts:">
            a holiday read from the save owns its date. A holiday you created on the same date is
            moved to Unassigned and marked <em>Conflict with &lt;name&gt;</em>, retaining its day and
            its settings. The same applies to a holiday whose day no longer exists after you shorten
            the seasons. Nothing is deleted, and freeing the day or lengthening the season restores
            it.
          </Line>
          <Line label="Never modified:">
            notes. A holiday created in MySaveFile is otherwise not visible to the comparison.
          </Line>
        </Surface>

        <Surface name="Dynasties">
          <Line label="Compared:">
            description, head, members with their roles and succession order, ideals, skills, crest,
            prestige, unity, and perks.
          </Line>
          <Line label="Applied whole:">name, alliances, and rivalries.</Line>
          <Line label="The name is compared against the save directly,">
            not against the snapshot. A rename that failed to apply in an earlier re-sync therefore
            corrects itself on the next one.
          </Line>
          <Line label="Ordering and matching:">
            members, ideals, skills, and perks are sorted into a fixed order before comparison,
            because the game rewrites those lists between saves. Members are matched by the sim's
            game id, not by name, so a sim renamed in the game is not read as a different person.
          </Line>
          <Line label="Roles are read from each sim's traits,">
            so an imported dynasty can show two Heirs. The value is displayed as read and is not
            corrected.
          </Line>
          <Line label="Members:">a member the save no longer contains is removed from the dynasty.</Line>
          <Line label="Never modified:">
            notes. A dynasty created in MySaveFile has no game id, so nothing in the save can match
            it and it is not visible to the comparison.
          </Line>
        </Surface>

        <Surface name="Family tree">
          <Line label="Rebuild:">
            the full set of parent, marriage, engagement, partnership, and ex-relationship links is
            discarded and rebuilt from the save on every re-sync. The walk goes outward from your
            sims through parents, children, and partners, and includes sims in the game's hidden
            households. References it cannot resolve become Unknown records.
          </Line>
          <Line label="Premade ancestors:">
            a deceased premade ancestor has no record of their own in the save. The save names a
            template, and the name, gender, cause of death, and portrait are read from the game's
            ancestor data on every re-sync.
          </Line>
          <Line label="Never modified:">
            a named Unknown, an ancestor you created, and a relationship you set by hand. The save's
            own version of a relationship is retained beneath your correction, so clearing yours
            restores the original exactly.
          </Line>
          <Line label="Removed sims:">
            a culled sim the tree requires is retained and marked{' '}
            <em>Preserved — no longer in the save</em>, and is never offered for deletion. A sim who
            returns rejoins in place. A sim who leaves and matters to no lineage is removed.
          </Line>
          <Line label="Scope:">
            humans only. A pet is never an ancestor and never a stub. A household you created has no
            lineage and never becomes a family line, because the test is on the sim's own record in
            the save rather than on their household. A save-backed sim you move into a household you
            built therefore keeps their full lineage.
          </Line>
          <Line label="Deleting:">
            deleting a household retains related members as tree-only records. Deleting a sim also
            deletes that sim's links, including links you set by hand.
          </Line>
          <Line label="Counting:">
            applied automatically and reported as a single figure, <em>N family tree updates</em>. A
            plan imported before the tree existed receives its whole tree on the next re-sync.
          </Line>
          <Line label="Saves written before the February 2026 game patch">
            contain no premade ancestors. The tree stops at whoever the living sims record. Opening
            the save in the game and saving once populates it.
          </Line>
        </Surface>

        <Surface name="Diversity">
          <Line label="Storage:">
            nothing on this surface is stored, compared, or snapshotted. Every figure is derived at
            view time from households, sims, and lots. A re-sync changes these figures only by
            changing their inputs.
          </Line>
          <Line label="Source:">
            the plan, not the save. A sim planned into a career counts under that career and not
            their current one. A planned skill counts as represented. A sim with a planned move
            counts in the household and the world they are moving to. One value per sim.
          </Line>
          <Line label="Two figures read the save instead:">
            anything keyed on a level, such as Most maxed, counts built skills, because a level
            cannot be planned. Median funds uses a household's target only while the save has not
            reached it.
          </Line>
          <Line label="Pack ownership narrows the audited pools,">
            and is recorded per account rather than per plan. A world switched off for this plan is
            also excluded.
          </Line>
        </Surface>

        <Surface name="Randomizer">
          <Line label="Ownership:">
            every record the randomizer creates is authored. A rolled household and its sims carry
            no record in the save, so they are never counted, updated, or removed for being absent.
          </Line>
          <Line label="Family links:">
            none are written, so a rolled household never appears in the family tree.
          </Line>
          <Line label="Pack ownership is read at roll time only.">
            Trait and aspiration pools are filtered to the packs you own at that moment, and the
            result is stored as a plain value. Switching a pack off later does not change a sim
            already rolled.
          </Line>
          <Line label="Three effects a re-sync can have, all without a message:">
            a rolled household you assigned a lot to, and then built in the game, is matched and
            merged — it keeps its identity, notes, and funds target, takes the save's name, members,
            and lot, and its created sims are deleted. A rolled household emptied of sims is
            deleted. A rolled household whose lot is taken by a household from the save is retained
            without a lot.
          </Line>
          <Line label="Funds:">
            the generated figure is a planning value and is retained until the household becomes
            real. A household the save contains has its funds updated on every re-sync.
          </Line>
        </Surface>

        <Surface name="Home">
          <Line label="Source:">
            nothing on this surface mirrors the save. The four totals are derived from lot statuses,
            and status never syncs, so percent built and percent planned move only when you change a
            lot.
          </Line>
          <Line label="Disabled worlds:">never read or written by a re-sync.</Line>
          <Line label="Plan name:">
            takes the save's name on the first link and follows an in-game rename afterwards, but
            only while the two still match. Renaming the plan here is permanent.
          </Line>
          <Line label="Linked file:">
            re-pointed on every re-sync to the file you selected. Last synced is stamped at the end
            of every successful re-sync.
          </Line>
          <Line label="Worlds:">
            all thirty exist in every plan. A re-sync never adds or removes one. Pack detection can
            unlock a world and can never lock one.
          </Line>
        </Surface>

        <Surface name="Inspo">
          <Line label="Ownership:">
            the image, its tags, its filing, and its hidden state are all authored. A re-sync never
            reads, writes, counts, or clears any of them.
          </Line>
          <Line label="Lot filing survives replay.">
            A re-sync identifies each lot by EA's permanent lot id, falling back to the name only
            when the id is missing or when two units in one building cannot be distinguished. A
            photo's own filing key is stored as world plus the lot's catalogue name, which is not
            what the match runs on. Renaming a lot in the game, demolishing and rebuilding it, or
            moving households in and out therefore leave filed photos in place.
          </Line>
          <Line label="Switching a world or a pack off">
            does not unfile anything. The pool continues to list a disabled world for as long as it
            holds photos.
          </Line>
          <Line label="The pool is account-wide,">
            so plan management behaves differently here. Moving a plan to the trash changes nothing.
            Deleting a plan permanently removes that plan's filing and hidden marks and retains the
            photos in the pool. A duplicate inherits the filing and points at the same library. A
            reset re-creates lots under the same identities, so lot-filed photos return. A{' '}
            <code className="text-c-secondary bg-c-secondary-soft border border-c-secondary-border rounded px-1 py-px text-xs font-mono">.s4plan</code>{' '}
            carries filing and hidden marks. A restore re-creates the photos in the restoring
            account's own pool rather than sharing them.
          </Line>
        </Surface>

        <Surface name="Mods and CC">
          <Line label="Source:">
            a Sims save records nothing about installed mods, so every entry here is typed by you. A
            re-sync never reads, writes, counts, or clears any of it.
          </Line>
          <Line label="The list belongs to your account, not to a plan.">
            Deleting a plan, resetting a plan, or syncing a different save file into one all leave
            every entry, flag, and hidden state unchanged. Deleting a plan drops only that plan's
            hidden marks.
          </Line>
          <Line label="Copying between plans:">
            a backup, a duplicate, and the automatic pre-sync backup all carry the list and
            de-duplicate by name and kind, so restoring twice or re-syncing repeatedly never
            multiplies it. An entry without a name is omitted, because the name is the match key,
            and a renamed entry restores as a second entry.
          </Line>
        </Surface>

        <Surface name="Packs">
          <Line label="When ownership is written:">
            at the end of a sync or a first import, on pressing the button rather than on selecting
            the file. Cancelling at either review leaves the list unchanged.
          </Line>
          <Line label="Detection adds only,">
            unioned across every import, so no sync can remove a pack. The first import still
            narrows the app: with nothing detected the whole library is offered, and the first save
            you bring in reduces that to the packs it proves.
          </Line>
          <Line label="Evidence:">
            a sim's traits, aspiration, or current career; a sim's occult state, or a cat, dog, or
            horse; the world a lot sits in; the type a lot is set to, when only one pack adds it;
            and the existence of a club, a holiday, or a small business.
          </Line>
          <Line label="Detection is a floor, not a census.">
            A pack that ships a world is proved as soon as you sync, because its world and lot types
            are present. A pack with no world of its own is proved only if the save contains
            evidence that you used it, which is why the manual override exists.
          </Line>
          <Line label="Scope:">
            account-wide, so syncing one plan changes what every plan offers. Nothing flows the
            other way: a re-sync never consults pack ownership when deciding what to add, update,
            remove, or release. Ownership gates what you can add, never what your plan already
            contains.
          </Line>
        </Surface>

        <Surface name="Save files">
          <Line label="The link is one field:">
            the filename, the save's own name, and the date of the last re-sync. A plan created by
            import starts linked, with its clock running from creation. A plan created blank has no
            link until you use Link a .save file.
          </Line>
          <Line label="Only the sync date is displayed.">
            The other date recorded, last updated, is changed by every edit as well as by the
            re-sync, so it can only mean that you have planned since.
          </Line>
          <Line label="Backups:">
            the pre-sync backup is a full plan parked in Deleted &amp; backups and named{' '}
            <em>Auto-backup — &lt;name&gt; — &lt;date&gt;</em>. Reset writes one the same way.
            Retention is seven days for automatic backups and thirty days for plans you deleted,
            enforced by the server on boot and then daily.
          </Line>
          <Line label="Copies keep the link.">
            A duplicate and a{' '}
            <code className="text-c-secondary bg-c-secondary-soft border border-c-secondary-border rounded px-1 py-px text-xs font-mono">.s4plan</code>{' '}
            restore both carry the filename, the save's name, and the last-synced date, so both
            copies can re-sync from the same save file independently. A restore into a different
            account carries it too.
          </Line>
          <Line label="A restore into another account re-creates the photos under that account.">
            Nothing is shared back to the original owner. An image missing from storage is dropped
            from the bundle rather than restored broken.
          </Line>
          <Line label="Reset keeps">
            the link, the settings, and the photos, and clears everything else. It does not unlink
            the plan, so the next re-sync brings the save's contents straight back.
          </Line>
          <Line label="A restored plan is unrestricted until that account syncs a save of its own,">
            because pack ownership is recorded on the account rather than on the plan.
          </Line>
          <Line label="A permanent delete removes the plan's showcase photos with it.">
            An image leaves storage only once no record anywhere still references it, so purging a
            duplicate or a backup never affects the plan it shares images with. The inspo pool is
            unaffected, because those photos belong to the account.
          </Line>
        </Surface>
      </Part>
      <Part
        n="10"
        title="Terminology"
        lede="Four distinctions that are frequently conflated."
      >
        <Table>
          <Row
            when={<><B>Import</B>, <B>sync</B>, <B>restore</B></>}
            then="Import reads a save file and creates a new plan. Sync updates an existing plan from a save file. Restore recovers a plan from a backup and does not involve a save file."
          />
          <Row
            when={<><B>Link</B> and <B>import</B></>}
            then="Link attaches a save file to a plan that already exists. Import creates a new plan."
          />
          <Row
            when={<><B>Count</B></>}
            then="The number of records that changed. Not a number of fields, and not a number of replacements."
          />
          <Row
            when={<><B>Backup</B> and <B>undo</B></>}
            then="There is no undo. A backup is created before every re-sync."
          />
        </Table>
        <Fact title="Direction">
          <p className="m-0">
            Sync writes from the <Save /> file to the plan only. No data is written to the{' '}
            <Save /> file and no changes are applied to the game. A plan is a future save that you
            carry out in the game yourself.
          </p>
        </Fact>
      </Part>
    </HelpPage>
  );
}
