/**
 * In-game Dynasty (EP21 royalty system) trait catalog: tuning ID -> role / perk.
 * Generated from an S4 Studio Dynasty export by
 * scripts/diagnostics/buildStockDynasties.ts. Do not edit by hand.
 *
 * Keys are trait uids (hex) as they appear in a sim's parsed traitIds, so a
 * member's role + unlocked perks resolve directly from traits. The dynasty
 * grouping (which sims, name, description) comes from the 0x0d save record.
 */

export interface StockDynastyRole {
  name: string;
  /** Higher wins when a sim carries several role traits (e.g. Founder+Head). */
  precedence: number;
}

export interface StockDynastyPerk {
  name: string;
  /** Mental | Physical | Creative | Social | EasyFriends | GradeBoost | Matchmaker | PartyPlanner | Secretive */
  category: string;
  tier: number;
  iconInstance: string | null;
}

export const STOCK_DYNASTY_ROLES: Record<string, StockDynastyRole> = {
  "0x71e5f": { name: "Head", precedence: 100 },
  "0x71e5e": { name: "Heir", precedence: 90 },
  "0x72b7a": { name: "Black Sheep (Resentful)", precedence: 80 },
  "0x72b7b": { name: "Black Sheep (Repentful)", precedence: 80 },
  "0x71e60": { name: "Black Sheep", precedence: 70 },
  "0x71e5d": { name: "Founder", precedence: 60 },
  "0x71e5c": { name: "Member", precedence: 10 },
};

/** Ideal/skill encouragement MARKERS — trait ids on the actively-played dynasty's
 *  members (distinct from the ideal/skill VALUES the dynasty record stores). */
export const STOCK_DYNASTY_IDEAL_MARKERS: Record<string, string> = {
  "0x73fa7": "Discouraged Ideal",
  "0x73fa6": "Encouraged Ideal",
  "0x73fa8": "Encouraged Skill",
};

/** Dynasty IDEAL values — the tuning ids stored in the save's definition record
 *  (field 7). Key = uid (hex). Every dynasty (premade included) carries 0..n of these. */
export const STOCK_DYNASTY_IDEALS: Record<string, string> = {
  "0x723c5": "Artistic",
  "0x723bd": "Bold",
  "0x723be": "Caring",
  "0x72883": "Connoisseur",
  "0x723c8": "Devious",
  "0x723c2": "Diplomatic",
  "0x723c3": "Hardworking",
  "0x723c7": "Jolly",
  "0x723ba": "Mysterious",
  "0x723c6": "Nature Loving",
  "0x723bc": "Passionate",
  "0x723c4": "Scholarly",
  "0x723bb": "Vicious",
};

/** Dynasty SKILL values — tuning ids stored alongside ideals in the same field-7 list. */
export const STOCK_DYNASTY_SKILLS: Record<string, string> = {
  "0x723fc": "Acting",
  "0x7240d": "Apothecary",
  "0x72417": "Archaeology",
  "0x7240f": "Archery",
  "0x723f5": "Baking",
  "0x723cd": "Bartending",
  "0x72418": "Bowling",
  "0x723ce": "Charisma",
  "0x723cf": "Comedy",
  "0x723ea": "Cooking",
  "0x72405": "Cross-Stitch",
  "0x723f6": "Dancing",
  "0x76708": "Diving",
  "0x723f7": "DJ Mixing",
  "0x766b3": "Entomology",
  "0x72406": "Entrepreneur",
  "0x72400": "Fabrication",
  "0x723d0": "Fishing",
  "0x723d1": "Fitness",
  "0x723fb": "Flower Arranging",
  "0x723d2": "Gardening",
  "0x7241b": "Gemology",
  "0x723d3": "Gourmet Cooking",
  "0x723e8": "Guitar",
  "0x723e9": "Handiness",
  "0x72528": "Herbalism",
  "0x72527": "Horse Riding",
  "0x72401": "Juice Fizzing",
  "0x72419": "Knitting",
  "0x723eb": "Logic",
  "0x723fd": "Media Production",
  "0x7241a": "Medium",
  "0x723ec": "Mischief",
  "0x74c86": "Natural Living",
  "0x72408": "Nectar Making",
  "0x723ed": "Painting",
  "0x72410": "Papercraft",
  "0x72416": "Parenting",
  "0x723ee": "Photography",
  "0x723ef": "Piano",
  "0x72414": "Pipe Organ",
  "0x7240b": "Pottery",
  "0x723f0": "Programming",
  "0x723fe": "Research & Debate",
  "0x723ff": "Robotics",
  "0x72402": "Rock Climbing",
  "0x723f1": "Rocket Science",
  "0x72409": "Romance",
  "0x723f8": "Singing",
  "0x72403": "Skiing",
  "0x72404": "Snowboarding",
  "0x72411": "Swordsmanship",
  "0x7240c": "Tattooing",
  "0x7240a": "Thanatology",
  "0x72415": "Vampire Lore",
  "0x723f2": "Video Gaming",
  "0x723f3": "Violin",
  "0x72413": "Wellness",
  "0x723f4": "Writing",
};

