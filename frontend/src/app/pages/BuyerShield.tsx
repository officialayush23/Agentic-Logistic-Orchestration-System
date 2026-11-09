import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColDef } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import {
  BadgeCheck, Clock, Copy, Hourglass, Landmark, Lock, PackageX, Play, Scale, Shield, Timer, Wallet, type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { glassGridTheme } from '../ag/setup'
import { api, buyTimers, live, type GuardEvent } from '../data/live'
import { data, projectById, usd } from '../data/source'
import { StatusBadge } from '../ui/badges'
import { Callout, CardHeader, GlassCard, PrimaryButton, SectionTitle } from '../ui/glass'
import { KpiRow } from '../ui/Kpi'

const GUARDS: { id: string; title: string; icon: LucideIcon; what: string }[] = [
  { id: 'fair_price', title: 'Fair price', icon: Scale, what: 'Quote vs should-cost and last price paid; broker markups blocked' },
  { id: 'budget', title: 'Budget envelope', icon: Wallet, what: 'Project cap for its date window; over the line needs your code' },
  { id: 'payee_lock', title: 'Payee lock', icon: Lock, what: 'Payouts only to the verified payee; changes wait 72 h + code' },
  { id: 'duplicate', title: 'Duplicate shield', icon: Copy, what: 'Same PO or invoice never paid twice' },
  { id: 'pay_on_proof', title: 'Pay on proof', icon: BadgeCheck, what: 'Holds voided when the carrier contradicts the supplier' },
  { id: 'late_credit', title: 'Late credit', icon: Clock, what: 'Late-delivery penalty deducted from the capture' },
  { id: 'quality_holdback', title: 'Quality holdback', icon: PackageX, what: 'Pay accepted units only; retention until line acceptance' },
  { id: 'hold_expiry', title: 'Hold expiry', icon: Hourglass, what: 'Re-authorize holds before PayPal’s 29-day expiry' },
]
// Shown only when the backend is not reachable (e.g. recording offline).
const SAMPLE: Record<string, number> = { pay_on_proof: 7120, fair_price: 7770, duplicate: 5880, payee_lock: 4410, late_credit: 180, early_pay: 78, quality_holdback: 0, budget: 0, hold_expiry: 0 }

const DRILL: { label: string; run: () => Promise<unknown> }[] = [
  { label: 'Reset the world', run: () => api('/api/scenarios/reset', { method: 'POST' }) },
  { label: 'Hold PO-7712 · PO-7718 · PO-7725 in PayPal', run: async () => { for (const po of ['PO-7712', 'PO-7718', 'PO-7725']) await api(`/api/shield/hold/${po}`, { method: 'POST' }) } },
  { label: 'Broker quotes ₹520 for a ₹112 part', run: () => api('/api/shield/quote', { method: 'POST', body: JSON.stringify({ component_id: 'COMP-104', supplier_id: 'SUP-18', unit_price_inr: 520, quantity: 700 }) }) },
  { label: '“New PayPal account” from a look-alike domain', run: () => api('/api/agents/payee-change', { method: 'POST', body: JSON.stringify({ supplier_id: 'SUP-21', new_email: 'payments@zhenhua-hk.com', sender: 'accounts@zhenhua-hk.com' }) }) },
  { label: 'PO-7718 arrives 6 days late, 380/400 pass QC', run: () => api('/api/warehouse/receive', { method: 'POST', body: JSON.stringify({ po_id: 'PO-7718', quantity_received: 400, quantity_approved: 380, invoice_number: 'KES-2209' }) }) },
  { label: 'PO-7725 arrives on time', run: () => api('/api/warehouse/receive', { method: 'POST', body: JSON.stringify({ po_id: 'PO-7725', quantity_received: 3000, quantity_approved: 3000, invoice_number: 'CC-7725' }) }) },
  { label: 'Same invoice re-sent as CC-7725-A', run: () => api('/api/warehouse/receive', { method: 'POST', body: JSON.stringify({ po_id: 'PO-7725', quantity_received: 3000, quantity_approved: 3000, invoice_number: 'CC-7725-A' }) }) },
  { label: 'Sentinel patrol: buy timers, missing acks', run: () => api('/api/agents/patrol', { method: 'POST' }) },
]

function useNow(ms = 1000) {
  const [n, setN] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t) }, [ms])
  return n
}

