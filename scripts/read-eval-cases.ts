/**
 * The sentences `bun run eval:read` reads, and what a person would expect each
 * one to fill.
 *
 * Three sets. The first 30 came with the first run of the test, written by
 * the author of the rules. The 70 after them were written before the rules,
 * their tests or the Jev code were opened, the way people type household
 * to-dos rather than the way a parser likes them, so no strategy had a head
 * start. The rules were then tuned against those 100, so the last 50 are held
 * out: written before that tuning began and never tuned against. Do not fix a
 * rule because of a held-out miss; write a new sentence into the 100 instead,
 * or the set stops measuring anything.
 *
 * A fourth set, the fresh 50, came later. An audit of how the decision models
 * were asked read every held-out miss, so that set could no longer judge the
 * requests the audit led to. The fresh 50 were written before any of those
 * requests, and before the rules or any model had read them. Ten have a day,
 * a time or a word of stress inside a name ("Saturday Night Live"). Nothing
 * is tuned against them, wording or cut-off: they are the honest number now.
 */

// A made-up household on a fixed day, so every run asks the same thing.
export const HOUSEHOLD = {
  today: '2026-10-13', // a Tuesday
  me: 'sam',
  people: [
    { id: 'michelle', name: 'Michelle' },
    { id: 'sam', name: 'Sam' },
  ],
  tags: ['House', 'Yard', 'Kids', 'Paperwork', 'Car', 'Health', 'Pets'].map(
    (name, index) => ({ id: index + 1, name }),
  ),
}

