import { CheckCircle2, KeyRound, Lock, ShieldCheck, XCircle } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../data/live'
import { cn } from '@/lib/utils'
import { componentById, data, incidentById, poById, projectById, rel, supplierById, usd } from '../data/source'
import type { Approval } from '../data/types'
import { OptionsTable } from '../ui/agent'
import { StatusBadge } from '../ui/badges'
import { Callout, CardHeader, EmptyState, GlassCard, PrimaryButton, SecondaryButton, SectionTitle } from '../ui/glass'

function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: 6 }, (_, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el }} inputMode="numeric" maxLength={1} value={value[i] ?? ''}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => {
            const d = e.target.value.replace(/\D/g, '').slice(-1)
            const next = (value.slice(0, i) + d + value.slice(i + 1)).slice(0, 6)
            onChange(next)
            if (d && i < 5) refs.current[i + 1]?.focus()
          }}
          onKeyDown={(e) => { if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus() }}
          className="glass h-11 w-9 min-w-0 rounded-xl text-center text-lg font-bold tabular-nums outline-none focus:ring-2 focus:ring-ring" />
      ))}
    </div>
  )
}

function ApprovalCard({ a, onDecide }: { a: Approval; onDecide: (id: string, s: Approval['state']) => void }) {
  const [code, setCode] = useState('')
  const inc = incidentById[a.incidentId]
  const po = poById[a.poId]
  return (
    <GlassCard className={cn(a.state === 'pending' && 'ring-1 ring-rose/30')}>
      <CardHeader icon={ShieldCheck} tone="rose" title={`Release ${usd(a.amountUsd)} to ${supplierById[po.supplierId].name}?`}
        subtitle={`${projectById[a.projectId].name} · ${po.id} · ${componentById[po.componentId].name}`}
        action={<StatusBadge tone={a.state === 'pending' ? 'rose' : a.state === 'approved' ? 'good' : 'crit'} dot>{a.state}</StatusBadge>} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <Callout lead="Why it's here:">{usd(a.amountUsd)} is above the agent's {usd(a.limitUsd)} authority limit. {a.reason}</Callout>
          <Callout lead="What happens if you approve:">PayPal holds the funds now. They are captured only when the warehouse confirms receipt and QC — your approval never pays for goods that haven't arrived.</Callout>
          {inc && <OptionsTable options={inc.options} />}
        </div>
        <div className="rounded-2xl bg-white/50 p-4 dark:bg-white/5">
          {a.state === 'pending' ? (
            <>
              <p className="flex items-center gap-1.5 text-xs font-semibold"><KeyRound className="size-3.5" /> One-time code</p>
              <p className="mb-3 mt-1 text-[11px] text-muted-foreground">Sent to the project owner's email {rel(a.requestedAt)}. Expires {rel(a.expiresAt)}.</p>
              <CodeInput value={code} onChange={setCode} />
              <div className="mt-4 flex gap-2">
                <PrimaryButton disabled={code.length < 6} onClick={() => onDecide(a.id, 'approved')}>Approve & hold funds</PrimaryButton>
                <SecondaryButton onClick={() => onDecide(a.id, 'rejected')}>Reject</SecondaryButton>
              </div>
            </>
          ) : (
            <AnimatePresence>
              <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-2 py-4 text-center">
                {a.state === 'approved' ? <CheckCircle2 className="size-8 text-good" /> : <XCircle className="size-8 text-crit" />}
                <p className="text-sm font-semibold">{a.state === 'approved' ? 'Approved — funds held in PayPal' : 'Rejected — agent will re-plan'}</p>
                <p className="text-[11px] text-muted-foreground"><Lock className="mr-1 inline size-3" />Release still waits for verified goods.</p>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </GlassCard>
  )
}

interface LiveRelease { id: number; po_id: string; amount_usd: number; reason?: string; sent_to?: string; requested_at: string; expires_at?: string; state: string; supplier_id?: string }
interface LiveThread { thread_id: string; title: string; waiting_for_human: boolean; request?: { type?: string; action?: string; estimated_cost_inr?: number; narrative?: string } }
interface LivePayee { id: number; supplier_id: string; supplier_name?: string; new_email: string; sender?: string; current_email?: string; cooling_until: string; status: string }

/** Everything waiting on a human, straight from the backend. */
function LiveQueue() {
  const qc = useQueryClient()
  const releases = useQuery({ queryKey: ['releases'], queryFn: () => api<LiveRelease[]>('/api/finance/approvals'), retry: 3, refetchInterval: 8000 })
  const threads = useQuery({ queryKey: ['threads'], queryFn: () => api<{ threads: LiveThread[] }>('/api/agents/threads'), retry: 3, refetchInterval: 8000 })
  const payees = useQuery({ queryKey: ['payees'], queryFn: () => api<{ requests: LivePayee[] }>('/api/agents/payee-changes'), retry: 3, refetchInterval: 8000 })
  const refresh = () => ['releases', 'threads', 'payees'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
  const [codes, setCodes] = useState<Record<number, string>>({})
  const release = useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: 'approve' | 'reject' }) =>
      api(`/api/finance/approvals/${id}/decide`, { method: 'POST', body: JSON.stringify({ decision, code: codes[id] }) }),
    onSuccess: (_, v) => { toast.success(v.decision === 'approve' ? 'Released: PayPal capture + payout' : 'Rejected'); refresh() },
    onError: (e) => toast.error((e as Error).message.slice(0, 160)),
  })
  const plan = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'reject' }) =>
      api(`/api/agent/resume/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ decision, note: 'from Approvals' }) }),
    onSuccess: (_, v) => { toast.success(`Plan ${v.decision}d; the agent team resumes the thread`); setTimeout(refresh, 1500) },
    onError: (e) => toast.error((e as Error).message.slice(0, 160)),
  })
  const payee = useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: 'approve' | 'reject' }) =>
      api(`/api/agents/payee-changes/${id}/decide`, { method: 'POST', body: JSON.stringify({ decision }) }),
    onSuccess: (_, v) => { toast.success(`Payee change ${v.decision}d`); refresh() },
    onError: (e) => toast.error((e as Error).message.replace(/^.*→ \d+ /, '').slice(0, 200)),
  })
  if (releases.isError && threads.isError) return null
  const pendingReleases = (releases.data ?? []).filter((r) => r.state === 'pending')
  const waiting = (threads.data?.threads ?? []).filter((t) => t.waiting_for_human)
  const pendingPayees = (payees.data?.requests ?? []).filter((r) => r.status === 'pending')
  const n = pendingReleases.length + waiting.length + pendingPayees.length
  return (
    <GlassCard className="max-h-none overflow-visible">
      <CardHeader icon={ShieldCheck} tone={n ? 'rose' : 'good'} title={n ? `${n} decision${n > 1 ? 's' : ''} waiting on you (live)` : 'Nothing live waiting on you'}
        subtitle="Money releases above the authority limit · agent plans paused at a LangGraph interrupt · payee changes in cooling-off" />
      <div className="space-y-3">
        {waiting.map((t) => (
          <div key={t.thread_id} className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3">
            <StatusBadge tone="violet" dot>agent plan</StatusBadge>
            <div className="min-w-0 flex-1 text-sm"><b>{t.thread_id}</b> · {t.request?.action ?? t.title}
              {t.request?.estimated_cost_inr ? <span className="text-muted-foreground"> · ₹{Math.round(t.request.estimated_cost_inr).toLocaleString('en-IN')}</span> : null}
              {t.request?.narrative && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.request.narrative}</p>}</div>
            <PrimaryButton onClick={() => plan.mutate({ id: t.thread_id, decision: 'approve' })} disabled={plan.isPending}>Approve</PrimaryButton>
            <SecondaryButton onClick={() => plan.mutate({ id: t.thread_id, decision: 'reject' })} disabled={plan.isPending}>Reject &amp; replan</SecondaryButton>
          </div>
        ))}
        {pendingReleases.map((r) => (
          <div key={r.id} className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3">
            <StatusBadge tone="rose" dot>release {usd(Number(r.amount_usd))}</StatusBadge>
            <div className="min-w-0 flex-1 text-sm"><b>{r.po_id}</b> · {r.reason ?? 'above the agent’s authority'}
              <p className="text-xs text-muted-foreground">Code emailed to {r.sent_to ?? 'the approver'} · {rel(r.requested_at)}</p></div>
            <CodeInput value={codes[r.id] ?? ''} onChange={(v) => setCodes((c) => ({ ...c, [r.id]: v }))} />
            <PrimaryButton disabled={(codes[r.id] ?? '').length < 6 || release.isPending} onClick={() => release.mutate({ id: r.id, decision: 'approve' })}>Release</PrimaryButton>
            <SecondaryButton onClick={() => release.mutate({ id: r.id, decision: 'reject' })}>Reject</SecondaryButton>
          </div>
        ))}
        {pendingPayees.map((r) => {
          const cooling = new Date(r.cooling_until).getTime() > Date.now()
          return (
            <div key={r.id} className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3">
              <StatusBadge tone="crit" dot>payee change</StatusBadge>
              <div className="min-w-0 flex-1 text-sm"><b>{r.supplier_name ?? r.supplier_id}</b>: {r.current_email ?? '—'} → <b>{r.new_email}</b>
                <p className="text-xs text-muted-foreground">asked by {r.sender ?? 'unknown'} · {cooling ? `cooling-off ends ${rel(r.cooling_until)}` : 'cooling-off over'}</p></div>
              <PrimaryButton disabled={cooling || payee.isPending} title={cooling ? 'Wait for the cooling-off period' : undefined}
                onClick={() => payee.mutate({ id: r.id, decision: 'approve' })}>Approve change</PrimaryButton>
              <SecondaryButton onClick={() => payee.mutate({ id: r.id, decision: 'reject' })}>Reject</SecondaryButton>
            </div>
          )
        })}
        {n === 0 && <p className="text-sm text-muted-foreground">Every open decision is inside the agents’ authority.</p>}
      </div>
    </GlassCard>
  )
}

export default function Approvals() {
  const [items, setItems] = useState(data.approvals)
  const decide = (id: string, state: Approval['state']) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, state } : x)))
  const pending = items.filter((a) => a.state === 'pending')
  const done = items.filter((a) => a.state !== 'pending')
  return (
    <>
      <SectionTitle title="Approvals" subtitle={`The agent acts alone up to ${usd(5000)}. Above that, it holds the money and asks you.`} />
      <LiveQueue />
      <h2 className="pt-2 text-sm font-semibold">Example decisions</h2>
      {pending.length ? pending.map((a) => <ApprovalCard key={a.id} a={a} onDecide={decide} />)
        : <GlassCard><EmptyState icon={ShieldCheck} tone="good" title="Nothing waiting on you" hint="Every open decision is inside the agent's authority." /></GlassCard>}
      {done.length > 0 && (
        <>
          <h2 className="pt-2 text-sm font-semibold">History</h2>
          {done.map((a) => <ApprovalCard key={a.id} a={a} onDecide={decide} />)}
        </>
      )}
    </>
  )
}
