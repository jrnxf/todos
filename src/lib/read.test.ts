// What gets read out of a title fills buttons the person never touched, so a
// wrong reading is a to-do quietly given to the wrong person or flagged for
// everyone. These pin what counts as said, and what does not.
import * as chrono from 'chrono-node'
import { describe, expect, it } from 'vitest'
import { readTitle } from './read'
import type { ReadContext, ReadField } from './read'

const HOUSE = 1
const KIDS = 2
const PAPERWORK = 3
const YARD = 4
const PETS = 5
const HEALTH = 6
const CAR = 7
const ERRANDS = 8
const context: ReadContext = {
  today: '2026-10-13', // a Tuesday
  me: 'alex',
  people: [
    { id: 'alex', name: 'Alex' },
    { id: 'sam', name: 'Sam' },
  ],
  tags: [
    { id: HOUSE, name: 'House' },
    { id: KIDS, name: 'Kids' },
    { id: PAPERWORK, name: 'Paperwork' },
    { id: YARD, name: 'Yard' },
    { id: PETS, name: 'Pets' },
    { id: HEALTH, name: 'Health' },
    { id: CAR, name: 'Car' },
    // One the rules know nothing about.
    { id: ERRANDS, name: 'Errands' },
  ],
}
const read = (text: string, skip?: Array<ReadField>) =>
  readTitle(chrono, text, { ...context, skip: new Set(skip) })

describe('whose a to-do is', () => {
  it.each([
    ['Sam: pick up dry cleaning', 'sam', 'pick up dry cleaning'],
    ['@sam sign permission slip', 'sam', 'sign permission slip'],
    ['Alex to winterize the sprinklers', 'alex', 'winterize the sprinklers'],
    ['Ask Sam to call the school', 'sam', 'call the school'],
    ['Soccer practice signup - Sam', 'sam', 'Soccer practice signup'],
    ['I need to book flights', 'alex', 'book flights'],
    // A name that opens the title: it is theirs.
    ['Sam visit garden center', 'sam', 'visit garden center'],
    ['sam call the school tomorrow', 'sam', 'call the school'],
    // The asking is not the task.
    ['sam can you take out the trash', 'sam', 'take out the trash'],
    ['Sam, could you please book the sitter', 'sam', 'book the sitter'],
    // A name the date stood in front of.
    ['thurs - sam - get the oil changed', 'sam', 'get the oil changed'],
    ["I've got to return the drill", 'alex', 'return the drill'],
    // Said as what they will do, or asked of them.
    [
      'Sam will drop off the library books',
      'sam',
      'drop off the library books',
    ],
    ["Sam's going to fix the gate", 'sam', 'fix the gate'],
    ['Can Sam walk the dog after school', 'sam', 'walk the dog after school'],
    ['have Sam mop the kitchen', 'sam', 'mop the kitchen'],
    ['Me - book the dentist', 'alex', 'book the dentist'],
  ])('reads %j', (text, assignee, title) => {
    expect(read(text)).toMatchObject({ title, fields: { assignee } })
  })

  it.each([
    'Call Sam about dinner',
    'Buy birthday present for Sam',
    "Sam's eye appointment",
    "Sam's boots need new laces",
    'Samosas for the party',
    'Visit Sam at the garden center',
    // A name that opens a list of names, or a sentence about them.
    'Sam and Alex anniversary dinner reservation',
    'Sam & Alex date night',
    'Sam is out of town',
    // The first of a whole name.
    'Sam Rivera retirement party',
    // A guest.
    'have Sam over for dinner',
  ])('leaves %j with nobody', (text) => {
    expect(read(text)).toMatchObject({ title: text, fields: {} })
    expect(read(text).fields.assignee).toBeUndefined()
  })

  it.each([
    ['we should repaint the shed', 'repaint the shed'],
    ["We've got to call the landlord", 'call the landlord'],
    ["let's plan the garage sale", 'plan the garage sale'],
  ])(
    'leaves %j, which is the household’s, with nobody and a plain title',
    (text, title) => {
      expect(read(text)).toMatchObject({ title, fields: {} })
      expect(read(text).fields.assignee).toBeUndefined()
    },
  )
})

