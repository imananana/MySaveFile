# Instructions from code

**For whoever is writing MySaveFile's public copy — landing page, help, about,
guides, socials.**

This comes alongside `PRODUCT_FACTS.md`, which is the complete, verified
description of what the product does. That file is generated from 22 source
files and was written by reading the actual code and driving the actual app,
screen by screen, over several weeks. Every claim in it is traceable to
something real.

This file is the shorter thing: how to use it, what to send back, and the
handful of traps worth knowing before you write a word.

---

## Start here, not at the top

`PRODUCT_FACTS.md` is ~250KB. Don't read it front to back.

1. **`do-not-claim.md`** — the second section in the bundle. Nine pages of
   things that are false or dangerously half-true, each paired with what's
   actually true. If you read one thing, read this. It exists because every
   entry in it is a claim somebody has already made or would reasonably assume.
2. **`glossary.md`** — the third section. The game's words versus ours, and the
   pairs that get mixed up. Getting a Sims term subtly wrong is the fastest way
   to lose a Sims player.
3. **Then the surface you're writing about.** Each screen has its own section
   (`# Households`, `# Re-sync`, `# Clubs`…) with the same headings every time:
   why it exists · what you see · what you can do · **what you can't** · how it
   relates to sync · limitations.

**"What you can't" and "Limitations" are the useful bits.** Anyone can write
copy from a feature list. The reason this document is long is that it also says
where each feature stops, and that's what keeps a claim honest.

---

## The five traps

Ranked by how likely they are to bite, based on what people assume about this
product before reading anything.

**1 · It does not touch your game.** The planner reads a save file and never
writes to it. Everything you author is a *plan you still carry out in-game
yourself*. Never write anything that sounds like one-click apply, sync-to-game,
or save editing. This is the biggest and most tempting wrong claim available.

**2 · The save is read in the browser, not uploaded.** The file never leaves the
user's computer; only the extracted records go to the server. This is a privacy
claim people care about — state it, and state it accurately.

**3 · It's a desktop product with mobile pieces.** Nine screens are desktop-only
by design, including households, sims and the family tree, and importing needs
the computer the game is on. "Plan on the go" is not available to you.

**4 · Most of it is private.** A share link publishes the *showcase* only. Inspo
photos, clubs, holidays, businesses, dynasties, venues, mods and every note are
private and appear nowhere public. And **Notes are private, Descriptions are
public** — two different fields, easy to swap.

**5 · Every number in the document is one person's save.** *209 households, 406
sims, 78 families* come from the developer's own game. They illustrate what a
real save holds. They are not typical, not a benchmark, and not a claim.

---

## What to send back

Three kinds of feedback, and they're worth separating because completely
different work happens to each.

### "This is wrong"

The most valuable thing you can send. Something in the document doesn't match
what you're seeing, or contradicts itself.

**Quote the sentence and name the section** (`# Clubs`). That's enough — the
sentence gets traced back to the code, verified, and the source file corrected.
Several fixes this week started exactly this way.

### "I don't understand this"

Nearly always worth sending, because it usually means **the product is
confusing, not the document**. Multiple genuine product changes have come from
someone not being able to follow an explanation. Don't self-edit these into
silence.

### "Can we claim X?"

Ask freely, and ask *before* writing around it. A question like *"can we say it
keeps your family tree forever?"* gets a real answer — in that case: yes for
anything from the point you start planning, no for a save written before the
game's Feb-2026 patch, because those hold no premade ancestors at all.

Cheap to answer, much cheaper than retracting a published claim.

---

## Practical notes

- **Don't edit `PRODUCT_FACTS.md`.** It's regenerated from source files, so
  edits are overwritten. Send notes in any form — a list, a doc, comments,
  pasted into chat. No template needed.
- **Quote the version stamp** at the top of the file (`Version a1b2c3d ·
  2026-08-13`) when sending feedback. The document changes; that says exactly
  which copy you read.
- **Ask for a fresh build** whenever you want one. It's one command and takes a
  second.
- **The open questions are deliberate.** A few sections end with *Needs
  confirming*. That's honesty about what hasn't been settled, not an oversight.
  Only one is a genuine product question anyone would ask back: whether a ghost
  should be marked in the sims table.

---

## The thing this document can't give you

**Voice.** The fact sheet is deliberately flat and checkable, and the brand
guidelines are visual only — colours, type, logo. Nothing anywhere defines how
MySaveFile *sounds*.

That's a real gap, and it's yours to fill rather than ours. Worth deciding early
and writing down somewhere, because otherwise it gets decided implicitly across
a dozen drafts and never quite agrees with itself. It shouldn't live in the fact
sheet: those files have to stay boring so they can stay verifiable.

---

## Why this exists at all

The previous version of this documentation was a single file that nobody could
see. It wasn't tracked, so no product change ever put it in front of anyone, and
it quietly went out of date for two months — including through a complete
redesign of the most important feature in the product.

The replacement is tracked, split per screen, and enforced: a commit that
changes a screen without updating that screen's file is **refused**, and a
command audits the whole set for drift. So when you're told this document is
current, that's a mechanism talking, not a promise.

Which means: if it's wrong, that's worth knowing about. Please say.
