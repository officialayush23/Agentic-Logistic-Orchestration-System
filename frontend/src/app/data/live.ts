// Live data from the FastAPI backend, overlaid on the sample world by id.
//
// Overlay, not replace: a live fact only lands on an entity the UI already
// knows (project, supplier, PO, payment), so no screen can end up with a
// reference to something it cannot look up. New live records are added only
// when everything they point at exists. Append ?data=sample to the URL to see
// the pure sample world.
import * as m from './mock'
import type { Approval, FeedItem, Payment, PurchaseOrder } from './types'

export const API = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')
const DEMO = { email: import.meta.env.VITE_DEMO_EMAIL ?? 'demo@disruptionops.io', password: import.meta.env.VITE_DEMO_PASSWORD ?? 'DemoPass123!' }

export interface GuardEvent {
  id: number; guard: string; outcome: string; po_id?: string; supplier_id?: string; incident_id?: string
  amount_usd: number; reason: string; agent?: string; created_at: string
}
export interface BuyTimer { projectId: string; componentId: string; name?: string; qty: number; needBy: string; orderBy: string; orderedPoId?: string | null; approvedAlternates?: unknown[]; eolDate?: string | null; ltbDate?: string | null }
export interface Subtier { supplierId: string; name: string; city?: string; lat: number; lng: number; category?: string; sharedBy: number }
export interface Envelope { projectId: string; category?: string | null; windowStart: string; windowEnd: string; capUsd: number }
export interface LiveExtras {
  mode: 'live' | 'sample'
  reason?: string
  shield: { total_usd: number; by_guard: Record<string, { count: number; usd: number }> }
  buyTimers: BuyTimer[]
  budgetEnvelopes: Envelope[]
  subtiers: Subtier[]
  incidents: { id: string; title: string; stage: string; severity: string; openedAt: string }[]
}
export const live: LiveExtras = { mode: 'sample', shield: { total_usd: 0, by_guard: {} }, buyTimers: [], budgetEnvelopes: [], subtiers: [], incidents: [] }

let token: string | null = null
function stored(): string | null { try { return localStorage.getItem('dops_token') } catch { return null } }
function store(t: string) { try { localStorage.setItem('dops_token', t) } catch { /* private mode */ } }

async function login(): Promise<string> {
  const r = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(DEMO) })
  if (!r.ok) throw new Error(`login ${r.status}`)
  const j = await r.json()
  const t = j.token ?? j.access_token
  store(t)
  return t
}