export const STOCK_DYNASTY_PERKS: Record<string, StockDynastyPerk> = {
  "0x71c39": { name: "Mild Creative Affinity", category: "Creative", tier: 1, iconInstance: "f2d8b729f32b4877" },
  "0x71c3a": { name: "Moderate Creative Affinity", category: "Creative", tier: 2, iconInstance: "f2d8b729f32b4874" },
  "0x71c3b": { name: "Strong Creative Affinity", category: "Creative", tier: 3, iconInstance: "f2d8b729f32b4875" },
  "0x78d90": { name: "Easy Friends I", category: "EasyFriends", tier: 1, iconInstance: null },
  "0x78d93": { name: "Easy Friends II", category: "EasyFriends", tier: 2, iconInstance: null },
  "0x78d94": { name: "Easy Friends III", category: "EasyFriends", tier: 3, iconInstance: null },
  "0x78d8f": { name: "Grade Boost I", category: "GradeBoost", tier: 1, iconInstance: null },
  "0x78d95": { name: "Grade Boost II", category: "GradeBoost", tier: 2, iconInstance: null },
  "0x78d96": { name: "Grade Boost III", category: "GradeBoost", tier: 3, iconInstance: null },
  "0x78d91": { name: "Matchmaker I", category: "Matchmaker", tier: 1, iconInstance: null },
  "0x78d97": { name: "Matchmaker II", category: "Matchmaker", tier: 2, iconInstance: null },
  "0x78d98": { name: "Matchmaker III", category: "Matchmaker", tier: 3, iconInstance: null },
  "0x71c33": { name: "Mild Mental Affinity", category: "Mental", tier: 1, iconInstance: "d854b25800135517" },
  "0x71c34": { name: "Moderate Mental Affinity", category: "Mental", tier: 2, iconInstance: "d854b25800135514" },
  "0x71c35": { name: "Strong Mental Affinity", category: "Mental", tier: 3, iconInstance: "d854b25800135515" },
  "0x76839": { name: "Party Planner I", category: "PartyPlanner", tier: 1, iconInstance: null },
  "0x7683a": { name: "Party Planner II", category: "PartyPlanner", tier: 2, iconInstance: null },
  "0x7683b": { name: "Party Planner III", category: "PartyPlanner", tier: 3, iconInstance: null },
  "0x71c36": { name: "Mild Physical Affinity", category: "Physical", tier: 1, iconInstance: "8e25267d81db1693" },
  "0x71c37": { name: "Moderate Physical Affinity", category: "Physical", tier: 2, iconInstance: "8e25267d81db1690" },
  "0x71c38": { name: "Strong Physical Affinity", category: "Physical", tier: 3, iconInstance: "8e25267d81db1691" },
  "0x78d92": { name: "Secretive I", category: "Secretive", tier: 1, iconInstance: null },
  "0x78d99": { name: "Secretive II", category: "Secretive", tier: 2, iconInstance: null },
  "0x78d9a": { name: "Secretive III", category: "Secretive", tier: 3, iconInstance: null },
  "0x71c3c": { name: "Mild Social Affinity", category: "Social", tier: 1, iconInstance: "55594d224ff11645" },
  "0x71c3d": { name: "Moderate Social Affinity", category: "Social", tier: 2, iconInstance: "55594d224ff11646" },
  "0x71c3e": { name: "Strong Social Affinity", category: "Social", tier: 3, iconInstance: "55594d224ff11647" },
};

