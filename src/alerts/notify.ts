// The one way an alert leaves the app. Everything that wants to reach a
// person calls notify(); which service carries it is decided here and
// nowhere else, so adding a second channel is a change to this file only.
import { env } from '@/server/env'

export interface Notice {
  /** A person id from the PEOPLE setting. */
  person: string
  title: string
  message: string
  /** 1 is high priority: it ignores the recipient's quiet hours. */
  priority: 0 | 1
  /** Path inside the app that tapping the alert opens. */
  path?: string
}

export type Channel = 'pushover' | 'log'

/** How alerts reach this person right now. */
export function channelFor(person: string): Channel {
  return env.pushover.appToken && env.pushover.userKeys[person]
    ? 'pushover'
    : 'log'
}

/** Resolves once the alert has been accepted for delivery; throws if not. */
export async function notify(notice: Notice): Promise<void> {
  if (!env.pushover.appToken) {
    console.log(
      `[alerts] (not sent, no Pushover token) to ${notice.person}: ${notice.title} | ${notice.message}`,
    )
    return
  }
  const userKey = env.pushover.userKeys[notice.person]
  if (!userKey) {
    throw new Error(`no Pushover user key configured for "${notice.person}"`)
  }

  const body = new URLSearchParams({
    token: env.pushover.appToken,
    user: userKey,
    title: notice.title,
    message: notice.message,
    priority: String(notice.priority),
  })
  if (notice.path) {
    body.set('url', `${env.appUrl}${notice.path}`)
    body.set('url_title', 'Open')
  }

  const response = await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    // Pushover's reply names the field it rejected and never echoes a key.
    const reason = await response.text().catch(() => '')
    throw new Error(`Pushover answered ${response.status}: ${reason}`)
  }
}
