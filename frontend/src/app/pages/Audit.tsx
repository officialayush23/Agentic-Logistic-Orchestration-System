import { BrainCircuit, ScrollText, Search, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'
import { data, projectById, rel, supplierById, time } from '../data/source'
import { StatusBadge, type RingTone } from '../ui/badges'
import { CardHeader, EmptyState, GlassCard, SectionTitle } from '../ui/glass'

interface Entry { at: string; source: 'agent' | 'gemini' | 'paypal' | 'human' | 'email'; text: string; projectId: string; ref: string }
const tone: Record<Entry['source'], RingTone> = { agent: 'violet', gemini: 'rose', paypal: 'azure', human: 'good', email: 'muted' }

const suggestions = ['every time SUP-21 lied and the refund that followed', 'holds voided this week', 'approvals over the limit', 'uncertified quotes rejected']

function buildEntries(): Entry[] {
  const out: Entry[] = []
  for (const i of data.incidents) for (const s of i.steps)
    out.push({ at: s.at, source: s.by === 'llm' ? 'gemini' : s.by === 'paypal' ? 'paypal' : s.by === 'human' ? 'human' : 'agent', text: `${s.label} — ${supplierById[i.supplierId].name} (${i.supplierId})`, projectId: i.projectId, ref: i.id })
  for (const p of data.payments) for (const e of p.events)
    out.push({ at: e.at, source: 'paypal', text: `${e.type}: ${e.detail} — ${supplierById[p.supplierId].name} (${p.supplierId}) · ${p.id}`, projectId: p.projectId, ref: p.poId })
  for (const m of data.emails)
    out.push({ at: m.at, source: 'email', text: `${m.direction === 'inbound' ? 'From' : 'To'} ${supplierById[m.supplierId].name} (${m.supplierId}): ${m.subject}${m.flagged ? ' — ' + m.flagged : ''}`, projectId: m.projectId, ref: m.threadId })
  return out.sort((a, b) => b.at.localeCompare(a.at))
}

// Stand-in for pgvector semantic search: token overlap with a few synonyms, so
// "lied" finds "contradicted", "refund" finds "voided". Replaced by the backend.
const synonyms: Record<string, string[]> = {
  lied: ['contradict', 'lie', 'claim', 'never collected', 'mismatch'], lie: ['contradict', 'claim'],
  refund: ['refund', 'void', 'pulled back'], voided: ['void'], approvals: ['approv', 'limit'], uncertified: ['certif', 'aec-q100', 'iso 26262'],
}
function score(q: string, text: string) {
  const t = text.toLowerCase()
  return q.toLowerCase().split(/\s+/).filter((w) => w.length > 2).reduce((a, w) => {
    const keys = [w, ...(synonyms[w] ?? [])]
    return a + (keys.some((k) => t.includes(k)) ? (w.match(/sup-\d+/) ? 3 : 1) : 0)
  }, 0)
}

export default function Audit() {
  const all = useMemo(buildEntries, [])
  const [q, setQ] = useState('')
  const results = useMemo(() => {
    if (!q.trim()) return all
    return all.map((e) => ({ e, s: score(q, e.text) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || b.e.at.localeCompare(a.e.at)).map((x) => x.e)
  }, [q, all])

  return (
    <>
      <SectionTitle title="Audit & Search" subtitle="Every step the agent took, every Gemini read, every PayPal event — searchable in plain English" />
      <GlassCard>
        <label className="glass flex h-12 items-center gap-2 rounded-2xl px-4">
          <Sparkles className="size-4 text-violet" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask: show me every time SUP-21 lied and the refund that followed"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          <Search className="size-4 text-muted-foreground" />
        </label>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button key={s} onClick={() => setQ(s)} className="rounded-full bg-violet/10 px-2.5 py-1 text-[11px] font-medium text-violet hover:bg-violet/15">{s}</button>
          ))}
        </div>
      </GlassCard>
      <GlassCard delay={0.1}>
        <CardHeader icon={q ? BrainCircuit : ScrollText} title={q ? `${results.length} matches` : 'Full audit trail'} subtitle={q ? 'Ranked by relevance · semantic search over the audit log' : `${all.length} entries · newest first`} />
        {results.length === 0 ? <EmptyState icon={Search} title="No matches" hint="Try a supplier id like SUP-21, or words like 'voided' or 'approval'." /> : (
          <ol className="space-y-1.5">
            {results.slice(0, 60).map((e, i) => (
              <motion.li key={`${e.ref}-${e.at}-${i}`} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }}
                className={cn('flex flex-wrap items-center gap-2 rounded-xl bg-white/50 px-3 py-2 dark:bg-white/5')}>
                <span className="w-24 shrink-0 text-[11px] tabular-nums text-muted-foreground">{time(e.at)} · {rel(e.at)}</span>
                <StatusBadge tone={tone[e.source]}>{e.source}</StatusBadge>
                <span className="min-w-0 flex-1 text-xs">{e.text}</span>
                <Link to={`/projects/${e.projectId}`} className="text-[11px] font-medium text-primary hover:underline">{projectById[e.projectId].name.split('·')[0]}</Link>
              </motion.li>
            ))}
          </ol>
        )}
      </GlassCard>
    </>
  )
}
