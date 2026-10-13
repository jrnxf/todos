/**
 * The sentences `bun run eval:read` reads, and what a person would expect each
 * one to fill.
 *
 * Three sets. The first 30 came with the first run of the test, written by
 * the author of the rules. The 70 after them were written before the rules,
 * their tests or the Jev code were opened, the way people type household
 * to-dos rather than the way a parser likes them, so no strategy had a head
 * start. The rules were then tuned against those 100, so the last 50 are held
 * out: written before that tuning began and never tuned against. They are the
 * honest number. Do not fix a rule because of a held-out miss; write a new
 * sentence into the 100 instead, or the set stops measuring anything.
 */

// A made-up household on a fixed day, so every run asks the same thing.
export const HOUSEHOLD = {
  today: '2026-10-13', // a Tuesday
  me: 'sam',
  people: [
    { id: 'michelle', name: 'Michelle' },
    { id: 'sam', name: 'Sam' },
  ],
  areas: ['House', 'Yard', 'Kids', 'Paperwork', 'Car', 'Health', 'Pets'].map(
    (name, index) => ({ id: index + 1, name }),
  ),
}

export interface Expected {
  title: string
  date?: string
  time?: string
  who?: string
  /** An area's name, null for none, or left out where two would be right. */
  area?: string | null
  /** Left out: nothing said, the default stays. */
  headsUp?: Array<number>
  flag?: true
}

export type Case = [sentence: string, expected: Expected]

export const FIRST_CASES: Array<Case> = [
  [
    "Michelle visit garden center at 9pm on saturday don't forget",
    {
      title: 'visit garden center',
      date: '2026-10-17',
      time: '21:00',
      who: 'michelle',
      area: 'Yard',
      flag: true,
    },
  ],
  [
    'Pay property tax by friday',
    { title: 'Pay property tax', date: '2026-10-16', area: 'Paperwork' },
  ],
  [
    'Sam: take the car in for an oil change tomorrow at 8am',
    {
      title: 'take the car in for an oil change',
      date: '2026-10-14',
      time: '08:00',
      who: 'sam',
      area: 'Car',
    },
  ],
  [
    'Book flu shots for the kids monday at 3:30pm',
    {
      title: 'Book flu shots for the kids',
      date: '2026-10-19',
      time: '15:30',
    },
  ],
  [
    'I need to renew my passport, remind me 2 weeks before',
    {
      title: 'renew my passport',
      who: 'sam',
      area: 'Paperwork',
      headsUp: [14],
    },
  ],
  [
    "Ask Michelle to pick up the dog's medicine today",
    {
      title: "pick up the dog's medicine",
      date: '2026-10-13',
      who: 'michelle',
      area: 'Pets',
    },
  ],
  [
    'Mow the lawn sunday',
    { title: 'Mow the lawn', date: '2026-10-18', area: 'Yard' },
  ],
  [
    'Buy Michelle a birthday present',
    { title: 'Buy Michelle a birthday present', area: null },
  ],
  [
    "Michelle's dentist appointment thursday 2:15pm",
    {
      title: "Michelle's dentist appointment",
      date: '2026-10-15',
      time: '14:15',
      area: 'Health',
    },
  ],
  [
    'Clean the gutters on october 24',
    { title: 'Clean the gutters', date: '2026-10-24', area: 'House' },
  ],
  [
    'Sign the permission slip for the field trip tomorrow !!',
    {
      title: 'Sign the permission slip for the field trip',
      date: '2026-10-14',
      area: 'Kids',
      flag: true,
    },
  ],
  [
    'Renew car registration by the 30th, important',
    {
      title: 'Renew car registration',
      date: '2026-10-30',
      area: 'Car',
      flag: true,
    },
  ],
  [
    'Take the cat to the vet wednesday at 4:45pm',
    {
      title: 'Take the cat to the vet',
      date: '2026-10-14',
      time: '16:45',
      area: 'Pets',
    },
  ],
  [
    'Replace smoke detector batteries',
    { title: 'Replace smoke detector batteries', area: 'House' },
  ],
  [
    'Michelle to call the plumber about the kitchen leak',
    {
      title: 'call the plumber about the kitchen leak',
      who: 'michelle',
      area: 'House',
    },
  ],
  [
    'Submit FSA receipts, no reminder',
    { title: 'Submit FSA receipts', area: 'Paperwork', headsUp: [] },
  ],
  [
    'Pick up March of the Penguins from the library',
    { title: 'Pick up March of the Penguins from the library', area: null },
  ],
  [
    'Take 2 weeks of recycling to the depot',
    { title: 'Take 2 weeks of recycling to the depot' },
  ],
  [
    'Schedule furnace service for november 5 at 10am, heads up a week before',
    {
      title: 'Schedule furnace service',
      date: '2026-11-05',
      time: '10:00',
      area: 'House',
      headsUp: [7],
    },
  ],
  [
    'Dinner with the Hendersons friday 7pm',
    {
      title: 'Dinner with the Hendersons',
      date: '2026-10-16',
      time: '19:00',
    },
  ],
  [
    'Order new tires for the car',
    { title: 'Order new tires for the car', area: 'Car' },
  ],
  [
    'Wish grandma a happy birthday!',
    { title: 'Wish grandma a happy birthday!', area: null },
  ],
  [
    'Call Michelle about dinner',
    { title: 'Call Michelle about dinner', area: null },
  ],
  [
    'Refill my allergy prescription today',
    {
      title: 'Refill my allergy prescription',
      date: '2026-10-13',
      area: 'Health',
    },
  ],
  [
    'Rake the leaves in 3 days',
    { title: 'Rake the leaves', date: '2026-10-16', area: 'Yard' },
  ],
  [
    'Register the kids for soccer by tuesday must not miss',
    {
      title: 'Register the kids for soccer',
      date: '2026-10-20',
      area: 'Kids',
      flag: true,
    },
  ],
  [
    'File the insurance claim - Michelle',
    {
      title: 'File the insurance claim',
      who: 'michelle',
      area: 'Paperwork',
    },
  ],
  [
    'Fix the light on the 2nd floor',
    { title: 'Fix the light on the 2nd floor', area: 'House' },
  ],
  ['Buy dog food', { title: 'Buy dog food', area: 'Pets' }],
  [
    'Remind me to book the eye exam for dec 3 at 11:15am',
    {
      title: 'book the eye exam',
      date: '2026-12-03',
      time: '11:15',
      who: 'sam',
      area: 'Health',
    },
  ],
]

