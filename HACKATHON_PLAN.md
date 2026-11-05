# DisruptionOps × PayPal — Hackathon Plan

**Hackathon:** PayPal "Build What's Next" · **Deadline:** 10 days from 5 Nov 2026 · **Team:** kala dhua

**One line:** an AI agent that watches every shipment behind a customer project. When a supplier lies or a delivery slips, it re-sources the part and **moves the money through PayPal itself**. It holds funds, releases them only when goods are verified, and pulls them back when a supplier's story doesn't match the carrier.

**The rule we never break:** *the LLM reads and explains; deterministic Python decides and moves money.* No model output ever reaches a PayPal write call directly.

**The rule for demos:** *simulate the world, never the money.* Supplier lies, carrier scans and warehouse checks can be injected from the Simulation Lab. Every PayPal call is a real sandbox call.

---

## 1. What changes in the product

### 1.1 Everything is organised by Project

Today the data is flat: one production order per component. We add a **Project** layer on top, so the app reads the way a plant manager thinks:

```
Project            "Bharat EV Motors — 700 Smart Controller Units, due 12 Nov"
 └─ Product / BOM  Smart Controller Unit → components it needs
     └─ Material   COMP-104 MCU, COMP-118 connector …
         └─ Supplier   SUP-21 Zhen Hua (primary), SUP-57 Formosa (backup)
             └─ PO         PO-7712, qty, price, mode
                 ├─ Shipment   carrier position, supplier claim vs tracking
                 ├─ Money      PayPal order → authorization (held) → capture / void / refund
                 ├─ Emails     real threads with that supplier
                 └─ Agent      incident, options, decision, approval
```

The new `projects` table links a customer/dealer order to its production orders. Every screen can filter by project.

### 1.2 Screens (sidebar tabs)

| Tab | What it shows | Built with |
|---|---|---|
| **Mission Control** | KPIs (at-risk units, money held, money recovered, open incidents), **3D globe** with live shipment arcs into Pune, agent activity feed, money-in-flight rail | react-globe.gl (three.js), Recharts, motion |
| **Projects** | Every customer project: health, due date, % materials secured, money committed. Grouped by customer | AG Grid (row grouping) |
| **Project detail** | Header (dealer, product, qty, due, health) + inner tabs: **Overview** (project globe + BOM), **Materials** (the full tree above), **Timeline**, **Money**, **Emails**, **Agent decisions** | AG Grid tree data + master-detail, Bryntum Gantt, glass cards |
| **Shipments** | Full-screen globe + lanes view: one row per supplier, bars for promised vs actual windows. The S3 lie shows up as a gap you can see | react-globe.gl, Bryntum Scheduler |
| **Payments** | The PayPal ledger: held / captured / voided / refunded, three-way-match results, approval-limit hits. Self-serve dashboards plus "ask the finance agent" | AG Studio (+ Studio Agent Framework), AG Grid |
| **Agent Board** | Each incident as a card moving Detected → Investigating → Awaiting approval → Funds held → Goods verified → Settled / Clawed back | Bryntum TaskBoard |
| **Approvals** | Decisions above the authority limit, released with an emailed one-time code | glass cards, shadcn Dialog |
| **Suppliers** | Reliability score, history of claims vs reality, money at risk per supplier | AG Grid |
| **Simulation Lab** | Inject world events (supplier delay, false dispatch claim, failed QC, port closure). Never fakes money | existing injector |
| **Audit & Search** | Every agent step, email and PayPal event; semantic search ("every time SUP-21 lied and the refund that followed") | pgvector in Supabase |
| **Integrations** | Live status of PayPal, Gemini, email, AG, Bryntum, Render… documents each one for judges | glass cards |

The design follows the **Lavender Glass** spec exactly (tokens, glass surfaces, Inter, gentle motion, light + dark). "3D" means the globe as the hero scene, rendered in the same lavender palette, not 3D effects everywhere.

---

## 2. The PayPal money loop (real sandbox)

| Step | What happens | PayPal API |
|---|---|---|
| 0. Mandate | Plant manager approves once: "agent may spend up to $X per order". PayPal saves the payment method | JS SDK v6 + Vault v3 (payment tokens) |
| 1. Re-source | Solver picks the backup supplier (deterministic, existing `solver.py`) | — |
| 2. Hold | Agent creates an order to the supplier and **authorizes** it: funds held, not moved | Orders v2 `intent=AUTHORIZE` |
| 3. Supplier invoice | Supplier emails its invoice. LLM extracts fields; Python does a **three-way match** (PO ↔ invoice ↔ goods receipt) | Invoicing v2 (stretch: real invoices issued from supplier accounts via our Platform Partner app) |
| 4a. Release | Warehouse confirms receipt + QC → Python **captures** | Payments v2 capture |
| 4b. Claw back | Carrier contradicts supplier (S3) or QC fails → Python **voids** the hold; if already captured, **refunds**, and opens a dispute if the scope allows | void / refund / Disputes |
| 4c. Expedite fee | Small instant payment to a freight forwarder when air freight is chosen | Payouts |
| 5. Truth | Webhooks with verified signatures update state; idempotent by event id | Webhooks + `verify-webhook-signature` |
| Limit | Above the authority limit the hold still happens automatically, but **capture waits for a human code** | — |