/** Resolve a sim's displayed dynasty role from their trait ids (hex strings). */
export function resolveDynastyRole(traitHexIds: string[]): string | null {
  let best: StockDynastyRole | null = null;
  for (const id of traitHexIds) {
    const r = STOCK_DYNASTY_ROLES[id];
    if (r && (!best || r.precedence > best.precedence)) best = r;
  }
  return best ? best.name : null;
}

/** A sim's unlocked dynasty perks, resolved from trait ids (hex strings). */
export function resolveDynastyPerks(traitHexIds: string[]): StockDynastyPerk[] {
  return traitHexIds.map((id) => STOCK_DYNASTY_PERKS[id]).filter((p): p is StockDynastyPerk => !!p);
}

export interface StockCrestPiece {
  /** filename in /dynasty-crests/<asset>.png */
  asset: string;
  kind: 'bg' | 'fg';
  style?: number;
  color?: string;
  symbol?: string;
}

/** Crest resource-instance hash (16-char hex, as stored varint-encoded in the save) -> piece. */
export const STOCK_DYNASTY_CRESTS: Record<string, StockCrestPiece> = {
  "80a2ebec646e1ce4": { asset: "crest_bg_style0_blue", kind: "bg", style: 0, color: "blue" },
  "077516ed0a51486f": { asset: "crest_bg_style0_crimson", kind: "bg", style: 0, color: "crimson" },
  "84fd92d7fc310d91": { asset: "crest_bg_style0_green", kind: "bg", style: 0, color: "green" },
  "e0cb494bfa32d45e": { asset: "crest_bg_style0_orange", kind: "bg", style: 0, color: "orange" },
  "fb1b912aea46f4bd": { asset: "crest_bg_style0_red", kind: "bg", style: 0, color: "red" },
  "fb22a12aea4d2ed9": { asset: "crest_bg_style0_tan", kind: "bg", style: 0, color: "tan" },
  "07902213069dc203": { asset: "crest_bg_style1_blue", kind: "bg", style: 1, color: "blue" },
  "179e6531c4747de6": { asset: "crest_bg_style1_crimson", kind: "bg", style: 1, color: "crimson" },
  "54181d6cadcd8428": { asset: "crest_bg_style1_green", kind: "bg", style: 1, color: "green" },
  "aab91465cc701595": { asset: "crest_bg_style1_orange", kind: "bg", style: 1, color: "orange" },
  "cdcead2487c85d78": { asset: "crest_bg_style1_red", kind: "bg", style: 1, color: "red" },
  "cdd4b52487ccd60c": { asset: "crest_bg_style1_tan", kind: "bg", style: 1, color: "tan" },
  "20290209967eea82": { asset: "crest_bg_style2_blue", kind: "bg", style: 2, color: "blue" },
  "e568e876f33ab081": { asset: "crest_bg_style2_crimson", kind: "bg", style: 2, color: "crimson" },
  "adadc03282b93333": { asset: "crest_bg_style2_green", kind: "bg", style: 2, color: "green" },
  "cf6ea38e98b6b888": { asset: "crest_bg_style2_orange", kind: "bg", style: 2, color: "orange" },
  "28a8cd3dd07f7db7": { asset: "crest_bg_style2_red", kind: "bg", style: 2, color: "red" },
  "28a2053dd079be23": { asset: "crest_bg_style2_tan", kind: "bg", style: 2, color: "tan" },
  "d352061be5b2cc71": { asset: "crest_bg_style3_blue", kind: "bg", style: 3, color: "blue" },
  "5b54f0209a58a608": { asset: "crest_bg_style3_crimson", kind: "bg", style: 3, color: "crimson" },
  "8153a23cf96dc4ca": { asset: "crest_bg_style3_green", kind: "bg", style: 3, color: "green" },
  "e028cce64552177f": { asset: "crest_bg_style3_orange", kind: "bg", style: 3, color: "orange" },
  "d242a136351516ba": { asset: "crest_bg_style3_red", kind: "bg", style: 3, color: "red" },
  "d23b9936350eeaf6": { asset: "crest_bg_style3_tan", kind: "bg", style: 3, color: "tan" },
  "2079bc34652f7808": { asset: "crest_bg_style4_blue", kind: "bg", style: 4, color: "blue" },
  "6b4a0cbd5e162fcb": { asset: "crest_bg_style4_crimson", kind: "bg", style: 4, color: "crimson" },
  "dc7e08f04444b305": { asset: "crest_bg_style4_green", kind: "bg", style: 4, color: "green" },
  "31530f8248ba303a": { asset: "crest_bg_style4_orange", kind: "bg", style: 4, color: "orange" },
  "9ef8b10c7a76e851": { asset: "crest_bg_style4_red", kind: "bg", style: 4, color: "red" },
  "9ee3890c7a64485d": { asset: "crest_bg_style4_tan", kind: "bg", style: 4, color: "tan" },
  "ad27ea04d1ff5f57": { asset: "crest_bg_style5_blue", kind: "bg", style: 5, color: "blue" },
  "75bd1883883f7692": { asset: "crest_bg_style5_crimson", kind: "bg", style: 5, color: "crimson" },
  "fc7e5907a647697c": { asset: "crest_bg_style5_green", kind: "bg", style: 5, color: "green" },
  "e5efe8b542a36ed1": { asset: "crest_bg_style5_orange", kind: "bg", style: 5, color: "orange" },
  "c82fbd012ff7d72c": { asset: "crest_bg_style5_red", kind: "bg", style: 5, color: "red" },
  "c81b9d012fe6f7b0": { asset: "crest_bg_style5_tan", kind: "bg", style: 5, color: "tan" },
  "994179fa26118186": { asset: "crest_bg_style6_blue", kind: "bg", style: 6, color: "blue" },
  "91e32babeffe934d": { asset: "crest_bg_style6_crimson", kind: "bg", style: 6, color: "crimson" },
  "c1ef0a390568db07": { asset: "crest_bg_style6_green", kind: "bg", style: 6, color: "green" },
  "78e4b8229fa54f84": { asset: "crest_bg_style6_orange", kind: "bg", style: 6, color: "orange" },
  "229ded1a7853f42b": { asset: "crest_bg_style6_red", kind: "bg", style: 6, color: "red" },
  "22b1cd1a78646697": { asset: "crest_bg_style6_tan", kind: "bg", style: 6, color: "tan" },
  "20b7c020c8b68ff5": { asset: "crest_bg_style7_blue", kind: "bg", style: 7, color: "blue" },
  "f38f50fd8c17a484": { asset: "crest_bg_style7_crimson", kind: "bg", style: 7, color: "crimson" },
  "c1fe94cd41fc96ee": { asset: "crest_bg_style7_green", kind: "bg", style: 7, color: "green" },
  "42340489ea76a7eb": { asset: "crest_bg_style7_orange", kind: "bg", style: 7, color: "orange" },
  "f550011415d39b9e": { asset: "crest_bg_style7_red", kind: "bg", style: 7, color: "red" },
  "f564e11415e5c1ca": { asset: "crest_bg_style7_tan", kind: "bg", style: 7, color: "tan" },
  "e66745c5b2cec01c": { asset: "crest_bg_style8_blue", kind: "bg", style: 8, color: "blue" },
  "9dad22268c2133e7": { asset: "crest_bg_style8_crimson", kind: "bg", style: 8, color: "crimson" },
  "5fd7e7187b6fa159": { asset: "crest_bg_style8_green", kind: "bg", style: 8, color: "green" },
  "dbbe1a4f72edef86": { asset: "crest_bg_style8_orange", kind: "bg", style: 8, color: "orange" },
  "85f4e16dead04fd5": { asset: "crest_bg_style8_red", kind: "bg", style: 8, color: "red" },
  "85fbf16dead689e1": { asset: "crest_bg_style8_tan", kind: "bg", style: 8, color: "tan" },
  "6d559bec55004fdb": { asset: "crest_bg_style9_blue", kind: "bg", style: 9, color: "blue" },
  "6b5d8e53de3964de": { asset: "crest_bg_style9_crimson", kind: "bg", style: 9, color: "crimson" },
  "1b7551ac917c9030": { asset: "crest_bg_style9_green", kind: "bg", style: 9, color: "green" },
  "e86cc580981292bd": { asset: "crest_bg_style9_orange", kind: "bg", style: 9, color: "orange" },
  "583afd6787f4e670": { asset: "crest_bg_style9_red", kind: "bg", style: 9, color: "red" },
  "5842056787fb1234": { asset: "crest_bg_style9_tan", kind: "bg", style: 9, color: "tan" },
  "02c0ed1115e296f7": { asset: "crest_fg_anchor", kind: "fg", symbol: "anchor" },
  "1389836d587160bd": { asset: "crest_fg_bird", kind: "fg", symbol: "bird" },
  "0858c85051a6db43": { asset: "crest_fg_blossom", kind: "fg", symbol: "blossom" },
  "13909e6d5877ad03": { asset: "crest_fg_book", kind: "fg", symbol: "book" },
  "6d966ed91cb602ab": { asset: "crest_fg_cacao", kind: "fg", symbol: "cacao" },
  "3ecb31049d38f084": { asset: "crest_fg_compass", kind: "fg", symbol: "compass" },
  "c69d92962d40b020": { asset: "crest_fg_cowplant", kind: "fg", symbol: "cowplant" },
  "9cd5d01b8198cfc3": { asset: "crest_fg_cowrie", kind: "fg", symbol: "cowrie" },
  "e135926d3c66a60c": { asset: "crest_fg_deer", kind: "fg", symbol: "deer" },
  "6f1828f3a0da7521": { asset: "crest_fg_feather", kind: "fg", symbol: "feather" },
  "bfc632e7dbb7705a": { asset: "crest_fg_fencing", kind: "fg", symbol: "fencing" },
  "f36ff66d46fb8cb2": { asset: "crest_fg_fish", kind: "fg", symbol: "fish" },
  "510109e9e3558e29": { asset: "crest_fg_gem", kind: "fg", symbol: "gem" },
  "7c1bcc02c1e81ae8": { asset: "crest_fg_heart", kind: "fg", symbol: "heart" },
  "10a03a197ab3e2b7": { asset: "crest_fg_hydrangea", kind: "fg", symbol: "hydrangea" },
  "ea4030df1a325b1d": { asset: "crest_fg_lemon", kind: "fg", symbol: "lemon" },
  "9df6e1deef75e46f": { asset: "crest_fg_llama", kind: "fg", symbol: "llama" },
  "2d64156d670caeec": { asset: "crest_fg_mask", kind: "fg", symbol: "mask" },
  "511c0be9e36c590e": { asset: "crest_fg_owl", kind: "fg", symbol: "owl" },
  "f02071fdbff7badd": { asset: "crest_fg_phoenix", kind: "fg", symbol: "phoenix" },
  "c3e2a61f6a869e6d": { asset: "crest_fg_plantain", kind: "fg", symbol: "plantain" },
  "8aabfa6d0b696bf9": { asset: "crest_fg_rose", kind: "fg", symbol: "rose" },
  "f0b9de1cb967da64": { asset: "crest_fg_seahorse", kind: "fg", symbol: "seahorse" },
  "768fd25057713222": { asset: "crest_fg_squid", kind: "fg", symbol: "squid" },
  "e6e02c780432d20e": { asset: "crest_fg_swords", kind: "fg", symbol: "swords" },
  "1ef17b4441159321": { asset: "crest_fg_tortoise", kind: "fg", symbol: "tortoise" },
  "32371355200d911b": { asset: "crest_fg_tridents", kind: "fg", symbol: "tridents" },
  "1c608a9abd512f54": { asset: "crest_fg_unicorn", kind: "fg", symbol: "unicorn" },
};

/** Resolve a dynasty crest from its two save hashes (fg symbol over bg shape/color). */
export function resolveCrest(bgHash: string | null, fgHash: string | null): { bg: StockCrestPiece | null; fg: StockCrestPiece | null } {
  return {
    bg: bgHash ? STOCK_DYNASTY_CRESTS[bgHash.toLowerCase().padStart(16, '0')] ?? null : null,
    fg: fgHash ? STOCK_DYNASTY_CRESTS[fgHash.toLowerCase().padStart(16, '0')] ?? null : null,
  };
}

/** Split a dynasty's field-7 value-id list (hex) into named ideals + skills. */
export function resolveDynastyValues(valueHexIds: string[]): { ideals: string[]; skills: string[] } {
  const ideals: string[] = [];
  const skills: string[] = [];
  for (const id of valueHexIds) {
    if (STOCK_DYNASTY_IDEALS[id]) ideals.push(STOCK_DYNASTY_IDEALS[id]);
    else if (STOCK_DYNASTY_SKILLS[id]) skills.push(STOCK_DYNASTY_SKILLS[id]);
  }
  return { ideals, skills };
}
