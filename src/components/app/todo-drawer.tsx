// A to-do, opened over the list. On a phone it is a sheet from the bottom
// that you pull down to close; on a laptop it slides in from the right and
// the list stays usable beside it. Which to-do is open lives in the URL
// (`?item=5`), so Back closes it and a link can open it.
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { XIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerKeyboard,
  DrawerTitle,
} from '@/components/ui/drawer'
import { useBoard } from '@/lib/queries'
import { useIsDesktop } from './picker'
import { TodoDetailActions, TodoDetailBody } from './todo-detail'
import type { Todo } from '@/db/schema'

declare module '@tanstack/react-router' {
  interface HistoryState {
    /** Set when a to-do was opened by a click on this page, not by a link. */
    openedInPlace?: boolean
  }
}

/** The id in the URL, whether or not such a to-do exists. */
export function useOpenTodoId(): number | undefined {
  return useRouterState({ select: (state) => state.location.search.item })
}

export function TodoDrawer() {
  const board = useBoard()
  const router = useRouter()
  const navigate = useNavigate()
  const desktop = useIsDesktop()
  const openId = useOpenTodoId()
  const todo = board.items.find((item) => item.id === openId)

  // Keep drawing the last to-do while the drawer slides away.
  const [last, setLast] = useState<Todo | undefined>(todo)
  if (todo && todo !== last) setLast(todo)
  const shown = todo ?? last

  const close = () => {
    // Opened by a click here: Back is the same as closing, and leaves no
    // dead entry behind. Opened by a link: just drop it from the address.
    if (router.history.location.state.openedInPlace) router.history.back()
    else {
      void navigate({
        to: '.',
        search: (now) => ({ ...now, item: undefined }),
        replace: true,
      })
    }
  }

  // A link to a to-do that is gone (deleted, or done long ago) says so once.
  const checked = useRef(false)
  useEffect(() => {
    if (checked.current) return
    checked.current = true
    if (openId !== undefined && !todo) {
      toast('That to-do is gone. It was deleted, or finished over a week ago.')
      close()
    }
  })

  return (
    <Drawer
      open={Boolean(todo)}
      onOpenChange={(open) => {
        if (!open) close()
      }}
      swipeDirection={desktop ? 'right' : 'down'}
      // Beside the list on a laptop, so the list stays clickable and a click
      // on another to-do swaps this one. Over the list on a phone.
      modal={!desktop}
      disablePointerDismissal={desktop}
      showSwipeHandle={!desktop}
    >
      <DrawerKeyboard>
        <DrawerContent className="mx-auto max-w-md data-[swipe-axis=x]:mx-0 data-[swipe-axis=x]:max-w-none data-[swipe-axis=x]:rounded-none data-[swipe-axis=x]:shadow-lg data-[swipe-axis=x]:sm:[--drawer-content-width:24rem] data-[swipe-direction=down]:bottom-(--drawer-keyboard-inset,0px)">
          <DrawerHeader className="flex-row items-center justify-between p-2 pb-0 lg:pt-3">
            <div className="sr-only">
              <DrawerTitle>{shown?.title ?? 'To-do'}</DrawerTitle>
              <DrawerDescription>
                Read it, change it, finish it or delete it.
              </DrawerDescription>
            </div>
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Close"
              className="ml-auto"
              onClick={close}
            >
              <XIcon />
            </Button>
          </DrawerHeader>
          {shown && (
            <>
              <div // Children keep their height; the sheet scrolls instead of
                // squeezing them.
                className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 pb-5 *:shrink-0"
              >
                {/* A fresh body per to-do, so nothing typed carries over. */}
                <TodoDetailBody key={shown.id} todo={shown} />
              </div>
              <div className="flex shrink-0 gap-2 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <TodoDetailActions todo={shown} onLeave={close} />
              </div>
            </>
          )}
        </DrawerContent>
      </DrawerKeyboard>
    </Drawer>
  )
}
