import { readFileSync, writeFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_02220000.save`;
const buf = readFileSync(savePath);
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

// Parse DBPF index
const indexCount = view.getUint32(36, true);
const indexOffset = view.getUint32(64, true);
let pos = indexOffset + 4;

const SEARCH_TERMS = ['Vibrant Entrepreneur', 'Selby', 'Household', 'household'];

for (let i = 0; i < indexCount; i++) {
  const base = pos + i * 32;
  const type = view.getUint32(base, true);
  const offset = view.getUint32(base + 16, true);
  const sizeComp = view.getUint32(base + 20, true) & 0x7fffffff;
  const compType = view.getUint16(base + 28, true);

  let data = buf.slice(offset, offset + sizeComp);

  if (compType === 0xffff) {
    try {
      const patched = Buffer.from(data);
      if (patched[1] === 0xfb && patched[0] !== 0x10) patched[0] = 0x10;
      data = decompress(patched);
    } catch { continue; }
  }

  const text = data.toString('latin1');

  for (const term of SEARCH_TERMS) {
    let idx = text.indexOf(term);
    while (idx !== -1) {
      // Print surrounding context
      const start = Math.max(0, idx - 30);
      const end = Math.min(text.length, idx + term.length + 30);
      const context = [...text.slice(start, end)].map(c => {
        const code = c.charCodeAt(0);
        return code >= 0x20 && code < 0x7f ? c : `\\x${code.toString(16).padStart(2,'0')}`;
      }).join('');
      console.log(`[type=0x${type.toString(16).padStart(8,'0')} chunk=${i}] "${term}" at byte ${idx}: ...${context}...`);
      idx = text.indexOf(term, idx + 1);
      if (idx > 0 && term === 'Household') break; // limit noise for common terms
    }
  }
}
