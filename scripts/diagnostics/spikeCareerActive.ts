/**
 * Two goals:
 *  (A) ACTIVE-CAREER DETECTION — for each sim, dump every f30.f12.f2 entry with
 *      ALL its raw sub-fields, so we can find what marks the *current* job vs
 *      completed/retired/school/club entries. Prints G1 (known single careers)
 *      in detail.
 *  (B) NPC-JOB REPORT — across ALL parsed sims, list who holds an npc-kind
 *      career (the auto-generated townies worth a makeover).
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/spikeCareerActive.ts
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { STOCK_CAREERS } from '../../src/data/stockCareers.js';

const savePath = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000003.save`;
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!blob || d.length > blob.length) blob = d; }
const buf = blob!;

function rv(b: Uint8Array, p: number): [bigint, number] { let res = 0n, sh = 0n, i = p; while (i < b.length) { const x = b[i]; i++; res |= BigInt(x & 0x7f) << sh; if (!(x & 0x80)) break; sh += 7n; if (sh > 70n) break; } return [res, i]; }
const f64 = (b: Uint8Array, p: number) => { let v = 0n; for (let k = 0; k < 8; k++) v |= BigInt(b[p + k]) << BigInt(8 * k); return v; };

const known = new Set(data.sims.map((s) => s.id));
const anchors: { id: bigint; start: number }[] = [];
for (let i = 0; i < buf.length - 60; i++) {
  if (buf[i] !== 0x09) continue; let pos = i + 9; if (buf[pos] !== 0x11) continue; pos += 9;
  if (buf[pos] !== 0x18) continue; pos++; const [, a] = rv(buf, pos); pos = a;
  if (buf[pos] !== 0x21) continue; pos += 9; if (buf[pos] !== 0x2a) continue;
  const id = f64(buf, i + 1); if (!known.has(id)) continue; anchors.push({ id, start: i }); i = pos;
}
anchors.sort((a, b) => a.start - b.start);
const ext = new Map<bigint, [number, number]>();
anchors.forEach((a, i) => ext.set(a.id, [a.start, i + 1 < anchors.length ? anchors[i + 1].start : Math.min(buf.length, a.start + 300_000)]));

// All fields of a single f30.f12.f2 message: { fieldNum: value(s) }.
interface Entry { fields: Record<number, (bigint | number)[]> }
function f2Entries(recS: number, recE: number): Entry[] {
  const out: Entry[] = [];
  function walk(s: number, e: number, path: string) {
    if (path === '.f30.f12.f2') {
      const fields: Record<number, (bigint | number)[]> = {};
      let q = s;
      while (q < e) {
        const [tb, at] = rv(buf, q); const tag = Number(tb), fn = tag >> 3, wt = tag & 7; if (fn === 0 || at <= q) break; q = at;
        const push = (v: bigint | number) => { (fields[fn] ??= []).push(v); };
        if (wt === 0) { const [v, n] = rv(buf, q); push(v); q = n; }
        else if (wt === 1) { push(f64(buf, q)); q += 8; }
        else if (wt === 5) { push(0); q += 4; }
        else if (wt === 2) { const [l, n] = rv(buf, q); push(-1); q = n + Number(l); } // nested: mark presence
        else break;
      }
      out.push({ fields });
      return;
    }
    let p = s; const kids: [number, number, string][] = [];
    while (p < e) {
      const [tb, at] = rv(buf, p); const tag = Number(tb), fn = tag >> 3, wt = tag & 7; if (fn === 0 || at <= p) break; p = at;
      if (wt === 0) { const [, n] = rv(buf, p); p = n; } else if (wt === 1) p += 8; else if (wt === 5) p += 4;
      else if (wt === 2) { const [l, n] = rv(buf, p); const ce = n + Number(l); if (ce <= e) kids.push([n, ce, `${path}.f${fn}`]); p = ce; } else break;
    }
    for (const [cs, ce, kp] of kids) walk(cs, ce, kp);
  }
  walk(recS, recE, '');
  return out;
}

const hx = (v: bigint | number) => '0x' + BigInt(v).toString(16);
const nameOf = (uid: bigint) => STOCK_CAREERS[hx(uid)]?.name ?? '?';
const kindOf = (uid: bigint) => STOCK_CAREERS[hx(uid)]?.kind ?? '?';

// ── (A) Detailed dump for G1 (each has exactly one seeded career) ────────────
const G1 = ['spence','altman','dobbs','hamilton','lujan','richter','mcelroy','owens'];
const g1hh = data.households.find((h) => h.name?.toLowerCase() === 'g1');
console.log('=== (A) G1 raw f2 entries (find the active marker) ===\n');
if (g1hh) {
  for (const sub of G1) {
    const sim = data.sims.find((s) => g1hh.simIds.includes(s.id) && `${s.firstName} ${s.lastName}`.toLowerCase().includes(sub));
    if (!sim) { console.log(`  ✗ ${sub} not found`); continue; }
    const entries = f2Entries(...ext.get(sim.id)!);
    console.log(`${sim.firstName} ${sim.lastName} [${sim.lifestage}] — ${entries.length} entries`);
    for (const en of entries) {
      const uid = en.fields[1]?.[0]; const uidB = uid != null ? BigInt(uid) : null;
      const desc = uidB != null ? `${nameOf(uidB)}/${kindOf(uidB)}` : '(no uid)';
      const fieldStr = Object.entries(en.fields).map(([k, vs]) => {
        const n = Number(k);
        const shown = vs.map((v) => (v === -1 ? '{}' : (n === 1 || n === 5 ? hx(v) : String(v)))).join(',');
        return `f${k}=${shown}`;
      }).join('  ');
      console.log(`    [${desc}]  ${fieldStr}`);
    }
    console.log();
  }
}

// ── (B) NPC-career holders across ALL parsed sims ────────────────────────────
console.log('\n=== (B) Sims holding an npc-kind career ===\n');
let npcCount = 0;
const byCareer = new Map<string, string[]>();
for (const s of data.sims) {
  const x = ext.get(s.id); if (!x) continue;
  const entries = f2Entries(...x);
  for (const en of entries) {
    const uid = en.fields[1]?.[0]; if (uid == null) continue;
    if (kindOf(BigInt(uid)) === 'npc') {
      npcCount++;
      const nm = nameOf(BigInt(uid));
      (byCareer.get(nm) ?? byCareer.set(nm, []).get(nm)!).push(`${s.firstName} ${s.lastName} [${s.lifestage}]`);
    }
  }
}
console.log(`${npcCount} npc-career holdings across ${data.sims.length} sims:\n`);
for (const [career, sims] of [...byCareer.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${career} (${sims.length}): ${sims.slice(0, 6).join(', ')}${sims.length > 6 ? ` …+${sims.length - 6}` : ''}`);
}

// ── (C) Multi-entry sims: distribution + teen/freelancer examples ────────────
console.log('\n=== (C) entry-count distribution + multi-entry examples ===\n');
const dist = new Map<number, number>();
const multi: { sim: typeof data.sims[0]; entries: Entry[] }[] = [];
for (const s of data.sims) {
  const x = ext.get(s.id); if (!x) continue;
  const entries = f2Entries(...x);
  dist.set(entries.length, (dist.get(entries.length) ?? 0) + 1);
  if (entries.length > 1) multi.push({ sim: s, entries });
}
console.log('entries → #sims:', [...dist.entries()].sort((a,b)=>a[0]-b[0]).map(([k,v])=>`${k}:${v}`).join('  '));
console.log(`\n${multi.length} sims with >1 entry. First 12:\n`);
for (const { sim, entries } of multi.slice(0, 12)) {
  const parts = entries.map((en) => { const u = en.fields[1]?.[0]; const ub = u!=null?BigInt(u):null; const lv = en.fields[4]?.[0]; const tr = en.fields[5]?.[0]; return ub!=null?`${nameOf(ub)}/${kindOf(ub)}${lv?` L${lv}`:''}${tr&&BigInt(tr)>0n?` trade=${hx(tr)}`:''}`:'(no uid)'; });
  console.log(`  ${sim.firstName} ${sim.lastName} [${sim.lifestage}]: ${parts.join(' | ')}`);
}

// ── (D) Freelancers: confirm base uid + f5 trade values (option 3) ───────────
console.log('\n=== (D) Freelancer household entries ===\n');
const flhh = data.households.find((h) => h.name?.toLowerCase() === 'freelancer');
if (flhh) {
  for (const id of flhh.simIds) {
    const s = data.sims.find((x) => x.id === id); if (!s) continue;
    const x = ext.get(s.id); if (!x) continue;
    for (const en of f2Entries(...x)) {
      const u = en.fields[1]?.[0]; if (u == null) continue; const ub = BigInt(u);
      const tr = en.fields[5]?.[0];
      console.log(`  ${s.firstName} ${s.lastName}: ${nameOf(ub)}/${kindOf(ub)} (uid=${hx(ub)})${tr&&BigInt(tr)>0n?`  f5/trade=${hx(tr)}`:''}`);
    }
  }
} else { console.log('  (no "Freelancer" household)'); }
