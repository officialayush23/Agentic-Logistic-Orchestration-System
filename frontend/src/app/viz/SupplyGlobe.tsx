// The hero: an Earth of lavender hexes with every live shipment arcing into Pune.
// Arc colour = shipment truth (azure moving, amber delayed, red where the supplier's
// claim and the carrier disagree). Outbound arcs to dealers are dashed green.
import { useEffect, useMemo, useRef, useState } from 'react'
import Globe, { type GlobeMethods } from 'react-globe.gl'
import { MeshPhongMaterial } from 'three'
import { feature } from 'topojson-client'
import type { Topology } from 'topojson-specification'
import countries110m from 'world-atlas/countries-110m.json'
import type { FeatureCollection } from 'geojson'
import { data, poById, shipmentByPo, supplierById } from '../data/source'
import type { ShipmentStatus } from '../data/types'
import { useUi } from '../store'
import { hex, rgba } from './palette'

const world = feature(countries110m as unknown as Topology, (countries110m as unknown as Topology).objects.countries) as unknown as FeatureCollection

export interface Arc {
  id: string
  startLat: number; startLng: number; endLat: number; endLng: number
  status: ShipmentStatus | 'outbound'
  label: string
}

const arcColor: Record<Arc['status'], [string, string]> = {
  in_transit: [rgba(hex.azure, 0.25), hex.azure],
  delayed: [rgba(hex.warn, 0.25), hex.warn],
  claim_mismatch: [rgba(hex.crit, 0.3), hex.crit],
  not_shipped: [rgba(hex.crit, 0.3), hex.crit],
  delivered: [rgba(hex.good, 0.15), rgba(hex.good, 0.5)],
  booked: [rgba(hex.violet, 0.2), hex.violet],
  outbound: [rgba(hex.good, 0.6), rgba(hex.good, 0.2)],
}

export function buildArcs(projectId?: string): Arc[] {
  const p = data.plant
  const pos = data.purchaseOrders.filter((po) => (!projectId || po.projectId === projectId) && shipmentByPo[po.id])
  const inbound: Arc[] = pos.map((po) => {
    const s = supplierById[po.supplierId]
    const sh = shipmentByPo[po.id]!
    return { id: po.id, startLat: s.lat, startLng: s.lng, endLat: p.lat, endLng: p.lng, status: sh.status,
      label: `${po.id} · ${s.name} → Pune · ${sh.carrierStatus}` }
  })
  const outbound: Arc[] = data.projects
    .filter((pr) => pr.health !== 'stood_down' && (!projectId || pr.id === projectId))
    .map((pr) => {
      const [lat, lng] = data.customerCoords[pr.customerId]
      return { id: `OUT-${pr.id}`, startLat: p.lat, startLng: p.lng, endLat: lat, endLng: lng, status: 'outbound' as const, label: `${pr.name} → customer` }
    })
  return [...inbound, ...outbound]
}

