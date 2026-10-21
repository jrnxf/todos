// The frame around every screen: a top bar on a laptop, and a title block
// with the avatar plus the tab bar on a phone. The avatar opens one menu on
// both (account-menu.tsx); there is no sidebar.
import { Link } from '@tanstack/react-router'
import {
  CalendarDaysIcon,
  CheckIcon,
  ListChecksIcon,
  PlusIcon,
} from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { AccountMenu } from './account-menu'
import { useAdd } from './capture'

/** A screen's column; on a laptop it sits centred on the page. */
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
  phoneActions,
}: {
  /** A small word above the title, such as "Today". */
  eyebrow?: string
  title: string
  subtitle?: React.ReactNode
  /** Beside the avatar on a phone, for what the screen has no room for. */
  phoneActions?: React.ReactNode
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
      <div className="mt-1 flex shrink-0 items-center gap-2.5 lg:hidden">
        {phoneActions}
        <AccountMenu />
      </div>
    </header>
  )
}

const VIEWS = [
  { to: '/', label: 'Calendar', icon: CalendarDaysIcon, exact: true },
  { to: '/list', label: 'List', icon: ListChecksIcon, exact: false },
] as const

export function TabBar() {
  return (
    <nav aria-label="Views" className="grid grid-cols-2 border-t">
      {VIEWS.map((tab) => (
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

/** A laptop's bar over every screen: where you are, Add, and the avatar. */
export function TopBar() {
  const add = useAdd()
  return (
    <header className="sticky top-0 z-20 hidden h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-5 backdrop-blur lg:flex">
      <Link
        to="/"
        aria-label="todos, today"
        className="flex items-center gap-2 rounded-md font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <CheckIcon className="size-3.5" strokeWidth={3} />
        </span>
        todos
      </Link>
      <nav aria-label="Views" className="ml-3 flex gap-0.5">
        {VIEWS.map((view) => (
          <Link
            key={view.to}
            to={view.to}
            activeOptions={{ exact: view.exact, includeSearch: false }}
            className={cn(
              'flex h-8 items-center rounded-md px-3 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
              'data-[status=active]:bg-muted data-[status=active]:text-foreground',
            )}
          >
            {view.label}
          </Link>
        ))}
      </nav>
      <span className="flex-1" />
      <Button onClick={() => add()}>
        <PlusIcon data-icon="inline-start" />
        Add
        <kbd className="ml-1 rounded border border-primary-foreground/30 px-1 font-mono text-[0.6875rem] leading-4">
          N
        </kbd>
      </Button>
      <AccountMenu />
    </header>
  )
}
