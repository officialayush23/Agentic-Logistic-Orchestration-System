import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
import { useUi } from './store'
import { AppShell } from './shell/AppShell'
import { GlassCard, Skeleton } from './ui/glass'
import MissionControl from './pages/MissionControl'

// Heavy vendor screens (AG Studio, Bryntum) load on demand so Mission Control paints fast.
const Projects = lazy(() => import('./pages/Projects'))
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'))
const Shipments = lazy(() => import('./pages/Shipments'))
const Payments = lazy(() => import('./pages/Payments'))
const AgentBoard = lazy(() => import('./pages/AgentBoard'))
const Approvals = lazy(() => import('./pages/Approvals'))
const Suppliers = lazy(() => import('./pages/Suppliers'))
const SimulationLab = lazy(() => import('./pages/SimulationLab'))
const Audit = lazy(() => import('./pages/Audit'))
const Integrations = lazy(() => import('./pages/Integrations'))

function PageLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-56" />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <GlassCard key={i} className="h-28 p-4"><Skeleton className="h-7 w-20" /></GlassCard>)}
      </div>
      <GlassCard className="h-96"><Skeleton className="h-full w-full" /></GlassCard>
    </div>
  )
}
const suspended = (el: ReactNode) => <Suspense fallback={<PageLoading />}>{el}</Suspense>

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <MissionControl /> },
      { path: '/projects', element: suspended(<Projects />) },
      { path: '/projects/:id', element: suspended(<ProjectDetail />) },
      { path: '/shipments', element: suspended(<Shipments />) },
      { path: '/payments', element: suspended(<Payments />) },
      { path: '/agent', element: suspended(<AgentBoard />) },
      { path: '/approvals', element: suspended(<Approvals />) },
      { path: '/suppliers', element: suspended(<Suppliers />) },
      { path: '/simulate', element: suspended(<SimulationLab />) },
      { path: '/audit', element: suspended(<Audit />) },
      { path: '/integrations', element: suspended(<Integrations />) },
      { path: '*', element: <MissionControl /> },
    ],
  },
])

export function App() {
  const theme = useUi((s) => s.theme)
  return (
    <>
      <RouterProvider router={router} />
      <Toaster theme={theme} position="bottom-right" toastOptions={{ className: 'glass-strong !rounded-2xl !text-xs' }} />
    </>
  )
}
