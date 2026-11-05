/**
 * One place that knows where the backend is, and exactly one slash.
 *
 * A base URL pasted from a hosting dashboard almost always carries a trailing
 * slash, and `${BASE}/api/x` then produces `//api/x`. Most servers tolerate it;
 * a CORS preflight does not, and the failure surfaces as `OPTIONS //api/... 400`
 * — which reads like a routing bug rather than a stray character. Normalise it
 * once here rather than trusting every call site and every deploy config.
 */
export const BASE = (
  import.meta.env.VITE_API_BASE ?? import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
).replace(/\/+$/, '')

/** Join without ever doubling or dropping the separator. */
export const apiUrl = (path) => `${BASE}/${String(path).replace(/^\/+/, '')}`

/**
 * The bearer token, in one place.
 *
 * localStorage rather than a cookie because the API is on a different origin
 * (Vercel → Render), and a cross-site cookie needs SameSite=None plus a shared
 * parent domain we do not have. The trade is XSS exposure, which is the same
 * trade every SPA on a split origin makes; the mitigation is that the token is
 * short-lived and revocable server-side, not that it is hidden.
 */
const TOKEN_KEY = 'disruptionops.token'

export const auth = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } },
  set: (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t)
                        : localStorage.removeItem(TOKEN_KEY) } catch { /* private mode */ } },
  clear: () => auth.set(null),
}

/** The websocket cannot set headers, so its token rides in the query string. */
export const wsUrl = () => {
  const t = auth.get()
  return BASE.replace(/^http/, 'ws') + '/ws' + (t ? `?token=${encodeURIComponent(t)}` : '')
}
export const WS_URL = BASE.replace(/^http/, 'ws') + '/ws'

/** Raised on 401 so the shell can show the login screen instead of an error toast. */
export class Unauthorized extends Error {}

async function req(path, opts = {}) {
  const token = auth.get()
  const res = await fetch(apiUrl(path), {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  })
  if (res.status === 401) {
    // The token is gone, expired or revoked. Drop it so the app stops retrying
    // with a credential the server has already refused — a dashboard that keeps
    // firing 401s every twelve seconds is how a rate limit gets discovered.
    auth.clear()
    throw new Unauthorized('Your session has ended. Please sign in again.')
  }
  if (!res.ok) {
    const body = await res.text()
    let detail = body
    try { detail = JSON.parse(body).detail ?? body } catch { /* plain */ }
    throw new Error(detail || `${res.status} ${res.statusText}`)
  }
  return res.json()
}
const post = (p, b) => req(p, { method: 'POST', ...(b ? { body: JSON.stringify(b) } : {}) })

