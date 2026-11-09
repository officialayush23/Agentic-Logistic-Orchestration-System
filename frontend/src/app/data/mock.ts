// Sample data for the UI build and the first video cut.
// It mirrors the real seed (supabase/seed.sql): same customers, suppliers,
// production orders and the S1–S5 scenarios. Times are relative to "now" so the
// demo never looks stale. Replaced screen by screen by the live API.
import type {
  Approval, BomLine, Component, Customer, EmailMessage, FeedItem, Incident,
  Payment, Plant, Project, PurchaseOrder, Shipment, Supplier,
} from './types'

const H = 3_600_000
const now = Date.now()
const at = (hours: number) => new Date(now + hours * H).toISOString()

export const AUTHORITY_LIMIT_USD = 5000
export const INR_PER_USD = 84

export const plant: Plant = { id: 'Pune-Plant-1', name: 'Pune Plant 1', city: 'Chakan, Pune', lat: 18.52, lng: 73.86 }

export const customers: Customer[] = [
  { id: 'CUS-BEV', name: 'Bharat EV Motors', city: 'Chennai', tier: 'key' },
  { id: 'CUS-SHK', name: 'Shakti Auto', city: 'Pune', tier: 'key' },
  { id: 'CUS-KFM', name: 'Kinetic Fleet Mobility', city: 'Bengaluru', tier: 'standard' },
]
export const customerCoords: Record<string, [number, number]> = {
  'CUS-BEV': [13.08, 80.27], 'CUS-SHK': [18.74, 73.83], 'CUS-KFM': [12.97, 77.59],
}

export const components: Component[] = [
  { id: 'COMP-104', name: 'Automotive MCU, 32-bit', partNumber: 'MCU-32A-AEC', category: 'Semiconductors', hazmat: false, certifications: ['AEC-Q100'], unitPriceUsd: 8.4 },
  { id: 'COMP-118', name: 'CAN connector, 12-pin', partNumber: 'CON-CAN12', category: 'Connectors', hazmat: false, certifications: ['IATF 16949'], unitPriceUsd: 1.15 },
  { id: 'COMP-130', name: '6-layer controller PCB', partNumber: 'PCB-6L-SCU', category: 'PCB', hazmat: false, certifications: ['IPC-A-610'], unitPriceUsd: 3.9 },
  { id: 'COMP-150', name: 'Hall current sensor', partNumber: 'HCS-200', category: 'Sensors', hazmat: false, certifications: ['AEC-Q100'], unitPriceUsd: 2.7 },
  { id: 'COMP-207', name: 'BMS monitor IC, 16S', partNumber: 'BMS-IC-16S', category: 'Semiconductors', hazmat: false, certifications: ['AEC-Q100', 'ISO 26262'], unitPriceUsd: 14.2 },
  { id: 'COMP-311', name: 'Li-ion cell module 4S', partNumber: 'CELL-4S-21700', category: 'Energy', hazmat: true, certifications: ['UN 38.3'], unitPriceUsd: 22.5 },
  { id: 'COMP-402', name: 'LTE Cat-1 modem', partNumber: 'LTE-C1-IND', category: 'RF', hazmat: false, certifications: ['PTCRB', 'BIS'], unitPriceUsd: 11.8 },
  { id: 'COMP-520', name: '7-inch automotive TFT', partNumber: 'TFT-7-AUTO', category: 'Displays', hazmat: false, certifications: ['AEC-Q100'], unitPriceUsd: 18.6 },
  { id: 'COMP-610', name: 'Controller wiring harness', partNumber: 'HAR-SCU-01', category: 'Harness', hazmat: false, certifications: ['IATF 16949'], unitPriceUsd: 4.3 },
]

export const suppliers: Supplier[] = [
  { id: 'SUP-21', name: 'Zhen Hua Electronics', city: 'Shenzhen', country: 'China', lat: 22.54, lng: 114.06, reliability: 41, claimsChecked: 17, claimsContradicted: 6, paypalAccount: 'sup21@business.example.com', certified: ['AEC-Q100'], leadDays: 9 },
  { id: 'SUP-57', name: 'Formosa Precision', city: 'Hsinchu', country: 'Taiwan', lat: 24.8, lng: 120.97, reliability: 93, claimsChecked: 22, claimsContradicted: 0, paypalAccount: 'sup57@business.example.com', certified: ['AEC-Q100', 'IATF 16949'], leadDays: 4 },
  { id: 'SUP-42', name: 'Western Components Ltd', city: 'Mumbai', country: 'India', lat: 19.07, lng: 72.88, reliability: 86, claimsChecked: 31, claimsContradicted: 2, paypalAccount: 'sup42@business.example.com', certified: ['IATF 16949'], leadDays: 2 },
  { id: 'SUP-71', name: 'AeroCell Logistics', city: 'Singapore', country: 'Singapore', lat: 1.35, lng: 103.82, reliability: 88, claimsChecked: 14, claimsContradicted: 1, paypalAccount: 'sup71@business.example.com', certified: ['AEC-Q100'], leadDays: 3 },
  { id: 'SUP-33', name: 'Deccan Rapid Supply', city: 'Hyderabad', country: 'India', lat: 17.39, lng: 78.49, reliability: 79, claimsChecked: 19, claimsContradicted: 2, paypalAccount: 'sup33@business.example.com', certified: ['IPC-A-610'], leadDays: 2 },
  { id: 'SUP-95', name: 'Nexus Micro', city: 'Penang', country: 'Malaysia', lat: 5.41, lng: 100.33, reliability: 90, claimsChecked: 11, claimsContradicted: 0, paypalAccount: 'sup95@business.example.com', certified: ['AEC-Q100', 'ISO 26262'], leadDays: 5, soleSource: true },
  { id: 'SUP-18', name: 'Budget Semicon Traders', city: 'Guangzhou', country: 'China', lat: 23.13, lng: 113.26, reliability: 52, claimsChecked: 9, claimsContradicted: 3, paypalAccount: '—', certified: [], leadDays: 6 },
  { id: 'SUP-29', name: 'Lowcost Display Co', city: 'Dongguan', country: 'China', lat: 23.02, lng: 113.75, reliability: 58, claimsChecked: 12, claimsContradicted: 2, paypalAccount: 'sup29@business.example.com', certified: ['AEC-Q100'], leadDays: 12 },
  { id: 'SUP-77', name: 'Sahyadri Harness Works', city: 'Nashik', country: 'India', lat: 19.99, lng: 73.79, reliability: 84, claimsChecked: 26, claimsContradicted: 1, paypalAccount: 'sup77@business.example.com', certified: ['IATF 16949'], leadDays: 1 },
  { id: 'SUP-112', name: 'Rhein Sensorik GmbH', city: 'Stuttgart', country: 'Germany', lat: 48.78, lng: 9.18, reliability: 95, claimsChecked: 8, claimsContradicted: 0, paypalAccount: 'sup112@business.example.com', certified: ['AEC-Q100', 'IATF 16949'], leadDays: 6 },
  { id: 'SUP-120', name: 'Lakeshore Semiconductors', city: 'Austin', country: 'United States', lat: 30.27, lng: -97.74, reliability: 91, claimsChecked: 10, claimsContradicted: 0, paypalAccount: 'sup120@business.example.com', certified: ['PTCRB', 'AEC-Q100'], leadDays: 7 },
  { id: 'SUP-131', name: 'Nippon Cell Tech', city: 'Osaka', country: 'Japan', lat: 34.69, lng: 135.5, reliability: 94, claimsChecked: 13, claimsContradicted: 0, paypalAccount: 'sup131@business.example.com', certified: ['UN 38.3'], leadDays: 14 },
]

