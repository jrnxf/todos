import { createFileRoute, redirect } from '@tanstack/react-router'

// Alert links point here (/item/5). A to-do no longer has a page of its own:
// it opens over the list, so this address forwards to the list with it open.
export const Route = createFileRoute('/item/$id')({
  beforeLoad: ({ params }) => {
    const item = Number(params.id)
    throw redirect({
      to: '/',
      search: Number.isInteger(item) ? { item } : {},
    })
  },
})
