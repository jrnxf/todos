// Which alerts exist and when. Pure: no clock, no database, no network. The
// scheduler asks "what fell due between these two wall-clock stamps" and the
// item screen asks "when will this one alert next"; both answers come from
// the same schedule, so the screen cannot promise something the scheduler
// does not do.
//
// Three kinds plus one switch:
//   digest   every morning, one per person, skipped when there is nothing
//   headsup  in the evening, N days before a deadline
//   nudge    shortly before an item that has a clock time
//   overdue  only for must-not-miss items: every morning once late
// Must-not-miss also sends that item's alerts to everyone at high priority.
import {
  addDays,
  addMinutes,
  diffDays,
  formatDay,
  formatMonthDay,
  formatTime,
  formatWeekday,
  toStamp,
} from '@/lib/dates'
import type { LocalDate, LocalTime, Stamp } from '@/lib/dates'

export type AlertKind = 'digest' | 'headsup' | 'nudge' | 'overdue'

export interface AlertItem {
  id: number
  title: string
  assignee: string | null
  dueDate: LocalDate | null
  dueTime: LocalTime | null
  headsUpDays: Array<number>
  mustNotMiss: boolean
}

export interface AlertPerson {
  id: string
  name: string
  initial: string
}

export interface AlertConfig {
  digestTime: LocalTime
  headsUpTime: LocalTime
  nudgeMinutesBefore: number
}

export interface PlannedAlert {
  /** 0 for the digest. */
  itemId: number
  kind: AlertKind
  /** With item, kind and person, the key an alert is sent at most once under. */
  forDate: LocalDate
  person: string
  at: Stamp
  title: string
  message: string
  /** 1 is Pushover's high priority: it ignores quiet hours. */
  priority: 0 | 1
  /** Where tapping the alert lands, relative to the app. */
  path: string
}

/** Days late at which someone else's to-do shows up in your digest too. */
const LATE_FOR_EVERYONE = 2

export interface ScheduledAlert {
  at: Stamp
  kind: 'headsup' | 'nudge'
  forDate: LocalDate
}

/** Every heads-up and nudge one item will ever send, soonest first. */
export function itemSchedule(
  item: AlertItem,
  config: AlertConfig,
): Array<ScheduledAlert> {
  if (!item.dueDate) return []
  const schedule: Array<ScheduledAlert> = []
  for (const days of item.headsUpDays) {
    if (days < 1) continue
    const forDate = addDays(item.dueDate, -days)
    schedule.push({
      at: toStamp(forDate, config.headsUpTime),
      kind: 'headsup',
      forDate,
    })
  }
  if (item.dueTime) {
    schedule.push({
      at: addMinutes(
        toStamp(item.dueDate, item.dueTime),
        -config.nudgeMinutesBefore,
      ),
      kind: 'nudge',
      forDate: item.dueDate,
    })
  }
  return schedule.sort((a, b) => a.at.localeCompare(b.at))
}

function recipients(
  item: AlertItem,
  people: Array<AlertPerson>,
): Array<AlertPerson> {
  if (item.mustNotMiss || !item.assignee) return people
  const assignee = people.find((p) => p.id === item.assignee)
  return assignee ? [assignee] : people
}

