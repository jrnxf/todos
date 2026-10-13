// One small picker, two shapes: a Drawer from the bottom on a phone, a
// Popover beside its trigger on a laptop. Every "pick a value" surface in the
// app goes through this, so they all open and close the same way.
import { useSyncExternalStore } from 'react'
import {
  Drawer,
  DrawerContent,
  DrawerKeyboard,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

const DESKTOP = '(min-width: 1024px)'

function subscribe(onChange: () => void) {
  const query = window.matchMedia(DESKTOP)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** True on a laptop-sized window. False while rendering on the server. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  )
}

export function Picker({
  trigger,
  title,
  description,
  open,
  onOpenChange,
  children,
}: {
  /** The button that opens it. It keeps its own look. */
  trigger: React.ReactElement
  title: string
  description: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  const desktop = useIsDesktop()

  if (desktop) {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger render={trigger} />
        <PopoverContent align="start" className="w-auto max-w-none p-3">
          {children}
        </PopoverContent>
      </Popover>
    )
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
      <DrawerTrigger render={trigger} />
      <DrawerKeyboard>
        <DrawerContent className="mx-auto max-w-md data-[swipe-direction=down]:bottom-(--drawer-keyboard-inset,0px)">
          <DrawerHeader className="sr-only">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </DrawerContent>
      </DrawerKeyboard>
    </Drawer>
  )
}
