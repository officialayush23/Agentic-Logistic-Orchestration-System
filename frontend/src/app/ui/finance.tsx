import { CheckCircle2, CircleDashed, FileText, PackageCheck, ReceiptText, XCircle } from 'lucide-react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { componentById, poById, rel, shipmentByPo, supplierById, time, usd } from '../data/source'
import type { Payment } from '../data/types'
import { FinancialBadge } from './badges'

const eventTone = (type: string) =>
  /VOID|REFUND|FAILED|MISMATCH/.test(type) ? 'bg-warn' :
  /CAPTURE|VERIFIED|APPROVED|SUCCEEDED/.test(type) ? 'bg-good' :
  /APPROVAL/.test(type) ? 'bg-rose' : 'bg-azure'

/** Vertical timeline of every PayPal call and event behind one payment. */
export function PaymentTimeline({ payment }: { payment: Payment }) {
  return (
    <ol className="relative ml-1.5 space-y-3 border-l border-violet/15 pl-4">
      {payment.events.map((e, i) => (
        <motion.li key={i} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }} className="relative">
          <span className={cn('absolute -left-[21px] top-1 size-2.5 rounded-full ring-4 ring-white/80 dark:ring-white/10', eventTone(e.type))} />
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-semibold">{e.type}</span>
            <span className="text-[11px] text-muted-foreground">{rel(e.at)} · {time(e.at)}</span>
          </p>
          <p className="mt-0.5 text-xs">{e.detail}</p>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{e.api}</p>
        </motion.li>
      ))}
    </ol>
  )
}

function MatchCell({ ok, label, value, icon: Icon }: { ok: boolean | null; label: string; value: string; icon: typeof FileText }) {
  return (
    <div className={cn('rounded-2xl border p-3', ok === false ? 'border-crit/30 bg-crit/5' : ok ? 'border-good/25 bg-good/5' : 'border-white/80 bg-white/50 dark:border-white/10 dark:bg-white/5')}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        <Icon className="size-3.5" /> {label}
        <span className="ml-auto">
          {ok === null ? <CircleDashed className="size-3.5" /> : ok ? <CheckCircle2 className="size-3.5 text-good" /> : <XCircle className="size-3.5 text-crit" />}
        </span>
      </div>
      <p className="mt-1 text-xs font-semibold">{value}</p>
    </div>
  )
}

/** PO ↔ invoice ↔ goods receipt. The deterministic gate before any capture. */
export function ThreeWayMatch({ payment }: { payment: Payment }) {
  const po = poById[payment.poId]
  const sh = shipmentByPo[payment.poId]
  const received = sh?.status === 'delivered'
  const mismatch = payment.match === 'mismatch'
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <MatchCell ok icon={FileText} label="Purchase order" value={`${po.id} · ${po.qty.toLocaleString('en-IN')} × ${usd(po.unitPriceUsd)}`} />
      <MatchCell ok={payment.invoiceNumber ? !mismatch : null} icon={ReceiptText} label="Supplier invoice"
        value={payment.invoiceNumber ? `${payment.invoiceNumber} · ${usd(payment.amountUsd)}` : 'Not received'} />
      <MatchCell ok={received ? true : mismatch ? false : null} icon={PackageCheck} label="Goods receipt"
        value={received ? 'Received · QC passed' : sh ? sh.carrierStatus : 'No shipment'} />
    </div>
  )
}

export function PaymentCard({ payment, compact = false }: { payment: Payment; compact?: boolean }) {
  const po = poById[payment.poId]
  const s = supplierById[payment.supplierId]
  return (
    <article className={cn('rounded-2xl border border-white/80 bg-white/60 p-4 dark:border-white/10 dark:bg-white/5', payment.state === 'hold_voided' && 'ring-1 ring-warn/30', payment.state === 'awaiting_approval' && 'ring-1 ring-rose/30')}>
      <header className="flex flex-wrap items-center gap-2">
        <FinancialBadge state={payment.state} />
        <span className="text-sm font-semibold">{usd(payment.amountUsd)}</span>
        <span className="text-xs text-muted-foreground">to {s.name}</span>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">PayPal {payment.id}</span>
      </header>
      <p className="mt-1 text-xs text-muted-foreground">{po.id} · {componentById[po.componentId]?.name}{po.replacesPo ? ` · replaces ${po.replacesPo}` : ''}</p>
      {!compact && (
        <>
          <div className="mt-3"><ThreeWayMatch payment={payment} /></div>
          <div className="mt-4"><PaymentTimeline payment={payment} /></div>
        </>
      )}
    </article>
  )
}
