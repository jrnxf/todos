import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TodoRowView } from './todo-row-view'
import type { Todo } from '@/db/schema'

const todo: Todo = {
  id: 7,
  title: 'financial planning',
  notes: '',
  tagId: 1,
  assignee: null,
  dueDate: '2026-10-15',
  dueTime: null,
  headsUpDays: [1],
  mustNotMiss: false,
  doneAt: null,
  doneBy: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  createdBy: null,
  deletedAt: null,
}

function render(overrides: Partial<Todo> = {}) {
  return renderToStaticMarkup(
    <TodoRowView
      todo={{ ...todo, ...overrides }}
      people={[]}
      tags={[{ id: 1, name: 'Money', color: 'green' }]}
      today="2026-10-13"
      onDoneChange={() => {}}
      renderOpen={({ className, children }) => (
        <a href="/?item=7" className={className}>
          {children}
        </a>
      )}
    />,
  )
}

describe('a to-do row', () => {
  it('keeps the checkbox out of the link that opens the card', () => {
    const html = render()
    const link = html.slice(html.indexOf('<a '), html.indexOf('</a>'))
    expect(link).toContain('financial planning')
    expect(link).not.toMatch(/role="checkbox"|<button|<input/)
    // ...and the checkbox is still there, as its own control.
    expect(html.replace(link, '')).toContain('role="checkbox"')
  })

  it('covers the whole card with the link, and lifts the checkbox above it', () => {
    const html = render()
    const [, row] = html.match(/^<div[^>]*class="([^"]*)"/) ?? []
    expect(row).toMatch(/(^| )relative( |$)/)
    expect(html).toMatch(/<a [^>]*class="[^"]*after:absolute[^"]*after:inset-0/)
    const media = html.match(/data-slot="item-media"[^>]*class="([^"]*)"/)
    const mediaClass =
      media?.[1] ??
      html.match(/class="([^"]*)"[^>]*data-slot="item-media"/)?.[1]
    expect(mediaClass).toMatch(/(^| )relative( |$)/)
    expect(mediaClass).toMatch(/(^| )z-10( |$)/)
  })

  it('names the checkbox for a screen reader, whichever way it flips', () => {
    expect(render()).toContain(
      'aria-label="Mark &quot;financial planning&quot; done"',
    )
    expect(render({ doneAt: '2026-10-13T08:00:00.000Z' })).toContain(
      'aria-label="Reopen &quot;financial planning&quot;"',
    )
  })
})
