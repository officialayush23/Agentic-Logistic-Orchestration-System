# Task: write up the DisruptionOps project details (for the launch video)

---

## 0. The format we use

(Unchanged. Beat table: `| # | Time (s) | Voice-over (exact words) | On screen | Cursor / button | Handoff into next beat |`. Shape: problem → pain (real number) → "Meet DisruptionOps" → 3–4 proof beats on the real UI → result numbers → tagline → logo.)

---

## 1. Project basics

| Field | Your answer |
|---|---|
| Product name (exact spelling + how it's pronounced) | **DisruptionOps**, one word with a capital D and capital O. Say "dis-RUP-shun ops" (rhymes with "corruption ops"). |
| One-line description (≤ 12 words) | Buyer-side AI agent: projects ship on time, on budget, paid only on proof. |
| Tagline for the end card (≤ 6 words) | **Never pay for what didn't arrive.** (sub-line: *Money moves only on proof.*) |
| Hackathon name + track | **Build What's Next with PayPal and AI** (PayPal global online hackathon, Devpost). No tracks. Prize categories we are aiming at: Best Use of Agentic Commerce, Best Use of PayPal + AI, Best Use of AG Grid, Best Use of Bryntum, Best Use of Render. |
| Team name + members (as they should appear) | Team **kala dhua**: Ayush Pathak · Shreeviraj Matale · Meet Shah · Krishna Lokhande · Pooja Wavdara |
| Live URL to show on the end card | **agenticlogisticsystem.vercel.app** |
| Repo URL | **github.com/officialayush23/Agentic-Logistic-Orchestration-System** |
| Who is the user? (role, company type) | The **supply-chain / procurement lead at a Tier-1 automotive electronics plant** (in the demo: Pune Plant 1, Chakan, building controllers and battery-management systems for EV makers like "Bharat EV Motors"). Second user: the **plant finance approver**, who owns each project's budget envelope and signs off on anything above the agent's $5,000 limit. |

---

## 2. The problem, in the user's words

| Field | Your answer |
|---|---|
| The pain in one sentence | "Suppliers overcharge me, push dates back, send the same invoice twice and say parts shipped when they didn't, and my customer's deadline pays for all of it." |
| What happens today without the product (step by step, who does what) | 1) A buyer emails the supplier: "where is PO-7712?" 2) The supplier replies "dispatched 3 days ago" and attaches an invoice. 3) Nobody checks the carrier; tracking says "label created, no pickup". 4) Accounts payable pays the invoice because the PO and invoice match. 5) The line-stop risk is noticed only when stock hits zero. 6) Someone hunts for a backup supplier by phone and email, under deadline. 7) An expensive air shipment needs a manager's approval, which waits in an inbox. 8) Clawing back the money from the first supplier takes weeks, if it happens at all. |
| What it costs when it goes wrong (time / money / line stop) | Line stop: about **$2.3M per hour** for a large automotive plant (Siemens 2024, see §3). Demo plant: SCU-700 needs **700 MCUs in 6 days with 0 on hand**. Money already sent for goods that never shipped: **$5,880** (PO-7712). Recovery by air: **$6,580** to a certified backup (Formosa Precision). Source: live app (PROD-882, PO-7712). |
| One real-feeling story we can dramatize (who, what part, what went wrong) | **Thursday, Pune.** Bharat EV Motors needs 700 Smart Controller Units in 6 days. The MCUs come from **Zhen Hua Electronics (Shenzhen)** on PO-7712. Zhen Hua emails: *"Goods dispatched 3 days ago. Please release payment per invoice ZH-INV-55120."* COSCO tracking COSU6218840 says: **"Label created, no pickup."** DisruptionOps catches the contradiction, refuses to pay, **voids the $5,880 hold**, re-sources to **Formosa Precision (Hsinchu)** by air, holds **$6,580** in PayPal, and releases it only when the Pune warehouse confirms receipt and QC. |

