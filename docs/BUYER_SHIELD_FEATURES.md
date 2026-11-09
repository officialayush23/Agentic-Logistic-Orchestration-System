# DisruptionOps: Buyer Shield (feature research + build spec)

**Team kala dhua** · PayPal "Build What's Next" · written 5 Nov 2026 · build window 6–14 Nov

---

## 0. The position in one line

> **Your suppliers can be late, wrong, overpriced or dishonest. Your project still ships on time, on budget, and you never pay for what you didn't get.**

DisruptionOps is not a lie detector. It is a **buyer-side agent** that stands between a manufacturer's projects and every supplier they buy from. It guards five things:

| The client's fear | Guard family | One-line promise |
|---|---|---|
| "I paid too much" | **Price** | Every quote is checked against should-cost, past price, index and landed cost before money is committed. |
| "I paid the wrong party / paid twice" | **Payee** | Money goes only to the verified supplier, once, for goods that arrived. |
| "I paid and got nothing / got junk" | **Proof** | PayPal holds the money; it moves only on a verified receipt and QC, minus penalties. |
| "My project deadline slipped because one part was stuck" | **Deadline** | Buy timers per project and part, push-out detection, approved alternates, re-plan. |
| "We overspent the project" | **Budget** | Budget envelopes per project, part and date window, enforced on every PayPal hold. |

**Architecture rule (unchanged):** Gemini *reads* (emails, invoices, quotes, notices) and *suggests*. Deterministic Python *decides*. Only Python calls PayPal write APIs.

---

## 1. Research: problems found in real cases and communities

Each row ties the evidence to the feature that answers it. Items marked ★ are new beyond what the team first proposed.

| # | Problem (evidence) | Source | Feature |
|---|---|---|---|
| R1 | Maruti Suzuki could not build ~46,000 cars in Oct–Dec 2022 while pending orders reached 3.63 lakh; the CFO blamed *limited visibility of electronic components* for planning trouble. Ford parked 40–45k unfinished vehicles waiting for chips (2022). | DT Next / Udayavani (PTI); Ford Q2-2022 coverage | **Deadline Guard (buy timers)** |
| R2 | "A whole board assembly run can be stopped with a single component" (Hacker News, chip-shortage thread). A BOM that names one manufacturer for a 0.1 µF capacitor stops the line when that part goes on allocation. | HN; BesterPCBA "BOM Health Checks" | **Deadline Guard + Approved Alternates ★** |
| R3 | A wood-products plant avoided **£672,000** of lost production by sourcing an alternative to a failed obsolete valve. | Hayley DEXIS case study CS138 | **Approved Alternates ★** |
| R4 | During the shortage, brokers quoted up to **100× list**; China's SAMR fined distributors selling chips at up to **40× cost**. AI should-cost typically saves 2–4%, and 10–15% on complex buys. | HN thread; SAMR rulings; should-cost studies | **Fair-Price Guard** |
| R5 | A $10 factory quote became a **$15.62 landed cost** (+56%) once freight, duty, insurance and fees were added. Forgotten items alone understate landed cost by 5–10%. | Sourcify; Welltrans Logistics | **Landed-Cost Compare ★** |
| R6 | Steel mill products ~+21% and copper shapes ~+16% YoY in early 2026. Escalation clauses work both ways, but "buyers remember the clause when prices rise and forget it when they fall". | Beancount (BLS PPI); LightSource glossary | **Price De-escalation Watch ★** |
| R7 | ERAI: suspect-part reports +35% (2021–22); **101 wire-fraud cases** in 2021 (from 70), brokers taking payment and vanishing. Alibaba Trade Assurance shows buyer escrow works at scale. | ERAI; Alibaba.com | **Pay-on-Proof (built)** |
| R8 | Toyota Boshoku lost **$37M** (2019) to a fake "change our bank details" instruction. FBI IC3: business-email-compromise losses of **$2.77B** in 2024. | Reuters / FBI IC3 | **Payee Lock** |
| R9 | Across $3.25T of spend and 400M+ invoices, **duplicate payments are 18%** of lost profit, payments on **cancelled** POs 14%, pricing discrepancies 13%. Manufacturing leaks **0.72% of annual spend**, the highest of any industry. Real duplicates are rarely exact copies; an invoice that matches the PO passes three-way match and the overpayment stays invisible. | apexanalytix 2026 Global Overpayment Report; Xelix (481M invoices); Sentra | **Duplicate & Overpayment Shield ★** |
| R10 | Buyers often forget to put delivery dates in contracts, and without pre-agreed compensation "it is very hard to prove how much loss you have suffered". A standard liquidated-damages clause charges **5% of PO value per week late**. | Global Sources "Ask the Experts"; Stevens & Bolton | **Late-Delivery Credits (auto-deducted) ★** |
| R11 | Defects found at receiving: the supplier is billed for sorting, rework and returns. Supplier quality escapes cost $2.5k–$15k per warranty claim plus OEM line-down chargebacks of $500–$2,000 per minute. | iFactory; Global Sources; Racklify | **Quality Holdback & Chargeback ★** |
| R12 | **85%** of supply-chain risk events originate below Tier 1 (Sphera, 500 CPOs). On average **20% of a firm's tier-2 suppliers are shared** by two or more tier-1s, a hidden single point of failure. In 2011, shared sub-tiers such as Renesas caused month-long auto delays. | Sphera 2025; SCRLC "Hidden Risks in Sub-Tier Supply Networks" | **Hidden Shared-Supplier Map ★** |
| R13 | 39% of companies pursue dual sourcing (McKinsey 2025); an auto supplier found only 45% of its volume dual-sourced, with one supplier holding 15% of total spend on control units. | Amazon Business (citing McKinsey); Tacto | **Single-Source Exposure score ★** |
| R14 | Disruptions +38% in 2024 (fires top cause for 6 years). German auto-supplier insolvencies +65% in 2024; 42% of suppliers financially strained (PwC). | Resilinc EventWatch; Creditreform / PwC | **Supplier Health Radar** |
| R15 | 52% of parts reaching end-of-life in 2025 came with **no change notice**; last-time-buy orders cover only ~60% of real demand. | Z2Data; SiliconExpert | **EOL / Last-Time-Buy Watch** |
| R16 | "Suppliers keep pushing back ship dates the same week things are supposed to ship"; many POs are never acknowledged. | SourceDay community; Xorosoft | **Push-out Detector + PO-confirmation chase** |
| R17 | "2/10 net 30" is worth ~**37% annualized**; buyers lose it by missing the 10-day window. | AFP; Corpay; Stampli | **Early-Pay Optimizer** |
| R18 | PayPal authorizations have a 3-day honor period and expire after 29 days; a hold that silently expires is unprotected money. | PayPal Orders/Payments v2 docs | **Hold-Expiry Guard ★** |

