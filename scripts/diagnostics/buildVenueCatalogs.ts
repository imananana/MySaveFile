/**
 * Build stockOccults.ts + stockRegions.ts from the ~/Documents/Occult and
 * ~/Documents/Region tuning dumps. Filename instance = the id a custom-venue
 * criterion stores (occult = a trait id; region = a region id). Names are the
 * confirmed tuning identifier, prettified. NOTE: region internal names are EA
 * codenames for most worlds (only some match the display world) — not remapped
 * to display names (no confirmed source); occult names are the occult type.
 * Run: npx tsx scripts/diagnostics/buildVenueCatalogs.ts
 */
import { readdirSync, writeFileSync } from 'fs';
const HOME = process.env.HOME!;
const prettify = (n: string) => n.replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').trim();
const norm = (hex: string) => '0x' + parseInt(hex, 16).toString(16);

// ---- Occult: trait id -> occult type (strip trait_Occult prefix + _Manifested) ----
const occults: Record<string, string> = {};
for (const f of readdirSync(`${HOME}/Documents/Occult`)) {
  // MAIN occult-type traits only (single word + optional _Manifested); exclude
  // sub-traits (Temperaments, Dark Form, …) that aren't occult-type markers.
  const m = f.match(/!0*([0-9A-F]+)\.trait_Occult([A-Z][a-z]+)(?:_Manifested)?\.TraitTuning\.xml$/);
  if (!m) continue;
  occults[norm(m[1])] = m[2];
}
// ---- Region: region id -> display world. Internal names are EA codenames;
// these display-world overrides were user-confirmed (else prettified internal). ----
const REGION_DISPLAY: Record<string, string> = {
  NorthEurope: 'Windenburg', CityLife: 'San Myshuno', PetWorld: 'Brindleton Bay',
  FameWorld: 'Del Sol Valley', IslandWorld: 'Sulani', UniversityWorld: 'Britechester',
  EcoWorld: 'Evergreen Harbor', MountainWorld: 'Mt. Komorebi', CottageWorld: 'Henford-on-Bagley',
  HighSchoolWorld: 'Copperdale', BayArea: 'San Sequoia', VampireWorld: 'Forgotten Hollow',
  Magic: 'Glimmerbrook', Jungle: 'Selvadorada', CampingForest: 'Granite Falls',
  WeddingWorld: 'Tartosa', WolfTown: 'Moonwood Mill', Strangetown: 'Strangerville', Batuu: 'Batuu',
  EP14World: 'Chestnut Ridge', MultiUnitWorld: 'Tomarang', EP16World: 'Ciudad Enamorada',
  EP17World: 'Ravenwood', EP18World: 'Nordhaven', EP19World: 'Innisgreen',
  EP20World: 'Gibbi Point', EP21World: 'Ondarion',
};
const regions: Record<string, string> = {};
for (const f of readdirSync(`${HOME}/Documents/Region`)) {
  const m = f.match(/!0*([0-9A-F]+)\.region_[A-Za-z]+_([A-Za-z0-9]+)\.RegionTuning\.xml$/);
  if (!m) continue;
  regions[norm(m[1])] = REGION_DISPLAY[m[2]] ?? prettify(m[2]);
}
const emit = (obj: Record<string,string>) => Object.entries(obj).sort((a,b)=>a[1].localeCompare(b[1])).map(([k,v])=>`  '${k}': ${JSON.stringify(v)},`).join('\n');
// NOTE: stockOccults.ts is now HAND-MAINTAINED from seed-confirmed criterion values
// (filename derivation was unreliable — Fairy/Ghost/Spellcaster/NoOccult use odd
// trait variants). This builder no longer writes it. `occults` is kept for reference.
void occults;
writeFileSync('src/data/stockRegions.ts', `// Region id -> display world (EA codenames mapped via user-confirmed overrides).\n// Generated from ~/Documents/Region (filename instance = region id).\nexport const STOCK_REGIONS: Record<string, string> = {\n${emit(regions)}\n};\n`);
console.log(`regions: ${Object.keys(regions).length} (occults are hand-maintained in stockOccults.ts)`);
console.log(`  region 0x1d46d -> ${regions['0x1d46d']}`);