/**
 * Where a sentence leaves a choice, the expectation takes the common reading:
 * a weekday typed on that same weekday is next week's, "next week" is its
 * Monday, "this weekend" is Saturday, "before" a day is that day, a bare hour
 * is the one the task makes obvious (dinner at 7 is the evening), and a day or
 * month already gone by is the next one to come.
 */
export const NEW_CASES: Array<Case> = [
  // Names: every position, and as the subject rather than the assignee.
  [
    'michelle can you take out the trash thursday',
    {
      title: 'take out the trash',
      date: '2026-10-15',
      who: 'michelle',
      area: 'House',
    },
  ],
  ["Return Sam's Club order", { title: "Return Sam's Club order", area: null }],
  [
    "Get Sam's suit dry cleaned before friday",
    { title: "Get Sam's suit dry cleaned", date: '2026-10-16', area: null },
  ],
  [
    "Plan Michelle's surprise party next week",
    {
      title: "Plan Michelle's surprise party",
      date: '2026-10-19',
      area: null,
    },
  ],
  [
    "Thank Michelle's mom for the casserole",
    { title: "Thank Michelle's mom for the casserole", area: null },
  ],
  [
    'sam needs to call the school about pickup',
    { title: 'call the school about pickup', who: 'sam', area: 'Kids' },
  ],
  [
    'Remind Michelle to sign the tax forms before the 1st',
    {
      title: 'sign the tax forms',
      date: '2026-11-01',
      who: 'michelle',
      area: 'Paperwork',
    },
  ],
  ['Water the plants - sam', { title: 'Water the plants', who: 'sam' }],
  [
    '@michelle return the library books by thursday',
    {
      title: 'return the library books',
      date: '2026-10-15',
      who: 'michelle',
      area: null,
    },
  ],
  ['Buy a card for Sam', { title: 'Buy a card for Sam', area: null }],
  ['Text Samantha about carpool', { title: 'Text Samantha about carpool' }],
  [
    'thurs - michelle - get the oil changed',
    {
      title: 'get the oil changed',
      date: '2026-10-15',
      who: 'michelle',
      area: 'Car',
    },
  ],
  [
    'michelle pick up the dry cleaning sat',
    {
      title: 'pick up the dry cleaning',
      date: '2026-10-17',
      who: 'michelle',
      area: null,
    },
  ],
  [
    'Sam and Michelle anniversary dinner reservation friday at 7:30',
    {
      title: 'Sam and Michelle anniversary dinner reservation',
      date: '2026-10-16',
      time: '19:30',
      area: null,
    },
  ],
  [
    'Michelle: buy halloween candy by the 30th',
    {
      title: 'buy halloween candy',
      date: '2026-10-30',
      who: 'michelle',
      area: null,
    },
  ],
  [
    'Pick Michelle up from the airport sunday at 5:40pm',
    {
      title: 'Pick Michelle up from the airport',
      date: '2026-10-18',
      time: '17:40',
      area: null,
    },
  ],
  [
    'I have to drop off the donation boxes friday',
    {
      title: 'drop off the donation boxes',
      date: '2026-10-16',
      who: 'sam',
      area: null,
    },
  ],
  [
    'Sam to mow before it rains',
    { title: 'mow before it rains', who: 'sam', area: 'Yard' },
  ],
  [
    'Health: book a mammogram for michelle',
    { title: 'book a mammogram for michelle', area: 'Health' },
  ],

  // Dates and times.
  [
    'tmrw 8am drop the car at the shop',
    {
      title: 'drop the car at the shop',
      date: '2026-10-14',
      time: '08:00',
      area: 'Car',
    },
  ],
  [
    'dentist at 9 on the 22nd',
    { title: 'dentist', date: '2026-10-22', time: '09:00', area: 'Health' },
  ],
  [
    'Dinner at the Nguyens at 7 saturday',
    { title: 'Dinner at the Nguyens', date: '2026-10-17', time: '19:00' },
  ],
  [
    'pick up kids from practice at 3 today',
    {
      title: 'pick up kids from practice',
      date: '2026-10-13',
      time: '15:00',
      area: 'Kids',
    },
  ],
  [
    'Biscuit to the vet monday 14:30',
    {
      title: 'Biscuit to the vet',
      date: '2026-10-19',
      time: '14:30',
      area: 'Pets',
    },
  ],
  [
    'Take out the trash tuesday',
    { title: 'Take out the trash', date: '2026-10-20', area: 'House' },
  ],
  [
    'Cancel the gym membership by end of month',
    { title: 'Cancel the gym membership', date: '2026-10-31' },
  ],
  [
    'take the dog to the groomer tommorow at 10',
    {
      title: 'take the dog to the groomer',
      date: '2026-10-14',
      time: '10:00',
      area: 'Pets',
    },
  ],
  [
    'wensday 6pm parent teacher conference',
    {
      title: 'parent teacher conference',
      date: '2026-10-14',
      time: '18:00',
      area: 'Kids',
    },
  ],
  [
    'Schedule the HVAC guy for the day after tomorrow at noon',
    {
      title: 'Schedule the HVAC guy',
      date: '2026-10-15',
      time: '12:00',
      area: 'House',
    },
  ],
  [
    'Check the sump pump in 2 weeks',
    { title: 'Check the sump pump', date: '2026-10-27', area: 'House' },
  ],
  [
    'Flu shot Oct 20 9:15',
    { title: 'Flu shot', date: '2026-10-20', time: '09:15', area: 'Health' },
  ],
  [
    'Put the winter tires on before november 15',
    { title: 'Put the winter tires on', date: '2026-11-15', area: 'Car' },
  ],
  [
    'Read chapter 3 with the kids tonight',
    { title: 'Read chapter 3 with the kids', date: '2026-10-13', area: 'Kids' },
  ],
  [
    'Take the kids to the pumpkin patch saturday at 10am',
    {
      title: 'Take the kids to the pumpkin patch',
      date: '2026-10-17',
      time: '10:00',
      area: 'Kids',
    },
  ],

  // Alerts, in several wordings.
  [
    'i should schedule a physical, remind me 3 days before',
    { title: 'schedule a physical', who: 'sam', area: 'Health', headsUp: [3] },
  ],
  [
    'Kids dentist checkup nov 3rd at 4pm heads up the day before',
    {
      title: 'Kids dentist checkup',
      date: '2026-11-03',
      time: '16:00',
      headsUp: [1],
    },
  ],
  [
    'Pay the water bill 11/3, no alert',
    {
      title: 'Pay the water bill',
      date: '2026-11-03',
      area: 'Paperwork',
      headsUp: [],
    },
  ],
  [
    'Renew the dog license by jan 8, ping me a week before',
    { title: 'Renew the dog license', date: '2027-01-08', headsUp: [7] },
  ],
  [
    'Book the cabin for the ski trip dec 18, remind me a week before and the day before',
    {
      title: 'Book the cabin for the ski trip',
      date: '2026-12-18',
      area: null,
      headsUp: [7, 1],
    },
  ],
  [
    'Get the car inspected the 5th, alert me 2 days ahead',
    {
      title: 'Get the car inspected',
      date: '2026-11-05',
      area: 'Car',
      headsUp: [2],
    },
  ],
  [
    'Send the rent check on the 1st dont remind me',
    {
      title: 'Send the rent check',
      date: '2026-11-01',
      area: 'Paperwork',
      headsUp: [],
    },
  ],
  [
    'Mail the wedding gift by oct 29, reminder 2 days before',
    {
      title: 'Mail the wedding gift',
      date: '2026-10-29',
      area: null,
      headsUp: [2],
    },
  ],

  // Emphasis that is a flag, and emphasis that is not.
  [
    'URGENT call the insurance company about the claim',
    {
      title: 'call the insurance company about the claim',
      area: 'Paperwork',
      flag: true,
    },
  ],
  [
    'Pick up the prescription asap',
    { title: 'Pick up the prescription', area: 'Health', flag: true },
  ],
  [
    'Urgent care follow-up call',
    { title: 'Urgent care follow-up call', area: 'Health' },
  ],
  [
    'Read the important notice from the HOA',
    { title: 'Read the important notice from the HOA' },
  ],
  [
    'Tell the kids great job on report cards!',
    { title: 'Tell the kids great job on report cards!', area: 'Kids' },
  ],
  [
    'Pay the daycare invoice today!!!',
    { title: 'Pay the daycare invoice', date: '2026-10-13', flag: true },
  ],
  [
    'high priority: fix the leaking roof',
    { title: 'fix the leaking roof', area: 'House', flag: true },
  ],
  [
    'File taxes by april 15 !!',
    {
      title: 'File taxes',
      date: '2027-04-15',
      area: 'Paperwork',
      flag: true,
    },
  ],

  // Areas named outright.
  [
    'Yard: trim the hedges this weekend',
    { title: 'trim the hedges', date: '2026-10-17', area: 'Yard' },
  ],
  [
    'fix the squeaky door #house',
    { title: 'fix the squeaky door', area: 'House' },
  ],
  [
    'Car - rotate the tires saturday',
    { title: 'rotate the tires', date: '2026-10-17', area: 'Car' },
  ],
  [
    'paperwork: shred old bank statements',
    { title: 'shred old bank statements', area: 'Paperwork' },
  ],
  [
    'House - replace the kitchen faucet next week',
    { title: 'replace the kitchen faucet', date: '2026-10-19', area: 'House' },
  ],
  [
    'order flea medicine #pets, must do',
    { title: 'order flea medicine', area: 'Pets', flag: true },
  ],

  // Areas implied.
  ['clean the litter box', { title: 'clean the litter box', area: 'Pets' }],
  ['plant the tulip bulbs', { title: 'plant the tulip bulbs', area: 'Yard' }],
  [
    'Pick up 4 bags of mulch',
    { title: 'Pick up 4 bags of mulch', area: 'Yard' },
  ],

  // Numbers, months, weekdays and names that are part of the task.
  [
    'Watch Friday Night Lights with the kids',
    { title: 'Watch Friday Night Lights with the kids' },
  ],
  [
    "Return May's lunchbox to her mom",
    { title: "Return May's lunchbox to her mom" },
  ],
  [
    'Order 12 folding chairs for the party',
    { title: 'Order 12 folding chairs for the party', area: null },
  ],
  [
    'Call 311 about the pothole',
    { title: 'Call 311 about the pothole', area: null },
  ],
  [
    'Buy tickets for August: Osage County',
    { title: 'Buy tickets for August: Osage County', area: null },
  ],
  [
    "Email the teacher about Friday's field trip",
    { title: "Email the teacher about Friday's field trip", area: 'Kids' },
  ],
  [
    'Try the 7 layer dip recipe',
    { title: 'Try the 7 layer dip recipe', area: null },
  ],

  // Nothing to read at all.
  ['Think about it', { title: 'Think about it', area: null }],
  ['misc errands', { title: 'misc errands', area: null }],
  ['Call back', { title: 'Call back', area: null }],
  ['???', { title: '???', area: null }],
]

