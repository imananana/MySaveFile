// Preset pet breeds from The Sims 4: Cats & Dogs and The Sims 4: Horse Ranch.
// Used to derive a pet's subtype (cat/dog/horse) from the breed name string
// stored in the sim record at f64. Names are matched case-insensitively after
// normalizing whitespace and apostrophes.
//
// Custom breeds and player-created crossbreeds that don't match any name here
// fall back to generic "pet".

export const CAT_BREEDS = [
  'Abyssinian','American Bobtail','American Longhair','American Shorthair','American Wirehair',
  'Balinese','Bengal','Birman','Black Cat','Bombay Cat','British Longhair','British Shorthair',
  'Burmese','Calico','Chartreux','Colorpoint Shorthair','Cornish Rex','Devon Rex','Egyptian Mau',
  'German Rex','Havana Brown','Himalayan','Japanese Bobtail','Javanese','Korat','Kurilian Bobtail',
  'Laperm','Lykoi','Maine Coon','Manx','Norwegian Forest','Ocicat','Oriental Longhair',
  'Oriental Shorthair','Persian','Raccoon','Ragdoll','Russian Blue','Savannah','Scottish Fold',
  'Siamese','Siberian','Singapura','Somali','Sphynx','Tabby','Tonkinese','Turkish Angora','Tuxedo',
] as const;

export const DOG_BREEDS = [
  'Afghan Hound','Airedale Terrier','Akita','Alaskan Malamute','American Eskimo',
  'Australian Cattle Dog','Australian Shepherd','Basenji','Beagle','Bedlington Terrier',
  'Bernese Mountain Dog','Bichon Frise','Black Russian Terrier','Black and Tan Coonhound',
  'Bloodhound','Bluetick Coonhound','Bocker','Border Collie','Borzoi','Boston Terrier',
  'Boxer','Brittany','Bull Terrier','Bulldog','Bullmastiff','Canaan','Cardigan Welsh Corgi',
  'Chesapeake Bay Retriever','Chihuahua','Chow Chow','Chow Lab Mix','Cockapoo','Cocker Spaniel',
  'Collie','Curly Coated Retriever','Dachshund','Dalmatian','Dingo','Doberman Pinscher',
  'English Cocker Spaniel','English Foxhound','English Setter','English Springer Spaniel',
  'English Toy Spaniel','Field Spaniel','Fox','Foxhound','French Bulldog','German Pointer',
  'German Shepherd','German Spitz','Giant Schnauzer','Golden Retriever','Goldendoodle',
  'Great Dane','Great Pyrenees','Greyhound','Havanese','Ibizan Hound','Icelandic Sheepdog',
  'Irish Red and White Setter','Irish Setter','Irish Terrier','Irish Wolfhound',
  'Italian Greyhound','Jack Russell Terrier','Keeshond','Kerry Blue Terrier','King Charles Spaniel',
  'Labradoodle','Labrador Retriever','Lhasa Apso','Maltese','Mastiff','Miniature Pinscher',
  'Miniature Poodle','Miniature Schnauzer','Newfoundland','Norse Elk Shephard',
  'Norwegian Buhund','Old English Sheepdog','Otterhound','Papillon','Parson Russell Terrier',
  'Pekinese','Pembroke Welsh Corgi','Pharaoh Hound','Pit Bull','Pointer',
  'Polish Lowland Sheepdog','Pomeranian','Poodle','Portuguese Water Dog','Pug','Puggle',
  'Redbone Coonhound','Rhodesian Ridgeback','Rottweiler','Saint Bernard','Samoyed','Schipperke',
  'Schnoodle','Scottish Terrier','Shar Pei','Shetland Sheepdog','Shiba Inu','Shih Tzu',
  'Siberian Husky','Silky Terrier','Smooth Fox Terrier','Staffordshire Bull Terrier',
  'Standard Schnauzer','Tibetan Mastiff','Toy Fox Terrier','Vizsla','Weimaraner',
  'Welsh Springer Spaniel','West Highland White Terrier','Wheaten Terrier','Whippet',
  'Wire Fox Terrier','Yorkshire Terrier',
] as const;

export const HORSE_BREEDS = [
  'Akhal-Teke','American Paint Horse','American Quarter Horse','American Saddlebred',
  'American Standardbred','Andalusian','Anglo Arabian','Appaloosa','Arabian',
  'Australian Stock Horse','Barb','Belgian Warmblood','Clydesdale','Colorado Ranger','Dutch Warmblood','Friesian',
  'Gelderlander','Galineers Cob','Hanoverian','Holsteiner','Irish Draught','Lipizzaner',
  'Luisitano','Missouri Fox Trotter','Morgan','Mustang','Nez Perce','Nokota','Palomino',
  'Percheron','Selle Français','Shire','Tennessee Walker','Thoroughbred','Trakehner','Welsh Cob',
] as const;

function normalize(s: string): string {
  return s.toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[-_]/g, ' ')   // EA writes some breeds with dashes ("Shih-Tzu") and some without ("Shih Tzu")
    .replace(/\s+/g, ' ')
    .trim();
}

const CAT_SET = new Set(CAT_BREEDS.map(normalize));
const DOG_SET = new Set(DOG_BREEDS.map(normalize));
const HORSE_SET = new Set(HORSE_BREEDS.map(normalize));

export type PetSubtype = 'cat' | 'dog' | 'horse' | 'pet';

// Returns the species derived from a breed name string. Returns 'pet' if the
// breed is empty, unknown, or a player-created custom name.
export function petSubtypeFromBreed(breedName: string | null | undefined): PetSubtype {
  if (!breedName) return 'pet';
  const n = normalize(breedName);
  if (!n) return 'pet';
  if (CAT_SET.has(n)) return 'cat';
  if (DOG_SET.has(n)) return 'dog';
  if (HORSE_SET.has(n)) return 'horse';
  return 'pet';
}
