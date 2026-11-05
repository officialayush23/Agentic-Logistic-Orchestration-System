import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import App from './App.jsx'
import Login from '@/components/Login'
import { api, auth } from '@/lib/api'
import { Toaster } from '@/components/ui/sonner'

/**
 * Which actor is this browser window?
 *
 * No router dependency — one read of the path is enough, and it keeps each
 * actor's bundle out of the other two windows entirely. Three windows side by
 * side is the whole demo:
 *
 *   /                        operations — the supply-chain manager
 *   /warehouse               the floor at Pune-Plant-1
 *   /warehouse/<id>          a specific facility
 *   /supplier                who you could answer as
 *   /supplier/<id>           a supplier, answering the agent in their own words
 *
 * The point of splitting them is that nothing is piped between tabs. Everything
 * one actor tells another goes through the database and the agent, which is the
 * only way the loops are testable rather than asserted.
 */
const WarehousePortal = lazy(() => import('./WarehousePortal.jsx'))
const SupplierPortal = lazy(() => import('./SupplierPortal.jsx'))
const SupplierDirectory = lazy(() =>
  import('./SupplierPortal.jsx').then((m) => ({ default: m.SupplierDirectory })))

function Loading({ what }) {
  return (
    <div className="text-muted-foreground flex h-screen items-center justify-center
                    text-[13px]">opening {what}…</div>
  )
}

function Shell({ children }) {
  // Mounted once, above the actor split, so the supplier and warehouse windows
  // get the same confirmations the operations window does.
  return (
    <>
      {children}
      <Toaster position="bottom-right" closeButton richColors />
    </>
  )
}

/**
 * The auth gate.
 *
 * Three states, and conflating any two of them is a bug someone has to debug at
 * a demo: `checking` (we have a token and are asking the server whether it is
 * still good), `out` (no valid token), `in` (verified). Rendering the app while
 * checking produces a screen full of 401s; rendering the login screen while
 * checking makes a valid session flash the login form on every refresh.
 *
 * Verification is a real round trip rather than "a token exists in
 * localStorage", because a revoked or expired token is present and useless, and
 * the only authority on that is the server.
 */
function Gated({ children }) {
  const [state, setState] = useState(() => (auth.get() ? 'checking' : 'out'))
  const [who, setWho] = useState(null)

  useEffect(() => {
    if (state !== 'checking') return
    let alive = true
    api.me()
      .then((me) => { if (alive) { setWho(me); setState('in') } })
      .catch(() => { if (alive) { auth.clear(); setState('out') } })
    return () => { alive = false }
  }, [state])

  // A 401 from anywhere in the app clears the token; this brings the gate back
  // in step without every component having to know about sessions.
  useEffect(() => {
    const onStorage = () => { if (!auth.get()) { setWho(null); setState('out') } }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const onAuthed = useCallback(() => setState('checking'), [])

  if (state === 'checking') {
    return (
      <div className="text-muted-foreground flex h-screen items-center justify-center
                      text-[13px]">checking your session…</div>
    )
  }
  if (state === 'out') return <Login onAuthed={onAuthed} />
  return typeof children === 'function' ? children(who) : children
}

export default function Root() {
  const path = typeof window !== 'undefined' ? window.location.pathname : '/'

  const wh = path.match(/^\/warehouse\/?(.*)$/)
  if (wh) {
    const id = decodeURIComponent(wh[1] || '') || 'Pune-Plant-1'
    return (
      <Shell>
        <Gated>
          <Suspense fallback={<Loading what="the warehouse" />}>
            <WarehousePortal warehouseId={id} />
          </Suspense>
        </Gated>
      </Shell>
    )
  }

  const sup = path.match(/^\/supplier\/?(.*)$/)
  if (sup) {
    const id = decodeURIComponent(sup[1] || '').replace(/\/$/, '')
    return (
      <Shell>
        <Gated>
          <Suspense fallback={<Loading what={id ? id : 'the supplier list'} />}>
            {id ? <SupplierPortal supplierId={id.toUpperCase()} /> : <SupplierDirectory />}
          </Suspense>
        </Gated>
      </Shell>
    )
  }

  // Operations is the only window behind the sign-in gate for now. The supplier
  // and warehouse portals are counterparty surfaces and get their own scoped
  // tokens (auth_tokens.kind = 'supplier' | 'warehouse'), which is a different
  // flow from a member signing in — a supplier is not a member of the tenant,
  // and giving them a session would show them every other supplier's pricing.
  return <Shell><Gated><App /></Gated></Shell>
}