export function SupplyGlobe({ projectId, height = 460, autoRotate = true, onSelect }: {
  projectId?: string; height?: number; autoRotate?: boolean; onSelect?: (poId: string) => void
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const globe = useRef<GlobeMethods | undefined>(undefined)
  const [width, setWidth] = useState(600)
  const dark = useUi((s) => s.theme === 'dark')

  useEffect(() => {
    if (!wrap.current) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [])

  const arcs = useMemo(() => buildArcs(projectId), [projectId])
  const supplierPoints = useMemo(() => {
    const ids = new Set(arcs.filter((a) => a.status !== 'outbound').map((a) => poById[a.id]?.supplierId))
    return data.suppliers.filter((s) => ids.has(s.id))
  }, [arcs])
  const rings = useMemo(() => [
    { lat: data.plant.lat, lng: data.plant.lng, color: hex.violet },
    ...arcs.filter((a) => a.status === 'claim_mismatch').map((a) => ({ lat: a.startLat, lng: a.startLng, color: hex.crit })),
  ], [arcs])

  const material = useMemo(() => new MeshPhongMaterial({
    color: dark ? '#2a2850' : '#f4f3ff', emissive: dark ? '#1c1a3d' : '#d9d6ff', emissiveIntensity: dark ? 0.6 : 0.55,
    transparent: true, opacity: 0.92, shininess: 2,
  }), [dark])

  // Re-aim whenever the canvas resizes: onGlobeReady can fire before the first
  // measured width, and the default view is the Atlantic.
  useEffect(() => {
    const id = setTimeout(() => globe.current?.pointOfView({ lat: 20, lng: 80, altitude: projectId ? 1.6 : 1.75 }, 600), 150)
    return () => clearTimeout(id)
  }, [width, projectId])

  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  return (
    <div ref={wrap} className="relative w-full overflow-hidden" style={{ height }}>
      <Globe
        ref={globe}
        width={width}
        height={height}
        backgroundColor="rgba(0,0,0,0)"
        globeMaterial={material}
        showAtmosphere
        atmosphereColor={dark ? hex.violet : '#b9b4ff'}
        atmosphereAltitude={0.18}
        hexPolygonsData={world.features}
        hexPolygonResolution={3}
        hexPolygonMargin={0.62}
        hexPolygonUseDots
        hexPolygonColor={() => (dark ? rgba('#a9a6ff', 0.6) : rgba(hex.violet, 0.55))}
        arcsData={arcs}
        arcColor={(a: object) => arcColor[(a as Arc).status]}
        arcStroke={(a: object) => ((a as Arc).status === 'claim_mismatch' ? 0.9 : 0.55)}
        arcDashLength={(a: object) => ((a as Arc).status === 'outbound' ? 0.08 : 0.45)}
        arcDashGap={(a: object) => ((a as Arc).status === 'outbound' ? 0.04 : 0.2)}
        arcDashAnimateTime={(a: object) => (reduced ? 0 : (a as Arc).status === 'claim_mismatch' ? 900 : 2600)}
        arcAltitudeAutoScale={0.42}
        arcLabel={(a: object) => `<div class="globe-tip">${(a as Arc).label}</div>`}
        onArcClick={(a: object) => onSelect?.((a as Arc).id)}
        pointsData={supplierPoints}
        pointLat="lat"
        pointLng="lng"
        pointColor={(s: object) => {
          const r = (s as (typeof supplierPoints)[number]).reliability
          return r < 50 ? hex.crit : r < 75 ? hex.warn : hex.violet
        }}
        pointAltitude={0.012}
        pointRadius={0.45}
        pointLabel={(s: object) => {
          const x = s as (typeof supplierPoints)[number]
          return `<div class="globe-tip"><b>${x.name}</b><br/>${x.city} · reliability ${x.reliability}</div>`
        }}
        ringsData={rings}
        ringColor={(r: object) => (t: number) => rgba((r as { color: string }).color, 1 - t)}
        ringMaxRadius={4}
        ringPropagationSpeed={reduced ? 0 : 2.2}
        ringRepeatPeriod={1100}
        labelsData={[{ lat: data.plant.lat, lng: data.plant.lng, text: 'Pune Plant 1' }]}
        labelText="text"
        labelSize={1.1}
        labelDotRadius={0.5}
        labelColor={() => (dark ? '#e9e7ff' : hex.fg)}
        labelResolution={3}
        onGlobeReady={() => {
          const g = globe.current
          if (!g) return
          g.pointOfView({ lat: 20, lng: 80, altitude: projectId ? 1.6 : 1.75 }, 0)
          const c = g.controls()
          c.autoRotate = autoRotate && !reduced
          c.autoRotateSpeed = 0.35
          c.enableZoom = true
          c.minDistance = 160
          c.maxDistance = 520
        }}
      />
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-1.5 text-[11px]">
        {([['In transit', hex.azure], ['Delayed', hex.warn], ['Claim ≠ carrier', hex.crit], ['To customer', hex.good]] as const).map(([l, c]) => (
          <span key={l} className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2 py-0.5 font-medium backdrop-blur dark:bg-white/10">
            <span className="size-1.5 rounded-full" style={{ background: c }} /> {l}
          </span>
        ))}
      </div>
    </div>
  )
}
