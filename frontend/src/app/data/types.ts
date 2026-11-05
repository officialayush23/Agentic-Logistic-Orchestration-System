// Shapes the UI renders. The backend API will return exactly these, so swapping
// sample data for live data is a change in `data/source.ts`, not in any screen.

export type Health = 'on_track' | 'at_risk' | 'critical' | 'stood_down'
export type Tone = 'violet' | 'azure' | 'rose' | 'good' | 'warn' | 'crit'

/** Where the money for one purchase order stands in PayPal. */
export type FinancialState =
  | 'not_started'
  | 'invoice_received'
  | 'invoice_mismatch'
  | 'awaiting_approval'   // above authority limit — hold placed, release needs a human
  | 'funds_held'          // Orders v2 AUTHORIZE: money reserved, not moved
  | 'funds_released'      // captured after goods verified
  | 'hold_voided'         // authorization voided — supplier contradicted by carrier
  | 'refunded'            // captured, then pulled back
  | 'payout_sent'         // Payouts: expedite fee to a forwarder
  | 'blocked'             // a Buyer Shield guard refused the hold or the capture
  | 'retention_held'      // captured less retention; the rest waits for line acceptance

export type AgentStage =
  | 'detected'
  | 'investigating'
  | 'awaiting_approval'
  | 'funds_held'
  | 'goods_verified'
  | 'settled'
  | 'clawed_back'

export type ShipmentStatus = 'in_transit' | 'delayed' | 'claim_mismatch' | 'delivered' | 'not_shipped' | 'booked'
export type Mode = 'AIR' | 'SEA' | 'ROAD' | 'RAIL'

export interface Customer { id: string; name: string; city: string; tier: 'key' | 'standard' }

export interface Project {
  id: string
  name: string
  customerId: string
  product: string
  units: number
  dueAt: string
  originalDueAt: string
  health: Health
  priority: 'low' | 'medium' | 'high' | 'critical'
  productionOrders: string[]
  /** 0–1: share of BOM lines with stock or a verified inbound shipment */
  materialsSecured: number
  committedUsd: number
  heldUsd: number
  releasedUsd: number
  recoveredUsd: number
  openIncidents: number
  owner: string
  summary: string
}

export interface Component {
  id: string
  name: string
  partNumber: string
  category: string
  hazmat: boolean
  certifications: string[]
  unitPriceUsd: number
}

export interface BomLine { projectId: string; componentId: string; perUnit: number; required: number; onHand: number }

export interface Supplier {
  id: string
  name: string
  city: string
  country: string
  lat: number
  lng: number
  reliability: number      // 0–100, learned from claims vs reality
  claimsChecked: number
  claimsContradicted: number
  paypalAccount: string
  certified: string[]
  leadDays: number
  soleSource?: boolean
}

export interface PurchaseOrder {
  id: string
  projectId: string
  componentId: string
  supplierId: string
  qty: number
  unitPriceUsd: number
  totalUsd: number
  mode: Mode
  createdAt: string
  promisedAt: string
  etaAt: string
  createdByAgent: boolean
  replacesPo?: string
  financial: FinancialState
  confidence: number        // agent's confidence in on-time delivery, 0–100
  incidentId?: string
}

export interface Shipment {
  poId: string
  status: ShipmentStatus
  supplierClaim: string
  carrierStatus: string
  carrier: string
  tracking: string
  progress: number          // 0–1 along the lane
  departedAt?: string
  promisedFrom: string
  promisedTo: string
  actualFrom?: string
  actualTo?: string
}

export interface PaymentEvent { at: string; type: string; detail: string; api: string }

export interface Payment {
  id: string                // PayPal order id
  poId: string
  projectId: string
  supplierId: string
  amountUsd: number
  state: FinancialState
  authorizationId?: string
  captureId?: string
  invoiceNumber?: string
  match: 'matched' | 'mismatch' | 'pending'
  needsApproval: boolean
  events: PaymentEvent[]
}

export interface AgentStep { at: string; label: string; status: 'done' | 'warning' | 'blocked' | 'error' | 'running'; by: 'agent' | 'llm' | 'human' | 'paypal' }

export interface Incident {
  id: string
  projectId: string
  title: string
  scenario: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  stage: AgentStage
  openedAt: string
  supplierId: string
  poId: string
  newPoId?: string
  amountUsd: number
  steps: AgentStep[]
  options: RecoveryOption[]
}

export interface RecoveryOption {
  label: string
  supplierId: string
  mode: Mode
  costUsd: number
  arrivesAt: string
  score: number
  verdict: 'chosen' | 'rejected' | 'viable'
  reason: string
}

export interface EmailMessage {
  id: string
  threadId: string
  projectId: string
  supplierId: string
  direction: 'inbound' | 'outbound'
  from: string
  subject: string
  body: string
  at: string
  extracted?: { label: string; value: string }[]
  flagged?: string
}

export interface FeedItem {
  id: string
  at: string
  kind: 'agent' | 'paypal' | 'carrier' | 'email' | 'human' | 'warehouse'
  tone: Tone
  title: string
  body: string
  projectId?: string
  severity?: 'critical' | 'high' | 'medium' | 'low'
}

export interface Approval {
  id: string
  incidentId: string
  projectId: string
  poId: string
  amountUsd: number
  limitUsd: number
  reason: string
  requestedAt: string
  expiresAt: string
  state: 'pending' | 'approved' | 'rejected'
}

export interface Plant { id: string; name: string; city: string; lat: number; lng: number }
