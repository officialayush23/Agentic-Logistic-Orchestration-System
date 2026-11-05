import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowDownToLine, Bot, Pause, Play, Terminal, User } from 'lucide-react'
import { ACTOR_LABEL, actorSide, toolFor } from '@/lib/tools'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

/**
 * The agent working, one line at a time.
 *
 * Every line here already existed in `audit_events` — this is a rendering job,
 * not new instrumentation. What it adds is the thing a static table cannot: the
 * sense that something is *running*. A judge watching lines arrive while the
 * agent investigates learns more about what it does than a finished table tells
 * them, because the order and the pauses are themselves information.
 *
 * Three rules that make it a trace rather than a toy:
 *
 *   — the tool name comes first, because that is the part that says what the
 *     system can do. `lib/tools.js` resolves it, so the map, the audit page and
 *     this stream can never disagree about which tool ran.
 *   — actor is rendered as a side (agent or human), not as a raw string. The
 *     question people ask is "did it do that, or did I".
 *   — auto-scroll stops the moment you scroll up, and says so. A log that drags
 *     you back to the bottom while you are reading is unusable, and this is the
 *     one place a person will try to read while it moves.
 */

const MAX_LINES = 220

function Line({ e, index }) {
  const t = toolFor(e)
  const side = actorSide(e.actor)
  const ts = e.ts ? new Date(e.ts) : null
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18, delay: Math.min(index * 0.012, 0.2) }}
      className="hover:bg-muted/40 flex items-start gap-2.5 px-4 py-1.5">

      <span className="text-muted-foreground/50 mt-px shrink-0 font-mono text-[10px]
                       tabular-nums">
        {ts ? ts.toLocaleTimeString('en-GB', { hour12: false }) : '--:--:--'}
      </span>

      {side === 'human'
        ? <User className="text-info mt-0.5 size-3 shrink-0" />
        : <Bot className="text-muted-foreground mt-0.5 size-3 shrink-0" />}

      {t ? (
        <code className={`mt-px shrink-0 rounded px-1 font-mono text-[10px]
          ${t.exact ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}
              title={t.exact
                ? `${t.module} — recorded by the step itself`
                : `${t.module} — inferred from the event type`}>
          {t.tool}
        </code>
      ) : (
        <code className="text-muted-foreground/50 mt-px shrink-0 font-mono text-[10px]">
          {e.event_type?.toLowerCase()}
        </code>
      )}

      <span className="min-w-0 flex-1 text-[12px] leading-relaxed">
        {e.human_summary}
      </span>

      {e.incident_id && (
        <span className="text-muted-foreground/40 mt-px shrink-0 font-mono text-[9.5px]">
          {e.incident_id}
        </span>
      )}
    </motion.div>
  )
}

export default function EventStream({ events = [], height = 'h-full' }) {
  const [live, setLive] = useState(true)
  const [side, setSide] = useState('all')
  const boxRef = useRef(null)
  const pinned = useRef(true)

  const lines = useMemo(() => {
    const filtered = side === 'all'
      ? events
      : events.filter((e) => actorSide(e.actor) === side)
    // Newest at the bottom, like every log a person has ever read.
    return filtered.slice(-MAX_LINES)
  }, [events, side])

  // Follow the tail only while the reader is actually at the tail. `pinned` is
  // measured from the scroll position rather than assumed, so scrolling up to
  // read something pauses the follow without a mode switch.
  useEffect(() => {
    const el = boxRef.current
    if (!el || !live || !pinned.current) return
    el.scrollTop = el.scrollHeight
  }, [lines, live])

  function onScroll() {
    const el = boxRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24
    pinned.current = atBottom
    if (!atBottom && live) setLive(false)
  }

  function resume() {
    setLive(true)
    pinned.current = true
    const el = boxRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  const counts = useMemo(() => ({
    all: events.length,
    agent: events.filter((e) => actorSide(e.actor) === 'agent').length,
    human: events.filter((e) => actorSide(e.actor) === 'human').length,
  }), [events])

  return (
    <div className={`flex flex-col ${height} min-h-0`}>
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <Terminal className="text-muted-foreground size-3.5" />
        <span className="text-muted-foreground text-[10px] font-medium
                         tracking-[0.14em] uppercase">Live trace</span>

        <div className="ml-3 flex items-center gap-1">
          {[['all', 'everything'], ['agent', 'agent'], ['human', 'people']].map(
            ([k, label]) => (
              <button key={k} onClick={() => setSide(k)}
                      className={`rounded px-1.5 py-0.5 text-[10.5px] transition-colors
                        ${side === k ? 'bg-muted text-foreground'
                                     : 'text-muted-foreground hover:text-foreground'}`}>
                {label}
                <span className="ml-1 font-mono opacity-60 tabular-nums">{counts[k]}</span>
              </button>
            ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {!live && (
            <Button size="sm" variant="ghost" className="h-6 gap-1 text-[10.5px]"
                    onClick={resume}>
              <ArrowDownToLine className="size-3" />follow
            </Button>
          )}
          <Badge variant="outline"
                 className={`gap-1 text-[9.5px] ${live ? 'border-ok/45 bg-ok/10 text-ok' : ''}`}>
            {live ? <Play className="size-2.5" /> : <Pause className="size-2.5" />}
            {live ? 'following' : 'paused'}
          </Badge>
        </div>
      </div>

      <div ref={boxRef} onScroll={onScroll}
           className="min-h-0 flex-1 overflow-y-auto py-1">
        {lines.length === 0 ? (
          <div className="text-muted-foreground flex h-full items-center justify-center
                          px-6 text-center text-[12px]">
            Nothing yet. Inject a scenario and the agent’s work appears here as it
            happens.
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {lines.map((e, i) => (
              <Line key={e.sequence ?? `${e.ts}-${i}`} e={e} index={i} />
            ))}
          </AnimatePresence>
        )}
      </div>

      <div className="text-muted-foreground/60 border-t px-4 py-1.5 text-[10px]">
        {lines.length} line{lines.length === 1 ? '' : 's'} · every one of these is a row in
        the append-only audit log, not a console print
      </div>
    </div>
  )
}
