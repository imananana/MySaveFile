import { readFileSync, writeFileSync } from 'fs';
const html = readFileSync(`${process.env.HOME}/Desktop/icons.html`, 'latin1');
const blocks = html.split('<div class="icon-item">');
const counts: Record<string, number> = { skill: 0, ideal: 0, career: 0 };
for (const b of blocks) {
  const nameM = b.match(/<span>\s*([A-Za-z0-9_]+)\s*<\/span>/);
  if (!nameM) continue;
  const name = nameM[1].toLowerCase();
  let dest: string | null = null;
  if (/^skill_[a-z0-9]+$/.test(name)) dest = `public/skill-icons/${name.slice(6)}.png`;
  else if (/^ideal[a-z0-9]+$/.test(name)) dest = `public/ideal-icons/${name.slice(5)}.png`;
  else if (/^career_[a-z0-9]+$/.test(name) && !/_main$|_piemenu$|_hires$/.test(name)) dest = `public/career-icons/${name.slice(7)}.png`;
  if (!dest) continue;
  const imgM = b.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
  if (!imgM) continue;
  writeFileSync(dest, Buffer.from(imgM[1], 'base64'));
  counts[dest.split('/')[1].split('-')[0]]++;
}
console.log(`extracted: ${counts.skill} skills, ${counts.ideal} ideals, ${counts.career} careers`);