describe('the tag', () => {
  it('is read from a hashtag or a heading, which leave the title', () => {
    expect(read('sign permission slip #kids')).toMatchObject({
      title: 'sign permission slip',
      fields: { tagId: KIDS },
    })
    expect(read('House: replace smoke detector batteries')).toMatchObject({
      title: 'replace smoke detector batteries',
      fields: { tagId: HOUSE },
    })
  })

  it.each([
    ['(house) regrout the shower', 'regrout the shower', HOUSE],
    ['[kids] order the yearbook', 'order the yearbook', KIDS],
    ['sort the mail (paperwork)', 'sort the mail', PAPERWORK],
  ])('is read from its name in brackets in %j', (text, title, tagId) => {
    expect(read(text)).toMatchObject({ title, fields: { tagId } })
  })

  it('is not named by brackets in the run of the sentence', () => {
    expect(read('Clean (house) windows').title).toBe('Clean (house) windows')
  })

  it('is read from its own name in passing, which stays in the title', () => {
    expect(read('Flu shots for the kids')).toMatchObject({
      title: 'Flu shots for the kids',
      fields: { tagId: KIDS },
    })
  })

  it('is read from a heading with a dash', () => {
    expect(read('Car - rotate the tires')).toMatchObject({
      title: 'rotate the tires',
      fields: { tagId: CAR },
    })
    expect(read('order flea medicine #pets, must do')).toMatchObject({
      title: 'order flea medicine',
      fields: { tagId: PETS, mustNotMiss: true },
    })
    // Not a heading: the word runs on.
    expect(read('House-warming gift for the Lees').title).toBe(
      'House-warming gift for the Lees',
    )
  })

  it.each([
    ['Pay property tax', PAPERWORK],
    ['Mow the lawn', YARD],
    ['Replace smoke detector batteries', HOUSE],
    ['clean the litter box', PETS],
    ['Refill my allergy prescription', HEALTH],
    ['Put the winter tires on', CAR],
    ['Call the school about pickup', KIDS],
    // What the tag is about beats what is being done for it.
    ["Pick up the dog's medicine", PETS],
    ['Renew car registration', CAR],
    // What it is about still counts beside what means something else.
    ["Book the dog's booster", PETS],
    ['Tape the school calendar on the fridge', KIDS],
    ['Weed the garden before the yard sale', YARD],
  ])('is hinted at by %j, which stays whole', (text, tagId) => {
    expect(read(text)).toMatchObject({ title: text, fields: { tagId } })
  })

  it.each([
    'Housekeeping deposit',
    'Buy a birthday present',
    'Call 311 about the pothole',
    // Two tags as strongly as each other: neither.
    'Pay the daycare invoice',
    'Take the kids and the dog to the park',
    // A word that is as often nobody's, or another tag's.
    'Set up the art walk carpool',
    'Get a booster shot',
    // A tag's word that means something else here.
    'Plan the housewarming party',
    'Get donations for the yard sale',
    'Put the grocery list on the fridge',
    'Print the garden pictures for Mom',
    // Or is part of a name.
    'Listen to the House Rules podcast',
  ])('is left empty for %j', (text) => {
    expect(read(text).fields.tagId).toBeUndefined()
  })

  it('is hinted at only for a tag the household has', () => {
    expect(
      readTitle(chrono, 'Mow the lawn', {
        ...context,
        tags: [{ id: ERRANDS, name: 'Errands' }],
      }).fields.tagId,
    ).toBeUndefined()
  })
})

describe('the heads-up', () => {
  it('is read as the offered choices, one or several', () => {
    expect(read('Pay property tax, remind me 2 weeks before')).toMatchObject({
      title: 'Pay property tax',
      fields: { headsUpDays: [14] },
    })
    expect(
      read('Submit FSA receipts, heads up 3 days and 1 day before'),
    ).toMatchObject({
      title: 'Submit FSA receipts',
      fields: { headsUpDays: [1, 3] },
    })
    expect(read('Water the plants, no reminder')).toMatchObject({
      title: 'Water the plants',
      fields: { headsUpDays: [] },
    })
  })

  it.each([
    ['Renew the dog license, ping me a week before', [7]],
    ['Get the car inspected, alert me 2 days ahead', [2]],
    ['Mail the wedding gift, reminder 2 days before', [2]],
    ['Kids dentist checkup heads up the day before', [1]],
    ['Book the cabin, remind me a week before and the day before', [1, 7]],
    ['Renew passport, give me a heads up a month in advance', [30]],
    ['Renew passport, let me know 5 days before', [5]],
  ])('is read from %j', (text, headsUpDays) => {
    const got = read(text)
    expect(got.fields.headsUpDays).toEqual(headsUpDays)
    expect(got.title).not.toMatch(/before|ahead|advance|,/)
  })

  it.each([
    'Send the rent check dont remind me',
    "Send the rent check, don't remind me",
    'Send the rent check no alerts',
    'Send the rent check, no need to remind us',
    'Send the rent check, no reminder needed',
    'Send the rent check - no alerts necessary',
  ])('is switched off by %j', (text) => {
    expect(read(text)).toMatchObject({
      title: 'Send the rent check',
      fields: { headsUpDays: [] },
    })
  })

  it('opens the title, and its "to" goes with it', () => {
    expect(
      read('Remind me a week before to buy the wedding gift nov 7'),
    ).toMatchObject({
      title: 'buy the wedding gift',
      fields: { headsUpDays: [7], assignee: 'alex', dueDate: '2026-11-07' },
    })
    // Asked for everyone: nobody's in particular.
    const ours = read('Remind us the day before to pack the cooler saturday')
    expect(ours).toMatchObject({
      title: 'pack the cooler',
      fields: { headsUpDays: [1] },
    })
    expect(ours.fields.assignee).toBeUndefined()
  })

  it('is not read from how far ahead of something else', () => {
    for (const text of [
      'Order the cake 2 weeks before the party',
      'Remind Sam 2 days before the trip',
      'Set up a fraud alert',
    ])
      expect(read(text).fields.headsUpDays, text).toBeUndefined()
  })

  it('is left in the title when it is longer than can be kept', () => {
    const text = 'Renew passport, remind me 400 days before'
    expect(read(text)).toMatchObject({ title: text })
    expect(read(text).fields.headsUpDays).toBeUndefined()
  })
})

