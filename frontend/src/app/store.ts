import { create } from 'zustand'

type Theme = 'light' | 'dark'

const initialTheme = (): Theme => {
  try { return (localStorage.getItem('dops-theme') as Theme) || 'light' } catch { return 'light' }
}

export function applyTheme(t: Theme) {
  const el = document.documentElement
  el.classList.toggle('dark', t === 'dark')
  // Bryntum's theme and AG's use light-dark(); colour-scheme drives both.
  el.style.colorScheme = t
  // AG Grid / AG Studio pick their dark params from this attribute.
  document.body.dataset.agThemeMode = t
}

interface UiState {
  theme: Theme
  toggleTheme: () => void
  navOpen: boolean
  setNavOpen: (v: boolean) => void
  /** Simulation Lab log — world events only; money is never simulated. */
  simLog: { at: string; label: string }[]
  logSim: (label: string) => void
}

export const useUi = create<UiState>((set, get) => ({
  theme: initialTheme(),
  toggleTheme: () => {
    const t: Theme = get().theme === 'light' ? 'dark' : 'light'
    try { localStorage.setItem('dops-theme', t) } catch { /* private mode */ }
    applyTheme(t)
    set({ theme: t })
  },
  navOpen: false,
  setNavOpen: (navOpen) => set({ navOpen }),
  simLog: [],
  logSim: (label) => set((s) => ({ simLog: [{ at: new Date().toISOString(), label }, ...s.simLog].slice(0, 30) })),
}))