---

## 2. The full feature set (what each does, what it uses)

Columns: **Gemini** = what the model reads or suggests; **Python** = the deterministic rule; **PayPal** = the money action; **UI** = where it lives and which sponsor tool draws it.

### Price guards

| Feature | Gemini (reads) | Python (decides) | PayPal | UI / sponsor |
|---|---|---|---|---|
| **P1 Fair-Price Guard** | Extracts unit price, MOQ, incoterm and validity from a quote email or PDF | `quote ≤ should_cost × 1.15` passes; over 15% means "Negotiate" and an email draft; over 50% or above 3× the last price paid means "Broker markup: blocked" | No hold is created until the quote passes or a human overrides it with a code | Project → Materials inspector "Price check" card; AG Grid **price-vs-benchmark** cell renderer (bar with a should-cost tick) |
| **P2 Landed-Cost Compare ★** | Reads freight quotes and the HS code from the supplier mail | `landed = price + freight + insurance + duty(HS) + broker fee + FX buffer`; the solver scores options on landed cost, not unit price | Hold amount = landed cost for DDP; otherwise PO value plus a separate forwarder payout | OptionsTable shows "Unit $3.10 → Landed $3.92"; AG Grid column |
| **P3 Price De-escalation Watch ★** | Reads the escalation clause from the contract once | Tracks the linked index (copper/steel CSV feed); when it falls past the deadband (±3%), emails the supplier asking for the new price and caps the next hold at the de-escalated price | Next authorization is at the reduced price | Supplier page "Index-linked parts" with a sparkline (AG Charts) |
| **P4 Early-Pay Optimizer** | Spots "2/10 net 30" on invoices | `annualized = d/(100−d) × 365/(net−disc_days)`; pay early if it beats the client's cost of capital (set per org) | Capture plus an instant Payout inside the discount window | Payments → "Discounts captured" KPI in AG Studio |

### Payee guards

| Feature | Gemini | Python | PayPal | UI |
|---|---|---|---|---|
| **Y1 Payee Lock** | Classifies "we changed our bank / PayPal account" emails | Payee email is locked per supplier; a change starts a **72 h cooling-off**, a confirmation email to the *old* contact on file, and the 6-digit owner code | Payouts only ever go to `suppliers.paypal_email_verified` | Supplier page "Payee locked 🔒" badge; Approvals card "Payee change requested" |
| **Y2 Duplicate & Overpayment Shield ★** | Normalizes invoice numbers (`ZH-INV-55120` = `ZH/INV/55120-A`) | Fuzzy match on supplier + amount ± 1% + date window + PO; blocks payment on a cancelled or closed PO; sum of captures ≤ PO value | Capture is refused; the attempt is logged as an audit event | Payments ledger flag "Duplicate blocked"; AG Studio widget "Overpayments stopped" |

