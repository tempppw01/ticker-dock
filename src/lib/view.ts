export type ViewMode = 'full' | 'compact'

export const VIEW_STORAGE_KEY = 'stock-widget.view.v1'

export const VIEW_SIZES: Record<ViewMode, { width: number; height: number }> = {
  full: { width: 388, height: 106 },
  compact: { width: 244, height: 52 },
}

export function loadViewMode(): ViewMode {
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === 'compact' ? 'compact' : 'full'
  } catch {
    return 'full'
  }
}

export function saveViewMode(mode: ViewMode) {
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, mode)
  } catch {
    // Storage is unavailable in some webviews; the in-memory mode still applies.
  }
}
