// Project timeline: material POs → production → dispatch, with PayPal release
// milestones. Production is auto-scheduled after the materials it depends on,
// so a late shipment visibly pushes the whole run — and the due-date line shows
// whether the dealer will notice.
import { BryntumGantt, type BryntumGanttProps } from '@bryntum/gantt-react-enterprise'
import '@bryntum/scheduler-enterprise'
import { useMemo } from 'react'
import './bryntum.css'
import { componentById, projectById, projectPOs, shipmentByPo, supplierById } from '../data/source'
import { financialMeta } from '../ui/badges'

const D = 86_400_000
const toDate = (iso: string) => new Date(iso)

export function ProjectGantt({ projectId, height = 640 }: { projectId: string; height?: number }) {
  const props = useMemo<BryntumGanttProps>(() => {
    const p = projectById[projectId]
    const pos = projectPOs(projectId).filter((po) => po.qty > 0 && po.financial !== 'not_started')
    const live = pos.filter((po) => po.financial !== 'hold_voided' && po.financial !== 'refunded')

    const materialTasks = pos.map((po) => {
      const s = supplierById[po.supplierId]
      const sh = shipmentByPo[po.id]
      const dead = po.financial === 'hold_voided' || po.financial === 'refunded'
      const start = toDate(po.createdAt)
      const end = new Date(Math.max(toDate(po.etaAt).getTime(), start.getTime() + D / 4))
      return {
        id: po.id,
        name: `${po.id} · ${componentById[po.componentId]?.name} · ${s.name}`,
        startDate: start,
        endDate: end,
        manuallyScheduled: true,
        percentDone: sh ? Math.round(sh.progress * 100) : 0,
        eventColor: dead ? 'gray' : sh?.status === 'delayed' ? 'orange' : sh?.status === 'claim_mismatch' ? 'red' : sh?.status === 'delivered' ? 'green' : 'violet',
        cls: dead ? 'b-cancelled' : '',
        note: `${sh?.carrierStatus ?? 'Not shipped'} · PayPal: ${financialMeta[po.financial].label}`,
      }
    })
    const releaseMilestones = live.map((po) => ({
      id: `PAY-${po.id}`,
      name: `Release ${po.id} funds (after QC)`,
      duration: 0,
      eventColor: 'teal',
      note: financialMeta[po.financial].hint,
    }))

    const latestEta = Math.max(...live.map((po) => toDate(po.etaAt).getTime()), Date.now())
    const tasksData = [
      { id: 'MAT', name: 'Materials', expanded: true, children: materialTasks },
      { id: 'PAY', name: 'PayPal releases', expanded: true, children: releaseMilestones },
      {
        id: 'PROD', name: `Production · ${p.units} × ${p.product}`, expanded: true, children: [
          { id: 'SMT', name: 'SMT line', duration: 1.5, eventColor: 'blue' },
          { id: 'ASM', name: 'Final assembly', duration: 1, eventColor: 'blue' },
          { id: 'EOL', name: 'End-of-line test', duration: 0.5, eventColor: 'blue' },
        ],
      },
      { id: 'SHIP', name: 'Dispatch to customer', duration: 0, eventColor: 'green' },
    ]
    const dependenciesData = [
      ...live.map((po) => ({ fromTask: po.id, toTask: 'SMT' })),
      ...live.map((po) => ({ fromTask: po.id, toTask: `PAY-${po.id}` })),
      { fromTask: 'SMT', toTask: 'ASM' },
      { fromTask: 'ASM', toTask: 'EOL' },
      { fromTask: 'EOL', toTask: 'SHIP' },
    ]

    const start = new Date(Math.min(...pos.map((po) => toDate(po.createdAt).getTime())) - D)
    const end = new Date(Math.max(toDate(p.dueAt).getTime(), latestEta) + 4 * D)

    return {
      startDate: start,
      endDate: end,
      viewPreset: 'weekAndDayLetter',
      rowHeight: 40,
      barMargin: 8,
      readOnly: true,
      columns: [{ type: 'name', field: 'name', width: 340, text: 'Plan' }],
      project: {
        startDate: new Date(),
        tasks: tasksData,
        dependencies: dependenciesData,
        timeRanges: [
          { id: 'due', name: `Due · ${p.name.split('·')[0].trim()}`, startDate: toDate(p.dueAt), cls: 'due-line' },
        ],
      },
      timeRangesFeature: { showCurrentTimeLine: true },
      taskTooltipFeature: {
        template: ({ taskRecord }: { taskRecord: { name: string; data: { note?: string }; startDate: Date; endDate: Date } }) =>
          `<b>${taskRecord.name}</b><br/>${taskRecord.data.note ?? ''}`,
      },
      projectLinesFeature: false,
    }
  }, [projectId])

  return (
    <div className="bryntum-glass overflow-hidden rounded-2xl" style={{ height }}>
      <BryntumGantt {...props} />
    </div>
  )
}
