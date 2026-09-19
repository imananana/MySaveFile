// tsx resolves this relative to this file's location:
// server/src/db/ -> ../../../src/data/worlds
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { WORLDS_DATA, WORLD_NAMES } = require('../../../src/data/worlds') as typeof import('../../../src/data/worlds');

export interface LotSeedRow {
  lotKey: string;
  worldName: string;
  lotName: string;
  location: string;
  defaultType: string;
  size: string;
}

let _cache: LotSeedRow[] | null = null;

export function getSeedLots(): LotSeedRow[] {
  if (_cache) return _cache;
  const result: LotSeedRow[] = [];
  for (const worldName of WORLD_NAMES) {
    const world = WORLDS_DATA[worldName as keyof typeof WORLDS_DATA];
    for (const lot of world.lots) {
      result.push({
        lotKey: `${worldName}::${lot.name}`,
        worldName,
        lotName: lot.name,
        location: (lot as { location?: string }).location ?? '',
        defaultType: lot.type,
        size: (lot as { size?: string }).size ?? '',
      });
    }
  }
  _cache = result;
  return result;
}