export const projects: Project[] = [
  {
    id: 'PRJ-2041', name: 'SCU-700 · Smart Controller Units', customerId: 'CUS-BEV', product: 'Smart Controller Unit', units: 700,
    dueAt: at(6 * 24), originalDueAt: at(6 * 24), health: 'critical', priority: 'high', productionOrders: ['PROD-882', 'PROD-884'],
    materialsSecured: 0.62, committedUsd: 13_445, heldUsd: 9_995, releasedUsd: 3_010, recoveredUsd: 5_880, openIncidents: 1, owner: 'A. Kulkarni',
    summary: 'Zhen Hua claimed the MCUs shipped; the carrier never collected them. Agent voided the $5,880 hold and re-sourced to Formosa by air.',
  },
  {
    id: 'PRJ-2042', name: 'BMS-380 · Battery Management Systems', customerId: 'CUS-BEV', product: 'Battery Mgmt System', units: 380,
    dueAt: at(9 * 24), originalDueAt: at(9 * 24), health: 'at_risk', priority: 'critical', productionOrders: ['PROD-883', 'PROD-887'],
    materialsSecured: 0.71, committedUsd: 22_496, heldUsd: 17_100, releasedUsd: 5_396, recoveredUsd: 0, openIncidents: 1, owner: 'R. Iyer',
    summary: 'Cheapest BMS IC quote was uncertified and refused. Li-ion modules are hazmat, so they cannot fly — sea freight is tight against the due date.',
  },
  {
    id: 'PRJ-2043', name: 'TCU-500 · Telematics Units', customerId: 'CUS-SHK', product: 'Telematics Unit', units: 500,
    dueAt: at(11 * 24), originalDueAt: at(11 * 24), health: 'on_track', priority: 'medium', productionOrders: ['PROD-885'],
    materialsSecured: 0.88, committedUsd: 7_850, heldUsd: 5_900, releasedUsd: 1_950, recoveredUsd: 1_240, openIncidents: 1, owner: 'A. Kulkarni',
    summary: 'Stock record says 600 modems on hand; the warehouse counted 140. Agent asked the floor before trusting either number.',
  },
  {
    id: 'PRJ-2044', name: 'IC-450 · Instrument Clusters', customerId: 'CUS-SHK', product: 'Instrument Cluster', units: 450,
    dueAt: at(14 * 24), originalDueAt: at(13 * 24), health: 'at_risk', priority: 'low', productionOrders: ['PROD-886'],
    materialsSecured: 0.4, committedUsd: 9_855, heldUsd: 0, releasedUsd: 0, recoveredUsd: 8_370, openIncidents: 1, owner: 'S. Deshmukh',
    summary: 'Display supplier stuck behind port congestion. Best recovery costs $9,855 — over the $5,000 authority limit, so it waits for a human.',
  },
  {
    id: 'PRJ-2046', name: 'Fleet telematics retrofit', customerId: 'CUS-KFM', product: 'Telematics Unit', units: 1200,
    dueAt: at(24 * 24), originalDueAt: at(24 * 24), health: 'on_track', priority: 'medium', productionOrders: ['PROD-901'],
    materialsSecured: 0.35, committedUsd: 4_140, heldUsd: 4_140, releasedUsd: 0, recoveredUsd: 0, openIncidents: 0, owner: 'R. Iyer',
    summary: 'Long-lead modems booked by sea from Austin; connectors local. No disruptions.',
  },
  {
    id: 'PRJ-2045', name: 'SCU-300 · Smart Controller Units', customerId: 'CUS-SHK', product: 'Smart Controller Unit', units: 300,
    dueAt: at(17 * 24), originalDueAt: at(17 * 24), health: 'stood_down', priority: 'low', productionOrders: ['PROD-888'],
    materialsSecured: 1, committedUsd: 0, heldUsd: 0, releasedUsd: 0, recoveredUsd: 0, openIncidents: 0, owner: 'S. Deshmukh',
    summary: 'Fully allocated from stock. Agent stood this run down so its MCUs could cover SCU-700.',
  },
]

