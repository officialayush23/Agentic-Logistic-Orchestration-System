/**
 * Which tool produced an audit event.
 *
 * The log records what happened. Naming the tool that did it turns the same
 * rows into an agent's trace — the difference between "Wrote to Formosa
 * Precision" and "`contact_supplier` → Wrote to Formosa Precision". A reader
 * asking "what can this thing actually do?" gets the answer from the log
 * instead of from a slide.
 *
 * Two sources, in order:
 *
 *   1. `technical_payload.tool` — the real thing. `procedure.py` emits its step
 *      name on every PROCEDURE_STEP, so those rows carry the tool that ran, not
 *      a guess about it.
 *   2. This table — the event type maps to the function that emits it. Not
 *      decoration: each entry names a function that exists in the backend, and
 *      an entry here that stops matching the code is a bug in this file.
 *
 * Anything unmapped renders as its event type rather than as a made-up tool
 * name. Inventing a plausible tool for an event we cannot attribute would be
 * exactly the kind of unfalsifiable polish this project argues against.
 */

export const TOOL_BY_EVENT = {
  // --- reading the world ---
  RISK_ASSESSED:        { tool: 'assess_risk',          module: 'risk.assess' },
  AGENT_STEP:           { tool: 'investigate',          module: 'agent._step' },
  PROCEDURE_STEP:       { tool: 'run_procedure',        module: 'procedure.execute' },

  // --- talking to counterparties ---
  MESSAGE_SENT:         { tool: 'contact_supplier',     module: 'comms.agent_message_supplier' },
  MESSAGE_RECEIVED:     { tool: 'receive_reply',        module: 'comms' },
  MESSAGE_INTERPRETED:  { tool: 'interpret_reply',      module: 'llm.interpret_supplier_message' },
  WAREHOUSE_TASK_CREATED: { tool: 'ask_the_floor',      module: 'comms.warehouse_task' },
  PHYSICAL_COUNT_CONFIRMED: { tool: 'confirm_count',    module: 'comms' },

  // --- deciding ---
  OPTION_REJECTED:      { tool: 'apply_constraints',    module: 'solver._hard_filter' },
  OPTION_SELECTED:      { tool: 'score_options',        module: 'solver.solve' },
  CLAIM_CONTRADICTED:   { tool: 'verify_claim',         module: 'intelligence' },
  SUPPLIER_LEARNED:     { tool: 'update_trust',         module: 'learning' },

  // --- money and stock ---
  RESOURCE_HELD:        { tool: 'reserve_resources',    module: 'claims.hold' },
  RESOURCE_RELEASED:    { tool: 'release_resources',    module: 'claims.release_for' },
  ERP_UPDATED:          { tool: 'write_purchase_order', module: 'agent.execute' },

  // --- the human ---
  APPROVAL_REQUIRED:    { tool: 'request_approval',     module: 'agent._plan_and_validate' },
  APPROVAL_DECIDED:     { tool: 'apply_decision',       module: 'agent.resume' },
  HUMAN_INPUT_REQUIRED: { tool: 'ask_a_human',          module: 'agent' },
  HUMAN_INPUT_RESOLVED: { tool: 'apply_answer',         module: 'agent' },
  CONSTRAINT_ADDED:     { tool: 'add_constraint',       module: 'agent.resume' },

  // --- lifecycle ---
  INCIDENT_OPENED:      { tool: 'open_incident',        module: 'risk' },
  AGENT_RUN_STARTED:    { tool: 'start_run',            module: 'agent.run' },
  AGENT_RUN_FINISHED:   { tool: 'finish_run',           module: 'agent.run' },
  AGENT_FAILED:         { tool: 'failed',               module: 'agent.run' },
}

/** Rows the agent did not produce. A tool badge on these would be a lie. */
const NOT_A_TOOL = new Set([
  'SCENARIO_STARTED', 'DISRUPTION_INJECTED', 'DEMAND_SPIKE', 'PRIORITY_CHANGED',
  'WORLD_RESET', 'MANUAL_NOTE',
])

export function toolFor(event) {
  if (!event) return null
  const named = event.technical_payload?.tool
  if (named) return { tool: named, module: 'procedure.TOOLS', exact: true }
  if (NOT_A_TOOL.has(event.event_type)) return null
  const hit = TOOL_BY_EVENT[event.event_type]
  return hit ? { ...hit, exact: false } : null
}

/**
 * Who acted, in the two categories a reader actually sorts by.
 *
 * "Show me only what the human did" is one question, and it should be one
 * click — not a scan down an actor column deciding whether `operator` and
 * `human` are the same thing. They are.
 */
export const HUMAN_ACTORS = new Set(['human', 'operator', 'supplier', 'warehouse'])
export const AGENT_ACTORS = new Set(['agent', 'solver', 'risk_detector', 'injector', 'system'])

export const actorSide = (actor) =>
  HUMAN_ACTORS.has(actor) ? 'human' : AGENT_ACTORS.has(actor) ? 'agent' : 'other'

export const ACTOR_LABEL = {
  agent: 'agent', solver: 'solver', risk_detector: 'risk detector',
  injector: 'simulator', system: 'system', human: 'you', operator: 'you',
  supplier: 'supplier', warehouse: 'plant',
}
