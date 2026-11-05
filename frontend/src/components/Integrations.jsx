import { useQuery } from '@tanstack/react-query'
import {
  Boxes, Cpu, Database, Factory, Mail, Radio, ShieldCheck, Truck, Users,
} from 'lucide-react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'

/**
 * Every seam where this system touches the outside world.
 *
 * The problem statement mandates a simulated sandbox, and simulation is only
 * honest if you can point at exactly which parts are simulated and what each
 * one would be replaced by. That argument currently lives in SECURITY.md, where
 * nobody reads it. This is the same claim as a screen you can point at during a
 * demo — and, more usefully, the screen an enterprise buyer asks for first.
 *
 * Two rules for this page:
 *
 *   1. Nothing here is aspirational. A row says SANDBOX or it says LIVE, and
 *      LIVE means a real credential is configured and the thing actually runs.
 *      A roadmap item dressed as an integration is the single fastest way to
 *      lose a technical buyer.
 *   2. Every SANDBOX row names its real-world counterpart *and* what would have
 *      to change. "Simulated" without "and here is the swap" is hand-waving.
 */

const SEAMS = [
  {
    id: 'llm', icon: Cpu, group: 'Reasoning',
    name: 'Language model',
    what: 'Interprets supplier replies, narrates decisions, drafts messages. It '
        + 'never decides anything — every consequence is computed by the solver.',
    live: true,     // resolved from /api/llm/health at render
    real: 'Bedrock (Claude), xAI or Gemini — whichever key is present',
    swap: 'Nothing — or bring your own account under Model & keys, so usage '
        + 'bills to you and runs under your own agreement with the provider.',
    tech: 'Set AWS_BEARER_TOKEN_BEDROCK, XAI_API_KEY or GEMINI_API_KEY; '
        + 'LLM_PROVIDER=auto picks the first one present. Per-tenant keys are '
        + 'stored encrypted and override the platform default.',
  },
  {
    id: 'db', icon: Database, group: 'Reasoning',
    name: 'Operational database',
    what: 'Suppliers, inventory, production orders, purchase orders and the '
        + 'append-only audit log. Row-level security isolates every tenant.',
    live: true,
    real: 'Postgres (Supabase)',
    swap: 'Nothing. This is already a production database, and each customer\u2019s '
        + 'data is isolated by the database itself rather than by application code.',
    tech: 'Postgres 14+. Row-level security with a per-request tenant setting; '
        + 'the application role holds no BYPASSRLS.',
  },
  {
    id: 'supplier', icon: Users, group: 'Counterparties',
    name: 'Supplier portal',
    what: 'Suppliers read the agent’s RFQs and answer in their own words. Their '
        + 'replies are parsed into structured offers, and a claim that '
        + 'contradicts carrier tracking is caught rather than believed.',
    live: false,
    real: 'Email, an EDI feed, or a supplier’s own portal',
    swap: 'Connect your existing supplier email or EDI feed. How replies arrive '
        + 'changes; how they are read does not \u2014 the agent already turns free '
        + 'text into structured offers.',
    tech: 'Swap the portal UI for an inbound mail hook or EDI 855/856 parser. '
        + 'The interpretation path downstream is unchanged.',
  },
  {
    id: 'warehouse', icon: Factory, group: 'Counterparties',
    name: 'Warehouse / plant floor',
    what: 'Physical counts confirmed by a person, so the agent can plan against '
        + 'what is on the shelf rather than what the ERP claims.',
    live: false,
    real: 'A WMS, a barcode terminal, or a tablet on the floor',
    swap: 'Connect your warehouse system. The agent already asks for a count and '
        + 'waits for the answer \u2014 only who answers changes.',
    tech: 'The warehouse task queue is already the shape a WMS would write to; '
        + 'point a webhook at it and the tablet UI becomes optional.',
  },
  {
    id: 'carrier', icon: Truck, group: 'Counterparties',
    name: 'Carrier tracking',
    what: 'The second opinion that makes a supplier’s claim checkable. '
        + '"Dispatched" against "label created, no pickup" is the contradiction '
        + 'the agent is built to catch.',
    live: false,
    real: 'DHL / FedEx / Maersk tracking APIs, or a 4PL feed',
    swap: 'Connect your carrier or 4PL account. The comparison the agent makes '
        + '\u2014 what the supplier says against what the carrier shows \u2014 is '
        + 'already built.',
    tech: 'Tracking state is stored as a claim/status pair per shipment; a '
        + 'carrier poller writes to it on whatever cadence you have.',
  },
  {
    id: 'erp', icon: Boxes, group: 'Systems of record',
    name: 'ERP',
    what: 'Where inventory, BOMs and production orders come from — and where '
        + 'the ERP-versus-floor gap the agent detects originates.',
    live: false,
    real: 'SAP, Odoo, ERPNext, Oracle',
    swap: 'A read connector for products, stock, orders and suppliers, plus a '
        + 'policy-gated write path for raising requisitions. Designed, not built '
        + '\u2014 we will not claim an integration that has never run.',
    tech: 'Normalise into the existing schema; writes go through the same '
        + 'authority gate as every other agent action.',
  },
  {
    id: 'mail', icon: Mail, group: 'Systems of record',
    name: 'Outbound email',
    what: 'Not wired, and deliberately so. Every message the agent writes stays '
        + 'inside the simulation.',
    live: false,
    real: 'SES, SendGrid, or the customer’s own SMTP relay',
    swap: 'Connect a mail relay when you are ready for the agent to write to '
        + 'real people. Until then it physically cannot \u2014 an agent that can '
        + 'email your suppliers during an evaluation is a liability, not a feature.',
    tech: 'No mail library is imported anywhere in the backend. This is absence, '
        + 'not a disabled flag.',
    emphatic: true,
  },
  {
    id: 'events', icon: Radio, group: 'Systems of record',
    name: 'Disruption feed',
    what: 'Delays, quality failures, demand spikes and ERP corrections. Today '
        + 'these are injected by scenario so a run is reproducible.',
    live: false,
    real: 'Weather, port status, carrier exceptions, news, ERP change events',
    swap: 'Point real feeds at it \u2014 weather, port status, carrier exceptions. '
        + 'The agent reacts the same way whether an event was scripted or real.',
    tech: 'The scenario injector already writes through the path an external '
        + 'feed would use; a webhook emitting the same twelve event types needs '
        + 'no other change.',
  },
]