function ownership(
  item: AlertItem,
  person: AlertPerson,
  people: Array<AlertPerson>,
): string {
  if (!item.assignee) return 'Nobody has picked this up.'
  if (item.assignee === person.id) return 'Yours.'
  const owner = people.find((p) => p.id === item.assignee)
  return owner ? `${owner.name}'s.` : 'Nobody has picked this up.'
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function lead(minutes: number): string {
  return minutes % 60 === 0
    ? plural(minutes / 60, 'hour')
    : plural(minutes, 'minute')
}

function headsUp(
  item: AlertItem,
  dueDate: LocalDate,
  on: ScheduledAlert,
  person: AlertPerson,
  people: Array<AlertPerson>,
): PlannedAlert {
  const days = diffDays(dueDate, on.forDate)
  const when =
    days === 1
      ? 'tomorrow'
      : days < 7
        ? formatWeekday(dueDate)
        : formatMonthDay(dueDate)
  const time = item.dueTime ? `, ${formatTime(item.dueTime)}` : ''
  return {
    itemId: item.id,
    kind: 'headsup',
    forDate: on.forDate,
    person: person.id,
    at: on.at,
    title: `${item.title}: due ${when}${time}`,
    message: `${plural(days, 'day')} left. ${ownership(item, person, people)}`,
    priority: item.mustNotMiss ? 1 : 0,
    path: `/item/${item.id}`,
  }
}

function nudge(
  item: AlertItem,
  dueTime: LocalTime,
  on: ScheduledAlert,
  person: AlertPerson,
  people: Array<AlertPerson>,
  config: AlertConfig,
): PlannedAlert {
  return {
    itemId: item.id,
    kind: 'nudge',
    forDate: on.forDate,
    person: person.id,
    at: on.at,
    title: `${item.title}: due ${formatTime(dueTime)}`,
    message: `${lead(config.nudgeMinutesBefore)} left. ${ownership(item, person, people)}`,
    priority: item.mustNotMiss ? 1 : 0,
    path: `/item/${item.id}`,
  }
}

function overdue(
  item: AlertItem,
  dueDate: LocalDate,
  date: LocalDate,
  at: Stamp,
  person: AlertPerson,
  people: Array<AlertPerson>,
): PlannedAlert {
  return {
    itemId: item.id,
    kind: 'overdue',
    forDate: date,
    person: person.id,
    at,
    title: `${item.title}: ${plural(diffDays(date, dueDate), 'day')} late`,
    message: `Was due ${formatDay(dueDate)}. ${ownership(item, person, people)}`,
    priority: 1,
    path: `/item/${item.id}`,
  }
}

/** The morning digest for one person, or null when there is nothing to say. */
function digest(
  items: Array<AlertItem>,
  date: LocalDate,
  at: Stamp,
  person: AlertPerson,
  people: Array<AlertPerson>,
): PlannedAlert | null {
  const mine = (item: AlertItem) =>
    !item.assignee || item.assignee === person.id
  const initialOf = (item: AlertItem) =>
    item.assignee && item.assignee !== person.id
      ? people.find((p) => p.id === item.assignee)?.initial
      : undefined

  const today = items.filter(
    (item) => item.dueDate === date && (mine(item) || item.mustNotMiss),
  )
  // A late must-not-miss item sends its own, louder alert at the same moment.
  const late = items
    .filter((item) => item.dueDate && item.dueDate < date && !item.mustNotMiss)
    .map((item) => ({ item, days: diffDays(date, item.dueDate as LocalDate) }))
    .filter(({ item, days }) => mine(item) || days >= LATE_FOR_EVERYONE)
    .sort((a, b) => a.days - b.days)

  if (today.length === 0 && late.length === 0) return null

  const counts = [
    today.length > 0 ? `${today.length} today` : '',
    late.length > 0 ? `${late.length} overdue` : '',
  ].filter(Boolean)

  const sentences: Array<string> = []
  if (today.length > 0) {
    const names = today.map((item) => {
      const extra = [
        item.dueTime ? formatTime(item.dueTime) : '',
        initialOf(item) ?? '',
      ].filter(Boolean)
      return extra.length > 0
        ? `${item.title} (${extra.join(', ')})`
        : item.title
    })
    sentences.push(`Today: ${names.join(', ')}.`)
  }
  if (late.length > 0) {
    const names = late.map(({ item, days }) => {
      const extra = [`${days}d`, initialOf(item) ?? ''].filter(Boolean)
      return `${item.title} (${extra.join(', ')})`
    })
    sentences.push(`Overdue: ${names.join(', ')}.`)
  }

  return {
    itemId: 0,
    kind: 'digest',
    forDate: date,
    person: person.id,
    at,
    title: `${formatDay(date)}: ${counts.join(', ')}`,
    message: sentences.join(' '),
    priority: 0,
    path: '/',
  }
}

/**
 * Every alert that falls due after `from`, up to and including `to`, for the
 * open items given. Evaluated against the items as they are now: a to-do
 * finished at 07:29 is not in the 07:30 digest.
 */
export function alertsInWindow(input: {
  items: Array<AlertItem>
  people: Array<AlertPerson>
  from: Stamp
  to: Stamp
  config: AlertConfig
}): Array<PlannedAlert> {
  const { items, people, from, to, config } = input
  const inWindow = (at: Stamp) => at > from && at <= to
  const planned: Array<PlannedAlert> = []

  const lastDate = to.slice(0, 10)
  for (
    let date = from.slice(0, 10);
    date <= lastDate;
    date = addDays(date, 1)
  ) {
    const morning = toStamp(date, config.digestTime)
    if (!inWindow(morning)) continue
    for (const person of people) {
      const summary = digest(items, date, morning, person, people)
      if (summary) planned.push(summary)
    }
    for (const item of items) {
      if (!item.mustNotMiss || !item.dueDate || item.dueDate >= date) continue
      for (const person of people) {
        planned.push(overdue(item, item.dueDate, date, morning, person, people))
      }
    }
  }

  for (const item of items) {
    for (const on of itemSchedule(item, config)) {
      if (!inWindow(on.at)) continue
      for (const person of recipients(item, people)) {
        planned.push(
          on.kind === 'headsup'
            ? headsUp(item, item.dueDate as LocalDate, on, person, people)
            : nudge(
                item,
                item.dueTime as LocalTime,
                on,
                person,
                people,
                config,
              ),
        )
      }
    }
  }

  return planned.sort((a, b) => a.at.localeCompare(b.at))
}

export interface UpcomingAlert {
  at: Stamp
  kind: 'headsup' | 'nudge' | 'digest'
}

/** What one item will still send, soonest first, for the item screen. */
export function upcomingAlerts(
  item: AlertItem,
  now: Stamp,
  config: AlertConfig,
): Array<UpcomingAlert> {
  if (!item.dueDate) return []
  const upcoming: Array<UpcomingAlert> = itemSchedule(item, config)
  upcoming.push({
    at: toStamp(item.dueDate, config.digestTime),
    kind: 'digest',
  })
  return upcoming
    .filter((alert) => alert.at > now)
    .sort((a, b) => a.at.localeCompare(b.at))
}
