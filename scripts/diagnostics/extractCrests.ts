import { readFileSync, writeFileSync } from 'fs';
const html = readFileSync(`${process.env.HOME}/Desktop/icons.html`, 'latin1');
// Split into icon-item blocks; each crest block has an <img data:png>, a <span>name</span>, and a resource-key div.
const blocks = html.split('<div class="icon-item">');
let n = 0; const manifest: Record<string,{name:string;instance:string}> = {};
for (const b of blocks) {
  const nameM = b.match(/<span>\s*headline_(crest_(?:bg|fg)_[a-z0-9_]+)\s*<\/span>/i);
  if (!nameM) continue;
  const name = nameM[1].toLowerCase();
  const keyM = b.match(/2f7d0004:0+:([0-9a-f]+)/i);
  const imgM = b.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
  if (!keyM || !imgM) { console.log(`!! ${name}: missing ${!keyM?'key':'img'}`); continue; }
  const instance = keyM[1].toLowerCase();
  writeFileSync(`public/dynasty-crests/${name}.png`, Buffer.from(imgM[1], 'base64'));
  manifest[name] = { name, instance };
  n++;
}
writeFileSync('public/dynasty-crests/_manifest.json', JSON.stringify(manifest, null, 2));
const bg = Object.keys(manifest).filter(k=>k.includes('_bg_')).length;
const fg = Object.keys(manifest).filter(k=>k.includes('_fg_')).length;
console.log(`extracted ${n} crest pngs -> public/dynasty-crests/  (bg=${bg}, fg=${fg})`);