export const bom: BomLine[] = [
  { projectId: 'PRJ-2041', componentId: 'COMP-104', perUnit: 1, required: 700, onHand: 0 },
  { projectId: 'PRJ-2041', componentId: 'COMP-118', perUnit: 3, required: 2100, onHand: 300 },
  { projectId: 'PRJ-2041', componentId: 'COMP-130', perUnit: 1, required: 700, onHand: 700 },
  { projectId: 'PRJ-2041', componentId: 'COMP-150', perUnit: 1, required: 700, onHand: 0 },
  { projectId: 'PRJ-2041', componentId: 'COMP-610', perUnit: 1, required: 700, onHand: 700 },
  { projectId: 'PRJ-2042', componentId: 'COMP-207', perUnit: 1, required: 380, onHand: 0 },
  { projectId: 'PRJ-2042', componentId: 'COMP-311', perUnit: 2, required: 760, onHand: 0 },
  { projectId: 'PRJ-2042', componentId: 'COMP-130', perUnit: 1, required: 380, onHand: 380 },
  { projectId: 'PRJ-2043', componentId: 'COMP-402', perUnit: 1, required: 500, onHand: 140 },
  { projectId: 'PRJ-2043', componentId: 'COMP-130', perUnit: 1, required: 500, onHand: 0 },
  { projectId: 'PRJ-2044', componentId: 'COMP-520', perUnit: 1, required: 450, onHand: 0 },
  { projectId: 'PRJ-2044', componentId: 'COMP-104', perUnit: 1, required: 450, onHand: 450 },
  { projectId: 'PRJ-2046', componentId: 'COMP-402', perUnit: 1, required: 1200, onHand: 0 },
  { projectId: 'PRJ-2046', componentId: 'COMP-118', perUnit: 2, required: 2400, onHand: 0 },
]

const po = (p: Omit<PurchaseOrder, 'totalUsd'>): PurchaseOrder => ({ ...p, totalUsd: Math.round(p.qty * p.unitPriceUsd) })

export const purchaseOrders: PurchaseOrder[] = [
  po({ id: 'PO-7712', projectId: 'PRJ-2041', componentId: 'COMP-104', supplierId: 'SUP-21', qty: 700, unitPriceUsd: 8.4, mode: 'SEA', createdAt: at(-9 * 24), promisedAt: at(-1 * 24), etaAt: at(8 * 24), createdByAgent: false, financial: 'hold_voided', confidence: 8, incidentId: 'INC-301' }),
  po({ id: 'PO-7790', projectId: 'PRJ-2041', componentId: 'COMP-104', supplierId: 'SUP-57', qty: 700, unitPriceUsd: 9.4, mode: 'AIR', createdAt: at(-5), promisedAt: at(46), etaAt: at(44), createdByAgent: true, replacesPo: 'PO-7712', financial: 'funds_held', confidence: 91, incidentId: 'INC-301' }),
  po({ id: 'PO-7715', projectId: 'PRJ-2041', componentId: 'COMP-118', supplierId: 'SUP-42', qty: 1800, unitPriceUsd: 1.15, mode: 'ROAD', createdAt: at(-3 * 24), promisedAt: at(20), etaAt: at(18), createdByAgent: false, financial: 'funds_held', confidence: 86 }),
  po({ id: 'PO-7716', projectId: 'PRJ-2041', componentId: 'COMP-150', supplierId: 'SUP-112', qty: 700, unitPriceUsd: 2.7, mode: 'AIR', createdAt: at(-4 * 24), promisedAt: at(60), etaAt: at(64), createdByAgent: false, financial: 'invoice_received', confidence: 74 }),
  po({ id: 'PO-7714', projectId: 'PRJ-2041', componentId: 'COMP-610', supplierId: 'SUP-77', qty: 700, unitPriceUsd: 4.3, mode: 'ROAD', createdAt: at(-6 * 24), promisedAt: at(-2 * 24), etaAt: at(-2 * 24), createdByAgent: false, financial: 'funds_released', confidence: 100 }),
  po({ id: 'PO-7718', projectId: 'PRJ-2041', componentId: 'COMP-104', supplierId: 'SUP-71', qty: 0, unitPriceUsd: 0, mode: 'AIR', createdAt: at(-5), promisedAt: at(40), etaAt: at(40), createdByAgent: true, financial: 'payout_sent', confidence: 100, incidentId: 'INC-301' }),

  po({ id: 'PO-7720', projectId: 'PRJ-2042', componentId: 'COMP-207', supplierId: 'SUP-18', qty: 0, unitPriceUsd: 11.9, mode: 'SEA', createdAt: at(-30), promisedAt: at(5 * 24), etaAt: at(5 * 24), createdByAgent: false, financial: 'not_started', confidence: 0, incidentId: 'INC-302' }),
  po({ id: 'PO-7721', projectId: 'PRJ-2042', componentId: 'COMP-207', supplierId: 'SUP-95', qty: 380, unitPriceUsd: 14.2, mode: 'AIR', createdAt: at(-28), promisedAt: at(-2), etaAt: at(-3), createdByAgent: true, financial: 'funds_released', confidence: 100, incidentId: 'INC-302' }),
  po({ id: 'PO-7722', projectId: 'PRJ-2042', componentId: 'COMP-311', supplierId: 'SUP-131', qty: 760, unitPriceUsd: 22.5, mode: 'SEA', createdAt: at(-7 * 24), promisedAt: at(6 * 24), etaAt: at(7 * 24), createdByAgent: false, financial: 'funds_held', confidence: 63, incidentId: 'INC-305' }),

  po({ id: 'PO-7731', projectId: 'PRJ-2043', componentId: 'COMP-402', supplierId: 'SUP-120', qty: 500, unitPriceUsd: 11.8, mode: 'AIR', createdAt: at(-2 * 24), promisedAt: at(3 * 24), etaAt: at(3 * 24 - 6), createdByAgent: false, financial: 'funds_held', confidence: 88 }),
  po({ id: 'PO-7732', projectId: 'PRJ-2043', componentId: 'COMP-130', supplierId: 'SUP-33', qty: 500, unitPriceUsd: 3.9, mode: 'ROAD', createdAt: at(-5 * 24), promisedAt: at(-24), etaAt: at(-26), createdByAgent: false, financial: 'funds_released', confidence: 100 }),
  po({ id: 'PO-7730', projectId: 'PRJ-2043', componentId: 'COMP-402', supplierId: 'SUP-18', qty: 105, unitPriceUsd: 11.8, mode: 'SEA', createdAt: at(-12 * 24), promisedAt: at(-6 * 24), etaAt: at(-6 * 24), createdByAgent: false, financial: 'refunded', confidence: 0, incidentId: 'INC-299' }),

  po({ id: 'PO-7741', projectId: 'PRJ-2044', componentId: 'COMP-520', supplierId: 'SUP-29', qty: 450, unitPriceUsd: 18.6, mode: 'SEA', createdAt: at(-10 * 24), promisedAt: at(2 * 24), etaAt: at(9 * 24), createdByAgent: false, financial: 'hold_voided', confidence: 22, incidentId: 'INC-303' }),
  po({ id: 'PO-7742', projectId: 'PRJ-2044', componentId: 'COMP-520', supplierId: 'SUP-71', qty: 450, unitPriceUsd: 21.9, mode: 'AIR', createdAt: at(-1), promisedAt: at(3 * 24), etaAt: at(3 * 24), createdByAgent: true, replacesPo: 'PO-7741', financial: 'awaiting_approval', confidence: 89, incidentId: 'INC-303' }),

  po({ id: 'PO-7751', projectId: 'PRJ-2046', componentId: 'COMP-118', supplierId: 'SUP-42', qty: 2400, unitPriceUsd: 1.15, mode: 'ROAD', createdAt: at(-24), promisedAt: at(10 * 24), etaAt: at(10 * 24), createdByAgent: false, financial: 'funds_held', confidence: 90 }),
  po({ id: 'PO-7752', projectId: 'PRJ-2046', componentId: 'COMP-402', supplierId: 'SUP-120', qty: 120, unitPriceUsd: 11.5, mode: 'SEA', createdAt: at(-24), promisedAt: at(19 * 24), etaAt: at(19 * 24), createdByAgent: false, financial: 'funds_held', confidence: 84 }),
]
// The expedite payout is a fee, not goods.
purchaseOrders.find((p) => p.id === 'PO-7718')!.totalUsd = 415

