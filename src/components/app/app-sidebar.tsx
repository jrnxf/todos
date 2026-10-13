// The laptop's left sidebar: where you are, how much is in each place, the
// tags in their colours, and who is signed in. Built from shadcn's stock
// sidebar. Phones never see it; they have the tab bar.
import { useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
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
import { useAddTag, useBoard, useDeleteTag, useUpdateTag } from '@/lib/queries'
import { TagDot, TagForm } from './tag'
import { useAdd } from './capture'
import { NavUser } from './nav-user'
import type { Tag } from '@/db/schema'
import type { ItemFields } from '@/server/board'

export function AppSidebar({ addPreset }: { addPreset?: Partial<ItemFields> }) {
  const board = useBoard()
  const add = useAdd()
  const location = useRouterState({ select: (state) => state.location })
  const { pathname, search } = location

  const addTag = useAddTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()
  // The tag form is open for a new tag ('new') or to change one.
  const [form, setForm] = useState<Tag | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Tag | null>(null)

  const open = board.items.filter(isOpen)
  const done = board.items.length - open.length
  const groups = upNext(board.items, board.today)
  const soon = groups.overdue.length + groups.today.length + groups.week.length

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
          <span className="font-semibold">todos</span>
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
                  isActive={pathname === '/list' && search.tag === undefined}
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
          <SidebarGroupLabel>Tags</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {board.tags.map((tag) => (
                <SidebarMenuItem key={tag.id}>
                  <SidebarMenuButton
                    isActive={pathname === '/list' && search.tag === tag.id}
                    render={<Link to="/list" search={{ tag: tag.id }} />}
                  >
                    <TagDot color={tag.color} className="mx-1" />
                    {tag.name}
                  </SidebarMenuButton>
                  {/* The count gives way to the menu while the row is hovered. */}
                  <SidebarMenuBadge className="group-focus-within/menu-item:hidden group-hover/menu-item:hidden">
                    {open.filter((todo) => todo.tagId === tag.id).length}
                  </SidebarMenuBadge>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <SidebarMenuAction
                          showOnHover
                          aria-label={`Change ${tag.name}`}
                        />
                      }
                    >
                      <MoreHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start">
                      <DropdownMenuGroup>
                        <DropdownMenuItem onClick={() => setForm(tag)}>
                          <PencilIcon />
                          Name and colour
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleting(tag)}
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
                  New tag
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator className="mx-0" />
      <SidebarFooter className="p-0">
        <NavUser />
      </SidebarFooter>

      <Dialog
        open={form !== null}
        onOpenChange={(next) => {
          if (!next) setForm(null)
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{form === 'new' ? 'New tag' : 'Tag'}</DialogTitle>
            <DialogDescription>
              A name and a colour. The colour shows as a dot wherever a to-do
              from this tag appears.
            </DialogDescription>
          </DialogHeader>
          {form !== null && (
            <TagForm
              key={form === 'new' ? 'new' : form.id}
              initial={form === 'new' ? undefined : form}
              submitLabel={form === 'new' ? 'Create' : 'Save'}
              onCancel={() => setForm(null)}
              onSubmit={(tag) => {
                if (form === 'new') addTag.mutate(tag)
                else updateTag.mutate({ id: form.id, patch: tag })
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
              Its to-dos stay on the list, with no tag.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) deleteTag.mutate(deleting.id)
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
