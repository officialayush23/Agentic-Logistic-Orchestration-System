import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Bot, Inbox, Mail, MessageSquare, PenLine, Send, ShieldAlert, User, Warehouse } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { api } from '../data/live'
import { rel } from '../data/source'
import { StatusBadge } from '../ui/badges'
import { Callout, CardHeader, EmptyState, GlassCard, PrimaryButton, SecondaryButton, SectionTitle } from '../ui/glass'

interface Msg {
  id: number; thread_id: number; direction: 'inbound' | 'outbound'; author_type: string; author_name?: string
  body: string; delivery_state: string; is_contradiction: boolean; sent_at: string
}
interface Thread {
  id: number; incident_id?: string | null; counterparty_type: string; counterparty_id?: string | null; counterparty_name?: string | null
  subject: string; status: string; autonomy?: string; created_at: string
  messages: Msg[]; drafts: number; has_contradiction: boolean; needs_you: boolean; counterparty_staffed?: boolean
}

const FILTERS = [
  { id: 'all', label: 'All' }, { id: 'needs', label: 'Needs you' }, { id: 'supplier', label: 'Suppliers' },
  { id: 'warehouse', label: 'Warehouse' }, { id: 'flag', label: 'Contradictions' },
] as const
const AUTONOMY = [
  { id: 'autonomous', label: 'Agent sends' }, { id: 'draft', label: 'Drafts only' }, { id: 'human', label: 'Hands off' },
] as const

const lastAt = (t: Thread) => t.messages.at(-1)?.sent_at ?? t.created_at

