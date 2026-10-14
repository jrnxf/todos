import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'

// The calendar is now the home page's month. Old links keep their day.
export const Route = createFileRoute('/_app/calendar')({
  validateSearch: z.object({
    day: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/', search: { view: 'month', day: search.day } })
  },
})
