import { useMutation, useQuery } from '@tanstack/react-query'
import {
  BadgeDollarSign, Bot, BrainCircuit, CheckCircle2, Eye, Gavel, MailCheck, Network, PackageCheck, Radar, Search,
  Send, ShieldCheck, Sparkles, XCircle, type LucideIcon,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { api, live } from '../data/live'
import { data, rel } from '../data/source'
import { StatusBadge } from '../ui/badges'
import { Callout, CardHeader, EmptyState, GlassCard, Pill, PrimaryButton, SecondaryButton, SectionTitle } from '../ui/glass'

interface Agent { id: string; role: string }
interface Overview { enabled: boolean; memory: string; agents: Agent[] }
interface Trail { agent: string; action: string; at: string }
interface Thread {
  thread_id: string; next: string[]; waiting_for_human: boolean; running: boolean; memory: string
  interrupts: { action?: string; estimated_cost_inr?: number; narrative?: string }[]
  values: {
    phase?: string; trigger?: string; turns?: number; trail?: Trail[]; recalled?: string[]
    money?: { po_id: string; state: string; amount_usd?: number; captured_usd?: number; credit_usd?: number }[]
    guard_verdicts?: { guard: string; outcome: string; reason: string; amount_usd: number }[]
    plan?: { label?: string; score?: number; options?: number; rejections?: number; requires_approval?: boolean }
  }
}

const META: Record<string, { icon: LucideIcon; tone: string; title: string }> = {
  supervisor: { icon: Network, tone: 'text-primary', title: 'Supervisor' },
  sentinel: { icon: Radar, tone: 'text-azure', title: 'Sentinel' },
  investigator: { icon: Search, tone: 'text-violet', title: 'Investigator' },
  liaison: { icon: MailCheck, tone: 'text-azure', title: 'Liaison' },
  sourcing: { icon: BrainCircuit, tone: 'text-violet', title: 'Sourcing' },
  approval: { icon: Gavel, tone: 'text-rose', title: 'Approval' },
  procurement: { icon: PackageCheck, tone: 'text-good', title: 'Procurement' },
  treasurer: { icon: BadgeDollarSign, tone: 'text-good', title: 'Treasurer' },
  verifier: { icon: Eye, tone: 'text-warn', title: 'Verifier' },
  copilot: { icon: Sparkles, tone: 'text-primary', title: 'Copilot' },
}
const SPECIALISTS = ['sentinel', 'investigator', 'liaison', 'sourcing', 'approval', 'procurement', 'treasurer', 'verifier']

function TeamGraph({ active }: { active?: string }) {
  const R = 118, cx = 170, cy = 150
  return (
    <svg viewBox="0 0 340 300" className="h-[300px] w-full" role="img" aria-label="Supervisor routing to eight specialist agents">
      {SPECIALISTS.map((a, i) => {
        const t = (i / SPECIALISTS.length) * Math.PI * 2 - Math.PI / 2
        const x = cx + R * Math.cos(t), y = cy + R * Math.sin(t)
        const on = active === a
        return (
          <g key={a}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="currentColor" className={on ? 'text-primary' : 'text-border'} strokeWidth={on ? 2.5 : 1.2} strokeDasharray={on ? '0' : '4 4'} />
            <circle cx={x} cy={y} r={on ? 27 : 23} className={cn('fill-card stroke-current', on ? 'text-primary' : 'text-border')} strokeWidth={on ? 2.5 : 1.2} />
            <text x={x} y={y + 4} textAnchor="middle" className="fill-foreground text-[9px] font-semibold">{META[a].title}</text>
          </g>
        )
      })}
      <circle cx={cx} cy={cy} r={36} className="fill-primary/15 stroke-primary" strokeWidth={2} />
      <text x={cx} y={cy + 4} textAnchor="middle" className="fill-foreground text-[10px] font-bold">Supervisor</text>
    </svg>
  )
}

function Copilot() {
  const [q, setQ] = useState('')
  const [log, setLog] = useState<{ who: 'you' | 'copilot'; text: string; tools?: string[] }[]>([])
  const ask = useMutation({
    mutationFn: (question: string) => api<{ answer: string; tools_used: string[] }>('/api/copilot', { method: 'POST', body: JSON.stringify({ question }) }),
    onSuccess: (r) => setLog((l) => [...l, { who: 'copilot', text: r.answer, tools: r.tools_used }]),
    onError: (e) => setLog((l) => [...l, { who: 'copilot', text: `Unavailable: ${(e as Error).message}` }]),
  })
  const send = (text = q) => { if (!text.trim()) return; setLog((l) => [...l, { who: 'you', text }]); setQ(''); ask.mutate(text) }
  return (
    <GlassCard className="flex h-full flex-col">
      <CardHeader icon={Sparkles} tone="violet" title="Copilot" subtitle="Gemini ReAct agent · read-only tools · remembers this conversation" />
      <div className="min-h-48 flex-1 space-y-2 overflow-y-auto text-sm">
        {log.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {['How much has the Buyer Shield protected?', 'Which supplier should we trust least, and why?', 'Is anything waiting for my approval?'].map((s) => (
              <button key={s} onClick={() => send(s)} className="glass rounded-full px-3 py-1 text-xs hover:ring-1 hover:ring-ring">{s}</button>
            ))}
          </div>
        )}
        {log.map((m, i) => (
          <div key={i} className={cn('rounded-xl px-3 py-2', m.who === 'you' ? 'ml-8 bg-primary/10' : 'glass mr-4')}>
            <p className="whitespace-pre-wrap">{m.text}</p>
            {!!m.tools?.length && <p className="mt-1 text-[11px] text-muted-foreground">tools: {m.tools.join(' · ')}</p>}
          </div>
        ))}
        {ask.isPending && <p className="text-xs text-muted-foreground">Copilot is thinking…</p>}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); send() }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about projects, money, suppliers…"
          className="glass h-10 min-w-0 flex-1 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <PrimaryButton type="submit" icon={false} disabled={ask.isPending}><Send className="size-4" /></PrimaryButton>
      </form>
    </GlassCard>
  )
}