export const shipments: Shipment[] = [
  { poId: 'PO-7712', status: 'claim_mismatch', supplierClaim: 'Dispatched 3 days ago', carrierStatus: 'Label created — no pickup', carrier: 'COSCO Shipping', tracking: 'COSU6218840', progress: 0, promisedFrom: at(-4 * 24), promisedTo: at(-1 * 24), actualFrom: undefined, actualTo: undefined },
  { poId: 'PO-7790', status: 'in_transit', supplierClaim: 'Departed TPE', carrierStatus: 'In flight · CI 6831', carrier: 'China Airlines Cargo', tracking: '297-61840072', progress: 0.38, departedAt: at(-3), promisedFrom: at(-4), promisedTo: at(46), actualFrom: at(-3), actualTo: at(44) },
  { poId: 'PO-7715', status: 'in_transit', supplierClaim: 'On truck MH-04', carrierStatus: 'Lonavala checkpoint', carrier: 'Gati Express', tracking: 'GATI-0098124', progress: 0.71, departedAt: at(-10), promisedFrom: at(-12), promisedTo: at(20), actualFrom: at(-10), actualTo: at(18) },
  { poId: 'PO-7716', status: 'delayed', supplierClaim: 'Awaiting customs, FRA', carrierStatus: 'Held at FRA customs', carrier: 'Lufthansa Cargo', tracking: '020-55124930', progress: 0.12, departedAt: at(-30), promisedFrom: at(-36), promisedTo: at(60), actualFrom: at(-30), actualTo: at(64) },
  { poId: 'PO-7714', status: 'delivered', supplierClaim: 'Delivered', carrierStatus: 'Delivered · QC passed', carrier: 'Own fleet', tracking: 'SHW-2210', progress: 1, promisedFrom: at(-3 * 24), promisedTo: at(-2 * 24), actualFrom: at(-3 * 24), actualTo: at(-2 * 24) },
  { poId: 'PO-7721', status: 'delivered', supplierClaim: 'Delivered', carrierStatus: 'Delivered · QC passed', carrier: 'MASkargo', tracking: '232-77610041', progress: 1, promisedFrom: at(-26), promisedTo: at(-2), actualFrom: at(-25), actualTo: at(-3) },
  { poId: 'PO-7722', status: 'delayed', supplierClaim: 'On vessel ONE Harmony', carrierStatus: 'Waiting berth, Chennai port', carrier: 'Ocean Network Express', tracking: 'ONEU4471902', progress: 0.82, departedAt: at(-6 * 24), promisedFrom: at(-7 * 24), promisedTo: at(6 * 24), actualFrom: at(-6 * 24), actualTo: at(7 * 24) },
  { poId: 'PO-7731', status: 'in_transit', supplierClaim: 'Departed AUS', carrierStatus: 'Transit DXB', carrier: 'Emirates SkyCargo', tracking: '176-90213345', progress: 0.55, departedAt: at(-30), promisedFrom: at(-32), promisedTo: at(3 * 24), actualFrom: at(-30), actualTo: at(3 * 24 - 6) },
  { poId: 'PO-7732', status: 'delivered', supplierClaim: 'Delivered', carrierStatus: 'Delivered · QC passed', carrier: 'Safexpress', tracking: 'SFX-771203', progress: 1, promisedFrom: at(-2 * 24), promisedTo: at(-24), actualFrom: at(-2 * 24), actualTo: at(-26) },
  { poId: 'PO-7741', status: 'delayed', supplierClaim: 'Vessel delayed', carrierStatus: 'Anchored outside Yantian', carrier: 'Evergreen', tracking: 'EGLV1420098', progress: 0.05, departedAt: at(-2 * 24), promisedFrom: at(-3 * 24), promisedTo: at(2 * 24), actualFrom: at(-2 * 24), actualTo: at(9 * 24) },
  { poId: 'PO-7742', status: 'booked', supplierClaim: 'Ready to ship on release', carrierStatus: 'Booked · SQ 7422', carrier: 'Singapore Airlines Cargo', tracking: '618-30019284', progress: 0, promisedFrom: at(24), promisedTo: at(3 * 24), actualFrom: undefined, actualTo: undefined },
  { poId: 'PO-7751', status: 'booked', supplierClaim: 'Scheduled', carrierStatus: 'Booked', carrier: 'Gati Express', tracking: 'GATI-0101877', progress: 0, promisedFrom: at(8 * 24), promisedTo: at(10 * 24) },
  { poId: 'PO-7752', status: 'in_transit', supplierClaim: 'Sailed Houston', carrierStatus: 'Atlantic crossing', carrier: 'Maersk', tracking: 'MAEU9921047', progress: 0.24, departedAt: at(-4 * 24), promisedFrom: at(-5 * 24), promisedTo: at(19 * 24), actualFrom: at(-4 * 24), actualTo: at(19 * 24) },
]

