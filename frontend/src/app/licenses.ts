// Bryntum's key is a global, so it is set up front at no cost. AG keys are set
// inside the lazily-loaded AG modules (ag/setup.ts, ag/StudioDashboard.tsx) so
// AG Grid and AG Studio stay out of the first page load.
export function registerLicenses() {
  const bry = import.meta.env.VITE_BRYNTUM_LICENSE_KEY
  if (bry) {
    const g = globalThis as unknown as { bryntum?: { licenseKey?: string } }
    g.bryntum = Object.assign(g.bryntum ?? {}, { licenseKey: bry })
  }
}
