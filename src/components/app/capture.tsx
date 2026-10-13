// Adding a to-do: a title and one row of pills, sitting on the keyboard. A
// pill is an icon until it is set, then it shows its value. Sending clears
// the bar and leaves it open, so several to-dos go in one after another. A
// date typed into the title ("dentist fri 5pm") is read out of it.
import { createContext, use, useEffect, useRef, useState } from 'react'
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
  DrawerKeyboard,
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

export function AddProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [preset, setPreset] = useState<Partial<ItemFields>>({})
  // A fresh bar every time it opens.
  const [session, setSession] = useState(0)
  const desktop = useIsDesktop()

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
        <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
          {/* Sits on top of the phone's keyboard, not behind it. */}
          <DrawerKeyboard>
            <DrawerContent className="mx-auto max-w-md data-[swipe-direction=down]:bottom-(--drawer-keyboard-inset,0px)">
              <DrawerHeader className="sr-only">
                <DrawerTitle>{TITLE}</DrawerTitle>
                <DrawerDescription>{DESCRIPTION}</DrawerDescription>
              </DrawerHeader>
              <div className="px-4 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {bar}
              </div>
            </DrawerContent>
          </DrawerKeyboard>
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
  ...props
}: {
  /** An area's colour, shown in place of the icon once the pill is set. */
  dot?: AreaColor
  icon: LucideIcon
  /** What the pill is for; read out when it shows only an icon. */
  label: string
  /** The value once set. Empty means not set. */
  value?: string
} & React.ComponentProps<typeof Button>) {
  return value ? (
    <Button
      variant="secondary"
      size="sm"
      aria-label={`${label}: ${value}`}
      {...props}
      className="rounded-full"
    >
      {dot ? <AreaDot color={dot} /> : <Icon data-icon="inline-start" />}
      {value}
    </Button>
  ) : (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label={label}
      {...props}
      className="rounded-full text-muted-foreground"
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
      className="flex flex-col gap-2.5"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
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

      <div className="flex flex-wrap items-center gap-1.5">
        <Picker
          title="When"
          description="Pick a date and, if it matters, a time."
          open={open === 'when'}
          onOpenChange={toggle('when')}
          trigger={
            <Pill
              icon={CalendarIcon}
              label="Date"
              value={shortWhenLabel(when, board.today)}
            />
          }
        >
          <WhenFields
            value={when}
            onChange={(picked) => {
              patch(picked)
              setPickedWhen(true)
            }}
            onDone={() => setOpen(null)}
          />
        </Picker>

        <Picker
          title="Area"
          description="File it under an area."
          open={open === 'area'}
          onOpenChange={toggle('area')}
          trigger={
            <Pill
              icon={TagIcon}
              label="Area"
              value={area?.name ?? ''}
              dot={area?.color}
            />
          }
        >
          <AreaFields
            value={fields.areaId}
            onChange={(areaId) => {
              patch({ areaId })
              setOpen(null)
            }}
          />
        </Picker>

        <Picker
          title="Who"
          description="Whose to-do this is."
          open={open === 'who'}
          onOpenChange={toggle('who')}
          trigger={
            <Pill
              icon={UserIcon}
              label="Who"
              value={
                board.people.find((p) => p.id === fields.assignee)?.name ?? ''
              }
            />
          }
        >
          <WhoFields
            value={fields.assignee}
            onChange={(assignee) => {
              patch({ assignee })
              setOpen(null)
            }}
          />
        </Picker>

        <Picker
          title="Heads-up"
          description="How far ahead of the deadline to be warned."
          open={open === 'headsUp'}
          onOpenChange={toggle('headsUp')}
          trigger={
            <Pill
              icon={BellIcon}
              label="Heads-up"
              value={headsUpPill(fields.headsUpDays)}
            />
          }
        >
          <HeadsUpFields
            value={fields.headsUpDays}
            onChange={(headsUpDays) => patch({ headsUpDays })}
          />
        </Picker>

        <Pill
          icon={FlagIcon}
          label="Must not miss"
          value={fields.mustNotMiss ? 'Must not miss' : ''}
          aria-pressed={fields.mustNotMiss}
          onClick={() => patch({ mustNotMiss: !fields.mustNotMiss })}
        />

        <Button
          type="submit"
          size="icon"
          className="ml-auto rounded-full"
          disabled={!title}
          aria-label="Add"
        >
          <ArrowUpIcon />
        </Button>
      </div>
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