export const payments: Payment[] = [
  {
    id: '7XK21893LM4402917', poId: 'PO-7712', projectId: 'PRJ-2041', supplierId: 'SUP-21', amountUsd: 5880, state: 'hold_voided', authorizationId: '4RT01928JH2203841', invoiceNumber: 'ZH-INV-55120', match: 'mismatch', needsApproval: false,
    events: [
      { at: at(-9 * 24), type: 'ORDER.CREATED', detail: 'Order to Zhen Hua, intent AUTHORIZE', api: 'POST /v2/checkout/orders' },
      { at: at(-9 * 24 + 0.1), type: 'PAYMENT.AUTHORIZATION.CREATED', detail: '$5,880 held from mandate', api: 'POST /v2/checkout/orders/{id}/authorize' },
      { at: at(-30), type: 'INVOICE.RECEIVED', detail: 'Supplier invoiced for "dispatched" goods', api: 'email → Gemini extraction' },
      { at: at(-6), type: 'MATCH.FAILED', detail: 'Invoice says shipped; carrier says label only, no pickup', api: 'finance_solver.three_way_match' },
      { at: at(-5.8), type: 'PAYMENT.AUTHORIZATION.VOIDED', detail: 'Hold voided by deterministic rule R-07', api: 'POST /v2/payments/authorizations/{id}/void' },
    ],
  },
  {
    id: '3HN44017PL5590023', poId: 'PO-7790', projectId: 'PRJ-2041', supplierId: 'SUP-57', amountUsd: 6580, state: 'funds_held', authorizationId: '8DD77120KQ0091124', invoiceNumber: 'FP-24-08812', match: 'pending', needsApproval: false,
    events: [
      { at: at(-5.2), type: 'ORDER.CREATED', detail: 'Backup order to Formosa Precision', api: 'POST /v2/checkout/orders' },
      { at: at(-5.1), type: 'PAYMENT.AUTHORIZATION.CREATED', detail: '$6,580 held — releases on goods receipt + QC', api: 'POST /v2/checkout/orders/{id}/authorize' },
      { at: at(-4), type: 'INVOICE.RECEIVED', detail: 'Invoice FP-24-08812 matches PO price and qty', api: 'email → Gemini extraction' },
    ],
  },
  { id: '5BB10284QX7713302', poId: 'PO-7715', projectId: 'PRJ-2041', supplierId: 'SUP-42', amountUsd: 2070, state: 'funds_held', authorizationId: '1KC22071PP3384010', match: 'pending', needsApproval: false, events: [{ at: at(-3 * 24), type: 'PAYMENT.AUTHORIZATION.CREATED', detail: '$2,070 held', api: 'authorize' }] },
  { id: '0PL99120RT6630041', poId: 'PO-7716', projectId: 'PRJ-2041', supplierId: 'SUP-112', amountUsd: 1890, state: 'invoice_received', invoiceNumber: 'RS-2026-4410', match: 'pending', needsApproval: false, events: [{ at: at(-2 * 24), type: 'INVOICE.RECEIVED', detail: 'Pro-forma, awaiting shipment confirmation', api: 'email → Gemini extraction' }] },
  { id: '9QW33810MN2209915', poId: 'PO-7714', projectId: 'PRJ-2041', supplierId: 'SUP-77', amountUsd: 3010, state: 'funds_released', authorizationId: '6GH11029LK8830211', captureId: '2TY88310AB0012931', invoiceNumber: 'SHW-1180', match: 'matched', needsApproval: false, events: [
    { at: at(-6 * 24), type: 'PAYMENT.AUTHORIZATION.CREATED', detail: '$3,010 held', api: 'authorize' },
    { at: at(-2 * 24 + 1), type: 'GOODS.VERIFIED', detail: 'Warehouse receipt GR-5521, QC pass', api: 'warehouse_reply' },
    { at: at(-2 * 24 + 1.1), type: 'PAYMENT.CAPTURE.COMPLETED', detail: '$3,010 released to Sahyadri', api: 'POST /v2/payments/authorizations/{id}/capture' },
  ] },
  { id: 'PAYOUT-HB8820', poId: 'PO-7718', projectId: 'PRJ-2041', supplierId: 'SUP-71', amountUsd: 415, state: 'payout_sent', match: 'matched', needsApproval: false, events: [{ at: at(-4.9), type: 'PAYMENTS.PAYOUTS-ITEM.SUCCEEDED', detail: 'Air-freight expedite fee to forwarder', api: 'POST /v1/payments/payouts' }] },
  { id: '2MM55190CC4410082', poId: 'PO-7721', projectId: 'PRJ-2042', supplierId: 'SUP-95', amountUsd: 5396, state: 'funds_released', authorizationId: '0PA77310DD1100392', captureId: '7HF22019ZZ1029384', invoiceNumber: 'NXM-88213', match: 'matched', needsApproval: true, events: [
    { at: at(-28), type: 'PAYMENT.AUTHORIZATION.CREATED', detail: '$5,396 held (over limit — release gated)', api: 'authorize' },
    { at: at(-27), type: 'HUMAN.APPROVED', detail: 'R. Iyer approved with emailed code', api: 'approvals' },
    { at: at(-2.5), type: 'PAYMENT.CAPTURE.COMPLETED', detail: '$5,396 released after QC', api: 'capture' },
  ] },
  { id: '6TR90031VB2280017', poId: 'PO-7722', projectId: 'PRJ-2042', supplierId: 'SUP-131', amountUsd: 17100, state: 'funds_held', authorizationId: '3ZZ01092TT8812011', invoiceNumber: 'NCT-77120', match: 'pending', needsApproval: true, events: [{ at: at(-7 * 24), type: 'PAYMENT.AUTHORIZATION.CREATED', detail: '$17,100 held — reauthorized day 3', api: 'authorize / reauthorize' }] },
  { id: '1AA48810QW0098215', poId: 'PO-7731', projectId: 'PRJ-2043', supplierId: 'SUP-120', amountUsd: 5900, state: 'funds_held', authorizationId: '9KK10283PO2201193', match: 'pending', needsApproval: true, events: [{ at: at(-2 * 24), type: 'PAYMENT.AUTHORIZATION.CREATED', detail: '$5,900 held', api: 'authorize' }] },
  { id: '4CV11920HJ3381020', poId: 'PO-7732', projectId: 'PRJ-2043', supplierId: 'SUP-33', amountUsd: 1950, state: 'funds_released', captureId: '5RR01928MM0019283', match: 'matched', needsApproval: false, events: [{ at: at(-26), type: 'PAYMENT.CAPTURE.COMPLETED', detail: '$1,950 released', api: 'capture' }] },
  { id: '8UU20193ZX1029381', poId: 'PO-7730', projectId: 'PRJ-2043', supplierId: 'SUP-18', amountUsd: 1240, state: 'refunded', captureId: '1QQ29381LL0029384', match: 'mismatch', needsApproval: false, events: [
    { at: at(-6 * 24), type: 'PAYMENT.CAPTURE.COMPLETED', detail: '$1,240 released', api: 'capture' },
    { at: at(-5 * 24), type: 'QC.FAILED', detail: 'Wrong silicon revision (rev B, PO says rev D)', api: 'warehouse_reply' },
    { at: at(-5 * 24 + 0.2), type: 'PAYMENT.CAPTURE.REFUNDED', detail: '$1,240 pulled back', api: 'POST /v2/payments/captures/{id}/refund' },
  ] },
  { id: '7LO99201MN3381992', poId: 'PO-7741', projectId: 'PRJ-2044', supplierId: 'SUP-29', amountUsd: 8370, state: 'hold_voided', authorizationId: '2PP10293XC0019283', match: 'mismatch', needsApproval: true, events: [
    { at: at(-10 * 24), type: 'PAYMENT.AUTHORIZATION.CREATED', detail: '$8,370 held', api: 'authorize' },
    { at: at(-1.2), type: 'PAYMENT.AUTHORIZATION.VOIDED', detail: 'Promised date missed by 7 days — order cancelled', api: 'void' },
  ] },
  { id: 'PENDING-PO-7742', poId: 'PO-7742', projectId: 'PRJ-2044', supplierId: 'SUP-71', amountUsd: 9855, state: 'awaiting_approval', match: 'pending', needsApproval: true, events: [{ at: at(-1), type: 'APPROVAL.REQUESTED', detail: '$9,855 exceeds $5,000 authority — code emailed to S. Deshmukh', api: 'approvals' }] },
  { id: '0ZX11029PL4401928', poId: 'PO-7751', projectId: 'PRJ-2046', supplierId: 'SUP-42', amountUsd: 2760, state: 'funds_held', match: 'pending', needsApproval: false, events: [{ at: at(-24), type: 'PAYMENT.AUTHORIZATION.CREATED', detail: '$2,760 held', api: 'authorize' }] },
  { id: '3QA01928KK2201837', poId: 'PO-7752', projectId: 'PRJ-2046', supplierId: 'SUP-120', amountUsd: 1380, state: 'funds_held', match: 'pending', needsApproval: false, events: [{ at: at(-24), type: 'PAYMENT.AUTHORIZATION.CREATED', detail: '$1,380 held', api: 'authorize' }] },
]

