// A small set on purpose: only the rules where a silent mistake means a
// missed deadline or a phone that buzzes twice.
import { describe, expect, it } from 'vitest'
import { alertsInWindow, upcomingAlerts } from './rules'
import type { AlertItem } from './rules'

const people = [
  { id: 'alex', name: 'Alex', initial: 'A' },
  { id: 'sam', name: 'Sam', initial: 'S' },
]
const config = {
  digestTime: '07:30',
  headsUpTime: '19:00',
  nudgeMinutesBefore: 60,
}

let nextId = 1
function todo(fields: Partial<AlertItem> & { title: string }): AlertItem {
  return {
    id: nextId++,
    assignee: null,
    dueDate: null,
    dueTime: null,
    headsUpDays: [1],
    mustNotMiss: false,
    ...fields,
  }
}

function between(items: Array<AlertItem>, from: string, to: string) {
  return alertsInWindow({ items, people, from, to, config })
}

describe('morning digest', () => {
  const items = [
    todo({ title: 'Mine today', assignee: 'alex', dueDate: '2026-10-12' }),
    todo({ title: 'Sam today', assignee: 'sam', dueDate: '2026-10-12' }),
    todo({
      title: 'Sam, 1 late',
      assignee: 'sam',
      dueDate: '2026-10-11',
    }),
    todo({
      title: 'Sam, 3 late',
      assignee: 'sam',
      dueDate: '2026-10-09',
    }),
    todo({ title: 'Nobody, today', dueDate: '2026-10-12' }),
    todo({ title: 'Not close', assignee: 'alex', dueDate: '2026-10-20' }),
  ]
  const sent = between(items, '2026-10-12T07:29', '2026-10-12T07:30')

  it('gives each person their own, the unassigned, and anything 2+ days late', () => {
    const mine = sent.find((a) => a.kind === 'digest' && a.person === 'alex')
    expect(mine?.title).toBe('Mon, Oct 12: 2 today, 1 overdue')
    expect(mine?.message).toBe(
      'Today: Mine today, Nobody, today. Overdue: Sam, 3 late (3d, S).',
    )
    const theirs = sent.find((a) => a.kind === 'digest' && a.person === 'sam')
    expect(theirs?.title).toBe('Mon, Oct 12: 2 today, 2 overdue')
  })

  it('is skipped when there is nothing to say', () => {
    const quiet = between(
      [todo({ title: 'Not close', dueDate: '2026-10-20' })],
      '2026-10-12T07:29',
      '2026-10-12T07:30',
    )
    expect(quiet).toEqual([])
  })
})

describe('heads-up and nudge', () => {
  it('sends a heads-up N days before, to the assignee only', () => {
    const item = todo({
      title: 'Car registration',
      assignee: 'alex',
      dueDate: '2026-10-15',
      headsUpDays: [1, 3],
    })
    const sent = between([item], '2026-10-12T18:59', '2026-10-12T19:00')
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      kind: 'headsup',
      person: 'alex',
      priority: 0,
      title: 'Car registration: due Thu',
      message: '3 days left. Yours.',
    })
  })

  it('sends a must-not-miss item to everyone at high priority', () => {
    const item = todo({
      title: 'Passports',
      assignee: 'alex',
      dueDate: '2026-10-13',
      mustNotMiss: true,
    })
    const sent = between([item], '2026-10-12T18:59', '2026-10-12T19:00')
    expect(sent.map((a) => [a.person, a.priority])).toEqual([
      ['alex', 1],
      ['sam', 1],
    ])
  })

  it('nudges an hour before a timed item, across midnight too', () => {
    const item = todo({
      title: 'Early flight',
      dueDate: '2026-10-13',
      dueTime: '00:30',
      headsUpDays: [],
    })
    const sent = between([item], '2026-10-12T23:29', '2026-10-12T23:30')
    expect(sent.map((a) => a.kind)).toEqual(['nudge', 'nudge'])
    expect(sent[0].title).toBe('Early flight: due 12:30 am')
  })
})

