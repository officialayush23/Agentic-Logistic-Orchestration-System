import { ArrowLeft, Bot, CalendarClock, Factory, Globe2, Layers, Mail, PackageCheck, Users, Wallet } from 'lucide-react'
import { motion } from 'motion/react'
import { lazy, Suspense } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { cn } from '@/lib/utils'
import {
  componentById, customerById, inr, num, projectBom, projectById, projectEmails, projectIncidents, projectPayments,
  projectPOs, projectSuppliers, rel, shortDate, usd,
} from '../data/source'
import { HealthBadge, StatusBadge } from '../ui/badges'
import { IncidentCard } from '../ui/agent'
import { PaymentCard } from '../ui/finance'
import { CardHeader, EmptyState, GlassCard, Meter, Skeleton } from '../ui/glass'
import { KpiRow } from '../ui/Kpi'
import { SupplyGlobe } from '../viz/SupplyGlobe'
import { MaterialsTree } from './project/MaterialsTree'
import { EmailThreads } from './project/Emails'

const ProjectGantt = lazy(() => import('../bryntum/ProjectGantt').then((m) => ({ default: m.ProjectGantt })))

const tabs = [
  { id: 'overview', label: 'Overview', icon: Globe2 },
  { id: 'materials', label: 'Materials', icon: Layers },
  { id: 'timeline', label: 'Timeline', icon: CalendarClock },
  { id: 'money', label: 'Money', icon: Wallet },
  { id: 'emails', label: 'Emails', icon: Mail },
  { id: 'agent', label: 'Agent decisions', icon: Bot },
] as const
type TabId = (typeof tabs)[number]['id']

export default function ProjectDetail() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as TabId) || 'overview'
  const p = projectById[id]
  if (!p) return <GlassCard><EmptyState icon={Layers} title="Project not found" hint={`No project with id ${id}.`} action={<Link to="/projects" className="text-xs font-semibold text-primary">Back to projects</Link>} /></GlassCard>

  const customer = customerById[p.customerId]
  const incidents = projectIncidents(p.id)
  const payments = projectPayments(p.id)

  return (
    <>
      <GlassCard className="p-5">
        <Link to="/projects" className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-primary">
          <ArrowLeft className="size-3" /> Projects
        </Link>
        <div className="mt-2 flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <HealthBadge health={p.health} />
              <StatusBadge tone="violet">{p.id}</StatusBadge>
              <span className="text-[11px] text-muted-foreground">{p.productionOrders.join(' · ')}</span>
            </div>
            <h1 className="mt-2 text-xl font-bold tracking-tight">{p.name}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              For <b className="text-foreground/80">{customer.name}</b> ({customer.city}) · {num(p.units)} units · due {shortDate(p.dueAt)} ({rel(p.dueAt)}) · owner {p.owner}
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed">{p.summary}</p>
          </div>
          <div className="w-full max-w-xs space-y-2 rounded-2xl bg-white/50 p-4 dark:bg-white/5">
            <Meter label="Materials secured" value={p.materialsSecured} display={`${Math.round(p.materialsSecured * 100)}%`} />
            <Meter label="Money released" value={p.committedUsd ? p.releasedUsd / p.committedUsd : 0} display={`${p.committedUsd ? Math.round((p.releasedUsd / p.committedUsd) * 100) : 0}%`} />
            <p className="pt-1 text-[11px] text-muted-foreground">Committed {usd(p.committedUsd)} · {inr(p.committedUsd)}</p>
          </div>
        </div>

        <nav className="mt-4 flex gap-1 overflow-x-auto rounded-2xl bg-white/50 p-1 dark:bg-white/5">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setParams({ tab: t.id }, { replace: true })}
              className={cn('relative flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors', tab === t.id ? 'text-accent-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {tab === t.id && <motion.span layoutId="project-tab" className="absolute inset-0 rounded-xl bg-white shadow-sm dark:bg-white/10" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
              <t.icon className="relative size-3.5" />
              <span className="relative">{t.label}</span>
              {t.id === 'agent' && incidents.length > 0 && <span className="relative rounded-md bg-primary/10 px-1 text-[10px] font-semibold text-primary">{incidents.length}</span>}
            </button>
          ))}
        </nav>
      </GlassCard>

      {tab === 'overview' && <Overview id={p.id} />}
      {tab === 'materials' && <MaterialsTree projectId={p.id} />}
      {tab === 'timeline' && (
        <GlassCard>
          <CardHeader icon={CalendarClock} title="Project timeline" subtitle="Production starts only when every material lands · teal diamonds are PayPal releases · red line is the customer due date" />
          <Suspense fallback={<Skeleton className="h-[520px] w-full" />}><ProjectGantt projectId={p.id} /></Suspense>
        </GlassCard>
      )}
      {tab === 'money' && (
        <div className="grid gap-4 xl:grid-cols-2">
          {payments.length ? payments.map((pay, i) => (
            <GlassCard key={pay.id} delay={i * 0.05} className="p-3"><PaymentCard payment={pay} /></GlassCard>
          )) : <GlassCard><EmptyState icon={Wallet} title="No money committed" hint="Nothing has been held or paid for this project." /></GlassCard>}
        </div>
      )}
      {tab === 'emails' && <EmailThreads messages={projectEmails(p.id)} />}
      {tab === 'agent' && (
        <div className="space-y-4">
          {incidents.length ? incidents.map((inc, i) => (
            <GlassCard key={inc.id} delay={i * 0.05} className="p-3"><IncidentCard incident={inc} /></GlassCard>
          )) : <GlassCard><EmptyState icon={Bot} title="Nothing for the agent to do" hint="No disruptions on this project. The agent is still watching every shipment." /></GlassCard>}
        </div>
      )}
    </>
  )
}

