import { BarChart3, BrainCircuit, CalendarRange, Cloud, Code2, Database, Globe2, Mail, Plug, Wallet, Workflow, Zap, type LucideIcon } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../data/live'
import { rel } from '../data/source'
import type { Tone } from '../data/types'
import { StatusBadge, type RingTone } from '../ui/badges'
import { GlassCard, IconChip, SectionTitle } from '../ui/glass'

type State = 'live' | 'ready' | 'needs_setup' | 'optional' | 'checking'
const stateMeta: Record<State, { label: string; tone: RingTone }> = {
  live: { label: 'Live', tone: 'good' },
  ready: { label: 'Ready · not used yet', tone: 'azure' },
  needs_setup: { label: 'Needs setup', tone: 'warn' },
  optional: { label: 'Optional', tone: 'muted' },
  checking: { label: 'Checking…', tone: 'muted' },
}

// `key` ties a card to GET /api/integrations/health; cards without one are UI-side and live in this build.
const items: { key?: string; name: string; icon: LucideIcon; tone: Tone; role: string; uses: string[]; state?: State }[] = [
  { key: 'orders_payments', name: 'PayPal Orders v2 + Payments', icon: Wallet, tone: 'azure', role: 'Holds funds (AUTHORIZE) per PO; captures on verified goods (partial: minus late credit, retention, early-pay discount); voids on a contradicted claim; refunds on failed QC; reauthorizes long holds.', uses: ['POST /v2/checkout/orders', 'capture · partial capture', 'void · refund', 'reauthorize'] },
  { key: 'vault', name: 'PayPal Vault v3', icon: Wallet, tone: 'azure', role: 'One human-approved spending mandate the agents draw on. Connect it on the Payments page.', uses: ['setup token → approve → payment token', 'vault_id on every order'] },
  { key: 'invoicing', name: 'PayPal Invoicing v2', icon: Wallet, tone: 'azure', role: 'Supplier chargebacks: rework / line-down cost billed to the supplier’s verified PayPal payee, sent by PayPal.', uses: ['POST /v2/invoicing/invoices', '/send', 'Buyer Shield → chargeback'] },
  { key: 'payouts', name: 'PayPal Payouts', icon: Wallet, tone: 'azure', role: 'Pays suppliers (only to the locked, verified payee) and freight forwarders’ expedite fees.', uses: ['POST /v1/payments/payouts', 'payee lock'] },
  { key: 'webhooks', name: 'PayPal Webhooks', icon: Wallet, tone: 'azure', role: 'The source of truth for money state, signature-verified, idempotent; never overwrites finer states (retention).', uses: ['verify-webhook-signature', 'idempotent by event id'] },
  { key: 'agent_toolkit', name: 'PayPal Agent Toolkit', icon: Workflow, tone: 'azure', role: 'Read-only PayPal tools inside the Copilot (LangChain). Every write stays with the Treasurer agent.', uses: ['get_order_details', 'list_invoices', 'get_invoice'] },
  { key: 'gemini', name: 'Google Gemini', icon: BrainCircuit, tone: 'rose', role: 'Reads supplier emails, quotes and claims; drafts messages; powers the Copilot. Never moves money.', uses: ['extraction', 'contradiction spotting', 'Copilot (ReAct)'] },
  { key: 'langgraph', name: 'LangGraph multi-agent team', icon: Workflow, tone: 'violet', role: 'Supervisor + 8 specialists; one checkpointed thread per incident; human approvals via interrupt(); long-term supplier memory.', uses: ['AsyncPostgresSaver', 'AsyncPostgresStore', 'interrupt / resume'] },
  { key: 'smtp', name: 'Email out (SMTP)', icon: Mail, tone: 'violet', role: 'Approval codes, payee-change confirmations to the contact on file, supplier chases.', uses: ['Gmail SMTP'] },
  { key: 'imap', name: 'Email in (IMAP)', icon: Mail, tone: 'violet', role: 'Supplier replies read back in: payee changes, acknowledgements, new ship dates → agent team.', uses: ['IMAP polling', '[SUP-xx] subject routing'] },
  { name: 'AG Grid Enterprise', icon: BarChart3, tone: 'violet', role: 'Project portfolio, BOM→PO tree, PayPal ledger, supplier trust ledger, Buyer Shield guard ledger.', uses: ['row grouping', 'tree data', 'master-detail', 'custom renderers'] },
  { name: 'AG Studio', icon: BarChart3, tone: 'violet', role: 'Finance dashboards over the PayPal ledger on the Payments page.', uses: ['pre-built report', 'cross-filter'] },
  { name: 'Bryntum Gantt', icon: CalendarRange, tone: 'good', role: 'Project timeline: materials, order-by buy timers, PayPal releases as milestones, due-date line.', uses: ['dependencies', 'milestones'] },
  { name: 'Bryntum Scheduler', icon: CalendarRange, tone: 'good', role: 'Supplier lanes: promised vs actual. The lie is visible.', uses: ['stacked events', 'tooltips'] },
  { name: 'Bryntum TaskBoard', icon: CalendarRange, tone: 'good', role: 'Incident pipeline by stage.', uses: ['read-only by design'] },
  { key: 'supabase', name: 'Supabase Postgres', icon: Database, tone: 'violet', role: 'Projects, POs, payments, guard ledger, audit log; row-level security per organisation.', uses: ['RLS', 'session pooler'] },
  { key: 'render', name: 'Render', icon: Cloud, tone: 'azure', role: 'FastAPI backend in Docker; public webhook URL; migrations + demo config on boot.', uses: ['Dockerfile', 'render.yaml'] },
  { name: 'Mapbox GL (globe)', icon: Globe2, tone: 'violet', role: 'The 3D supply network: great-circle routes, live positions, shared sub-supplier links.', uses: ['globe projection', 'animated routes'] },
  { key: 'postman', name: 'Postman', icon: Code2, tone: 'violet', role: 'Collection of the agent, Buyer Shield and PayPal endpoints; login stores the token.', uses: ['postman/ collection', 'OpenAPI spec'] },
  { key: 'zapier', name: 'Zapier', icon: Zap, tone: 'warn', role: 'Critical guard blocks pushed to a Zapier Catch Hook (Slack, Sheets, SMS).', uses: ['ZAPIER_WEBHOOK_URL'] },
  { name: 'APIMatic', icon: Code2, tone: 'violet', state: 'optional', role: 'Typed SDK from our OpenAPI spec (postman/openapi.json). Not generated in this build.', uses: ['SDK generation'] },
]

