// AG Grid Enterprise, themed to Lavender Glass through the Theming API.
import { ModuleRegistry, themeQuartz } from 'ag-grid-community'
import { AllEnterpriseModule, LicenseManager } from 'ag-grid-enterprise'

ModuleRegistry.registerModules([AllEnterpriseModule])
// Standalone AG Grid needs a Grid (or "Both") key; an AG Studio key does not cover it.
const gridKey = import.meta.env.VITE_AG_GRID_LICENSE_KEY
if (gridKey) LicenseManager.setLicenseKey(gridKey)

export const glassGridTheme = themeQuartz.withParams({
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  foregroundColor: 'var(--foreground)',
  backgroundColor: 'transparent',
  headerBackgroundColor: 'transparent',
  headerTextColor: 'var(--muted-foreground)',
  headerFontSize: 11,
  headerFontWeight: 600,
  oddRowBackgroundColor: 'transparent',
  borderColor: 'oklch(1 0 0 / 0.6)',
  rowBorder: { color: 'oklch(1 0 0 / 0.6)' },
  wrapperBorder: false,
  headerRowBorder: { color: 'oklch(1 0 0 / 0.7)' },
  columnBorder: false,
  accentColor: 'var(--primary)',
  selectedRowBackgroundColor: 'oklch(0.56 0.22 278 / 0.08)',
  rowHoverColor: 'oklch(1 0 0 / 0.5)',
  chromeBackgroundColor: 'transparent',
  menuBackgroundColor: 'var(--popover)',
  panelBackgroundColor: 'var(--popover)',
  inputBackgroundColor: 'oklch(1 0 0 / 0.7)',
  inputBorder: { color: 'var(--input)' },
  borderRadius: 10,
  wrapperBorderRadius: 0,
  spacing: 6,
  rowHeight: 46,
  headerHeight: 38,
  iconSize: 14,
}).withParams({
  borderColor: 'oklch(1 0 0 / 0.08)',
  rowBorder: { color: 'oklch(1 0 0 / 0.07)' },
  headerRowBorder: { color: 'oklch(1 0 0 / 0.1)' },
  rowHoverColor: 'oklch(1 0 0 / 0.04)',
  inputBackgroundColor: 'oklch(1 0 0 / 0.06)',
}, 'dark')
