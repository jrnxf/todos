// The signed-in person's menu, behind their avatar on a phone and a laptop
// alike: the way to Account and settings, to the tags, the theme, and out.
// It holds what the laptop sidebar's foot used to.
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import {
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  SunMoonIcon,
  TagIcon,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSignOut } from '@/lib/auth-client'
import { useBoard } from '@/lib/queries'
import { parseTheme, setTheme, useTheme } from '@/lib/theme'
import { PersonAvatar } from './todo-row'

export function AccountMenu({ className }: { className?: string }) {
  const board = useBoard()
  const me = board.people.find((person) => person.id === board.me)
  const theme = useTheme()
  const signOut = useSignOut()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account, tags, theme and sign out"
        className={cn(
          'rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
          className,
        )}
      >
        <PersonAvatar person={me} size="lg" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2 px-1 py-1.5 font-normal text-foreground">
            <PersonAvatar person={me} />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{me?.name}</span>
              {board.meEmail && (
                <span className="truncate text-xs text-muted-foreground">
                  {board.meEmail}
                </span>
              )}
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link to="/account" />}>
            <SettingsIcon />
            Account and settings
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link to="/account" hash="tags" />}>
            <TagIcon />
            Tags
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <SunMoonIcon />
              Theme
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={theme}
                onValueChange={(value) => setTheme(parseTheme(value))}
              >
                <DropdownMenuRadioItem value="light">
                  <SunIcon />
                  Light
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">
                  <MoonIcon />
                  Dark
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">
                  <MonitorIcon />
                  System
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            disabled={signOut.isPending}
            onClick={() => signOut.mutate()}
          >
            <LogOutIcon />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
