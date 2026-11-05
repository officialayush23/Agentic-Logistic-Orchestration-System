/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
  readonly VITE_MAPBOX_TOKEN?: string
  readonly VITE_BRYNTUM_LICENSE_KEY?: string
  readonly VITE_AG_STUDIO_LICENSE_KEY?: string
  readonly VITE_AG_GRID_LICENSE_KEY?: string
}
declare module '@/lib/utils' {
  import type { ClassValue } from 'clsx'
  export function cn(...inputs: ClassValue[]): string
}