describe('the flag', () => {
  it.each([
    ['Call plumber about the leak !', 'Call plumber about the leak'],
    ['Renew passports!!', 'Renew passports'],
    ['Renew passports must not miss', 'Renew passports'],
    ["Mortgage payment, don't forget", 'Mortgage payment'],
    ['Submit FSA receipts urgent', 'Submit FSA receipts'],
    ['Pick up the prescription asap', 'Pick up the prescription'],
    ['high priority: fix the leaking roof', 'fix the leaking roof'],
    ['Urgent - call the bank', 'call the bank'],
    ['URGENT call the insurance company', 'call the insurance company'],
    ['order flea medicine, must do', 'order flea medicine'],
    ['Renew passports, important, remind me a week before', 'Renew passports'],
    ['!!! sign the lease', 'sign the lease'],
    ['! sign the lease', 'sign the lease'],
    ['Renew the permit ASAP!!', 'Renew the permit'],
  ])('is read from %j', (text, title) => {
    expect(read(text)).toMatchObject({ title, fields: { mustNotMiss: true } })
  })

  // A stress word in the run of the sentence describes something.
  it.each([
    'Urgent care follow-up call',
    'Read the important notice from the HOA',
    'Watch the Critical Role finale',
    'URGENT CARE FOLLOW-UP',
  ])('is not read from %j, which stays whole', (text) => {
    expect(read(text).title).toBe(text)
    expect(read(text).fields.mustNotMiss).toBeUndefined()
  })

  it('is not read from a sentence that just ends with one', () => {
    expect(
      read('Wish grandma a happy birthday!').fields.mustNotMiss,
    ).toBeUndefined()
  })
})

describe('a whole title', () => {
  it('has everything read at once', () => {
    expect(
      read('Sam: flu shots for the kids sat 10:30, remind me 3 days before !'),
    ).toEqual({
      title: 'flu shots for the kids',
      fields: {
        assignee: 'sam',
        tagId: KIDS,
        dueDate: '2026-10-17',
        dueTime: '10:30',
        headsUpDays: [3],
        mustNotMiss: true,
      },
      phrases: {
        who: 'Sam:',
        tag: 'kids',
        when: 'sat 10:30',
        headsUp: ', remind me 3 days before',
        flag: '!',
      },
      guessed: {},
    })
  })

  it('puts back the words of a reading that is taken back', () => {
    expect(read('Sam: call the school tomorrow', ['who'])).toMatchObject({
      title: 'Sam: call the school',
      fields: { dueDate: '2026-10-14' },
    })
    expect(
      read('Sam: call the school tomorrow', ['who', 'when', 'tag']),
    ).toEqual({
      title: 'Sam: call the school tomorrow',
      fields: {},
      phrases: {},
      guessed: {},
    })
  })

  it('is left alone when it is nothing but things to read', () => {
    expect(read('Sam: !')).toEqual({
      title: 'Sam: !',
      fields: {},
      phrases: {},
      guessed: {},
    })
  })

  it('reads a date that opens it as a heading', () => {
    expect(read('day after tomorrow: return the drill')).toMatchObject({
      title: 'return the drill',
      fields: { dueDate: '2026-10-15' },
    })
  })

  it('still reads the rest before the date parser has loaded', () => {
    expect(readTitle(null, 'Sam: dentist fri', context)).toMatchObject({
      title: 'dentist fri',
      fields: { assignee: 'sam' },
    })
  })
})