### Proof guards

| Feature | Gemini | Python | PayPal | UI |
|---|---|---|---|---|
| **F1 Pay-on-Proof** (built) | Reads dispatch claims, warehouse replies, invoices | Three-way match, carrier-vs-claim contradiction (rule R-07) | Authorize → capture / void / refund | PaymentTimeline, ThreeWayMatch |
| **F2 Late-Delivery Credits ★** | Reads the PO terms (LD % per week, cap) | `credit = PO × ld_pct × days_late/7`, capped at 10% | **Partial capture** (accepted value − credit); the remainder is released back to the buyer | Payment card line "Late-delivery credit −$180 (6 days × 5%/wk)" |
| **F3 Quality Holdback & Chargeback ★** | Reads the QC report / NCR email | Capture only the accepted quantity; keep a retention % (default 10%) until the line-acceptance window ends; rework cost is charged back | Partial capture now, `final_capture` later; refund for chargebacks after capture | ThreeWayMatch shows "Accepted 680 / 700 · retention 10% until 5 Dec" |
| **F4 Hold-Expiry Guard ★** | — | Daily check: any hold older than 25 days is re-authorized, or re-held if the supplier is still in transit | `POST /v2/payments/authorizations/{id}/reauthorize` | Payments KPI "Holds expiring ≤ 3 d" |

### Deadline guards

| Feature | Gemini | Python | PayPal | UI |
|---|---|---|---|---|
| **D1 Deadline Guard: buy timers** | — | Per project BOM line: `order_by = need_by − lead_time − transit(mode) − buffer`; states green (>7 d), amber (≤7 d), red (≤2 d), late. When red, the agent drafts the PO automatically (fair-price and budget checks still apply) | The PO goes straight to a PayPal hold | **New "Buy timers" tab**: AG Grid with live countdown renderer; **Bryntum Gantt** shows "order-by" diamonds and deadline constraints; Mission Control KPI "Timers red" |
| **D2 Push-out Detector + PO-confirmation chase** | Reads "revised ETD" emails and diffs them against the promised date | No confirmation in 48 h triggers a chase email (2nd: CC the account manager); any slip re-runs D1 and the Gantt critical path, and creates an incident if the project due date moves | — | **Bryntum Scheduler** draws the "ghost bar" (promised) vs the new bar; TaskBoard card |
| **D3 Approved Alternates ★** | *Suggests* candidate equivalent parts from datasheets (shown as "suggested, needs engineer approval") | Only **engineer-approved** form-fit-function alternates on the BOM line can be auto-ordered; red timer + primary short → alternate PO | Hold on the alternate supplier | Materials tree child rows "Alt A (approved) / Alt B (suggested)" |
| **D4 EOL / Last-Time-Buy Watch** | Reads change notices and distributor lifecycle emails | LTB qty = remaining project demand + spares; LTB date becomes a buy timer | Hold for the LTB qty within the budget envelope | Badge "EOL: last buy 30 Jan" on the BOM line |

### Budget guards

| Feature | Gemini | Python | PayPal | UI |
|---|---|---|---|---|
| **B1 Budget Envelopes** | — | Envelope = (project, optional part category, window start–end, cap). Every hold checks `committed + new ≤ cap`; over → hold needs the owner code; envelope forecast = committed + upcoming timers | Hold amount is capped by the envelope; a capture can never exceed the authorized value | Project → **Money** tab: AG Grid tree (project → category → PO) with burn bars; AG Studio "Budget burn-down" |
| **B2 Project cash-flow plan** | — | Time-phased: holds expiring, captures expected (ETA + QC), payouts, early-pay windows | — | Bryntum Gantt resource histogram style "cash needed by week" (or Recharts area) |

### Supplier-risk guards

| Feature | Gemini | Python | PayPal | UI |
|---|---|---|---|---|
| **S1 Supplier Health Radar** | Summarizes news (fire, strike, insolvency filing) about a supplier | Score = OTIF 30% + claim truthfulness 25% + defect ppm 20% + financial/news signal 25%. Below 50 means pay-on-proof only with no advance, and a dual source is suggested | Payment terms follow the score (trusted suppliers get faster release) | Suppliers grid (AG Grid) with a scorecard detail row |
| **S2 Hidden Shared-Supplier Map ★** | Reads the supplier's declared sub-suppliers (form email) | Graph check: if a "dual-sourced" part's two suppliers share a tier-2, it is marked **false diversification** | — | **Mapbox globe**: dashed tier-2 links; red node where the two chains converge |
| **S3 Single-Source Exposure** | — | % of project BOM value with one approved supplier; top 5 exposures | — | Project Overview KPI + list |

