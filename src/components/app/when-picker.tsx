// The "When" picker: shortcuts, a calendar and an optional time in one
// place. Composed from shadcn's own calendar examples ("With Presets" and
// "With Time"); the shortcuts and the quick times are the household's.
import { useState } from 'react'
import { ClockIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { fromPickerDate, toPickerDate } from '@/lib/dates'
import { useBoard } from '@/lib/queries'
import { QUICK_TIMES, datePresets, whenLabel } from '@/lib/when'
import type { When } from '@/lib/when'

export function WhenFields({
  value,
  calendar = 'shown',
  onChange,
  onDone,
}: {
  value: When
  /**
   * The month grid is tall. Where room is short it stays folded behind a
   * "Pick a day" chip until it is asked for.
   */
  calendar?: 'shown' | 'asked-for'
  onChange: (when: When) => void
  onDone: () => void
}) {
  const { today } = useBoard()
  const presets = datePresets(today)
  const [asked, setAsked] = useState(false)
  const month = calendar === 'shown' || asked
  const setDate = (dueDate: string | null) =>
    onChange(dueDate ? { ...value, dueDate } : { dueDate: null, dueTime: null })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">When</h3>
        <Button
          variant="ghost"
          size="sm"
          disabled={!value.dueDate}
          onClick={() => setDate(null)}
        >
          Clear
        </Button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:gap-4">
        <ToggleGroup
          variant="chip"
          size="touch"
          aria-label="Shortcuts"
          className="w-full flex-wrap lg:w-40 lg:flex-col lg:flex-nowrap lg:items-stretch"
          value={value.dueDate ? [value.dueDate] : []}
          onValueChange={([picked]: Array<string | undefined>) =>
            setDate(picked ?? null)
          }
        >
          {presets.map((preset) => (
            <ToggleGroupItem
              key={preset.date}
              value={preset.date}
              className="lg:justify-between"
            >
              {preset.label}
              <span className="hidden text-xs font-normal opacity-60 lg:inline">
                {preset.hint}
              </span>
            </ToggleGroupItem>
          ))}
          {!month && (
            <Button
              variant="outline"
              className="h-10 px-3.5 text-sm"
              onClick={() => setAsked(true)}
            >
              Pick a day
            </Button>
          )}
        </ToggleGroup>

        <div className="flex flex-col gap-3 lg:w-64">
          {month && (
            <Calendar
              mode="single"
              selected={value.dueDate ? toPickerDate(value.dueDate) : undefined}
              // Follow the picked day when a shortcut jumps to another month.
              key={value.dueDate?.slice(0, 7) ?? 'none'}
              defaultMonth={toPickerDate(value.dueDate ?? today)}
              onSelect={(picked) =>
                setDate(picked ? fromPickerDate(picked) : null)
              }
              buttonVariant="outline"
              // Transparent, so it takes the colour of the sheet it sits in.
              className="w-full bg-transparent p-0 [--cell-size:--spacing(10)] lg:[--cell-size:--spacing(8)]"
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <InputGroup className="h-10 w-36 lg:h-8 lg:w-full">
              <InputGroupAddon>
                <ClockIcon />
              </InputGroupAddon>
              <InputGroupInput
                type="time"
                aria-label="Time"
                disabled={!value.dueDate}
                value={value.dueTime ?? ''}
                onChange={(event) =>
                  onChange({ ...value, dueTime: event.target.value || null })
                }
                className="appearance-none text-base md:text-sm [&::-webkit-calendar-picker-indicator]:hidden"
              />
            </InputGroup>
            <ToggleGroup
              variant="chip"
              size="touch"
              aria-label="Quick times"
              className="flex-wrap lg:grid lg:w-full lg:grid-cols-4"
              disabled={!value.dueDate}
              value={value.dueTime ? [value.dueTime] : []}
              onValueChange={([picked]: Array<string | undefined>) =>
                onChange({ ...value, dueTime: picked ?? null })
              }
            >
              {QUICK_TIMES.map((quick) => (
                <ToggleGroupItem
                  key={quick.time}
                  value={quick.time}
                  className="lg:h-8 lg:px-0 lg:text-xs"
                >
                  {quick.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
      </div>

      <Button size="xl" className="lg:h-9 lg:text-sm" onClick={onDone}>
        {value.dueDate ? `Done · ${whenLabel(value, today)}` : 'Done'}
      </Button>
    </div>
  )
}