export const incidents: Incident[] = [
  {
    id: 'INC-301', projectId: 'PRJ-2041', title: 'Supplier claimed dispatch — carrier never collected', scenario: 'S3 · Adversarial supplier', severity: 'critical', stage: 'funds_held',
    openedAt: at(-6.5), supplierId: 'SUP-21', poId: 'PO-7712', newPoId: 'PO-7790', amountUsd: 6580,
    steps: [
      { at: at(-6.5), label: 'Line-stop risk: SCU-700 needs 700 MCUs in 6 days, 0 on hand', status: 'warning', by: 'agent' },
      { at: at(-6.4), label: 'Gemini read Zhen Hua email: "goods dispatched 3 days ago"', status: 'done', by: 'llm' },
      { at: at(-6.3), label: 'COSCO tracking COSU6218840: label created, no pickup', status: 'warning', by: 'agent' },
      { at: at(-6.2), label: 'Contradiction confirmed → supplier reliability 47 → 41', status: 'warning', by: 'agent' },
      { at: at(-6), label: 'Three-way match failed: invoice vs carrier', status: 'blocked', by: 'agent' },
      { at: at(-5.8), label: 'PayPal: voided $5,880 authorization on PO-7712', status: 'done', by: 'paypal' },
      { at: at(-5.5), label: 'Solver ranked 4 options, rejected 2 (uncertified, sea too slow)', status: 'done', by: 'agent' },
      { at: at(-5.2), label: 'PayPal: $6,580 held for Formosa (PO-7790), under authority limit', status: 'done', by: 'paypal' },
      { at: at(-4.9), label: 'PayPal Payouts: $415 expedite fee to AeroCell', status: 'done', by: 'paypal' },
      { at: at(-0.2), label: 'Waiting: warehouse receipt + QC to release funds', status: 'running', by: 'agent' },
    ],
    options: [
      { label: 'Formosa · air', supplierId: 'SUP-57', mode: 'AIR', costUsd: 6995, arrivesAt: at(44), score: 0.91, verdict: 'chosen', reason: 'Certified, 93 reliability, lands 4 days before line-stop' },
      { label: 'Zhen Hua · wait', supplierId: 'SUP-21', mode: 'SEA', costUsd: 5880, arrivesAt: at(8 * 24), score: 0.12, verdict: 'rejected', reason: 'Arrives after due date; supplier contradicted by carrier' },
      { label: 'Budget Semicon · sea', supplierId: 'SUP-18', mode: 'SEA', costUsd: 4900, arrivesAt: at(7 * 24), score: 0, verdict: 'rejected', reason: 'No AEC-Q100 certificate — hard constraint' },
      { label: 'Stand down SCU-300', supplierId: 'SUP-57', mode: 'ROAD', costUsd: 0, arrivesAt: at(2), score: 0.64, verdict: 'viable', reason: 'Covers 300 of 700; combined with Formosa as fallback' },
    ],
  },
  {
    id: 'INC-302', projectId: 'PRJ-2042', title: 'Cheapest BMS IC is uncertified', scenario: 'S4 · Quality constraint', severity: 'high', stage: 'settled',
    openedAt: at(-30), supplierId: 'SUP-18', poId: 'PO-7720', newPoId: 'PO-7721', amountUsd: 5396,
    steps: [
      { at: at(-30), label: 'Quote from Budget Semicon: $11.90/unit, 22% cheaper', status: 'done', by: 'llm' },
      { at: at(-29.9), label: 'Rejected: no ISO 26262 / AEC-Q100 evidence', status: 'blocked', by: 'agent' },
      { at: at(-28), label: 'PayPal: $5,396 held for Nexus Micro (sole source)', status: 'done', by: 'paypal' },
      { at: at(-27), label: 'Human approved release (over limit)', status: 'done', by: 'human' },
      { at: at(-3), label: 'Goods received, QC pass', status: 'done', by: 'agent' },
      { at: at(-2.5), label: 'PayPal: $5,396 captured — supplier paid', status: 'done', by: 'paypal' },
    ],
    options: [],
  },
  {
    id: 'INC-303', projectId: 'PRJ-2044', title: 'Display shipment stuck — recovery over authority limit', scenario: 'S5 · Budget approval', severity: 'high', stage: 'awaiting_approval',
    openedAt: at(-2), supplierId: 'SUP-29', poId: 'PO-7741', newPoId: 'PO-7742', amountUsd: 9855,
    steps: [
      { at: at(-2), label: 'Evergreen EGLV1420098 anchored outside Yantian, +7 days', status: 'warning', by: 'agent' },
      { at: at(-1.2), label: 'PayPal: voided $8,370 hold on PO-7741', status: 'done', by: 'paypal' },
      { at: at(-1.1), label: 'Best option AeroCell air: $9,855 > $5,000 limit', status: 'blocked', by: 'agent' },
      { at: at(-1), label: 'Approval requested — one-time code emailed', status: 'running', by: 'agent' },
    ],
    options: [
      { label: 'AeroCell · air', supplierId: 'SUP-71', mode: 'AIR', costUsd: 9855, arrivesAt: at(3 * 24), score: 0.89, verdict: 'chosen', reason: 'Only option landing before due date' },
      { label: 'Lowcost Display · wait', supplierId: 'SUP-29', mode: 'SEA', costUsd: 8370, arrivesAt: at(9 * 24), score: 0.31, verdict: 'viable', reason: 'Cheaper, but pushes IC-450 one day late' },
    ],
  },
  {
    id: 'INC-304', projectId: 'PRJ-2043', title: 'Stock record says 600 modems, floor counted 140', scenario: 'S2 · Stale inventory', severity: 'medium', stage: 'investigating',
    openedAt: at(-1.5), supplierId: 'SUP-120', poId: 'PO-7731', amountUsd: 0,
    steps: [
      { at: at(-1.5), label: 'Inventory snapshot is 9 days old', status: 'warning', by: 'agent' },
      { at: at(-1.4), label: 'Asked Pune floor for a cycle count', status: 'done', by: 'agent' },
      { at: at(-0.6), label: 'Floor reply: 140 on shelf (Gemini parsed)', status: 'done', by: 'llm' },
      { at: at(-0.1), label: 'Checking inbound PO-7731 covers the 360 gap', status: 'running', by: 'agent' },
    ],
    options: [],
  },
  {
    id: 'INC-305', projectId: 'PRJ-2042', title: 'Hazmat cells waiting for berth at Chennai', scenario: 'S1 · Normal disruption', severity: 'medium', stage: 'detected',
    openedAt: at(-0.4), supplierId: 'SUP-131', poId: 'PO-7722', amountUsd: 17100,
    steps: [{ at: at(-0.4), label: 'ONE Harmony waiting berth, ETA +1 day', status: 'warning', by: 'agent' }],
    options: [],
  },
  {
    id: 'INC-299', projectId: 'PRJ-2043', title: 'Wrong silicon revision delivered', scenario: 'QC failure', severity: 'medium', stage: 'clawed_back',
    openedAt: at(-5 * 24), supplierId: 'SUP-18', poId: 'PO-7730', amountUsd: 1240,
    steps: [
      { at: at(-5 * 24), label: 'QC: rev B received, PO specifies rev D', status: 'blocked', by: 'agent' },
      { at: at(-5 * 24 + 0.2), label: 'PayPal: refunded $1,240 capture', status: 'done', by: 'paypal' },
    ],
    options: [],
  },
]

