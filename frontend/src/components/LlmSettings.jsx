import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, CheckCircle2, KeyRound, Loader2, Lock, ShieldCheck, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

/**
 * Bring your own model.
 *
 * Requests bill to the customer's account, run under their data-retention
 * agreement with the provider, and can use a model they have already approved
 * internally — which for a regulated manufacturer is usually the difference
 * between "we can trial this" and "legal said no".
 *
 * The screen states three things plainly, because a form that asks for a
 * billable credential and explains nothing does not get filled in:
 *
 *   — the key is encrypted before storage and is never shown again
 *   — only an owner can change it
 *   — the endpoint is restricted to known providers, and why
 *
 * There is deliberately no "reveal key" control. Not an oversight: a key that
 * can be displayed can be social-engineered out of an account, and the correct
 * recovery for a lost key is rotating it at the provider.
 */

const PROVIDER_LABEL = {
  openai: 'OpenAI', anthropic: 'Anthropic', xai: 'xAI (Grok)',
  gemini: 'Google Gemini', bedrock: 'AWS Bedrock',
}

const PLACEHOLDER = {
  openai: 'sk-proj-…', anthropic: 'sk-ant-…', xai: 'xai-…',
  gemini: 'AIza…', bedrock: 'ABSK… (Bedrock API key)',
}