---

## 3. What we build in the 9 days (priority)

Scoring: judge impact (does it make the video and show off PayPal?) vs build cost given what exists.

| Tier | Features | Why | Effort |
|---|---|---|---|
| **Must (core demo)** | D1 Buy timers · B1 Budget envelopes · Y1 Payee lock · Y2 Duplicate shield · P1 Fair-price guard · F2 Late-delivery credits · F3 Quality holdback · F1 (done) | Each one touches PayPal (hold, partial capture, payout, refusal). Together they make the "seven guards between the AI and your money" story | ~3.5 days |
| **Should** | D2 Push-out + ack chase (real SMTP/IMAP) · P4 Early-pay · F4 Hold-expiry · P2 Landed cost in solver · D3 Approved alternates | Shows email intelligence and deadline protection; most reuse existing code | ~2 days |
| **Show (seeded data, UI only)** | S1 Health radar · S2 Shared-supplier map · S3 Exposure · D4 EOL watch · P3 De-escalation · B2 Cash plan | Strong visuals for the video; logic is simple but external data feeds are out of scope, so the signals are seeded | ~1 day |

### Guard pipeline (the core diagram for the video and README)

```
Quote/PO ──► P1 Fair price ──► P2 Landed cost ──► B1 Budget envelope ──► Authority limit ──► PayPal HOLD
                (block / negotiate)                 (over → owner code)       (> $5k → code)      (Orders AUTHORIZE)

Goods arrive ─► F1 3-way match ─► F3 QC accepted qty ─► F2 Late credit ─► Y2 Duplicate check ─► PayPal CAPTURE (partial)
                                                                                                   └─► Y1 Payout to LOCKED payee only
Anytime: D1 timers · D2 push-outs · F4 hold expiry · S1 health → incidents → agent re-plans
```

**Pitch line:** *"Seven guards stand between the AI and your money."*

### Day plan

| Day | Date | Work |
|---|---|---|
| 1 | Fri 6 Nov | Finish the paused backend loop (`ui_snapshot.py`, seed re-link). Migration `0012_buyer_shield`. Guards P1, Y1, Y2 inside `finance_agent` (pre-hold / pre-capture checks). Fix the authority limit to **$5,000** |
| 2 | Sat 7 Nov | D1 buy timers (BOM lines, need-by, lead time, in-process scheduler loop) + B1 envelopes; snapshot endpoints |
| 3 | Sun 8 Nov | F2 + F3 using partial capture; F4 reauthorize; sandbox-verify multiple partial captures (fallback: capture the accepted value and keep retention on our side via a later Payout) |
| 4 | Mon 9 Nov | D2 email chase (SMTP out, IMAP poll in), P4 early-pay, P2 landed cost in `solver.py`, D3 alternates |
| 5 | Tue 10 Nov | UI: Buy-timers tab (AG Grid countdown + Gantt order-by markers), Money tab envelopes (AG Grid tree + AG Studio burn-down), "Buyer Shield" panel on Mission Control, guard badges in inspector |
| 6 | Wed 11 Nov | UI wired to the live API (login, snapshot, approvals, simulation buttons); S1/S2/S3/D4 seeded views; shared-supplier lines on the globe |
| 7 | Thu 12 Nov | Agent Toolkit read-only chat, Zapier alert (optional), APIMatic SDK from our OpenAPI, Postman collection, README per integration |
| 8 | Fri 13 Nov | Record video (warm Render first), sandbox screenshots |
| 9 | Sat 14 Nov | Devpost submission, repo public, buffer |

---

## 4. Data model additions (migration 0012_buyer_shield)

| Table / column | Purpose |
|---|---|
| `bom_lines(project_id, part_id, qty, need_by, lead_time_days, transit_days, buffer_days, approved_alternates jsonb, eol_date, ltb_date)` | Buy timers, alternates, EOL |
| `budget_envelopes(project_id, category null, window_start, window_end, cap_usd)` | Budget guard |
| `price_benchmarks(part_id, should_cost_usd, last_paid_usd, index_name, index_base, deadband_pct)` | Fair price, de-escalation |
| `purchase_orders + ld_pct_per_week, ld_cap_pct, retention_pct, discount_pct, discount_days, net_days, acknowledged_at, promised_date, revised_date` | Credits, holdback, early pay, push-outs |
| `suppliers + paypal_email_verified, payee_locked_at, health_score, health_signals jsonb` | Payee lock, radar |
| `payee_change_requests(supplier_id, new_email, requested_via, cooling_until, status)` | Payee lock flow |
| `supplier_subtiers(supplier_id, subtier_name, lat, lon, part_category)` | Shared-supplier map |
| `guard_events(org_id, guard, ref, amount_usd, outcome, detail jsonb)` | One ledger of every guard decision → "money protected" KPI, audit, video numbers |

