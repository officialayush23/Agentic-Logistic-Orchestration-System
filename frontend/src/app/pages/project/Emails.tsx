import { AlertOctagon, ArrowDownLeft, ArrowUpRight, BrainCircuit, Mail } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { rel, supplierById, time } from '../../data/source'
import type { EmailMessage } from '../../data/types'
import { CardHeader, EmptyState, GlassCard } from '../../ui/glass'

export function EmailThreads({ messages, title = 'Supplier email' }: { messages: EmailMessage[]; title?: string }) {
  const threads = useMemo(() => {
    const m = new Map<string, EmailMessage[]>()
    for (const e of messages) m.set(e.threadId, [...(m.get(e.threadId) ?? []), e])
    return [...m.entries()].map(([id, ms]) => ({ id, ms: ms.sort((a, b) => a.at.localeCompare(b.at)) }))
      .sort((a, b) => b.ms[b.ms.length - 1].at.localeCompare(a.ms[a.ms.length - 1].at))
  }, [messages])
  const [active, setActive] = useState(threads[0]?.id)
  const thread = threads.find((t) => t.id === active)

  if (!threads.length) return <GlassCard><EmptyState icon={Mail} title="No email yet" hint="When the agent writes to a supplier, or a supplier replies, the thread appears here." /></GlassCard>

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <GlassCard className="flex flex-col">
        <CardHeader icon={Mail} title={title} subtitle="Real SMTP out · IMAP in · read by Gemini" />
        <div className="space-y-2">
          {threads.map((t) => {
            const last = t.ms[t.ms.length - 1]
            const s = supplierById[last.supplierId]
            const flagged = t.ms.some((m) => m.flagged)
            return (
              <button key={t.id} onClick={() => setActive(t.id)}
                className={cn('w-full rounded-2xl border p-3 text-left transition-shadow hover:shadow-md hover:shadow-violet/10',
                  active === t.id ? 'border-violet/30 bg-white/80 dark:bg-white/10' : 'border-white/80 bg-white/50 dark:border-white/10 dark:bg-white/5',
                  flagged && 'ring-1 ring-crit/30')}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">{s.name}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">{rel(last.at)}</span>
                </div>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">{last.subject}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{t.ms.length} messages{flagged ? ' · contradiction flagged' : ''}</p>
              </button>
            )
          })}
        </div>
      </GlassCard>

      <GlassCard delay={0.08} className="min-w-0">
        {thread && (
          <>
            <CardHeader icon={Mail} tone="azure" title={thread.ms[0].subject} subtitle={supplierById[thread.ms[0].supplierId].name} />
            <div className="space-y-3">
              {thread.ms.map((m, i) => (
                <motion.article key={m.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}
                  className={cn('rounded-2xl border p-4', m.direction === 'outbound' ? 'ml-6 border-violet/15 bg-violet/5' : 'mr-6 border-white/80 bg-white/60 dark:border-white/10 dark:bg-white/5')}>
                  <header className="flex flex-wrap items-center gap-2 text-[11px]">
                    {m.direction === 'outbound' ? <ArrowUpRight className="size-3.5 text-violet" /> : <ArrowDownLeft className="size-3.5 text-azure" />}
                    <span className="font-semibold">{m.direction === 'outbound' ? 'Agent' : m.from}</span>
                    <span className="text-muted-foreground">{time(m.at)} · {rel(m.at)}</span>
                  </header>
                  <p className="mt-2 whitespace-pre-line text-xs leading-relaxed">{m.body}</p>
                  {m.extracted && (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground"><BrainCircuit className="size-3.5" /> Gemini extracted</span>
                      {m.extracted.map((x) => (
                        <span key={x.label} className="rounded-full bg-violet/10 px-2 py-0.5 text-[11px]"><span className="text-muted-foreground">{x.label}:</span> <b>{x.value}</b></span>
                      ))}
                    </div>
                  )}
                  {m.flagged && (
                    <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-crit/8 px-2 py-1.5 text-[11px] font-medium text-crit">
                      <AlertOctagon className="mt-px size-3.5 shrink-0" /> {m.flagged}
                    </p>
                  )}
                </motion.article>
              ))}
            </div>
          </>
        )}
      </GlassCard>
    </div>
  )
}
