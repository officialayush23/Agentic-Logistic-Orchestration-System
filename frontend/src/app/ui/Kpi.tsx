import type { LucideIcon } from 'lucide-react'
import type { Tone } from '../data/types'
import { Delta } from './badges'
import { GlassCard, IconChip } from './glass'

export interface Kpi { label: string; value: string; icon: LucideIcon; tone: Tone; delta?: number; invert?: boolean; note?: string }

export function KpiRow({ items }: { items: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {items.map((k, i) => (
        <GlassCard key={k.label} className="p-4" delay={i * 0.05}>
          <IconChip icon={k.icon} tone={k.tone} />
          <p className="mt-3 text-xs font-medium text-muted-foreground">{k.label}</p>
          <p className="mt-0.5 text-2xl font-bold tracking-tight tabular-nums">{k.value}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {k.delta !== undefined && <Delta value={k.delta} invert={k.invert} />}
            <span>{k.note ?? 'vs previous 24 h'}</span>
          </p>
        </GlassCard>
      ))}
    </div>
  )
}