function Bubble({ m, onSend, sending }: { m: Msg; onSend: (id: number, body?: string) => void; sending: boolean }) {
  const out = m.direction === 'outbound'
  const draft = m.delivery_state === 'draft'
  const [edit, setEdit] = useState<string | null>(null)
  const Icon = m.author_type === 'agent' ? Bot : m.author_type === 'human' ? User : m.author_type === 'warehouse' ? Warehouse : Mail
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn('flex', out ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm',
        out ? 'rounded-br-md bg-primary/12 ring-1 ring-primary/20' : 'glass rounded-bl-md',
        m.is_contradiction && 'ring-2 ring-crit/50', draft && 'border border-dashed border-primary/40 bg-transparent')}>
        <p className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Icon className="size-3" /> {m.author_name ?? m.author_type} · {rel(m.sent_at)}
          {draft && <StatusBadge tone="violet">draft · not sent</StatusBadge>}
          {m.is_contradiction && <StatusBadge tone="crit" dot>flagged</StatusBadge>}
          {!draft && out && m.delivery_state !== 'sent' && <span>· {m.delivery_state.replace('_', ' ')}</span>}
        </p>
        {edit === null ? <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
          : <textarea value={edit} onChange={(e) => setEdit(e.target.value)} rows={5} className="glass w-full rounded-xl p-2 text-sm outline-none" />}
        {draft && (
          <div className="mt-2 flex gap-2">
            <PrimaryButton icon={false} disabled={sending} onClick={() => onSend(m.id, edit ?? undefined)}><Send className="size-3.5" />Send</PrimaryButton>
            {edit === null && <SecondaryButton onClick={() => setEdit(m.body)}><PenLine className="size-3.5" />Edit</SecondaryButton>}
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default function Messages() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['threads-comms'], queryFn: () => api<{ threads: Thread[] }>('/api/threads'), refetchInterval: 4000, retry: 4 })
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const [picked, setPicked] = useState<number | null>(null)
  const [text, setText] = useState('')

  const threads = useMemo(() => (q.data?.threads ?? []).slice().sort((a, b) => +new Date(lastAt(b)) - +new Date(lastAt(a))), [q.data])
  const shown = threads.filter((t) => filter === 'all' ? true : filter === 'needs' ? t.needs_you
    : filter === 'flag' ? t.has_contradiction : t.counterparty_type === filter)
  const sel = threads.find((t) => t.id === picked) ?? shown[0]
  const refresh = () => qc.invalidateQueries({ queryKey: ['threads-comms'] })

  const send = useMutation({
    mutationFn: ({ id, body }: { id: number; body?: string }) => api(`/api/threads/messages/${id}/send`, { method: 'POST', body: JSON.stringify({ body, sent_by: 'operator' }) }),
    onSuccess: () => { toast.success('Draft released'); refresh() }, onError: (e) => toast.error((e as Error).message.slice(0, 160)),
  })
  const reply = useMutation({
    mutationFn: (body: string) => api('/api/threads/message', { method: 'POST', body: JSON.stringify({ thread_id: sel!.id, body, incident_id: sel!.incident_id }) }),
    onSuccess: () => { setText(''); refresh() }, onError: (e) => toast.error((e as Error).message.slice(0, 160)),
  })
  const autonomy = useMutation({
    mutationFn: (mode: string) => api(`/api/threads/${sel!.id}/autonomy`, { method: 'POST', body: JSON.stringify({ mode }) }),
    onSuccess: (_, m) => { toast.success(`Thread set to: ${AUTONOMY.find((a) => a.id === m)?.label}`); refresh() },
  })

  const activity = useMemo(() => threads.flatMap((t) => t.messages.map((m) => ({ ...m, who: t.counterparty_name ?? t.subject })))
    .sort((a, b) => +new Date(b.sent_at) - +new Date(a.sent_at)).slice(0, 40), [threads])
  const counts = { needs: threads.filter((t) => t.needs_you).length, flag: threads.filter((t) => t.has_contradiction).length }

  return (
    <div className="space-y-5">
      <SectionTitle title="Messages" subtitle="Every conversation the agents have with suppliers, the warehouse and carriers: what was sent, what came back, what it was read as. Updates every few seconds." />
      {q.isError && <Callout lead="Backend not reachable.">Conversations load from the API once it is awake.</Callout>}
      <div className="grid gap-5 xl:h-[calc(100dvh-11rem)] xl:grid-cols-[320px_1fr_320px]">
        <GlassCard className="flex flex-col xl:max-h-full">
          <CardHeader icon={Inbox} tone="violet" title="Conversations" subtitle={`${threads.length} threads · ${counts.needs} need you · ${counts.flag} flagged`} />
          <div className="mb-3 flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={cn('rounded-full px-2.5 py-1 text-xs', filter === f.id ? 'bg-primary/15 ring-1 ring-primary/30' : 'glass')}>{f.label}</button>
            ))}
          </div>
          <div className="scrollbar-thin -mx-1 min-h-0 flex-1 space-y-1 overflow-y-auto px-1">
            {shown.map((t) => {
              const last = t.messages.at(-1)
              return (
                <button key={t.id} onClick={() => setPicked(t.id)}
                  className={cn('w-full rounded-xl px-3 py-2 text-left transition', sel?.id === t.id ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-white/40 dark:hover:bg-white/5')}>
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold">{t.counterparty_name ?? t.counterparty_id ?? t.counterparty_type}</p>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{rel(lastAt(t))}</span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{last ? `${last.direction === 'inbound' ? '← ' : '→ '}${last.body.split('\n')[0]}` : t.subject}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {t.incident_id && <StatusBadge tone="violet">{t.incident_id}</StatusBadge>}
                    {t.needs_you && <StatusBadge tone="rose" dot>needs you</StatusBadge>}
                    {t.drafts > 0 && <StatusBadge tone="azure">{t.drafts} draft</StatusBadge>}
                    {t.has_contradiction && <StatusBadge tone="crit">flagged</StatusBadge>}
                  </div>
                </button>
              )
            })}
            {!shown.length && <EmptyState icon={MessageSquare} title="No conversations" hint="Run a scenario or deliver an email in the Simulation Lab." />}
          </div>
        </GlassCard>

        <GlassCard className="flex flex-col xl:max-h-full">
          {sel ? (
            <>
              <CardHeader icon={sel.counterparty_type === 'warehouse' ? Warehouse : Mail} tone="azure"
                title={sel.counterparty_name ?? sel.counterparty_type} subtitle={`${sel.subject}${sel.incident_id ? ` · ${sel.incident_id}` : ''} · ${sel.status.replace('_', ' ')}`}
                action={
                  <div className="flex gap-1">
                    {AUTONOMY.map((a) => (
                      <button key={a.id} onClick={() => autonomy.mutate(a.id)} title="Who may write on this thread"
                        className={cn('rounded-full px-2.5 py-1 text-[11px]', (sel.autonomy ?? 'autonomous') === a.id ? 'bg-primary/15 ring-1 ring-primary/30' : 'glass')}>{a.label}</button>
                    ))}
                  </div>
                } />
              {sel.has_contradiction && (
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-crit/10 px-3 py-2 text-xs ring-1 ring-crit/30">
                  <ShieldAlert className="size-4 text-crit" /> Something on this thread contradicts what the agents can verify (carrier scan, payee on file). Money does not move on it.
                </div>
              )}
              <div className="scrollbar-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
                {sel.messages.map((m) => <Bubble key={m.id} m={m} onSend={(id, body) => send.mutate({ id, body })} sending={send.isPending} />)}
              </div>
              <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) reply.mutate(text.trim()) }}>
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Write to ${sel.counterparty_name ?? 'them'} as the operator…`}
                  className="glass h-10 min-w-0 flex-1 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
                <PrimaryButton type="submit" icon={false} disabled={reply.isPending}><Send className="size-4" /></PrimaryButton>
              </form>
            </>
          ) : <EmptyState icon={MessageSquare} title="Pick a conversation" hint="Agent messages, supplier replies and inbound email land here." />}
        </GlassCard>

        <GlassCard className="flex flex-col xl:max-h-full">
          <CardHeader icon={AlertTriangle} tone="warn" title="Live updates" subtitle="Newest messages across every thread" />
          <ol className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 text-xs">
            {activity.map((m) => (
              <li key={m.id}>
                <button onClick={() => setPicked(m.thread_id)} className="w-full rounded-xl px-2 py-1.5 text-left hover:bg-white/40 dark:hover:bg-white/5">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <span className={cn('size-1.5 rounded-full', m.is_contradiction ? 'bg-crit' : m.direction === 'inbound' ? 'bg-azure' : m.delivery_state === 'draft' ? 'bg-violet' : 'bg-good')} />
                    {m.direction === 'inbound' ? `${m.who} replied` : m.delivery_state === 'draft' ? `Draft to ${m.who}` : `${m.author_name ?? 'Agent'} → ${m.who}`}
                    <span className="ml-auto font-normal text-muted-foreground">{rel(m.sent_at)}</span>
                  </p>
                  <p className="line-clamp-2 text-muted-foreground">{m.body}</p>
                </button>
              </li>
            ))}
            {!activity.length && <li className="text-muted-foreground">No messages yet.</li>}
          </ol>
        </GlassCard>
      </div>
    </div>
  )
}
