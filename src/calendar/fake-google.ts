// For tests only: Google Calendar as the sync sees it, in memory. Each
// change to a calendar gets the next number in its history, and a sync token
// is a place in that history, as Google's are. What a person does in Google
// Calendar themselves goes through `asPerson`, which is not counted as the
// app's calls.
import { BudgetSpent, GoogleError } from './google'
import type { CalendarApi, Channel, EventPage } from './google'
import type { GoogleEvent } from './mapping'

interface FakeCalendar {
  id: string
  owner: string
  summary: string
  timeZone: string
  events: Map<string, GoogleEvent>
  /** Event id per change, in order: index + 1 is the change's number. */
  history: Array<string>
}

export class FakeGoogle {
  readonly calendars = new Map<string, FakeCalendar>()
  readonly channels = new Map<
    string,
    Channel & { calendarId: string; resourceId: string; stopped: boolean }
  >()
  /** Every call the app made, as 'person method'. */
  readonly calls: Array<string> = []
  /** Sync tokens Google has forgotten. */
  readonly forgotten = new Set<string>()
  pageSize = 250
  /** Calls the app may still make before a pass runs out. */
  budget = Number.POSITIVE_INFINITY
  private next = 1

  constructor(private readonly now: () => Date) {}

  /** The Calendar API as `person`, the way the app calls it. */
  apiFor(person: string): CalendarApi {
    const count = (method: string) => {
      if (this.budget <= 0) throw new BudgetSpent()
      this.budget--
      this.calls.push(`${person} ${method}`)
    }
    return {
      insertCalendar: async (body) => {
        count('insertCalendar')
        const id = `cal-${this.next++}@group.calendar.google.com`
        this.calendars.set(id, {
          id,
          owner: person,
          ...body,
          events: new Map(),
          history: [],
        })
        return { id }
      },
      deleteCalendar: async (calendarId) => {
        count('deleteCalendar')
        this.calendar(calendarId)
        this.calendars.delete(calendarId)
      },
      listEvents: async (calendarId, page) => {
        count('listEvents')
        return this.list(calendarId, page)
      },
      insertEvent: async (calendarId, body) => {
        count('insertEvent')
        return this.insert(calendarId, body)
      },
      patchEvent: async (calendarId, eventId, body) => {
        count('patchEvent')
        return this.patch(calendarId, eventId, body)
      },
      deleteEvent: async (calendarId, eventId) => {
        count('deleteEvent')
        this.remove(calendarId, eventId)
      },
      watchEvents: async (calendarId, channel) => {
        count('watchEvents')
        this.calendar(calendarId)
        const resourceId = `resource-${calendarId}`
        this.channels.set(channel.id, {
          ...channel,
          calendarId,
          resourceId,
          stopped: false,
        })
        return {
          resourceId,
          expiresAt: this.now().getTime() + channel.ttlSeconds * 1000,
        }
      },
      stopChannel: async (channelId) => {
        count('stopChannel')
        const channel = this.channels.get(channelId)
        if (!channel) throw new GoogleError(404, 'notFound', 'no channel')
        channel.stopped = true
      },
    }
  }

  /** What the person does by hand in Google Calendar. */
  asPerson(calendarId: string) {
    return {
      create: (body: Partial<GoogleEvent>) => this.insert(calendarId, body),
      edit: (eventId: string, body: Partial<GoogleEvent>) =>
        this.patch(calendarId, eventId, body),
      delete: (eventId: string) => this.remove(calendarId, eventId),
    }
  }

  calendarOf(person: string): FakeCalendar | undefined {
    return [...this.calendars.values()].find((c) => c.owner === person)
  }

  /** The events a person sees in their calendar. */
  visible(calendarId: string): Array<GoogleEvent> {
    return [...this.calendar(calendarId).events.values()].filter(
      (event) => event.status !== 'cancelled',
    )
  }

  writes(): Array<string> {
    return this.calls.filter((call) => /(insert|patch|delete)Event$/.test(call))
  }

  private calendar(calendarId: string): FakeCalendar {
    const calendar = this.calendars.get(calendarId)
    if (!calendar) throw new GoogleError(404, 'notFound', 'no such calendar')
    return calendar
  }

  private touch(calendar: FakeCalendar, event: GoogleEvent): GoogleEvent {
    const stamped = {
      ...event,
      etag: `"${this.next++}"`,
      updated: this.now().toISOString(),
    }
    calendar.events.set(event.id, stamped)
    calendar.history.push(event.id)
    return structuredClone(stamped)
  }

  private insert(calendarId: string, body: Partial<GoogleEvent>): GoogleEvent {
    const calendar = this.calendar(calendarId)
    return this.touch(calendar, {
      status: 'confirmed',
      ...structuredClone(body),
      id: `event${this.next++}`,
      etag: '',
    })
  }

  private patch(
    calendarId: string,
    eventId: string,
    body: Partial<GoogleEvent>,
  ): GoogleEvent {
    const calendar = this.calendar(calendarId)
    const event = calendar.events.get(eventId)
    if (!event) throw new GoogleError(404, 'notFound', 'no such event')
    if (event.status === 'cancelled') {
      throw new GoogleError(410, 'deleted', 'event deleted')
    }
    return this.touch(calendar, { ...event, ...structuredClone(body) })
  }

  private remove(calendarId: string, eventId: string): void {
    const calendar = this.calendar(calendarId)
    const event = calendar.events.get(eventId)
    if (!event) throw new GoogleError(404, 'notFound', 'no such event')
    if (event.status === 'cancelled') {
      throw new GoogleError(410, 'deleted', 'event deleted')
    }
    this.touch(calendar, { ...event, status: 'cancelled' })
  }

  private list(
    calendarId: string,
    page: { syncToken: string | null; pageToken: string | null },
  ): EventPage {
    const calendar = this.calendar(calendarId)
    if (page.syncToken && this.forgotten.has(page.syncToken)) {
      throw new GoogleError(410, 'fullSyncRequired', 'sync token expired')
    }
    // The page token carries the listing's starting place and its offset.
    const [from, offset] = page.pageToken
      ? page.pageToken.split(':').map(Number)
      : [page.syncToken ? Number(page.syncToken) : 0, 0]
    const ids = [...new Set(calendar.history.slice(from))]
    const items = ids
      .slice(offset, offset + this.pageSize)
      .map((id) => structuredClone(calendar.events.get(id)!))
    const more = offset + this.pageSize < ids.length
    return more
      ? { items, nextPageToken: `${from}:${offset + this.pageSize}` }
      : { items, nextSyncToken: String(calendar.history.length) }
  }
}