export interface Expected {
  title: string
  date?: string
  time?: string
  who?: string
  /** A tag's name, null for none, or left out where two would be right. */
  tag?: string | null
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
      tag: 'Yard',
      flag: true,
    },
  ],
  [
    'Pay property tax by friday',
    { title: 'Pay property tax', date: '2026-10-16', tag: 'Paperwork' },
  ],
  [
    'Sam: take the car in for an oil change tomorrow at 8am',
    {
      title: 'take the car in for an oil change',
      date: '2026-10-14',
      time: '08:00',
      who: 'sam',
      tag: 'Car',
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
      tag: 'Paperwork',
      headsUp: [14],
    },
  ],
  [
    "Ask Michelle to pick up the dog's medicine today",
    {
      title: "pick up the dog's medicine",
      date: '2026-10-13',
      who: 'michelle',
      tag: 'Pets',
    },
  ],
  [
    'Mow the lawn sunday',
    { title: 'Mow the lawn', date: '2026-10-18', tag: 'Yard' },
  ],
  [
    'Buy Michelle a birthday present',
    { title: 'Buy Michelle a birthday present', tag: null },
  ],
  [
    "Michelle's dentist appointment thursday 2:15pm",
    {
      title: "Michelle's dentist appointment",
      date: '2026-10-15',
      time: '14:15',
      tag: 'Health',
    },
  ],
  [
    'Clean the gutters on october 24',
    { title: 'Clean the gutters', date: '2026-10-24', tag: 'House' },
  ],
  [
    'Sign the permission slip for the field trip tomorrow !!',
    {
      title: 'Sign the permission slip for the field trip',
      date: '2026-10-14',
      tag: 'Kids',
      flag: true,
    },
  ],
  [
    'Renew car registration by the 30th, important',
    {
      title: 'Renew car registration',
      date: '2026-10-30',
      tag: 'Car',
      flag: true,
    },
  ],
  [
    'Take the cat to the vet wednesday at 4:45pm',
    {
      title: 'Take the cat to the vet',
      date: '2026-10-14',
      time: '16:45',
      tag: 'Pets',
    },
  ],
  [
    'Replace smoke detector batteries',
    { title: 'Replace smoke detector batteries', tag: 'House' },
  ],
  [
    'Michelle to call the plumber about the kitchen leak',
    {
      title: 'call the plumber about the kitchen leak',
      who: 'michelle',
      tag: 'House',
    },
  ],
  [
    'Submit FSA receipts, no reminder',
    { title: 'Submit FSA receipts', tag: 'Paperwork', headsUp: [] },
  ],
  [
    'Pick up March of the Penguins from the library',
    { title: 'Pick up March of the Penguins from the library', tag: null },
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
      tag: 'House',
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
    { title: 'Order new tires for the car', tag: 'Car' },
  ],
  [
    'Wish grandma a happy birthday!',
    { title: 'Wish grandma a happy birthday!', tag: null },
  ],
  [
    'Call Michelle about dinner',
    { title: 'Call Michelle about dinner', tag: null },
  ],
  [
    'Refill my allergy prescription today',
    {
      title: 'Refill my allergy prescription',
      date: '2026-10-13',
      tag: 'Health',
    },
  ],
  [
    'Rake the leaves in 3 days',
    { title: 'Rake the leaves', date: '2026-10-16', tag: 'Yard' },
  ],
  [
    'Register the kids for soccer by tuesday must not miss',
    {
      title: 'Register the kids for soccer',
      date: '2026-10-20',
      tag: 'Kids',
      flag: true,
    },
  ],
  [
    'File the insurance claim - Michelle',
    {
      title: 'File the insurance claim',
      who: 'michelle',
      tag: 'Paperwork',
    },
  ],
  [
    'Fix the light on the 2nd floor',
    { title: 'Fix the light on the 2nd floor', tag: 'House' },
  ],
  ['Buy dog food', { title: 'Buy dog food', tag: 'Pets' }],
  [
    'Remind me to book the eye exam for dec 3 at 11:15am',
    {
      title: 'book the eye exam',
      date: '2026-12-03',
      time: '11:15',
      who: 'sam',
      tag: 'Health',
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
      tag: 'House',
    },
  ],
  ["Return Sam's Club order", { title: "Return Sam's Club order", tag: null }],
  [
    "Get Sam's suit dry cleaned before friday",
    { title: "Get Sam's suit dry cleaned", date: '2026-10-16', tag: null },
  ],
  [
    "Plan Michelle's surprise party next week",
    {
      title: "Plan Michelle's surprise party",
      date: '2026-10-19',
      tag: null,
    },
  ],
  [
    "Thank Michelle's mom for the casserole",
    { title: "Thank Michelle's mom for the casserole", tag: null },
  ],
  [
    'sam needs to call the school about pickup',
    { title: 'call the school about pickup', who: 'sam', tag: 'Kids' },
  ],
  [
    'Remind Michelle to sign the tax forms before the 1st',
    {
      title: 'sign the tax forms',
      date: '2026-11-01',
      who: 'michelle',
      tag: 'Paperwork',
    },
  ],
  ['Water the plants - sam', { title: 'Water the plants', who: 'sam' }],
  [
    '@michelle return the library books by thursday',
    {
      title: 'return the library books',
      date: '2026-10-15',
      who: 'michelle',
      tag: null,
    },
  ],
  ['Buy a card for Sam', { title: 'Buy a card for Sam', tag: null }],
  ['Text Samantha about carpool', { title: 'Text Samantha about carpool' }],
  [
    'thurs - michelle - get the oil changed',
    {
      title: 'get the oil changed',
      date: '2026-10-15',
      who: 'michelle',
      tag: 'Car',
    },
  ],
  [
    'michelle pick up the dry cleaning sat',
    {
      title: 'pick up the dry cleaning',
      date: '2026-10-17',
      who: 'michelle',
      tag: null,
    },
  ],
  [
    'Sam and Michelle anniversary dinner reservation friday at 7:30',
    {
      title: 'Sam and Michelle anniversary dinner reservation',
      date: '2026-10-16',
      time: '19:30',
      tag: null,
    },
  ],
  [
    'Michelle: buy halloween candy by the 30th',
    {
      title: 'buy halloween candy',
      date: '2026-10-30',
      who: 'michelle',
      tag: null,
    },
  ],
  [
    'Pick Michelle up from the airport sunday at 5:40pm',
    {
      title: 'Pick Michelle up from the airport',
      date: '2026-10-18',
      time: '17:40',
      tag: null,
    },
  ],
  [
    'I have to drop off the donation boxes friday',
    {
      title: 'drop off the donation boxes',
      date: '2026-10-16',
      who: 'sam',
      tag: null,
    },
  ],
  [
    'Sam to mow before it rains',
    { title: 'mow before it rains', who: 'sam', tag: 'Yard' },
  ],
  [
    'Health: book a mammogram for michelle',
    { title: 'book a mammogram for michelle', tag: 'Health' },
  ],

  // Dates and times.
  [
    'tmrw 8am drop the car at the shop',
    {
      title: 'drop the car at the shop',
      date: '2026-10-14',
      time: '08:00',
      tag: 'Car',
    },
  ],
  [
    'dentist at 9 on the 22nd',
    { title: 'dentist', date: '2026-10-22', time: '09:00', tag: 'Health' },
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
      tag: 'Kids',
    },
  ],
  [
    'Biscuit to the vet monday 14:30',
    {
      title: 'Biscuit to the vet',
      date: '2026-10-19',
      time: '14:30',
      tag: 'Pets',
    },
  ],
  [
    'Take out the trash tuesday',
    { title: 'Take out the trash', date: '2026-10-20', tag: 'House' },
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
      tag: 'Pets',
    },
  ],
  [
    'wensday 6pm parent teacher conference',
    {
      title: 'parent teacher conference',
      date: '2026-10-14',
      time: '18:00',
      tag: 'Kids',
    },
  ],
  [
    'Schedule the HVAC guy for the day after tomorrow at noon',
    {
      title: 'Schedule the HVAC guy',
      date: '2026-10-15',
      time: '12:00',
      tag: 'House',
    },
  ],
  [
    'Check the sump pump in 2 weeks',
    { title: 'Check the sump pump', date: '2026-10-27', tag: 'House' },
  ],
  [
    'Flu shot Oct 20 9:15',
    { title: 'Flu shot', date: '2026-10-20', time: '09:15', tag: 'Health' },
  ],
  [
    'Put the winter tires on before november 15',
    { title: 'Put the winter tires on', date: '2026-11-15', tag: 'Car' },
  ],
  [
    'Read chapter 3 with the kids tonight',
    { title: 'Read chapter 3 with the kids', date: '2026-10-13', tag: 'Kids' },
  ],
  [
    'Take the kids to the pumpkin patch saturday at 10am',
    {
      title: 'Take the kids to the pumpkin patch',
      date: '2026-10-17',
      time: '10:00',
      tag: 'Kids',
    },
  ],

  // Alerts, in several wordings.
  [
    'i should schedule a physical, remind me 3 days before',
    { title: 'schedule a physical', who: 'sam', tag: 'Health', headsUp: [3] },
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
      tag: 'Paperwork',
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
      tag: null,
      headsUp: [7, 1],
    },
  ],
  [
    'Get the car inspected the 5th, alert me 2 days ahead',
    {
      title: 'Get the car inspected',
      date: '2026-11-05',
      tag: 'Car',
      headsUp: [2],
    },
  ],
  [
    'Send the rent check on the 1st dont remind me',
    {
      title: 'Send the rent check',
      date: '2026-11-01',
      tag: 'Paperwork',
      headsUp: [],
    },
  ],
  [
    'Mail the wedding gift by oct 29, reminder 2 days before',
    {
      title: 'Mail the wedding gift',
      date: '2026-10-29',
      tag: null,
      headsUp: [2],
    },
  ],

  // Emphasis that is a flag, and emphasis that is not.
  [
    'URGENT call the insurance company about the claim',
    {
      title: 'call the insurance company about the claim',
      tag: 'Paperwork',
      flag: true,
    },
  ],
  [
    'Pick up the prescription asap',
    { title: 'Pick up the prescription', tag: 'Health', flag: true },
  ],
  [
    'Urgent care follow-up call',
    { title: 'Urgent care follow-up call', tag: 'Health' },
  ],
  [
    'Read the important notice from the HOA',
    { title: 'Read the important notice from the HOA' },
  ],
  [
    'Tell the kids great job on report cards!',
    { title: 'Tell the kids great job on report cards!', tag: 'Kids' },
  ],
  [
    'Pay the daycare invoice today!!!',
    { title: 'Pay the daycare invoice', date: '2026-10-13', flag: true },
  ],
  [
    'high priority: fix the leaking roof',
    { title: 'fix the leaking roof', tag: 'House', flag: true },
  ],
  [
    'File taxes by april 15 !!',
    {
      title: 'File taxes',
      date: '2027-04-15',
      tag: 'Paperwork',
      flag: true,
    },
  ],

  // Tags named outright.
  [
    'Yard: trim the hedges this weekend',
    { title: 'trim the hedges', date: '2026-10-17', tag: 'Yard' },
  ],
  [
    'fix the squeaky door #house',
    { title: 'fix the squeaky door', tag: 'House' },
  ],
  [
    'Car - rotate the tires saturday',
    { title: 'rotate the tires', date: '2026-10-17', tag: 'Car' },
  ],
  [
    'paperwork: shred old bank statements',
    { title: 'shred old bank statements', tag: 'Paperwork' },
  ],
  [
    'House - replace the kitchen faucet next week',
    { title: 'replace the kitchen faucet', date: '2026-10-19', tag: 'House' },
  ],
  [
    'order flea medicine #pets, must do',
    { title: 'order flea medicine', tag: 'Pets', flag: true },
  ],

  // Tags implied.
  ['clean the litter box', { title: 'clean the litter box', tag: 'Pets' }],
  ['plant the tulip bulbs', { title: 'plant the tulip bulbs', tag: 'Yard' }],
  [
    'Pick up 4 bags of mulch',
    { title: 'Pick up 4 bags of mulch', tag: 'Yard' },
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
    { title: 'Order 12 folding chairs for the party', tag: null },
  ],
  [
    'Call 311 about the pothole',
    { title: 'Call 311 about the pothole', tag: null },
  ],
  [
    'Buy tickets for August: Osage County',
    { title: 'Buy tickets for August: Osage County', tag: null },
  ],
  [
    "Email the teacher about Friday's field trip",
    { title: "Email the teacher about Friday's field trip", tag: 'Kids' },
  ],
  [
    'Try the 7 layer dip recipe',
    { title: 'Try the 7 layer dip recipe', tag: null },
  ],

  // Nothing to read at all.
  ['Think about it', { title: 'Think about it', tag: null }],
  ['misc errands', { title: 'misc errands', tag: null }],
  ['Call back', { title: 'Call back', tag: null }],
  ['???', { title: '???', tag: null }],
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
      tag: 'Pets',
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
      tag: null,
    },
  ],
  [
    'Lunch with Michelle and her sister sunday at noon',
    {
      title: 'Lunch with Michelle and her sister',
      date: '2026-10-18',
      time: '12:00',
      tag: null,
    },
  ],
  [
    "I'll grab the dry cleaning thursday after work",
    {
      title: 'grab the dry cleaning after work',
      date: '2026-10-15',
      who: 'sam',
      tag: null,
    },
  ],
  [
    'Michelle should book her eye exam',
    { title: 'book her eye exam', who: 'michelle', tag: 'Health' },
  ],
  [
    "pick up sam's prescription at the pharmacy tomorrow",
    {
      title: "pick up sam's prescription at the pharmacy",
      date: '2026-10-14',
      tag: 'Health',
    },
  ],
  ['Call mom (sam)', { title: 'Call mom', who: 'sam', tag: null }],
  [
    'Michelle, can you get stamps on the way home',
    { title: 'get stamps on the way home', who: 'michelle' },
  ],
  [
    'Watch 10 Things I Hate About You with Michelle',
    { title: 'Watch 10 Things I Hate About You with Michelle', tag: null },
  ],
  [
    'tell sam to bring the folding table up from the basement',
    { title: 'bring the folding table up from the basement', who: 'sam' },
  ],

  // Dates and times.
  [
    'oil change next tuesday at 7:30am',
    { title: 'oil change', date: '2026-10-20', time: '07:30', tag: 'Car' },
  ],
  [
    'Put the recycling out thurs',
    { title: 'Put the recycling out', date: '2026-10-15', tag: 'House' },
  ],
  [
    'Parent teacher night 10/22 6:30pm',
    {
      title: 'Parent teacher night',
      date: '2026-10-22',
      time: '18:30',
      tag: 'Kids',
    },
  ],
  [
    'Swim lessons start nov 2 at 4',
    {
      title: 'Swim lessons start',
      date: '2026-11-02',
      time: '16:00',
      tag: 'Kids',
    },
  ],
  [
    'Return the amazon package by the 20th',
    { title: 'Return the amazon package', date: '2026-10-20', tag: null },
  ],
  [
    'vet appt for Biscuit fri @ 2',
    {
      title: 'vet appt for Biscuit',
      date: '2026-10-16',
      time: '14:00',
      tag: 'Pets',
    },
  ],
  [
    'Change the furnace filter on the first of the month',
    { title: 'Change the furnace filter', date: '2026-11-01', tag: 'House' },
  ],
  [
    'Trash cans to the curb tonite',
    { title: 'Trash cans to the curb', date: '2026-10-13', tag: 'House' },
  ],
  [
    'Soccer practice wed 5-6pm',
    {
      title: 'Soccer practice',
      date: '2026-10-14',
      time: '17:00',
      tag: 'Kids',
    },
  ],
  [
    'Pay the electric bill a week from today',
    { title: 'Pay the electric bill', date: '2026-10-20', tag: 'Paperwork' },
  ],
  [
    'noon tomorrow lunch with the Parkers',
    {
      title: 'lunch with the Parkers',
      date: '2026-10-14',
      time: '12:00',
      tag: null,
    },
  ],
  [
    'dentist thrusday 3pm',
    { title: 'dentist', date: '2026-10-15', time: '15:00', tag: 'Health' },
  ],

  // Alerts, in several wordings.
  [
    'Book the flu clinic for oct 21, give me a heads up 2 days before',
    {
      title: 'Book the flu clinic',
      date: '2026-10-21',
      tag: 'Health',
      headsUp: [2],
    },
  ],
  [
    'Property tax due dec 10, remind me 2 weeks and 3 days before',
    {
      title: 'Property tax',
      date: '2026-12-10',
      tag: 'Paperwork',
      headsUp: [3, 14],
    },
  ],
  [
    'Call grandma on her birthday nov 9 no reminders',
    {
      title: 'Call grandma on her birthday',
      date: '2026-11-09',
      tag: null,
      headsUp: [],
    },
  ],
  [
    'School photos nov 12, let me know the day before',
    { title: 'School photos', date: '2026-11-12', tag: 'Kids', headsUp: [1] },
  ],
  [
    'Change the smoke alarm batteries sunday, no need to remind me',
    {
      title: 'Change the smoke alarm batteries',
      date: '2026-10-18',
      tag: 'House',
      headsUp: [],
    },
  ],
  [
    'Remind me the day before to pack lunches for the field trip thursday',
    {
      title: 'pack lunches for the field trip',
      date: '2026-10-15',
      who: 'sam',
      tag: 'Kids',
      headsUp: [1],
    },
  ],
  [
    'Order the turkey 2 weeks before thanksgiving',
    { title: 'Order the turkey 2 weeks before thanksgiving', tag: null },
  ],

  // Emphasis that is a flag, and emphasis that is not.
  ['DO NOT FORGET the passports', { title: 'the passports', flag: true }],
  [
    'Call the school back today - urgent',
    {
      title: 'Call the school back',
      date: '2026-10-13',
      tag: 'Kids',
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
      tag: null,
      flag: true,
    },
  ],
  [
    'Mortgage payment due the 15th!!',
    {
      title: 'Mortgage payment',
      date: '2026-10-15',
      tag: 'Paperwork',
      flag: true,
    },
  ],
  [
    'Watch the Critical Role finale',
    { title: 'Watch the Critical Role finale', tag: null },
  ],
  [
    'top priority - call the bank about the fraud alert',
    {
      title: 'call the bank about the fraud alert',
      tag: 'Paperwork',
      flag: true,
    },
  ],
  [
    "Don't forget to feed the fish",
    { title: 'feed the fish', tag: 'Pets', flag: true },
  ],

  // Tags named outright.
  [
    '#yard rake under the maple',
    { title: 'rake under the maple', tag: 'Yard' },
  ],
  [
    'kids: order school pictures by friday',
    { title: 'order school pictures', date: '2026-10-16', tag: 'Kids' },
  ],
  [
    'wash the car #car this weekend',
    { title: 'wash the car', date: '2026-10-17', tag: 'Car' },
  ],
  [
    "Pets: Biscuit's nail trim on the 24th at 10",
    {
      title: "Biscuit's nail trim",
      date: '2026-10-24',
      time: '10:00',
      tag: 'Pets',
    },
  ],
  ['(house) caulk the bathtub', { title: 'caulk the bathtub', tag: 'House' }],

  // Tags implied.
  ['Fill out the FAFSA', { title: 'Fill out the FAFSA', tag: 'Paperwork' }],
  [
    'Aerate and overseed the lawn',
    { title: 'Aerate and overseed the lawn', tag: 'Yard' },
  ],

  // Numbers, months, weekdays and times that are part of the task.
  [
    'Borrow Tuesdays with Morrie from the library',
    { title: 'Borrow Tuesdays with Morrie from the library', tag: null },
  ],
  [
    'Find the April Fools photos for the album',
    { title: 'Find the April Fools photos for the album', tag: null },
  ],
  [
    'Buy 2 tickets for the 7pm show',
    { title: 'Buy 2 tickets for the 7pm show', tag: null },
  ],
  [
    'Call the 24 hour nurse line about the rash',
    { title: 'Call the 24 hour nurse line about the rash', tag: 'Health' },
  ],

  // Nothing to read at all.
  ['groceries', { title: 'groceries', tag: null }],
]

