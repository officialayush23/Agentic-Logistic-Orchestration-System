// The single place screens get data from. Today it serves the sample data;
// later each function becomes a TanStack Query hook against the FastAPI backend.
import * as m from './mock'
import type { FinancialState, Project } from './types'

export const data = m

const byId = <T extends { id: string }>(xs: T[]) => Object.fromEntries(xs.map((x) => [x.id, x])) as Record<string, T>
export const supplierById = byId(m.suppliers)
export const componentById = byId(m.components)
export const projectById = byId(m.projects)
export const customerById = byId(m.customers)
export const poById = byId(m.purchaseOrders)
export const incidentById = byId(m.incidents)
export const shipmentByPo = Object.fromEntries(m.shipments.map((s) => [s.poId, s]))
export const paymentByPo = Object.fromEntries(m.payments.map((p) => [p.poId, p]))

export const projectPOs = (projectId: string) => m.purchaseOrders.filter((p) => p.projectId === projectId)
export const projectIncidents = (projectId: string) => m.incidents.filter((i) => i.projectId === projectId)
export const projectEmails = (projectId: string) => m.emails.filter((e) => e.projectId === projectId)
export const projectPayments = (projectId: string) => m.payments.filter((p) => p.projectId === projectId)
export const projectBom = (projectId: string) => m.bom.filter((b) => b.projectId === projectId)
export const projectSuppliers = (projectId: string) =>
  [...new Set(projectPOs(projectId).map((p) => p.supplierId))].map((id) => supplierById[id])

export function totals() {
  const live = m.projects.filter((p) => p.health !== 'stood_down')
  const sum = (f: (p: Project) => number) => live.reduce((a, p) => a + f(p), 0)
  const heldStates: FinancialState[] = ['funds_held']
  return {
    unitsAtRisk: live.filter((p) => p.health !== 'on_track').reduce((a, p) => a + p.units, 0),
    held: m.payments.filter((p) => heldStates.includes(p.state)).reduce((a, p) => a + p.amountUsd, 0),
    released: m.payments.filter((p) => p.state === 'funds_released' || p.state === 'payout_sent').reduce((a, p) => a + p.amountUsd, 0),
    recovered: m.payments.filter((p) => p.state === 'hold_voided' || p.state === 'refunded').reduce((a, p) => a + p.amountUsd, 0),
    committed: sum((p) => p.committedUsd),
    openIncidents: m.incidents.filter((i) => !['settled', 'clawed_back'].includes(i.stage)).length,
    inTransit: m.shipments.filter((s) => ['in_transit', 'delayed'].includes(s.status)).length,
    liesCaught: m.suppliers.reduce((a, s) => a + s.claimsContradicted, 0),
  }
}

// ---------- formatting ----------
export const usd = (n: number, compact = false) =>
  compact && Math.abs(n) >= 10_000
    ? `$${(n / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k`
    : Math.abs(n) < 100 && !Number.isInteger(n)
      ? `$${n.toFixed(2)}`
      : `$${Math.round(n).toLocaleString('en-US')}`
export const inr = (usdAmount: number) => `₹${Math.round(usdAmount * m.INR_PER_USD).toLocaleString('en-IN')}`
export const num = (n: number) => n.toLocaleString('en-IN')

export function rel(iso: string) {
  const diff = new Date(iso).getTime() - Date.now()
  const a = Math.abs(diff)
  const mins = Math.round(a / 60_000)
  const s = mins < 60 ? `${mins}m` : mins < 48 * 60 ? `${Math.round(mins / 60)}h` : `${Math.round(mins / 1440)}d`
  return diff < 0 ? `${s} ago` : `in ${s}`
}
export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
export const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
