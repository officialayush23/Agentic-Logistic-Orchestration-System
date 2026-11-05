// Each incident is a card moving left→right through the agent's state machine.
// The board is read-only: only the agent (and humans via Approvals) move money,
// so a drag here must never be what releases funds.
import { BryntumTaskBoard, type BryntumTaskBoardProps } from '@bryntum/taskboard-react-enterprise'
import { useMemo } from 'react'
import './bryntum.css'
import { data, projectById, supplierById, usd } from '../data/source'
import type { AgentStage } from '../data/types'

const columns: { id: AgentStage; text: string; color: string }[] = [
  { id: 'detected', text: 'Detected', color: 'orange' },
  { id: 'investigating', text: 'Investigating', color: 'violet' },
  { id: 'awaiting_approval', text: 'Awaiting approval', color: 'pink' },
  { id: 'funds_held', text: 'Funds held', color: 'blue' },
    { id: 'settled', text: 'Settled', color: 'green' },
  { id: 'clawed_back', text: 'Clawed back', color: 'amber' },
]
const sevColor = { critical: 'red', high: 'pink', medium: 'orange', low: 'green' } as const

export function IncidentBoard({ onSelect, height = 400 }: { onSelect?: (id: string) => void; height?: number }) {
  const props = useMemo<BryntumTaskBoardProps>(() => ({
    columns,
    columnField: 'status',
    readOnly: true,
    useDomTransition: true,
    columnToolbarsFeature: false,
    columnHeaderMenuFeature: false,
    columnDragFeature: false,
    taskDragFeature: false,
    stretchCards: true,
    headerItems: { text: { field: 'name' } },
    bodyItems: {
      description: { type: 'text', field: 'description' },
    },
    footerItems: {
      tags: { type: 'tags', field: 'tags' },
    },
    project: {
      tasks: data.incidents.map((i) => ({
        id: i.id,
        name: i.title,
        status: i.stage,
        eventColor: sevColor[i.severity],
        description: `${projectById[i.projectId].name.split('·')[0].trim()} · ${supplierById[i.supplierId].name}${i.amountUsd ? ` · ${usd(i.amountUsd)}` : ''}`,
        tags: [i.id, i.scenario.split('·')[0].trim(), i.severity],
      })),
    },
    onTaskClick: ({ taskRecord }: { taskRecord: { id: string | number } }) => onSelect?.(String(taskRecord.id)),
  }), [onSelect])

  return (
    <div className="bryntum-glass overflow-hidden rounded-2xl" style={{ height }}>
      <BryntumTaskBoard {...props} />
    </div>
  )
}
