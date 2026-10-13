import { createFileRoute } from '@tanstack/react-router'
import { CircleCheckIcon } from 'lucide-react'
import { Column, ScreenHeader } from '@/components/app/shell'
import { TodoGroup } from '@/components/app/todo-row'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { isOpen } from '@/lib/board'
import { useBoard } from '@/lib/queries'

export const Route = createFileRoute('/_app/done')({ component: DoneScreen })

// What was ticked off in the last week, newest first. Untick to bring one back.
function DoneScreen() {
  const board = useBoard()
  const done = board.items
    .filter((todo) => !isOpen(todo))
    .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))

  return (
    <Column>
      <ScreenHeader title="Done" subtitle="Ticked off in the last week" />
      {done.length > 0 ? (
        <TodoGroup todos={done} />
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CircleCheckIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing ticked off yet</EmptyTitle>
            <EmptyDescription>
              Finished to-dos stay here for a week.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </Column>
  )
}