export const api = {
  // identity
  login:       (b)         => post('/api/auth/login', b),
  signup:      (b)         => post('/api/auth/signup', b),
  logout:      ()          => post('/api/auth/logout'),
  me:          ()          => req('/api/auth/me'),

  // world
  health:      ()          => req('/api/health'),
  context:     ()          => req('/api/context'),
  world:       ()          => req('/api/world'),
  kpis:        ()          => req('/api/kpis'),
  network:     ()          => req('/api/network'),
  now:         ()          => req('/api/now'),
  incidents:   ()          => req('/api/incidents'),
  // The plan and how much of it has happened. Derived server-side from records
  // the acting path already wrote — this endpoint reads, it never advances.
  recovery:    ()          => req('/api/recovery'),
  // Every lane the solver looked at, with its verdict and its geography.
  routes:      (poId)      => req('/api/routes'
                                  + (poId ? `?production_order_id=${encodeURIComponent(poId)}` : '')),
  budget:      ()          => req('/api/budget'),
  // Which problem the agent works next, and the deterministic rule that
  // decided it. The rule ships with the queue — a ranking nobody can read
  // is a black box.
  triage:      ()          => req('/api/triage'),

  // Bring-your-own model key. There is deliberately no endpoint that returns
  // the key — `llmSettings` describes it (provider, last four, last verified)
  // and nothing more.
  llmSettings:     ()      => req('/api/settings/llm'),
  llmSettingsSave: (b)     => req('/api/settings/llm', {
                                method: 'PUT', body: JSON.stringify(b) }),
  llmSettingsClear:()      => req('/api/settings/llm', { method: 'DELETE' }),
  llmSettingsTest: ()      => post('/api/settings/llm/test'),
  audit:       (after = 0) => req(`/api/audit?after=${after}&limit=300`),

  // simulation
  scenarios:   ()          => req('/api/scenarios'),
  scenarioContext: ()      => req('/api/scenarios/context'),
  validateScenario: (b)    => post('/api/scenarios/validate', b),
  inject:      (id)        => post(`/api/scenarios/${id}/inject`),
  customScenario: (b)      => post('/api/scenarios/custom', b),
  removeScenario: (id)     => req(`/api/scenarios/custom/${id}`, { method: 'DELETE' }),
  reset:       (m='demo')  => post(`/api/scenarios/reset?mode=${m}`),
  customEvent: (b)         => post('/api/events/custom', b),
  log:         (text)      => post('/api/logs', { text }),
  createSupplier: (b)      => post('/api/world/suppliers', b),
  deleteSupplier: (id)     => req(`/api/world/suppliers/${id}`, { method: 'DELETE' }),

  // agent
  agentSteps:  (id)        => req(`/api/agent/steps/${id}`),
  agentState:  ()          => req('/api/agent/state'),
  resume:      (id, b)     => post(`/api/agent/resume/${id}`, b),
  verify:      (id)        => post(`/api/agent/verify/${id}`),
  ask:         (q, id)     => post('/api/agent/ask', { question: q, incident_id: id }),
  // Acts. `ask` only reads — see backend/app/command.py for why they are
  // two doors into one agent rather than two agents.
  command:     (instruction) => post('/api/agent/command', { instruction }),
  chooseOption: (choose, incidentId) =>
                 post('/api/agent/command', { choose, incident_id: incidentId }),
  llmHealth:   ()          => req('/api/llm/health'),

  // comms
  threads:     (id)        => req('/api/threads' + (id ? `?incident_id=${id}` : '')),
  sendMessage: (b)         => post('/api/threads/message', b),
  setAutonomy: (id, mode)  => post(`/api/threads/${id}/autonomy`, { mode }),
  sendDraft:   (id, body)  => post(`/api/threads/messages/${id}/send`,
                                   body ? { body } : {}),

  // supplier portal — the third actor
  supplierDirectory: ()    => req('/api/suppliers'),
  supplier:    (id)        => req(`/api/supplier/${id}`),
  supplierPresence: (id, leaving = false) =>
    post(`/api/supplier/${id}/presence${leaving ? '?leaving=true' : ''}`),
  supplierReply: (id, b)   => post(`/api/supplier/${id}/reply`, b),
  supplierClaim: (id, b)   => post(`/api/supplier/${id}/claim`, b),

  // the questions the agent refused to answer
  humanInput:  ()          => req('/api/human-input'),
  resolveInput:(id, b)     => post(`/api/human-input/${id}/resolve`, b),

  // The whole history, across every run — deliberately NOT scoped to the active
  // one. The Decision Log answers "this run"; the audit page answers "ever".
  auditAll:    (runId)     => req('/api/audit?limit=500&since_reset=false'
                                  + (runId ? `&run_id=${runId}` : '')),

  // the brief
  intelligence: (incidentId, poId) => req(
    '/api/intelligence'
    + (incidentId ? `?incident_id=${incidentId}`
       : poId ? `?production_order_id=${poId}` : '')),

  // warehouse
  warehouse:   ()          => req('/api/warehouse'),
  completeTask:(id, b)     => post(`/api/warehouse/tasks/${id}/complete`, b),
  receive:     (b)         => post('/api/warehouse/receive', b),

  // decisions
  approvals:   ()          => req('/api/approvals'),
  decide:      (id, b)     => post(`/api/approvals/${id}/decide`, b),
  accuracy:    ()          => req('/api/accuracy'),
  activeRun:   ()          => req('/api/runs/active'),
  evaluation:  ()          => req('/api/evaluation/current'),
  worldExplain:()          => req('/api/world/explain'),
  hardReset:   ()          => post('/api/system/hard-reset'),
  solve:       (po, rec, exclude = []) => req(
    `/api/solve/${po}?record=${rec ? 'true' : 'false'}` +
    (exclude.length ? `&exclude=${exclude.join(',')}` : '')),
  runs:        ()          => req('/api/runs'),
  reschedule:  (b)         => post('/api/production/reschedule', b),
  supplierTrust: (id)      => req(`/api/suppliers/${id}/reliability`),
  score:       (id)        => post(`/api/runs/${id}/score`),
}
