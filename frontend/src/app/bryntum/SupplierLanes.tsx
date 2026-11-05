// One row per supplier. The hatched bar is what the supplier promised; the
// solid bar is what the carrier actually shows. When the two disagree — or
// there is no solid bar at all — that's the lie, visible at a glance.
import { BryntumScheduler, type BryntumSchedulerProps } from '@bryntum/scheduler-react-enterprise'
import { useMemo } from 'react'
import './bryntum.css'
import { componentById, data, poById, supplierById } from '../data/source'
import { shipmentMeta } from '../ui/badges'

const D = 86_400_000
const colorFor = { in_transit: 'blue', delayed: 'orange', claim_mismatch: 'red', delivered: 'green', not_shipped: 'red', booked: 'violet' } as const

export function SupplierLanes({ height = 460 }: { height?: number }) {
  const props = useMemo<BryntumSchedulerProps>(() => {
    const ships = data.shipments.filter((s) => poById[s.poId]?.qty > 0)
    const resourceIds = [...new Set(ships.map((s) => poById[s.poId].supplierId))]
    const resources = resourceIds.map((id) => {
      const s = supplierById[id]
      return { id, name: s.name, city: `${s.city}, ${s.country}`, reliability: s.reliability }
    })
    const events = ships.flatMap((s) => {
      const po = poById[s.poId]
      const label = `${po.id} · ${componentById[po.componentId]?.name}`
      const promised = { id: `${s.poId}-p`, resourceId: po.supplierId, name: `Promised · ${po.id}`, startDate: new Date(s.promisedFrom), endDate: new Date(s.promisedTo), cls: 'promised', note: `Supplier: “${s.supplierClaim}”` }
      if (!s.actualFrom) return [promised, { id: `${s.poId}-x`, resourceId: po.supplierId, name: s.status === 'claim_mismatch' ? `⚠ ${po.id} never collected` : `${po.id} not departed`, startDate: new Date(s.promisedFrom), endDate: new Date(new Date(s.promisedFrom).getTime() + D / 2), eventColor: colorFor[s.status], note: `Carrier: ${s.carrierStatus}` }]
      return [promised, { id: `${s.poId}-a`, resourceId: po.supplierId, name: label, startDate: new Date(s.actualFrom), endDate: new Date(s.actualTo ?? s.promisedTo), eventColor: colorFor[s.status], note: `${shipmentMeta[s.status].label} · ${s.carrier} · ${s.carrierStatus}` }]
    })
    const all = ships.flatMap((s) => [s.promisedFrom, s.promisedTo, s.actualTo].filter(Boolean).map((d) => new Date(d!).getTime()))
    return {
      startDate: new Date(Math.max(Math.min(...all), Date.now() - 6 * D) - D),
      endDate: new Date(Math.min(Math.max(...all), Date.now() + 16 * D) + D),
      tickSize: 64,
      viewPreset: 'weekAndDayLetter',
      rowHeight: 64,
      barMargin: 6,
      eventLayout: 'stack',
      readOnly: true,
      resources,
      events,
      columns: [
        { text: 'Supplier', field: 'name', width: 210, renderer: ({ record }: { record: { getData: (k: string) => string } }) => `<div style="line-height:1.25"><b>${record.getData('name')}</b><br/><span style="font-size:11px;opacity:.65">${record.getData('city')}</span></div>` },
        { text: 'Trust', field: 'reliability', width: 70, align: 'right', renderer: ({ value }: { value: number }) => `<b style="color:var(--${value < 50 ? 'crit' : value < 75 ? 'warn' : 'good'})">${value}</b>` },
      ],
      timeRangesFeature: { showCurrentTimeLine: true },
      eventTooltipFeature: { template: ({ eventRecord }: { eventRecord: { name: string; getData: (k: string) => string } }) => `<b>${eventRecord.name}</b><br/>${eventRecord.getData('note') ?? ''}` },
    }
  }, [])

  return (
    <div className="bryntum-glass overflow-hidden rounded-2xl" style={{ height }}>
      <BryntumScheduler {...props} />
    </div>
  )
}