export default function LlmSettings() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['llm-settings'], queryFn: api.llmSettings,
  })

  const [provider, setProvider] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')

  const invalidate = () => qc.invalidateQueries({ queryKey: ['llm-settings'] })

  const save = useMutation({
    mutationFn: () => api.llmSettingsSave({
      provider, api_key: apiKey, model: model || null, base_url: baseUrl || null,
    }),
    onSuccess: () => { setApiKey(''); invalidate() },
    meta: { successMessage: 'Model key stored, encrypted.' },
  })
  const test = useMutation({
    mutationFn: api.llmSettingsTest,
    onSuccess: (r) => {
      invalidate()
      r.ok ? toast.success(r.detail) : toast.error(r.detail)
    },
    meta: { silent: true },
  })
  const remove = useMutation({
    mutationFn: api.llmSettingsClear,
    onSuccess: invalidate,
    meta: { successMessage: 'Key removed. Using the platform default.' },
  })

  if (isLoading) {
    return <div className="text-muted-foreground p-7 text-[13px]">loading…</div>
  }

  const cfg = data ?? {}
  const canSave = provider && apiKey.trim().length >= 16

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-2xl p-7">

        <div className="glass mb-5 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <Lock className="text-ok mt-0.5 size-5 shrink-0" />
            <div>
              <div className="text-[14px] font-medium">Use your own model account</div>
              <p className="text-muted-foreground mt-1.5 text-[12px] leading-relaxed">
                The agent will call your provider instead of ours. Usage bills to
                your account, runs under your agreement with that provider, and
                can use a model your organisation has already approved. Nothing
                about how decisions are made changes — the model reads and
                explains; the solver decides.
              </p>
            </div>
          </div>
        </div>

        {!cfg.encryption_available && (
          <div className="border-danger/40 bg-danger/10 text-danger mb-5 flex items-start
                          gap-2 rounded-xl border p-4 text-[12px] leading-relaxed">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <strong>Credential storage is not available.</strong> The server has
              no encryption key configured, so it will refuse to store yours
              rather than keep it in plain text. Ask your administrator to set
              <code className="mx-1 font-mono">CREDENTIAL_ENCRYPTION_KEY</code>
              and restart.
            </div>
          </div>
        )}

        {/* The trial allowance. Shown before it runs out, not after — the
            number worth knowing is the one you have left, and discovering a
            limit by hitting it is how a good evaluation turns into a bad one. */}
        {cfg.quota && !cfg.configured && (
          <div className={`mb-5 rounded-xl border p-4 ${
            cfg.quota.exhausted ? 'border-warn/45 bg-warn/10'
              : cfg.quota.remaining < 40 ? 'border-warn/30 bg-warn/[0.05]'
              : 'glass'}`}>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium tracking-[0.14em] uppercase
                               text-muted-foreground">Shared trial account</span>
              <span className="ml-auto font-mono text-[11.5px] tabular-nums">
                {cfg.quota.used} / {cfg.quota.allowance} calls used
              </span>
            </div>
            <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
              <div className={cfg.quota.exhausted ? 'bg-warn h-full' : 'bg-info h-full'}
                   style={{ width: `${Math.min(100,
                     (cfg.quota.used / Math.max(cfg.quota.allowance, 1)) * 100)}%` }} />
            </div>
            <p className="text-muted-foreground mt-2 text-[11.5px] leading-relaxed">
              {cfg.quota.exhausted ? (
                <>
                  <strong className="text-warn">The trial allowance is spent.</strong>{' '}
                  Model-backed features — reading supplier replies, explaining a
                  decision in prose, answering questions — need your own key from
                  here. Everything that <em>decides</em> anything still works:
                  the options, the refusals and their reasons, the authority
                  gate, the audit trail and the evaluation are computed, not
                  generated, and never called a model in the first place.
                </>
              ) : (
                <>
                  {cfg.quota.remaining} calls left on our shared account. Add
                  your own key at any point to remove the limit — usage then
                  bills to you.
                </>
              )}
            </p>
          </div>
        )}

        {/* Current state */}
        <div className="glass mb-5 rounded-xl p-5">
          <div className="flex flex-wrap items-center gap-2">
            <KeyRound className="text-muted-foreground size-3.5" />
            <span className="text-[10px] font-medium tracking-[0.14em] uppercase
                             text-muted-foreground">Current</span>
            {cfg.configured ? (
              <Badge variant="outline" className="border-ok/45 bg-ok/10 text-ok text-[9.5px]">
                {PROVIDER_LABEL[cfg.provider] ?? cfg.provider}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[9.5px]">platform default</Badge>
            )}
          </div>

          {cfg.configured ? (
            <>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Field label="Key" value={cfg.hint}
                       note="Only the last four characters are ever shown." />
                <Field label="Model" value={cfg.model || 'provider default'} />
                {cfg.base_url && <Field label="Endpoint" value={cfg.base_url} />}
                <Field label="Last verified"
                       value={cfg.last_ok_at
                         ? new Date(cfg.last_ok_at).toLocaleString()
                         : 'never'}
                       tone={cfg.last_ok_at ? 'ok' : 'warn'} />
              </div>
              {cfg.last_error && (
                <p className="text-danger mt-2 text-[11.5px]">{cfg.last_error}</p>
              )}
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" className="gap-1.5"
                        disabled={test.isPending}
                        onClick={() => test.mutate()}>
                  {test.isPending
                    ? <Loader2 className="size-3.5 animate-spin" />
                    : <CheckCircle2 className="size-3.5" />}
                  Test connection
                </Button>
                <Button size="sm" variant="ghost"
                        className="text-danger hover:text-danger gap-1.5"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate()}>
                  <Trash2 className="size-3.5" />Remove
                </Button>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground mt-2 text-[12px] leading-relaxed">
              No key of your own is configured. The agent is using the platform's
              model account.
            </p>
          )}
        </div>

        {/* The form */}
        <div className="glass rounded-xl p-5">
          <div className="text-muted-foreground mb-3 text-[10px] font-medium
                          tracking-[0.14em] uppercase">
            {cfg.configured ? 'Replace the key' : 'Add a key'}
          </div>

          <div className="space-y-3">
            <div>
              <Label>Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="h-9 text-[12.5px]">
                  <SelectValue placeholder="Choose a provider" />
                </SelectTrigger>
                <SelectContent>
                  {(cfg.providers ?? []).map((p) => (
                    <SelectItem key={p} value={p} className="text-[12.5px]">
                      {PROVIDER_LABEL[p] ?? p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>API key</Label>
              <Input type="password" autoComplete="off" spellCheck={false}
                     value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                     placeholder={PLACEHOLDER[provider] ?? 'paste your key'}
                     disabled={!cfg.encryption_available} />
              <Hint>
                Encrypted before it is written, and never returned by any
                endpoint — including to you. Keep your own copy.
              </Hint>
            </div>

            <div>
              <Label>Model <span className="opacity-60">(optional)</span></Label>
              <Input value={model} onChange={(e) => setModel(e.target.value)}
                     placeholder="leave blank for the provider default"
                     spellCheck={false} />
            </div>

            <div>
              <Label>Endpoint <span className="opacity-60">(optional)</span></Label>
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
                     placeholder="https://api.openai.com" spellCheck={false} />
              <Hint>
                Restricted to {(cfg.allowed_hosts ?? []).join(', ')}. An
                unrestricted endpoint would let anyone who can reach this form
                make our servers issue requests on their behalf, including to
                internal addresses — so it is an allow-list, not a warning.
              </Hint>
            </div>

            <Button className="w-full gap-1.5"
                    disabled={!canSave || save.isPending || !cfg.encryption_available}
                    onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="size-3.5 animate-spin" />}
              {cfg.configured ? 'Replace key' : 'Save key'}
            </Button>
          </div>
        </div>

        <div className="text-muted-foreground/70 mt-5 flex items-start gap-2
                        text-[11px] leading-relaxed">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Only an organisation owner can add or change this. Every change is
            written to the audit log — which provider and when, never the key
            itself.
          </span>
        </div>
      </div>
    </ScrollArea>
  )
}

function Label({ children }) {
  return (
    <label className="text-muted-foreground mb-1.5 block text-[10px]
                      tracking-[0.12em] uppercase">{children}</label>
  )
}

function Hint({ children }) {
  return (
    <p className="text-muted-foreground/70 mt-1 text-[11px] leading-relaxed">
      {children}
    </p>
  )
}

function Field({ label, value, note, tone }) {
  return (
    <div className="rounded-lg border px-2.5 py-1.5">
      <div className="text-muted-foreground text-[9px] tracking-[0.12em] uppercase">
        {label}
      </div>
      <div className={`mt-0.5 font-mono text-[11.5px] ${
        tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : ''}`}>
        {value}
      </div>
      {note && (
        <div className="text-muted-foreground/60 mt-0.5 text-[10px]">{note}</div>
      )}
    </div>
  )
}
