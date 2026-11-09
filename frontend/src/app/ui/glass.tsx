import type { LucideIcon } from 'lucide-react'
import { ArrowUpRight } from 'lucide-react'
import { motion, type HTMLMotionProps } from 'motion/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { Tone } from '../data/types'

const EASE = [0.22, 1, 0.36, 1] as const

export function GlassCard({ className, children, delay = 0, ...props }: HTMLMotionProps<'section'> & { delay?: number }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay }}
      // Every card is its own scroll container: capped to the visible area, so a long
      // card scrolls inside itself while its neighbours stay in view.
      className={cn('glass scrollbar-thin min-w-0 max-h-[calc(100dvh-7.5rem)] overflow-y-auto overflow-x-hidden overscroll-contain rounded-3xl p-5', className)}
      {...props}
    >
      {children}
    </motion.section>
  )
}

export const tones: Record<Tone, string> = {
  violet: 'bg-violet/12 text-violet',
  azure: 'bg-azure/12 text-azure',
  rose: 'bg-rose/14 text-rose',
  good: 'bg-good/12 text-good',
  warn: 'bg-warn/15 text-warn',
  crit: 'bg-crit/12 text-crit',
}

export function IconChip({ icon: Icon, tone = 'violet', className }: { icon: LucideIcon; tone?: Tone; className?: string }) {
  return (
    <span className={cn('grid size-8 shrink-0 place-items-center rounded-xl', tones[tone], className)}>
      <Icon className="size-4" />
    </span>
  )
}

export function CardHeader({ icon, tone, title, subtitle, action }: {
  icon: LucideIcon; tone?: Tone; title: string; subtitle?: string; action?: ReactNode
}) {
  return (
    <header className="mb-4 flex items-center gap-3">
      <IconChip icon={icon} tone={tone} />
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold">{title}</h2>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="ml-auto shrink-0">{action}</div>}
    </header>
  )
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border border-white/80 bg-white/70 px-2.5 py-1 text-xs font-medium dark:border-white/10 dark:bg-white/5', className)}>
      {children}
    </span>
  )
}

export function PrimaryButton({ children, className, icon = true, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: boolean }) {
  return (
    <button
      className={cn('inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground opacity-90 transition-opacity hover:opacity-100 disabled:opacity-40', className)}
      {...props}
    >
      {children}
      {icon && <ArrowUpRight className="size-3" />}
    </button>
  )
}

export function SecondaryButton({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn('inline-flex items-center gap-1 rounded-lg bg-white/80 px-2 py-1 text-[11px] font-medium transition-colors hover:bg-white dark:bg-white/10 dark:hover:bg-white/15', className)}
      {...props}
    >
      {children}
    </button>
  )
}

export function Callout({ lead, children, className }: { lead: string; children: ReactNode; className?: string }) {
  return (
    <p className={cn('rounded-lg bg-violet/5 px-2 py-1.5 text-[11px] text-muted-foreground', className)}>
      <span className="font-semibold text-foreground/80">{lead} </span>
      {children}
    </p>
  )
}

/** Inline meter: violet→rose fill that grows from 0. */
export function Meter({ label, value, display, className }: { label?: string; value: number; display?: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      {label && <span className="w-24 shrink-0 truncate text-[11px] text-muted-foreground">{label}</span>}
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-violet/10">
        <motion.span
          className="block h-full rounded-full bg-gradient-to-r from-violet to-rose"
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
          transition={{ duration: 0.8, ease: EASE }}
        />
      </span>
      {display !== undefined && <span className="w-10 shrink-0 text-right text-[11px] font-semibold tabular-nums">{display}</span>}
    </div>
  )
}

export function EmptyState({ icon, title, hint, action, tone = 'violet' }: { icon: LucideIcon; title: string; hint: string; action?: ReactNode; tone?: Tone }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <IconChip icon={icon} tone={tone} />
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{hint}</p>
      {action}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <span className={cn('inline-block animate-pulse rounded-lg bg-white/70 dark:bg-white/10', className)} />
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  )
}
