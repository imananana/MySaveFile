// HOUSEHOLD ORIGIN CLASSIFIER (reviewable).
//   Tree:
//     1. creator stamp present (f21 name)            → PLAYER  (sub: you vs other creator)
//     2. else, any member surname in premade catalog → EA       (premade family)
//     3. else (members generated / none)             → NPC      (townie / role spawn)
//   Seam (accepted): an EA household modified-in-play loses its stamp and reads EA.
//   Flags for review: unstamped + player-typed name (f56=0) = likely split/CAS-edited in play.
//
// Usage: npx tsx scripts/diagnostics/provClassify.ts <Slot_xxx.save> [meName1,meName2]
//        (no save arg → runs every save and prints titles + summary only)
import { readFileSync, readdirSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readVarint, readFixed64LE, readString, findLDField, readTag } from '../../src/lib/parser/protobuf.js';

const SAVES = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves`;
const TPL_DIR = `${process.env.HOME}/Documents/Sim Template`;

// ---- premade catalog: last-name STBL key (fresh saves) AND surname LABEL string
//      (played saves bake f56→0 but keep the literal "Pancakes"/"Landgraab" string) ----
const lastNameKey = new Map<number, Set<string>>();
const premadeSurnames = new Set<string>();   // lowercased surname labels
// Read EVERY SimTemplateTuning file (not just premadeSimTemplate_*): the Bjergsens are
// simTemplate_*, the Vatores are simTemplate_VampireStreet_* — all carry specify_last_name.
// All-files = 222 surnames vs 176 for the old glob. (See provTuningCatalog.ts.)
for (const f of readdirSync(TPL_DIR)) {
  if (!f.endsWith('.SimTemplateTuning.xml')) continue;
  const xml = readFileSync(`${TPL_DIR}/${f}`, 'utf8');
  for (const lnM of xml.matchAll(/<T n="specify_last_name">0x([0-9A-Fa-f]+)<!--([^>]*)--><\/T>/g)) {
    const k = parseInt(lnM[1], 16); const label = lnM[2].trim();
    (lastNameKey.get(k) ?? lastNameKey.set(k, new Set()).get(k)!).add(label);
    if (label) premadeSurnames.add(label.toLowerCase());
  }
}
// supplement: base-game founders ABSENT from this tuning extraction entirely (0 file
// mentions; Goth IS present). Source-data gap, not a parse gap — keep until extracted.
for (const s of ['pancakes', 'caliente', 'lothario']) premadeSurnames.add(s);
const premadeHhNames = new Set([...premadeSurnames, 'bff', 'roomies', 'karaoke legends']);
const isPremade = (s: Sim) => lastNameKey.has(s.f56) || (s.last && premadeSurnames.has(s.last.toLowerCase()));

// role-trait catalog (is<Role> hidden traits) — EXCLUDING non-role noise (isCustomGender/isWeirdo)
const ROLE_NOISE = new Set(['trait_isCustomGender', 'trait_isWeirdo']);
const roleGuid = new Map<number, string>();
for (const f of readdirSync(TPL_DIR)) {
  if (!f.endsWith('.xml')) continue;
  for (const m of readFileSync(`${TPL_DIR}/${f}`, 'utf8').matchAll(/<T>(\d+)<!--(trait_is[A-Za-z]+)-->/g))
    if (!ROLE_NOISE.has(m[2])) roleGuid.set(Number(m[1]), m[2]);
}
// system/mod stamps that are NOT a human creator
const MOD_STAMPS = new Set(['mc_population']);

type Sim = { id: bigint; first: string; last: string; f56: number; roles: string[]; saver: bigint };
type HH = { id: bigint; name: string; creator: string | null; acct: bigint | null; simIds: bigint[]; played: boolean; f9: boolean };

function load0d(file: string): Uint8Array[] {
  const b = readFileSync(`${SAVES}/${file}`);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  return parseDbpf(ab).filter(r => r.type === 0x0d).map(r => r.compType === 0xffff ? decompressRefpack(r.data) : r.data);
}
function title(buffers: Uint8Array[]): string {
  for (const buf of buffers) {
    const slot = findLDField(buf, 2); if (!slot) continue;
    let p = 0;
    while (p < slot.length) {
      const [fn, wire, at] = readTag(slot, p); p = at;
      if (wire === 0) { const [, n] = readVarint(slot, p); p = n; }
      else if (wire === 1) p += 8;
      else if (wire === 2) { const [l, n] = readVarint(slot, p); if (fn === 9) return new TextDecoder().decode(slot.slice(n, n + Number(l))); p = n + Number(l); }
      else if (wire === 5) p += 4; else break;
    }
  }
  return '(untitled)';
}
function scanSims(buf: Uint8Array): Map<bigint, Sim> {
  const sims = new Map<bigint, Sim>();
  for (let i = 0; i + 40 < buf.length; i++) {
    if (buf[i] !== 0x09) continue;
    const id = readFixed64LE(buf, i + 1); let p = i + 9;
    if (buf[p] !== 0x11) continue; p += 9;
    if (buf[p] !== 0x18) continue; p++; let n; try { [, n] = readVarint(buf, p); } catch { continue; } p = n;
    if (buf[p] !== 0x21) continue; p += 9;
    if (buf[p] !== 0x2a) continue; p++; let first, last = ''; try { [first, p] = readString(buf, p); } catch { continue; }
    if (!/^[\x20-\x7e]{0,40}$/.test(first)) continue;
    if (buf[p] === 0x32) { p++; try { [last, p] = readString(buf, p); } catch { last = ''; } }
    if (buf[p] !== 0x38) continue;
    if (id === 0n || sims.has(id)) continue;
    // walk body (capped window) for f56 + f23 last-saver acct + role traits
    let q = p, f56 = -1, saver = 0n; const end = Math.min(buf.length, p + 30000); const roles = new Set<string>();
    while (q < end) {
      if (buf[q] === 0) break; let t, nn; try { [t, nn] = readVarint(buf, q); } catch { break; } q = nn;
      const fn = Number(t >> 3n), wt = Number(t & 7n);
      if (wt === 0) { const [v, x] = readVarint(buf, q); q = x; if (fn === 56 && f56 < 0) f56 = Number(v); if (fn === 23 && saver === 0n) saver = v; const r = roleGuid.get(Number(v)); if (r) roles.add(r); }
      else if (wt === 1) { if (fn === 23 && saver === 0n) saver = readFixed64LE(buf, q); q += 8; }
      else if (wt === 2) { const [l, x] = readVarint(buf, q); const len = Number(l); for (let z = x; z < x + len; ) { let v, m; try { [v, m] = readVarint(buf, z); } catch { break; } z = m; const r = roleGuid.get(Number(v)); if (r) roles.add(r); } q = x + len; }
      else if (wt === 5) q += 4; else break;
    }
    sims.set(id, { id, first, last, f56, roles: [...roles], saver });
  }
  return sims;
}
function scanHouseholds(buf: Uint8Array): HH[] {
  const out: HH[] = []; const seen = new Set<bigint>();
  const anchors: { i: number; id: bigint; name: string; body: number }[] = [];
  for (let i = 0; i < buf.length - 40; i++) {
    if (buf[i] !== 0x09 || buf[i + 9] !== 0x11) continue;
    let p = i + 10; const id = readFixed64LE(buf, i + 10); p += 8;
    if (buf[p] !== 0x1a) continue; p++; let name, after; try { [name, after] = readString(buf, p); } catch { continue; }
    if (!name || name.length < 2 || name.length > 60 || !/^[\x20-\x7e]+$/.test(name) || name.includes('_')) continue;
    p = after; if (buf[p] !== 0x21) continue; p += 9;
    if (seen.has(id)) continue; seen.add(id);
    anchors.push({ i, id, name, body: p });
  }
  for (let ai = 0; ai < anchors.length; ai++) {
    const a = anchors[ai]; const end = ai + 1 < anchors.length ? anchors[ai + 1].i : Math.min(buf.length, a.body + 2_000_000);
    let p = a.body; const simIds: bigint[] = []; let creator: string | null = null; let acct: bigint | null = null; let played = false; let f9 = false;
    while (p < end) {
      if (buf[p] === 0) break; let t, nn; try { [t, nn] = readVarint(buf, p); } catch { break; } p = nn;
      const fn = Number(t >> 3n), wt = Number(t & 7n);
      if (wt === 0) { const [v, x] = readVarint(buf, p); if (fn === 20) acct = v; else if (fn === 31) played = v === 1n; p = x; }
      else if (wt === 1) { if (fn === 20) acct = readFixed64LE(buf, p); else if (fn === 9) f9 = true; p += 8; }
      else if (wt === 2) {
        const [l, x] = readVarint(buf, p); const len = Number(l); const ve = x + len; if (len < 0 || ve > end) break;
        if (fn === 11) { let inner = x; while (inner < ve) { const st = buf[inner++]; if (st === 0) break; const sw = st & 7; if (sw === 2) { const [sl, ss] = readVarint(buf, inner); const se = ss + Number(sl); if (st === 0x0a) for (let o = ss; o + 8 <= se; o += 8) simIds.push(readFixed64LE(buf, o)); inner = se; } else if (sw === 0) { const [, m] = readVarint(buf, inner); inner = m; } else if (sw === 1) inner += 8; else if (sw === 5) inner += 4; else break; } }
        else if (fn === 21) { try { const s = new TextDecoder().decode(buf.slice(x, ve)); if (s && /[ -~]/.test(s)) creator = s; } catch { /* */ } }
        p = ve;
      } else if (wt === 5) p += 4; else break;
    }
    out.push({ id: a.id, name: a.name, creator: creator && creator.length ? creator : null, acct, simIds, played, f9 });
  }
  return out;
}

function classify(hh: HH, sims: Map<bigint, Sim>, ownerAcct: bigint) {
  const members = hh.simIds.map(id => sims.get(id)).filter(Boolean) as Sim[];
  const tagged = members.map(m => ({ m, kind: isPremade(m) ? 'premade' : m.f56 === 0 ? 'typed' : 'gen' as string, roles: m.roles }));
  const isPremadeHh = tagged.some(t => t.kind === 'premade') || premadeHhNames.has(hh.name.toLowerCase());
  const roleHit = [...new Set(members.flatMap(m => m.roles))];
  const c = (hh.creator ?? '').toLowerCase();
  const downloadedFrom = hh.creator && !MOD_STAMPS.has(c) && !(ownerAcct !== 0n && hh.acct === ownerAcct) ? hh.creator : null;

  // PRIMARY AXIS = household f9: did the save's owner author/engage this household?
  // (built / CAS-edited / moved a sim in / played). Absent = EA-injected, never engaged.
  // f21/f20 demoted to attribution sub-label only (which gallery creator) — f21 ⊂ f9.
  let bucket: string, sub: string, note = '';
  if (hh.f9) {
    // engaged by the owner = curated, regardless of who originally made it
    bucket = 'Yours';
    sub = downloadedFrom ? 'downloaded' : isPremadeHh ? 'adopted-EA' : 'built';
    note = downloadedFrom ? `⬇ ${downloadedFrom}` : isPremadeHh ? 'adopted/edited EA family' : 'built';
  } else if (MOD_STAMPS.has(c)) {
    // mod/tool spawned it and the owner never engaged it → its own origin bucket
    bucket = 'Mod'; sub = 'mod-gen'; note = `${hh.creator}`;
  } else {
    bucket = 'EA';   // EA-injected, never engaged
    sub = isPremadeHh ? 'premade' : roleHit.length ? 'service' : 'townie';
    note = isPremadeHh ? 'premade' : roleHit.length ? `service: ${roleHit.map(r => r.replace('trait_is', '')).join(',')}` : 'townie';
  }
  return { bucket, sub, note, tagged, roleHit };
}

// ---------- run ----------
const arg = process.argv[2];
const files = arg ? [arg] : readdirSync(SAVES).filter(f => f.endsWith('.save')).sort();
for (const file of files) {
  let bufs: Uint8Array[]; try { bufs = load0d(file); } catch { console.log(`${file}: <parse error>`); continue; }
  const main = bufs.slice().sort((a, b) => b.length - a.length)[0];
  const sims = scanSims(main); const hhs = scanHouseholds(main);
  // owner = dominant f23 last-saver account across sims (whoever last saved THIS save)
  const saverTally = new Map<bigint, number>();
  for (const s of sims.values()) if (s.saver !== 0n) saverTally.set(s.saver, (saverTally.get(s.saver) ?? 0) + 1);
  const ownerAcct = [...saverTally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0n;
  const counts = new Map<string, number>(); const subCounts = new Map<string, number>();
  const detail = hhs.map(hh => { const c = classify(hh, sims, ownerAcct); counts.set(c.bucket, (counts.get(c.bucket) ?? 0) + 1); subCounts.set(`${c.bucket}/${c.sub}`, (subCounts.get(`${c.bucket}/${c.sub}`) ?? 0) + 1); return { hh, c }; });
  console.log(`\n═══ ${file}  "${title(bufs)}"  — ${hhs.length} households, ${sims.size} sims  (owner 0x${ownerAcct.toString(16)}) ═══`);
  const subFmt = (b: string, subs: string[]) => subs.filter(s => subCounts.has(`${b}/${s}`)).map(s => `${s}:${subCounts.get(`${b}/${s}`)}`).join(' ');
  console.log(`   YOURS:${counts.get('Yours') ?? 0}  [${subFmt('Yours', ['built', 'adopted-EA', 'downloaded'])}]`);
  console.log(`   EA   :${counts.get('EA') ?? 0}  [${subFmt('EA', ['premade', 'townie', 'service'])}]`);
  if (counts.get('Mod')) console.log(`   MOD  :${counts.get('Mod')}  [mc_population etc.]`);
  if (arg) {
    for (const { hh, c } of detail.sort((a, b) => a.c.bucket.localeCompare(b.c.bucket) || a.c.sub.localeCompare(b.c.sub))) {
      const mem = c.tagged.map(t => `${t.m.first} ${t.m.last}[${t.kind === 'premade' ? 'EA' : t.kind === 'typed' ? 'typed' : 'gen'}${t.roles.length ? ':' + t.roles.map(r => r.replace('trait_is', '')).join('/') : ''}]`).join(', ');
      console.log(`   [${c.bucket}/${c.sub}] "${hh.name}"${c.note ? '  ' + c.note : ''}`);
      console.log(`        ${mem || '(no resolved members)'}`);
    }
  }
}
