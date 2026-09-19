# MySaveFile — a Sims 4 save-file planner

React + Vite + Zustand SPA, Express + Postgres API, R2 for images. Deployed at
mysavefile.com (Railway). `npm run dev` runs client (:5173) and server (:3001).

## Skills in this repo

- **`ui-grammar`** — load before writing or reviewing any UI in `src/`. It
  carries the colour tokens, the broken-opacity trap, the control families, and
  the pre-commit checklist.
- **`selftest`** — load whenever you change UI or need to prove a behaviour.
  Drives the running dev app headlessly and screenshots it.

## The one rule that matters most

**The planner is a valid FUTURE save.** Everything the app renders is either
mirrored from the imported game save (read-only, green) or authored by the user
(purple, revertible). Never blur those two. Re-sync reconciles them: an
achievable plan persists, an impossible one yields with notice.

## Working with this codebase

- **Screenshot before you claim.** You cannot see the app. A passing typecheck
  is not evidence that a UI change looks right — use the `selftest` skill and
  actually `Read` the PNG.
- **The local dev database is disposable** — the save in it is junk test data.
  Drive mutating flows freely; just say what you changed, and ask before
  anything bulk or destructive. Production is a different matter entirely.
- **Parser work needs 1:1 evidence.** A field mapping is confirmed by tuning
  data, seed data or byte elimination — never by inference, and never "N-1 of
  N". If it isn't confirmed, descope it to raw and say so.
- **Tuning data is the only unedited source of truth.** Don't sample or glob a
  single prefix and call it complete; ask first if the full read is expensive.
- **Search before you spike.** Most parsers already exist. Grep first.
- **Change a user-facing surface → update its file in `docs/product-facts/` in
  the same commit.** Marketing writes from those files, so a stale one becomes a
  false public claim. The previous fact sheet was gitignored, so nothing ever
  put it in a diff and it rotted for two months — this rule is the replacement
  for that missing pressure.
  **This is now enforced by a commit hook**, not by remembering: a commit that
  edits a file named in a surface's `Verified` line, without that surface file
  in it, is refused. To skip deliberately — a refactor, a test, anything a user
  could not notice — put `[no-facts]` in the commit message. Shared spine files
  (`GameReimport.tsx`, `useSaveFile.ts`, `api.ts`…) print a note and never
  block, since most surfaces name them. `npm run facts:check` audits the whole
  repo for drift that already exists; `npm run product-facts` builds the single
  pasteable file. If the hook never fires, run
  `git config core.hooksPath .githooks` — it's per-clone.
- **★ To DESCRIBE code, READ IT WHOLE. Never grep.** A search returns only what
  you already suspected, so it can confirm a guess but never correct one — it is
  inference wearing a tool call. Describing the household screen from searches
  produced two confidently wrong mechanics in a row (a skill being both observed
  and planned; two careers on screen at once), each contradicted by a line a few
  rows from what was already open. Reading the files whole caught those *and*
  turned up things nobody thought to ask about. Grep is fine for finding where to
  make a change; it is never evidence about behaviour.
- **Behaviour lives in three layers — read all three.** The screen (what you
  see), the store/API (what actually persists), and the sync rules (`diff.ts`,
  `snapshot.ts`, `plannedMoveSync.ts` — what a re-sync does to it). Reading only
  the screen is how both wrong claims happened. For one surface this is a few
  thousand lines: cheap, and far cheaper than unwinding a wrong page.
- **★ Stage explicit paths. Never `git add .`, `git add -A`, or `git commit -a`.**
  More than one Claude session runs in this repo at once, in the same working
  directory. A blanket stage sweeps up whatever another session has in flight and
  buries it inside a commit whose message describes none of it — that is exactly
  how the effective-value change (six files, a new lib, its tests) ended up
  inside a commit about pack-gated occults. `git status` before committing, and
  name every path you stage. If files you don't recognise appear, another session
  is mid-task: leave them alone and say so.
- **Commit often.** The IDE/linter reverts uncommitted files during git
  operations; commit before switching tasks or doing a rewrite. With concurrent
  sessions, uncommitted work is also exposed work — the window is the risk. After
  any git operation, verify `server/src/index.ts` still mounts `photosRouter` — it has
  silently lost that mount more than once.
- **Never push without being asked**, and never to `origin/main` — day-branches
  only (`checkpoint/YYYY-MM-DD`).
- Navigation inside `PlannerApp` must use the `/saves/:saveFileId` prefix or the
  app hard-reloads.
- New persisted sim/lot field? Wire it through export **and** the re-sync
  snapshot too. Never diff derived values.

## Talking to the user

- Give explicit, line-by-line terminal commands — never "run the build".
- Ask rather than assume; they'd rather answer a question than unwind a wrong
  guess. Keep audits brief and bulleted, and lead with your own take.
- Evaluate work from three angles: developer/PM, Sims super-user, Sims end-user.
- Script mods are always allowed in their setup — don't ask.
