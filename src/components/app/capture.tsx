// Adding a to-do: a title and one row of pills. A pill is an icon until it
// is set, then it shows its value. Sending clears the bar and leaves it open,
// so several to-dos go in one after another. What is said in the title is
// read out of it and fills the pills ("Sam: dentist fri 5pm !"); each reading
// can be taken back with one tap. With a TypeSafe key the server also asks
// Jev once typing pauses (src/server/jev-read.ts); what it is sure of comes
// first, and can be taken back the same way.
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
  SparklesIcon,
  TagIcon,
  UserIcon,
  XIcon,
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
import { readTitle } from '@/lib/read'
import { shortWhenLabel } from '@/lib/when'
import { readTitleWithJev } from '@/server/board'
import { AreaDot } from './area'
import { Picker, useIsDesktop } from './picker'
import { AreaFields, HeadsUpFields, WhoFields } from './small-pickers'
import { WhenFields } from './when-picker'
import type { LucideIcon } from 'lucide-react'
import type { AreaColor } from '@/db/schema'
import type { JevRead, ReadField } from '@/lib/read'
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
  'Type what needs doing. A date, a name, an area, a heads-up or "!" in the title fills in the rest.'

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

// How long typing has to pause before Jev is asked.
const ASK_AFTER_MS = 600

/**
 * Jev's reading of `title`, asked for once typing has paused; null until it
 * answers and whenever there is no answer. Nothing is asked without `ask`,
 * the fields still open. While more is typed onto a title that was answered,
 * that answer holds, so a filled pill does not blink out on every key.
 */
