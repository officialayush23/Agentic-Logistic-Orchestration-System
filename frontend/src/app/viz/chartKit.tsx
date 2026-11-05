// Recharts conventions from the spec: no vertical grid, faint dashed horizontals,
// no axis lines, 11px muted ticks, glass tooltip.
import type { TooltipContentProps } from 'recharts'

export const grid = { stroke: 'oklch(0.56 0.22 278 / 0.08)', strokeDasharray: '3 3', vertical: false } as const
export const axis = { axisLine: false, tickLine: false, tick: { fontSize: 11, fill: 'var(--muted-foreground)' } } as const
export const series = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

export function GlassTooltip({ active, payload, label, format = (v) => String(v) }: Partial<TooltipContentProps<number, string>> & { format?: (v: number) => string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-strong rounded-xl px-3 py-2 text-xs">
      <p className="mb-1 font-semibold">{label}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto font-semibold tabular-nums">{format(Number(p.value))}</span>
        </p>
      ))}
    </div>
  )
}

export function AreaGradient({ id, color }: { id: string; color: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={0.35} />
      <stop offset="100%" stopColor={color} stopOpacity={0} />
    </linearGradient>
  )
}