/** Authenticated JSON call; logs in with the demo account on first use or a 401. */
export async function api<T = unknown>(path: string, init: RequestInit = {}, timeoutMs = 120_000): Promise<T> {
  if (!API) throw new Error('VITE_API_BASE is not set')
  token = token ?? stored() ?? (await login())
  const go = (t: string) => fetch(`${API}${path}`, {
    ...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}`, ...(init.headers ?? {}) },
  })
  let r = await go(token)
  if (r.status === 401) { token = await login(); r = await go(token) }
  if (!r.ok) throw new Error(`${path} → ${r.status} ${await r.text().catch(() => '')}`.slice(0, 300))
  return r.json() as Promise<T>
}

type Snapshot = Partial<{
  projects: (Partial<(typeof m.projects)[number]> & { id: string })[]
  suppliers: (Partial<(typeof m.suppliers)[number]> & { id: string })[]
  purchaseOrders: PurchaseOrder[]
  payments: Payment[]
  approvals: Approval[]
  feed: FeedItem[]
  incidents: LiveExtras['incidents']
  buyTimers: BuyTimer[]
  budgetEnvelopes: Envelope[]
  subtiers: Subtier[]
  shield: LiveExtras['shield']
}>

const has = <T extends { id: string }>(xs: T[], id?: string) => !!id && xs.some((x) => x.id === id)

function overlay(s: Snapshot) {
  for (const p of s.projects ?? []) {
    const t = m.projects.find((x) => x.id === p.id)
    if (!t) continue
    for (const k of ['committedUsd', 'heldUsd', 'releasedUsd', 'recoveredUsd'] as const) if ((p[k] ?? 0) > 0) t[k] = p[k]!
    if (p.dueAt) t.dueAt = p.dueAt
  }
  for (const sp of s.suppliers ?? []) {
    const t = m.suppliers.find((x) => x.id === sp.id)
    if (!t) continue
    if (sp.paypalAccount) t.paypalAccount = sp.paypalAccount
    if (sp.healthScore != null) t.healthScore = sp.healthScore
    if (sp.signals?.length) t.signals = sp.signals
    if (sp.trust) { t.trust = sp.trust; t.memoryCounts = sp.memoryCounts }
    if ((sp.claimsChecked ?? 0) > 0) { t.claimsChecked = sp.claimsChecked!; t.claimsContradicted = sp.claimsContradicted ?? t.claimsContradicted }
  }
  for (const po of s.purchaseOrders ?? []) {
    const t = m.purchaseOrders.find((x) => x.id === po.id)
    if (t) { if (po.financial !== 'not_started') t.financial = po.financial; continue }
    if (has(m.projects, po.projectId) && has(m.suppliers, po.supplierId) && has(m.components, po.componentId)) m.purchaseOrders.push(po)
  }
  for (const pay of s.payments ?? []) {
    const t = m.payments.find((x) => x.poId === pay.poId)
    if (t) {
      Object.assign(t, { state: pay.state, amountUsd: pay.amountUsd, match: pay.match, needsApproval: pay.needsApproval },
        pay.authorizationId ? { id: pay.id, authorizationId: pay.authorizationId } : {},
        pay.captureId ? { captureId: pay.captureId } : {},
        pay.events?.length ? { events: pay.events } : {})
    } else if (m.purchaseOrders.some((p) => p.id === pay.poId)) {
      const po = m.purchaseOrders.find((p) => p.id === pay.poId)!
      m.payments.push({ ...pay, projectId: pay.projectId || po.projectId, supplierId: pay.supplierId || po.supplierId })
    }
  }
  for (const a of s.approvals ?? []) {
    if (!m.approvals.some((x) => x.id === a.id) && m.purchaseOrders.some((p) => p.id === a.poId) && has(m.projects, a.projectId)) m.approvals.unshift(a)
  }
  if (s.feed?.length) m.feed.unshift(...s.feed.slice(0, 15).map((f) => ({ ...f, id: `live-${f.id}` })))
}

/** Called once before the app renders. Never blocks longer than `waitMs`. */
export async function bootLive(waitMs = 7000): Promise<void> {
  if (new URLSearchParams(location.search).get('data') === 'sample' || !API) { live.reason = API ? 'sample requested' : 'no API configured'; return }
  try {
    const s = await api<Snapshot>('/api/ui/snapshot', {}, waitMs)
    overlay(s)
    Object.assign(live, {
      mode: 'live', shield: s.shield ?? live.shield, buyTimers: s.buyTimers ?? [], budgetEnvelopes: s.budgetEnvelopes ?? [], subtiers: s.subtiers ?? [],
      incidents: (s.incidents ?? []).map((i) => ({ id: i.id, title: i.title, stage: i.stage, severity: i.severity, openedAt: i.openedAt })),
    })
  } catch (e) {
    live.reason = e instanceof Error ? e.message : String(e)
    // A sleeping free-tier backend: wake it for the next visit, don't hold the UI hostage.
    fetch(`${API}/api/health`).catch(() => undefined)
  }
}

/** Buy timers for the UI: live BOM lines when connected, otherwise derived from the sample BOM. */
const SAMPLE_LEAD = [3, 5, 4, 9, 2, 7, 6, 12, 4, 8, 5, 10, 3, 11]
export function buyTimers(projectId?: string): BuyTimer[] {
  const all: BuyTimer[] = live.buyTimers.length ? live.buyTimers : m.bom.map((b, i) => {
    const due = m.projects.find((p) => p.id === b.projectId)?.dueAt ?? new Date().toISOString()
    return {
      projectId: b.projectId, componentId: b.componentId, name: m.components.find((c) => c.id === b.componentId)?.name,
      qty: b.required, needBy: due,
      orderBy: new Date(new Date(due).getTime() - SAMPLE_LEAD[i % SAMPLE_LEAD.length] * 86_400_000).toISOString(),
      orderedPoId: b.onHand >= b.required ? 'in stock' : null,
    }
  })
  return projectId ? all.filter((t) => t.projectId === projectId) : all
}

/** Sub-tier suppliers (who your suppliers buy from). Sample: two "independent" connector sources share one plating house. */
export function subtiers(): Subtier[] {
  if (live.subtiers.length) return live.subtiers
  const penang = { name: 'Penang Plating Works', city: 'Penang', lat: 5.41, lng: 100.33, category: 'connector plating', sharedBy: 2 }
  return [{ supplierId: 'SUP-42', ...penang }, { supplierId: 'SUP-77', ...penang }]
}
