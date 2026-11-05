import type { ColDef } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import { BarChart3, Lock, PencilRuler, ReceiptText, Undo2, Wallet } from 'lucide-react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { glassGridTheme } from '../ag/setup'
import { FinancialCell, MoneyCell, SupplierCell } from '../ag/renderers'
import { data, inr, paymentByPo, projectById, rel, totals, usd } from '../data/source'
import type { Payment } from '../data/types'
import { StatusBadge } from '../ui/badges'
import { PaymentCard } from '../ui/finance'
import { CardHeader, GlassCard, SectionTitle, Skeleton } from '../ui/glass'
import { KpiRow } from '../ui/Kpi'

const StudioDashboard = lazy(() => import('../ag/StudioDashboard').then((m) => ({ default: m.StudioDashboard })))

type Row = Payment & { project: string; last: string; lastType: string }

export default function Payments() {
  const t = totals()
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [selected, setSelected] = useState<string>('PO-7712')

  const rows = useMemo<Row[]>(() => data.payments.map((p) => {
    const e = p.events[p.events.length - 1]
    return { ...p, project: projectById[p.projectId].name.split('·')[0].trim(), last: rel(e.at), lastType: e.type }
  }), [])

  const cols = useMemo<ColDef<Row>[]>(() => [
    { field: 'id', headerName: 'PayPal id', width: 190, cellClass: 'font-mono text-[12px]' },
    { field: 'poId', headerName: 'PO', width: 95, cellClass: 'font-semibold' },
    { field: 'project', width: 110, enableRowGroup: true },
    { field: 'supplierId', headerName: 'Supplier', flex: 1, minWidth: 210, cellRenderer: SupplierCell, enableRowGroup: true },
    { field: 'amountUsd', headerName: 'Amount', width: 110, cellRenderer: MoneyCell, aggFunc: 'sum' },
    { field: 'state', headerName: 'PayPal state', width: 165, cellRenderer: FinancialCell, enableRowGroup: true },
    { field: 'match', headerName: '3-way match', width: 130, cellRenderer: (p: { value: Payment['match'] }) =>
      p.value ? <StatusBadge tone={p.value === 'matched' ? 'good' : p.value === 'mismatch' ? 'crit' : 'muted'}>{p.value}</StatusBadge> : null },
    { field: 'lastType', headerName: 'Last event', width: 230, cellClass: 'font-mono text-[11px] text-muted-foreground' },
    { field: 'last', headerName: 'When', width: 95 },
  ], [])

  return (
    <>
      <SectionTitle title="Payments" subtitle="Every dollar the agent has held, released, voided or refunded through PayPal — and why" />
      <KpiRow items={[
        { label: 'Held (authorized, not moved)', value: usd(t.held), icon: Lock, tone: 'azure', note: inr(t.held) },
        { label: 'Released to suppliers', value: usd(t.released), icon: Wallet, tone: 'good', note: 'only after goods verified' },
        { label: 'Voided or refunded', value: usd(t.recovered), icon: Undo2, tone: 'warn', note: 'never paid for bad goods' },
        { label: 'Awaiting human release', value: usd(data.payments.filter((p) => p.state === 'awaiting_approval').reduce((a, p) => a + p.amountUsd, 0)), icon: ReceiptText, tone: 'rose', note: 'over $5,000 limit' },
      ]} />

      <GlassCard className="p-0" delay={0.1}>
        <div className="p-5 pb-0">
          <CardHeader icon={BarChart3} title="Finance studio" subtitle="AG Studio · cross-filter any widget · switch to Edit to build your own"
            action={
              <button onClick={() => setMode(mode === 'view' ? 'edit' : 'view')}
                className={cn('inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold', mode === 'edit' ? 'bg-primary text-primary-foreground' : 'bg-white/80 dark:bg-white/10')}>
                <PencilRuler className="size-3" /> {mode === 'edit' ? 'Done editing' : 'Edit dashboard'}
              </button>
            } />
        </div>
        <div className="px-3 pb-3">
          <Suspense fallback={<Skeleton className="h-[760px] w-full" />}><StudioDashboard mode={mode} /></Suspense>
        </div>
      </GlassCard>

      <div className="grid gap-4 2xl:grid-cols-[1fr_460px]">
        <GlassCard className="p-0" delay={0.15}>
          <div className="p-5 pb-2"><CardHeader icon={Wallet} tone="azure" title="PayPal ledger" subtitle="Drag a column header into the bar to group · click a row for its full trail" /></div>
          <div className="ag-glass h-[520px] px-2 pb-2">
            <AgGridReact<Row>
              theme={glassGridTheme}
              rowData={rows}
              columnDefs={cols}
              rowGroupPanelShow="always"
              suppressAggFuncInHeader
              suppressCellFocus
              getRowId={(p) => p.data.id}
              onRowClicked={(e) => e.data && setSelected(e.data.poId)}
            />
          </div>
        </GlassCard>
        <GlassCard delay={0.2} className="p-3">
          {paymentByPo[selected] && <PaymentCard payment={paymentByPo[selected]} />}
        </GlassCard>
      </div>
    </>
  )
}
