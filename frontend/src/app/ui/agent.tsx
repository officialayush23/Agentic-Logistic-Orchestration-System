import { Ban, Bot, BrainCircuit, CheckCircle2, Loader2, Sparkles, UserCheck, Wallet } from 'lucide-react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { projectById, rel, shortDate, supplierById, usd } from '../data/source'
import type { AgentStep, Incident, RecoveryOption } from '../data/types'
import { SeverityBadge, StageBadge, StatusBadge } from './badges'

const byIcon: Record<AgentStep['by'], typeof Bot> = { agent: Bot, llm: BrainCircuit, human: UserCheck, paypal: Wallet }
const byLabel: Record<AgentStep['by'], string> = { agent: 'Solver', llm: 'Gemini', human: 'Human', paypal: 'PayPal' }
const statusTone: Record<AgentStep['status'], string> = {
  done: 'text-good', warning: 'text-warn', blocked: 'text-crit', error: 'text-crit', running: 'text-violet',
}

export function StepTrail({ steps }: { steps: AgentStep[] }) {
  return (
    <ol className="space-y-1.5">
      {steps.map((s, i) => {
        const Icon = byIcon[s.by]
        return (
          <motion.li key={i} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}
            className="flex items-start gap-2.5 rounded-xl bg-white/50 px-3 py-2 dark:bg-white/5">
            <span className={cn('mt-0.5', statusTone[s.status])}>
              {s.status === 'running' ? <Loader2 className="size-3.5 animate-spin" /> : s.status === 'blocked' ? <Ban className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
            </span>
            <span className="min-w-0 flex-1 text-xs leading-relaxed">{s.label}</span>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-violet/8 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              <Icon className="size-3" /> {byLabel[s.by]}
            </span>
            <span className="w-14 shrink-0 text-right text-[11px] text-muted-foreground">{rel(s.at)}</span>
          </motion.li>
        )
      })}
    </ol>
  )
}

export function OptionsTable({ options }: { options: RecoveryOption[] }) {
  if (!options.length) return null
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3">Option</th><th className="pr-3">Supplier</th><th className="pr-3">Mode</th>
            <th className="pr-3 text-right">Cost</th><th className="pr-3">Arrives</th><th className="pr-3 text-right">Score</th><th>Solver verdict</th>
          </tr>
        </thead>
        <tbody>
          {options.map((o) => (
            <tr key={o.label} className="border-b border-white/60 align-top hover:bg-white/50 dark:border-white/10 dark:hover:bg-white/5">
              <td className="py-2.5 pr-3 font-semibold">{o.label}</td>
              <td className="pr-3">{supplierById[o.supplierId]?.name}</td>
              <td className="pr-3">{o.mode}</td>
              <td className="pr-3 text-right tabular-nums">{usd(o.costUsd)}</td>
              <td className="pr-3 tabular-nums">{shortDate(o.arrivesAt)}</td>
              <td className="pr-3 text-right font-semibold tabular-nums">{o.score.toFixed(2)}</td>
              <td className="max-w-xs">
                <StatusBadge tone={o.verdict === 'chosen' ? 'good' : o.verdict === 'rejected' ? 'crit' : 'muted'}>{o.verdict}</StatusBadge>
                <p className="mt-1 text-[11px] text-muted-foreground">{o.reason}</p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function IncidentCard({ incident, expanded = true }: { incident: Incident; expanded?: boolean }) {
  const p = projectById[incident.projectId]
  return (
    <article className={cn('rounded-2xl border border-white/80 bg-white/60 p-4 dark:border-white/10 dark:bg-white/5', incident.severity === 'critical' && 'ring-1 ring-crit/30')}>
      <header className="flex flex-wrap items-center gap-2">
        <SeverityBadge level={incident.severity} />
        <StageBadge stage={incident.stage} />
        <span className="text-[11px] text-muted-foreground">{incident.id} · {incident.scenario} · opened {rel(incident.openedAt)}</span>
        {incident.amountUsd > 0 && <span className="ml-auto text-xs font-semibold tabular-nums">{usd(incident.amountUsd)}</span>}
      </header>
      <h3 className="mt-2 text-sm font-semibold leading-snug">{incident.title}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{p?.name} · {supplierById[incident.supplierId]?.name}</p>
      {expanded && (
        <>
          <div className="mt-3"><StepTrail steps={incident.steps} /></div>
          {incident.options.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground"><Sparkles className="size-3.5" /> Options the solver compared</p>
              <OptionsTable options={incident.options} />
            </div>
          )}
        </>
      )}
    </article>
  )
}
