import { Activity, AlertTriangle, ArrowRight, Banknote, Globe2, HandCoins, Lock, ShieldAlert, Undo2, Wallet } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { customerById, data, num, poById, rel, supplierById, totals, usd } from '../data/source'
import { Delta, FinancialBadge, HealthBadge, ShipmentBadge } from '../ui/badges'
import { FeedList } from '../ui/Feed'
import { CardHeader, GlassCard, Meter, Pill, SectionTitle, tones } from '../ui/glass'
import type { Tone } from '../data/types'
import { KpiRow } from '../ui/Kpi'
import { live as liveData } from '../data/live'
import { AreaGradient, axis, grid, GlassTooltip } from '../viz/chartKit'
import { SupplyGlobe } from '../viz/SupplyGlobe'

export default function MissionControl() {
  const t = totals()
  const nav = useNavigate()
  const live = data.shipments.filter((s) => ['in_transit', 'delayed', 'claim_mismatch'].includes(s.status))
  const last = data.moneySeries[data.moneySeries.length - 1]
  const prev = data.moneySeries[data.moneySeries.length - 2]

  return (
    <>
      <SectionTitle
        title="Mission Control"
        subtitle={`Pune Plant 1 · ${data.projects.length} customer projects · ${data.purchaseOrders.length} purchase orders watched`}
        action={<Pill><span className="live-dot size-1.5 rounded-full bg-good" /> Last agent action {rel(data.feed[0].at)}</Pill>}
      />

      <KpiRow items={[
        { label: 'Units at risk', value: num(t.unitsAtRisk), icon: AlertTriangle, tone: 'crit', delta: -18.4, invert: true },
        { label: 'Funds held in PayPal', value: usd(t.held), icon: Lock, tone: 'azure', delta: 17.9, note: 'reserved, not moved' },
        { label: 'Protected by Buyer Shield', value: usd(liveData.mode === 'live' && liveData.shield.total_usd > 0 ? liveData.shield.total_usd : 25438), icon: Undo2, tone: 'good', delta: 117.5, note: '7 guards · blocked, voided, deducted' },
        { label: 'Open incidents', value: String(t.openIncidents), icon: Activity, tone: 'violet', delta: 25, invert: true },
      ]} />

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <GlassCard className="overflow-hidden p-0" delay={0.1}>
          <div className="p-5 pb-0">
            <CardHeader icon={Globe2} title="Live supply network"
              subtitle={`${live.length} shipments moving into Pune · ${data.suppliers.length} suppliers on 4 continents`}
              action={<Link to="/shipments" className="text-[11px] font-semibold text-primary hover:underline">Open shipments →</Link>} />
          </div>
          <SupplyGlobe height={500} onSelect={(po) => poById[po] && nav(`/projects/${poById[po].projectId}`)} />
          <div className="grid grid-cols-1 gap-2 border-t border-white/60 p-4 sm:grid-cols-3 dark:border-white/10">
            {live.slice(0, 3).map((s) => {
              const po = poById[s.poId]
              return (
                <Link key={s.poId} to={`/projects/${po.projectId}`} className="rounded-2xl bg-white/50 p-3 transition-shadow hover:shadow-md hover:shadow-violet/10 dark:bg-white/5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">{po.id}</span>
                    <ShipmentBadge status={s.status} />
                  </div>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">{supplierById[po.supplierId].name} · {s.carrier}</p>
                  <Meter value={s.progress} display={`${Math.round(s.progress * 100)}%`} className="mt-2" />
                </Link>
              )
            })}
          </div>
        </GlassCard>

        <div className="flex flex-col gap-4">
          <GlassCard className="flex h-[440px] flex-col" delay={0.15}>
            <CardHeader icon={Activity} title="Agent activity" subtitle="Every decision, as it happens"
              action={<Link to="/audit" className="text-[11px] font-semibold text-primary hover:underline">Audit →</Link>} />
            <FeedList items={data.feed} className="min-h-0 flex-1" />
          </GlassCard>
          <GlassCard delay={0.2}>
            <CardHeader icon={Wallet} tone="azure" title="Money in flight" subtitle="Where every PayPal dollar sits right now" />
            <div className="space-y-2.5">
              {(['funds_held', 'awaiting_approval', 'funds_released', 'hold_voided', 'refunded'] as const).map((st) => {
                const sum = data.payments.filter((p) => p.state === st).reduce((a, p) => a + p.amountUsd, 0)
                const max = 40_000
                return (
                  <div key={st} className="flex items-center gap-3">
                    <span className="w-32 shrink-0"><FinancialBadge state={st} /></span>
                    <Meter value={sum / max} className="flex-1" />
                    <span className="w-16 text-right text-xs font-semibold tabular-nums">{usd(sum, true)}</span>
                  </div>
                )
              })}
            </div>
          </GlassCard>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <GlassCard delay={0.25}>
          <CardHeader icon={Banknote} tone="azure" title="PayPal money, last 14 days" subtitle="Held vs released vs recovered" />
          <div className="mb-2 flex items-baseline gap-3">
            <span className="text-2xl font-bold tabular-nums">{usd(last.held)}</span>
            <Delta value={((last.held - prev.held) / prev.held) * 100} />
            <span className="text-xs text-muted-foreground">held today</span>
          </div>
          <div className="h-48">
            <ResponsiveContainer>
              <AreaChart data={data.moneySeries} margin={{ left: -12, right: 4, top: 6 }}>
                <defs>
                  <AreaGradient id="g1" color="var(--chart-1)" />
                  <AreaGradient id="g2" color="var(--chart-4)" />
                  <AreaGradient id="g3" color="var(--chart-3)" />
                </defs>
                <CartesianGrid {...grid} />
                <XAxis dataKey="day" {...axis} interval={2} />
                <YAxis {...axis} tickFormatter={(v) => `$${v / 1000}k`} />
                <Tooltip content={<GlassTooltip format={(v) => usd(v)} />} />
                <Area type="monotone" dataKey="held" name="Held" stroke="var(--chart-1)" strokeWidth={2} fill="url(#g1)" />
                <Area type="monotone" dataKey="released" name="Released" stroke="var(--chart-4)" strokeWidth={2} fill="url(#g2)" />
                <Area type="monotone" dataKey="recovered" name="Recovered" stroke="var(--chart-3)" strokeWidth={2} fill="url(#g3)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard delay={0.3}>
          <CardHeader icon={ShieldAlert} tone="crit" title="Projects needing attention"
            action={<Link to="/projects" className="text-[11px] font-semibold text-primary hover:underline">All projects →</Link>} />
          <div className="space-y-2">
            {data.projects.filter((p) => p.health === 'critical' || p.health === 'at_risk').map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="block rounded-2xl border border-white/80 bg-white/60 p-3.5 transition-shadow hover:shadow-md hover:shadow-violet/10 dark:border-white/10 dark:bg-white/5">
                <div className="flex items-center gap-2">
                  <HealthBadge health={p.health} />
                  <span className="text-[11px] text-muted-foreground">{customerById[p.customerId].name} · due {rel(p.dueAt)}</span>
                </div>
                <p className="mt-2 text-sm font-semibold">{p.name}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{p.summary}</p>
                <Meter label="Materials secured" value={p.materialsSecured} display={`${Math.round(p.materialsSecured * 100)}%`} className="mt-2" />
              </Link>
            ))}
          </div>
        </GlassCard>

        <GlassCard delay={0.35} className="lg:col-span-2 xl:col-span-1">
          <CardHeader icon={HandCoins} tone="violet" title="How the agent moves money" subtitle="LLM reads · Python decides · PayPal executes" />
          <ol className="space-y-2">
            {[
              ['Gemini reads the supplier email', 'Extracts claims, dates, invoice totals. Never touches money.', 'violet'],
              ['Python checks the claim against the carrier', 'A contradiction is a fact, not an opinion.', 'warn'],
              ['PayPal holds funds for the backup supplier', 'Orders v2 AUTHORIZE — reserved, not moved.', 'azure'],
              ['Warehouse verifies goods + QC', 'Three-way match: PO ↔ invoice ↔ receipt.', 'good'],
              ['Capture, or void and claw back', `Above $5,000 a human releases with a one-time code.`, 'rose'],
            ].map(([title, body, tone], i) => (
              <li key={title} className="flex gap-3 rounded-2xl bg-white/50 p-3 dark:bg-white/5">
                <span className={`grid size-6 shrink-0 place-items-center rounded-lg text-[11px] font-bold ${tones[tone as Tone]}`}>{i + 1}</span>
                <span>
                  <span className="block text-xs font-semibold">{title}</span>
                  <span className="block text-[11px] text-muted-foreground">{body}</span>
                </span>
              </li>
            ))}
          </ol>
          <Link to="/simulate" className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">
            Try it in the Simulation Lab <ArrowRight className="size-3" />
          </Link>
        </GlassCard>
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        All PayPal actions run in the sandbox · world events can be simulated, money never is.
      </p>
    </>
  )
}
