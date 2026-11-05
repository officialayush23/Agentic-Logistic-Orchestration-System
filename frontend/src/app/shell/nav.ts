import {
  Bot, Factory, Network, Shield, FlaskConical, FolderKanban, Plug, Radar, ScrollText, ShieldCheck, Ship, Wallet,
  type LucideIcon,
} from 'lucide-react'
import { data } from '../data/source'

export interface NavItem { to: string; label: string; icon: LucideIcon; count?: number; end?: boolean }

const openIncidents = data.incidents.filter((i) => !['settled', 'clawed_back'].includes(i.stage)).length
const pendingApprovals = data.approvals.filter((a) => a.state === 'pending').length

export const mainNav: NavItem[] = [
  { to: '/', label: 'Mission Control', icon: Radar, end: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban, count: data.projects.filter((p) => p.health !== 'stood_down').length },
  { to: '/shipments', label: 'Shipments', icon: Ship },
  { to: '/payments', label: 'Payments', icon: Wallet },
  { to: '/shield', label: 'Buyer Shield', icon: Shield },
  { to: '/agent', label: 'Agent Board', icon: Bot, count: openIncidents },
  { to: '/team', label: 'Agent Team', icon: Network },
  { to: '/approvals', label: 'Approvals', icon: ShieldCheck, count: pendingApprovals },
  { to: '/suppliers', label: 'Suppliers', icon: Factory },
  { to: '/simulate', label: 'Simulation Lab', icon: FlaskConical },
  { to: '/audit', label: 'Audit & Search', icon: ScrollText },
]

export const footerNav: NavItem[] = [
  { to: '/integrations', label: 'Integrations', icon: Plug },
]