describe('the window', () => {
  const item = todo({
    title: 'Car registration',
    assignee: 'alex',
    dueDate: '2026-10-13',
  })

  it('hands each alert to exactly one of two back-to-back passes', () => {
    const first = between([item], '2026-10-12T18:59', '2026-10-12T19:00')
    const second = between([item], '2026-10-12T19:00', '2026-10-12T19:01')
    expect(first).toHaveLength(1)
    expect(second).toHaveLength(0)
  })

  it('catches up on what fell due while the app was down', () => {
    const sent = between([item], '2026-10-12T10:00', '2026-10-13T09:00')
    // Last evening's heads-up, then this morning's digest, both to the owner.
    expect(sent.map((a) => [a.kind, a.person])).toEqual([
      ['headsup', 'alex'],
      ['digest', 'alex'],
    ])
  })

  it('never sends an alert whose time had passed when the to-do was made', () => {
    // Made at 20:00 for tomorrow: the 19:00 heads-up is behind the watermark.
    const sent = between([item], '2026-10-12T20:00', '2026-10-12T20:01')
    expect(sent).toEqual([])
  })
})

describe('a late must-not-miss item', () => {
  it('alerts everyone every morning, and stays out of the digest', () => {
    const item = todo({
      title: 'Passports',
      assignee: 'alex',
      dueDate: '2026-10-10',
      mustNotMiss: true,
    })
    const sent = between([item], '2026-10-12T07:29', '2026-10-12T07:30')
    expect(sent.map((a) => [a.kind, a.person, a.priority])).toEqual([
      ['overdue', 'alex', 1],
      ['overdue', 'sam', 1],
    ])
    expect(sent[0].title).toBe('Passports: 2 days late')
  })
})

describe('the item screen', () => {
  it('lists only what is still ahead', () => {
    const item = todo({
      title: 'Car registration',
      dueDate: '2026-10-15',
      headsUpDays: [1, 3],
    })
    expect(upcomingAlerts(item, '2026-10-12T19:30', config)).toEqual([
      { at: '2026-10-14T19:00', kind: 'headsup', forDate: '2026-10-14' },
      { at: '2026-10-15T07:30', kind: 'digest' },
    ])
  })
})

describe('planning day', () => {
  const TUESDAY = 2
  const items = [
    todo({ title: 'Fan', assignee: 'alex', dueDate: '2026-11-20' }),
    todo({
      title: 'Insurance',
      assignee: 'alex',
      dueDate: '2026-11-24',
      planWeek: true,
    }),
    todo({ title: 'Dentist', assignee: 'sam', dueDate: '2026-11-16' }),
    todo({ title: 'Bins', assignee: 'alex', dueDate: '2026-11-24' }),
  ]
  const at = (from: string, to: string) =>
    alertsInWindow({ items, people, from, to, config, planDay: TUESDAY })

  it('turns the morning digest into one that opens the review', () => {
    const sent = at('2026-11-24T07:29', '2026-11-24T07:30')
    const alex = sent.find((a) => a.person === 'alex')
    expect(alex?.title).toBe('Planning day, Tue, Nov 24')
    expect(alex?.message).toBe(
      'You have 2 left from last week, and Sam has 1. Today: Bins. Tap to review them and plan the week.',
    )
    expect(alex?.path).toBe('/?review=1')
    expect(sent.find((a) => a.person === 'sam')?.message).toBe(
      'You have 1 left from last week, and Alex has 2. Tap to review them and plan the week.',
    )
  })

  it('says what is left of the week the evening before, to its owner', () => {
    const sent = at('2026-11-23T18:59', '2026-11-23T19:00')
    expect(sent.map((a) => [a.person, a.title])).toEqual([
      ['alex', 'Planning day tomorrow: 1 this-week to-do left'],
      ['alex', 'Bins: due tomorrow'],
    ])
  })

  it('leaves other mornings as they were', () => {
    const sent = at('2026-11-25T07:29', '2026-11-25T07:30')
    expect(sent.every((a) => !a.title.startsWith('Planning'))).toBe(true)
  })
})
