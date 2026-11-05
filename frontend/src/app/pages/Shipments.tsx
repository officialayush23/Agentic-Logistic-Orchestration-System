import { AlertOctagon, CalendarRange, Clock, Globe2, PackageCheck, Ship, Truck } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'
import { componentById, data, poById, projectById, rel, supplierById } from '../data/source'
import { ShipmentBadge } from '../ui/badges'
import { CardHeader, GlassCard, Meter, SectionTitle, Skeleton } from '../ui/glass'
import { KpiRow } from '../ui/Kpi'
import { SupplyGlobe } from '../viz/SupplyGlobe'

const SupplierLanes = lazy(() => import('../bryntum/SupplierLanes').then((m) => ({ default: m.SupplierLanes })))

const filters = { all: 'All', moving: 'Moving', problem: 'Problems', delivered: 'Delivered' } as const
type Filter = keyof typeof filters

export default function Shipments() {
  const [filter, setFilter] = useState<Filter>('all')
  const ships = data.shipments.filter((s) => poById[s.poId]?.qty > 0).filter((s) =>
    filter === 'all' ? true :
    filter === 'moving' ? ['in_transit', 'booked'].includes(s.status) :
    filter === 'problem' ? ['delayed', 'claim_mismatch', 'not_shipped'].includes(s.status) :
    s.status === 'delivered')

  const count = (st: string[]) => data.shipments.filter((s) => st.includes(s.status)).length
  return (
    <>
      <SectionTitle title="Shipments" subtitle="Every inbound purchase order, where it really is, and whether the supplier's story matches the carrier's" />
      <KpiRow items={[
        { label: 'In transit', value: String(count(['in_transit'])), icon: Truck, tone: 'azure', note: 'tracked live' },
        { label: 'Delayed', value: String(count(['delayed'])), icon: Clock, tone: 'warn', delta: 33.3, invert: true },
        { label: 'Claim ≠ carrier', value: String(count(['claim_mismatch'])), icon: AlertOctagon, tone: 'crit', note: 'payment blocked' },
        { label: 'Delivered & verified', value: String(count(['delivered'])), icon: PackageCheck, tone: 'good', note: 'funds released' },
      ]} />

      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        <GlassCard className="overflow-hidden p-0">
          <div className="p-5 pb-0"><CardHeader icon={Globe2} title="Global view" subtitle="Drag to spin · click an arc to open its project" /></div>
          <SupplyGlobe height={560} />
        </GlassCard>
        <GlassCard className="flex h-[640px] flex-col" delay={0.1}>
          <CardHeader icon={Ship} tone="azure" title="Shipments" subtitle={`${ships.length} shown`} />
          <div className="mb-3 flex gap-1 rounded-xl bg-white/60 p-0.5 text-[11px] font-medium dark:bg-white/5">
            {(Object.keys(filters) as Filter[]).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={cn('flex-1 rounded-lg px-2 py-1', filter === f ? 'bg-white text-primary shadow-sm dark:bg-white/15' : 'text-muted-foreground')}>{filters[f]}</button>
            ))}
          </div>
          <div className="scrollbar-thin -mr-2 min-h-0 flex-1 space-y-2 overflow-y-auto pr-2">
            {ships.map((s) => {
              const po = poById[s.poId]
              return (
                <Link key={s.poId} to={`/projects/${po.projectId}?tab=materials`}
                  className={cn('block rounded-2xl border border-white/80 bg-white/60 p-3.5 transition-shadow hover:shadow-md hover:shadow-violet/10 dark:border-white/10 dark:bg-white/5', s.status === 'claim_mismatch' && 'ring-1 ring-crit/30')}>
                  <div className="flex items-center gap-2">
                    <ShipmentBadge status={s.status} />
                    <span className="text-[11px] text-muted-foreground">{s.carrier}</span>
                    <span className="ml-auto text-[11px] font-semibold">{po.mode}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold">{po.id} · {componentById[po.componentId]?.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{supplierById[po.supplierId].name} → Pune · {projectById[po.projectId].name.split('·')[0]}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                    <span className="rounded-lg bg-violet/5 px-2 py-1"><span className="text-muted-foreground">Supplier: </span>{s.supplierClaim}</span>
                    <span className={cn('rounded-lg px-2 py-1', s.status === 'claim_mismatch' ? 'bg-crit/10 text-crit' : 'bg-violet/5')}><span className="text-muted-foreground">Carrier: </span>{s.carrierStatus}</span>
                  </div>
                  <Meter value={s.progress} display={`${Math.round(s.progress * 100)}%`} className="mt-2" />
                  <p className="mt-1 text-[11px] text-muted-foreground">ETA {rel(po.etaAt)} · tracking {s.tracking}</p>
                </Link>
              )
            })}
          </div>
        </GlassCard>
      </div>

      <GlassCard delay={0.15}>
        <CardHeader icon={CalendarRange} title="Supplier lanes — promised vs actual" subtitle="Hatched = what the supplier promised · solid = what the carrier shows · red = the claim was false" />
        <Suspense fallback={<Skeleton className="h-[460px] w-full" />}><SupplierLanes /></Suspense>
      </GlassCard>
    </>
  )
}