---

## 3. Industry numbers (how big this is globally)

| Claim (exact wording for the video) | Number | Year | Source (link) |
|---|---|---|---|
| "One hour of downtime in a large car plant costs $2.3 million." | $2.3M per hour (over $600 a second) | 2024 | Siemens / Senseye, *The True Cost of Downtime 2024*: https://assets.new.siemens.com/siemens/assets/api/uuid:1b43afb5-2d07-47f7-9eb7-893fe7d0bc59/TCOD-2024_original.pdf |
| "Supply chains break for a month or more every 3.7 years." | every 3.7 years | 2020 | McKinsey Global Institute, *Risk, resilience, and rebalancing in global value chains* (press summary): https://www.manufacturingtomorrow.com/news/2020/08/05/as-covid-19-highlights-vulnerabilities-in-global-supply-chains-and-resilience-takes-priority-report-calculates-ongoing-cost-of-shocks-and-prospects-for-production-to-shift/15659 |
| "Over a decade, those shocks erase almost half a year's profit." | ~45% of one year's EBITDA per decade | 2020 | Same McKinsey Global Institute report (same link as above) |
| "Three in four companies were hit by payments fraud last year." | 76% of US organizations (attempted or actual), 2025 | 2026 | AFP, *2026 Payments Fraud and Control Survey*: https://www.financialprofessionals.org/about/learn-more/press-releases/Details/over-75-percent-of-us-firms-experienced-payments-fraud-in-2025-while-ai-adoption-for-fraud-mitigation-lags |
| "Fake business emails cost companies $2.77 billion in a single year." | $2.77B (21,442 complaints) | 2024 | FBI IC3 2024 Internet Crime Report, via Nacha: https://www.nacha.org/news/fbis-ic3-finds-almost-85-billion-lost-business-email-compromise-last-three-years |
| "India's biggest carmaker couldn't build 46,000 cars in one quarter, for want of chips." | ~46,000 units (Oct–Dec 2022); 3.63 lakh orders pending | 2023 | Maruti Suzuki CFO via PTI / DT Next: https://www.dtnext.in/news/business/semiconductor-shortage-continues-to-impact-maruti-suzukis-production |
| "Duplicate payments are the biggest single cause of lost profit in accounts payable." | 18% of lost profit (400M+ invoices, $3.25T spend) | 2026 | apexanalytix 2026 Global Overpayment Report: https://www.apexanalytix.com/resources/blog/apexanalytix-2026-global-overpayment-report/ |
| "Manufacturers leak more spend to payment errors than any other industry." | 0.72% of annual spend | 2026 | Xelix analysis of 481M invoices (via BriefGlance): https://briefglance.com/articles/ai-plugs-the-53-billion-leak-in-corporate-accounts-payable |
| "A ten-dollar quote becomes a fifteen-dollar part once it lands." | +56% landed vs factory quote | 2025 | Sourcify, Hidden Factory Costs: https://sourcify.com/blog/uncovering-the-hidden-factory-costs/ |
| "85% of supply-chain risk starts with your supplier's suppliers." | 85% below Tier 1 | 2025 | Sphera N-Tier survey (500 CPOs): https://procurementmag.com/risk-management/sphera-cpo-cso-survey |
| "Paying early on 2/10 net 30 is a 37% annual return most buyers miss." | ~37% annualized | 2026 | AFP: https://www.financialprofessionals.org/training-resources/resources/articles/Details/when-does-it-pay-to-take-an-early-payment-discount |

Which ONE should open the video? → **"One hour of downtime in a large car plant costs $2.3 million."** It is the most visual and matches our user exactly. Second beat uses the **Maruti 46,000 cars** line, because it is Indian and makes the "one missing part" fear concrete.

---

## 4. PayPal sandbox: exactly what we use and why it matters

