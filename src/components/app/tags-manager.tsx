// The household's tags, to name, colour, delete and add: a card on the
// account page, which List's "Edit tags" leads to. What the laptop sidebar's
// tag menus used to do, now on a phone too.
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
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
import { Button } from '@/components/ui/button'
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
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { isOpen } from '@/lib/board'
import { useAddTag, useBoard, useDeleteTag, useUpdateTag } from '@/lib/queries'
import { Row, Rows } from './rows'
import { TagDot, TagForm } from './tag'
import type { Tag } from '@/db/schema'

export function TagsManager() {
  const board = useBoard()
  const addTag = useAddTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()
  // The tag form is open for a new tag ('new') or to change one.
  const [form, setForm] = useState<Tag | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Tag | null>(null)
  const open = board.items.filter(isOpen)

  return (
    <>
      <Rows>
        {board.tags.map((tag) => {
          const count = open.filter((todo) => todo.tagId === tag.id).length
          return (
            <Row key={tag.id} className="gap-3 py-2.5">
              <ItemMedia className="flex w-4 items-center justify-center">
                <TagDot color={tag.color} />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="w-full">
                  <Link
                    to="/list"
                    search={{ tag: tag.id }}
                    className="truncate rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {tag.name}
                  </Link>
                </ItemTitle>
              </ItemContent>
              <ItemActions className="gap-1">
                <span className="w-8 text-right text-sm text-muted-foreground tabular-nums">
                  {count}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Change ${tag.name}`}
                      />
                    }
                  >
                    <MoreHorizontalIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
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
              </ItemActions>
            </Row>
          )
        })}
        <Row key="new" className="py-1.5">
          <Button
            variant="ghost"
            className="-mx-2 justify-start text-muted-foreground"
            onClick={() => setForm('new')}
          >
            <PlusIcon data-icon="inline-start" />
            New tag
          </Button>
        </Row>
      </Rows>

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
    </>
  )
}
