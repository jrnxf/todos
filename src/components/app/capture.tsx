// Adding a to-do: a title and one row of pills. A pill is an icon until it
// is set, then it shows its value. Sending clears the bar and leaves it open,
// so several to-dos go in one after another. A date typed into the title
// ("dentist fri 5pm") is read out of it.
//
// On a phone the bar is a sheet from the top of the screen, where neither the
// keyboard nor the browser's own bars can cover it, and a pill opens its
// choices inside the sheet: the cursor never leaves the title, so the
// keyboard never goes away.
import {
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  ArrowUpIcon,
  BellIcon,
  CalendarIcon,
  CheckIcon,
  FlagIcon,
  PlusIcon,
  TagIcon,
  UserIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { useAddItem, useBoard } from '@/lib/queries'
import { parseWhen, shortWhenLabel } from '@/lib/when'
import { AreaDot } from './area'
import { Picker, useIsDesktop } from './picker'
import { AreaFields, HeadsUpFields, WhoFields } from './small-pickers'
import { WhenFields } from './when-picker'
import type { LucideIcon } from 'lucide-react'
import type { AreaColor } from '@/db/schema'
import type { DateParser, When } from '@/lib/when'
import type { ItemFields } from '@/server/board'

export const EMPTY_FIELDS: ItemFields = {
  title: '',
  notes: '',
  areaId: null,
  assignee: null,
  dueDate: null,
  dueTime: null,
  headsUpDays: [1],
  mustNotMiss: false,
}

const TITLE = 'Add a to-do'
const DESCRIPTION =
  'Type what needs doing. A date in the title is read as the deadline.'

const AddContext = createContext<(preset?: Partial<ItemFields>) => void>(
  () => {},
)

/** Opens the capture bar, optionally with fields already set. */
export function useAdd() {
  return use(AddContext)
}

// The date parser is a sizeable library that only this bar needs, so it is
// fetched the first time the bar opens and kept.
let parserLoading: Promise<DateParser> | undefined

function useDateParser(): DateParser | null {
  const [parser, setParser] = useState<DateParser | null>(null)
  useEffect(() => {
    let live = true
    parserLoading ??= import('chrono-node')
    void parserLoading.then((loaded) => {
      if (live) setParser(() => loaded)
    })
    return () => {
      live = false
    }
  }, [])
  return parser
}

// Room kept clear above the keyboard. Safari on a phone draws its address
// and its previous/next strip over the page there without counting them as
// covered, so a sheet that ran to the keyboard's edge would end under them.
const BROWSER_BAR = 96

/** How much of the screen the keyboard leaves, or null where that is unknown. */
function useVisibleHeight(): number | null {
  return useSyncExternalStore(
    (onChange) => {
      window.visualViewport?.addEventListener('resize', onChange)
      return () =>
        window.visualViewport?.removeEventListener('resize', onChange)
    },
    () => window.visualViewport?.height ?? null,
    () => null,
  )
}

// A tap on anything in the sheet but a text box leaves the cursor where it
// is. The cursor is what keeps the phone's keyboard up.
function keepCursor(event: React.MouseEvent) {
  if (!(event.target as HTMLElement).closest('input, textarea, select'))
    event.preventDefault()
}

export function AddProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [preset, setPreset] = useState<Partial<ItemFields>>({})
  // A fresh bar every time it opens.
  const [session, setSession] = useState(0)
  const desktop = useIsDesktop()
  const visibleHeight = useVisibleHeight()

  const start = (fields: Partial<ItemFields> = {}) => {
    setPreset(fields)
    setSession((count) => count + 1)
    setOpen(true)
  }
  // "N" for new, from anywhere that is not a text box.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'n' || event.metaKey || event.ctrlKey || event.altKey)
        return
      const target = event.target as HTMLElement | null
      if (
        target?.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')
      )
        return
      event.preventDefault()
      setPreset({})
      setSession((count) => count + 1)
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const bar = (
    <CaptureBar key={session} preset={preset} onClose={() => setOpen(false)} />
  )

  return (
    <AddContext value={start}>
      {children}
      {desktop ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            showCloseButton={false}
            className="top-[16%] translate-y-0 gap-0 p-4 sm:max-w-xl"
          >
            <DialogHeader className="sr-only">
              <DialogTitle>{TITLE}</DialogTitle>
              <DialogDescription>{DESCRIPTION}</DialogDescription>
            </DialogHeader>
            {bar}
          </DialogContent>
        </Dialog>
      ) : (
        <Drawer
          open={open}
          onOpenChange={setOpen}
          swipeDirection="up"
          showSwipeHandle
        >
          <DrawerContent
            className="mx-auto max-w-md"
            // No taller than what the keyboard leaves; past that the choices
            // scroll under the title and the pills.
            style={
              visibleHeight
                ? ({
                    '--drawer-content-max-height': `${visibleHeight - BROWSER_BAR}px`,
                  } as React.CSSProperties)
                : undefined
            }
            onMouseDown={keepCursor}
          >
            <DrawerHeader className="sr-only">
              <DrawerTitle>{TITLE}</DrawerTitle>
              <DrawerDescription>{DESCRIPTION}</DrawerDescription>
            </DrawerHeader>
            <div className="flex min-h-0 flex-col px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-1">
              {bar}
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </AddContext>
  )
}

function Pill({
  icon: Icon,
  label,
  value,
  dot,
  roomy,
  ...props
}: {
  /** An area's colour, shown in place of the icon once the pill is set. */
  dot?: AreaColor
  /** Thumb-sized, for a phone. */
  roomy?: boolean
  icon: LucideIcon
  /** What the pill is for; read out when it shows only an icon. */
  label: string
  /** The value once set. Empty means not set. */
  value?: string
} & React.ComponentProps<typeof Button>) {
  return value ? (
    <Button
      variant="secondary"
      size={roomy ? 'lg' : 'sm'}
      aria-label={`${label}: ${value}`}
      {...props}
      className="rounded-full aria-expanded:ring-1 aria-expanded:ring-foreground"
    >
      {dot ? <AreaDot color={dot} /> : <Icon data-icon="inline-start" />}
      {value}
    </Button>
  ) : (
    <Button
      variant="outline"
      size={roomy ? 'icon-lg' : 'icon-sm'}
      aria-label={label}
      {...props}
      className="rounded-full text-muted-foreground aria-expanded:border-foreground aria-expanded:text-foreground"
    >
      <Icon />
    </Button>
  )
}

/** "2w, 1d"; nothing for the default of one day. */
function headsUpPill(days: Array<number>): string {
  if (days.length === 1 && days[0] === 1) return ''
  if (days.length === 0) return 'No heads-up'
  return [...days]
    .sort((a, b) => b - a)
    .map((n) => (n % 7 === 0 ? `${n / 7}w` : `${n}d`))
    .join(', ')
}

type Open = 'when' | 'area' | 'who' | 'headsUp' | null

function CaptureBar({
  preset,
  onClose,
}: {
  preset: Partial<ItemFields>
  onClose: () => void
}) {
  const board = useBoard()
  const add = useAddItem()
  const parser = useDateParser()
  const desktop = useIsDesktop()
  const titleRef = useRef<HTMLInputElement>(null)

  const blank = { ...EMPTY_FIELDS, ...preset }
  const [fields, setFields] = useState<ItemFields>(blank)
  // Once a date is picked by hand, the title is no longer read for one.
  const [pickedWhen, setPickedWhen] = useState(false)
  // A phrase the parser took for a date and the person said is not one.
  const [notADate, setNotADate] = useState<string | null>(null)
  const [added, setAdded] = useState<string | null>(null)
  const [open, setOpen] = useState<Open>(null)

  const parsed =
    parser && !pickedWhen ? parseWhen(parser, fields.title, board.today) : null
  const read = parsed && parsed.phrase !== notADate ? parsed : null
  const when: When = read ?? {
    dueDate: fields.dueDate,
    dueTime: fields.dueTime,
  }
  const title = (read ? read.title : fields.title).trim()
  const area = board.areas.find((one) => one.id === fields.areaId)

  const patch = (change: Partial<ItemFields>) =>
    setFields((now) => ({ ...now, ...change }))
  const toggle = (which: Exclude<Open, null>) => (isOpen: boolean) =>
    setOpen(isOpen ? which : null)

  const pickers: Array<{
    key: Exclude<Open, null>
    title: string
    description: string
    pill: React.ComponentProps<typeof Pill>
    fields: React.ReactNode
  }> = [
    {
      key: 'when',
      title: 'When',
      description: 'Pick a date and, if it matters, a time.',
      pill: {
        icon: CalendarIcon,
        label: 'Date',
        value: shortWhenLabel(when, board.today),
      },
      fields: (
        <WhenFields
          value={when}
          calendar={desktop ? 'shown' : 'asked-for'}
          onChange={(picked) => {
            patch(picked)
            setPickedWhen(true)
          }}
          onDone={() => setOpen(null)}
        />
      ),
    },
    {
      key: 'area',
      title: 'Area',
      description: 'File it under an area.',
      pill: {
        icon: TagIcon,
        label: 'Area',
        value: area?.name ?? '',
        dot: area?.color,
      },
      fields: (
        <AreaFields
          value={fields.areaId}
          onChange={(areaId) => {
            patch({ areaId })
            setOpen(null)
          }}
        />
      ),
    },
    {
      key: 'who',
      title: 'Who',
      description: 'Whose to-do this is.',
      pill: {
        icon: UserIcon,
        label: 'Who',
        value: board.people.find((p) => p.id === fields.assignee)?.name ?? '',
      },
      fields: (
        <WhoFields
          value={fields.assignee}
          onChange={(assignee) => {
            patch({ assignee })
            setOpen(null)
          }}
        />
      ),
    },
    {
      key: 'headsUp',
      title: 'Heads-up',
      description: 'How far ahead of the deadline to be warned.',
      pill: {
        icon: BellIcon,
        label: 'Heads-up',
        value: headsUpPill(fields.headsUpDays),
      },
      fields: (
        <HeadsUpFields
          value={fields.headsUpDays}
          onChange={(headsUpDays) => patch({ headsUpDays })}
        />
      ),
    },
  ]
  const shown = pickers.find((picker) => picker.key === open)

  const submit = () => {
    if (!title) return
    add.mutate({ ...fields, ...when, title })
    setAdded(title)
    setFields(blank)
    setPickedWhen(false)
    setNotADate(null)
    titleRef.current?.focus()
  }

  return (
    <form
      className="flex min-h-0 flex-col gap-2.5"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      // Wherever a tap on a phone left the cursor, a choice made puts it back
      // in the title unless another text box has it.
      onClick={() => {
        if (desktop) return
        const focused = document.activeElement
        if (!focused?.matches('input, textarea, select'))
          titleRef.current?.focus()
      }}
    >
      {added && (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5">
            <CheckIcon className="size-3.5 shrink-0 text-success" />
            <span className="truncate">Added "{added}"</span>
          </span>
          <Button variant="ghost" size="xs" onClick={onClose}>
            Done
          </Button>
        </div>
      )}

      <Input
        ref={titleRef}
        value={fields.title}
        onChange={(event) => patch({ title: event.target.value })}
        placeholder={added ? 'Add another' : 'What needs doing?'}
        aria-label="What needs doing"
        autoFocus
        autoComplete="off"
        enterKeyHint="send"
        maxLength={200}
        className="h-9 border-0 bg-transparent px-0 text-base font-medium shadow-none focus-visible:ring-0 md:text-base dark:bg-transparent"
      />

      {read && (
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <CalendarIcon className="size-3.5" />
          Read "{read.phrase}" as the date.
          <Button
            variant="link"
            size="xs"
            className="h-auto p-0"
            onClick={() => setNotADate(read.phrase)}
          >
            Not a date
          </Button>
        </p>
      )}

      {/* The send button stays beside the first row when the pills wrap. */}
      <div className="flex items-start gap-1.5">
        <div className="flex min-h-10 min-w-0 flex-1 flex-wrap items-center gap-1.5 lg:min-h-8">
          {pickers.map((picker) =>
            desktop ? (
              <Picker
                key={picker.key}
                title={picker.title}
                description={picker.description}
                open={open === picker.key}
                onOpenChange={toggle(picker.key)}
                trigger={<Pill {...picker.pill} />}
              >
                {picker.fields}
              </Picker>
            ) : (
              <Pill
                key={picker.key}
                {...picker.pill}
                roomy
                aria-expanded={open === picker.key}
                onClick={() => toggle(picker.key)(open !== picker.key)}
              />
            ),
          )}

          <Pill
            icon={FlagIcon}
            label="Must not miss"
            value={fields.mustNotMiss ? 'Must not miss' : ''}
            roomy={!desktop}
            aria-pressed={fields.mustNotMiss}
            onClick={() => patch({ mustNotMiss: !fields.mustNotMiss })}
          />
        </div>

        <Button
          type="submit"
          size={desktop ? 'icon' : 'icon-lg'}
          className="rounded-full max-lg:size-10"
          disabled={!title}
          aria-label="Add"
        >
          <ArrowUpIcon />
        </Button>
      </div>

      {/* On a phone the choices open here, under the row, in the same sheet. */}
      {!desktop && shown && (
        <div className="min-h-0 overflow-y-auto overscroll-contain border-t pt-3 pb-1">
          {shown.fields}
        </div>
      )}
    </form>
  )
}

/** The bar every screen ends with. */
export function AddBar({ preset }: { preset?: Partial<ItemFields> }) {
  const add = useAdd()
  return (
    <Button
      variant="outline"
      size="xl"
      className="w-full justify-start font-normal text-muted-foreground shadow-xs"
      onClick={() => add(preset)}
    >
      <PlusIcon data-icon="inline-start" />
      Add a to-do
    </Button>
  )
}
