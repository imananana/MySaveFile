#!/usr/bin/env node
/**
 * Is a product-fact surface file behind the code it describes?
 *
 *   npm run facts:check            audit the repo against git history
 *   node scripts/factsCheck.mjs --staged   what's in this commit (the hook)
 *
 * ── How it knows ────────────────────────────────────────────────────────────
 * Every surface file's **Verified** line already names the source files it was
 * written from, in backticks. That list is the map: no second file to maintain,
 * and it can't drift from the doc because it IS the doc. A surface that names
 * `ClubManager.tsx` is a surface that has something to say when ClubManager.tsx
 * changes.
 *
 * ── Shared spine files don't block ──────────────────────────────────────────
 * `GameReimport.tsx`, `useSaveFile.ts`, `api.ts` and friends are named by most
 * surfaces, because most surfaces had to read them to describe their own sync
 * behaviour. Demanding twelve doc updates for one edit to the sync spine would
 * make the check noise, and noise gets bypassed. So a file referenced by more
 * than SHARED_AT surfaces is reported as a heads-up and never blocks; the
 * surface-specific files are the ones that gate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SHARED_AT = 3;
const ROOT = process.cwd();
const SURFACES = path.join(ROOT, 'docs', 'product-facts', 'surfaces');
const staged = process.argv.includes('--staged');

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

/** surface name → the source files its Verified line names. */
function buildMap() {
  const map = new Map();
  for (const file of fs.readdirSync(SURFACES).filter((f) => f.endsWith('.md'))) {
    const text = fs.readFileSync(path.join(SURFACES, file), 'utf8');
    // The Verified line runs to the first blank line after it.
    const start = text.indexOf('**Verified**');
    if (start === -1) continue;
    const end = text.indexOf('\n\n', start);
    const block = text.slice(start, end === -1 ? undefined : end);
    const refs = [...block.matchAll(/`([A-Za-z0-9_./-]+\.(?:tsx?|sql))`/g)].map((m) => m[1]);
    map.set(file, [...new Set(refs)]);
  }
  return map;
}

/** How many surfaces name this reference — shared spine files score high. */
function referenceCounts(map) {
  const counts = new Map();
  for (const refs of map.values()) {
    for (const r of refs) counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  return counts;
}

/** Does a changed path correspond to a reference? Suffix match, so both
 *  `ModManager.tsx` and `server/src/routes/mods.ts` resolve. */
const matches = (changedPath, ref) =>
  changedPath === ref || changedPath.endsWith(`/${ref}`) || path.basename(changedPath) === path.basename(ref);

/** A test changing is not the product changing. Tests are named in Verified
 *  lines as evidence ("the counting rules are covered by unit tests"), so
 *  without this a new test case reads as undocumented behaviour. */
const isTest = (p) => /\.test\.[jt]sx?$/.test(p);

const map = buildMap();
const counts = referenceCounts(map);
const isShared = (ref) => (counts.get(ref) ?? 0) > SHARED_AT;

// ── staged mode: the commit-msg hook ────────────────────────────────────────
if (staged) {
  const changed = git('diff', '--cached', '--name-only', '--diff-filter=ACMR').split('\n').filter(Boolean);
  const stagedDocs = new Set(changed.filter((f) => f.startsWith('docs/product-facts/')).map((f) => path.basename(f)));
  const code = changed.filter((f) => (f.startsWith('src/') || f.startsWith('server/src/')) && !isTest(f));

  const owed = new Map();   // surface → the files in this commit that implicate it
  const shared = new Set();
  for (const file of code) {
    for (const [surface, refs] of map) {
      for (const ref of refs) {
        if (!matches(file, ref)) continue;
        if (isShared(ref)) { shared.add(ref); continue; }
        if (stagedDocs.has(surface)) continue;
        owed.set(surface, [...new Set([...(owed.get(surface) ?? []), file])]);
      }
    }
  }

  if (owed.size === 0) {
    if (shared.size > 0) {
      console.error(`\n  Note: this commit touches shared code (${[...shared].join(', ')}).`);
      console.error('  Most surfaces describe it. Worth a thought, not a blocker.\n');
    }
    process.exit(0);
  }

  console.error('\n  ✗ Product facts not updated.\n');
  for (const [surface, files] of owed) {
    console.error(`    docs/product-facts/surfaces/${surface}`);
    for (const f of files) console.error(`      ← ${f}`);
  }
  console.error('\n  Update the surface file in this commit, or add [no-facts] to the');
  console.error('  commit message if this changes nothing a user could notice.\n');
  process.exit(1);
}

// ── audit mode: drift that already exists ───────────────────────────────────
const lastCommit = (file) => {
  try { return git('log', '-1', '--format=%cI', '--', file) || null; } catch { return null; }
};

const stale = [];
for (const [surface, refs] of map) {
  const docPath = `docs/product-facts/surfaces/${surface}`;
  const docDate = lastCommit(docPath);
  if (!docDate) continue;
  const behind = [];
  for (const ref of refs) {
    if (isShared(ref)) continue;
    // Resolve the reference to real paths, then compare dates.
    let paths = [];
    try {
      paths = git('ls-files', `*${path.basename(ref)}`).split('\n')
        .filter((p) => p && (p.startsWith('src/') || p.startsWith('server/src/')) && !isTest(p) && matches(p, ref));
    } catch { /* no match */ }
    for (const p of paths) {
      const d = lastCommit(p);
      if (d && d > docDate) behind.push({ file: p, at: d.slice(0, 10) });
    }
  }
  if (behind.length) stale.push({ surface, docDate: docDate.slice(0, 10), behind });
}

if (stale.length === 0) {
  console.log(`All ${map.size} surface files are level with the code they describe.`);
  process.exit(0);
}

console.log(`${stale.length} of ${map.size} surface files are behind their code:\n`);
for (const { surface, docDate, behind } of stale.sort((a, b) => b.behind.length - a.behind.length)) {
  console.log(`  ${surface}  (last updated ${docDate})`);
  for (const { file, at } of behind.sort((a, b) => b.at.localeCompare(a.at))) {
    console.log(`      ${at}  ${file}`);
  }
  console.log('');
}
console.log('Each line is a file that changed after the doc did. Re-read it, then update the doc.');
