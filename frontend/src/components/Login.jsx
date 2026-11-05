import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { AlertTriangle, ArrowRight, Loader2, Network, ShieldCheck } from 'lucide-react'
import { api, auth } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'

/**
 * The sign-in screen.
 *
 * Everything behind it is scoped to one organisation by Postgres itself, so
 * this is not decoration — until a token exists there is no tenant in context
 * and every API call returns 401 by design.
 *
 * The demo credentials are printed on the page on purpose. This is a product
 * people are shown before they buy it, and a login wall with no way through is
 * a worse first impression than a visible test account. When real customers
 * exist, `VITE_SHOW_DEMO_LOGIN=false` removes the panel without a code change.
 */

const SHOW_DEMO = import.meta.env.VITE_SHOW_DEMO_LOGIN !== 'false'
const DEMO = { email: 'demo@disruptionops.io', password: 'DemoPass123!' }

export default function Login({ onAuthed }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const emailRef = useRef(null)

  useEffect(() => { emailRef.current?.focus() }, [])

  async function submit(e, creds) {
    e?.preventDefault()
    const body = creds ?? { email, password }
    if (!body.email || !body.password) {
      setError('Enter an email and a password.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const out = await api.login(body)
      auth.set(out.token)
      onAuthed?.(out)
    } catch (err) {
      // The server deliberately returns one message for every cause — wrong
      // password, unknown email, deactivated account. Which half of the
      // credential was right is not something we owe the person asking.
      setError(err.message || 'Sign-in failed.')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-sm">

        <div className="mb-7 flex items-center gap-2.5">
          <div className="bg-primary/10 ring-primary/20 flex size-9 items-center
                          justify-center rounded-lg ring-1">
            <Network className="text-primary size-4.5" />
          </div>
          <div>
            <div className="text-[15px] leading-tight font-semibold tracking-tight">
              DisruptionOps
            </div>
            <div className="text-muted-foreground text-[11.5px]">
              Supply-chain disruption control
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="glass space-y-3.5 rounded-xl p-6">
          <div>
            <label htmlFor="email" className="text-muted-foreground mb-1.5 block
                                              text-[10px] tracking-[0.12em] uppercase">
              Work email
            </label>
            <Input id="email" ref={emailRef} type="email" autoComplete="username"
                   value={email} onChange={(e) => setEmail(e.target.value)}
                   placeholder="you@company.com" disabled={busy} />
          </div>

          <div>
            <label htmlFor="password" className="text-muted-foreground mb-1.5 block
                                                 text-[10px] tracking-[0.12em] uppercase">
              Password
            </label>
            <Input id="password" type="password" autoComplete="current-password"
                   value={password} onChange={(e) => setPassword(e.target.value)}
                   placeholder="••••••••" disabled={busy} />
          </div>

          {error && (
            <div className="border-danger/40 bg-danger/10 text-danger flex items-start
                            gap-2 rounded-lg border px-3 py-2 text-[12px] leading-relaxed">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" className="w-full gap-1.5" disabled={busy}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {busy ? 'Signing in…' : 'Sign in'}
            {!busy && <ArrowRight className="size-3.5" />}
          </Button>
        </form>

        {SHOW_DEMO && (
          <>
            <div className="my-5 flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-muted-foreground text-[10px] tracking-[0.12em]
                               uppercase">or</span>
              <Separator className="flex-1" />
            </div>

            <div className="glass rounded-xl p-4">
              <div className="text-muted-foreground mb-2 flex items-center gap-1.5
                              text-[10px] font-medium tracking-[0.14em] uppercase">
                <ShieldCheck className="size-2.5" />Demo tenant
              </div>
              <p className="text-muted-foreground mb-3 text-[11.5px] leading-relaxed">
                A seeded organisation with its own suppliers, plant and history.
                It is isolated from every other tenant by the database, not by
                this screen — signing in here cannot reach anyone else's data.
              </p>
              <Button variant="secondary" size="sm" className="w-full gap-1.5"
                      disabled={busy}
                      onClick={(e) => { setEmail(DEMO.email); setPassword(DEMO.password)
                                        submit(e, DEMO) }}>
                Enter the demo
              </Button>
              <div className="text-muted-foreground/70 mt-2.5 text-center font-mono
                              text-[10.5px]">
                {DEMO.email} · {DEMO.password}
              </div>
            </div>
          </>
        )}

        <p className="text-muted-foreground/60 mt-6 text-center text-[10.5px]">
          Every action taken here is written to an append-only audit log.
        </p>
      </motion.div>
    </div>
  )
}
