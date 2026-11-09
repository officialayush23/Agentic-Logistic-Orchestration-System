import { Bell, HelpCircle, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Search, ShieldCheck, Sun, Workflow, X } from 'lucide-react'
import { motion } from 'motion/react'
import { Dialog, DropdownMenu } from 'radix-ui'
import { NavLink, Outlet, useLocation } from 'react-router'
import { cn } from '@/lib/utils'
import { AUTHORITY_LIMIT_USD } from '../data/mock'
import { usd } from '../data/source'
import { useUi } from '../store'
import { footerNav, mainNav, type NavItem } from './nav'

function NavItemLink({ item, onNavigate, collapsed }: { item: NavItem; onNavigate?: () => void; collapsed?: boolean }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn('relative flex items-center gap-3 rounded-xl py-2 text-sm font-medium transition-colors',
          collapsed ? 'justify-center px-0' : 'px-3',
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
          <Icon className="relative size-4 shrink-0" />
          {!collapsed && <span className="relative truncate">{item.label}</span>}
          {item.count ? (collapsed
            ? <span className="absolute right-1.5 top-1 size-1.5 rounded-full bg-primary" />
            : <span className="relative ml-auto rounded-md bg-primary/10 px-1.5 text-[11px] font-semibold text-primary tabular-nums">{item.count}</span>
          ) : null}
        </>
      )}
    </NavLink>
  )
}

function SidebarBody({ onNavigate, collapsed = false, onToggle }: { onNavigate?: () => void; collapsed?: boolean; onToggle?: () => void }) {
  return (
    <>
      <div className={cn('mb-5 flex items-center gap-3', collapsed ? 'flex-col px-0' : 'px-1')}>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet to-azure text-white shadow-md shadow-violet/30">
          <Workflow className="size-4" />
        </span>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold tracking-tight text-primary">DisruptionOps</p>
            <p className="truncate text-[11px] text-muted-foreground">Autonomous supply-chain finance</p>
          </div>
        )}
        {onToggle && (
          <button onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="grid size-8 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-white/60 dark:hover:bg-white/10">
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        )}
      </div>
      {/* Only the nav scrolls; brand on top and the mandate card stay put. */}
      <nav className="scrollbar-thin -mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain px-1">
        {mainNav.map((i) => <NavItemLink key={i.to} item={i} onNavigate={onNavigate} collapsed={collapsed} />)}
        <div className="mt-3 flex flex-col gap-0.5 border-t border-white/40 pt-3 dark:border-white/10">
          {footerNav.map((i) => <NavItemLink key={i.to} item={i} onNavigate={onNavigate} collapsed={collapsed} />)}
          <a href="https://github.com/officialayush23/Agentic-Logistic-Orchestration-System" target="_blank" rel="noreferrer"
             title={collapsed ? 'Help & docs' : undefined}
             className={cn('flex items-center gap-3 rounded-xl py-2 text-sm font-medium text-sidebar-foreground/75 hover:bg-white/50 dark:hover:bg-white/5', collapsed ? 'justify-center' : 'px-3')}>
            <HelpCircle className="size-4 shrink-0" /> {!collapsed && 'Help & docs'}
          </a>
        </div>
      </nav>
      <div className="shrink-0 pt-3">
        {collapsed ? (
          <span title={`Agent spending mandate: releases above ${usd(AUTHORITY_LIMIT_USD)} need a human code`}
            className="mx-auto grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-violet/90 to-azure/90 text-white shadow-lg shadow-violet/25">
            <ShieldCheck className="size-4" />
          </span>
        ) : (
          <div className="rounded-2xl bg-gradient-to-br from-violet/90 to-azure/90 p-3.5 text-white shadow-lg shadow-violet/25">
            <p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4" />Agent spending mandate</p>
            <p className="mt-1 text-xs text-white/80">
              Holds funds automatically. Releases above {usd(AUTHORITY_LIMIT_USD)} need a human code.
            </p>
            <span className="mt-2 inline-block rounded-md bg-white/20 px-1.5 py-0.5 text-[11px]">PayPal sandbox · live</span>
          </div>
        )}
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
  const { collapsed, toggleCollapsed } = useUi()
  return (
    // The shell owns the viewport: the sidebar and the page scroll independently,
    // and each card scrolls its own content (see GlassCard).
    <div className="mx-auto flex h-dvh max-w-[1680px] gap-4 overflow-hidden p-4">
      <motion.aside
        animate={{ width: collapsed ? 76 : 240 }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        className="glass hidden h-full shrink-0 flex-col overflow-hidden rounded-3xl p-3 lg:flex">
        <SidebarBody collapsed={collapsed} onToggle={toggleCollapsed} />
      </motion.aside>
      <main className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="shrink-0"><Topbar /></div>
        {/* key on path so each screen re-runs its mount animation */}
        <div key={pathname} className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pb-2 pr-1">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