export const emails: EmailMessage[] = [
  { id: 'M1', threadId: 'T-21', projectId: 'PRJ-2041', supplierId: 'SUP-21', direction: 'outbound', from: 'agent@disruptionops.app', subject: 'PO-7712 · 700 × MCU-32A-AEC — dispatch status?', body: 'Hello Zhen Hua team,\n\nOur production run for Bharat EV starts in 6 days. Please confirm the dispatch date and carrier tracking number for PO-7712.\n\n— DisruptionOps agent, on behalf of Pune Plant 1', at: at(-8) },
  { id: 'M2', threadId: 'T-21', projectId: 'PRJ-2041', supplierId: 'SUP-21', direction: 'inbound', from: 'sales@zhenhua-elec.example', subject: 'RE: PO-7712 · dispatch status', body: 'Dear customer, goods were dispatched 3 days ago, all fine. Tracking COSU6218840. Please release payment per attached invoice ZH-INV-55120.', at: at(-6.6),
    extracted: [{ label: 'Claim', value: 'Dispatched 3 days ago' }, { label: 'Tracking', value: 'COSU6218840' }, { label: 'Invoice', value: 'ZH-INV-55120 · $5,880' }],
    flagged: 'Carrier shows label created, no pickup. Claim contradicted.' },
  { id: 'M3', threadId: 'T-21', projectId: 'PRJ-2041', supplierId: 'SUP-21', direction: 'outbound', from: 'agent@disruptionops.app', subject: 'RE: PO-7712 · payment hold released back', body: 'COSCO shows the shipment was never collected. We have cancelled PO-7712 and voided the payment hold. If the goods do ship, please send the bill of lading and we will review.', at: at(-5.7) },
  { id: 'M4', threadId: 'T-57', projectId: 'PRJ-2041', supplierId: 'SUP-57', direction: 'outbound', from: 'agent@disruptionops.app', subject: 'RFQ · 700 × MCU-32A-AEC, air, 48 h', body: 'Can you ship 700 AEC-Q100 MCUs by air to Pune within 48 hours? Please quote unit price and flight.', at: at(-5.6) },
  { id: 'M5', threadId: 'T-57', projectId: 'PRJ-2041', supplierId: 'SUP-57', direction: 'inbound', from: 'orders@formosa-precision.example', subject: 'RE: RFQ · 700 × MCU', body: 'Yes. $9.40/unit, ships on CI 6831 tonight, lands BOM in 44 h. Invoice FP-24-08812 attached.', at: at(-5.3),
    extracted: [{ label: 'Unit price', value: '$9.40' }, { label: 'Promised arrival', value: '44 h' }, { label: 'Invoice', value: 'FP-24-08812 · $6,580' }] },
  { id: 'M6', threadId: 'T-71', projectId: 'PRJ-2044', supplierId: 'SUP-71', direction: 'inbound', from: 'quotes@aerocell.example', subject: 'Quote · 450 × TFT-7-AUTO by air', body: 'We can supply 450 displays at $21.90, ex-Singapore by air, 3 days door to door.', at: at(-1.3),
    extracted: [{ label: 'Total', value: '$9,855' }, { label: 'Arrival', value: '3 days' }] },
  { id: 'M7', threadId: 'T-95', projectId: 'PRJ-2042', supplierId: 'SUP-95', direction: 'inbound', from: 'quality@nexusmicro.example', subject: 'ISO 26262 certificate · BMS-IC-16S', body: 'Please find our ISO 26262 ASIL-C certificate and AEC-Q100 qualification report attached.', at: at(-29),
    extracted: [{ label: 'Certificates', value: 'ISO 26262, AEC-Q100' }] },
]

