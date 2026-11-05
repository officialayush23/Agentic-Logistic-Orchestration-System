// The hero: a real, zoomable Earth (Mapbox Standard on a globe projection) with
// every live shipment drawn as a great-circle route into Pune. Route colour is
// shipment truth — azure moving, amber delayed, red where the supplier's claim
// and the carrier disagree; green dashed routes are finished goods going out to
// customers. A dot on each route marks where the shipment actually is now.
import mapboxgl, { type GeoJSONSource, type Map as MapboxMap } from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { FeatureCollection } from 'geojson'
import { useEffect, useMemo, useRef } from 'react'
import { componentById, data, poById, shipmentByPo, supplierById } from '../data/source'
import type { ShipmentStatus } from '../data/types'
import { useUi } from '../store'
import { hex } from './palette'

type ArcStatus = ShipmentStatus | 'outbound'
export interface Arc {
  id: string
  from: [number, number]   // [lng, lat]
  to: [number, number]
  status: ArcStatus
  progress: number
  label: string
}

const arcColor: Record<ArcStatus, string> = {
  in_transit: hex.azure, delayed: hex.warn, claim_mismatch: hex.crit, not_shipped: hex.crit,
  delivered: hex.good, booked: hex.violet, outbound: hex.good,
}

export function buildArcs(projectId?: string): Arc[] {
  const p = data.plant
  const pos = data.purchaseOrders.filter((po) => (!projectId || po.projectId === projectId) && po.qty > 0 && shipmentByPo[po.id])
  const inbound: Arc[] = pos.map((po) => {
    const s = supplierById[po.supplierId]
    const sh = shipmentByPo[po.id]!
    return {
      id: po.id, from: [s.lng, s.lat], to: [p.lng, p.lat], status: sh.status, progress: sh.progress,
      label: `<b>${po.id}</b> · ${componentById[po.componentId]?.name}<br/>${s.name}, ${s.city} → Pune<br/><span style="opacity:.7">${sh.carrier} · ${sh.carrierStatus}</span>`,
    }
  })
  const outbound: Arc[] = data.projects
    .filter((pr) => pr.health !== 'stood_down' && (!projectId || pr.id === projectId))
    .map((pr) => {
      const [lat, lng] = data.customerCoords[pr.customerId]
      return { id: `OUT-${pr.id}`, from: [p.lng, p.lat], to: [lng, lat], status: 'outbound' as const, progress: 0, label: `<b>${pr.name}</b><br/>to customer` }
    })
  return [...inbound, ...outbound]
}

/** Great-circle path between two points, longitudes unwrapped so routes never jump the antimeridian. */
function greatCircle([lng1, lat1]: [number, number], [lng2, lat2]: [number, number], n = 96): [number, number][] {
  const r = Math.PI / 180
  const p1 = lat1 * r, l1 = lng1 * r, p2 = lat2 * r, l2 = lng2 * r
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2))
  if (d === 0) return [[lng1, lat1], [lng2, lat2]]
  const out: [number, number][] = []
  let prev = lng1
  for (let i = 0; i <= n; i++) {
    const f = i / n
    const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d)
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2)
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2)
    const z = A * Math.sin(p1) + B * Math.sin(p2)
    let lng = Math.atan2(y, x) / r
    while (lng - prev > 180) lng -= 360
    while (lng - prev < -180) lng += 360
    prev = lng
    out.push([lng, Math.atan2(z, Math.sqrt(x * x + y * y)) / r])
  }
  return out
}

const dashSeq = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]]