New agent states: `FINANCIAL_NEGOTIATION → INVOICE_RECEIVED → FUNDS_HELD → GOODS_VERIFIED → FUNDS_RELEASED`, plus `CLAWED_BACK` and `AWAITING_RELEASE_APPROVAL`.

**Verified on 5 Nov:** the US sandbox app returns a token, and its scopes include invoicing, authcapture, refund, payouts, vault payment-tokens, webhooks and `disputes/create`.

**Currency:** PayPal layer runs in **USD** (US sandbox accounts). The UI shows USD with the INR equivalent.

---

## 3. What we took from the pasted prompts, and what we didn't

| Prompt idea | Decision | Why |
|---|---|---|
| Buyer sends an invoice **to** the supplier | **Changed** | Backwards: the seller invoices the buyer. PayPal judges would notice. Supplier invoices us; we match and pay |
| "Hold in Escrow" via Commerce Platform | **Changed** to Orders `AUTHORIZE` → capture/void | Marketplace escrow needs partner approval. Authorize/capture is a real, sandbox-safe hold |
| LLM forbidden from money APIs | **Kept** | Already our core architecture and best pitch line |
| Authority limit + human approval | **Kept** (exists) + emailed one-time code | |
| Webhook endpoint + signature verify | **Kept** | Render gives a public URL, so no ngrok |
| Hidden "God Mode" faking PayPal webhooks | **Changed** to a visible Simulation Lab that fakes only world events | Faking money in a judged video is a disqualification risk |
| AG Grid master-detail, custom renderers, grouping | **Kept and extended** with AG Studio + Studio Agent Framework | That's what the AG Grid prize text asks for |
| Elastic semantic search | **Changed** to pgvector | Same feature, no extra service, and Elastic has no prize |
| `paypal-checkout-sdk` | **Dropped** | Deprecated. Using `paypal-server-sdk` + REST for the rest |
| `render.yaml` | **Kept** (exists) + add the static frontend | Workers aren't on Render's free plan |

---

## 4. Sponsors and integrations

| Sponsor | Prize | Use | Priority | Cost |
|---|---|---|---|---|
| **PayPal** | Main + Agentic Commerce + PayPal+AI | Money loop above; **Agent Toolkit / MCP** gives the chat agent *read-only* PayPal tools (order status, invoices) | Must | Free sandbox |
| **AG Grid / AG Studio** | $5k / $2k / $1k | Materials tree, Payments dashboards, finance agent | Must | 45-day trial |
| **Bryntum** | $1k × 3 | Gantt (project timeline with payment milestones), Scheduler (supplier lanes), TaskBoard (incident board) | Must | Trial key until 20 Dec |
| **Render** | Credits | Backend (already live) + static frontend | Must | Free; cold starts ~50 s, so warm it before recording |
| **APIMatic** | $1k × 3 | PayPal's server SDK; generate a typed SDK for **our** FastAPI OpenAPI and use it in the frontend | Should, to verify | Trial |
| **Zapier** | none | MCP: agent posts critical alerts to Slack / Sheets | Could | 14-day trial |
| **Postman** | none | Publish an API collection for judges | Could | Free |
| **Astropods** | none | Repo connected; needs `astropods.yml`. Evaluate once docs are read | Could | Unknown |
| Channel3, Elastic, KERNEL | Channel3 $1.5k | Consumer-product catalog; poor fit for B2B electronics parts | Skip | — |

---

## 5. Schedule (UI first, so video recording can start early)

| Day | Work |
|---|---|
| 1 | Foundation: TypeScript, router, Lavender Glass tokens, glass components, shell, realistic sample data |
| 2 | Mission Control + 3D globe, Projects list |
| 3 | Project detail: Materials tree (AG Grid), Timeline (Gantt), Money, Emails, Decisions |
| 4 | Shipments (Scheduler), Payments (AG Studio), Agent Board (TaskBoard), Approvals, Suppliers, Simulation Lab, Integrations |
| 5 | Polish, dark theme, 1440 / 390 px checks → **first video cut on sample data** |
| 6–7 | Backend: `projects` + payment tables, `paypal_agent.py`, `finance_solver.py`, webhooks, real email (SMTP send + IMAP read) |
| 8 | Wire the UI to the live API, replacing sample data screen by screen |
| 9 | Agent Toolkit chat, APIMatic SDK, semantic search, Render frontend, README + docs |
| 10 | Final video (< 3 min), submission form, repo public with licence |

## 6. Repo hygiene before going public

- Remove the committed virtualenv `backend/dash/` from git.
- Scan git history for secrets.
- Keep `.env`, `API KEYS/` and the sandbox CSV out of git (already ignored).
