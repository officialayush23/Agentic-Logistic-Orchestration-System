// Hex equivalents of the OKLCH tokens, for WebGL / canvas where CSS vars don't reach.
export const hex = {
  violet: '#5e59f1',
  azure: '#2a8eef',
  rose: '#ed68ae',
  good: '#00a76c',
  warn: '#ea942f',
  crit: '#ed3345',
  cyan: '#00c3cb',
  land: '#ccccf8',
  landDark: '#494677',
  fg: '#1a1b3b',
  muted: '#646780',
} as const

export const rgba = (h: string, a: number) => {
  const n = parseInt(h.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
