import { Bot, Mail, PackageSearch, UserCheck, Wallet, Warehouse, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'
import { projectById, rel } from '../data/source'
import type { FeedItem } from '../data/types'
import { SeverityBadge } from './badges'
import { IconChip } from './glass'

const kindIcon: Record<FeedItem['kind'], LucideIcon> = {
  agent: Bot, paypal: Wallet, carrier: PackageSearch, email: Mail, human: UserCheck, warehouse: Warehouse,
}
const kindLabel: Record<FeedItem['kind'], string> = {
  agent: 'Agent', paypal: 'PayPal', carrier: 'Carrier', email: 'Email', human: 'Human', warehouse: 'Warehouse',
}

export function FeedList({ items, className }: { items: FeedItem[]; className?: string }) {
  return (
    <div className={cn('scrollbar-thin -mr-2 flex flex-col gap-2 overflow-y-auto pr-2', className)}>
      {items.map((f, i) => (
        <motion.article
          key={f.id}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.07, duration: 0.4 }}
          className={cn('rounded-2xl border border-white/80 bg-white/60 p-3.5 transition-shadow hover:shadow-md hover:shadow-violet/10 dark:border-white/10 dark:bg-white/5',
            f.severity === 'critical' && 'ring-1 ring-crit/30')}
        >
          <div className="flex items-center gap-2">
            <IconChip icon={kindIcon[f.kind]} tone={f.tone} className="size-6 rounded-lg [&_svg]:size-3.5" />
            <span className="text-[11px] font-semibold">{kindLabel[f.kind]}</span>
            <span className="text-[11px] text-muted-foreground">{rel(f.at)}</span>
            <span className="ml-auto">{f.severity && <SeverityBadge level={f.severity} />}</span>
          </div>
          <p className="mt-2 text-sm font-semibold leading-snug">{f.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{f.body}</p>
          {f.projectId && (
            <Link to={`/projects/${f.projectId}`} className="mt-1.5 inline-block text-[11px] font-medium text-primary hover:underline">
              {projectById[f.projectId]?.name}
            </Link>
          )}
        </motion.article>
      ))}
    </div>
  )
}