function Overview({ id }: { id: string }) {
  const p = projectById[id]
  const pos = projectPOs(id)
  const suppliers = projectSuppliers(id)
  return (
    <>
      <KpiRow items={[
        { label: 'Units', value: num(p.units), icon: PackageCheck, tone: 'violet', note: p.product },
        { label: 'Funds held', value: usd(p.heldUsd), icon: Wallet, tone: 'azure', note: 'reserved in PayPal' },
        { label: 'Released to suppliers', value: usd(p.releasedUsd), icon: Wallet, tone: 'good', note: 'after verified goods' },
        { label: 'Recovered', value: usd(p.recoveredUsd), icon: Wallet, tone: 'rose', note: 'voided or refunded' },
      ]} />
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <GlassCard className="overflow-hidden p-0">
          <div className="p-5 pb-0"><CardHeader icon={Globe2} title="Where this project's parts are" subtitle={`${pos.length} purchase orders · ${suppliers.length} suppliers`} /></div>
          <SupplyGlobe projectId={id} height={430} autoRotate={false} />
        </GlassCard>
        <div className="space-y-4">
          <GlassCard delay={0.1}>
            <CardHeader icon={Layers} title="Materials" subtitle="On hand + verified inbound vs required" />
            <div className="space-y-2.5">
              {projectBom(id).map((b) => {
                const inbound = pos.filter((x) => x.componentId === b.componentId && !['hold_voided', 'refunded', 'not_started'].includes(x.financial)).reduce((a, x) => a + x.qty, 0)
                const cov = Math.min(1, (b.onHand + inbound) / b.required)
                return <Meter key={b.componentId} label={componentById[b.componentId].name} value={cov} display={`${Math.round(cov * 100)}%`} />
              })}
            </div>
          </GlassCard>
          <GlassCard delay={0.15}>
            <CardHeader icon={Factory} title="Suppliers on this project" />
            <div className="space-y-2">
              {suppliers.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-xl bg-white/50 px-3 py-2 dark:bg-white/5">
                  <span className="grid size-7 place-items-center rounded-lg bg-violet/12 text-[10px] font-bold text-violet">{s.name.slice(0, 2).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{s.name}</span>
                    <span className="block text-[11px] text-muted-foreground">{s.city}, {s.country}</span>
                  </span>
                  <span className={cn('text-xs font-bold tabular-nums', s.reliability < 50 ? 'text-crit' : s.reliability < 75 ? 'text-warn' : 'text-good')}>{s.reliability}</span>
                </div>
              ))}
            </div>
          </GlassCard>
          <GlassCard delay={0.2}>
            <CardHeader icon={Users} title="Customer" />
            <p className="text-sm font-semibold">{customerById[p.customerId].name}</p>
            <p className="text-xs text-muted-foreground">{customerById[p.customerId].city} · {customerById[p.customerId].tier === 'key' ? 'Key account' : 'Standard account'}</p>
          </GlassCard>
        </div>
      </div>
    </>
  )
}