function useJevRead(
  title: string,
  ask: Array<ReadField>,
  enabled: boolean,
): JevRead | null {
  const [answer, setAnswer] = useState<{
    title: string
    read: JevRead | null
  } | null>(null)
  const wanted = enabled && ask.length > 0 && title.length >= 3
  // Which fields are open is read when the pause ends. A pill set by hand
  // meanwhile is not a reason to ask again: its answer is simply not used.
  const asking = useRef(ask)
  useEffect(() => {
    asking.current = ask
  })
  useEffect(() => {
    if (!wanted) return
    let live = true
    const timer = setTimeout(() => {
      readTitleWithJev({ data: { title, ask: asking.current } }).then(
        (read) => {
          if (live) setAnswer({ title, read })
        },
        // Offline or signed out: no answer, and nothing to say about it.
        () => {
          if (live) setAnswer({ title, read: null })
        },
      )
    }, ASK_AFTER_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [title, wanted])
  return wanted && answer && title.startsWith(answer.title) ? answer.read : null
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

const READ_FIELDS: Array<{ field: ReadField; icon: LucideIcon; name: string }> =
  [
    { field: 'when', icon: CalendarIcon, name: 'the date' },
    { field: 'area', icon: TagIcon, name: 'the area' },
    { field: 'who', icon: UserIcon, name: 'who' },
    { field: 'headsUp', icon: BellIcon, name: 'the heads-up' },
    { field: 'flag', icon: FlagIcon, name: 'must not miss' },
  ]

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
  // Once a pill is set by hand, the title is no longer read for it.
  const [byHand, setByHand] = useState<ReadonlySet<ReadField>>(new Set())
  // The words of a reading the person took back. They are not read again,
  // though different words for the same pill would be.
  const [takenBack, setTakenBack] = useState<
    Partial<Record<ReadField, string>>
  >({})
  // A field whose reading was taken back is not Jev's to fill either.
  const [notJevs, setNotJevs] = useState<ReadonlySet<ReadField>>(new Set())
  const [added, setAdded] = useState<string | null>(null)
  const [open, setOpen] = useState<Open>(null)

  const typed = fields.title.trim()
  // Asked about only what is still open. With every pill set by hand or
  // taken back there is nothing to ask, and nothing is sent.
  const jev = useJevRead(
    typed,
    READ_FIELDS.map((one) => one.field).filter(
      (field) => !byHand.has(field) && !notJevs.has(field),
    ),
    board.jev,
  )
  const readWith = (skip: ReadonlySet<ReadField>) =>
    readTitle(parser, typed, {
      today: board.today,
      me: board.me,
      people: board.people,
      areas: board.areas,
      skip,
      jev,
      notJevs,
    })
  const first = readWith(byHand)
  const refused = READ_FIELDS.map((one) => one.field).filter(
    (field) =>
      first.phrases[field] !== undefined &&
      first.phrases[field] === takenBack[field],
  )
  const read =
    refused.length > 0 ? readWith(new Set([...byHand, ...refused])) : first
  // What will be sent: the pills set by hand, under what the title says.
  const now: ItemFields = { ...fields, ...read.fields }
  const title = read.title
  const when: When = { dueDate: now.dueDate, dueTime: now.dueTime }
  const area = board.areas.find((one) => one.id === now.areaId)

  const patch = (change: Partial<ItemFields>) =>
    setFields((before) => ({ ...before, ...change }))
  /** A pill set by hand: it holds, whatever the title goes on to say. */
  const set = (field: ReadField, change: Partial<ItemFields>) => {
    patch(change)
    setByHand((before) => new Set([...before, field]))
  }
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
          onChange={(picked) => set('when', picked)}
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
          value={now.areaId}
          onChange={(areaId) => {
            set('area', { areaId })
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
        value: board.people.find((p) => p.id === now.assignee)?.name ?? '',
      },
      fields: (
        <WhoFields
          value={now.assignee}
          onChange={(assignee) => {
            set('who', { assignee })
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
        value: headsUpPill(now.headsUpDays),
      },
      fields: (
        <HeadsUpFields
          value={now.headsUpDays}
          onChange={(headsUpDays) => set('headsUp', { headsUpDays })}
        />
      ),
    },
  ]
  const shown = pickers.find((picker) => picker.key === open)
  // What the title filled in, each with the words it came from.
  const wasRead = READ_FIELDS.flatMap((one) => {
    const phrase = read.phrases[one.field]?.replace(/^[\s,;]+/, '')
    return phrase ? [{ ...one, phrase }] : []
  })
  // And what Jev filled in: the words it took for it, or else the value.
  const guessedValue: Record<ReadField, string> = {
    when: shortWhenLabel(when, board.today),
    area: area?.name ?? '',
    who: board.people.find((p) => p.id === now.assignee)?.name ?? '',
    headsUp: headsUpPill(now.headsUpDays) || '1d',
    flag: 'Must not miss',
  }
  const wasGuessed = READ_FIELDS.flatMap((one) => {
    const words = read.guessed[one.field]
    return words === undefined
      ? []
      : [{ ...one, words, value: guessedValue[one.field] }]
  })

  const submit = () => {
    if (!title) return
    add.mutate({ ...now, title })
    setAdded(title)
    setFields(blank)
    setByHand(new Set())
    setTakenBack({})
    setNotJevs(new Set())
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

      {(wasRead.length > 0 || wasGuessed.length > 0) && (
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {wasRead.length > 0 && 'Read from the title'}
          {wasRead.map(({ field, icon: Icon, name, phrase }) => (
            <Button
              key={field}
              variant="outline"
              size={desktop ? 'xs' : 'sm'}
              className="max-w-full rounded-full font-normal"
              aria-label={`"${phrase}" is not ${name}`}
              onClick={() => {
                setTakenBack((before) => ({
                  ...before,
                  [field]: read.phrases[field],
                }))
                setNotJevs((before) => new Set([...before, field]))
              }}
            >
              <Icon data-icon="inline-start" />
              <span className="truncate">{phrase}</span>
              <XIcon data-icon="inline-end" />
            </Button>
          ))}
          {wasGuessed.length > 0 && 'Guessed'}
          {wasGuessed.map(({ field, name, words, value }) => (
            <Button
              key={field}
              variant="outline"
              size={desktop ? 'xs' : 'sm'}
              className="max-w-full rounded-full font-normal"
              aria-label={`${words ? `"${words}"` : value} is a guess, and not ${name}`}
              // Taken back, the pill is the person's: empty until they set
              // it, with its words back in the title.
              onClick={() => setByHand((before) => new Set([...before, field]))}
            >
              <SparklesIcon data-icon="inline-start" />
              <span className="truncate">{words || value}</span>
              <XIcon data-icon="inline-end" />
            </Button>
          ))}
        </div>
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
            value={now.mustNotMiss ? 'Must not miss' : ''}
            roomy={!desktop}
            aria-pressed={now.mustNotMiss}
            onClick={() => set('flag', { mustNotMiss: !now.mustNotMiss })}
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