export function SupplyGlobe({ projectId, height = 460, autoRotate = true, onSelect }: {
  projectId?: string; height?: number; autoRotate?: boolean; onSelect?: (poId: string) => void
}) {
  const el = useRef<HTMLDivElement>(null)
  const dark = useUi((s) => s.theme === 'dark')
  const arcs = useMemo(() => buildArcs(projectId), [projectId])
  const onSelectRef = useRef(onSelect)
  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])
  const token = import.meta.env.VITE_MAPBOX_TOKEN

  useEffect(() => {
    if (!el.current || !token) return
    mapboxgl.accessToken = token
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const map: MapboxMap = new mapboxgl.Map({
      container: el.current,
      style: 'mapbox://styles/mapbox/standard',
      config: { basemap: { lightPreset: dark ? 'night' : 'day', showPointOfInterestLabels: false, showTransitLabels: false, showRoadLabels: false } },
      projection: 'globe',
      center: projectId ? [92, 20] : [82, 20],
      zoom: projectId ? 2.1 : 1.75,
      attributionControl: false,
    })
    map.on('error', (e) => console.error('[globe]', e.error?.message ?? e))
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true, visualizePitch: true }), 'top-right')
    map.addControl(new mapboxgl.AttributionControl({ compact: true }))
    map.scrollZoom.setWheelZoomRate(1 / 300)

    const inbound = arcs.filter((a) => a.status !== 'outbound')
    const routes: FeatureCollection = {
      type: 'FeatureCollection',
      features: arcs.map((a) => ({ type: 'Feature', properties: { id: a.id, status: a.status, color: arcColor[a.status], label: a.label }, geometry: { type: 'LineString', coordinates: greatCircle(a.from, a.to) } })),
    }
    const positions: FeatureCollection = {
      type: 'FeatureCollection',
      features: inbound.filter((a) => a.progress > 0 && a.progress < 1).map((a) => {
        const path = greatCircle(a.from, a.to)
        return { type: 'Feature', properties: { color: arcColor[a.status], label: a.label }, geometry: { type: 'Point', coordinates: path[Math.round(a.progress * (path.length - 1))] } }
      }),
    }
    const supplierIds = [...new Set(inbound.map((a) => poById[a.id].supplierId))]
    const suppliersFc: FeatureCollection = {
      type: 'FeatureCollection',
      features: supplierIds.map((id) => {
        const s = supplierById[id]
        const color = s.reliability < 50 ? hex.crit : s.reliability < 75 ? hex.warn : hex.violet
        return { type: 'Feature', properties: { name: s.name, color, label: `<b>${s.name}</b><br/>${s.city}, ${s.country}<br/>Reliability <b>${s.reliability}</b>` }, geometry: { type: 'Point', coordinates: [s.lng, s.lat] } }
      }),
    }

    let raf = 0, step = -1, spinning = autoRotate && !reduced && !projectId
    const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, className: 'globe-popup', offset: 10 })

    map.on('style.load', () => {
      map.setFog({
        color: dark ? 'rgb(28, 26, 58)' : 'rgb(242, 240, 255)',
        'high-color': dark ? 'rgb(64, 58, 140)' : 'rgb(196, 190, 255)',
        'horizon-blend': 0.06,
        'space-color': dark ? 'rgb(14, 12, 34)' : 'rgb(232, 230, 255)',
        'star-intensity': dark ? 0.35 : 0,
      })
      map.addSource('routes', { type: 'geojson', data: routes })
      map.addSource('positions', { type: 'geojson', data: positions })
      map.addSource('suppliers', { type: 'geojson', data: suppliersFc })
      map.addSource('plant', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [data.plant.lng, data.plant.lat] } } as const })

      const labelPaint = { 'text-halo-color': dark ? 'rgba(20,18,45,0.9)' : 'rgba(255,255,255,0.92)', 'text-halo-width': 1.5 }
      map.addLayer({ id: 'routes-glow', type: 'line', source: 'routes', slot: 'top', paint: { 'line-emissive-strength': 1, 'line-color': ['get', 'color'], 'line-width': 7, 'line-opacity': 0.16, 'line-blur': 4 } })
      map.addLayer({ id: 'routes-base', type: 'line', source: 'routes', slot: 'top', layout: { 'line-cap': 'round' }, paint: { 'line-emissive-strength': 1, 'line-color': ['get', 'color'], 'line-width': ['case', ['==', ['get', 'status'], 'claim_mismatch'], 2.6, 1.8], 'line-opacity': 0.45 } })
      map.addLayer({ id: 'routes-dash', type: 'line', source: 'routes', slot: 'top', paint: { 'line-emissive-strength': 1, 'line-color': ['get', 'color'], 'line-width': ['case', ['==', ['get', 'status'], 'claim_mismatch'], 3, 2.2], 'line-dasharray': [0, 4, 3] } })
      map.addLayer({ id: 'routes-hit', type: 'line', source: 'routes', slot: 'top', paint: { 'line-emissive-strength': 1, 'line-color': '#000', 'line-width': 14, 'line-opacity': 0 } })
      map.addLayer({ id: 'suppliers-halo', type: 'circle', source: 'suppliers', slot: 'top', paint: { 'circle-emissive-strength': 1, 'circle-radius': 9, 'circle-color': ['get', 'color'], 'circle-opacity': 0.18 } })
      map.addLayer({ id: 'suppliers', type: 'circle', source: 'suppliers', slot: 'top', paint: { 'circle-emissive-strength': 1, 'circle-radius': 4.5, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } })
      map.addLayer({ id: 'supplier-names', type: 'symbol', source: 'suppliers', slot: 'top', minzoom: 2.4,
        layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.1], 'text-anchor': 'top' },
        paint: { 'text-emissive-strength': 1, 'text-color': dark ? '#e9e7ff' : hex.fg, ...labelPaint } })
      map.addLayer({ id: 'positions', type: 'circle', source: 'positions', slot: 'top', paint: { 'circle-emissive-strength': 1, 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 3 } })
      map.addLayer({ id: 'plant-pulse', type: 'circle', source: 'plant', slot: 'top', paint: { 'circle-emissive-strength': 1, 'circle-radius': 14, 'circle-color': hex.violet, 'circle-opacity': 0.22 } })
      map.addLayer({ id: 'plant', type: 'circle', source: 'plant', slot: 'top', paint: { 'circle-emissive-strength': 1, 'circle-radius': 6, 'circle-color': hex.violet, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } })
      map.addLayer({ id: 'plant-name', type: 'symbol', source: 'plant', slot: 'top',
        layout: { 'text-field': 'Pune Plant 1', 'text-size': 12, 'text-offset': [0, -1.5] },
        paint: { 'text-emissive-strength': 1, 'text-color': dark ? '#ffffff' : hex.violet, ...labelPaint } })

      // Marching dashes along every route, a breathing plant marker, slow spin until touched.
      let last = 0
      const tick = (t: number) => {
        if (!reduced && t - last > 60) {
          last = t
          step = (step + 1) % dashSeq.length
          if (map.getLayer('routes-dash')) map.setPaintProperty('routes-dash', 'line-dasharray', dashSeq[step])
          if (map.getLayer('plant-pulse')) map.setPaintProperty('plant-pulse', 'circle-radius', 12 + 6 * Math.abs(Math.sin(t / 700)))
        }
        if (spinning && map.getZoom() < 3) {
          const c = map.getCenter(); c.lng -= 0.02; map.setCenter(c)
        }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)

      for (const layer of ['routes-hit', 'suppliers', 'positions']) {
        map.on('mouseenter', layer, (e) => {
          map.getCanvas().style.cursor = 'pointer'
          const f = e.features?.[0] as unknown as { properties?: Record<string, string> } | undefined
          if (f) popup.setLngLat(e.lngLat).setHTML(`<div class="globe-tip">${f.properties?.label}</div>`).addTo(map)
        })
        map.on('mousemove', layer, (e) => popup.setLngLat(e.lngLat))
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; popup.remove() })
      }
      map.on('click', 'routes-hit', (e) => {
        const id = (e.features?.[0] as unknown as { properties?: Record<string, string> } | undefined)?.properties?.id
        if (id && !id.startsWith('OUT-')) onSelectRef.current?.(id)
      })
      // keep the source typed-imported for future live updates
      void (map.getSource('positions') as GeoJSONSource | undefined)
    })

    const stopSpin = () => { spinning = false }
    map.on('mousedown', stopSpin)
    map.on('touchstart', stopSpin)
    map.on('wheel', stopSpin)

    const ro = new ResizeObserver(() => map.resize())
    ro.observe(el.current)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); popup.remove(); map.remove() }
  }, [arcs, dark, projectId, autoRotate, token])

  if (!token) {
    return <div className="grid place-items-center text-xs text-muted-foreground" style={{ height }}>Set VITE_MAPBOX_TOKEN to show the globe.</div>
  }

  return (
    <div className="relative w-full overflow-hidden" style={{ height }}>
      <div ref={el} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      <div className="pointer-events-none absolute left-3 top-3 flex max-w-[70%] flex-wrap gap-1.5 text-[11px]">
        {([['In transit', hex.azure], ['Delayed', hex.warn], ['Claim ≠ carrier', hex.crit], ['To customer', hex.good], ['Shipment now', '#ffffff']] as const).map(([l, c]) => (
          <span key={l} className="inline-flex items-center gap-1.5 rounded-full bg-white/75 px-2 py-0.5 font-medium backdrop-blur dark:bg-black/40">
            <span className="size-1.5 rounded-full ring-1 ring-black/10" style={{ background: c }} /> {l}
          </span>
        ))}
      </div>
    </div>
  )
}
