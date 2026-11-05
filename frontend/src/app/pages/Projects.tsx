import type { ColDef, GridOptions } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import { AlertTriangle, FolderKanban, Lock, PackageCheck, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { cn } from '@/lib/utils'
import { glassGridTheme } from '../ag/setup'
import { ConfidenceCell, FinancialCell, HealthCell, MoneyCell, ProgressCell, SupplierCell } from '../ag/renderers'
import { componentById, customerById, data, num, projectPOs, shortDate, usd } from '../data/source'
import type { Project, PurchaseOrder } from '../data/types'
import { CardHeader, GlassCard, SectionTitle } from '../ui/glass'
import { KpiRow } from '../ui/Kpi'

type Row = Project & { customer: string; due: string; slip: number }

const groupings = { customer: 'Customer', health: 'Health', owner: 'Owner', none: 'No grouping' } as const
type Grouping = keyof typeof groupings

const poCols: ColDef<PurchaseOrder>[] = [
  { field: 'id', headerName: 'PO', width: 100, cellClass: 'font-semibold' },
  { field: 'componentId', headerName: 'Material', flex: 1, minWidth: 180, valueFormatter: (p) => componentById[p.value]?.name ?? p.value },
  { field: 'supplierId', headerName: 'Supplier', flex: 1, minWidth: 200, cellRenderer: SupplierCell },
  { field: 'qty', headerName: 'Qty', width: 90, type: 'rightAligned', valueFormatter: (p) => num(p.value) },
  { field: 'mode', width: 80 },
  { field: 'totalUsd', headerName: 'Value', width: 100, cellRenderer: MoneyCell },
  { field: 'financial', headerName: 'PayPal state', width: 160, cellRenderer: FinancialCell },
  { field: 'confidence', headerName: 'Agent confidence', width: 170, cellRenderer: ConfidenceCell },
]

export default function Projects() {
  const nav = useNavigate()
  const [grouping, setGrouping] = useState<Grouping>('customer')

  const rows: Row[] = useMemo(() => data.projects.map((p) => ({
    ...p,
    customer: customerById[p.customerId].name,
    due: shortDate(p.dueAt),
    slip: Math.round((new Date(p.dueAt).getTime() - new Date(p.originalDueAt).getTime()) / 86_400_000),
  })), [])

  const cols = useMemo<ColDef<Row>[]>(() => [
    { field: 'customer', rowGroup: grouping === 'customer', hide: grouping === 'customer', headerName: 'Customer', width: 160 },
    { field: 'health', rowGroup: grouping === 'health', hide: grouping === 'health', width: 130, cellRenderer: HealthCell },
    { field: 'owner', rowGroup: grouping === 'owner', hide: true },
    { field: 'id', headerName: 'Project', width: 130, cellClass: 'font-semibold', cellRenderer: 'agGroupCellRenderer' },
    { field: 'name', headerName: 'Name', flex: 1, minWidth: 230, cellClass: 'font-medium' },
    { field: 'units', width: 90, type: 'rightAligned', valueFormatter: (p) => (p.value == null ? '' : num(p.value)), aggFunc: 'sum' },
    { field: 'due', headerName: 'Due', width: 90 },
    { field: 'slip', headerName: 'Slip', width: 75, type: 'rightAligned', valueFormatter: (p) => (p.value ? `+${p.value}d` : '—'), cellClass: (p) => (p.value ? 'text-warn font-semibold' : 'text-muted-foreground') },
    { field: 'materialsSecured', headerName: 'Materials', width: 140, cellRenderer: ProgressCell, aggFunc: 'avg' },
    { field: 'heldUsd', headerName: 'Held', width: 100, cellRenderer: MoneyCell, aggFunc: 'sum' },
    { field: 'releasedUsd', headerName: 'Released', width: 105, cellRenderer: MoneyCell, aggFunc: 'sum' },
    { field: 'recoveredUsd', headerName: 'Recovered', width: 110, cellRenderer: MoneyCell, aggFunc: 'sum' },
    { field: 'openIncidents', headerName: 'Incidents', width: 100, type: 'rightAligned', aggFunc: 'sum' },
  ], [grouping])

  const options: GridOptions<Row> = {
    theme: glassGridTheme,
    masterDetail: true,
    detailRowAutoHeight: true,
    detailCellRendererParams: {
      detailGridOptions: { theme: glassGridTheme, columnDefs: poCols, rowHeight: 42, headerHeight: 34, domLayout: 'autoHeight', suppressCellFocus: true },
      getDetailRowData: (p: { data: Row; successCallback: (r: PurchaseOrder[]) => void }) => p.successCallback(projectPOs(p.data.id)),
    },
    groupDefaultExpanded: 1,
    autoGroupColumnDef: { headerName: groupings[grouping], minWidth: 200, width: 200 },
    animateRows: true,
    suppressAggFuncInHeader: true,
    suppressCellFocus: true,
    getRowId: (p) => p.data.id,
  }

  const live = data.projects.filter((p) => p.health !== 'stood_down')
  return (
    <>
      <SectionTitle title="Projects" subtitle="Every customer order the plant has committed to — expand a row for its purchase orders, click it to open the project" />
      <KpiRow items={[
        { label: 'Active projects', value: String(live.length), icon: FolderKanban, tone: 'violet', note: `${data.customers.length} customers` },
        { label: 'Units committed', value: num(live.reduce((a, p) => a + p.units, 0)), icon: PackageCheck, tone: 'azure', note: 'across all due dates' },
        { label: 'Projects at risk', value: String(live.filter((p) => p.health !== 'on_track').length), icon: AlertTriangle, tone: 'crit', delta: 50, invert: true },
        { label: 'Funds held for projects', value: usd(live.reduce((a, p) => a + p.heldUsd, 0)), icon: Lock, tone: 'good', note: 'released only on verified goods' },
      ]} />
      <GlassCard className="p-0" delay={0.1}>
        <div className="p-5 pb-2">
          <CardHeader icon={Users} title="Project portfolio" subtitle="Grouped, aggregated and drillable"
            action={
              <div className="flex rounded-xl bg-white/60 p-0.5 text-[11px] font-medium dark:bg-white/5">
                {(Object.keys(groupings) as Grouping[]).map((g) => (
                  <button key={g} onClick={() => setGrouping(g)}
                    className={cn('rounded-lg px-2.5 py-1 transition-colors', grouping === g ? 'bg-white text-primary shadow-sm dark:bg-white/15' : 'text-muted-foreground')}>
                    {groupings[g]}
                  </button>
                ))}
              </div>
            } />
        </div>
        <div className="ag-glass h-[560px] px-2 pb-2">
          <AgGridReact<Row>
            key={grouping}
            rowData={rows}
            columnDefs={cols}
            {...options}
            onRowClicked={(e) => {
              const t = e.event?.target as HTMLElement | undefined
              if (e.data && !t?.closest('.ag-group-contracted, .ag-group-expanded, .ag-details-row')) nav(`/projects/${e.data.id}`)
            }}
          />
        </div>
      </GlassCard>
    </>
  )
}
