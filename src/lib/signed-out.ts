// The few things the server and the browser have to agree on about being
// signed out.

/** What the server answers, with a 401, to a request from nobody. */
export const SIGNED_OUT = 'signed-out'

/**
 * Where to send a browser once it has signed in. Only a path on this site
 * counts; anything else, such as another site's address, becomes the list.
 */
export function returnPath(path: string | null | undefined): string {
  if (!path || !/^\/(?![/\\])/.test(path) || path.startsWith('/signin')) {
    return '/'
  }
  return path
}

/** The sign-in page, remembering where the browser was headed. */
export function signInPath(from: string): string {
  const back = returnPath(from)
  return back === '/'
    ? '/signin'
    : `/signin?redirect=${encodeURIComponent(back)}`
}
