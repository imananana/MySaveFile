/**
 * SPIKE 5 (final): clean career→uid extraction. Robustly walks ALL f30.f12.f2
 * messages per labeled sim (no early-break bug), reads f1=career uid, f4=level,
 * f5=trade (freelancer), and picks the entry whose level == the labeled rank.
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/spikeCareerFinal.ts
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

const savePath = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000003.save`;
const FIX: Record<string, [string, string, number][]> = {
  G1: [['spence','Actress',1],['altman','Detective',2],['dobbs','Doctor',3],['hamilton','Interior Decorator',4],['lujan','Naturopath',5],['richter','Noble',6],['mcelroy','Reaper',7],['owens','Scientist',8]],
  G2: [['kumar','Astronaut',1],['kaur','Athlete',2],['hale','Business',3],['ricks','Civil Designer',1],['lyon','Conservationist',4],['curry','Criminal',5],['gruber','Critic',1],['sawyer','Culinary',2]],
  G3: [['larue','Education',3],['willis','Engineer',4],['olivas','Entertainer',1],['miotke','Gardener',3],['bolton','Law',7],['osborn','Military',5],['john','Painter',6],['acosta','Park Worker',7]],
  G4: [['kellogg','Politician',4],['chen','Romance Consultant',6],['covington','Salary Person',4],['mcconnell','Secret Agent',7],['liu','Social Media',3],['whitten','Style Influencer',5],['mcghee','Tech Guru',6],['darby','Undertaker',4]],
  J1: [['brennan','Writer',1],['grey','Babysitter',3],['rhodes','Barista',1],['italia','Diver',3],['sawyer','Fast Food Employee',1],['nance','Fisherman',1]],
  J2: [['annis','Handyperson',2],['reifel','Lifeguard',1],['chandler','Manual Laborer',1],['moreno','Retail Employee',1],['dettloff','Simfluencer',2],['tatum','Video Game Streamer',1]],
  Freelancer: [['aguirre','Freelance Programmer',1],['rosado','Freelance Artist',1],['duke','Freelance Writer',1],['saribas','Freelance Crafter',1],['lockwood','Freelance Fashion Photographer',1],['lengyel','Paranormal Investigator',1],['mixon','Freelancer (none)',1]],
  'Pretty Teen Girls': [['sekiene','Cheer Team',1],['mayers','Chess Team',2],['mars','Computer Team',3],['hilton','Drama Club',4],['nurris','Football Team',1],['fontaine','Scout',5],['ramses','Lifeguard (job)',1]],
  Branch: [['grubbs','Secret Agent',1],['champion','Diamond Agent',8],['gilliam','Villain',11]],
};

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
  if (buf[i] !== 0x09) continue;
  let pos = i + 9; if (buf[pos] !== 0x11) continue; pos += 9;
  if (buf[pos] !== 0x18) continue; pos++; const [, a] = rv(buf, pos); pos = a;
  if (buf[pos] !== 0x21) continue; pos += 9; if (buf[pos] !== 0x2a) continue;
  const id = f64(buf, i + 1); if (!known.has(id)) continue;
  anchors.push({ id, start: i }); i = pos;
}
anchors.sort((a, b) => a.start - b.start);
const ext = new Map<bigint, [number, number]>();
anchors.forEach((a, i) => ext.set(a.id, [a.start, i + 1 < anchors.length ? anchors[i + 1].start : Math.min(buf.length, a.start + 300_000)]));

// Every f30.f12.f2 message → { uid (f1), level (f4), trade (f5) }.
function f2Entries(recS: number, recE: number) {
  const out: { uid: bigint | null; level: number | null; trade: bigint | null }[] = [];
  function walk(s: number, e: number, path: string) {
    if (path === '.f30.f12.f2') {
      let q = s; let uid: bigint | null = null, level: number | null = null, trade: bigint | null = null;
      while (q < e) {
        const [tb, at] = rv(buf, q); const tag = Number(tb), fn = tag >> 3, wt = tag & 7; if (fn === 0 || at <= q) break; q = at;
        if (wt === 0) { const [v, n] = rv(buf, q); if (fn === 1) uid = v; else if (fn === 4) level = Number(v); else if (fn === 5) trade = v; q = n; }
        else if (wt === 1) { const v = f64(buf, q); if (fn === 1) uid = v; else if (fn === 5) trade = v; q += 8; }
        else if (wt === 5) q += 4;
        else if (wt === 2) { const [l, n] = rv(buf, q); q = n + Number(l); }
        else break;
      }
      out.push({ uid, level, trade });
      return;
    }
    let p = s; const kids: [number, number, string][] = [];
    while (p < e) {
      const [tb, at] = rv(buf, p); const tag = Number(tb), fn = tag >> 3, wt = tag & 7; if (fn === 0 || at <= p) break; p = at;
      if (wt === 0) { const [, n] = rv(buf, p); p = n; }
      else if (wt === 1) p += 8;
      else if (wt === 5) p += 4;
      else if (wt === 2) { const [l, n] = rv(buf, p); const ce = n + Number(l); if (ce <= e) kids.push([n, ce, `${path}.f${fn}`]); p = ce; }
      else break;
    }
    for (const [cs, ce, kp] of kids) walk(cs, ce, kp);
  }
  walk(recS, recE, '');
  return out;
}

const hex = (v: bigint | null) => v == null ? '?' : '0x' + v.toString(16);
const rows: { career: string; uid: string; level: number; trade: string }[] = [];
for (const [hhName, list] of Object.entries(FIX)) {
  const hh = data.households.find((h) => h.name?.toLowerCase() === hhName.toLowerCase());
  if (!hh) continue;
  const members = data.sims.filter((s) => hh.simIds.some((id) => id === s.id));
  for (const [sub, career, rank] of list) {
    const sim = members.find((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(sub));
    if (!sim) { console.log(`✗ ${hhName}/${sub}`); continue; }
    // 0x2545 = the high-school "student" tracker every teen carries; it sits at
    // ~level 3 and masks a real career/activity at the same level — skip it.
    const entries = f2Entries(...ext.get(sim.id)!).filter((en) => en.uid !== 0x2545n);
    const match = entries.find((en) => en.level === rank) ?? entries.find((en) => en.level === rank - 1);
    if (!match) { console.log(`? ${career.padEnd(22)} no f2 entry at level ${rank} (saw levels ${entries.map((e) => e.level).join(',')})`); continue; }
    rows.push({ career, uid: hex(match.uid), level: match.level!, trade: match.trade && match.trade > 0n ? hex(match.trade) : '' });
  }
}

console.log(`\nFINAL career → uid map (${rows.length}):\n`);
for (const r of rows.sort((a, b) => a.career.localeCompare(b.career))) {
  console.log(`  ${r.career.padEnd(28)} ${r.uid.padEnd(12)}${r.trade ? `  trade=${r.trade}` : ''}`);
}
