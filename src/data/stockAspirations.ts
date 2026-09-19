/**
 * CAS-pickable aspiration catalog: tuning ID → display name + the
 * lifestages eligible to CAS-pick it.
 *
 * Generated from an S4 Studio AspirationTrackTuning dump. Lifestage gating
 * comes from each track's <T n="category"> ref (Asp_Cat_* → teen+adult,
 * Asp_Teen → teen-only, Asp_Chld_* → child-only). Tutorial and challenge
 * categories are filtered out. 88 entries.
 *
 * Re-run scripts/diagnostics/buildStockAspirations.ts after a new game/
 * pack release to refresh this catalog.
 */
import type { ParsedLifestage } from '../lib/parser/types';

export interface StockAspiration {
  name: string;
  description: string;
  ages: ParsedLifestage[];
  iconInstance: string | null; // resource instance hex of the icon texture, used as the filename in /aspiration-icons/<hex>.png
}

export const STOCK_ASPIRATIONS: Record<string, StockAspiration> = {
  '0x3a954': { name: "{F0.Lady}{M0.Lord} of the Knits", description: "This Sim has yarn running through {F0.her}{M0.his} veins and will stop at nothing on {F0.her}{M0.his} quest to craft the perfect knittable!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '5f1ef50da3fd41c6' },
  '0x3771b': { name: "Academic", description: "", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: 'b6fec9aa1a0c1e69' },
  '0x45122': { name: "Admired Icon", description: "This Sim wants to be a trend setter, popular, and influential. A true icon.", ages: ['teen'], iconInstance: '1eb09ac929769816' },
  '0x9ec8': { name: "Angling Ace", description: "This Sim wants to know everything about fishing!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '3e51d46c9f69ed11' },
  '0x52c3a': { name: "Appliance Wiz", description: "This Sim knows their way around small kitchen appliances!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '15d94b995fecf93b' },
  '0x2bb4d': { name: "Archaeology Scholar", description: "This Sim wants to understand Archaeology.", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: 'ea9fce5075237ccc' },
  '0x645b': { name: "Artistic Prodigy", description: "This Sim has dreams of succeeding in the arts!", ages: ['child'], iconInstance: '33caac074dc6fba2' },
  '0x33c00': { name: "Beach Life", description: "This Sim wants to take it slow and enjoy beach life.", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '0e2aa5e514607617' },
  '0x63cc': { name: "Bestselling Author", description: "This Sim wants to write books and become a famous author!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: 'f23eddadc994f7f0' },
  '0x64ba': { name: "Big Happy Family", description: "This Sim wants to build a large, loving household!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '47084bf01667c612' },
  '0x621a': { name: "Bodybuilder", description: "This Sim wants to work out and become as strong as they can be!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '278276d10d1851b1' },
  '0x4e774': { name: "Championship Rider", description: "This Sim wants to be one of the world's premiere Horse Riders and will prove it by participating in Horse Competitions.", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '091a755c889a71fb' },
  '0x6325': { name: "Chief of Mischief", description: "This Sim is all about pranks and mayhem!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '066f79c0c4f9275f' },
  '0x23633': { name: "City Native", description: "This Sim is all about the city life.", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '764978110e6d1904' },
  '0x6361': { name: "Computer Whiz", description: "This Sim wants to know everything about computers, from playing games to careers!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '70f4f2b9947509f6' },
  '0x6e74f': { name: "Cool Kid on the Block", description: "This Sim wants to be known as the coolest kid in the neighborhood!", ages: ['child'], iconInstance: 'f871f9231acd0753' },
  '0x3fb24': { name: "Country Caretaker", description: "Country Caretakers want to tend the countryside and befriend all animals and critters!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '4f8e518cd938acf2' },
  '0x4b4c1': { name: "Creative Genius", description: "This Sim wants to build their creative and mental skills to inspire innovation and play!", ages: ['child'], iconInstance: '23d194d2f4251c50' },
  '0x6e761': { name: "Critter Hunter", description: "This Sim wants to explore the rich worlds of butterflies and fish to learn all they can about critters!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '36a5ecc7e0e79877' },
  '0x5726f': { name: "Crystal Crafter", description: "This Sim wants to cut gemstones, craft jewelry, and harness the power of crystals!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '296eea206a1f8e65' },
  '0x53426': { name: "Discerning Dweller", description: "This Sim aspires to be the perfect Tenant and neighbor in a Residential Rental!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '87f1c2b1a04b9591' },
  '0x451e7': { name: "Drama Llama", description: "This Sim wants all the drama all the time.", ages: ['teen'], iconInstance: 'fe84b8f1bd7c66a4' },
  '0x38a67': { name: "Eco Innovator", description: "This Sim wants to build a better, greener community.", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: 'f31feb753b7bd44e' },
  '0x6c6b2': { name: "Elixir Enthusiast", description: "This Sim wants to learn everything there is to know about the Apothecary Skill and craft powerful Cures and Elixirs from plant-based ingredients.", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '1eaabe6f457ad7be' },
  '0x6357d': { name: "Esteemed Entrepreneur", description: "This Sim wants to run a small business full of happy customers, either through business practices rooted in idealistic dreams or tricky hustles based on pragmatic schemes.", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '466a280847347171' },
  '0x52cab': { name: "Expert Nectar Maker", description: "This Sim wants to master the art of Nectar Making, honing their abilities to consistently craft only the best Nectars. They also want to make an absurd amount of Simoleons doing it.", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '79cfa719781e6741' },
  '0x3d0e2': { name: "Extreme Sports Enthusiast", description: "This Sim wants to explore Mt. Komorebi's wilderness and participate in extreme snow sports.", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '0743be79d64d63d7' },
  '0x623c': { name: "Fabulously Wealthy", description: "This Sim wants to get rich and have a successful career!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: 'e9f9295e99d5ecc8' },
  '0x6c3f5': { name: "Fairy Stories", description: "This Sim wants to show the world just what kind of Fairy they can be.", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '358b1c2160e3497a' },
  '0x53427': { name: "Five-Star Property Owner", description: "This Sim wants to be the best Property Owner the world has ever seen!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '3ed82ad9bc559d5b' },
  '0x53428': { name: "Fount of Tomarani Knowledge", description: "This Sim wants to immerse themselves in everything Tomarang has to offer!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: 'c27ca782f4835bb9' },
  '0x9ec7': { name: "Freelance Botanist", description: "This Sim wants to grow plants and become an expert gardener!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '3e51d46c9f69ed12' },
  '0x29ef3': { name: "Friend of the Animals", description: "This Sim wants to be friends with the animals.", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '3533646cae066c21' },
  '0x62bc': { name: "Friend of the World", description: "This Sim wants to make and keep as many friends as they can!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: 'dad37710fe1cc331' },
  '0x38dbc': { name: "Galactic Privateer", description: "This Sim isn't about choosing sides, they're happy just mingling among the smugglers, and bounty hunters on the fringe planet of Batuu. Earning a few extra credits along the way is just a bonus, no matter how they get them.", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '56762c8b59a92295' },
  '0x5cd0d': { name: "Ghost Historian", description: "", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: 'ee3f1bab33788a5e' },
  '0x451e8': { name: "Goal Oriented", description: "This Sim wants to be the best: Grades? Check. Sports? Check. Money? Check! The road to success is being paved!", ages: ['teen'], iconInstance: '9824a665179f5e9d' },
  '0x25c9b': { name: "Good Vampire", description: "This Sim wants to control {M0.his}{F0.her} Thirst and remain as human as possible!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '340ebc370639bc4f' },
  '0x3b2e1': { name: "Hope VS Order", description: "On the world of Batuu there is a growing conflict. This Sim is out to explore Black Spire Outpost and understand whether they should stand with the Resistance or the First Order.", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '900be3c445384dfe' },
  '0x42202': { name: "Inner Peace", description: "This Sim is on a quest to achieve Inner Peace. Although true harmony is sometimes ephemeral, what's important is developing tools to help mitigate negative emotions.", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '55682bc3fb9cd11e' },
  '0x62bb': { name: "Joke Star", description: "This Sim wants to tell jokes and become a famous comedian!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: 'dad37710fe1cc332' },
  '0x2bb30': { name: "Jungle Explorer", description: "This Sim wants to explore the jungle!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '2000e7e209e30eca' },
  '0x1e01f': { name: "Leader of the Pack", description: "This Sim wants to be the leader of the best Club in town!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: 'ff846e527a4cf446' },
  '0x451e9': { name: "Live Fast", description: "This Sim aims to get the most out of life by living care-free and rules-free.", ages: ['teen'], iconInstance: '449efa9704fcf5c8' },
  '0x623d': { name: "Mansion Baron", description: "This Sim is all about owning the biggest, fanciest home!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: 'e9f9295e99d5eccb' },
  '0x51d73': { name: "Market Magnate", description: "This Sim wants to operate the most profitable Food Stand!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '4fddcd3cb6b9f50b' },
  '0x2f3f1': { name: "Master {F0.Actress}{M0.Actor}", description: "This Sim wants to hone their craft and become an acclaimed {F0.actress}{M0.actor}!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '35c087fab10b2085' },
  '0x2442': { name: "Master Chef", description: "This Sim wants to master the culinary arts!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: 'd7d5b1f961a3c9b6' },
  '0x388ae': { name: "Master Maker", description: "This Sim wants to become an expert at Fabrication!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '50b6852fd44de5c8' },
  '0x6357b': { name: "Master Mentor", description: "This Sim wants to learn from talented mentors, then pass that knowledge on to others.", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '6972de52d142c52c' },
  '0x2443': { name: "Master Mixologist", description: "This Sim wants to know everything there is to know about mixology!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: 'd7d5b1f961a3c9b5' },
  '0x784ee': { name: "Master of Grudges", description: "This Sim wants to resolve bitter feelings for an enemy through petty, but satisfying, vengeance.", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: 'ea16ccbe52036ef1' },
  '0x25eb8': { name: "Master Vampire", description: "This Sim wants to become a wise and powerful Vampire!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: 'd512d2b59c0ce23c' },
  '0x4b4bf': { name: "Mind and Body", description: "This Sim wants to master both their mind and body!", ages: ['child'], iconInstance: 'ec3c54221795e29b' },
  '0x3d0e3': { name: "Mt. Komorebi Sightseer", description: "This Sim wants to explore Mt. Komorebi's culture and experience everything it has to offer.", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: 'c3991f8638a197c1' },
  '0x63cd': { name: "Musical Genius", description: "This Sim wants to be an expert musician and songwriter!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: 'f23eddadc994f7f1' },
  '0x6c6b3': { name: "Nature Nomad", description: "This Sim embraces Natural Living and enjoys fulfilling their every need in the great outdoors.", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: 'b9c54f17a24488cc' },
  '0x42e5a': { name: "Neighborhood Confidante", description: "This Sim wants to provide all manner of advice, to be a positive influence in the lives of their neighbors.", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '2c88a37f12453d93' },
  '0x6362': { name: "Nerd Brain", description: "This Sim wants to be both book smart and handy!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '70f4f2b9947509f7' },
  '0x1a84d': { name: "Outdoor Enthusiast", description: "Outdoor Enthusiasts want to experience everything nature has to offer!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '1b55cb61297a4b0b' },
  '0x63cb': { name: "Painter Extraordinaire", description: "This Sim wants {M0.his}{F0.her} life to be all about art and painting!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: 'f23eddadc994f7f3' },
  '0x59d4a': { name: "Paragon Partner", description: "This Sim wants to have successful relationships with two or more Sims.", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '7ffbaaf14335cc71' },
  '0x62bd': { name: "Party Animal", description: "This Sim wants to throw and attend amazing parties!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: 'dad37710fe1cc330' },
  '0x4b4c0': { name: "Playtime Captain", description: "This Sim loves to seek out active play—with friends!", ages: ['child'], iconInstance: '70acdae0ab49ce4f' },
  '0x6324': { name: "Public Enemy", description: "This Sim wants to make enemies and be a famous criminal!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '066f79c0c4f9275c' },
  '0x35128': { name: "Purveyor of Potions", description: "This Sim wants to learn every potion's recipe and craft each one!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: 'fdfce978e3d7db4a' },
  '0x645a': { name: "Rambunctious Scamp", description: "This Sim wants to be playful and nimble!", ages: ['child'], iconInstance: '54668df5ba986503' },
  '0x6360': { name: "Renaissance Sim", description: "This Sim wants to be good at many things at once!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '70f4f2b9947509f5' },
  '0x59d4c': { name: "Romantic Explorer", description: "This Sim wants to explore all that romance has to offer.", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '07926f352966d338' },
  '0x53429': { name: "Seeker of Secrets", description: "This Sim loves the thrill of discovering juicy Secrets about other Sims. What they do with that information has yet to be decided...", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '9c879d4fcea8ee51' },
  '0x42205': { name: "Self-Care Specialist", description: "This Sim wants to make it big with monetizing Wellness activities like offering Manicures or Tending the Massage Table at a Spa.", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '357dfa50eecee88a' },
  '0x5d10': { name: "Serial Romantic", description: "This Sim wants to play the field and go on dates with all sorts of interesting people!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '4af7e32a19824922' },
  '0x4b4be': { name: "Slumber Party Animal", description: "This Sim wants to be the life of the party—in a uniquely creative way!", ages: ['child'], iconInstance: 'cb108ec3ffda20b6' },
  '0x645c': { name: "Social Butterfly", description: "This Sim wants to talk to everyone and make friends!", ages: ['child'], iconInstance: 'c75ad63dd21c9de3' },
  '0x78fac': { name: "Social Puppeteer", description: "This Sim wants to know everyone's business and are able to extort, and expose scandals about whoever they please!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '16b0c78eba7fb627' },
  '0x24fd': { name: "Soulmate", description: "This Sim wants to find and live a rewarding life with \"The One\"!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '4af7e32a19824921' },
  '0x3511b': { name: "Spellcraft & Sorcery", description: "This Sim craves a deep knowledge of the arcane magical arts.", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: 'd6822c18f52a0be3' },
  '0x60e3e': { name: "Sticky Fingers", description: "This Sim wants to become a master procurer and redistributor of goods and wealth to their own pocket.", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '805a9c593d10eea6' },
  '0x31cf4': { name: "StrangerVille Mystery", description: "StrangerVille is holding some deep dark secret, and this Sim wants to uncover why all the townsfolk are acting a bit strange.", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: 'f17e6decaa9518a9' },
  '0x64b9': { name: "Successful Lineage", description: "This Sim wants to have a family that succeeds in life!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '47084bf01667c611' },
  '0x2849f': { name: "Super Parent", description: "This Sim wants to be the best parent ever!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: 'b52559d9922676ba' },
  '0x9ec9': { name: "The Curator", description: "This Sim wants to collect everything the world has to offer!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '3e51d46c9f69ed10' },
  '0x25edb': { name: "Vampire Family", description: "This Sim wants to create a family of Vampires!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: 'ed0fe19d550f0b0e' },
  '0x433d8': { name: "Villainous Valentine", description: "This Sim wants to destroy the love lives of all Sims, including their own!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '0a62b1b4ff919a52' },
  '0x46e6f': { name: "Werewolf Initiate", description: "This Sim wants to unleash {M0.his}{F0.her} inner beast and become a werewolf!", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: '413278c48726d16d' },
  '0x645d': { name: "Whiz Kid", description: "This Sim wants to be the smartest kid in school!", ages: ['child'], iconInstance: '9ac95d18beace729' },
  '0x2f17b': { name: "World-Famous Celebrity", description: "This Sim wants to become illustriously famous.", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: 'b2f6f63afa88943e' },
  '0x42204': { name: "Zen Guru", description: "This Sim wants to share their mastery of Wellness with the world, and train a successor to pass on their knowledge.", ages: ['teen', 'youngAdult', 'adult', 'elder'], iconInstance: 'e9b8a0983be1035c' },
};

/** Look up an aspiration by its raw bigint tuning ID. Returns null if not in the catalog. */
export function lookupAspiration(id: bigint): StockAspiration | null {
  return STOCK_ASPIRATIONS['0x' + id.toString(16)] ?? null;
}

/** Convenience: just the display name. */
export function lookupAspirationName(id: bigint): string | null {
  return lookupAspiration(id)?.name ?? null;
}

/** Every CAS aspiration that can be picked at the given lifestage. */
export function aspirationsForLifestage(lifestage: ParsedLifestage): Array<{ id: string; name: string }> {
  const out: Array<{ id: string; name: string }> = [];
  for (const [id, t] of Object.entries(STOCK_ASPIRATIONS)) {
    if (t.ages.includes(lifestage)) out.push({ id, name: t.name });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** /aspiration-icons/<idHex>.png for an aspiration tuning id, or null if the
 *  catalog has no icon. Files are named by id (matching skills/careers); the
 *  iconInstance field is the has-icon flag + exact ResourceKey provenance. */
export function aspirationIconUrlById(id: string | null | undefined): string | null {
  if (!id) return null;
  return STOCK_ASPIRATIONS[id.toLowerCase()]?.iconInstance ? `/aspiration-icons/${id.replace(/^0x/, '').toLowerCase()}.png` : null;
}
