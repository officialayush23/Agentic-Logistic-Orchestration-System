import { Anchor, Ban, Factory, FlaskConical, PackageX, Play, ShieldAlert, Ship, Timer, Warehouse, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { rel } from '../data/source'
import type { Tone } from '../data/types'
import { useUi } from '../store'
import { StatusBadge } from '../ui/badges'
import { Callout, CardHeader, EmptyState, GlassCard, IconChip, PrimaryButton, SectionTitle } from '../ui/glass'

interface Scenario { id: string; icon: LucideIcon; tone: Tone; title: string; world: string; agent: string; money: string }

// Each scenario changes the *world* (a supplier email, a carrier scan, a warehouse
// count). What the agent then does with money is real sandbox PayPal.
const scenarios: Scenario[] = [
  { id: 'S3', icon: ShieldAlert, tone: 'crit', title: 'Supplier lies about dispatch', world: 'Zhen Hua emails "goods dispatched"; COSCO shows label created, no pickup.', agent: 'Detects the contradiction, drops supplier trust, re-sources by air.', money: 'Voids the held authorization · holds funds for the backup · Payouts an expedite fee' },
  { id: 'S1', icon: Anchor, tone: 'warn', title: 'Port congestion', world: 'Vessel waits for a berth; ETA slips 2 days.', agent: 'Recomputes line-stop risk; re-plans only if the slip breaks the due date.', money: 'Reauthorizes the hold if it would expire before arrival' },
  { id: 'S2', icon: Warehouse, tone: 'violet', title: 'Stale inventory', world: 'Stock record says 600; the floor counts 140.', agent: 'Asks the warehouse, trusts the fresher count, sizes the gap.', money: 'No money moves until the gap is confirmed' },
  { id: 'S4', icon: Ban, tone: 'rose', title: 'Cheapest quote is uncertified', world: 'A supplier offers 22% cheaper parts with no AEC-Q100 evidence.', agent: 'Hard-rejects the option; picks the certified one.', money: 'Holds funds only for the certified supplier' },
  { id: 'S5', icon: Timer, tone: 'azure', title: 'Recovery over authority limit', world: 'Only air freight saves the date, costing $9,855.', agent: 'Asks a human; sends a one-time code by email.', money: 'Release gated on human code and verified goods' },
  { id: 'QC', icon: PackageX, tone: 'warn', title: 'Wrong part delivered', world: 'Warehouse QC finds silicon rev B; PO says rev D.', agent: 'Fails the three-way match.', money: 'Refunds the captured payment' },
  { id: 'SHIP', icon: Ship, tone: 'good', title: 'Clean delivery', world: 'Goods arrive and pass QC.', agent: 'Three-way match passes.', money: 'Captures the authorization — supplier paid' },
  { id: 'FAC', icon: Factory, tone: 'crit', title: 'Supplier factory fire', world: 'A sole-source supplier goes dark.', agent: 'Finds the next certified source, stands down low-priority runs.', money: 'Voids every hold with that supplier' },
]

export default function SimulationLab() {
  const { simLog, logSim } = useUi()
  const [running, setRunning] = useState<string | null>(null)

  const run = (s: Scenario) => {
    setRunning(s.id)
    logSim(`${s.id} · ${s.title}`)
    toast.success(`Injected: ${s.title}`, { description: 'World event sent. The agent decides what happens to the money.' })
    setTimeout(() => setRunning(null), 1200)
  }

  return (
    <>
      <SectionTitle title="Simulation Lab" subtitle="Change the world, then watch the agent respond" />
      <Callout lead="Simulate the world, never the money.">
        These buttons inject supplier emails, carrier scans and warehouse counts. Every PayPal call the agent makes in response is a real sandbox call you can verify in the PayPal dashboard.
      </Callout>
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="grid gap-4 md:grid-cols-2">
          {scenarios.map((s, i) => (
            <GlassCard key={s.id} delay={i * 0.05} className="flex flex-col">
              <div className="flex items-center gap-3">
                <IconChip icon={s.icon} tone={s.tone} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{s.title}</p>
                  <p className="text-[11px] text-muted-foreground">Scenario {s.id}</p>
                </div>
              </div>
              <dl className="mt-3 space-y-1.5 text-xs">
                <div><dt className="inline font-semibold">World: </dt><dd className="inline text-muted-foreground">{s.world}</dd></div>
                <div><dt className="inline font-semibold">Agent: </dt><dd className="inline text-muted-foreground">{s.agent}</dd></div>
                <div><dt className="inline font-semibold">PayPal: </dt><dd className="inline text-muted-foreground">{s.money}</dd></div>
              </dl>
              <div className="mt-auto pt-4">
                <PrimaryButton icon={false} onClick={() => run(s)} disabled={running === s.id}>
                  <Play className="size-3" /> {running === s.id ? 'Injecting…' : 'Inject event'}
                </PrimaryButton>
              </div>
            </GlassCard>
          ))}
        </div>
        <GlassCard className="flex h-fit max-h-[760px] flex-col xl:sticky xl:top-4" delay={0.1}>
          <CardHeader icon={FlaskConical} title="Injected events" subtitle="This session" />
          {simLog.length === 0 ? (
            <EmptyState icon={FlaskConical} title="Nothing injected yet" hint="Pick a scenario. The agent sees it exactly as it would see a real email or scan." />
          ) : (
            <div className="scrollbar-thin -mr-2 space-y-2 overflow-y-auto pr-2">
              {simLog.map((l, i) => (
                <motion.div key={l.at + i} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="rounded-2xl border border-white/80 bg-white/60 p-3 dark:border-white/10 dark:bg-white/5">
                  <div className="flex items-center gap-2"><StatusBadge tone="violet">world event</StatusBadge><span className="text-[11px] text-muted-foreground">{rel(l.at)}</span></div>
                  <p className="mt-1.5 text-xs font-semibold">{l.label}</p>
                </motion.div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </>
  )
}
