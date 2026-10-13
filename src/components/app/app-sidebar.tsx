// The laptop's left sidebar: where you are, how much is in each place, the
// areas in their colours, and the month at a glance. Built from shadcn's
// stock sidebar (the "sidebar with a calendar" block). Phones never see it;
// they have the tab bar.
import { useState } from 'react'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import {
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  ListChecksIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SunriseIcon,
  Trash2Icon,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { isOpen, upNext } from '@/lib/board'
import { fromPickerDate, toPickerDate } from '@/lib/dates'
import {
  useAddArea,
  useBoard,
  useDeleteArea,
  useUpdateArea,
} from '@/lib/queries'
import { AreaDot, AreaForm } from './area'
import { DAY_DOT } from './calendar-views'
import { useAdd } from './capture'
import { PersonAvatar } from './todo-row'
import type { Area } from '@/db/schema'
import type { ItemFields } from '@/server/board'

export function AppSidebar({ addPreset }: { addPreset?: Partial<ItemFields> }) {
  const board = useBoard()
  const add = useAdd()
  const navigate = useNavigate()
  const location = useRouterState({ select: (state) => state.location })
  const { pathname, search } = location

  const addArea = useAddArea()
  const updateArea = useUpdateArea()
  const deleteArea = useDeleteArea()
  // The area form is open for a new area ('new') or to change one.
  const [form, setForm] = useState<Area | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Area | null>(null)

  const open = board.items.filter(isOpen)
  const done = board.items.length - open.length
  const groups = upNext(board.items, board.today)
  const soon = groups.overdue.length + groups.today.length + groups.week.length
  const dueDays = [
    ...new Set(open.flatMap((todo) => (todo.dueDate ? [todo.dueDate] : []))),
  ]
  const shownDay =
    pathname === '/calendar' && search.day ? search.day : board.today

  return (
    <Sidebar
      collapsible="none"
      className="sticky top-0 hidden h-svh border-r lg:flex"
    >
      <SidebarHeader className="gap-3 p-3">
        <div className="flex items-center gap-2 px-1">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <CheckIcon className="size-3.5" strokeWidth={3} />
          </span>
          <span className="font-semibold">Home</span>
          <Link
            to="/account"
            aria-label="Account"
            className="ml-auto rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <PersonAvatar
              person={board.people.find((p) => p.id === board.me)}
              size="sm"
            />
          </Link>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              variant="outline"
              className="text-muted-foreground"
              onClick={() => add(addPreset)}
            >
              <PlusIcon />
              Add a to-do
              <kbd className="ml-auto rounded border px-1 font-mono text-[0.6875rem]">
                N
              </kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === '/'}
                  render={<Link to="/" />}
                >
                  <SunriseIcon />
                  Today
                </SidebarMenuButton>
                <SidebarMenuBadge>
                  {groups.overdue.length + groups.today.length}
                </SidebarMenuBadge>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === '/upnext'}
                  render={<Link to="/upnext" />}
                >
                  <ClockIcon />
                  Up next
                </SidebarMenuButton>
                {groups.overdue.length > 0 ? (
                  <SidebarMenuBadge className="text-destructive">
                    {groups.overdue.length} late
                  </SidebarMenuBadge>
                ) : (
                  <SidebarMenuBadge>{soon}</SidebarMenuBadge>
                )}
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === '/calendar'}
                  render={<Link to="/calendar" />}
                >
                  <CalendarIcon />
                  Calendar
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === '/list' && search.area === undefined}
                  render={<Link to="/list" />}
                >
                  <ListChecksIcon />
                  Everything
                </SidebarMenuButton>
                <SidebarMenuBadge>{open.length}</SidebarMenuBadge>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === '/done'}
                  render={<Link to="/done" />}
                >
                  <CheckIcon />
                  Done
                </SidebarMenuButton>
                <SidebarMenuBadge>{done}</SidebarMenuBadge>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Areas</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {board.areas.map((area) => (
                <SidebarMenuItem key={area.id}>
                  <SidebarMenuButton
                    isActive={pathname === '/list' && search.area === area.id}
                    render={<Link to="/list" search={{ area: area.id }} />}
                  >
                    <AreaDot color={area.color} className="mx-1" />
                    {area.name}
                  </SidebarMenuButton>
                  {/* The count gives way to the menu while the row is hovered. */}
                  <SidebarMenuBadge className="group-focus-within/menu-item:hidden group-hover/menu-item:hidden">
                    {open.filter((todo) => todo.areaId === area.id).length}
                  </SidebarMenuBadge>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <SidebarMenuAction
                          showOnHover
                          aria-label={`Change ${area.name}`}
                        />
                      }
                    >
                      <MoreHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start">
                      <DropdownMenuGroup>
                        <DropdownMenuItem onClick={() => setForm(area)}>
                          <PencilIcon />
                          Name and colour
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleting(area)}
                        >
                          <Trash2Icon />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="text-muted-foreground"
                  onClick={() => setForm('new')}
                >
                  <PlusIcon />
                  New area
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator className="mx-0" />
      <SidebarFooter className="p-0">
        <Calendar
          mode="single"
          required
          selected={toPickerDate(shownDay)}
          // Follow along when the Calendar page moves to another month.
          key={shownDay.slice(0, 7)}
          defaultMonth={toPickerDate(shownDay)}
          onSelect={(picked) =>
            navigate({
              to: '/calendar',
              search: { day: fromPickerDate(picked) },
            })
          }
          modifiers={{
            due: dueDays
              .filter((date) => date >= board.today)
              .map(toPickerDate),
            late: dueDays
              .filter((date) => date < board.today)
              .map(toPickerDate),
          }}
          modifiersClassNames={{
            due: `${DAY_DOT} after:bg-muted-foreground has-data-[selected-single=true]:after:bg-primary-foreground`,
            late: `${DAY_DOT} after:bg-destructive`,
          }}
          className="bg-transparent [--cell-size:2.1rem]"
        />
      </SidebarFooter>

      <Dialog
        open={form !== null}
        onOpenChange={(next) => {
          if (!next) setForm(null)
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{form === 'new' ? 'New area' : 'Area'}</DialogTitle>
            <DialogDescription>
              A name and a colour. The colour shows as a dot wherever a to-do
              from this area appears.
            </DialogDescription>
          </DialogHeader>
          {form !== null && (
            <AreaForm
              key={form === 'new' ? 'new' : form.id}
              initial={form === 'new' ? undefined : form}
              submitLabel={form === 'new' ? 'Create' : 'Save'}
              onCancel={() => setForm(null)}
              onSubmit={(area) => {
                if (form === 'new') addArea.mutate(area)
                else updateArea.mutate({ id: form.id, patch: area })
                setForm(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its to-dos stay on the list, with no area.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) deleteArea.mutate(deleting.id)
                setDeleting(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  )
}
