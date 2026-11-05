import { CheckCircle2, KeyRound, Lock, ShieldCheck, XCircle } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState } from 'react'
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

export default function Approvals() {
  const [items, setItems] = useState(data.approvals)
  const decide = (id: string, state: Approval['state']) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, state } : x)))
  const pending = items.filter((a) => a.state === 'pending')
  const done = items.filter((a) => a.state !== 'pending')
  return (
    <>
      <SectionTitle title="Approvals" subtitle={`The agent acts alone up to ${usd(5000)}. Above that, it holds the money and asks you.`} />
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