export const feed: FeedItem[] = [
  { id: 'F1', at: at(-0.1), kind: 'agent', tone: 'violet', title: 'Checking inbound modems cover the gap', body: 'TCU-500 · 360 modems short, PO-7731 lands in 66 h', projectId: 'PRJ-2043', severity: 'medium' },
  { id: 'F2', at: at(-0.4), kind: 'carrier', tone: 'warn', title: 'ONE Harmony waiting berth at Chennai', body: 'Hazmat cells for BMS-380 · ETA +1 day', projectId: 'PRJ-2042', severity: 'medium' },
  { id: 'F3', at: at(-1), kind: 'human', tone: 'rose', title: 'Approval needed: $9,855 over limit', body: 'IC-450 displays by air · code emailed to S. Deshmukh', projectId: 'PRJ-2044', severity: 'high' },
  { id: 'F4', at: at(-1.2), kind: 'paypal', tone: 'azure', title: 'Hold voided · $8,370', body: 'Lowcost Display missed promised date by 7 days', projectId: 'PRJ-2044' },
  { id: 'F5', at: at(-3), kind: 'carrier', tone: 'good', title: 'CI 6831 departed Taipei', body: '700 MCUs for SCU-700 · lands in 44 h', projectId: 'PRJ-2041' },
  { id: 'F6', at: at(-4.9), kind: 'paypal', tone: 'azure', title: 'Payout sent · $415 expedite fee', body: 'AeroCell forwarder, instant via PayPal Payouts', projectId: 'PRJ-2041' },
  { id: 'F7', at: at(-5.2), kind: 'paypal', tone: 'azure', title: 'Funds held · $6,580 for Formosa', body: 'Released only after goods receipt + QC', projectId: 'PRJ-2041' },
  { id: 'F8', at: at(-5.8), kind: 'paypal', tone: 'crit', title: 'Hold voided · $5,880 from Zhen Hua', body: 'Supplier claim contradicted by COSCO tracking', projectId: 'PRJ-2041', severity: 'critical' },
  { id: 'F9', at: at(-6.3), kind: 'agent', tone: 'crit', title: 'Supplier lie detected', body: '"Dispatched 3 days ago" vs carrier "label created, no pickup"', projectId: 'PRJ-2041', severity: 'critical' },
  { id: 'F10', at: at(-6.6), kind: 'email', tone: 'violet', title: 'Email from Zhen Hua read by Gemini', body: 'Extracted: claim, tracking, invoice', projectId: 'PRJ-2041' },
]

export const approvals: Approval[] = [
  { id: 'APR-88', incidentId: 'INC-303', projectId: 'PRJ-2044', poId: 'PO-7742', amountUsd: 9855, limitUsd: AUTHORITY_LIMIT_USD, reason: 'Only option landing before IC-450 due date. Funds will be held, not released, until goods are verified.', requestedAt: at(-1), expiresAt: at(23), state: 'pending' },
  { id: 'APR-81', incidentId: 'INC-302', projectId: 'PRJ-2042', poId: 'PO-7721', amountUsd: 5396, limitUsd: AUTHORITY_LIMIT_USD, reason: 'Sole certified source for BMS IC.', requestedAt: at(-28), expiresAt: at(-4), state: 'approved' },
]

/** Daily series for charts — last 14 days. */
export const moneySeries = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(now - (13 - i) * 24 * H)
  const held = [8, 9.5, 11, 10.2, 12.8, 14, 13.1, 15.6, 17.2, 19.9, 22.4, 26.1, 31.8, 37.5][i] * 1000
  const released = [0, 1.2, 1.2, 2.4, 2.4, 4.1, 5.0, 5.0, 6.9, 8.3, 8.3, 9.6, 10.3, 12.4][i] * 1000
  const recovered = [0, 0, 0, 0, 0, 0, 0, 0, 1.24, 1.24, 1.24, 1.24, 7.12, 15.49][i] * 1000
  return { day: d.toISOString().slice(5, 10), held, released, recovered }
})

// Seeded supplier health and what the agent team has learned (overlaid by live data).
const HEALTH: Record<string, [number, string[], ('trusted' | 'watch' | 'proof_only')?]> = {
  'SUP-21': [41, ['Carrier contradicted dispatch claims twice'], 'proof_only'],
  'SUP-42': [71, ['Shares a plating house with Sahyadri Harness Works'], 'watch'],
  'SUP-77': [78, ['Shares a plating house with Western connectors'], 'trusted'],
}
for (const s of suppliers) {
  const h = HEALTH[s.id]
  s.healthScore = h?.[0] ?? Math.min(96, s.reliability + 2)
  s.signals = h?.[1] ?? []
  s.trust = h?.[2] ?? (s.reliability >= 85 ? 'trusted' : s.reliability >= 60 ? 'watch' : 'proof_only')
}