export const FRESH_CASES: Array<Case> = [
  // Names: whose it is, and names that are only mentioned.
  [
    'Sam - renew the library cards before they expire',
    { title: 'renew the library cards before they expire', who: 'sam' },
  ],
  [
    'ask Michelle to drop off the donation bags friday',
    {
      title: 'drop off the donation bags',
      date: '2026-10-16',
      who: 'michelle',
      tag: null,
    },
  ],
  [
    "Michelle's physical on the 29th at 8:15am",
    {
      title: "Michelle's physical",
      date: '2026-10-29',
      time: '08:15',
      tag: 'Health',
    },
  ],
  [
    'I need to call the insurance company about the claim',
    {
      title: 'call the insurance company about the claim',
      who: 'sam',
      tag: 'Paperwork',
    },
  ],
  [
    'michelle: take Biscuit to the groomer thursday at 4pm',
    {
      title: 'take Biscuit to the groomer',
      date: '2026-10-15',
      time: '16:00',
      who: 'michelle',
      tag: 'Pets',
    },
  ],
  [
    'note to self: cancel the gym membership',
    { title: 'cancel the gym membership', who: 'sam' },
  ],

  // Dates and times.
  [
    'Dishwasher repair wednesday 1pm',
    {
      title: 'Dishwasher repair',
      date: '2026-10-14',
      time: '13:00',
      tag: 'House',
    },
  ],
  [
    'renew car registration by nov 30',
    { title: 'renew car registration', date: '2026-11-30', tag: 'Car' },
  ],
  [
    'flu shot tmrw 9:15',
    { title: 'flu shot', date: '2026-10-14', time: '09:15', tag: 'Health' },
  ],
  [
    'Mail the rent check on the 1st',
    { title: 'Mail the rent check', date: '2026-11-01' },
  ],
  [
    'Pick up the kids early friday 2:30pm',
    {
      title: 'Pick up the kids early',
      date: '2026-10-16',
      time: '14:30',
      tag: 'Kids',
    },
  ],
  [
    'sign up for spring soccer before december 5',
    { title: 'sign up for spring soccer', date: '2026-12-05', tag: 'Kids' },
  ],
  [
    'Take the minivan in for new tires monday at 8',
    {
      title: 'Take the minivan in for new tires',
      date: '2026-10-19',
      time: '08:00',
      tag: 'Car',
    },
  ],
  [
    'Water the tomatoes tonight',
    { title: 'Water the tomatoes', date: '2026-10-13', tag: 'Yard' },
  ],
  [
    'Plumber coming 10/21 at 11am',
    {
      title: 'Plumber coming',
      date: '2026-10-21',
      time: '11:00',
      tag: 'House',
    },
  ],
  [
    'day after tomorrow: return library books',
    { title: 'return library books', date: '2026-10-15', tag: null },
  ],

  // Alerts, and a span of days that is not one.
  [
    'Passport photos nov 6, remind me 3 days before',
    {
      title: 'Passport photos',
      date: '2026-11-06',
      tag: 'Paperwork',
      headsUp: [3],
    },
  ],
  [
    "Biscuit's heartworm pill on the 1st, heads up the day before",
    {
      title: "Biscuit's heartworm pill",
      date: '2026-11-01',
      tag: 'Pets',
      headsUp: [1],
    },
  ],
  [
    'Dinner at the Hendersons saturday 6pm, no reminder',
    {
      title: 'Dinner at the Hendersons',
      date: '2026-10-17',
      time: '18:00',
      tag: null,
      headsUp: [],
    },
  ],
  [
    'Car inspection due nov 20 - ping me a week before and 2 days before',
    {
      title: 'Car inspection',
      date: '2026-11-20',
      tag: 'Car',
      headsUp: [2, 7],
    },
  ],
  [
    'Start the thank you notes 3 days before the party',
    { title: 'Start the thank you notes 3 days before the party', tag: null },
  ],

  // Emphasis that is a flag, and emphasis that is not.
  [
    'URGENT: fix the gate latch before Biscuit gets out',
    { title: 'fix the gate latch before Biscuit gets out', flag: true },
  ],
  [
    'Refill the inhaler prescription, do not forget',
    { title: 'Refill the inhaler prescription', tag: 'Health', flag: true },
  ],
  [
    'Submit the FSA receipts by friday!!',
    {
      title: 'Submit the FSA receipts',
      date: '2026-10-16',
      tag: 'Paperwork',
      flag: true,
    },
  ],
  [
    'Kindergarten registration closes thursday - must not miss',
    {
      title: 'Kindergarten registration closes',
      date: '2026-10-15',
      tag: 'Kids',
      flag: true,
    },
  ],
  [
    'Schedule a non-urgent checkup for Sam',
    { title: 'Schedule a non-urgent checkup for Sam', tag: 'Health' },
  ],
  [
    'asap - get the brake light replaced',
    { title: 'get the brake light replaced', tag: 'Car', flag: true },
  ],
  [
    'Important: sign the permission slip tonight',
    {
      title: 'sign the permission slip',
      date: '2026-10-13',
      tag: 'Kids',
      flag: true,
    },
  ],

  // Tags named outright.
  [
    '#health schedule the mammogram',
    { title: 'schedule the mammogram', tag: 'Health' },
  ],
  [
    'Yard: order firewood for delivery on the 23rd',
    { title: 'order firewood for delivery', date: '2026-10-23', tag: 'Yard' },
  ],
  [
    'paperwork - shred the old bank statements',
    { title: 'shred the old bank statements', tag: 'Paperwork' },
  ],
  [
    'defrost the freezer #house saturday',
    { title: 'defrost the freezer', date: '2026-10-17', tag: 'House' },
  ],

  // Tags implied, some with no word that gives them away.
  [
    'Pack the diaper bag for daycare',
    { title: 'Pack the diaper bag for daycare', tag: 'Kids' },
  ],
  [
    'Get the snow tires put on',
    { title: 'Get the snow tires put on', tag: 'Car' },
  ],
  [
    'Clean out the hamster cage',
    { title: 'Clean out the hamster cage', tag: 'Pets' },
  ],
  ['Rotate the mattress', { title: 'Rotate the mattress', tag: 'House' }],
  ['Split the hostas', { title: 'Split the hostas', tag: 'Yard' }],
  ['Dispute the hospital bill', { title: 'Dispute the hospital bill' }],
  [
    'Order new contact lenses',
    { title: 'Order new contact lenses', tag: 'Health' },
  ],
  ['Bleed the radiators', { title: 'Bleed the radiators', tag: 'House' }],

  // A day, a time or a word of stress inside a name: none of it is to be
  // read.
  [
    'Watch Saturday Night Live with Michelle',
    { title: 'Watch Saturday Night Live with Michelle', tag: null },
  ],
  [
    'Order Taco Tuesday supplies',
    { title: 'Order Taco Tuesday supplies', tag: null },
  ],
  [
    'Rewatch 500 Days of Summer',
    { title: 'Rewatch 500 Days of Summer', tag: null },
  ],
  [
    'Return the Critical Thinking workbook to school',
    { title: 'Return the Critical Thinking workbook to school', tag: 'Kids' },
  ],
  [
    'Buy the 9 to 5 soundtrack on vinyl',
    { title: 'Buy the 9 to 5 soundtrack on vinyl', tag: null },
  ],
  [
    'Borrow the Sunday Suppers cookbook',
    { title: 'Borrow the Sunday Suppers cookbook', tag: null },
  ],
  [
    'Drop off film at One Hour Photo',
    { title: 'Drop off film at One Hour Photo', tag: null },
  ],
  [
    'Reserve seats for the midnight premiere',
    { title: 'Reserve seats for the midnight premiere', tag: null },
  ],
  [
    'Set up the First Friday art walk carpool',
    { title: 'Set up the First Friday art walk carpool', tag: null },
  ],
  [
    'Renew the Urgent Care Plus membership',
    { title: 'Renew the Urgent Care Plus membership' },
  ],
]

/**
 * `tuned`: the rules were tuned against it, so a cut-off may be chosen on it
 * too. `held`: never tuned against. `fresh`: never tuned against, and written
 * before the requests it judges; the report shows it first.
 */
export const SETS = [
  { name: 'First 30', cases: FIRST_CASES, kind: 'tuned' },
  { name: 'New 70', cases: NEW_CASES, kind: 'tuned' },
  { name: 'Held out 50', cases: HELD_OUT_CASES, kind: 'held' },
  { name: 'Fresh 50', cases: FRESH_CASES, kind: 'fresh' },
] as const

export const CASES: Array<Case> = SETS.flatMap((set) => set.cases)