/**
 * Held out: written before the rules were tuned against the 100 above, and
 * never used to tune them. The same choices as the 70 are taken where a
 * sentence leaves one.
 */
export const HELD_OUT_CASES: Array<Case> = [
  // Names: whose it is, and names that are only mentioned.
  [
    "michelle - call the vet about Biscuit's shots",
    {
      title: "call the vet about Biscuit's shots",
      who: 'michelle',
      area: 'Pets',
    },
  ],
  [
    'Get Michelle to sign the daycare form by wednesday',
    { title: 'sign the daycare form', date: '2026-10-14', who: 'michelle' },
  ],
  [
    "Sam's haircut saturday 11am",
    {
      title: "Sam's haircut",
      date: '2026-10-17',
      time: '11:00',
      area: null,
    },
  ],
  [
    'Lunch with Michelle and her sister sunday at noon',
    {
      title: 'Lunch with Michelle and her sister',
      date: '2026-10-18',
      time: '12:00',
      area: null,
    },
  ],
  [
    "I'll grab the dry cleaning thursday after work",
    {
      title: 'grab the dry cleaning after work',
      date: '2026-10-15',
      who: 'sam',
      area: null,
    },
  ],
  [
    'Michelle should book her eye exam',
    { title: 'book her eye exam', who: 'michelle', area: 'Health' },
  ],
  [
    "pick up sam's prescription at the pharmacy tomorrow",
    {
      title: "pick up sam's prescription at the pharmacy",
      date: '2026-10-14',
      area: 'Health',
    },
  ],
  ['Call mom (sam)', { title: 'Call mom', who: 'sam', area: null }],
  [
    'Michelle, can you get stamps on the way home',
    { title: 'get stamps on the way home', who: 'michelle' },
  ],
  [
    'Watch 10 Things I Hate About You with Michelle',
    { title: 'Watch 10 Things I Hate About You with Michelle', area: null },
  ],
  [
    'tell sam to bring the folding table up from the basement',
    { title: 'bring the folding table up from the basement', who: 'sam' },
  ],

  // Dates and times.
  [
    'oil change next tuesday at 7:30am',
    { title: 'oil change', date: '2026-10-20', time: '07:30', area: 'Car' },
  ],
  [
    'Put the recycling out thurs',
    { title: 'Put the recycling out', date: '2026-10-15', area: 'House' },
  ],
  [
    'Parent teacher night 10/22 6:30pm',
    {
      title: 'Parent teacher night',
      date: '2026-10-22',
      time: '18:30',
      area: 'Kids',
    },
  ],
  [
    'Swim lessons start nov 2 at 4',
    {
      title: 'Swim lessons start',
      date: '2026-11-02',
      time: '16:00',
      area: 'Kids',
    },
  ],
  [
    'Return the amazon package by the 20th',
    { title: 'Return the amazon package', date: '2026-10-20', area: null },
  ],
  [
    'vet appt for Biscuit fri @ 2',
    {
      title: 'vet appt for Biscuit',
      date: '2026-10-16',
      time: '14:00',
      area: 'Pets',
    },
  ],
  [
    'Change the furnace filter on the first of the month',
    { title: 'Change the furnace filter', date: '2026-11-01', area: 'House' },
  ],
  [
    'Trash cans to the curb tonite',
    { title: 'Trash cans to the curb', date: '2026-10-13', area: 'House' },
  ],
  [
    'Soccer practice wed 5-6pm',
    {
      title: 'Soccer practice',
      date: '2026-10-14',
      time: '17:00',
      area: 'Kids',
    },
  ],
  [
    'Pay the electric bill a week from today',
    { title: 'Pay the electric bill', date: '2026-10-20', area: 'Paperwork' },
  ],
  [
    'noon tomorrow lunch with the Parkers',
    {
      title: 'lunch with the Parkers',
      date: '2026-10-14',
      time: '12:00',
      area: null,
    },
  ],
  [
    'dentist thrusday 3pm',
    { title: 'dentist', date: '2026-10-15', time: '15:00', area: 'Health' },
  ],

  // Alerts, in several wordings.
  [
    'Book the flu clinic for oct 21, give me a heads up 2 days before',
    {
      title: 'Book the flu clinic',
      date: '2026-10-21',
      area: 'Health',
      headsUp: [2],
    },
  ],
  [
    'Property tax due dec 10, remind me 2 weeks and 3 days before',
    {
      title: 'Property tax',
      date: '2026-12-10',
      area: 'Paperwork',
      headsUp: [3, 14],
    },
  ],
  [
    'Call grandma on her birthday nov 9 no reminders',
    {
      title: 'Call grandma on her birthday',
      date: '2026-11-09',
      area: null,
      headsUp: [],
    },
  ],
  [
    'School photos nov 12, let me know the day before',
    { title: 'School photos', date: '2026-11-12', area: 'Kids', headsUp: [1] },
  ],
  [
    'Change the smoke alarm batteries sunday, no need to remind me',
    {
      title: 'Change the smoke alarm batteries',
      date: '2026-10-18',
      area: 'House',
      headsUp: [],
    },
  ],
  [
    'Remind me the day before to pack lunches for the field trip thursday',
    {
      title: 'pack lunches for the field trip',
      date: '2026-10-15',
      who: 'sam',
      area: 'Kids',
      headsUp: [1],
    },
  ],
  [
    'Order the turkey 2 weeks before thanksgiving',
    { title: 'Order the turkey 2 weeks before thanksgiving', area: null },
  ],

  // Emphasis that is a flag, and emphasis that is not.
  ['DO NOT FORGET the passports', { title: 'the passports', flag: true }],
  [
    'Call the school back today - urgent',
    {
      title: 'Call the school back',
      date: '2026-10-13',
      area: 'Kids',
      flag: true,
    },
  ],
  [
    'Buy an important documents folder',
    { title: 'Buy an important documents folder' },
  ],
  [
    "Pick up the birthday cake saturday, can't forget!",
    {
      title: 'Pick up the birthday cake',
      date: '2026-10-17',
      area: null,
      flag: true,
    },
  ],
  [
    'Mortgage payment due the 15th!!',
    {
      title: 'Mortgage payment',
      date: '2026-10-15',
      area: 'Paperwork',
      flag: true,
    },
  ],
  [
    'Watch the Critical Role finale',
    { title: 'Watch the Critical Role finale', area: null },
  ],
  [
    'top priority - call the bank about the fraud alert',
    {
      title: 'call the bank about the fraud alert',
      area: 'Paperwork',
      flag: true,
    },
  ],
  [
    "Don't forget to feed the fish",
    { title: 'feed the fish', area: 'Pets', flag: true },
  ],

  // Areas named outright.
  [
    '#yard rake under the maple',
    { title: 'rake under the maple', area: 'Yard' },
  ],
  [
    'kids: order school pictures by friday',
    { title: 'order school pictures', date: '2026-10-16', area: 'Kids' },
  ],
  [
    'wash the car #car this weekend',
    { title: 'wash the car', date: '2026-10-17', area: 'Car' },
  ],
  [
    "Pets: Biscuit's nail trim on the 24th at 10",
    {
      title: "Biscuit's nail trim",
      date: '2026-10-24',
      time: '10:00',
      area: 'Pets',
    },
  ],
  ['(house) caulk the bathtub', { title: 'caulk the bathtub', area: 'House' }],

  // Areas implied.
  ['Fill out the FAFSA', { title: 'Fill out the FAFSA', area: 'Paperwork' }],
  [
    'Aerate and overseed the lawn',
    { title: 'Aerate and overseed the lawn', area: 'Yard' },
  ],

  // Numbers, months, weekdays and times that are part of the task.
  [
    'Borrow Tuesdays with Morrie from the library',
    { title: 'Borrow Tuesdays with Morrie from the library', area: null },
  ],
  [
    'Find the April Fools photos for the album',
    { title: 'Find the April Fools photos for the album', area: null },
  ],
  [
    'Buy 2 tickets for the 7pm show',
    { title: 'Buy 2 tickets for the 7pm show', area: null },
  ],
  [
    'Call the 24 hour nurse line about the rash',
    { title: 'Call the 24 hour nurse line about the rash', area: 'Health' },
  ],

  // Nothing to read at all.
  ['groceries', { title: 'groceries', area: null }],
]

export const SETS = [
  { name: 'First 30', cases: FIRST_CASES },
  { name: 'New 70', cases: NEW_CASES },
  { name: 'Held out 50', cases: HELD_OUT_CASES },
] as const

export const CASES: Array<Case> = SETS.flatMap((set) => set.cases)
