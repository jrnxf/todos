// The three one-row pickers: who, which area, and how far ahead to be warned.
import { useState } from 'react'
import { PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { HEADS_UP_CHOICES } from '@/lib/board'
import { useAddArea, useBoard } from '@/lib/queries'
import { AreaDot, AreaForm } from './area'

const EITHER = 'either'

function Sheet({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-64 flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

function Chips(props: React.ComponentProps<typeof ToggleGroup>) {
  return (
    <ToggleGroup
      variant="chip"
      size="touch"
      className="w-full flex-wrap"
      {...props}
    />
  )
}

export function WhoFields({
  value,
  onChange,
}: {
  value: string | null
  onChange: (assignee: string | null) => void
}) {
  const { people } = useBoard()
  return (
    <Sheet title="Who" hint="Either means whoever gets to it first.">
      <Chips
        value={[value ?? EITHER]}
        onValueChange={([picked]: Array<string | undefined>) => {
          // One is always picked: a tap on the current one changes nothing.
          if (picked) onChange(picked === EITHER ? null : picked)
        }}
      >
        <ToggleGroupItem value={EITHER}>Either</ToggleGroupItem>
        {people.map((person) => (
          <ToggleGroupItem key={person.id} value={person.id}>
            {person.name}
          </ToggleGroupItem>
        ))}
      </Chips>
    </Sheet>
  )
}

export function AreaFields({
  value,
  onChange,
}: {
  value: number | null
  onChange: (areaId: number | null) => void
}) {
  const { areas } = useBoard()
  const addArea = useAddArea()
  const [making, setMaking] = useState(false)

  return (
    <Sheet title="Area">
      <Chips
        value={value === null ? [] : [String(value)]}
        onValueChange={([picked]: Array<string | undefined>) =>
          onChange(picked === undefined ? null : Number(picked))
        }
      >
        {areas.map((area) => (
          <ToggleGroupItem key={area.id} value={String(area.id)}>
            <AreaDot color={area.color} />
            {area.name}
          </ToggleGroupItem>
        ))}
        {!making && (
          <Button
            variant="outline"
            size="icon-lg"
            className="size-10"
            aria-label="New area"
            onClick={() => setMaking(true)}
          >
            <PlusIcon />
          </Button>
        )}
      </Chips>
      {making && (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-medium">New area</h4>
          <AreaForm
            submitLabel="Create and use"
            onCancel={() => setMaking(false)}
            onSubmit={(area) => {
              // Put the to-do in the new area as soon as it exists.
              addArea.mutate(area, { onSuccess: (made) => onChange(made.id) })
              setMaking(false)
            }}
          />
        </div>
      )}
    </Sheet>
  )
}

export function HeadsUpFields({
  value,
  onChange,
}: {
  value: Array<number>
  onChange: (days: Array<number>) => void
}) {
  // One read out of a title ("remind me 2 days before") may not be among the
  // choices: it is shown beside them, so it can be seen and taken off.
  const choices = [
    ...HEADS_UP_CHOICES,
    ...value
      .filter((days) => !HEADS_UP_CHOICES.some((one) => one.days === days))
      .map((days) => ({ days, label: `${days} days` })),
  ].sort((a, b) => a.days - b.days)
  return (
    <Sheet
      title="Heads-up"
      hint="An evening alert this long before the deadline. Pick any, or none."
    >
      <Chips
        multiple
        value={value.map(String)}
        onValueChange={(picked: Array<string>) =>
          onChange(picked.map(Number).sort((a, b) => a - b))
        }
      >
        {choices.map((choice) => (
          <ToggleGroupItem key={choice.days} value={String(choice.days)}>
            {choice.label}
          </ToggleGroupItem>
        ))}
      </Chips>
    </Sheet>
  )
}
