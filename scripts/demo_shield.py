"""Drive the live API through every Buyer Shield guard (PayPal sandbox, real calls).

    python scripts/demo_shield.py https://agentic-logistic-orchestration-system.onrender.com

Order: reset world → holds → broker quote (fair price) → payee change (payee lock)
→ deliver PO-7718 6 days late with 680/700-style partial QC (late credit + holdback)
→ deliver PO-7725 (capture + payout) → re-submit PO-7725 invoice (duplicate)
→ Sentinel patrol (buy timers, missing acks) → print the Shield ledger.
"""
import json, sys, time, urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
EMAIL, PASSWORD = "demo@disruptionops.io", "DemoPass123!"
TOKEN = None


def call(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json",
                                          **({"Authorization": f"Bearer {TOKEN}"} if TOKEN else {})})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read() or b"{}")


def show(title, out):
    print(f"\n== {title}")
    print(json.dumps(out, indent=1, default=str)[:1200])


login = call("POST", "/api/auth/login", {"email": EMAIL, "password": PASSWORD})
TOKEN = login.get("token") or login.get("access_token")
show("reset world", call("POST", "/api/scenarios/reset"))
for po in ("PO-7712", "PO-7718", "PO-7725"):
    show(f"hold {po}", call("POST", f"/api/shield/hold/{po}"))
show("broker quote: 700 x COMP-104 at Rs 520 (should-cost Rs 112)",
     call("POST", "/api/shield/quote", {"component_id": "COMP-104", "supplier_id": "SUP-18",
                                        "unit_price_inr": 520, "quantity": 700}))
show("payee change from look-alike domain",
     call("POST", "/api/agents/payee-change", {"supplier_id": "SUP-21",
                                               "new_email": "payments@zhenhua-hk.com",
                                               "sender": "accounts@zhenhua-hk.com"}))
show("PO-7718 delivered 6 days late, 380/400 pass QC",
     call("POST", "/api/warehouse/receive", {"po_id": "PO-7718", "quantity_received": 400,
                                             "quantity_approved": 380, "invoice_number": "KES-2209"}))
show("PO-7725 delivered on time", call("POST", "/api/warehouse/receive", {
     "po_id": "PO-7725", "quantity_received": 3000, "quantity_approved": 3000, "invoice_number": "CC-7725"}))
show("PO-7725 invoice re-sent as CC-7725-A", call("POST", "/api/warehouse/receive", {
     "po_id": "PO-7725", "quantity_received": 3000, "quantity_approved": 3000, "invoice_number": "CC-7725-A"}))
show("Sentinel patrol", call("POST", "/api/agents/patrol"))
time.sleep(2)
show("Buyer Shield ledger", call("GET", "/api/shield"))
