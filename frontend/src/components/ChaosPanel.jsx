import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import {
  Boxes, FlaskConical, Loader2, RotateCcw, Settings2, Sparkles, Zap,
} from 'lucide-react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'

/**
 * Inject a disruption, from where the person watching can see it.
 *
 * The scenario builder is more capable than this and less useful in a room: it
 * asks someone to compose an event before anything happens. This is the
 * opposite trade — four buttons, one click, immediate consequence — with the
 * builder one button away for anyone who asks "can it do more than these?".
 *
 * The row is deliberately not a dropdown. A dropdown hides what the system can
 * be made to do; a row of labelled buttons *is* the capability list, and a
 * judge reads it without being walked through it.
 *
 * `fresh` matters here more than anywhere. A scenario replayed against a world
 * a previous run already recovered finds nothing to detect, and the run scores
 * badly for reasons that have nothing to do with the agent. The backend
 * re-seeds when it sees recovery stock still inbound, and the note below says
 * so when it happens rather than leaving it silent.
 */

// The four that read best in a demo, in escalating order of "surely not".
// Everything else stays behind `More`.
const FEATURED = [
  { id: 'S1-normal-disruption', label: 'Supplier delay',
    blurb: 'the ordinary case', icon: Zap, tone: '' },
  { id: 'S2-stale-inventory', label: 'ERP is wrong',
    blurb: 'the floor disagrees', icon: Boxes, tone: 'text-warn' },
  { id: 'S3-adversarial', label: 'Supplier lies',
    blurb: 'tracking says otherwise', icon: Sparkles, tone: 'text-warn' },
  { id: 'S6-line-stop', label: 'Line stops in 12h',
    blurb: 'no good options left', icon: FlaskConical, tone: 'text-danger' },
]

export default function ChaosPanel({ onOpenBuilder, compact = false }) {
  const qc = useQueryClient()
  const [note, setNote] = useState(null)
  const { data } = useQuery({ queryKey: ['scenarios'], queryFn: api.scenarios })
  const all = data?.scenarios ?? []
  const byId = Object.fromEntries(all.map((s) => [s.id, s]))

  const inject = useMutation({
    mutationFn: (id) => api.inject(id),
    onSuccess: (out) => {
      // The backend tells us when it had to re-seed first. Saying so is the
      // difference between "the world was rebuilt" and the operator quietly
      // wondering where their previous run's purchase orders went.
      setNote(out?.world_reseeded ? out.note : null)
      qc.invalidateQueries()
    },
  })

  const reset = useMutation({
    mutationFn: () => api.reset('demo'),
    onSuccess: () => { setNote(null); qc.invalidateQueries() },
  })

  const busy = inject.isPending || reset.isPending
  const running = inject.variables

  const featured = FEATURED.filter((f) => byId[f.id])
  const rest = all.filter((s) => !FEATURED.some((f) => f.id === s.id))

  return (
    <div className={`glass rounded-xl ${compact ? 'p-3.5' : 'p-4'}`}>
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-muted-foreground text-[10px] font-medium
                         tracking-[0.14em] uppercase">Inject a disruption</span>
        <span className="text-muted-foreground/60 text-[10.5px]">
          the agent reacts on its own — nothing here tells it what to do
        </span>
        <Button variant="ghost" size="sm" disabled={busy}
                onClick={() => reset.mutate()}
                className="text-muted-foreground ml-auto h-6 gap-1 px-2 text-[10.5px]">
          {reset.isPending ? <Loader2 className="size-3 animate-spin" />
                           : <RotateCcw className="size-3" />}
          reset world
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {featured.map((f) => {
          const s = byId[f.id]
          const Icon = f.icon
          const active = busy && running === f.id
          return (
            <Tooltip key={f.id}>
              <TooltipTrigger asChild>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  disabled={busy}
                  onClick={() => inject.mutate(f.id)}
                  className="hover:bg-accent/40 disabled:opacity-50 flex flex-col
                             items-start gap-0.5 rounded-lg border px-3 py-2.5
                             text-left transition-colors">
                  <span className="flex items-center gap-1.5">
                    {active ? <Loader2 className="size-3 animate-spin" />
                            : <Icon className={`size-3 ${f.tone}`} />}
                    <span className="text-[12px] font-medium">{f.label}</span>
                  </span>
                  <span className="text-muted-foreground text-[10.5px]">{f.blurb}</span>
                </motion.button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <div className="text-[11.5px] font-medium">{s.title}</div>
                <div className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
                  {s.tests}
                </div>
                <div className="text-muted-foreground/70 mt-1 font-mono text-[10px]">
                  {s.event_count} event(s) over {s.span_sim_hours}h simulated
                </div>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        {rest.length > 0 && (
          <Badge variant="outline" className="text-muted-foreground text-[10px]">
            {rest.length} more scenario{rest.length === 1 ? '' : 's'}
          </Badge>
        )}
        <Button variant="ghost" size="sm" onClick={onOpenBuilder}
                className="text-muted-foreground h-6 gap-1 px-2 text-[10.5px]">
          <Settings2 className="size-3" />builder — or write your own
        </Button>
      </div>

      {inject.isError && (
        <div className="border-danger/40 bg-danger/10 text-danger mt-2.5 rounded-lg border
                        px-3 py-2 text-[11.5px]">
          {String(inject.error?.message || inject.error)}
        </div>
      )}

      {note && (
        <div className="text-muted-foreground mt-2.5 rounded-lg border px-3 py-2
                        text-[11px] leading-relaxed">
          {note}
        </div>
      )}
    </div>
  )
}
