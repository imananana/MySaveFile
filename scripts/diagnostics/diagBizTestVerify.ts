/**
 * Verify Test123 Shop's wrapper IDs against known sim and lot IDs.
 * Hypotheses:
 *   - record.f3.f1 fixed64 = lot_id of Caminito del Deseo (residential overlay)
 *   - record.f3.f4 fixed64 = business_id + 1 (twin ID, like outer f1 + 1)
 *   - SmallBusinessData.f8 (8-byte wrapped) = owner_sim_id (Biz BizTest)
 *   - SmallBusinessData.f14 (8-byte wrapped) = lot_id again
 *   - SmallBusinessData.f18 (8-byte wrapped) = ???
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../src/lib/dbpf.js';
import { parseSaveData } from '../src/lib/saveParser.js';

const HOME = process.env.HOME;
const SAVE = `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_10312032.save`;

const buf = readFileSync(SAVE);
const resources = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const data = parseSaveData(resources);

const biz = data.sims.find((s) => s.firstName === 'Biz' && s.lastName === 'BizTest');
console.log('Biz BizTest sim:', biz ? `${biz.id} (0x${biz.id.toString(16)})` : 'NOT FOUND');
if (!biz) {
  console.log('  Sims with "Biz" first name:', data.sims.filter((s) => s.firstName === 'Biz').map((s) => `${s.firstName} ${s.lastName} → ${s.id}`));
  console.log('  Sims with BizTest:', data.sims.filter((s) => s.lastName.includes('Biz')).map((s) => `${s.firstName} ${s.lastName} → ${s.id}`));
}

const lot = data.lots.find((l) => l.name === 'Caminito del Deseo' || l.name === 'Caminito Del Deseo');
console.log('Caminito del Deseo lot:', lot ? `${lot.id} (0x${lot.id.toString(16)}) field5=${lot.field5}` : 'NOT FOUND');

console.log('\nObserved Test123 Shop IDs:');
console.log('  outer.f1 = 0x235169316f101b7 (business_id)');
console.log('  outer.f3.f1 = 0x235169201e8dca3');
console.log('  outer.f3.f4 = 0x235169316f101b8');
console.log('  SmallBizData.f8 wraps fixed64 = 0x023516_9316f101b8 (need to decode bytes 09 b8 01 f1 16 93 16 35 02)');
console.log('  SmallBizData.f14 wraps fixed64 = 0x023516_9201e8dca3 (bytes a3 dc e8 01 92 16 35 02)');
console.log('  SmallBizData.f18 wraps fixed64 = 0x023516_9201e90d7c (bytes 7c 0d e9 01 92 16 35 02)');
