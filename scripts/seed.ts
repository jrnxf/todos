// Fills the local dev database with a believable household list, dated
// around today, so the screens have something to show.
//   bun run db:migrate:local && bun run db:seed:local
// Local only, and it refuses a database that already has to-dos in it.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

function d1(...args: Array<string>): string {
  return execFileSync(
    'bunx',
    ['wrangler', 'd1', 'execute', 'DB', '--local', ...args],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  )
}

const counted = JSON.parse(
  d1('--json', '--command', 'select count(*) as n from items'),
) as Array<{ results: Array<{ n: number }> }>
if (counted[0].results[0].n > 0) {
  console.error('This database already has to-dos. Not seeding.')
  process.exit(1)
}

// The people the dev server runs with: PEOPLE in .dev.vars, or else the
// stand-ins src/server/env.ts falls back to.
function devPeople(): string {
  try {
    return /^PEOPLE=(.+)$/m.exec(readFileSync('.dev.vars', 'utf8'))?.[1] ?? ''
  } catch {
    return ''
  }
}
const [first, second] = (devPeople() || 'alex:Alex,sam:Sam')
  .split(',')
  .map((entry) => entry.split(':')[0].trim())

const today = new Date().toISOString().slice(0, 10)
const day = (offset: number) =>
  new Date(Date.parse(today) + offset * 86_400_000).toISOString().slice(0, 10)
const ago = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString()

interface Seed {
  title: string
  area?: string
  assignee?: string
  due_date?: string
  due_time?: string
  heads_up_days?: string
  must_not_miss?: number
  done_at?: string
  done_by?: string
}
const seeds: Array<Seed> = [
  {
    title: 'Sign field-trip form',
    area: 'Kids',
    assignee: second,
    due_date: day(-3),
  },
  {
    title: 'Replace furnace filter',
    area: 'House',
    assignee: first,
    due_date: day(-2),
  },
  {
    title: 'Call plumber about slow drain',
    area: 'House',
    assignee: first,
    due_date: day(0),
  },
  {
    title: 'RSVP to birthday party',
    area: 'Kids',
    due_date: day(0),
    due_time: '17:00',
  },
  {
    title: 'Car registration renewal',
    area: 'Paperwork',
    assignee: first,
    due_date: day(3),
    heads_up_days: '[1,3]',
    must_not_miss: 1,
  },
  {
    title: 'Flu shots, kids',
    area: 'Kids',
    assignee: second,
    due_date: day(5),
    due_time: '10:30',
  },
  {
    title: 'Winterize hose bibs',
    area: 'House',
    assignee: first,
    due_date: day(6),
  },
  {
    title: 'Passports, both kids',
    area: 'Paperwork',
    due_date: day(18),
    heads_up_days: '[1,14]',
    must_not_miss: 1,
  },
  {
    title: 'FSA receipts',
    area: 'Paperwork',
    assignee: first,
    due_date: day(19),
  },
  {
    title: 'Schedule chimney sweep',
    area: 'House',
    assignee: first,
    due_date: day(33),
  },
  {
    title: 'Renew library cards',
    area: 'Kids',
    assignee: second,
    due_date: day(39),
  },
  {
    title: 'Photo book for grandparents',
    area: 'Kids',
    assignee: second,
    due_date: day(50),
  },
  { title: 'Fix closet door', area: 'House' },
  { title: 'Update will beneficiaries', area: 'Paperwork' },
  {
    title: 'Book dentist, kids',
    area: 'Kids',
    assignee: second,
    done_at: ago(1),
    done_by: second,
  },
  {
    title: 'Pay water bill',
    area: 'House',
    assignee: first,
    done_at: ago(4),
    done_by: first,
  },
]

// An area is stored by id; the migration made House, Kids and Paperwork.
const areaId = (name: string | undefined) =>
  name === undefined
    ? 'NULL'
    : `(SELECT id FROM areas WHERE name = ${quote(name)})`

function quote(value: string | number | undefined): string {
  return value === undefined
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : `'${value.replaceAll("'", "''")}'`
}

const sql = [
  ...seeds.map((seed) => {
    const { area, ...rest } = seed
    const row = { created_at: ago(14), created_by: second, ...rest }
    const columns = [...Object.keys(row), 'area_id']
    const values = [...Object.values(row).map(quote), areaId(area)]
    return `INSERT INTO items (${columns.join(', ')}) VALUES (${values.join(', ')});`
  }),
].join('\n')

mkdirSync('.wrangler', { recursive: true })
writeFileSync('.wrangler/seed.sql', sql)
d1('--file', '.wrangler/seed.sql')
console.log(`Seeded ${seeds.length} to-dos around ${today}.`)
