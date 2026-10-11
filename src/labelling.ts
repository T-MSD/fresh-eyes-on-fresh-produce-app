import type { StockLevel } from './tasks.ts'
import { array, record, string } from './parse.ts'

export type LabelTarget = { cameraId: string; areaId: string }
export type SavedLabel = { camera: string; image: string; areaId: string; productId: string; stock: StockLevel; compliant: boolean }
export type LabelsState = { status: 'ready'; labels: SavedLabel[] } | { status: 'error'; reason: 'corrupt' | 'unavailable'; message: string }
export type LabelStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export const labelStorageKey = 'fresh-eyes-labels-v1'
export const labelBackupKey = 'fresh-eyes-labels-backup-v1'

function parseLabels(value: unknown): SavedLabel[] {
  return array(value).map((value): SavedLabel => {
    const label = record(value)
    const stock = label.stock
    if (stock !== 'empty' && stock !== 'half' && stock !== 'full') throw new Error('Invalid Stock level')
    if (typeof label.compliant !== 'boolean') throw new Error('Invalid Compliance')
    const camera = string(label.camera), areaId = string(label.areaId)
    if (!/^\d+$/.test(camera) || !new RegExp(`^${camera}_[1-9]\\d*$`).test(areaId)) throw new Error('Invalid Camera or Area ID')
    const image = string(label.image)
    if (!/^\d+\.jpg$/.test(image)) throw new Error('Invalid Frame filename')
    return { camera, image, areaId, productId: string(label.productId), stock, compliant: label.compliant }
  })
}

export function loadLabels(storage?: LabelStorage): LabelsState {
  let stored: string | null
  try { stored = (storage ?? globalThis.localStorage).getItem(labelStorageKey) } catch {
    return { status: 'error', reason: 'unavailable', message: 'Browser storage is unavailable. Check browser settings and try again.' }
  }
  if (!stored) return { status: 'ready', labels: [] }
  try {
    const value: unknown = JSON.parse(stored)
    return { status: 'ready', labels: parseLabels(value) }
  } catch {
    return { status: 'error', reason: 'corrupt', message: 'Saved labels could not be read. Reset them to continue; the original data will be kept in a browser backup.' }
  }
}

export function saveLabels(labels: SavedLabel[], storage?: LabelStorage): { status: 'saved' } | { status: 'error'; message: string } {
  try {
    const target = storage ?? globalThis.localStorage
    target.setItem(labelStorageKey, JSON.stringify(labels))
    return { status: 'saved' }
  } catch { return { status: 'error', message: 'Could not save this label. Your answers are still here. Check browser storage and try again.' } }
}

export function resetUnreadableLabels(storage?: LabelStorage): LabelsState {
  const current = loadLabels(storage)
  if (current.status === 'ready' || current.reason !== 'corrupt') return current
  try {
    const target = storage ?? globalThis.localStorage
    const stored = target.getItem(labelStorageKey)
    if (stored !== null) target.setItem(labelBackupKey, stored)
    target.removeItem(labelStorageKey)
    return { status: 'ready', labels: [] }
  } catch { return { status: 'error', reason: 'unavailable', message: 'Could not back up and reset saved labels. The original data has not been discarded.' } }
}

export type DevLabel = { planogram_compliant: boolean; stock_level: StockLevel; stock_value: 0 | 0.5 | 1 }
export type DevAnnotations = Record<string, Record<string, Record<string, DevLabel>>>

export function createDevAnnotations(labels: SavedLabel[]): DevAnnotations {
  const annotations: DevAnnotations = {}
  for (const label of labels) {
    const camera = annotations[label.camera] ??= {}
    const frame = camera[label.image] ??= {}
    frame[label.areaId] = { planogram_compliant: label.compliant, stock_level: label.stock, stock_value: label.stock === 'empty' ? 0 : label.stock === 'half' ? 0.5 : 1 }
  }
  return annotations
}

export function exportLabels(labels: SavedLabel[]) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(createDevAnnotations(labels), null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'dev-labels-export.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
