// Who is shown where, with the picture Google sent at sign in. The household
// list is configuration (PEOPLE) and holds no pictures; the picture link lives
// on the sign-in account, found by the address that person signs in with.
import type { Person } from '@/server/env'

/** A person as the screens draw them. */
export interface PersonView extends Person {
  /** The Google picture link, or null: initials are shown instead. */
  image: string | null
}

/** Only an https link is ever handed to an <img>. */
function pictureOf(image: string | null | undefined): string | null {
  if (!image) return null
  try {
    return new URL(image).protocol === 'https:' ? image : null
  } catch {
    return null
  }
}

/** Puts each sign-in account's picture on the person it belongs to. */
export function withPictures(
  people: ReadonlyArray<Person>,
  accounts: ReadonlyArray<{ email: string; image: string | null }>,
  emailFor: (personId: string) => string | null,
): Array<PersonView> {
  return people.map((person) => {
    const email = emailFor(person.id)?.trim().toLowerCase()
    const account = email
      ? accounts.find((one) => one.email.trim().toLowerCase() === email)
      : undefined
    return { ...person, image: pictureOf(account?.image) }
  })
}