function Row({ seam, liveOverride }) {
  const Icon = seam.icon
  const live = liveOverride ?? seam.live
  return (
    <div className="flex gap-3.5 border-b py-4 last:border-0">
      <div className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg
        ${live ? 'bg-ok/10 ring-ok/25 ring-1' : 'bg-muted ring-1 ring-border'}`}>
        <Icon className={`size-4 ${live ? 'text-ok' : 'text-muted-foreground'}`} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-medium">{seam.name}</span>
          <Badge variant="outline"
                 className={`text-[9px] tracking-wider ${live
                   ? 'border-ok/45 bg-ok/10 text-ok'
                   : seam.emphatic
                     ? 'border-danger/45 bg-danger/10 text-danger'
                     : 'border-warn/40 bg-warn/10 text-warn'}`}>
            {live ? 'LIVE' : seam.emphatic ? 'NOT WIRED' : 'SANDBOX'}
          </Badge>
        </div>

        <p className="text-muted-foreground mt-1 text-[12px] leading-relaxed">
          {seam.what}
        </p>

        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          <div className="rounded-lg border px-2.5 py-1.5">
            <div className="text-muted-foreground text-[9px] tracking-[0.12em] uppercase">
              in production this is
            </div>
            <div className="mt-0.5 text-[11.5px]">{seam.real}</div>
          </div>
          <div className="rounded-lg border px-2.5 py-1.5">
            <div className="text-muted-foreground text-[9px] tracking-[0.12em] uppercase">
              what has to change
            </div>
            <div className="text-muted-foreground mt-0.5 text-[11.5px] leading-relaxed">
              {seam.swap}
            </div>
          </div>
        </div>

        {/* Table names, environment variables and library choices are answers
            to a question most people looking at this screen are not asking.
            They matter enormously to the one person who is — the engineer doing
            the integration — so they are here, closed, rather than deleted or
            printed over the top of the business answer. */}
        {seam.tech && (
          <details className="group mt-1.5">
            <summary className="text-muted-foreground/60 hover:text-muted-foreground
                                cursor-pointer list-none text-[10.5px] select-none">
              <span className="group-open:hidden">▸ technical detail</span>
              <span className="hidden group-open:inline">▾ technical detail</span>
            </summary>
            <div className="text-muted-foreground/80 mt-1 rounded-lg border border-dashed
                            px-2.5 py-1.5 text-[11px] leading-relaxed">
              {seam.tech}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}

export default function Integrations() {
  // The one row whose status is a fact rather than a claim.
  const { data: llm } = useQuery({ queryKey: ['llm-health'], queryFn: api.llmHealth })
  const llmLive = llm?.ok === true || llm?.reachable === true

  const groups = [...new Set(SEAMS.map((s) => s.group))]
  const sandboxed = SEAMS.filter((s) => !(s.id === 'llm' ? llmLive : s.live)).length

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-4xl p-7">
        <div className="glass mb-6 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="text-ok mt-0.5 size-5 shrink-0" />
            <div>
              <div className="text-[14px] font-medium">
                {sandboxed} of {SEAMS.length} seams are simulated, on purpose
              </div>
              <p className="text-muted-foreground mt-1.5 text-[12px] leading-relaxed">
                Every counterparty in this system is a sandbox. Nothing reaches a
                real supplier, a real carrier or a real inbox — which is what
                makes a scenario reproducible and a demo safe to run twice. Each
                row below names the production system it stands in for and what
                would have to change to swap it. A row marked LIVE means a
                credential is configured and the thing genuinely runs; there is
                no third state where something is "integrated" but untested.
              </p>
            </div>
          </div>
        </div>

        {groups.map((g) => (
          <div key={g} className="mb-6">
            <div className="text-muted-foreground mb-1 text-[10px] font-medium
                            tracking-[0.14em] uppercase">{g}</div>
            <div className="glass rounded-xl px-5">
              {SEAMS.filter((s) => s.group === g).map((s) => (
                <Row key={s.id} seam={s}
                     liveOverride={s.id === 'llm' ? llmLive : undefined} />
              ))}
            </div>
          </div>
        ))}

        <p className="text-muted-foreground/70 pb-4 text-center text-[11px]">
          The agent’s decisions do not change when a seam becomes real — the
          solver reads the same tables either way.
        </p>
      </div>
    </ScrollArea>
  )
}
