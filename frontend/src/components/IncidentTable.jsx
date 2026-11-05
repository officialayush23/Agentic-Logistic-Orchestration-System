import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Filter, Search, TriangleAlert, X } from 'lucide-react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'

/**
 * Every incident, filterable.
 *
 * A seeded world and an operated one look identical until you try to narrow
 * them. Filters are cheap and they change what the screen *is*: a list of eight
 * rows is a demo fixture, the same eight rows behind severity and status chips
 * are an operator's working set. The cost is an afternoon; the impression is
 * "people use this".
 *
 * Chips rather than dropdowns for the two fields with a handful of values —
 * severity and status are the filters people reach for, and a chip shows the
 * available values without a click. Everything else is a search box, because a
 * third dropdown is worse than typing.
 *
 * Counts are shown on every chip, including zero. A filter that offers a value
 * with nothing behind it wastes a click; one that hides the value hides the
 * fact that there is nothing there, which is itself worth knowing.
 */

const SEV_TONE = {
  critical: 'border-danger/50 bg-danger/15 text-danger',
  high:     'border-warn/50 bg-warn/15 text-warn',
  medium:   'border-info/40 bg-info/10 text-info',
  low:      'border-border bg-muted text-muted-foreground',
}

const OPEN_STATUSES = new Set([
  'open', 'investigating', 'planning', 'awaiting_approval', 'executing', 'verifying',
])

export default function IncidentTable({ onOpen }) {
  const [sev, setSev] = useState(null)
  const [state, setState] = useState('open')       // open | resolved | all
  const [q, setQ] = useState('')

  const { data } = useQuery({ queryKey: ['incidents'], queryFn: api.incidents })
  const all = data?.incidents ?? []

  const counts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0,
                open: 0, resolved: 0, all: all.length }
    for (const i of all) {
      if (c[i.severity] != null) c[i.severity] += 1
      if (OPEN_STATUSES.has(i.status)) c.open += 1
      else c.resolved += 1
    }
    return c
  }, [all])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return all.filter((i) => {
      if (sev && i.severity !== sev) return false
      if (state === 'open' && !OPEN_STATUSES.has(i.status)) return false
      if (state === 'resolved' && OPEN_STATUSES.has(i.status)) return false
      if (!needle) return true
      return [i.id, i.title, i.type, i.component_name, i.status]
        .some((v) => (v ?? '').toLowerCase().includes(needle))
    })
  }, [all, sev, state, q])

  const filtering = sev || state !== 'open' || q.trim()

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
        <Filter className="text-muted-foreground size-3.5" />

        {['open', 'resolved', 'all'].map((s) => (
          <button key={s} onClick={() => setState(s)}
                  className={`rounded px-2 py-1 text-[11px] transition-colors
                    ${state === s ? 'bg-muted text-foreground'
                                  : 'text-muted-foreground hover:text-foreground'}`}>
            {s}
            <span className="ml-1 font-mono opacity-60 tabular-nums">{counts[s]}</span>
          </button>
        ))}

        <span className="bg-border mx-1 h-4 w-px" />

        {['critical', 'high', 'medium', 'low'].map((s) => (
          <button key={s} onClick={() => setSev(sev === s ? null : s)}
                  disabled={counts[s] === 0}
                  className={`rounded border px-2 py-0.5 text-[10.5px] transition-colors
                    disabled:opacity-35
                    ${sev === s ? SEV_TONE[s] : 'border-transparent text-muted-foreground'}
                    ${counts[s] > 0 ? 'hover:text-foreground' : ''}`}>
            {s}
            <span className="ml-1 font-mono tabular-nums">{counts[s]}</span>
          </button>
        ))}

        <div className="relative ml-auto">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5
                             -translate-y-1/2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="component, id, status…"
                 className="h-8 w-[14rem] pl-8 text-[12px]" />
        </div>

        {filtering && (
          <Button variant="ghost" size="sm"
                  onClick={() => { setSev(null); setState('open'); setQ('') }}
                  className="text-muted-foreground h-8 gap-1 px-2 text-[11px]">
            <X className="size-3" />clear
          </Button>
        )}
      </div>

      <div className="text-muted-foreground border-b px-5 py-1.5 text-[11px]">
        {rows.length} of {all.length} incident{all.length === 1 ? '' : 's'}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <TriangleAlert className="text-muted-foreground/40 size-6" />
            <p className="text-[13px] font-medium">Nothing matches</p>
            <p className="text-muted-foreground max-w-xs text-[12px] leading-relaxed">
              {all.length === 0
                ? 'No incident has been opened. Inject a disruption and the agent opens one itself.'
                : 'Try widening the filters.'}
            </p>
          </div>
        ) : rows.map((i, n) => (
          <motion.button key={i.id} layout
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: Math.min(n * 0.02, 0.2) }}
            onClick={() => onOpen?.(i)}
            className="hover:bg-accent/30 flex w-full items-center gap-3 border-b px-5 py-3
                       text-left transition-colors last:border-0">
            <Badge variant="outline" className={`shrink-0 text-[9px] ${SEV_TONE[i.severity]}`}>
              {i.severity}
            </Badge>
            <span className="min-w-0 flex-1 truncate text-[13px]">
              {i.title || i.type?.replace(/_/g, ' ')}
            </span>
            {i.component_name && (
              <span className="text-muted-foreground shrink-0 text-[11px]">
                {i.component_name}
              </span>
            )}
            <Badge variant="outline" className="text-muted-foreground shrink-0 text-[9px]">
              {i.status?.replace(/_/g, ' ')}
            </Badge>
            <span className="text-muted-foreground/60 shrink-0 font-mono text-[10px]">
              {i.id}
            </span>
          </motion.button>
        ))}
      </ScrollArea>
    </div>
  )
}
