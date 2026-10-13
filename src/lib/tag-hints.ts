// Which tag a to-do belongs in when it does not name one: "Mow the lawn" is
// the yard's, "Refill my prescription" is health's.
//
// Tags are made by each household, so this only knows the common ones, by
// the names people give them, and says nothing about any other. It is a hint
// and never more: the words stay in the title, a to-do that points two ways
// gets no tag, and Jev, when it is asked, may know better.

interface Kind {
  /** What a household might call the tag. */
  names: Array<string>
  /** What the tag is about: "the dog's medicine" is the dog's first. */
  about: Array<string>
  /** Things and jobs that belong to it. */
  hints: Array<string>
}

const KINDS: Array<Kind> = [
  {
    names: ['house', 'home', 'household', 'apartment', 'flat', 'condo'],
    about: [],
    hints: [
      'gutter',
      'furnace',
      'hvac',
      'air conditioner',
      'thermostat',
      'water heater',
      'boiler',
      'radiator',
      'sump pump',
      'septic',
      'plumber',
      'plumbing',
      'electrician',
      'handyman',
      'contractor',
      'roofer',
      'exterminator',
      'pest control',
      'locksmith',
      'roof',
      'leak',
      'leaking',
      'leaky',
      'faucet',
      'sink',
      'toilet',
      'shower',
      'bathtub',
      'drain',
      'smoke detector',
      'smoke alarm',
      'carbon monoxide',
      'chimney',
      'fireplace',
      'attic',
      'basement',
      'closet',
      'door',
      'doorbell',
      'window',
      'floor',
      'carpet',
      'vacuum',
      'dishwasher',
      'washing machine',
      'dryer',
      'fridge',
      'refrigerator',
      'freezer',
      'oven',
      'stove',
      'microwave',
      'light',
      'light bulb',
      'lightbulb',
      'lamp',
      'outlet',
      'wiring',
      'breaker',
      'paint',
      'caulk',
      'grout',
      'drywall',
      'insulation',
      'trash',
      'garbage',
      'recycling',
      'laundry',
      'dishes',
      'kitchen',
      'bathroom',
      'bedroom',
      'living room',
      'pantry',
      'cabinet',
    ],
  },
  {
    names: ['yard', 'garden', 'outdoors', 'outside', 'lawn', 'landscaping'],
    about: [],
    hints: [
      'lawn',
      'mow',
      'mower',
      'mowing',
      'rake',
      'raking',
      'leaves',
      'hedge',
      'shrub',
      'bush',
      'tree',
      'prune',
      'pruning',
      'weed',
      'weeding',
      'mulch',
      'fertilize',
      'fertilizer',
      'sprinkler',
      'irrigation',
      'hose',
      'garden',
      'gardening',
      'garden center',
      'nursery',
      'plant',
      'planting',
      'tulip',
      'daffodil',
      'perennial',
      'seedling',
      'sod',
      'grass',
      'compost',
      'patio',
      'deck',
      'fence',
      'shed',
      'snow blower',
      'snowblower',
      'leaf blower',
      'wheelbarrow',
      'flower bed',
      'planter',
    ],
  },
  {
    names: ['kids', 'kid', 'children', 'school'],
    about: ['kid', 'child', 'children', 'daughter', 'son', 'baby', 'toddler'],
    hints: [
      'school',
      'teacher',
      'daycare',
      'preschool',
      'kindergarten',
      'homework',
      'permission slip',
      'field trip',
      'report card',
      'pta',
      'parent teacher',
      'babysitter',
      'sitter',
      'nanny',
      'carpool',
      'lunchbox',
      'playdate',
      'summer camp',
      'tutor',
      'tutoring',
      'school bus',
      'backpack',
      'diaper',
      'stroller',
    ],
  },
  {
    names: [
      'paperwork',
      'admin',
      'finance',
      'finances',
      'money',
      'bills',
      'documents',
      'taxes',
    ],
    about: [],
    hints: [
      'tax',
      'taxes',
      'irs',
      'passport',
      'insurance',
      'claim',
      'receipt',
      'fsa',
      'hsa',
      'invoice',
      'bills',
      '(?:water|electric|electricity|gas|phone|power|utility|utilities|internet|cable|medical|hospital|credit card|tax) bill',
      'rent',
      'mortgage',
      'bank',
      'bank statement',
      'form',
      'license',
      'registration',
      'permit',
      'paperwork',
      'document',
      'notarize',
      'notary',
      '401k',
      'budget',
      'refund',
      'deductible',
      'fafsa',
      'w-?2',
      '1099',
      'lease',
      'deed',
      'loan',
      'credit card',
      'birth certificate',
      'social security',
    ],
  },
  {
    names: ['car', 'cars', 'auto', 'vehicle', 'vehicles'],
    about: ['car', 'truck', 'minivan', 'suv', 'vehicle'],
    hints: [
      'oil change',
      'oil changed',
      'change the oil',
      'oil filter',
      'tire',
      'tyre',
      'brake',
      'windshield',
      'wiper',
      'mechanic',
      'emissions',
      'smog check',
      'registration',
      'car wash',
      'tune-?up',
      'alternator',
      'transmission',
      'dealership',
      'muffler',
      'headlight',
      'taillight',
      'coolant',
      'antifreeze',
    ],
  },
  {
    names: ['health', 'medical', 'wellness', 'doctor', 'doctors'],
    about: [],
    hints: [
      'dentist',
      'dental',
      'doctor',
      'physician',
      'physical',
      'checkup',
      'check-up',
      'prescription',
      'pharmacy',
      'refill',
      'flu shot',
      'vaccine',
      'vaccination',
      'booster',
      'mammogram',
      'eye exam',
      'optometrist',
      'orthodontist',
      'dermatologist',
      'therapist',
      'therapy',
      'pediatrician',
      'urgent care',
      'clinic',
      'hospital',
      'blood test',
      'bloodwork',
      'x-ray',
      'mri',
      'allergy',
      'medicine',
      'medication',
      'vitamin',
      'teeth cleaning',
      'colonoscopy',
      'surgery',
    ],
  },
  {
    names: ['pets', 'pet', 'animals', 'dog', 'dogs', 'cat', 'cats'],
    about: [
      'dog',
      'puppy',
      'cat',
      'kitten',
      'pet',
      'hamster',
      'rabbit',
      'bunny',
      'guinea pig',
    ],
    hints: [
      'vet',
      'veterinarian',
      'groomer',
      'grooming',
      'litter',
      'litter box',
      'kennel',
      'leash',
      'flea',
      'heartworm',
      'kibble',
      'dog park',
      'pet store',
      'chew toy',
      'aquarium',
      'fish tank',
    ],
  },
]

