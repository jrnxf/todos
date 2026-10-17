import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { CheckIcon, CircleAlertIcon } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { returnPath } from '@/lib/signed-out'

export const Route = createFileRoute('/signin')({
  head: () => ({ meta: [{ title: 'Sign in - todos' }] }),
  // `redirect` is where the browser was headed; `error` is why the last try
  // at signing in came back empty-handed.
  validateSearch: z.object({
    redirect: z.string().optional(),
    error: z.string().optional(),
  }),
  component: SignInScreen,
})

// The one page anyone can see. Someone already signed in never gets here:
// the door (src/start.ts) sends them straight on to the list.
function SignInScreen() {
  const { redirect, error } = Route.useSearch()
  const [leaving, setLeaving] = useState(false)

  async function signIn() {
    setLeaving(true)
    const result = await authClient.signIn.social({
      provider: 'google',
      callbackURL: returnPath(redirect),
      errorCallbackURL: '/signin',
    })
    // On success the browser is already on its way to Google.
    if (result.error) {
      setLeaving(false)
      toast.error(
        result.error.status === 503
          ? 'Sign-in has not been set up yet.'
          : 'Could not reach Google. Try again.',
      )
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-4 py-[max(2rem,env(safe-area-inset-top))]">
      <div className="flex flex-col gap-4">
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <CheckIcon className="size-6" strokeWidth={3} />
        </span>
        <div>
          <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight">
            todos
          </h1>
          <p className="text-muted-foreground">
            One list for the whole household.
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          {error === 'not_on_the_list' ? (
            <>
              <AlertTitle>That account is not on the list</AlertTitle>
              <AlertDescription>
                Only the Google accounts this household added can open it. Try a
                different one.
              </AlertDescription>
            </>
          ) : (
            <>
              <AlertTitle>Sign-in did not finish</AlertTitle>
              <AlertDescription>
                Nothing was changed. Try again.
              </AlertDescription>
            </>
          )}
        </Alert>
      )}

      <Button
        variant="outline"
        size="xl"
        className="w-full"
        disabled={leaving}
        onClick={signIn}
      >
        <GoogleMark data-icon="inline-start" />
        Continue with Google
      </Button>
    </main>
  )
}

function GoogleMark(props: React.ComponentProps<'svg'>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}