function Countdown({ iso }: { iso: string }) {
  const now = useNow()
  const left = new Date(iso).getTime() - now
  const h = left / 3_600_000
  const tone = left < 0 ? 'crit' : h <= 48 ? 'rose' : h <= 168 ? 'warn' : 'good'
  const abs = Math.abs(left)
  const d = Math.floor(abs / 86_400_000), hh = Math.floor((abs % 86_400_000) / 3_600_000), mm = Math.floor((abs % 3_600_000) / 60_000)
  return <StatusBadge tone={tone} dot>{left < 0 ? 'late by ' : ''}{d}d {hh}h {mm}m</StatusBadge>
}

export default function BuyerShield() {
  const qc = useQueryClient()
  const shield = useQuery({
    queryKey: ['shield'], queryFn: () => api<{ total_usd: number; by_guard: Record<string, { count: number; usd: number }>; events: GuardEvent[] }>('/api/shield'),
    retry: 4, refetchInterval: 6000,
  })
  const [steps, setSteps] = useState<{ label: string; state: 'todo' | 'run' | 'ok' | 'err'; note?: string }[]>([])
  const drill = useMutation({
    mutationFn: async () => {
      setSteps(DRILL.map((d) => ({ label: d.label, state: 'todo' })))
      for (let i = 0; i < DRILL.length; i++) {
        setSteps((s) => s.map((x, j) => (j === i ? { ...x, state: 'run' } : x)))
        try { await DRILL[i].run(); setSteps((s) => s.map((x, j) => (j === i ? { ...x, state: 'ok' } : x))) }
        catch (e) { setSteps((s) => s.map((x, j) => (j === i ? { ...x, state: 'err', note: (e as Error).message } : x))) }
        await qc.invalidateQueries({ queryKey: ['shield'] })
      }
    },
    onSuccess: () => toast.success('Guard drill finished: every decision is in the ledger'),
  })

  const liveOn = !!shield.data
  const byGuard = (id: string) => (liveOn ? shield.data!.by_guard[id]?.usd ?? 0 : SAMPLE[id] ?? 0)
  const total = liveOn ? shield.data!.total_usd : Object.values(SAMPLE).reduce((a, b) => a + b, 0)
  const events = shield.data?.events ?? []
  const blocks = events.filter((e) => e.outcome !== 'pass').length

  const cols = useMemo<ColDef<GuardEvent>[]>(() => [
    { field: 'created_at', headerName: 'When', width: 150, valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '') },
    { field: 'guard', headerName: 'Guard', width: 150, rowGroup: false, enableRowGroup: true },
    { field: 'outcome', headerName: 'Outcome', width: 110, cellRenderer: (p: { value: string }) => <span className="flex h-full items-center"><StatusBadge tone={p.value === 'block' ? 'crit' : p.value === 'pass' ? 'good' : 'warn'}>{p.value}</StatusBadge></span> },
    { field: 'po_id', headerName: 'PO', width: 110 },
    { field: 'amount_usd', headerName: 'Protected', width: 120, valueFormatter: (p) => (p.value ? usd(Number(p.value)) : '—') },
    { field: 'agent', headerName: 'Agent', width: 110 },
    { field: 'reason', headerName: 'Why', flex: 1, minWidth: 320, tooltipField: 'reason' },
  ], [])

  const timers = buyTimers()
  const envelopes = live.budgetEnvelopes.length ? live.budgetEnvelopes
    : data.projects.map((p) => ({ projectId: p.id, capUsd: Math.max(12000, Math.round(p.committedUsd * 1.4 / 1000) * 1000), windowStart: '', windowEnd: '' }))

  return (
    <div className="space-y-5">
      <SectionTitle title="Buyer Shield" subtitle="Seven deterministic guards between the agents and your money. Every decision is recorded, with the PayPal action it allowed or refused."
        action={<PrimaryButton icon={false} onClick={() => drill.mutate()} disabled={drill.isPending || !shield.isSuccess}><Play className="size-4" />{drill.isPending ? 'Running drill…' : 'Run guard drill'}</PrimaryButton>} />

      {!shield.isSuccess && <Callout lead="Showing the demo figures.">The live ledger loads from the API once the backend is reachable ({live.reason}).</Callout>}

      <KpiRow items={[
        { label: 'Money protected', value: usd(total), icon: Shield, tone: 'good', note: 'blocked, voided, refunded or deducted' },
        { label: 'Guard decisions', value: String(liveOn ? events.length : 7), icon: BadgeCheck, tone: 'violet', note: `${liveOn ? blocks : 7} changed what PayPal did` },
        { label: 'Buy timers red', value: String(timers.filter((t) => new Date(t.orderBy).getTime() - Date.now() < 48 * 3_600_000 && !t.orderedPoId).length), icon: Timer, tone: 'rose', note: `of ${timers.length} BOM lines` },
        { label: 'Budget envelopes', value: String(envelopes.length), icon: Landmark, tone: 'azure', note: 'one per project' },
      ]} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {GUARDS.map((g, i) => {
          const v = byGuard(g.id)
          return (
            <GlassCard key={g.id} className="p-4" delay={i * 0.03}>
              <div className="flex items-center gap-2"><g.icon className="size-4 text-primary" /><p className="text-sm font-semibold">{g.title}</p></div>
              <p className="mt-2 text-xl font-bold tabular-nums">{v ? usd(v) : '—'}</p>
              <p className="mt-1 text-xs text-muted-foreground">{g.what}</p>
            </GlassCard>
          )
        })}
      </div>

      {steps.length > 0 && (
        <GlassCard>
          <CardHeader icon={Play} tone="violet" title="Guard drill" subtitle="Real API calls; every PayPal call is sandbox" />
          <ol className="grid gap-1.5 text-sm md:grid-cols-2">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className={cn('mt-1 size-2.5 shrink-0 rounded-full', s.state === 'ok' ? 'bg-good' : s.state === 'err' ? 'bg-crit' : s.state === 'run' ? 'animate-pulse bg-azure' : 'bg-border')} />
                <span>{s.label}{s.note && <span className="block text-xs text-crit">{s.note}</span>}</span>
              </li>
            ))}
          </ol>
        </GlassCard>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <GlassCard>
          <CardHeader icon={Timer} tone="rose" title="Buy timers" subtitle="order-by = need-by − lead time − transit − buffer" />
          <div className="space-y-1.5">
            {timers.slice().sort((a, b) => +new Date(a.orderBy) - +new Date(b.orderBy)).map((t) => (
              <div key={`${t.projectId}-${t.componentId}`} className="glass flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm">
                <span className="min-w-0"><b>{t.name ?? t.componentId}</b> <span className="text-muted-foreground">· {projectById[t.projectId]?.name ?? t.projectId} · {t.qty.toLocaleString('en-IN')} pcs</span></span>
                {t.orderedPoId ? <StatusBadge tone="good">ordered · {t.orderedPoId}</StatusBadge> : <Countdown iso={t.orderBy} />}
              </div>
            ))}
          </div>
        </GlassCard>
        <GlassCard>
          <CardHeader icon={Landmark} tone="azure" title="Budget envelopes" subtitle="committed (held + released) against each project's cap" />
          <div className="space-y-3">
            {envelopes.map((e) => {
              const p = projectById[e.projectId]
              const committed = (p?.heldUsd ?? 0) + (p?.releasedUsd ?? 0)
              const pct = Math.min(1, committed / e.capUsd)
              return (
                <div key={e.projectId}>
                  <div className="flex justify-between text-xs"><span className="font-medium">{p?.name ?? e.projectId}</span>
                    <span className="tabular-nums text-muted-foreground">{usd(committed)} of {usd(e.capUsd)}</span></div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-violet/10">
                    <div className={cn('h-full rounded-full', pct > 0.9 ? 'bg-crit' : 'bg-gradient-to-r from-violet to-azure')} style={{ width: `${pct * 100}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </GlassCard>
      </div>

      <GlassCard>
        <CardHeader icon={Shield} tone="good" title="Guard ledger" subtitle="every verdict, newest first (AG Grid)" />
        <div className="h-[420px]">
          <AgGridReact<GuardEvent> theme={glassGridTheme} rowData={events} columnDefs={cols} suppressCellFocus
            getRowId={(p) => String(p.data.id)} overlayNoRowsTemplate={shield.isSuccess ? 'No guard decisions yet. Run the guard drill.' : 'Backend offline'} />
        </div>
      </GlassCard>
    </div>
  )
}
