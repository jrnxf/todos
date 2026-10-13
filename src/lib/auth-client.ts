// The browser's side of sign-in: start one, or end the session.
import { useMutation } from '@tanstack/react-query'
import { createAuthClient } from 'better-auth/react'
import { toast } from 'sonner'

export const authClient = createAuthClient()

/** Ends the session, then loads the sign-in page fresh. */
export function useSignOut() {
  return useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signOut()
      if (error) throw new Error(error.message)
    },
    // A full page load, so nothing of the list is left in memory.
    onSuccess: () => window.location.assign('/signin'),
    onError: () => toast.error('Could not sign out. Try again.'),
  })
}
