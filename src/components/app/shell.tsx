// The frame around the three phone screens: a title block with whoever is
// signed in, and the tab bar underneath.
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { CalendarIcon, ListChecksIcon, SunriseIcon } from 'lucide-react'
import { useBoard } from '@/lib/queries'
import { PersonAvatar } from './todo-row'

function AccountLink({ className }: { className?: string }) {
  const { people, me } = useBoard()
  return (
    <Link
      to="/account"
      aria-label="Account"
      className={cn(
        'rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        className,
      )}
    >
      <PersonAvatar person={people.find((p) => p.id === me)} size="lg" />
    </Link>
  )
}

/** A screen's column; on a laptop it sits centred between the two panes. */
export function Column({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-5 lg:mx-auto lg:w-full lg:max-w-2xl',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
}: {
  /** A small word above the title, such as "Today". */
  eyebrow?: string
  title: string
  subtitle?: React.ReactNode
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="text-sm text-muted-foreground">{eyebrow}</p>}
        <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight">
          {title}
        </h1>
        {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
      </div>
      <AccountLink className="mt-1 lg:hidden" />
    </header>
  )
}

const TABS = [
  { to: '/', label: 'Today', icon: SunriseIcon, exact: true },
  { to: '/list', label: 'List', icon: ListChecksIcon, exact: false },
  { to: '/calendar', label: 'Calendar', icon: CalendarIcon, exact: false },
] as const

export function TabBar() {
  return (
    <nav aria-label="Views" className="grid grid-cols-3 border-t">
      {TABS.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          activeOptions={{ exact: tab.exact, includeSearch: false }}
          className="flex flex-col items-center gap-1 pt-2.5 pb-2 text-xs text-muted-foreground outline-none focus-visible:bg-muted data-[status=active]:font-medium data-[status=active]:text-foreground"
        >
          <tab.icon className="size-5.5" />
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
