// The single-key shortcuts that move between screens, and the dialog that
// lists every shortcut, behind "?". N for Add lives with Add (capture.tsx);
// on the home page D, W, M and T move it in place (routes/_app/index.tsx),
// so they are left to it there.
import {
  createContext,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { cn } from 'cn'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SHORTCUT_GROUPS, hotkeyOf, typingIn } from '@/lib/hotkeys'
import type { Hotkey } from '@/lib/hotkeys'

const OpenShortcuts = createContext<() => void>(() => {})

/** Opens the shortcuts dialog. */
export function useOpenShortcuts() {
  return use(OpenShortcuts)
}

/** The home page's own keys, which it answers in place. */
const HOME_KEYS: ReadonlySet<Hotkey> = new Set([
  'calendar',
  'day',
  'week',
  'month',
  'today',
])

export function ShortcutsProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const latest = useRef({ pathname, navigate })
  useLayoutEffect(() => {
    latest.current = { pathname, navigate }
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = hotkeyOf(event)
      if (!key || key === 'add') return
      if (
        typingIn(event.target as HTMLElement | null) ||
        document.querySelector(
          '[role="dialog"], [role="alertdialog"], [role="menu"]',
        )
      )
        return
      const now = latest.current
      if (key !== 'help' && now.pathname === '/' && HOME_KEYS.has(key)) return
      event.preventDefault()
      const go = (to: string, view?: 'week' | 'month') =>
        void now.navigate({ to, search: view ? { view } : {} })
      switch (key) {
        case 'help':
          return setOpen(true)
        case 'calendar':
        case 'day':
        case 'today':
          return go('/')
        case 'week':
        case 'month':
          return go('/', key)
        case 'lists':
          return go('/list')
        case 'account':
          return go('/account')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <OpenShortcuts value={() => setOpen(true)}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="gap-5 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription className="sr-only">
              Single keys, pressed anywhere outside a text box.
            </DialogDescription>
          </DialogHeader>
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} className="flex flex-col gap-1.5">
              <h3 className="text-xs font-medium text-muted-foreground">
                {group.title}
              </h3>
              <dl className="flex flex-col">
                {group.keys.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-4 py-1"
                  >
                    <dt>{row.label}</dt>
                    <dd className="flex gap-1">
                      {row.keys.map((key) => (
                        <Key key={key}>{key}</Key>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </DialogContent>
      </Dialog>
    </OpenShortcuts>
  )
}

/** A key, drawn like the N on Add. */
export function Key({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <kbd
      className={cn(
        'inline-flex min-w-4.5 justify-center rounded border border-border px-1 font-mono text-[0.6875rem] leading-4 text-muted-foreground',
        className,
      )}
    >
      {children}
    </kbd>
  )
}
