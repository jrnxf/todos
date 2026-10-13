// One request of the documented usage, as scripts/read-eval-verify.ts builds
// it for "Call the landlord saturday" in the test's made-up household: the
// tag both ways round, and whether "saturday" is when it is due. It is here
// only to be timed; nothing reads the answer.
export const REQUEST = {
  state: {
    todo: 'Call the landlord saturday',
    today: 'Tuesday, 2026-10-13',
  },
  questions: {
    area: {
      type: 'choice',
      instructions: {
        question:
          'Which one area of this household list does `todo` belong in?',
        focus:
          'Judge what the task is about, not words it happens to contain. Pick `none` unless one area plainly fits.',
      },
      criteria: {
        none: {
          what: 'It does not clearly belong in one of the areas, or it could sit in two.',
          not_for: 'A to-do that plainly fits one area.',
          examples: ['Wrap the wedding gift', 'Charge the camera'],
        },
        House: {
          what: 'The building and what is in it: repairs, cleaning, appliances, furniture, utilities, tradespeople.',
          not_for:
            'Plants, lawn and anything growing outside (Yard). Bills and forms (Paperwork).',
          examples: [
            'Fix the squeaky stair',
            'Descale the kettle',
            'Book the chimney sweep',
          ],
        },
        Yard: {
          what: 'Outdoor ground and plants: lawn, garden, trees, leaves, snow, the garden center.',
          not_for:
            'The roof, gutters, walls and other parts of the building (House).',
          examples: [
            'Prune the roses',
            'Edge the flower beds',
            'Shovel the driveway',
          ],
        },
        Kids: {
          what: "The children's own things: school, classes, practices, lessons, playdates, their forms and their gear.",
          not_for: 'A task that only happens with or near the kids.',
          examples: [
            'Label the lunch boxes',
            'Buy a recorder for music class',
            'Buy shin guards',
          ],
        },
        Paperwork: {
          what: 'Money and documents: bills, taxes, insurance, banking, renewals, forms to file.',
          not_for:
            "A form that is for school (Kids) or for a doctor's visit (Health).",
          examples: [
            'Set up autopay for the water bill',
            'Scan the birth certificates',
            'Update the will',
          ],
        },
        Car: {
          what: 'The vehicles: service, repairs, tires, registration, washing.',
          not_for: 'An errand that is only driven to.',
          examples: [
            'Top up the washer fluid',
            'Fix the windshield chip',
            'Vacuum the back seat',
          ],
        },
        Health: {
          what: "People's health: doctor, dentist, pharmacy, prescriptions, clinics, check-ups.",
          not_for: "An animal's health (Pets).",
          examples: [
            'Book a dermatologist visit',
            'Pick up allergy pills',
            'Schedule a hearing test',
          ],
        },
        Pets: {
          what: 'The animals: food, vet, grooming, walks, tanks and cages.',
          not_for: 'Wild animals and pests (House).',
          examples: [
            "Trim the cat's claws",
            'Buy litter',
            'Book the kennel for the trip',
          ],
        },
      },
    },
    area_reversed: {
      type: 'choice',
      instructions: {
        question:
          'Which one area of this household list does `todo` belong in?',
        focus:
          'Judge what the task is about, not words it happens to contain. Pick `none` unless one area plainly fits.',
      },
      criteria: {
        Pets: {
          what: 'The animals: food, vet, grooming, walks, tanks and cages.',
          not_for: 'Wild animals and pests (House).',
          examples: [
            "Trim the cat's claws",
            'Buy litter',
            'Book the kennel for the trip',
          ],
        },
        Health: {
          what: "People's health: doctor, dentist, pharmacy, prescriptions, clinics, check-ups.",
          not_for: "An animal's health (Pets).",
          examples: [
            'Book a dermatologist visit',
            'Pick up allergy pills',
            'Schedule a hearing test',
          ],
        },
        Car: {
          what: 'The vehicles: service, repairs, tires, registration, washing.',
          not_for: 'An errand that is only driven to.',
          examples: [
            'Top up the washer fluid',
            'Fix the windshield chip',
            'Vacuum the back seat',
          ],
        },
        Paperwork: {
          what: 'Money and documents: bills, taxes, insurance, banking, renewals, forms to file.',
          not_for:
            "A form that is for school (Kids) or for a doctor's visit (Health).",
          examples: [
            'Set up autopay for the water bill',
            'Scan the birth certificates',
            'Update the will',
          ],
        },
        Kids: {
          what: "The children's own things: school, classes, practices, lessons, playdates, their forms and their gear.",
          not_for: 'A task that only happens with or near the kids.',
          examples: [
            'Label the lunch boxes',
            'Buy a recorder for music class',
            'Buy shin guards',
          ],
        },
        Yard: {
          what: 'Outdoor ground and plants: lawn, garden, trees, leaves, snow, the garden center.',
          not_for:
            'The roof, gutters, walls and other parts of the building (House).',
          examples: [
            'Prune the roses',
            'Edge the flower beds',
            'Shovel the driveway',
          ],
        },
        House: {
          what: 'The building and what is in it: repairs, cleaning, appliances, furniture, utilities, tradespeople.',
          not_for:
            'Plants, lawn and anything growing outside (Yard). Bills and forms (Paperwork).',
          examples: [
            'Fix the squeaky stair',
            'Descale the kettle',
            'Book the chimney sweep',
          ],
        },
        none: {
          what: 'It does not clearly belong in one of the areas, or it could sit in two.',
          not_for: 'A to-do that plainly fits one area.',
          examples: ['Wrap the wedding gift', 'Charge the camera'],
        },
      },
    },
    when: {
      type: 'noul',
      instructions: {
        phrase: 'saturday',
        question:
          'In `todo`, does `phrase` say when this to-do is due or takes place?',
      },
      criteria: {
        true: '`phrase` is the deadline, or the day or time the task happens: "haircut on the 3rd at 2pm", "cancel the trial by friday", "call the landlord tomorrow".',
        false:
          '`phrase` is part of a name, or describes a thing in the task: "watch the 5 o\'clock news", "buy the Sunday paper", "start the 30 day trial", "eat Friday\'s leftovers".',
      },
    },
  },
}
