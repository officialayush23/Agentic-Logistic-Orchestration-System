import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import {
  ArrowRight, CheckCircle2, CircleHelp, Clock3, Eye, TriangleAlert,
} from 'lucide-react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

/**
 * Attention required.
 *
 * Four lines at the top of the overview, in the order a person should read
 * them. It answers "what do I do next" before any chart does, which is the
 * question an operator actually arrives with — every dashboard below it answers
 * "what is true", and that is a different and later question.
 *
 * The four are deliberately distinct kinds of thing, not four severities of one
 * thing:
 *
 *   critical — a line stops soon. Time is the scarce resource.
 *   blocked  — the agent stopped and cannot continue without you.
 *   waiting  — you owe someone a decision, but nothing is stalled on it yet.
 *   watch    — nothing to do; here is what would change that.
 *
 * A line with a count of zero still renders, greyed. Hiding satisfied rows
 * makes the card jump around as state changes and — worse — removes the
 * evidence that the thing was checked at all. "0 blocked" is information.
 */

const ROWS = [
  {
    key: 'critical', icon: TriangleAlert, label: 'Critical',
    tone: 'text-danger', ring: 'border-danger/45 bg-danger/[0.07]',
    blurb: 'production stops soonest',
  },
  {
    key: 'blocked', icon: CircleHelp, label: 'Blocked on you',
    tone: 'text-danger', ring: 'border-danger/40 bg-danger/[0.05]',
    blurb: 'the agent refused to guess',
  },
  {
    key: 'waiting', icon: Clock3, label: 'Waiting for a decision',
    tone: 'text-warn', ring: 'border-warn/40 bg-warn/[0.05]',
    blurb: 'past the agent’s authority',
  },
  {
    key: 'watch', icon: Eye, label: 'Worth watching',
    tone: 'text-info', ring: 'border-info/35 bg-info/[0.04]',
    blurb: 'not urgent yet',
  },
]

export default function AttentionCard({ onGoto }) {
  const { data: now } = useQuery({ queryKey: ['now'], queryFn: api.now })

  if (now?.has_run !== true) return null

  const queue = now?.queue ?? []
  const worst = now?.worst ?? null
  const cover = now?.min_coverage_days ?? null

  const approvals = queue.filter((q) => q.kind === 'approval')
  const questions = queue.filter((q) => q.kind === 'question')
  const others = queue.filter((q) => !['approval', 'question'].includes(q.kind))

  // `critical` is about time, not about queue length: a line that stops in
  // under three days outranks anything sitting in an inbox.
  const critical = now?.production_at_risk && cover != null && cover < 3
  const items = {
    critical: critical
      ? {
          n: 1,
          text: cover <= 0
            ? `${worst?.component_name ?? 'A line'} has already run out — every hour from here is lost output.`
            : `${worst?.component_name ?? 'A line'} stops in ${cover.toFixed(1)} days.`,
          detail: worst
            ? `${worst.oem_customer ?? 'customer'} · short ${worst.shortfall}`
            : null,
          goto: 'recovery', cta: 'Open recovery',
        }
      : { n: 0, text: 'No line stops within three days.' },

    blocked: questions.length
      ? {
          n: questions.length,
          text: questions[0].title,
          detail: questions.length > 1
            ? `and ${questions.length - 1} more the agent would not answer for you`
            : questions[0].detail,
          goto: 'questions', cta: 'Answer it',
        }
      : { n: 0, text: 'The agent is not blocked on anything.' },

    waiting: approvals.length
      ? {
          n: approvals.length,
          text: approvals[0].title,
          detail: approvals[0].cost
            ? `₹${Number(approvals[0].cost).toLocaleString('en-IN')} — past the authority line`
            : approvals[0].detail,
          goto: 'approvals', cta: 'Review',
        }
      : { n: 0, text: 'Nothing is waiting on your signature.' },

    watch: others.length
      ? {
          n: others.length,
          text: others[0].title,
          detail: others.length > 1 ? `and ${others.length - 1} more` : others[0].detail,
          goto: 'comms', cta: 'Look',
        }
      : {
          n: 0,
          text: now?.production_at_risk
            ? 'Recovery is under way. Nothing else needs a person yet.'
            : 'Every component is covered.',
        },
  }

  const anything = ROWS.some((r) => items[r.key].n > 0)

  return (
    <motion.div layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                className="glass overflow-hidden rounded-xl">
      <div className="flex items-center gap-2 border-b px-5 py-3">
        <span className="text-muted-foreground text-[10px] font-medium
                         tracking-[0.14em] uppercase">Attention required</span>
        {!anything && (
          <Badge variant="outline" className="border-ok/45 bg-ok/10 text-ok gap-1 text-[9.5px]">
            <CheckCircle2 className="size-2.5" />all clear
          </Badge>
        )}
        <span className="text-muted-foreground/70 ml-auto text-[10.5px]">
          in the order a person should read them
        </span>
      </div>

      <div className="divide-y">
        {ROWS.map((row) => {
          const it = items[row.key]
          const Icon = row.icon
          const live = it.n > 0
          return (
            <div key={row.key}
                 className={`flex items-start gap-3 px-5 py-3 ${live ? row.ring : ''}`}>
              <Icon className={`mt-0.5 size-3.5 shrink-0
                ${live ? row.tone : 'text-muted-foreground/40'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-medium tracking-wide
                    ${live ? '' : 'text-muted-foreground/60'}`}>{row.label}</span>
                  <span className={`font-mono text-[11px] tabular-nums
                    ${live ? row.tone : 'text-muted-foreground/40'}`}>{it.n}</span>
                  <span className="text-muted-foreground/50 text-[10px]">{row.blurb}</span>
                </div>
                <div className={`mt-0.5 truncate text-[12.5px]
                  ${live ? '' : 'text-muted-foreground/60'}`}>{it.text}</div>
                {live && it.detail && (
                  <div className="text-muted-foreground mt-0.5 truncate text-[11px]">
                    {it.detail}
                  </div>
                )}
              </div>
              {live && it.goto && (
                <Button size="sm" variant="ghost" className="h-7 shrink-0 gap-1 text-[11px]"
                        onClick={() => onGoto?.(it.goto)}>
                  {it.cta}<ArrowRight className="size-3" />
                </Button>
              )}
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}
