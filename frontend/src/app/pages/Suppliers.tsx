import type { ColDef } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import { Factory, Gauge, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useMemo } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { glassGridTheme } from '../ag/setup'
import { ConfidenceCell, MoneyCell, TagCell } from '../ag/renderers'
import { data } from '../data/source'
import type { Supplier } from '../data/types'
import { StatusBadge } from '../ui/badges'
import { CardHeader, GlassCard, SectionTitle } from '../ui/glass'
import { KpiRow } from '../ui/Kpi'
import { axis, GlassTooltip } from '../viz/chartKit'

type Row = Supplier & { lieRate: number; atRisk: number; recovered: number; certs: string; location: string }

export default function Suppliers() {
  const rows = useMemo<Row[]>(() => data.suppliers.map((s) => ({
    ...s,
    location: `${s.city}, ${s.country}`,
    lieRate: s.claimsChecked ? Math.round((s.claimsContradicted / s.claimsChecked) * 100) : 0,
    atRisk: data.payments.filter((p) => p.supplierId === s.id && ['funds_held', 'awaiting_approval'].includes(p.state)).reduce((a, p) => a + p.amountUsd, 0),
    recovered: data.payments.filter((p) => p.supplierId === s.id && ['hold_voided', 'refunded'].includes(p.state)).reduce((a, p) => a + p.amountUsd, 0),
    certs: s.certified.join(' · ') || 'none',
  })).sort((a, b) => a.reliability - b.reliability), [])

  const cols = useMemo<ColDef<Row>[]>(() => [
    { field: 'name', headerName: 'Supplier', flex: 1, minWidth: 200, cellClass: 'font-semibold' },
    { field: 'location', minWidth: 160, flex: 0.8 },
    { field: 'reliability', headerName: 'Learned reliability', width: 190, cellRenderer: ConfidenceCell, sort: 'asc' },
    { field: 'trust', headerName: 'Agent memory', width: 140, headerTooltip: 'Trust level the agent team learned (LangGraph long-term memory)',
      cellRenderer: (p: { value?: string }) => p.value
        ? <span className="flex h-full items-center"><StatusBadge tone={p.value === 'proof_only' ? 'crit' : p.value === 'watch' ? 'warn' : 'good'} dot>{p.value === 'proof_only' ? 'proof only' : p.value}</StatusBadge></span> : null },
    { field: 'healthScore', headerName: 'Health', width: 100, type: 'rightAligned', cellClass: (p) => ((p.value ?? 100) < 50 ? 'text-crit font-semibold' : '') },
    { field: 'signals', headerName: 'Risk signals', width: 260, valueFormatter: (p) => (p.value?.length ? p.value.join(' · ') : '—'), tooltipValueGetter: (p) => p.value?.join('\n') },
    { field: 'claimsChecked', headerName: 'Claims checked', width: 130, type: 'rightAligned' },
    { field: 'claimsContradicted', headerName: 'Contradicted', width: 120, type: 'rightAligned', cellClass: (p) => (p.value ? 'text-crit font-semibold' : '') },
    { field: 'lieRate', headerName: 'Lie rate', width: 95, type: 'rightAligned', valueFormatter: (p) => `${p.value}%` },
    { field: 'atRisk', headerName: 'Funds held', width: 110, cellRenderer: MoneyCell },
    { field: 'recovered', headerName: 'Recovered', width: 110, cellRenderer: MoneyCell },
    { field: 'certs', headerName: 'Certifications', width: 200, cellRenderer: TagCell },
    { field: 'leadDays', headerName: 'Lead (d)', width: 90, type: 'rightAligned' },
  ], [])

  const color = (r: number) => (r < 50 ? 'var(--crit)' : r < 75 ? 'var(--warn)' : 'var(--chart-1)')
  return (
    <>
      <SectionTitle title="Suppliers" subtitle="Reliability is learned, not declared: every claim is checked against the carrier and the warehouse" />
      <KpiRow items={[
        { label: 'Suppliers watched', value: String(data.suppliers.length), icon: Factory, tone: 'violet', note: '6 countries' },
        { label: 'Claims checked', value: String(data.suppliers.reduce((a, s) => a + s.claimsChecked, 0)), icon: Gauge, tone: 'azure', note: 'against carrier + receipts' },
        { label: 'Claims contradicted', value: String(data.suppliers.reduce((a, s) => a + s.claimsContradicted, 0)), icon: ShieldAlert, tone: 'crit', note: 'each one blocked a payment' },
        { label: 'Trusted (≥ 85)', value: String(data.suppliers.filter((s) => s.reliability >= 85).length), icon: ShieldCheck, tone: 'good', note: 'preferred for re-sourcing' },
      ]} />
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <GlassCard className="p-0" delay={0.1}>
          <div className="p-5 pb-2"><CardHeader icon={Factory} title="Supplier trust ledger" subtitle="Lowest reliability first" /></div>
          <div className="ag-glass h-[560px] px-2 pb-2">
            <AgGridReact<Row> theme={glassGridTheme} rowData={rows} columnDefs={cols} suppressCellFocus getRowId={(p) => p.data.id} />
          </div>
        </GlassCard>
        <GlassCard delay={0.15}>
          <CardHeader icon={Gauge} title="Reliability by supplier" subtitle="Drops every time a claim is contradicted" />
          <div className="h-[520px]">
            <ResponsiveContainer>
              <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 12 }}>
                <XAxis type="number" domain={[0, 100]} {...axis} />
                <YAxis type="category" dataKey="name" width={150} {...axis} />
                <Tooltip content={<GlassTooltip format={(v) => `${v} / 100`} />} cursor={{ fill: 'oklch(0.56 0.22 278 / 0.05)' }} />
                <Bar dataKey="reliability" name="Reliability" radius={[0, 8, 8, 0]} barSize={16}>
                  {rows.map((r) => <Cell key={r.id} fill={color(r.reliability)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </div>
    </>
  )
}
