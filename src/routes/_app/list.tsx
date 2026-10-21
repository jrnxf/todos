import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronDownIcon, ListChecksIcon, PencilIcon } from 'lucide-react'
import { cn } from 'cn'
import { z } from 'zod'
import { Column, ScreenHeader } from '@/components/app/shell'
import { TagDot } from '@/components/app/tag'
import { Section, SectionHeading, TodoGroup } from '@/components/app/todo-row'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { byDue, isOpen } from '@/lib/board'
import { useBoard } from '@/lib/queries'
import type { Tag, Todo } from '@/db/schema'

export const Route = createFileRoute('/_app/list')({
  head: () => ({ meta: [{ title: 'List - todos' }] }),
  // With a tag in the URL the list is that one tag; the chips across the
  // top link here for each of them.
  validateSearch: z.object({ tag: z.coerce.number().int().optional() }),
  component: ListScreen,
})

const ALL = 'all'
const EITHER = 'either'

// The whole plate, grouped by tag, including the things with no date.
function ListScreen() {
  const board = useBoard()
  const search = Route.useSearch()
  const tag = board.tags.find((one) => one.id === search.tag)
  const [who, setWho] = useState(ALL)

  const inTag = (todo: Todo) => !tag || todo.tagId === tag.id
  const open = board.items.filter(isOpen).filter(inTag)
  const done = board.items
    .filter((todo) => !isOpen(todo))
    .filter(inTag)
    .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))
  const filters = [
    { value: ALL, label: 'Anyone' },
    ...board.people.map((person) => ({ value: person.id, label: person.name })),
    { value: EITHER, label: 'Unassigned' },
  ]

  return (
    <Column>
      <ScreenHeader
        title={tag?.name ?? 'Everything'}
        subtitle={
          tag ? `${open.length} open` : `${open.length} open, grouped by tag`
        }
      />
      <TagChips
        tags={board.tags}
        todos={board.items.filter(isOpen)}
        current={tag?.id}
      />
      <Tabs value={who} onValueChange={setWho} className="gap-5">
        <TabsList className="w-full group-data-horizontal/tabs:h-10 lg:w-fit">
          {filters.map((filter) => (
            <TabsTrigger
              key={filter.value}
              value={filter.value}
              className="lg:px-4"
            >
              {filter.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {filters.map((filter) => {
          const todos = open.filter(
            (todo) =>
              filter.value === ALL ||
              (filter.value === EITHER
                ? todo.assignee === null
                : todo.assignee === filter.value),
          )
          return (
            <TabsContent
              key={filter.value}
              value={filter.value}
              className="flex flex-col gap-5"
            >
              {todos.length === 0 ? (
                <Nothing />
              ) : tag ? (
                <TodoGroup todos={[...todos].sort(byDue)} hideTag />
              ) : (
                <ByTag todos={todos} tags={board.tags} />
              )}
            </TabsContent>
          )
        })}
      </Tabs>

      {done.length > 0 && (
        <Collapsible className="flex flex-col gap-2.5">
          <CollapsibleTrigger className="group flex items-center justify-between rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <SectionHeading count={done.length}>Done this week</SectionHeading>
            <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-panel-open:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <TodoGroup todos={done} />
          </CollapsibleContent>
        </Collapsible>
      )}
    </Column>
  )
}

const CHIP =
  'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50'

/** Every tag as a way into its own list, with how many are open in it. */
function TagChips({
  tags,
  todos,
  current,
}: {
  tags: Array<Tag>
  todos: Array<Todo>
  current: number | undefined
}) {
  const chip = (active: boolean) =>
    cn(
      CHIP,
      active
        ? 'border-primary bg-primary text-primary-foreground'
        : 'bg-background hover:bg-muted',
    )
  return (
    <nav
      aria-label="Tags"
      className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0"
    >
      <Link to="/list" className={chip(current === undefined)}>
        All
        <span className="tabular-nums opacity-70">{todos.length}</span>
      </Link>
      {tags.map((tag) => (
        <Link
          key={tag.id}
          to="/list"
          search={{ tag: tag.id }}
          className={chip(current === tag.id)}
        >
          <TagDot color={tag.color} className="size-1.5" />
          {tag.name}
          <span className="tabular-nums opacity-70">
            {todos.filter((todo) => todo.tagId === tag.id).length}
          </span>
        </Link>
      ))}
      <Link
        to="/account"
        hash="tags"
        className={cn(CHIP, 'text-muted-foreground hover:bg-muted')}
      >
        <PencilIcon className="size-3.5" />
        Edit tags
      </Link>
    </nav>
  )
}

function Nothing() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ListChecksIcon />
        </EmptyMedia>
        <EmptyTitle>Nothing here</EmptyTitle>
        <EmptyDescription>No open to-dos match this filter.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function ByTag({ todos, tags }: { todos: Array<Todo>; tags: Array<Tag> }) {
  const sorted = [...todos].sort(byDue)
  return (
    <>
      {tags.map((tag) => (
        <Section
          key={tag.id}
          title={tag.name}
          todos={sorted.filter((todo) => todo.tagId === tag.id)}
          hideTag
        />
      ))}
      <Section
        title="No tag"
        todos={sorted.filter((todo) => todo.tagId === null)}
      />
    </>
  )
}
