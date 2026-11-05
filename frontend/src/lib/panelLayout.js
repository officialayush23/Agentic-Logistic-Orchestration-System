import { useCallback, useRef, useState } from 'react'

/**
 * Remember how someone sized their panels.
 *
 * `autoSaveId` did this in react-resizable-panels v2/v3 and was removed in v4.
 * Passing it to v4 does not warn about a missing feature — it falls through to
 * the DOM as an unknown attribute, so the console complains about spelling
 * while the actual behaviour (persistence) is silently absent. Both halves of
 * that are worth avoiding, so this replaces it explicitly.
 *
 * v4's shape:
 *
 *   defaultLayout      { [panelId]: flexGrow }  — the starting layout
 *   onLayoutChanged    (layout, meta) => void   — fires after a change settles
 *   meta.userInitiated true only for a real drag or keyboard resize
 *
 * Only user-initiated changes are written. Without that filter the library's
 * own mount-time and constraint-recompute callbacks overwrite a saved layout
 * with the defaults before the person has touched anything — the layout would
 * appear to save and then reset itself on the next load, which is worse than
 * not saving at all.
 *
 * Every Panel in the group needs an `id`, because the layout is keyed by it.
 */
export function usePanelLayout(key) {
  const storageKey = `do.layout.${key}`

  // Read once, lazily. Re-reading on every render would fight an in-progress
  // drag, and the stored value is only ever interesting at mount.
  const [defaultLayout] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return undefined
      const parsed = JSON.parse(raw)
      // A stored layout from an older build can have panel ids that no longer
      // exist. Handing those to the library is not worth the risk of a broken
      // screen, and losing one saved layout is a cheap failure.
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed : undefined
    } catch {
      return undefined            // private mode, or corrupt JSON
    }
  })

  const last = useRef(null)

  const onLayoutChanged = useCallback((layout, meta) => {
    if (!meta?.userInitiated) return
    const s = JSON.stringify(layout)
    if (s === last.current) return
    last.current = s
    try { localStorage.setItem(storageKey, s) } catch { /* private mode */ }
  }, [storageKey])

  return { defaultLayout, onLayoutChanged }
}
