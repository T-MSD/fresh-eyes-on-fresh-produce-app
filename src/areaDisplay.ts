import { isUnsure } from './confidence.ts'
import type { IconName } from './Icon.tsx'
import type { StockLevel } from './tasks.ts'
import type { StoreArea } from './store.ts'

export const stockIcons: Record<StockLevel, IconName> = { full: 'full', half: 'top-up', empty: 'restock' }
export const stockLabels: Record<StockLevel, string> = { full: 'Full', half: 'Half full', empty: 'Empty' }

export const unavailableAreaLabels: Record<Extract<StoreArea, { status: 'unavailable' }>['reason'], string> = {
  'no-prediction': 'No prediction',
  'frame-missing': 'Frame missing',
  'camera-failed': 'Camera not loaded',
}

/** A short state line, e.g. "Full · wrong product · unsure". */
export function describeArea(area: StoreArea): string {
  if (area.status === 'unavailable') return unavailableAreaLabels[area.reason]
  return [area.stock === 'half' ? 'Half' : stockLabels[area.stock], area.compliant ? null : 'wrong product', isUnsure(area.confidence) ? 'unsure' : null].filter(Boolean).join(' · ')
}

export function formatConfidence(confidence: number | null): string {
  return confidence === null ? 'No estimate' : `${Math.round(confidence * 100)}% sure`
}

const urgency = (area: StoreArea) => area.status === 'unavailable' ? 4 : area.stock === 'empty' ? 0 : !area.compliant ? 1 : area.stock === 'half' ? 2 : 3

/** The Area to show first: the most urgent one, in Area order. */
export function mostUrgentArea(areas: StoreArea[]): StoreArea | undefined {
  return [...areas].sort((left, right) => urgency(left) - urgency(right))[0]
}
