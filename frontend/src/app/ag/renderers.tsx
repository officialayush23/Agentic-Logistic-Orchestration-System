// Custom AG Grid cell renderers. Each one turns a raw value into the same
// tinted-chip language the rest of the app uses.
import type { CustomCellRendererProps } from 'ag-grid-react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { supplierById, usd } from '../data/source'
import type { FinancialState, Health, ShipmentStatus } from '../data/types'
import { FinancialBadge, HealthBadge, ShipmentBadge } from '../ui/badges'

/** Agent confidence: red < 50, amber 50–80, green > 80. */
export function ConfidenceCell({ value }: CustomCellRendererProps<unknown, number>) {
  if (value == null) return null
  const color = value < 50 ? 'bg-crit' : value <= 80 ? 'bg-warn' : 'bg-good'
  return (
    <div className="flex w-full items-center gap-2">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-violet/10">
        <motion.span className={cn('block h-full rounded-full', color)} initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: 0.8 }} />
      </span>
      <span className="w-8 text-right text-[11px] font-semibold tabular-nums">{value}%</span>
    </div>
  )
}

export function FinancialCell({ value }: CustomCellRendererProps<unknown, FinancialState>) {
  return value ? <FinancialBadge state={value} /> : null
}
export function HealthCell({ value }: CustomCellRendererProps<unknown, Health>) {
  return value ? <HealthBadge health={value} /> : null
}
export function ShipmentCell({ value }: CustomCellRendererProps<unknown, ShipmentStatus>) {
  return value ? <ShipmentBadge status={value} /> : null
}

export function MoneyCell({ value }: CustomCellRendererProps<unknown, number>) {
  if (value == null) return null
  return <span className="w-full text-right font-semibold tabular-nums">{usd(value)}</span>
}

export function ProgressCell({ value }: CustomCellRendererProps<unknown, number>) {
  if (value == null) return null
  return (
    <div className="flex w-full items-center gap-2">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-violet/10">
        <motion.span className="block h-full rounded-full bg-gradient-to-r from-violet to-rose" initial={{ width: 0 }} animate={{ width: `${value * 100}%` }} transition={{ duration: 0.8 }} />
      </span>
      <span className="w-9 text-right text-[11px] font-semibold tabular-nums">{Math.round(value * 100)}%</span>
    </div>
  )
}

export function SupplierCell({ value }: CustomCellRendererProps<unknown, string>) {
  const s = value ? supplierById[value] : undefined
  if (!s) return <span className="text-muted-foreground">—</span>
  const tone = s.reliability < 50 ? 'text-crit' : s.reliability < 75 ? 'text-warn' : 'text-good'
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-violet/12 text-[10px] font-bold leading-none text-violet">{s.name.slice(0, 2).toUpperCase()}</span>
      <span className="min-w-0 truncate">{s.name}</span>
      <span className={cn('ml-auto shrink-0 text-[11px] font-semibold tabular-nums', tone)}>{s.reliability}</span>
    </span>
  )
}

export function TagCell({ value }: CustomCellRendererProps<unknown, string>) {
  if (!value) return null
  return <span className="rounded-md bg-violet/10 px-1.5 py-0.5 text-[11px] font-semibold text-violet">{value}</span>
}
