// Adding a to-do: a title and one row of pills. A pill is an icon until it
// is set, then it shows its value. Sending clears the bar and leaves it open,
// so several to-dos go in one after another. What is said in the title is
// read out of it and fills the pills ("Sam: dentist fri 5pm !"); each reading
// can be taken back with one tap. With a TypeSafe key the server also has
// Jev check that reading once typing pauses (src/server/jev-read.ts): it may
// pick a tag where none was read, which can be taken back the same way, and
// take back a date read from words that are part of a name.
//
// None of that moves the bar. What was read sits in a line that is always
// there, and each pill has a place of its own that says what it is for until
// it is filled, so a reading coming or going changes what is shown but never
// where anything is. The words read stay in the title, drawn as taken out.
// While Jev checks, what it was asked about shimmers and the line says so.
//
// On a phone the bar is a sheet from the top of the screen, where neither the
// keyboard nor the browser's own bars can cover it, and a pill opens its
// choices inside the sheet: the cursor never leaves the title, so the
// keyboard never goes away.
import {
  createContext,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { useMatch } from '@tanstack/react-router'
import { cn } from 'cn'
import {
  ArrowUpIcon,
  BellIcon,
  CalendarIcon,
  CheckIcon,
  FlagIcon,
  LoaderCircleIcon,
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
import { startingFields } from '@/lib/add-preset'
import { formatDay } from '@/lib/dates'
import { hotkeyOf, typingIn } from '@/lib/hotkeys'
import { useAddItem, useBoard } from '@/lib/queries'
import { readTitle } from '@/lib/read'
import { answerHolds, heldReadings, steadyChips } from '@/lib/steady'
import { QUESTIONS, verifiedRead, verifyRequest } from '@/lib/verify'
import { shortWhenLabel } from '@/lib/when'
import { checkTitleWithJev } from '@/server/board'
import { TagDot } from './tag'
import { Picker, useIsDesktop } from './picker'
import { TagFields, HeadsUpFields, WhoFields } from './small-pickers'
import { WhenFields } from './when-picker'
import type { LucideIcon } from 'lucide-react'
import type { TagColor } from '@/db/schema'
import type { LocalDate } from '@/lib/dates'
import type { ReadField } from '@/lib/read'
import type { HeldReadings } from '@/lib/steady'
import type { Verdict } from '@/lib/verify'
import type { DateParser, When } from '@/lib/when'
import type { ItemFields } from '@/server/board'

export const EMPTY_FIELDS: ItemFields = {
  title: '',
  notes: '',
  tagId: null,
  assignee: null,
  dueDate: null,
  dueTime: null,
  headsUpDays: [1],
  mustNotMiss: false,
}

const TITLE = 'Add a to-do'
const DESCRIPTION =
  'Type what needs doing. A date, a name, a tag, a heads-up or "!" in the title fills in the rest.'

const AddContext = createContext<(preset?: Partial<ItemFields>) => void>(
  () => {},
)
/** The day the calendar has picked, and how the calendar says so. */
const PickedContext = createContext<{
  picked: LocalDate | null
  setPicked: (day: LocalDate | null) => void
}>({ picked: null, setPicked: () => {} })

/**
 * Opens the capture bar, optionally with fields already set. With no
 * deadline among them, it starts on the day the calendar has picked.
 */
export function useAdd() {
  return use(AddContext)
}

/** The day a new to-do starts on, while the calendar is on screen. */
export function usePickedDay(): LocalDate | null {
  const { picked } = use(PickedContext)
  const { today } = useBoard()
  // The calendar says its day once it is up; until then the URL's day
  // stands in, so the server's page already names it and nothing changes
  // its words as the page comes alive.
  const fromUrl = useMatch({
    from: '/_app/',
    shouldThrow: false,
    select: (match) => match.search.day ?? today,
  })
  return picked ?? fromUrl ?? null
}

/** Makes `day` the one a new to-do starts on, for as long as this is mounted. */
export function useAddsTo(day: LocalDate) {
  const { setPicked } = use(PickedContext)
  useEffect(() => {
    setPicked(day)
  }, [day, setPicked])
  useEffect(() => () => setPicked(null), [setPicked])
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

// How long what Jev just changed is pointed out ("Checked", a date's words
// struck) before the bar goes quiet again.
const JUST_ANSWERED_MS = 2000

/**
 * Jev's verdict on the reading of `title`, asked for once typing has paused;
 * null until it answers and whenever there is no answer. Nothing is asked
 * unless `wanted`: there is something for it to judge. `skip` is the fields
 * that are not its to judge. While more is typed onto a title that was
 * answered, or a letter is taken off it, that answer holds (lib/steady.ts),
 * so a filled pill does not blink out on every key. `asking` is whether it
 * is being asked about `title` right now, and `justAnswered` whether it
 * answered about `title` a moment ago.
 */
function useJevVerdict(
  title: string,
  skip: Array<ReadField>,
  wanted: boolean,
): { verdict: Verdict | null; asking: boolean; justAnswered: boolean } {
  const [answer, setAnswer] = useState<{
    title: string
    verdict: Verdict | null
  } | null>(null)
  const [asking, setAsking] = useState<string | null>(null)
  const [justAnswered, setJustAnswered] = useState<string | null>(null)
  // Which fields are open is read when the pause ends. A pill set by hand
  // meanwhile is not a reason to ask again: its answer is simply not used.
  const skipping = useRef(skip)
  useEffect(() => {
    skipping.current = skip
  })
  useEffect(() => {
    if (!wanted) return
    let live = true
    const timer = setTimeout(() => {
      setAsking(title)
      checkTitleWithJev({ data: { title, skip: skipping.current } }).then(
        (verdict) => {
          if (!live) return
          setAnswer({ title, verdict })
          setAsking(null)
          setJustAnswered(title)
          setTimeout(
            () => setJustAnswered((was) => (was === title ? null : was)),
            JUST_ANSWERED_MS,
          )
        },
        // Offline or signed out: no answer, and nothing to say about it.
        () => {
          if (!live) return
          setAnswer({ title, verdict: null })
          setAsking(null)
        },
      )
    }, ASK_AFTER_MS)
    return () => {
      live = false
      clearTimeout(timer)
      setAsking(null)
    }
  }, [title, wanted])
  const holds =
    wanted &&
    answer !== null &&
    answerHolds(title, answer.title, answer.verdict?.notWhen)
  return {
    verdict: holds ? answer.verdict : null,
    asking: wanted && asking === title,
    justAnswered: holds && justAnswered === title,
  }
}

export function AddProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [preset, setPreset] = useState<Partial<ItemFields>>({})
  // A fresh bar every time it opens.
  const [session, setSession] = useState(0)
  const desktop = useIsDesktop()
  const visibleHeight = useVisibleHeight()
  const [picked, setPicked] = useState<LocalDate | null>(null)
  const pickedRef = useRef(picked)
  pickedRef.current = picked

  const start = (fields?: Partial<ItemFields>) => {
    setPreset(startingFields(fields, pickedRef.current))
    setSession((count) => count + 1)
    setOpen(true)
  }
  // "N" for new, from anywhere that is not a text box: the same as Add.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        hotkeyOf(event) !== 'add' ||
        typingIn(event.target as HTMLElement | null)
      )
        return
      event.preventDefault()
      setPreset(startingFields(undefined, pickedRef.current))
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
      <PickedContext value={{ picked, setPicked }}>{children}</PickedContext>
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

/**
 * A pill that keeps its size whatever it holds: its label ("Date") until it
 * is set, then its value, cut short if it has to be. Filling it changes what
 * it says, never where it or the pills after it are. `place` gives it that
 * size, or its place in the phone's grid.
 */
function Pill({
  icon: Icon,
  label,
  value,
  dot,
  roomy,
  place,
  guessed,
  asking,
  tentative,
  className,
  ...props
}: {
  /** A tag's colour, shown in place of the icon once the pill is set. */
  dot?: TagColor
  /** Thumb-sized, for a phone. */
  roomy?: boolean
  icon: LucideIcon
  /** What the pill is for: shown until it is set, and read out. */
  label: string
  /** The value once set. Empty means not set. */
  value?: string
  place: string
  /** Jev picked it. */
  guessed?: boolean
  /** Jev is being asked about it. */
  asking?: boolean
  /** Held from a word still being typed, no longer read (lib/steady.ts). */
  tentative?: boolean
} & React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant={value ? 'secondary' : 'outline'}
      size={roomy ? 'lg' : 'sm'}
      aria-label={value ? `${label}: ${value}` : label}
      {...props}
      className={cn(
        'min-w-0 justify-start rounded-full transition-[color,background-color,border-color,box-shadow]',
        value
          ? 'aria-expanded:ring-1 aria-expanded:ring-foreground'
          : 'text-muted-foreground aria-expanded:border-foreground aria-expanded:text-foreground',
        asking && 'sweeping',
        place,
        className,
      )}
    >
      {dot ? (
        <span
          data-icon="inline-start"
          className="grid size-4 place-items-center"
        >
          <TagDot color={dot} />
        </span>
      ) : (
        <Icon data-icon="inline-start" />
      )}
      <span
        // A new value fades in where the old one was.
        key={value || label}
        className={cn(
          'min-w-0 flex-1 truncate text-left duration-150 ease-settle animate-in fade-in motion-safe:slide-in-from-bottom-1',
          tentative && 'opacity-60',
        )}
      >
        {value || label}
      </span>
      {guessed && (
        <SparklesIcon aria-hidden className="size-3! text-muted-foreground" />
      )}
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

type Open = 'when' | 'tag' | 'who' | 'headsUp' | null

const READ_FIELDS: Array<{ field: ReadField; icon: LucideIcon; name: string }> =
  [
    { field: 'when', icon: CalendarIcon, name: 'the date' },
    { field: 'tag', icon: TagIcon, name: 'the tag' },
    { field: 'who', icon: UserIcon, name: 'who' },
    { field: 'headsUp', icon: BellIcon, name: 'the heads-up' },
    { field: 'flag', icon: FlagIcon, name: 'must not miss' },
  ]
const FIELD_ICON = Object.fromEntries(
  READ_FIELDS.map((one) => [one.field, one.icon]),
) as Record<ReadField, LucideIcon>
const FIELD_NAME = Object.fromEntries(
  READ_FIELDS.map((one) => [one.field, one.name]),
) as Record<ReadField, string>

/** Each pill's own place: its width on a laptop, its cell on a phone. */
const PLACE: Record<ReadField, { desktop: string; phone: string }> = {
  when: { desktop: 'w-30', phone: '[grid-area:when]' },
  tag: { desktop: 'w-23', phone: '[grid-area:tag]' },
  who: { desktop: 'w-18', phone: '[grid-area:who]' },
  headsUp: { desktop: 'w-24.5', phone: '[grid-area:head]' },
  flag: { desktop: '', phone: '[grid-area:flag]' },
}

/** The fields of a reading that belong to one pill. */
function fieldsOf(
  read: Partial<ItemFields>,
  field: ReadField,
): Partial<ItemFields> {
  switch (field) {
    case 'when':
      return { dueDate: read.dueDate, dueTime: read.dueTime ?? null }
    case 'tag':
      return { tagId: read.tagId }
    case 'who':
      return { assignee: read.assignee }
    case 'headsUp':
      return { headsUpDays: read.headsUpDays }
    case 'flag':
      return { mustNotMiss: read.mustNotMiss }
  }
}

/** A chip in the read line. */
interface Chip {
  key: string
  field: ReadField
  /** Read by the rules, guessed by Jev, or a date Jev just took back. */
  kind: 'read' | 'guess' | 'struck'
  text: string
  /** The words as typed, where there are any. */
  phrase?: string
  /** Held from a word still being typed (lib/steady.ts). */
  tentative?: boolean
  /** Jev is being asked about it. */
  checking?: boolean
}

/** Words of the title marked as read. */
interface Mark {
  start: number
  end: number
  tone: 'read' | 'tentative' | 'checking' | 'struck'
}

const MARK_TONE: Record<Mark['tone'], string> = {
  read: 'rounded-sm bg-muted-foreground/12 text-muted-foreground ring-2 ring-muted-foreground/12',
  checking:
    'sweeping inline-block rounded-sm bg-muted-foreground/12 align-top text-muted-foreground',
  tentative:
    'text-muted-foreground underline decoration-dashed decoration-1 underline-offset-5',
  struck: 'text-foreground',
}

/**
 * The title box, with the words read out of it drawn as taken out. They
 * stay in what was typed: a copy of the text under the box marks them, and
 * the box's own text is hidden while there is anything to mark. The copy
 * has the box's font, size and padding, and follows its scrolling, so each
 * letter sits exactly where the box would have drawn it.
 */
function Title({
  marks,
  inputRef,
  className,
  ...props
}: {
  marks: Array<Mark>
  inputRef: React.RefObject<HTMLInputElement | null>
} & Omit<React.ComponentProps<typeof Input>, 'ref'>) {
  const mirror = useRef<HTMLDivElement>(null)
  const follow = () => {
    if (mirror.current && inputRef.current)
      mirror.current.scrollLeft = inputRef.current.scrollLeft
  }
  useLayoutEffect(follow)
  const text = String(props.value ?? '')
  const inked = marks.length > 0
  const parts: Array<React.ReactNode> = []
  let at = 0
  for (const mark of [...marks].sort((a, b) => a.start - b.start)) {
    if (mark.start < at) continue
    parts.push(text.slice(at, mark.start))
    parts.push(
      <span
        key={mark.start}
        className={cn(
          'transition-[color,background-color,box-shadow] duration-300',
          MARK_TONE[mark.tone],
        )}
      >
        {text.slice(mark.start, mark.end)}
      </span>,
    )
    at = mark.end
  }
  parts.push(text.slice(at))
  return (
    <div className="relative">
      {inked && (
        <div
          ref={mirror}
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden py-1 text-base leading-7 font-medium whitespace-pre"
        >
          {parts}
        </div>
      )}
      <Input
        ref={inputRef}
        {...props}
        onScroll={follow}
        onSelect={follow}
        className={cn(
          'h-9 border-0 bg-transparent px-0 text-base font-medium shadow-none focus-visible:ring-0 md:text-base dark:bg-transparent',
          inked && 'text-transparent caret-foreground',
          className,
        )}
      />
    </div>
  )
}

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
  // A field whose reading was taken back is not Jev's to judge either.
  const [notJevs, setNotJevs] = useState<ReadonlySet<ReadField>>(new Set())
  const [added, setAdded] = useState<string | null>(null)
  const [open, setOpen] = useState<Open>(null)

  const typed = fields.title.trim()
  const household = {
    today: board.today,
    me: board.me,
    people: board.people,
    tags: board.tags,
  }
  const readWith = (skip: ReadonlySet<ReadField>) =>
    readTitle(parser, typed, { ...household, skip })
  const first = readWith(byHand)
  const refused = READ_FIELDS.map((one) => one.field).filter(
    (field) =>
      first.phrases[field] !== undefined &&
      first.phrases[field] === takenBack[field],
  )
  const skip = new Set([...byHand, ...refused])
  const rules = refused.length > 0 ? readWith(skip) : first
  // Jev checks that reading, and is asked only where there is something for
  // it to judge: no tag was read, or a date was. A pill set by hand or taken
  // back is not asked about, and with nothing to ask nothing is sent.
  const notAsked = [...new Set([...skip, ...notJevs])]
  const request =
    board.jev && typed.length >= 3
      ? verifyRequest(parser, typed, {
          ...household,
          skip: new Set(notAsked),
        }).request
      : null
  const jev = useJevVerdict(typed, notAsked, request !== null)
  const verdict = jev.verdict
  const read = verifiedRead(
    parser,
    typed,
    { ...household, skip },
    rules,
    verdict && {
      ...verdict,
      tag: notJevs.has('tag') ? undefined : verdict.tag,
    },
  )
  // What will be sent: the pills set by hand, under what the title says.
  const now: ItemFields = { ...fields, ...read.fields }
  const title = read.title
  const when: When = { dueDate: now.dueDate, dueTime: now.dueTime }
  // What Jev is being asked about right now, to mark until it answers.
  const questions = jev.asking ? request?.questions : undefined
  const asking = {
    tag: questions !== undefined && QUESTIONS.tag in questions,
    when: questions !== undefined && QUESTIONS.when in questions,
  }

  // A reading of the word still being typed is kept, dimmed, until that word
  // is done (lib/steady.ts). It is only shown: what is sent is what is read.
  const readNow: Partial<
    Record<ReadField, { phrase: string; value: Partial<ItemFields> }>
  > = {}
  for (const { field } of READ_FIELDS) {
    const phrase = read.phrases[field]
    if (phrase !== undefined && read.guessed[field] === undefined)
      readNow[field] = { phrase, value: fieldsOf(read.fields, field) }
  }
  const heldFor = `${fields.title}\u0000${[...skip].join()}`
  const [steady, setSteady] = useState<{
    for: string
    held: HeldReadings<Partial<ItemFields>>
  }>({ for: '', held: {} })
  let held = steady.held
  if (steady.for !== heldFor) {
    held = heldReadings(steady.held, fields.title, readNow, skip).held
    setSteady({ for: heldFor, held })
  }
  const tentative = READ_FIELDS.map((one) => one.field).filter(
    (field) =>
      held[field] !== undefined &&
      readNow[field] === undefined &&
      !skip.has(field) &&
      read.guessed[field] === undefined,
  )
  const shownFields: ItemFields = { ...now }
  for (const field of tentative) Object.assign(shownFields, held[field]?.value)
  const shownWhen: When = {
    dueDate: shownFields.dueDate,
    dueTime: shownFields.dueTime,
  }
  const tag = board.tags.find((one) => one.id === now.tagId)
  const shownTag = board.tags.find((one) => one.id === shownFields.tagId)

  const patch = (change: Partial<ItemFields>) =>
    setFields((before) => ({ ...before, ...change }))
  /** A pill set by hand: it holds, whatever the title goes on to say. */
  const set = (field: ReadField, change: Partial<ItemFields>) => {
    patch(change)
    setByHand((before) => new Set([...before, field]))
  }
  const toggle = (which: Exclude<Open, null>) => (isOpen: boolean) =>
    setOpen(isOpen ? which : null)
  const place = (field: ReadField) =>
    PLACE[field][desktop ? 'desktop' : 'phone']

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
        value: shortWhenLabel(shownWhen, board.today),
        place: place('when'),
        asking: asking.when,
        tentative: tentative.includes('when'),
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
      key: 'tag',
      title: 'Tag',
      description: 'File it under a tag.',
      pill: {
        icon: TagIcon,
        label: 'Tag',
        value: shownTag?.name ?? '',
        dot: shownTag?.color,
        place: place('tag'),
        asking: asking.tag && !shownTag,
        guessed: read.guessed.tag !== undefined,
        tentative: tentative.includes('tag'),
      },
      fields: (
        <TagFields
          value={now.tagId}
          onChange={(tagId) => {
            set('tag', { tagId })
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
        value:
          board.people.find((p) => p.id === shownFields.assignee)?.name ?? '',
        place: place('who'),
        tentative: tentative.includes('who'),
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
        value: headsUpPill(shownFields.headsUpDays),
        place: place('headsUp'),
        tentative: tentative.includes('headsUp'),
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

  // The chips in the read line: what the title filled in, each with the
  // words it came from; what Jev filled in, by its value; and for a moment
  // after Jev took a date back, the words it was read from, struck. A date
  // it took back fills nothing: its words are in the title again.
  const guessedValue: Record<ReadField, string> = {
    when: shortWhenLabel(when, board.today),
    tag: tag?.name ?? '',
    who: board.people.find((p) => p.id === now.assignee)?.name ?? '',
    headsUp: headsUpPill(now.headsUpDays) || '1d',
    flag: 'Must not miss',
  }
  const wanted: Array<Chip> = []
  for (const { field } of READ_FIELDS) {
    const phrase =
      read.phrases[field] ??
      (tentative.includes(field) ? held[field]?.phrase : undefined)
    const text = phrase?.replace(/^[\s,;]+/, '')
    if (phrase === undefined || !text) continue
    wanted.push({
      key: `read:${field}`,
      field,
      kind: 'read',
      text,
      phrase,
      tentative: read.phrases[field] === undefined,
      checking: field === 'when' && asking.when,
    })
  }
  for (const { field } of READ_FIELDS) {
    if (read.guessed[field] !== undefined && field !== 'when')
      wanted.push({
        key: `guess:${field}`,
        field,
        kind: 'guess',
        text: guessedValue[field],
      })
  }
  const struck = jev.justAnswered ? read.guessed.when : undefined
  if (struck !== undefined)
    wanted.push({
      key: 'struck:when',
      field: 'when',
      kind: 'struck',
      text: struck.replace(/^[\s,;]+/, ''),
      phrase: struck,
    })
  // In a steady order, and none taken away from under the pointer.
  const [pointerOnLine, setPointerOnLine] = useState(false)
  const chipsFor = `${JSON.stringify(wanted)}${pointerOnLine ? '+' : ''}`
  const [steadyLine, setSteadyLine] = useState<{
    for: string
    chips: Array<Chip & { gone?: boolean }>
  }>({ for: '', chips: [] })
  let chips = steadyLine.chips
  if (steadyLine.for !== chipsFor) {
    chips = steadyChips(steadyLine.chips, wanted, pointerOnLine)
    setSteadyLine({ for: chipsFor, chips })
  }
  // The same words, marked in the title.
  const marks: Array<Mark> = wanted.flatMap((chip) => {
    if (chip.phrase === undefined) return []
    const start = fields.title.lastIndexOf(chip.phrase)
    if (start < 0) return []
    const tone: Mark['tone'] =
      chip.kind === 'struck'
        ? 'struck'
        : chip.tentative
          ? 'tentative'
          : chip.checking
            ? 'checking'
            : 'read'
    return [{ start, end: start + chip.phrase.length, tone }]
  })
  const status: 'asking' | 'answered' | null = jev.asking
    ? 'asking'
    : jev.justAnswered &&
        (read.guessed.tag !== undefined || read.guessed.when !== undefined)
      ? 'answered'
      : null

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
      <Title
        inputRef={titleRef}
        marks={marks}
        value={fields.title}
        onChange={(event) => patch({ title: event.target.value })}
        placeholder={added ? 'Add another' : 'What needs doing?'}
        aria-label="What needs doing"
        autoFocus
        autoComplete="off"
        enterKeyHint="send"
        maxLength={200}
      />

      {/* The read line: always there, so nothing below it moves. */}
      <div
        className={cn('relative flex items-center', desktop ? 'h-6' : 'h-7')}
        onPointerEnter={() => setPointerOnLine(true)}
        onPointerLeave={() => setPointerOnLine(false)}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden mask-r-from-[calc(100%-1.5rem)]">
          {chips.map((chip) => {
            const size = desktop
              ? 'h-6 text-xs [&_svg]:size-3'
              : 'h-7 text-[0.8rem] [&_svg]:size-3.5'
            const enter =
              'duration-150 ease-settle animate-in fade-in motion-safe:slide-in-from-bottom-1'
            if (chip.kind === 'struck')
              return (
                <span
                  key={chip.key}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed px-2 text-muted-foreground',
                    size,
                    enter,
                  )}
                >
                  <CalendarIcon aria-hidden />
                  <span className="line-through">{chip.text}</span>
                  <span>· a name</span>
                </span>
              )
            const Icon =
              chip.kind === 'guess' ? SparklesIcon : FIELD_ICON[chip.field]
            const name = FIELD_NAME[chip.field]
            return (
              <Button
                key={chip.key}
                variant="outline"
                size={desktop ? 'xs' : 'sm'}
                disabled={chip.gone}
                className={cn(
                  'max-w-full shrink-0 rounded-full font-normal transition-[color,background-color,border-color,opacity]',
                  (chip.tentative || chip.checking) && 'border-dashed',
                  chip.tentative && 'opacity-60',
                  enter,
                )}
                aria-label={
                  chip.kind === 'guess'
                    ? `${chip.text} is a guess, and not ${name}`
                    : `"${chip.text}" is not ${name}`
                }
                onClick={() => {
                  if (chip.kind === 'guess') {
                    // Taken back, the pill is the person's: empty until
                    // they set it, with its words back in the title.
                    setByHand((before) => new Set([...before, chip.field]))
                    return
                  }
                  setTakenBack((before) => ({
                    ...before,
                    [chip.field]: chip.phrase,
                  }))
                  setNotJevs((before) => new Set([...before, chip.field]))
                }}
              >
                <Icon data-icon="inline-start" />
                <span className="truncate">{chip.text}</span>
                <XIcon data-icon="inline-end" />
              </Button>
            )
          })}
          {chips.length === 0 &&
            (added && !fields.title ? (
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <CheckIcon className="size-3.5 shrink-0 text-success" />
                <span className="truncate">Added "{added}"</span>
              </span>
            ) : (
              <span className="truncate text-xs text-muted-foreground">
                A date, a name, a tag or ! fills in as you type
              </span>
            ))}
        </div>
        {added && !fields.title && (
          <Button variant="ghost" size="xs" onClick={onClose}>
            Done
          </Button>
        )}
        {/* The one place that says Jev is at work. */}
        <div
          className={cn(
            'pointer-events-none absolute inset-y-0 right-0 flex items-center gap-1 bg-linear-to-r from-popover/0 to-popover to-40% pl-6 text-xs text-muted-foreground transition-opacity duration-150',
            status ? 'opacity-100' : 'opacity-0',
          )}
        >
          {status === 'asking' && (
            <>
              <LoaderCircleIcon className="size-3 motion-safe:animate-spin" />
              Checking
            </>
          )}
          {status === 'answered' && (
            <>
              <SparklesIcon className="size-3" />
              Checked
            </>
          )}
        </div>
      </div>

      <div className="flex items-start gap-1.5">
        {/* Every pill in a place of its own: a row on a laptop, two on a
            phone. Filling one never moves another. */}
        <div
          className={cn(
            'min-w-0 flex-1 gap-1.5',
            desktop
              ? 'flex items-center'
              : "grid grid-cols-[minmax(0,90fr)_minmax(0,60fr)_minmax(0,54fr)_--spacing(9)] [grid-template-areas:'when_when_tag_tag'_'who_head_head_flag']",
          )}
        >
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

          <Button
            variant={now.mustNotMiss ? 'secondary' : 'outline'}
            size={desktop ? 'icon-sm' : 'icon-lg'}
            aria-label="Must not miss"
            title="Must not miss"
            aria-pressed={now.mustNotMiss}
            className={cn(
              'rounded-full transition-[color,background-color,border-color,box-shadow]',
              !now.mustNotMiss && 'text-muted-foreground',
              place('flag'),
            )}
            onClick={() => set('flag', { mustNotMiss: !now.mustNotMiss })}
          >
            <FlagIcon className={cn(now.mustNotMiss && 'fill-current')} />
          </Button>
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

/** The bar every phone screen ends with. On the calendar it names its day. */
export function AddBar() {
  const add = useAdd()
  const picked = usePickedDay()
  const { today } = useBoard()
  return (
    <Button
      variant="outline"
      size="xl"
      className="w-full justify-start font-normal text-muted-foreground shadow-xs"
      onClick={() => add()}
    >
      <PlusIcon data-icon="inline-start" />
      {picked === null ? (
        'Add a to-do'
      ) : (
        <span>
          {picked === today ? 'Add for ' : 'Add to '}
          <span className="font-medium text-foreground">
            {picked === today ? 'today' : formatDay(picked)}
          </span>
        </span>
      )}
    </Button>
  )
}