All tables follow the 0010 RLS pattern (`org_id`, `app_current_org()`).

---

## 5. Hackathon integration map

| Sponsor / tool | Where it shows up in the Buyer Shield | Cost / trap |
|---|---|---|
| **PayPal** | Vault mandate, AUTHORIZE holds capped by envelopes, **partial captures** (credits, holdback), **reauthorize** (expiry guard), refunds (chargebacks), **Payouts** to locked payees only, webhooks, Agent Toolkit read-only chat | Sandbox, free |
| **AG Grid Enterprise** | Buy-timer grid (countdown renderer), budget tree, price-vs-benchmark renderer, supplier scorecards (master-detail) | Trial key (watermark until the Grid key is set) |
| **AG Studio** | Buyer Shield dashboard: money protected by guard, budget burn-down, discounts captured, overpayments stopped | Trial key in place |
| **Bryntum** | Gantt: order-by diamonds + deadline constraint lines; Scheduler: push-out ghost bars; TaskBoard: guard incidents | Trial until 20 Dec |
| **Mapbox** | Shared tier-2 convergence on the globe | Free tier |
| **Gemini** | Reads quotes, payee-change mails, revised-ETD mails, QC reports, contract clauses; suggests alternates (never decides) | Free tier quotas: batch the reads |
| **Email (Gmail SMTP/IMAP)** | PO-confirmation chase, payee-change confirmation to the old contact, approval codes, negotiation drafts | Free |
| **Render** | Backend + in-process scheduler loop for timers / expiry | **Do not** use Render Cron Jobs (paid). The free instance sleeps, so timers are also re-checked on each request + snapshot |
| **Supabase** | Tables + RLS; optional `pg_cron` to nudge the timer check | Free |
| **Zapier (optional)** | Red timer / blocked payee → Slack message | 14-day trial; skip if it costs anything |
| **APIMatic / Postman** | Typed SDK + public collection for the Buyer Shield endpoints | Trial / free |

---

## 6. Demo data the UI and video must agree on

| Guard | Demo event | Amount |
|---|---|---|
| F1 Void on lie | PO-7712 Zhen Hua "dispatched" vs COSCO "no pickup" | **$5,880** voided |
| F3 Refund on failed QC | PO-7730 wrong silicon revision | **$1,240** refunded |
| P1 Broker markup blocked | Broker quote $14.20/unit for 700 MCUs vs should-cost $3.10 (4.6×) | **$7,770** overcharge avoided |
| Y2 Duplicate blocked | `ZH-INV-55120-A` re-sent after `ZH-INV-55120` | **$5,880** |
| Y1 Payee change blocked | Email "new PayPal for Zhen Hua payments" from a look-alike domain | **$4,410** redirect stopped |
| F2 Late-delivery credit | PO-7744 AeroCell 6 days late, 5%/week on $4,200 | **$180** deducted |
| P4 Early-pay discount | Coastal Connectors (PO-7725) 2/10 net 30 | **$78** saved (37% annualized) |
| **Total protected** | 7 guards | **$25,438** |
| D1 Buy timers | 23 timers across 5 projects; 3 red handled → 0 projects slipped | — |
| B1 Envelope | PRJ-2041 cap $48,000 · committed $31,420 · forecast $44,900 | — |
| S2 Shared supplier | Both connector sources (Coastal Connectors SUP-103 + Sahyadri Harness Works SUP-77) plate at the same sub-supplier, "Penang Plating Works": flagged | — |

---

## 7. What we are not doing (and why)

| Idea | Decision | Why |
|---|---|---|
| Real news / insolvency feeds | Seeded signals | Paid APIs; not judged on data vendors |
| Real commodity index API | Bundled CSV of index values | LME/MEPS are paid |
| PayPal Disputes API for chargebacks | Refund + evidence pack instead | Disputes are buyer-initiated against a merchant; our refunds already return the money |
| LLM auto-approving alternates | Suggest only; an engineer approves | A wrong alternate stops a line (R2); the LLM never decides |
| Render Cron Jobs | In-process loop | Paid feature |
