import { BarChart3, BrainCircuit, CalendarRange, Cloud, Code2, Database, Globe2, Mail, Plug, Wallet, Workflow, Zap, type LucideIcon } from 'lucide-react'
import type { Tone } from '../data/types'
import { StatusBadge, type RingTone } from '../ui/badges'
import { GlassCard, IconChip, SectionTitle } from '../ui/glass'

type State = 'live' | 'ui-ready' | 'next' | 'optional'
const stateMeta: Record<State, { label: string; tone: RingTone }> = {
  live: { label: 'Live', tone: 'good' },
  'ui-ready': { label: 'UI ready · wiring', tone: 'azure' },
  next: { label: 'Building next', tone: 'violet' },
  optional: { label: 'Optional', tone: 'muted' },
}

const items: { name: string; icon: LucideIcon; tone: Tone; state: State; role: string; uses: string[] }[] = [
  { name: 'PayPal Orders v2 + Payments', icon: Wallet, tone: 'azure', state: 'next', role: 'Holds funds (AUTHORIZE), captures on verified goods, voids on contradiction.', uses: ['POST /v2/checkout/orders', 'authorize · capture · void', 'reauthorize after day 3'] },
  { name: 'PayPal Vault v3', icon: Wallet, tone: 'azure', state: 'next', role: 'One human-approved spending mandate the agent can draw on.', uses: ['payment tokens', 'JS SDK v6 save flow'] },
  { name: 'PayPal Invoicing v2', icon: Wallet, tone: 'azure', state: 'next', role: 'Supplier invoices, matched against PO and goods receipt.', uses: ['three-way match'] },
  { name: 'PayPal Payouts', icon: Wallet, tone: 'azure', state: 'next', role: 'Instant expedite fees to freight forwarders.', uses: ['POST /v1/payments/payouts'] },
  { name: 'PayPal Webhooks', icon: Wallet, tone: 'azure', state: 'next', role: 'The source of truth for money state, signature-verified.', uses: ['verify-webhook-signature', 'idempotent by event id'] },
  { name: 'PayPal Agent Toolkit', icon: Workflow, tone: 'azure', state: 'next', role: 'Read-only PayPal tools for the chat agent. Writes stay in Python.', uses: ['order status', 'invoice lookup'] },
  { name: 'Google Gemini', icon: BrainCircuit, tone: 'rose', state: 'live', role: 'Reads supplier emails and floor replies; explains decisions. Never moves money.', uses: ['extraction', 'contradiction spotting', 'explanations'] },
  { name: 'Email (SMTP + IMAP)', icon: Mail, tone: 'violet', state: 'next', role: 'Real RFQs to suppliers, real replies read back in.', uses: ['Gmail SMTP', 'IMAP polling'] },
  { name: 'AG Grid Enterprise', icon: BarChart3, tone: 'violet', state: 'ui-ready', role: 'Project portfolio, BOM→PO tree, PayPal ledger, supplier trust ledger.', uses: ['row grouping', 'tree data', 'master-detail', 'custom renderers'] },
  { name: 'AG Studio', icon: BarChart3, tone: 'violet', state: 'ui-ready', role: 'Self-serve finance dashboards; Studio Agent Framework for "ask the finance agent".', uses: ['pre-built report', 'edit mode', 'cross-filter'] },
  { name: 'Bryntum Gantt', icon: CalendarRange, tone: 'good', state: 'ui-ready', role: 'Project timeline — production waits on materials; PayPal releases as milestones.', uses: ['dependencies', 'due-date line'] },
  { name: 'Bryntum Scheduler', icon: CalendarRange, tone: 'good', state: 'ui-ready', role: 'Supplier lanes: promised vs actual — the lie is visible.', uses: ['stacked events', 'tooltips'] },
  { name: 'Bryntum TaskBoard', icon: CalendarRange, tone: 'good', state: 'ui-ready', role: 'Incident pipeline through the agent state machine.', uses: ['read-only by design'] },
  { name: 'Supabase Postgres', icon: Database, tone: 'violet', state: 'live', role: 'Projects, POs, audit log; pgvector for semantic audit search.', uses: ['RLS', 'pgvector'] },
  { name: 'Render', icon: Cloud, tone: 'azure', state: 'live', role: 'FastAPI backend (live) and static frontend; public webhook URL.', uses: ['render.yaml blueprint'] },
  { name: 'Mapbox GL (globe)', icon: Globe2, tone: 'violet', state: 'live', role: 'The 3D supply network: real terrain, zoom to street level, great-circle routes.', uses: ['globe projection', 'animated routes', 'live positions'] },
  { name: 'APIMatic', icon: Code2, tone: 'violet', state: 'optional', role: 'Typed SDK generated from our OpenAPI spec for the frontend.', uses: ['SDK generation'] },
  { name: 'Zapier MCP', icon: Zap, tone: 'warn', state: 'optional', role: 'Critical alerts to Slack / Sheets.', uses: ['MCP actions'] },
]

export default function Integrations() {
  return (
    <>
      <SectionTitle title="Integrations" subtitle="What each piece does in the product — and its status today" />
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {items.map((it, i) => (
          <GlassCard key={it.name} delay={Math.min(i, 8) * 0.04} className="p-4">
            <div className="flex items-center gap-3">
              <IconChip icon={it.icon} tone={it.tone} />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">{it.name}</p>
              <StatusBadge tone={stateMeta[it.state].tone} dot>{stateMeta[it.state].label}</StatusBadge>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{it.role}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {it.uses.map((u) => <span key={u} className="rounded-md bg-violet/8 px-1.5 py-0.5 text-[11px] text-muted-foreground">{u}</span>)}
            </div>
          </GlassCard>
        ))}
      </div>
      <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground"><Plug className="size-3" /> Statuses are honest: “Building next” means not wired yet.</p>
    </>
  )
}
