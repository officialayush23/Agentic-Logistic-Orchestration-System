// Material → purchase order tree for one project (AG Grid tree data), with an
// inspector that shows the supplier's claim against the carrier and the money.
import type { ColDef } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import { Boxes, PackageSearch } from 'lucide-react'
import { useMemo, useState } from 'react'
import { glassGridTheme } from '../../ag/setup'
import { ConfidenceCell, FinancialCell, MoneyCell, ProgressCell, ShipmentCell, SupplierCell, TagCell } from '../../ag/renderers'
import { componentById, num, paymentByPo, poById, projectBom, projectPOs, shipmentByPo, shortDate } from '../../data/source'
import type { FinancialState, ShipmentStatus } from '../../data/types'
import { StatusBadge } from '../../ui/badges'
import { PaymentCard } from '../../ui/finance'
import { CardHeader, EmptyState, GlassCard } from '../../ui/glass'

interface TreeRow {
  path: string[]
  kind: 'material' | 'po'
  label: string
  supplierId?: string
  qty?: number
  coverage?: number
  certs?: string
  mode?: string
  ship?: ShipmentStatus
  eta?: string
  value?: number
  financial?: FinancialState
  confidence?: number
  poId?: string
}

export function MaterialsTree({ projectId }: { projectId: string }) {
  const [selected, setSelected] = useState<string | null>(projectPOs(projectId).find((p) => p.financial === 'hold_voided')?.id ?? null)

  const rows = useMemo<TreeRow[]>(() => {
    const out: TreeRow[] = []
    for (const line of projectBom(projectId)) {
      const c = componentById[line.componentId]
      const pos = projectPOs(projectId).filter((p) => p.componentId === line.componentId && p.qty > 0)
      const inbound = pos.filter((p) => !['hold_voided', 'refunded', 'not_started'].includes(p.financial)).reduce((a, p) => a + p.qty, 0)
      const key = `${c.id} · ${c.name}`
      out.push({ path: [key], kind: 'material', label: c.name, qty: line.required, coverage: Math.min(1, (line.onHand + inbound) / line.required), certs: c.certifications.join(', ') + (c.hazmat ? ' · HAZMAT' : '') })
      for (const p of pos) {
        out.push({
          path: [key, p.id], kind: 'po', label: p.id, poId: p.id, supplierId: p.supplierId, qty: p.qty, mode: p.mode,
          ship: shipmentByPo[p.id]?.status, eta: shortDate(p.etaAt), value: p.totalUsd, financial: p.financial, confidence: p.confidence,
        })
      }
    }
    return out
  }, [projectId])

  const cols = useMemo<ColDef<TreeRow>[]>(() => [
    { field: 'supplierId', headerName: 'Supplier', minWidth: 200, flex: 1, cellRenderer: SupplierCell },
    { field: 'qty', headerName: 'Qty', width: 90, type: 'rightAligned', valueFormatter: (p) => (p.value == null ? '' : num(p.value)) },
    { field: 'coverage', headerName: 'Covered incl. inbound', width: 170, cellRenderer: ProgressCell },
    { field: 'certs', headerName: 'Required certs', width: 170, cellRenderer: TagCell },
    { field: 'mode', width: 80 },
    { field: 'ship', headerName: 'Shipment', width: 150, cellRenderer: ShipmentCell },
    { field: 'eta', headerName: 'ETA', width: 85 },
    { field: 'value', headerName: 'Value', width: 95, cellRenderer: MoneyCell },
    { field: 'financial', headerName: 'PayPal', width: 160, cellRenderer: FinancialCell },
    { field: 'confidence', headerName: 'Confidence', width: 150, cellRenderer: ConfidenceCell },
  ], [])

  const po = selected ? poById[selected] : undefined
  const sh = selected ? shipmentByPo[selected] : undefined
  const pay = selected ? paymentByPo[selected] : undefined

  return (
    <div className="grid gap-4 2xl:grid-cols-[1fr_420px]">
      <GlassCard className="p-0">
        <div className="p-5 pb-2">
          <CardHeader icon={Boxes} title="Bill of materials → purchase orders" subtitle="Each material, every PO raised for it, and where its money sits. Click a PO to inspect." />
        </div>
        <div className="ag-glass h-[520px] px-2 pb-2">
          <AgGridReact<TreeRow>
            theme={glassGridTheme}
            rowData={rows}
            columnDefs={cols}
            treeData
            getDataPath={(r) => r.path}
            groupDefaultExpanded={-1}
            autoGroupColumnDef={{ headerName: 'Material / PO', minWidth: 300, cellRendererParams: { suppressCount: true } }}
            getRowId={(p) => p.data.path.join('/')}
            suppressCellFocus
            animateRows
            getRowClass={(p) => (p.data?.kind === 'material' ? 'font-semibold' : p.data?.financial === 'hold_voided' ? 'opacity-60' : '')}
            onRowClicked={(e) => e.data?.poId && setSelected(e.data.poId)}
          />
        </div>
      </GlassCard>

      <GlassCard delay={0.1}>
        <CardHeader icon={PackageSearch} tone="azure" title={po ? `${po.id} inspector` : 'Inspector'} subtitle={po ? componentById[po.componentId]?.name : 'Pick a purchase order'} />
        {!po ? (
          <EmptyState icon={PackageSearch} title="No PO selected" hint="Click any purchase order row to see the supplier's claim, the carrier's truth and the PayPal trail." />
        ) : (
          <div className="space-y-3">
            {sh && (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-white/60 p-3 dark:bg-white/5">
                  <p className="text-[11px] font-semibold text-muted-foreground">Supplier says</p>
                  <p className="mt-1 text-xs font-semibold">{sh.supplierClaim}</p>
                </div>
                <div className={`rounded-2xl p-3 ${sh.status === 'claim_mismatch' ? 'bg-crit/8 ring-1 ring-crit/30' : 'bg-white/60 dark:bg-white/5'}`}>
                  <p className="text-[11px] font-semibold text-muted-foreground">Carrier says · {sh.carrier}</p>
                  <p className="mt-1 text-xs font-semibold">{sh.carrierStatus}</p>
                </div>
              </div>
            )}
            {sh?.status === 'claim_mismatch' && <StatusBadge tone="crit" dot>Contradiction — the agent will not pay on this claim</StatusBadge>}
            {pay ? <PaymentCard payment={pay} /> : <p className="text-xs text-muted-foreground">No money committed for this PO yet.</p>}
          </div>
        )}
      </GlassCard>
    </div>
  )
}