export default function Integrations() {
  const health = useQuery({
    queryKey: ['integrations-health'], retry: 3,
    queryFn: () => api<{ checked_at: string; integrations: Record<string, { state: State; detail: string }> }>('/api/integrations/health'),
  })
  const stateOf = (it: (typeof items)[number]): { state: State; detail?: string } => {
    if (it.state) return { state: it.state }
    if (!it.key) return { state: 'live' }
    const h = health.data?.integrations[it.key]
    if (h) return h
    return { state: health.isError ? 'needs_setup' : 'checking', detail: health.isError ? 'backend unreachable' : undefined }
  }
  return (
    <>
      <SectionTitle title="Integrations" subtitle={health.data ? `Checked live ${rel(health.data.checked_at)}: each status comes from the running backend` : 'What each piece does in the product, checked against the running backend'} />
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {items.map((it, i) => {
          const st = stateOf(it)
          return (
          <GlassCard key={it.name} delay={Math.min(i, 8) * 0.04} className="p-4">
            <div className="flex items-center gap-3">
              <IconChip icon={it.icon} tone={it.tone} />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">{it.name}</p>
              <StatusBadge tone={stateMeta[st.state].tone} dot>{stateMeta[st.state].label}</StatusBadge>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{it.role}</p>
            {st.detail && <p className="mt-1.5 text-[11px] text-foreground/80">→ {st.detail}</p>}
            <div className="mt-2 flex flex-wrap gap-1">
              {it.uses.map((u) => <span key={u} className="rounded-md bg-violet/8 px-1.5 py-0.5 text-[11px] text-muted-foreground">{u}</span>)}
            </div>
          </GlassCard>
          )
        })}
      </div>
      <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground"><Plug className="size-3" /> Statuses are checked, not declared: PayPal token, mandate, webhook and call counts, model reachability, inbox config.</p>
    </>
  )
}
