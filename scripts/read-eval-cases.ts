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
 * a time or a word of stress inside a name ("Saturday Night Live"). No
 * wording or cut-off was tuned against them.
 *
 * A fifth set, the unseen 100, was written before the app moved to rules
 * first with a model checking, and before the rule faults the fresh and
 * held-out 50 showed were fixed, which ended those two sets' time as a fair
 * judge of the rules. Half of the 100 tempt a wrong person or a wrong title:
 * a name that is only mentioned, and a day, a number or a word of stress that
 * belongs to the task. Nothing is tuned against them: they are the honest
 * number now. Do not fix a rule, a wording or a cut-off because of a miss in
 * them; write a new sentence into the first 100 instead.
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
 * Unseen: written before the rules were touched again and before any model
 * was asked about who or the title. The same choices as the other sets are
 * taken where a sentence leaves one; a part of the day ("morning", "night")
 * beside a day is read with the day and sets no time.
 *
 * One sentence was swapped after it was written and before anything read
 * the set: it turned out to be, word for word, an example in the request the
 * models are sent (src/lib/verify.ts). Three more are close to an example
 * there ("Deadhead the roses", "Top off the windshield washer fluid", "Trim
 * Biscuit's nails") and were left as they were.
 */
export const UNSEEN_CASES: Array<Case> = [
  // Names: whose it is, and names that are only mentioned.
  [
    'have Michelle call the roofer about the estimate',
    {
      title: 'call the roofer about the estimate',
      who: 'michelle',
      tag: 'House',
    },
  ],
  [
    "Pick up Sam's glasses from the optician friday",
    { title: "Pick up Sam's glasses from the optician", date: '2026-10-16' },
  ],
  [
    'Drive Michelle to the airport monday at 6am',
    {
      title: 'Drive Michelle to the airport',
      date: '2026-10-19',
      time: '06:00',
      tag: null,
    },
  ],
  [
    "Michelle's mom is visiting the 24th",
    { title: "Michelle's mom is visiting", date: '2026-10-24', tag: null },
  ],
  [
    'sam: defrost the chicken tonight',
    {
      title: 'defrost the chicken',
      date: '2026-10-13',
      who: 'sam',
      tag: null,
    },
  ],
  [
    'Send Michelle the wifi password',
    { title: 'Send Michelle the wifi password', tag: null },
  ],
  [
    'Michelle will pick up the cake saturday at 2',
    {
      title: 'pick up the cake',
      date: '2026-10-17',
      time: '14:00',
      who: 'michelle',
      tag: null,
    },
  ],
  [
    'Can Sam take Biscuit for a walk tonight',
    {
      title: 'take Biscuit for a walk',
      date: '2026-10-13',
      who: 'sam',
      tag: 'Pets',
    },
  ],
  [
    "I need to renew my driver's license by nov 13",
    { title: "renew my driver's license", date: '2026-11-13', who: 'sam' },
  ],
  [
    'Sam Smith concert tickets go on sale friday at 10am',
    {
      title: 'Sam Smith concert tickets go on sale',
      date: '2026-10-16',
      time: '10:00',
      tag: null,
    },
  ],
  [
    "Lunch with Sam's parents sunday 1pm",
    {
      title: "Lunch with Sam's parents",
      date: '2026-10-18',
      time: '13:00',
      tag: null,
    },
  ],
  ['ask sam if he paid the sitter', { title: 'ask sam if he paid the sitter' }],
  [
    'Michelle - dentist cleaning nov 4 at 9:30',
    {
      title: 'dentist cleaning',
      date: '2026-11-04',
      time: '09:30',
      who: 'michelle',
      tag: 'Health',
    },
  ],
  [
    'book a haircut for Sam next week',
    { title: 'book a haircut for Sam', date: '2026-10-19', tag: null },
  ],
  [
    'Remind Sam to take the bins out wednesday night',
    {
      title: 'take the bins out',
      date: '2026-10-14',
      who: 'sam',
      tag: 'House',
    },
  ],
  [
    'Me: schedule the chimney sweep',
    { title: 'schedule the chimney sweep', who: 'sam', tag: 'House' },
  ],
  [
    'Pay Michelle back for the concert tickets',
    { title: 'Pay Michelle back for the concert tickets', tag: null },
  ],
  [
    "I'll call the pediatrician tomorrow morning",
    { title: 'call the pediatrician', date: '2026-10-14', who: 'sam' },
  ],
  [
    'we need to book the carpet cleaners',
    { title: 'book the carpet cleaners', tag: 'House' },
  ],
  [
    "drop the kids at Michelle's mom's saturday 9am",
    {
      title: "drop the kids at Michelle's mom's",
      date: '2026-10-17',
      time: '09:00',
      tag: 'Kids',
    },
  ],
  [
    "sam - pick up Michelle's car from the shop thursday",
    {
      title: "pick up Michelle's car from the shop",
      date: '2026-10-15',
      who: 'sam',
      tag: 'Car',
    },
  ],
  [
    "michelle can you ask Sam's mom for the recipe",
    { title: "ask Sam's mom for the recipe", who: 'michelle', tag: null },
  ],
  ['Sign Sam up for the 5k', { title: 'Sign Sam up for the 5k', tag: null }],
  [
    'Samsung TV warranty registration',
    { title: 'Samsung TV warranty registration' },
  ],
  [
    "Call Dr. Michelle Park's office about the referral",
    {
      title: "Call Dr. Michelle Park's office about the referral",
      tag: 'Health',
    },
  ],
  [
    'Michelle to take the minivan for an emissions test by the 30th',
    {
      title: 'take the minivan for an emissions test',
      date: '2026-10-30',
      who: 'michelle',
      tag: 'Car',
    },
  ],
  [
    'Michelle: remind Sam about the recital',
    { title: 'remind Sam about the recital', who: 'michelle' },
  ],
  [
    'i gotta get the brakes checked',
    { title: 'get the brakes checked', who: 'sam', tag: 'Car' },
  ],

  // A day, a number, a name or a word of stress that belongs to the task:
  // none of it is to be read.
  [
    'Buy a 2027 wall calendar',
    { title: 'Buy a 2027 wall calendar', tag: null },
  ],
  [
    'Make a Black Friday shopping list',
    { title: 'Make a Black Friday shopping list', tag: null },
  ],
  [
    'Cancel the Sunday paper delivery',
    { title: 'Cancel the Sunday paper delivery', tag: null },
  ],
  [
    'Find the Wednesday Addams costume for halloween',
    { title: 'Find the Wednesday Addams costume for halloween' },
  ],
  [
    "Fix the reminder app on Michelle's phone",
    { title: "Fix the reminder app on Michelle's phone", tag: null },
  ],
  [
    'Plant the forget-me-nots by the fence',
    { title: 'Plant the forget-me-nots by the fence', tag: 'Yard' },
  ],
  [
    'Watch The Day After Tomorrow with the kids',
    { title: 'Watch The Day After Tomorrow with the kids' },
  ],
  [
    'Renew the First Alert alarm subscription',
    { title: 'Renew the First Alert alarm subscription' },
  ],
  [
    'Download the Important Dates sheet from the school site',
    {
      title: 'Download the Important Dates sheet from the school site',
      tag: 'Kids',
    },
  ],
  [
    'Try the Noon Whistle brewery with the Parkers',
    { title: 'Try the Noon Whistle brewery with the Parkers', tag: null },
  ],
  [
    'Print the May through August bank statements',
    {
      title: 'Print the May through August bank statements',
      tag: 'Paperwork',
    },
  ],
  [
    'Buy a house warming gift for the Lees',
    { title: 'Buy a house warming gift for the Lees', tag: null },
  ],
  [
    'Listen to the Car Talk rerun about hybrids',
    { title: 'Listen to the Car Talk rerun about hybrids', tag: null },
  ],
  [
    'Sell the yard sale leftovers on marketplace',
    { title: 'Sell the yard sale leftovers on marketplace', tag: null },
  ],
  [
    'Watch the Tonight Show clip Michelle sent',
    { title: 'Watch the Tonight Show clip Michelle sent', tag: null },
  ],
  [
    'Call the weekend on-call line about the furnace',
    { title: 'Call the weekend on-call line about the furnace', tag: 'House' },
  ],
  [
    'Buy a 1st birthday candle',
    { title: 'Buy a 1st birthday candle', tag: null },
  ],
  [
    'Reply to the March 3 email from the accountant',
    {
      title: 'Reply to the March 3 email from the accountant',
      tag: 'Paperwork',
    },
  ],
  [
    'Ask about the urgent care bill at the front desk',
    { title: 'Ask about the urgent care bill at the front desk' },
  ],
  [
    "Look up Sam's Auto Repair hours",
    { title: "Look up Sam's Auto Repair hours", tag: 'Car' },
  ],
  [
    "Renew Michelle's Costco membership by the 28th",
    {
      title: "Renew Michelle's Costco membership",
      date: '2026-10-28',
      tag: null,
    },
  ],
  [
    'Hang the must-see movie list on the fridge',
    { title: 'Hang the must-see movie list on the fridge', tag: null },
  ],

  // Dates and times.
  [
    'Furnace inspection oct 27 at 1pm',
    {
      title: 'Furnace inspection',
      date: '2026-10-27',
      time: '13:00',
      tag: 'House',
    },
  ],
  [
    "Biscuit's booster shot fri 4:15pm",
    {
      title: "Biscuit's booster shot",
      date: '2026-10-16',
      time: '16:15',
      tag: 'Pets',
    },
  ],
  [
    'drop off the tax documents tomorrow at 4:30',
    {
      title: 'drop off the tax documents',
      date: '2026-10-14',
      time: '16:30',
      tag: 'Paperwork',
    },
  ],
  [
    'orthodontist 11/10 at 3:40pm',
    {
      title: 'orthodontist',
      date: '2026-11-10',
      time: '15:40',
      tag: 'Health',
    },
  ],
  [
    'Rake the leaves this weekend',
    { title: 'Rake the leaves', date: '2026-10-17', tag: 'Yard' },
  ],
  [
    'Get the snowblower serviced by the end of the month',
    { title: 'Get the snowblower serviced', date: '2026-10-31' },
  ],
  [
    'book club at 7 on the 21st',
    { title: 'book club', date: '2026-10-21', time: '19:00', tag: null },
  ],
  [
    'Recycling pickup wed morning',
    { title: 'Recycling pickup', date: '2026-10-14', tag: 'House' },
  ],
  [
    'Clean out the garage on sunday the 25th',
    { title: 'Clean out the garage', date: '2026-10-25', tag: 'House' },
  ],
  [
    'Piano recital december 12 at 2pm',
    { title: 'Piano recital', date: '2026-12-12', time: '14:00' },
  ],
  [
    'call the accountant monday morning at 9',
    {
      title: 'call the accountant',
      date: '2026-10-19',
      time: '09:00',
      tag: 'Paperwork',
    },
  ],
  [
    'pediatrician checkup tues 10:15am',
    { title: 'pediatrician checkup', date: '2026-10-20', time: '10:15' },
  ],
  [
    'Oil change at 7:45 saturday morning',
    { title: 'Oil change', date: '2026-10-17', time: '07:45', tag: 'Car' },
  ],
  [
    'Lunch w/ the Garcias tmrw at 12:30',
    {
      title: 'Lunch w/ the Garcias',
      date: '2026-10-14',
      time: '12:30',
      tag: null,
    },
  ],
  [
    'get passport photos taken on 10/31',
    {
      title: 'get passport photos taken',
      date: '2026-10-31',
      tag: 'Paperwork',
    },
  ],
  [
    'Property tax installment due jan 31',
    {
      title: 'Property tax installment',
      date: '2027-01-31',
      tag: 'Paperwork',
    },
  ],
  [
    'tonight 8pm call with the contractor',
    {
      title: 'call with the contractor',
      date: '2026-10-13',
      time: '20:00',
      tag: 'House',
    },
  ],
  [
    'Swap the furnace filter in 3 weeks',
    { title: 'Swap the furnace filter', date: '2026-11-03', tag: 'House' },
  ],

  // Alerts, and a reminder that is the task.
  [
    'Renew the car insurance nov 15, remind me 10 days before',
    { title: 'Renew the car insurance', date: '2026-11-15', headsUp: [10] },
  ],
  [
    "Kids' flu shots oct 28 at 4pm, heads up 2 days before",
    {
      title: "Kids' flu shots",
      date: '2026-10-28',
      time: '16:00',
      headsUp: [2],
    },
  ],
  [
    'Anniversary dinner the 23rd at 7, remind me a week before and the day before',
    {
      title: 'Anniversary dinner',
      date: '2026-10-23',
      time: '19:00',
      tag: null,
      headsUp: [1, 7],
    },
  ],
  [
    'Take the trash out thursday, no reminder needed',
    {
      title: 'Take the trash out',
      date: '2026-10-15',
      tag: 'House',
      headsUp: [],
    },
  ],
  [
    'Vet recheck for Biscuit nov 18 10am, alert me the day before',
    {
      title: 'Vet recheck for Biscuit',
      date: '2026-11-18',
      time: '10:00',
      tag: 'Pets',
      headsUp: [1],
    },
  ],
  [
    'Set a reminder on the thermostat to change the filter',
    {
      title: 'Set a reminder on the thermostat to change the filter',
      tag: 'House',
    },
  ],
  [
    "Send the school fundraiser order by friday, don't remind me",
    {
      title: 'Send the school fundraiser order',
      date: '2026-10-16',
      tag: 'Kids',
      headsUp: [],
    },
  ],
  [
    'Michelle: glucose test nov 9 at 7:30am, remind 2 days before',
    {
      title: 'glucose test',
      date: '2026-11-09',
      time: '07:30',
      who: 'michelle',
      tag: 'Health',
      headsUp: [2],
    },
  ],

  // Emphasis that is a flag, and emphasis that is not.
  [
    "URGENT - renew Sam's inhaler",
    { title: "renew Sam's inhaler", tag: 'Health', flag: true },
  ],
  [
    '!! call the pharmacy about the recall',
    { title: 'call the pharmacy about the recall', tag: 'Health', flag: true },
  ],
  [
    'Book the Priority Mail pickup',
    { title: 'Book the Priority Mail pickup', tag: null },
  ],
  [
    'critical: back up the family photos',
    { title: 'back up the family photos', tag: null, flag: true },
  ],
  [
    "Don't forget the sunscreen for the field trip tomorrow",
    {
      title: 'the sunscreen for the field trip',
      date: '2026-10-14',
      tag: 'Kids',
      flag: true,
    },
  ],
  [
    'Get the permission slip signed today, very important',
    {
      title: 'Get the permission slip signed',
      date: '2026-10-13',
      tag: 'Kids',
      flag: true,
    },
  ],
  [
    'Send grandma the garden photos!',
    { title: 'Send grandma the garden photos!', tag: null },
  ],
  [
    'pay the parking ticket ASAP!!',
    { title: 'pay the parking ticket', flag: true },
  ],

  // Tags named outright.
  [
    '#pets order more poop bags',
    { title: 'order more poop bags', tag: 'Pets' },
  ],
  [
    "Health - schedule Sam's physical",
    { title: "schedule Sam's physical", tag: 'Health' },
  ],
  [
    'car: renew the parking permit by the 20th',
    { title: 'renew the parking permit', date: '2026-10-20', tag: 'Car' },
  ],
  [
    'hang the new shelves #house sunday at 2pm',
    {
      title: 'hang the new shelves',
      date: '2026-10-18',
      time: '14:00',
      tag: 'House',
    },
  ],
  ['[yard] stack the firewood', { title: 'stack the firewood', tag: 'Yard' }],
  [
    "Paperwork: file Michelle's reimbursement form",
    { title: "file Michelle's reimbursement form", tag: 'Paperwork' },
  ],

  // Tags implied.
  [
    'Tighten the loose banister',
    { title: 'Tighten the loose banister', tag: 'House' },
  ],
  ['Deadhead the roses', { title: 'Deadhead the roses', tag: 'Yard' }],
  [
    'Top off the windshield washer fluid',
    { title: 'Top off the windshield washer fluid', tag: 'Car' },
  ],
  [
    'Notarize the title transfer',
    { title: 'Notarize the title transfer', tag: 'Paperwork' },
  ],
  ['Book a teeth cleaning', { title: 'Book a teeth cleaning', tag: 'Health' }],
  [
    "Label the kids' winter coats",
    { title: "Label the kids' winter coats", tag: 'Kids' },
  ],
  ["Trim Biscuit's nails", { title: "Trim Biscuit's nails", tag: 'Pets' }],
  ['Prune the apple tree', { title: 'Prune the apple tree', tag: 'Yard' }],

  // Nothing to read at all.
  ['Figure out dinner', { title: 'Figure out dinner', tag: null }],
  ['tbd', { title: 'tbd', tag: null }],
]

/**
 * `tuned`: the rules were tuned against it, so a cut-off may be chosen on it
 * too. `seen`: held out once, but its misses have since been read and the
 * rule faults they showed fixed, so it no longer judges the rules; no
 * cut-off is chosen on it. `unseen`: nothing was ever tuned against it, rule,
 * wording or cut-off; the report shows it first.
 */
export const SETS = [
  { name: 'First 30', cases: FIRST_CASES, kind: 'tuned' },
  { name: 'New 70', cases: NEW_CASES, kind: 'tuned' },
  { name: 'Held out 50', cases: HELD_OUT_CASES, kind: 'seen' },
  { name: 'Fresh 50', cases: FRESH_CASES, kind: 'seen' },
  { name: 'Unseen 100', cases: UNSEEN_CASES, kind: 'unseen' },
] as const

export const CASES: Array<Case> = SETS.flatMap((set) => set.cases)