/** The `terms` that are in `title` as whole words, one or several, as typed. */
function found(title: string, terms: Array<string>): Array<string> {
  return terms.flatMap(
    (term) =>
      new RegExp(
        String.raw`(?<![\p{L}\p{N}])(?:${term})(?:e?s)?(?![\p{L}\p{N}])`,
        'iu',
      ).exec(title)?.[0] ?? [],
  )
}

/**
 * The one tag `title` points to and the words that say so, or null: no tag
 * it knows, none hinted at, or two as strongly as each other.
 */
export function hintedTag<T extends { name: string }>(
  title: string,
  tags: ReadonlyArray<T>,
): { tag: T; phrase: string } | null {
  const known = tags.map((tag) => {
    const name = tag.name.trim().toLowerCase()
    const kinds = KINDS.filter((kind) => kind.names.includes(name))
    return { tag, name, kind: kinds.length === 1 ? kinds[0] : null }
  })
  // A tag named in passing, or what it is about, comes first: "Order new
  // tires for the car" and "the dog's medicine" need nothing else.
  const about = known.flatMap(({ tag, name, kind }) => {
    const words = found(title, [
      name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      ...(kind?.about ?? []),
    ])
    return words.length > 0 ? [{ tag, words }] : []
  })
  const hinted =
    about.length > 0
      ? about
      : known
          .map(({ tag, kind }) => ({
            tag,
            words: kind ? found(title, kind.hints) : [],
          }))
          .filter((one) => one.words.length > 0)
          .sort((a, b) => b.words.length - a.words.length)
  if (hinted.length === 0) return null
  // Two tags named or about: neither. Two hinted at: the one with more.
  if (
    hinted.length > 1 &&
    (about.length > 0 || hinted[0].words.length === hinted[1].words.length)
  )
    return null
  return { tag: hinted[0].tag, phrase: hinted[0].words[0].toLowerCase() }
}
