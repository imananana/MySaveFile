import type { WorldName } from './worlds';

// Per-world bubble art, served from /public and named by REGION ID — the same
// convention as skills/careers/criteria (every icon keyed by the id its data uses).
// Region ids come from STOCK_REGIONS; Magnolia Promenade is the Get To Work retail
// world, internally "Retail" (0x1a8a0). Worlds with no region id (none currently)
// would fall back to a slug-named file.
export const WORLD_ICONS: Partial<Record<WorldName, string>> = {
  'Brindleton Bay': '/world-icons/28a93.png',
  'Britechester': '/world-icons/32fae.png',
  'Chestnut Ridge': '/world-icons/4bf91.png',
  'Ciudad Enamorada': '/world-icons/587b9.png',
  'Copperdale': '/world-icons/427ed.png',
  'Del Sol Valley': '/world-icons/2fba5.png',
  'Evergreen Harbor': '/world-icons/37b68.png',
  'Forgotten Hollow': '/world-icons/2526f.png',
  'Gibbi Point': '/world-icons/6b634.png',
  'Glimmerbrook': '/world-icons/34e32.png',
  'Granite Falls': '/world-icons/196a0.png',
  'Henford-on-Bagley': '/world-icons/3ed75.png',
  'Innisgreen': '/world-icons/66ce7.png',
  'Magnolia Promenade': '/world-icons/1a8a0.png',
  'Moonwood Mill': '/world-icons/45cd5.png',
  'Mt. Komorebi': '/world-icons/3a376.png',
  'Newcrest': '/world-icons/1d46d.png',
  'Nordhaven': '/world-icons/5ca0a.png',
  'Oasis Springs': '/world-icons/19681.png',
  'Ondarion': '/world-icons/71980.png',
  'Ravenwood': '/world-icons/5af47.png',
  'San Myshuno': '/world-icons/20c6c.png',
  'San Sequoia': '/world-icons/49f18.png',
  'Selvadorada': '/world-icons/2a619.png',
  'Strangerville': '/world-icons/313e3.png',
  'Sulani': '/world-icons/32db4.png',
  'Tartosa': '/world-icons/42701.png',
  'Tomarang': '/world-icons/52692.png',
  'Willow Creek': '/world-icons/19680.png',
  'Windenburg': '/world-icons/1e0f9.png',
};

// Region id (hex, no 0x prefix) → world-bubble icon, for the `region` role-criterion
// resolver (criterionValueIcons). Same files as WORLD_ICONS, keyed the way the
// criterion stores its value. Regions without per-world art simply have no entry.
export const REGION_ICONS: Record<string, string> = {
  '28a93': '/world-icons/28a93.png',
  '32fae': '/world-icons/32fae.png',
  '4bf91': '/world-icons/4bf91.png',
  '587b9': '/world-icons/587b9.png',
  '427ed': '/world-icons/427ed.png',
  '2fba5': '/world-icons/2fba5.png',
  '37b68': '/world-icons/37b68.png',
  '2526f': '/world-icons/2526f.png',
  '6b634': '/world-icons/6b634.png',
  '34e32': '/world-icons/34e32.png',
  '196a0': '/world-icons/196a0.png',
  '3ed75': '/world-icons/3ed75.png',
  '66ce7': '/world-icons/66ce7.png',
  '1a8a0': '/world-icons/1a8a0.png',
  '45cd5': '/world-icons/45cd5.png',
  '3a376': '/world-icons/3a376.png',
  '1d46d': '/world-icons/1d46d.png',
  '5ca0a': '/world-icons/5ca0a.png',
  '19681': '/world-icons/19681.png',
  '71980': '/world-icons/71980.png',
  '5af47': '/world-icons/5af47.png',
  '20c6c': '/world-icons/20c6c.png',
  '49f18': '/world-icons/49f18.png',
  '2a619': '/world-icons/2a619.png',
  '313e3': '/world-icons/313e3.png',
  '32db4': '/world-icons/32db4.png',
  '42701': '/world-icons/42701.png',
  '52692': '/world-icons/52692.png',
  '19680': '/world-icons/19680.png',
  '1e0f9': '/world-icons/1e0f9.png',
};
