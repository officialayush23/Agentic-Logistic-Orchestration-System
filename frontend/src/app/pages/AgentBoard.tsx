import { Bot, BrainCircuit, Cpu, KanbanSquare, ShieldCheck } from 'lucide-react'
import { lazy, Suspense, useCallback, useState } from 'react'
import { data, incidentById } from '../data/source'
import { IncidentCard } from '../ui/agent'
import { CardHeader, GlassCard, SectionTitle, Skeleton } from '../ui/glass'
import { KpiRow } from '../ui/Kpi'

const IncidentBoard = lazy(() => import('../bryntum/IncidentBoard').then((m) => ({ default: m.IncidentBoard })))

export default function AgentBoard() {
  const [selected, setSelected] = useState('INC-301')
  const onSelect = useCallback((id: string) => setSelected(id), [])
  const steps = data.incidents.flatMap((i) => i.steps)
  return (
    <>
      <SectionTitle title="Agent Board" subtitle="Every disruption the agent is handling, from first signal to money settled" />
      <KpiRow items={[
        { label: 'Open incidents', value: String(data.incidents.filter((i) => !['settled', 'clawed_back'].includes(i.stage)).length), icon: Bot, tone: 'violet', note: 'being worked now' },
        { label: 'Decisions by solver', value: String(steps.filter((s) => s.by === 'agent').length), icon: Cpu, tone: 'azure', note: 'deterministic Python' },
        { label: 'Reads by Gemini', value: String(steps.filter((s) => s.by === 'llm').length), icon: BrainCircuit, tone: 'rose', note: 'never touches money' },
        { label: 'Human approvals', value: String(steps.filter((s) => s.by === 'human').length), icon: ShieldCheck, tone: 'good', note: 'only above the limit' },
      ]} />
      <GlassCard delay={0.1}>
        <CardHeader icon={KanbanSquare} title="Incident pipeline" subtitle="Read-only on purpose: cards move when the agent acts, never by drag. Click a card for its full reasoning." />
        <Suspense fallback={<Skeleton className="h-[400px] w-full" />}><IncidentBoard onSelect={onSelect} /></Suspense>
      </GlassCard>
      {incidentById[selected] && (
        <GlassCard key={selected} delay={0.05} className="p-3">
          <IncidentCard incident={incidentById[selected]} />
        </GlassCard>
      )}
    </>
  )
}
