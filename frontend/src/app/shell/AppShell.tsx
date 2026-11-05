import { Bell, HelpCircle, LogOut, Menu, Moon, Search, ShieldCheck, Sun, Workflow, X } from 'lucide-react'
import { motion } from 'motion/react'
import { Dialog, DropdownMenu } from 'radix-ui'
import { NavLink, Outlet, useLocation } from 'react-router'
import { cn } from '@/lib/utils'
import { AUTHORITY_LIMIT_USD } from '../data/mock'
import { usd } from '../data/source'
import { useUi } from '../store'
import { footerNav, mainNav, type NavItem } from './nav'

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn('relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
          isActive ? 'text-accent-foreground' : 'text-sidebar-foreground/75 hover:bg-white/50 dark:hover:bg-white/5')}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-active"
              className="absolute inset-0 rounded-xl bg-white/80 shadow-sm dark:bg-white/10"
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            />
          )}
          <Icon className="relative size-4" />
          <span className="relative">{item.label}</span>
          {item.count ? (
            <span className="relative ml-auto rounded-md bg-primary/10 px-1.5 text-[11px] font-semibold text-primary tabular-nums">{item.count}</span>
          ) : null}
        </>
      )}
    </NavLink>
  )
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="mb-6 flex items-center gap-3 px-1">
        <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-violet to-azure text-white shadow-md shadow-violet/30">
          <Workflow className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold tracking-tight text-primary">DisruptionOps</p>
          <p className="truncate text-[11px] text-muted-foreground">Autonomous supply-chain finance</p>
        </div>
      </div>
      <nav className="flex flex-col gap-0.5">
        {mainNav.map((i) => <NavItemLink key={i.to} item={i} onNavigate={onNavigate} />)}
      </nav>
      <div className="mt-auto flex flex-col gap-3 pt-4">
        <div className="rounded-2xl bg-gradient-to-br from-violet/90 to-azure/90 p-4 text-white shadow-lg shadow-violet/25">
          <ShieldCheck className="mb-2 size-5" />
          <p className="text-sm font-semibold">Agent spending mandate</p>
          <p className="mt-1 text-xs text-white/80">
            Holds funds automatically. Releases above {usd(AUTHORITY_LIMIT_USD)} need a human code.
          </p>
          <span className="mt-2 inline-block rounded-md bg-white/20 px-1.5 py-0.5 text-[11px]">PayPal sandbox · live</span>
        </div>
        <div className="flex flex-col gap-0.5">
          {footerNav.map((i) => <NavItemLink key={i.to} item={i} onNavigate={onNavigate} />)}
          <a href="https://github.com/officialayush23" target="_blank" rel="noreferrer"
             className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-sidebar-foreground/75 hover:bg-white/50 dark:hover:bg-white/5">
            <HelpCircle className="size-4" /> Help & docs
          </a>
        </div>
      </div>
    </>
  )
}

function MobileNav() {
  const { navOpen, setNavOpen } = useUi()
  return (
    <Dialog.Root open={navOpen} onOpenChange={setNavOpen}>
      <Dialog.Trigger asChild>
        <button aria-label="Open navigation" className="glass grid size-11 shrink-0 place-items-center rounded-2xl lg:hidden">
          <Menu className="size-4" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[oklch(0.24_0.06_280/0.15)] backdrop-blur-[2px]" />
        <Dialog.Content className="glass-strong fixed inset-y-3 left-3 z-50 flex w-72 flex-col rounded-3xl p-4 data-[state=open]:animate-in data-[state=open]:slide-in-from-left">
          <Dialog.Title className="sr-only">Navigation</Dialog.Title>
          <Dialog.Close className="absolute right-3 top-3 grid size-8 place-items-center rounded-xl hover:bg-white/60"><X className="size-4" /></Dialog.Close>
          <SidebarBody onNavigate={() => setNavOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function UserMenu() {
  const { theme, toggleTheme } = useUi()
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="glass flex h-11 items-center gap-2 rounded-2xl pl-1.5 pr-3">
          <span className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-azure to-violet text-[11px] font-bold text-white">AP</span>
          <span className="hidden text-left sm:block">
            <span className="block text-xs font-semibold leading-tight">Ayush Pathak</span>
            <span className="block text-[11px] leading-tight text-muted-foreground">Supply-chain lead</span>
          </span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="glass-strong z-50 w-52 rounded-2xl p-1.5 text-sm">
          <DropdownMenu.Item onSelect={toggleTheme} className="flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 outline-none data-[highlighted]:bg-white/70 dark:data-[highlighted]:bg-white/10">
            {theme === 'light' ? <Moon className="size-4" /> : <Sun className="size-4" />}
            {theme === 'light' ? 'Dark theme' : 'Light theme'}
          </DropdownMenu.Item>
          <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-muted-foreground outline-none data-[highlighted]:bg-white/70 dark:data-[highlighted]:bg-white/10">
            <LogOut className="size-4" /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function Topbar() {
  return (
    <div className="flex items-center gap-3">
      <MobileNav />
      <label className="glass flex h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl px-4 text-sm lg:max-w-md">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input placeholder="Search projects, POs, suppliers, PayPal ids…" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" />
        <kbd className="hidden rounded-md bg-white/70 px-1.5 text-[11px] text-muted-foreground sm:inline dark:bg-white/10">⌘K</kbd>
      </label>
      <div className="ml-auto flex gap-3">
        <div className="glass hidden h-11 items-center gap-2 rounded-2xl px-4 md:flex">
          <span className="live-dot size-2 rounded-full bg-good" />
          <span className="text-xs font-medium">Agent live</span>
        </div>
        <button aria-label="Notifications" className="glass relative grid size-11 place-items-center rounded-2xl">
          <Bell className="size-4" />
          <span className="absolute right-2 top-2 grid size-4 place-items-center rounded-full bg-crit text-[10px] font-bold text-white">3</span>
        </button>
        <UserMenu />
      </div>
    </div>
  )
}

export function AppShell() {
  const { pathname } = useLocation()
  return (
    <div className="mx-auto flex max-w-[1680px] gap-4 p-4">
      <aside className="glass sticky top-4 hidden h-[calc(100svh-2rem)] w-60 shrink-0 flex-col rounded-3xl p-4 lg:flex">
        <SidebarBody />
      </aside>
      <main className="min-w-0 flex-1 space-y-4">
        <Topbar />
        {/* key on path so each screen re-runs its mount animation */}
        <div key={pathname} className="space-y-4">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
