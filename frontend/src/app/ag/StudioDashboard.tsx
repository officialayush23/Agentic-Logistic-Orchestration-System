// AG Studio: a self-serve finance dashboard over the PayPal ledger. Ships with a
// pre-built report; switch to Edit and an analyst can drag in new widgets.
// (Studio Agent Framework hooks into `ai` once the backend LLM adapter lands.)
import { AgStudioLicenseManager, createStudio, studioTheme, type AgStudioApi } from 'ag-studio'
import { useEffect, useRef } from 'react'
import { componentById, data, poById, projectById, supplierById } from '../data/source'
import { financialMeta } from '../ui/badges'
import { useUi } from '../store'

const studioKey = import.meta.env.VITE_AG_STUDIO_LICENSE_KEY
if (studioKey) AgStudioLicenseManager.setLicenseKey(studioKey)

function sources() {
  const payments = data.payments.map((p) => ({
    payment_id: p.id,
    po: p.poId,
    project: projectById[p.projectId].name.split('·')[0].trim(),
    customer: projectById[p.projectId].customerId,
    supplier: supplierById[p.supplierId].name,
    material: componentById[poById[p.poId].componentId]?.category ?? 'Fees',
    state: financialMeta[p.state].label,
    amount_usd: p.amountUsd,
    over_limit: p.needsApproval ? 'Over limit' : 'Within limit',
    three_way_match: p.match,
    created: p.events[0]?.at.slice(0, 10),
  }))
  return {
    sources: [{
      id: 'payments',
      name: 'PayPal ledger',
      primaryKeyField: 'payment_id',
      data: payments,
      fields: [
        { id: 'payment_id', name: 'PayPal id', format: 'textFormat' },
        { id: 'po', name: 'PO', format: 'textFormat' },
        { id: 'project', name: 'Project', format: 'textFormat' },
        { id: 'customer', name: 'Customer', format: 'textFormat' },
        { id: 'supplier', name: 'Supplier', format: 'textFormat' },
        { id: 'material', name: 'Material category', format: 'textFormat' },
        { id: 'state', name: 'PayPal state', format: 'textFormat' },
        { id: 'amount_usd', name: 'Amount (USD)', format: 'currencyFormat', formatOptions: { format: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) } },
        { id: 'over_limit', name: 'Authority', format: 'textFormat' },
        { id: 'three_way_match', name: '3-way match', format: 'textFormat' },
        { id: 'created', name: 'Created', format: 'textFormat' },
      ],
    }],
  }
}

const f = (id: string, aggregation?: 'sum' | 'count') => ({ id: `payments.${id}`, ...(aggregation ? { aggregation } : {}) })
const title = (text: string) => ({ title: { text, enabled: true } })

const initialState = {
  selectedPageId: 'p1',
  pages: [{
    id: 'p1',
    widgets: {
      total: { type: 'value', dataMapping: { value: [f('amount_usd', 'sum')] }, format: title('Total committed') },
      count: { type: 'value', dataMapping: { value: [f('payment_id', 'count')] }, format: title('PayPal transactions') },
      bySupplier: { type: 'bar-chart-grouped', dataMapping: { categoryKey: [f('supplier')], valueKey: [f('amount_usd', 'sum')] }, format: title('Money by supplier') },
      byState: { type: 'donut-chart', dataMapping: { categoryKey: [f('state')], valueKey: [f('amount_usd', 'sum')] }, format: title('Where the money is') },
      byProject: { type: 'column-chart-stacked', dataMapping: { categoryKey: [f('project')], valueKey: [f('amount_usd', 'sum')] }, format: title('Money by project') },
      ledger: { type: 'grid', dataMapping: { cols: [f('payment_id'), f('po'), f('supplier'), f('state'), f('three_way_match'), f('amount_usd')] }, format: title('Ledger') },
    },
    widgetLayout: {
      total: { xTrack: 0, yTrack: 0, xSpan: 3, ySpan: 3 },
      count: { xTrack: 3, yTrack: 0, xSpan: 3, ySpan: 3 },
      byState: { xTrack: 6, yTrack: 0, xSpan: 6, ySpan: 7 },
      bySupplier: { xTrack: 0, yTrack: 3, xSpan: 6, ySpan: 8 },
      byProject: { xTrack: 6, yTrack: 7, xSpan: 6, ySpan: 7 },
      ledger: { xTrack: 0, yTrack: 11, xSpan: 6, ySpan: 7 },
    },
  }],
}

export function StudioDashboard({ mode, height = 760 }: { mode: 'view' | 'edit'; height?: number }) {
  const el = useRef<HTMLDivElement>(null)
  const api = useRef<AgStudioApi | null>(null)
  const dark = useUi((s) => s.theme === 'dark')

  useEffect(() => {
    if (!el.current) return
    api.current = createStudio(el.current, {
      data: sources() as never,
      initialState: initialState as never,
      mode,
      theme: studioTheme.withParams({
        fontFamily: 'Inter Variable, ui-sans-serif, system-ui',
        fontSize: 12,
        accentColor: '#5e59f1',
        foregroundColor: dark ? '#eceaff' : '#1a1b3b',
        backgroundColor: 'transparent',
        borderColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.85)',
        studioCanvasBackgroundColor: 'transparent',
        studioPanelContainerBackgroundColor: dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.55)',
        studioWidgetBackgroundColor: dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.62)',
        studioWidgetTitleFontSize: 13,
        studioWidgetTitleFontWeight: 600,
        studioWidgetTitleTextColor: dark ? '#eceaff' : '#1a1b3b',
        studioCanvasBorder: 'none',
        menuBackgroundColor: dark ? '#2b2950' : '#fbfaff',
      } as never),
      panels: { view: { right: [] }, edit: { right: ['edit', 'data', 'filters'] } },
      layout: {
        columns: 12, rowHeight: 34, backgroundColor: 'transparent',
        widgetBackgroundColor: dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.62)',
        widgetBorderEnabled: true, widgetBorderColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.85)',
        widgetBorderWidth: 1, widgetBorderRadius: 18, widgetPadding: 12,
      },
      onErrorRaised: (e: unknown) => console.warn('[AG Studio]', e),
    })
    return () => { api.current?.destroy(); api.current = null }
  }, [dark]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { api.current?.setProperty('mode' as never, mode as never) }, [mode])

  return <div ref={el} style={{ height }} className="studio-glass w-full" />
}