export default function AgentTeam() {
  const threads = live.incidents.length ? live.incidents.map((i) => ({ id: i.id, title: i.title, at: i.openedAt }))
    : data.incidents.map((i) => ({ id: i.id, title: i.title, at: i.openedAt }))
  const [sel, setSel] = useState<string>(threads[0]?.id ?? 'patrol:NEXA')
  const [custom, setCustom] = useState('')

  const overview = useQuery({ queryKey: ['agents'], queryFn: () => api<Overview>('/api/agents'), enabled: live.mode === 'live' })
  const thread = useQuery({
    queryKey: ['thread', sel], queryFn: () => api<Thread>(`/api/agents/threads/${encodeURIComponent(sel)}`),
    enabled: live.mode === 'live' && !!sel, refetchInterval: (q) => (q.state.data?.running ? 2000 : 8000),
  })
  const history = useQuery({
    queryKey: ['history', sel], queryFn: () => api<{ checkpoints: unknown[] }>(`/api/agents/threads/${encodeURIComponent(sel)}/history?limit=100`),
    enabled: live.mode === 'live' && !!sel,
  })
  const decide = useMutation({
    mutationFn: (decision: 'approve' | 'reject') => api(`/api/agent/resume/${encodeURIComponent(sel)}`, { method: 'POST', body: JSON.stringify({ decision, note: 'from Agent Team' }) }),
    onSuccess: (_, d) => { toast.success(`Plan ${d}d; the team resumes the thread`); setTimeout(() => thread.refetch(), 800) },
    onError: (e) => toast.error((e as Error).message),
  })
  const patrol = useMutation({
    mutationFn: () => api('/api/agents/patrol', { method: 'POST' }),
    onSuccess: () => { setSel('patrol:NEXA'); toast.success('Sentinel patrol finished') },
    onError: (e) => toast.error((e as Error).message),
  })

  const v = thread.data?.values ?? {}
  const trail = v.trail ?? []
  const lastAgent = [...trail].reverse().find((t) => t.agent !== 'supervisor')?.agent

  return (
    <div className="space-y-5">
      <SectionTitle title="Agent Team" subtitle="LangGraph multi-agent system: a supervisor routes every turn to one of eight specialists. Each incident is a checkpointed thread."
        action={<div className="flex items-center gap-2">
          <Pill>memory · {overview.data?.memory ?? (live.mode === 'live' ? '…' : 'offline')}</Pill>
          <SecondaryButton onClick={() => patrol.mutate()} disabled={patrol.isPending || live.mode !== 'live'}>
            <Radar className="size-4" /> {patrol.isPending ? 'Patrolling…' : 'Run Sentinel patrol'}
          </SecondaryButton>
        </div>} />

      {live.mode !== 'live' && (
        <Callout lead="Backend not reachable.">The team runs on the API ({live.reason}). Open this page once the backend has woken up.</Callout>
      )}

      <div className="grid gap-5 xl:grid-cols-[340px_1fr_380px]">
        <div className="space-y-5">
          <GlassCard>
            <CardHeader icon={Network} tone="violet" title="The team" subtitle={lastAgent ? `last turn: ${META[lastAgent]?.title}` : 'supervisor + 8 specialists'} />
            <TeamGraph active={thread.data?.running ? lastAgent : thread.data?.next?.[0] ?? lastAgent} />
            <ul className="mt-2 space-y-1.5 text-xs">
              {(overview.data?.agents ?? []).map((a) => {
                const M = META[a.id]
                return M && (
                  <li key={a.id} className="flex gap-2"><M.icon className={cn('mt-0.5 size-3.5 shrink-0', M.tone)} />
                    <span><b>{M.title}</b> · <span className="text-muted-foreground">{a.role}</span></span></li>
                )
              })}
            </ul>
          </GlassCard>
          <GlassCard>
            <CardHeader icon={Bot} tone="azure" title="Threads" subtitle="one per incident · plus patrol and payee threads" />
            <div className="space-y-1">
              {[...threads, { id: 'patrol:NEXA', title: 'Sentinel patrol', at: '' }].map((t) => (
                <button key={t.id} onClick={() => setSel(t.id)}
                  className={cn('w-full rounded-xl px-3 py-2 text-left text-xs transition', sel === t.id ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-white/30 dark:hover:bg-white/5')}>
                  <b>{t.id}</b> <span className="text-muted-foreground">· {t.title}</span>
                  {t.at && <span className="block text-[11px] text-muted-foreground">{rel(t.at)}</span>}
                </button>
              ))}
            </div>
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (custom) setSel(custom) }}>
              <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="thread id (INC-…, po:…, payee:…)"
                className="glass h-9 min-w-0 flex-1 rounded-xl px-3 text-xs outline-none" />
              <SecondaryButton type="submit">Open</SecondaryButton>
            </form>
          </GlassCard>
        </div>

        <GlassCard>
          <CardHeader icon={BrainCircuit} tone="violet" title={`Thread ${sel}`}
            subtitle={`phase ${v.phase ?? '—'} · ${v.turns ?? 0} turns · ${history.data?.checkpoints.length ?? 0} checkpoints`}
            action={thread.data?.waiting_for_human ? <StatusBadge tone="rose" dot>waiting for you</StatusBadge>
              : thread.data?.running ? <StatusBadge tone="azure" dot>running</StatusBadge> : <StatusBadge tone="violet">{v.trigger ?? 'idle'}</StatusBadge>} />

          {thread.data?.waiting_for_human && (
            <div className="mb-4 rounded-2xl bg-rose/10 p-4 ring-1 ring-rose/30">
              <p className="text-sm font-semibold">Approval agent paused the graph (LangGraph interrupt)</p>
              <p className="mt-1 text-sm">{thread.data.interrupts[0]?.action}
                {thread.data.interrupts[0]?.estimated_cost_inr ? ` · ₹${Math.round(thread.data.interrupts[0].estimated_cost_inr).toLocaleString('en-IN')}` : ''}</p>
              {thread.data.interrupts[0]?.narrative && <p className="mt-1 text-xs text-muted-foreground">{thread.data.interrupts[0].narrative}</p>}
              <div className="mt-3 flex gap-2">
                <PrimaryButton icon={false} onClick={() => decide.mutate('approve')} disabled={decide.isPending}><CheckCircle2 className="size-4" /> Approve</PrimaryButton>
                <SecondaryButton onClick={() => decide.mutate('reject')} disabled={decide.isPending}><XCircle className="size-4" /> Reject &amp; replan</SecondaryButton>
              </div>
            </div>
          )}

          {!trail.length ? (
            <EmptyState icon={Bot} title="No turns yet" hint={live.mode === 'live' ? 'Start a scenario in the Simulation Lab or run a patrol; turns stream in here.' : 'Connect the backend to see live threads.'} />
          ) : (
            <ol className="relative space-y-2 border-l border-border/60 pl-4">
              {trail.map((t, i) => {
                const M = META[t.agent] ?? META.supervisor
                return (
                  <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 20) * 0.02 }}
                    className={cn('relative text-sm', t.agent === 'supervisor' && 'text-xs text-muted-foreground')}>
                    <span className="absolute -left-[22px] top-1 grid size-3 place-items-center rounded-full bg-card ring-2 ring-current"><span className={cn('size-1.5 rounded-full bg-current', M.tone)} /></span>
                    <span className={cn('mr-2 inline-flex items-center gap-1 font-semibold', M.tone)}><M.icon className="size-3.5" />{M.title}</span>
                    {t.action}
                  </motion.li>
                )
              })}
            </ol>
          )}

          {(v.recalled?.length || v.money?.length || v.guard_verdicts?.length) ? (
            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              <div className="glass rounded-2xl p-3 text-xs">
                <p className="mb-1.5 font-semibold">Long-term memory used</p>
                {(v.recalled ?? []).map((r, i) => <p key={i} className="text-muted-foreground">• {r}</p>)}
                {!v.recalled?.length && <p className="text-muted-foreground">nothing recalled this run</p>}
              </div>
              <div className="glass rounded-2xl p-3 text-xs">
                <p className="mb-1.5 font-semibold">PayPal actions (Treasurer)</p>
                {(v.money ?? []).map((mm, i) => <p key={i}><b>{mm.po_id}</b> · {mm.state}{mm.amount_usd ? ` · $${Number(mm.amount_usd).toLocaleString()}` : ''}</p>)}
              </div>
              <div className="glass rounded-2xl p-3 text-xs">
                <p className="mb-1.5 flex items-center gap-1 font-semibold"><ShieldCheck className="size-3.5" />Guard verdicts</p>
                {(v.guard_verdicts ?? []).filter((g) => g.outcome !== 'pass').map((g, i) => <p key={i}><b>{g.guard}</b> · {g.outcome} · {g.reason}</p>)}
              </div>
            </div>
          ) : null}
        </GlassCard>

        <Copilot />
      </div>
    </div>
  )
}
