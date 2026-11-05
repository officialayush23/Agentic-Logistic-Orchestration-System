import { cn } from '@/lib/utils'
import type { AgentStage, FinancialState, Health, ShipmentStatus } from '../data/types'

const base = 'inline-flex h-fit self-center items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold'

const severity = {
  critical: 'bg-crit/12 text-crit',
  high: 'bg-rose/14 text-[oklch(0.55_0.2_350)] dark:text-rose',
  medium: 'bg-warn/16 text-[oklch(0.55_0.14_60)] dark:text-warn',
  low: 'bg-good/12 text-good',
} as const

export function SeverityBadge({ level }: { level: keyof typeof severity }) {
  return <span className={cn(base, 'capitalize', severity[level])}>{level}</span>
}

const ringed = {
  violet: 'bg-violet/10 text-violet ring-1 ring-violet/20',
  azure: 'bg-azure/10 text-azure ring-1 ring-azure/20',
  rose: 'bg-rose/10 text-[oklch(0.55_0.2_350)] ring-1 ring-rose/20 dark:text-rose',
  good: 'bg-good/10 text-good ring-1 ring-good/20',
  warn: 'bg-warn/10 text-[oklch(0.55_0.14_60)] ring-1 ring-warn/20 dark:text-warn',
  crit: 'bg-crit/10 text-crit ring-1 ring-crit/20',
  muted: 'bg-muted text-muted-foreground ring-1 ring-border',
} as const
export type RingTone = keyof typeof ringed

export function StatusBadge({ tone, children, dot }: { tone: RingTone; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={cn(base, ringed[tone])}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export const financialMeta: Record<FinancialState, { label: string; tone: RingTone; hint: string }> = {
  not_started: { label: 'Not started', tone: 'muted', hint: 'No money committed' },
  invoice_received: { label: 'Invoice received', tone: 'violet', hint: 'Waiting for three-way match' },
  invoice_mismatch: { label: 'Invoice mismatch', tone: 'crit', hint: 'Invoice disagrees with PO or receipt' },
  awaiting_approval: { label: 'Awaiting approval', tone: 'rose', hint: 'Over authority limit — human must release' },
  funds_held: { label: 'Funds held', tone: 'azure', hint: 'PayPal authorization: reserved, not moved' },
  funds_released: { label: 'Funds released', tone: 'good', hint: 'Captured after goods verified' },
  hold_voided: { label: 'Hold voided', tone: 'warn', hint: 'Authorization voided — money never left' },
  refunded: { label: 'Refunded', tone: 'warn', hint: 'Captured, then pulled back' },
  payout_sent: { label: 'Payout sent', tone: 'violet', hint: 'Instant PayPal Payout' },
}

export function FinancialBadge({ state }: { state: FinancialState }) {
  const m = financialMeta[state]
  return <span title={m.hint}><StatusBadge tone={m.tone} dot>{m.label}</StatusBadge></span>
}

export const healthMeta: Record<Health, { label: string; tone: RingTone }> = {
  on_track: { label: 'On track', tone: 'good' },
  at_risk: { label: 'At risk', tone: 'warn' },
  critical: { label: 'Critical', tone: 'crit' },
  stood_down: { label: 'Stood down', tone: 'muted' },
}
export function HealthBadge({ health }: { health: Health }) {
  const m = healthMeta[health]
  return <StatusBadge tone={m.tone} dot>{m.label}</StatusBadge>
}

export const stageMeta: Record<AgentStage, { label: string; tone: RingTone }> = {
  detected: { label: 'Detected', tone: 'warn' },
  investigating: { label: 'Investigating', tone: 'violet' },
  awaiting_approval: { label: 'Awaiting approval', tone: 'rose' },
  funds_held: { label: 'Funds held', tone: 'azure' },
  goods_verified: { label: 'Goods verified', tone: 'good' },
  settled: { label: 'Settled', tone: 'good' },
  clawed_back: { label: 'Clawed back', tone: 'warn' },
}
export function StageBadge({ stage }: { stage: AgentStage }) {
  const m = stageMeta[stage]
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>
}

export const shipmentMeta: Record<ShipmentStatus, { label: string; tone: RingTone }> = {
  in_transit: { label: 'In transit', tone: 'azure' },
  delayed: { label: 'Delayed', tone: 'warn' },
  claim_mismatch: { label: 'Claim ≠ carrier', tone: 'crit' },
  delivered: { label: 'Delivered', tone: 'good' },
  not_shipped: { label: 'Not shipped', tone: 'crit' },
  booked: { label: 'Booked', tone: 'violet' },
}
export function ShipmentBadge({ status }: { status: ShipmentStatus }) {
  const m = shipmentMeta[status]
  return <StatusBadge tone={m.tone} dot>{m.label}</StatusBadge>
}

export function Delta({ value, invert = false, suffix = '%' }: { value: number; invert?: boolean; suffix?: string }) {
  const up = value >= 0
  // The spec's recipe had this inverted (every rise rendered red). Default: up is good;
  // `invert` for metrics where a rise is bad (units at risk, open incidents).
  const bad = invert ? up : !up
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums', bad ? 'text-crit' : 'text-good')}>
      {up ? '↑' : '↓'} {Math.abs(value).toFixed(1)}{suffix}
    </span>
  )
}
