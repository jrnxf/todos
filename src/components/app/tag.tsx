// A tag's colour as a dot, and the small form that makes or changes one.
// Colour is only ever a dot: red and amber text already mean late and soon.
import { useState } from 'react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TAG_COLORS } from '@/db/schema'
import type { TagColor } from '@/db/schema'

const BG: Record<TagColor, string> = {
  blue: 'bg-tag-blue',
  teal: 'bg-tag-teal',
  green: 'bg-tag-green',
  amber: 'bg-tag-amber',
  red: 'bg-tag-red',
  pink: 'bg-tag-pink',
  violet: 'bg-tag-violet',
  gray: 'bg-tag-gray',
}

export function TagDot({
  color,
  className,
}: {
  color: TagColor
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-2 shrink-0 rounded-full',
        BG[color],
        className,
      )}
    />
  )
}

export function TagForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: { name: string; color: TagColor }
  submitLabel: string
  onSubmit: (tag: { name: string; color: TagColor }) => void
  onCancel?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [color, setColor] = useState<TagColor>(initial?.color ?? 'green')
  const trimmed = name.trim()
  const submit = () => {
    if (trimmed) onSubmit({ name: trimmed, color })
  }

  return (
    <div className="flex flex-col gap-3">
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            submit()
          }
        }}
        placeholder="Name, e.g. Garden"
        aria-label="Tag name"
        maxLength={40}
        className="h-10 text-base md:text-sm"
      />
      <div
        role="radiogroup"
        aria-label="Colour"
        className="flex flex-wrap gap-2"
      >
        {TAG_COLORS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={option === color}
            aria-label={option}
            onClick={() => setColor(option)}
            className={cn(
              'size-7 rounded-full outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring aria-checked:ring-2 aria-checked:ring-foreground',
              BG[option],
            )}
          />
        ))}
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="outline" size="lg" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button size="lg" disabled={!trimmed} onClick={submit}>
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}
