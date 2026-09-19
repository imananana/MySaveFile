/**
 * SPIKE 3: consolidated career map. Walks each labeled sim straight to f30.f12
 * (the career tracker found in spike 2) and dumps the field-numbered breakdown
 * of its f1/f2 sub-messages, so we can (a) read off career uid per labeled
 * career and (b) see which field# is the career tuning vs the level tuning.
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/spikeCareerMap.ts [savePath]
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000003.save`;

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

type F = { fn: number; wt: number; v?: bigint; cs?: number; ce?: number };
function fieldsOf(s: number, e: number): F[] {
  const out: F[] = []; let p = s;
  while (p < e) {
    const [tb, at] = rv(buf, p); if (at <= p) break; const tag = Number(tb), fn = tag >> 3, wt = tag & 7; if (fn === 0) break; p = at;
    if (wt === 0) { const [v, n] = rv(buf, p); out.push({ fn, wt, v }); p = n; }
    else if (wt === 1) { out.push({ fn, wt, v: f64(buf, p) }); p += 8; }
    else if (wt === 2) { const [l, n] = rv(buf, p); const ce = n + Number(l); if (ce > e) break; out.push({ fn, wt, cs: n, ce }); p = ce; }
    else if (wt === 5) { let v = 0n; for (let k = 0; k < 4; k++) v |= BigInt(buf[p + k]) << BigInt(8 * k); out.push({ fn, wt, v }); p += 4; }
    else break;
  }
  return out;
}

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

const hex = (v: bigint) => '0x' + v.toString(16);
const fmt = (f: F) => f.wt === 2 ? `f${f.fn}{}` : (f.v! >= 0x10000n ? `f${f.fn}=${hex(f.v!)}` : `f${f.fn}=${f.v}`);

// record → all f30 → all f12 (career entries)
function careerEntries(recS: number, recE: number): [number, number][] {
  const out: [number, number][] = [];
  for (const f30 of fieldsOf(recS, recE)) {
    if (f30.fn !== 30 || f30.wt !== 2) continue;
    for (const f12 of fieldsOf(f30.cs!, f30.ce!)) {
      if (f12.fn === 12 && f12.wt === 2) out.push([f12.cs!, f12.ce!]);
    }
  }
  return out;
}

const rows: { hh: string; sim: string; career: string; rank: number; f2: string }[] = [];
for (const [hhName, list] of Object.entries(FIX)) {
  const hh = data.households.find((h) => h.name?.toLowerCase() === hhName.toLowerCase());
  if (!hh) { console.log(`(${hhName} not found)`); continue; }
  const memberIds = new Set(hh.simIds.map((x) => x.toString()));
  const members = data.sims.filter((s) => memberIds.has(s.id.toString()));
  for (const [sub, career, rank] of list) {
    const sim = members.find((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(sub));
    if (!sim) { console.log(`✗ ${hhName} ${sub} (${career})`); continue; }
    const e = ext.get(sim.id); if (!e) continue;
    const entries = careerEntries(e[0], e[1]);
    const descs = entries.map(([cs, ce]) => {
      const f2 = fieldsOf(cs, ce).find((f) => f.fn === 2 && f.wt === 2);
      return f2 ? fieldsOf(f2.cs!, f2.ce!).map(fmt).join(' ') : '(no f2)';
    });
    rows.push({ hh: hhName, sim: `${sim.firstName} ${sim.lastName}`, career, rank, f2: descs.join('\n      | ') || '(none)' });
  }
}

console.log(`\n${savePath.split('/').pop()} — every f30.f12 entry per labeled sim:\n`);
for (const r of rows) console.log(`${r.hh}  ${r.career} r${r.rank}  (${r.sim}):\n      | ${r.f2}`);