All IDs below are real **PayPal sandbox** transactions made by DisruptionOps (merchant `sb-unq5y53709739@business.example.com`; buyer `dops-buyer-dada@business.example.com`).

| PayPal product | API / endpoint / SDK call | Code file | When the agent calls it (trigger) | Example from the demo (IDs, amounts) | Why it matters for this ecosystem |
|---|---|---|---|---|---|
| **Vault v3: setup token** (spending mandate) | `POST /v3/vault/setup-tokens` (usage_type MERCHANT, ON_PAYER_APPROVAL) | `backend/app/paypal_client.py` | Once, when the plant connects its PayPal wallet and approves "agent may spend for us" | Setup token **0FC18452DJ213630Y**, approved by the buyer on PayPal's own page | The human consents **once**, on PayPal; the agent never sees a password or card. |
| **Vault v3: payment token** | `POST /v3/vault/payment-tokens` | same | Right after the approval returns to `/mandate/return` | Vault id **429990492e962572x** (customer **dVPWCuakiw**) | Turns that one consent into a reusable, revocable mandate: the basis of agentic commerce. |
| **Orders v2: hold funds** | `POST /v2/checkout/orders` with `intent: AUTHORIZE` + `payment_source.paypal.vault_id` | same + `finance_agent.py` | Deterministic solver picks a recovery supplier → agent places a hold, no human click | Order **2YD51330MB766861S** → authorization **5LK9680517471812N**, **$6,580** for PO-7790 (expires 4 Dec 2026). Order **4EY1554464456701K** → authorization **45357457J6295492T**, **$5,880** for PO-7712 | Money is **reserved but not moved**, so the supplier sees committed funds and the buyer keeps control. |
| **Payments v2: capture** | `POST /v2/payments/authorizations/{id}/capture` | same | Warehouse confirms receipt + QC → three-way match passes (PO ↔ invoice ↔ goods receipt) | Capture **91M79894DL640601B**, **$6,580**, COMPLETED | Payment happens only after verified goods. |
| **Payments v2: void** | `POST /v2/payments/authorizations/{id}/void` | same | Carrier contradicts the supplier's dispatch claim (scenario S3) | Authorization **45357457J6295492T** → **VOIDED** ($5,880 never left the buyer) | The lie costs the liar, not the buyer: no chargeback chase. |
| **Payments v2: refund** | `POST /v2/payments/captures/{id}/refund` | same | Goods arrive but fail QC after payment (wrong silicon revision) | Capture **4YS16732CG4236228** ($1,240, PO-7730) → refund **2H629030W4747693S**, COMPLETED | Money comes back automatically when the goods were wrong. |
| **Payouts** | `POST /v1/payments/payouts` | same | Paying a freight forwarder an expedite fee; releasing funds to the supplier | Batch **BZYS2T6Z25Y7G**: **$15** expedite fee to AeroCell → **SUCCESS**; supplier releases paid the same way after capture | Suppliers and forwarders get paid instantly, in one call, the moment goods are verified. |
| **Webhooks** | `POST /v1/notifications/webhooks` (register) + `POST /v1/notifications/verify-webhook-signature` | `backend/app/main.py` → `/api/webhooks/paypal` | Every PayPal state change, so the app trusts PayPal and not its own memory | Endpoint `https://agentic-logistic-orchestration-system.onrender.com/api/webhooks/paypal`; signature verified on every event; idempotent by event id | Signed events keep the agent's view of the money identical to PayPal's. |
| **Payments v2: partial capture** | `POST /v2/payments/authorizations/{id}/capture` with `amount` < held and `final_capture:false` | `finance_agent.py` | Goods accepted but late or partly rejected: capture = accepted value − late-delivery credit, keep 10% retention | PO-7744 AeroCell: held **$4,200**, captured **$4,020** (−$180 late credit, 6 days × 5%/week) | The penalty is enforced by the payment itself; no chasing a credit note. |
| **Payments v2: reauthorize** | `POST /v2/payments/authorizations/{id}/reauthorize` | `finance_agent.py` (Hold-Expiry Guard) | Any hold ≥ 25 days old while goods are still in transit | Sea shipment PO-7761: hold refreshed before expiry | Long ocean legs stay protected; a hold never silently lapses. |
| **Refusal is a feature** (no API call) | Guards run *before* `create order` / `capture` / `payout` | `finance_agent.py` → `guard_events` table | Broker quote 4.6× should-cost; duplicate invoice `ZH-INV-55120-A`; payout to a changed payee | **$7,770** overcharge avoided, **$5,880** duplicate blocked, **$4,410** redirect stopped | The safest PayPal call is the one the agent refuses to make. |
| **PayPal Agent Toolkit** (read-only) | Agent Toolkit tools (order / invoice lookup) | `backend/app/agent_tools.py` | When a user asks the chat agent "has Formosa been paid?" | "Formosa Precision: $6,580 captured for PO-7790" | PayPal + AI together, with zero write access for the LLM. |

