import { createFileRoute, redirect } from '@tanstack/react-router'

// Up next is now the home page's week. Old links and saved Home Screen apps
// still land somewhere sensible.
export const Route = createFileRoute('/_app/upnext')({
  beforeLoad: () => {
    throw redirect({ to: '/', search: { view: 'week' } })
  },
})
