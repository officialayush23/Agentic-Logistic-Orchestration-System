import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Clock3, WifiOff } from 'lucide-react'
import { api } from '@/lib/api'

/**
 * What on this screen might be out of date.
 *
 * The agent already discounts its own confidence when a supplier's claim cannot
 * be corroborated. This is the same instinct pointed at the data rather than the
 * reasoning: a number nobody has refreshed in an hour is a different kind of
 * fact from one refreshed a second ago, and a dashboard that renders both in the
 * same typeface is quietly lying about one of them.
 *
 * Two clocks matter and they are not the same thing:
 *
 *   simulated — the world's clock. It runs at one hour per second while a
 *               scenario is playing and PAUSES when nothing is happening, so a
 *               frozen sim clock means "idle", not "broken".
 *   real      — wall time since this browser last heard from the server. This
 *               is the one that means "you may be looking at a corpse".
 *
 * Silent by default. A banner that is always visible is furniture, and furniture
 * is not read. This appears only when there is something to say.
 */

const STALE_AFTER_MS = 45_000        // ~4 missed refresh cycles at 12s

export default function StalenessBanner() {
  const { data: now, dataUpdatedAt, isError } = useQuery({
    queryKey: ['now'], queryFn: api.now,
  })

  const age = dataUpdatedAt ? Date.now() - dataUpdatedAt : 0
  const stale = dataUpdatedAt > 0 && age > STALE_AFTER_MS
  const paused = now?.clock?.paused === true
  const hasRun = now?.has_run === true

  // Nothing worth saying: fresh data, or a paused clock on an idle world, which
  // is the normal resting state and not a warning.
  if (!isError && !stale) return null

  const seconds = Math.round(age / 1000)
  const mins = Math.floor(seconds / 60)

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
      className={`flex items-center gap-2 border-b px-6 py-1.5 text-[11.5px]
        ${isError ? 'border-danger/40 bg-danger/10 text-danger'
                  : 'border-warn/40 bg-warn/10 text-warn'}`}>
      {isError ? <WifiOff className="size-3.5 shrink-0" />
               : <Clock3 className="size-3.5 shrink-0" />}
      <span>
        {isError ? (
          <>Cannot reach the server. Everything on this screen is the last thing
             it said, not the current state — treat every figure as potentially
             out of date.</>
        ) : (
          <>Last updated {mins >= 1 ? `${mins} minute${mins === 1 ? '' : 's'}`
                                    : `${seconds} seconds`} ago.
            {' '}
            {paused && hasRun
              ? 'The simulated clock is paused because nothing is happening — but this figure is still older than it should be.'
              : 'Figures below may have moved since.'}
          </>
        )}
      </span>
    </motion.div>
  )
}