Also answer:

| Question | Your answer |
|---|---|
| Sandbox only, or anything live? | **Sandbox only.** Nothing touches live money. |
| Webhooks received? Which event types? | **Yes**, signature-verified: PAYMENT.AUTHORIZATION.CREATED, PAYMENT.AUTHORIZATION.VOIDED, PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.REFUNDED, PAYMENT.PAYOUTS-ITEM.SUCCEEDED, VAULT.PAYMENT-TOKEN.CREATED. |
| The full money lifecycle, in order (e.g. hold → … → release / void / refund) | **Mandate** (Vault, human approves once) → **Hold** (Orders AUTHORIZE: buyer's funds reserved) → **Invoice read** (Gemini extracts it; Python does the three-way match) → **Capture** on verified goods, then **Payout** to the supplier. Bad paths: **Void** if the supplier's claim is contradicted, **Refund** if goods fail QC after capture. Over-limit amounts: the hold still happens, but **release waits for a human code**. |
| Spending rules (agent limit, who approves above it, how: code/email/…) | Three limits, all deterministic: (1) **per order**: the agent holds and releases up to **$5,000** alone; above that the hold is placed but **capture waits** for a **6-digit one-time code sent by email**; (2) **per project budget envelope** (e.g. PRJ-2041: $48,000 for Nov–Jan); a hold that would break it also needs the code; (3) **payee lock**: payouts only to the supplier's verified PayPal email; changing it takes 72 h + the code + a confirmation to the old contact. |
| How PayPal solves the trust problem between buyer and supplier, in 2–3 sentences | The supplier sees money **committed** through PayPal the moment the order is placed, so they ship. The buyer's money only **moves** when goods are verified, and is **voided or refunded** automatically if the supplier lied or shipped the wrong part. PayPal is the neutral party holding the money, so neither side has to trust the other's word. |
| The ONE sentence about PayPal judges should remember | **"A team of AI agents reads the world, but only the Treasurer can move money: PayPal holds it, and it moves only on proof, to the right supplier, at a fair price, once."** |
| Proof we can show (sandbox dashboard screenshots / transaction IDs) | IDs above (orders 2YD51330MB766861S / 4EY1554464456701K, authorizations 5LK9680517471812N / 45357457J6295492T, capture 91M79894DL640601B, refund 2H629030W4747693S, payout batch BZYS2T6Z25Y7G). Sandbox **Activity** page for `dops-buyer-dada@business.example.com` shows the holds, the capture, the void and the refund; the in-app Payments ledger shows the same PayPal IDs. |

---

## 5. How it works (the product's moves)

All screens are live at **agenticlogisticsystem.vercel.app**. The product is a **Buyer Shield**: seven guards, every one visible on screen.

| # | What the product does | Which screen / URL shows it | The exact on-screen moment (button, number, label) | Real data shown (IDs, amounts) |
|---|---|---|---|---|
| 1 | **Watches every project and every shipment** on a live globe, with the Buyer Shield total | `/` Mission Control | Globe over India, routes into "Pune Plant 1"; KPI strip **"Protected $25,438 · Timers red 3 · Held $35,790"** | 5 projects, 8 inbound shipments, 12 suppliers |
| 2 | **Buy timers**: tells you the last day to order each part so the project still ships | `/projects/PRJ-2043?tab=timers` | Row **"PCB-12 · order by 9 Nov · 2 d 04 h"** turns red; button **"Agent drafted PO-7801"**; Gantt shows a diamond **"Order-by"** before the bar | 23 timers, 3 red, 0 projects slipped |
| 3 | **Fair-price guard** blocks a broker markup | Materials inspector → "Price check" | **"Quote $14.20 · should-cost $3.10 · 4.6× → Broker markup: blocked"**; second option **"Formosa $3.24 ✓"** | $7,770 overcharge avoided |
| 4 | **Catches the lie** (claim vs carrier) and **voids the hold** | `/projects/PRJ-2041?tab=materials` → PO-7712 | **"Supplier says: Dispatched 3 days ago"** vs **"COSCO: Label created — no pickup"** → **"Hold voided $5,880"** | Authorization 45357457J6295492T VOIDED |
| 5 | **Payee lock + duplicate shield** | `/payments` ledger | Red rows: **"Payee change from look-alike domain: blocked, 72 h lock"** ($4,410); **"ZH-INV-55120-A duplicate of ZH-INV-55120: blocked"** ($5,880) | guard_events G-114, G-118 |
| 6 | **Pays on proof, minus penalties** | `/payments` → PO-7744 PaymentCard | ThreeWayMatch ✓ → **"Late-delivery credit −$180 (6 days × 5%/wk)"** → **"Captured $4,020 of $4,200"** → Payout to 🔒 verified email | Partial capture, payout SUCCESS |
| 7 | **Budget envelope** keeps the project on budget | `/projects/PRJ-2041?tab=money` | Burn bar **"$31,420 committed of $48,000 · forecast $44,900"**; a $9,855 air option would cross the line → **Approvals** card with 6-digit code | APR-88 |
| 8 | **Hidden shared supplier** found under a "dual source" | `/shipments` globe | Two connector routes (Coastal Connectors, Sahyadri Harness Works) converge on a red node **"Penang Plating Works: shared sub-supplier"** | S2 flag on COMP-131 |
| 9 | **Re-plans the timeline** | `/projects/PRJ-2041?tab=timeline` (Bryntum Gantt) | Bars shift after PO-7790; teal diamonds **"Release funds (after QC)"**; red **Due** line still met | SCU-700, due in 6 days |

---

## 6. Tech stack (what we used)

| Layer | What | Why it matters on screen |
|---|---|---|
| Agents | **LangGraph multi-agent team**: a Supervisor routes every turn to 8 specialists: Sentinel, Investigator, Liaison, Sourcing, Approval, Procurement, **Treasurer** (the only one that moves money, no LLM), Verifier. Plus a **Copilot** (Gemini ReAct, read-only tools) | Agent Team page: the team graph, each incident as a thread, turn-by-turn trail |
| Agent memory | **Postgres checkpointer**: one thread per incident, every turn saved; approvals pause the graph with `interrupt()` and resume days later. **Long-term store**: each supplier's record (lies, late, defects, payee alerts → trusted / watch / proof-only) and past incidents | "memory · postgres" badge; Suppliers "Agent memory" column; "Excluded SUP-21 on its memory record" in the trail |
| Decisions | Deterministic solver + **7 Buyer Shield guards** (`guards.py`), every verdict in `guard_events` | Buyer Shield ledger |
| AI | Google Gemini reads supplier emails, quotes and claims; drafts messages; powers the Copilot | Investigator and Liaison steps; Copilot panel |
| Money | PayPal sandbox: Vault, Orders AUTHORIZE, capture / partial capture / void / refund / reauthorize, Payouts, verified webhooks | Payments ledger with real IDs |
| Email | SMTP out (codes, chases, payee confirmations) + **IMAP in** (supplier replies → agent team) | Simulation Lab "Inbound supplier email" |
| UI | React 19, Tailwind v4 (Lavender Glass), **AG Grid Enterprise + AG Studio**, **Bryntum Gantt / Scheduler / TaskBoard**, Mapbox 3D globe | every screen |
| Platform | FastAPI on **Render** (Docker), Supabase Postgres (row-level security), Vercel; **Postman** collection | — |

---

## 7. Results and proof numbers

All numbers below were produced **live on the deployed system** (Render + PayPal sandbox) on 9 Nov 2026. The UI reads the same ledger, so record the video right after a fresh run (see §9 checklist) and read the totals off the screen.

| Metric | Live value | Where it comes from |
|---|---|---|
| Hold voided on a supplier lie (S3) | **$1,404.76**, PO-7712 | Treasurer agent, after the Investigator caught "dispatched" vs COSCO "no pickup" |
| Broker quote blocked (4.6× should-cost) | **$3,400** overcharge stopped | Fair-price guard |
| Payee change from look-alike domain | **$1,404.76** kept with the verified payee | Payee lock (72 h cooling-off; approving early returns HTTP 409) |
| Late-delivery credit, PO-7718 (6 days late) | **−$174.88** from the capture | Partial capture |
| Quality holdback (380/400 passed) + retention | **$214.76** not paid, **$408.05** retention held | Partial capture, `final_capture=false` |
| Duplicate invoice CC-7725-A | refused (**$770**) | Duplicate shield |
| Early-pay discount (2/10 net 30) | **$15.71** taken, 37%/yr vs 12% cost of capital | Early-pay optimizer |
| Real PayPal captures | e.g. `03N1676279699893G` ($3,497.55 net of credit + retention) | Payments ledger |
| Agent memory in action | Sourcing excluded the lying supplier on its record | Agent Team trail |
| Buy timers | 3 red → 2 handed to the team as incidents, 1 covered by stock | Sentinel patrol |
| Checkpoints per incident thread | 11+ (every agent turn) | Agent Team header |

---

## 8. Highlights: rank what the judges must see

| Rank | Highlight | One-line proof |
|---|---|---|
| 1 | **Seven guards between the AI and your money** (the Buyer Shield) | Mission Control "Protected $25,438"; each guard has a row in the ledger. |
| 2 | **The lie gets caught, and the money never leaves** | PO-7712 claim vs carrier → authorization 45357457J6295492T **VOIDED**. |
| 3 | **The deadline is protected before anything goes wrong** | Buy timer turns red → agent drafts the PO → Gantt "Order-by" diamond → project still meets Due. |
| 4 | **PayPal enforces the contract**: holds, partial capture with late credit, payout only to the locked payee | PO-7744: $4,200 held → $4,020 captured → payout to 🔒 email. |
| 5 | **AI reads, Python decides, PayPal moves** | Every step tagged Gemini / Solver / PayPal; Gemini never touches a money step. |

---

## 9. Draft beats (~85 s)

**Recording checklist (10 minutes before):** open `/api/health` to wake Render → Buyer Shield **Run guard drill** → Simulation Lab **Supplier lies about dispatch** → wait ~1 min until Approvals shows the plan waiting → start recording. Don't approve before beat 10.

| # | Time (s) | Voice-over (exact words) | On screen | Cursor / button | Handoff |
|---|---|---|---|---|---|
| 1 | 0.0–3.5 | "[low, measured] One hour of downtime in a car plant costs two point three million dollars." | Black → **$2,300,000** counter; "Siemens, 2024" | — | Digits scatter into a headline |
| 2 | 3.5–7.5 | "[heavier] India's biggest carmaker couldn't build forty-six thousand cars in one quarter. <slow>For want of chips.</slow>" | "46,000 cars not built · Oct–Dec 2022"; one chip blinks red | — | Chip flies into an inbox |
| 3 | 7.5–13.0 | "[tense, quick] Suppliers overcharge. [beat] Push dates back. [beat] Invoice twice. [beat] And say it shipped when it didn't." | Four email cards: broker quote, "will now ship on 24 Nov", CC-7725-A, "goods dispatched" | — | Cards crack and fall |
| 4 | 13.0–17.0 | "[confident, warm] Meet DisruptionOps: a team of AI agents that works for the buyer." | Wordmark → **Agent Team** page: supervisor and eight agents light up | — | Zoom into the team graph |
| 5 | 17.0–23.0 | "A Sentinel watches every project. When a part's order-by date turns red, it hands it to the team." | Buyer Shield buy timers: red countdown; Gantt order-by diamond | Hover the red timer | Cut to the thread trail |
| 6 | 23.0–30.0 | "The Investigator reads the supplier's email. [beat] The carrier disagrees. [emphatic] So the Treasurer voids the PayPal hold." | Agent Team trail: Investigator → Treasurer "Pay-on-proof: hold voided"; Payments row PO-7712 **Hold voided** | Click the INC thread | Memory line highlights |
| 7 | 30.0–35.0 | "And the team remembers. That supplier is now proof-only." | Trail line "Excluded SUP-21 on its memory record"; Suppliers page "proof only" badge | — | Slide to Buyer Shield |
| 8 | 35.0–42.0 | "[dry] A broker wants four times the fair price. Blocked. [beat] A look-alike domain asks for a new payout account. Locked." | Ledger rows: **fair_price · block**, **payee_lock · block**; Approvals: payee change, button disabled "cooling-off" | — | PaymentCard expands |
| 9 | 42.0–50.0 | "[rising] Money moves only on proof, [beat] minus what the supplier owes you for being late." | PO-7718: ThreeWayMatch ✓ → **late credit −$174.88** → **retention $408.05** → captured → payout to 🔒 payee | — | Cut to Approvals |
| 10 | 50.0–57.0 | "Above its limit, the team stops and asks. [beat] One click, and the same thread picks up where it paused." | Approvals: "agent plan" card → **Approve** → Agent Team: Procurement → Treasurer hold appear live | Click Approve | Gantt slides in |
| 11 | 57.0–62.0 | "It even finds the hidden supplier your two backups secretly share." | Globe: two dashed links converge on red **Penang Plating Works · shared sub-supplier** | — | Pull back |
| 12 | 62.0–67.0 | "So the project still ships on time." | Bryntum Gantt: bars shift, Due line met, teal release diamonds | — | Collapse to numbers |
| 13 | 67.0–74.0 | "[steady] Every refusal is logged. Every dollar moves through PayPal. Nothing moves on a guess." | Buyer Shield KPI (read the live total) · guard tiles light up one by one | — | Copilot types |
| 14 | 74.0–79.0 | "Ask it anything." | Copilot: "Which supplier should we trust least?" → answer citing tools | Type the question | Fade |
| 15 | 79.0–85.0 | "[quiet, certain] DisruptionOps. Never pay for what didn't arrive." | End card: logo, tagline, **agenticlogisticsystem.vercel.app**, "Built on PayPal sandbox" | — | Fade to lavender |

Beat 14 needs a working Gemini key on Render. Without one, cut it and run 79 s.

---

## 10. Send back

1. This file, filled in. ✔
2. Screenshots / recording: PayPal sandbox **Activity** page (`dops-buyer-dada@business.example.com`) showing the holds, capture, void and refund; plus the in-app Payments ledger with the same IDs.
3. Logo: **N/A.** There is no official logo; the app currently uses a lucide "Workflow" icon on a violet→azure gradient square.
