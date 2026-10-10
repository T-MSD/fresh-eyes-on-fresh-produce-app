import type { StockLevel } from './tasks.ts'

export type Point = [number, number]
export type LabelArea = { id: string; productId: string; productName: string; corners: [Point, Point, Point, Point] }
export type LabelFrame = { image: string; ts: number; width: number; height: number; url: string }
export type LabelCamera = { id: string; areas: LabelArea[]; frames: LabelFrame[] }
export type LabellingState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; cameras: LabelCamera[] }
export type LabelTarget = { cameraId: string; areaId: string; now: number }
export type SavedLabel = { camera: string; image: string; areaId: string; productId: string; stock: StockLevel; compliant: boolean }
export type LabelsState = { status: 'ready'; labels: SavedLabel[] } | { status: 'error'; reason: 'corrupt' | 'unavailable'; message: string }
export type LabelStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export const labelStorageKey = 'fresh-eyes-labels-v1'
export const labelBackupKey = 'fresh-eyes-labels-backup-v1'

export async function fetchLabellingDataset(signal: AbortSignal): Promise<LabelCamera[]> {
  const response = await fetch(`${import.meta.env.BASE_URL}labelling-dataset.json`, { signal })
  if (!response.ok) throw new Error('Dataset unavailable')
  const value: unknown = await response.json()
  return parseLabellingDataset(value)
}

export function findLabelFrame(camera: LabelCamera, now: number): LabelFrame | undefined {
  return camera.frames.filter(frame => frame.ts <= now).at(-1)
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Expected an object')
  return Object.fromEntries(Object.entries(value))
}

function string(value: unknown): string {
  if (typeof value !== 'string' || !value.length) throw new Error('Expected a non-empty string')
  return value
}

function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Expected a finite number')
  return value
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected an array')
  return value
}

function point(value: unknown): Point {
  const values = array(value)
  if (values.length !== 2) throw new Error('Expected an image coordinate')
  return [number(values[0]), number(values[1])]
}

export function parseLabellingDataset(value: unknown): LabelCamera[] {
  return array(value).map(value => {
    const camera = record(value)
    const id = string(camera.id)
    if (!/^\d+$/.test(id)) throw new Error('Invalid Camera ID')
    return {
      id,
      areas: array(camera.areas).map(value => {
        const area = record(value)
        const areaId = string(area.area_id)
        if (!new RegExp(`^${id}_[1-9]\\d*$`).test(areaId)) throw new Error('Area belongs to another Camera')
        const corners = record(area.image_coordinates)
        return { id: areaId, productId: string(area.product_id), productName: string(area.product_name), corners: [point(corners.top_left), point(corners.top_right), point(corners.bottom_right), point(corners.bottom_left)] }
      }),
      frames: array(camera.frames).map(value => {
        const frame = record(value)
        const ts = number(frame.ts), width = number(frame.width), height = number(frame.height)
        if (!Number.isInteger(ts) || ts < 0 || width <= 0 || height <= 0) throw new Error('Invalid Frame timestamp or dimensions')
        const image = string(frame.image)
        if (image !== `${ts}.jpg`) throw new Error('Frame filename does not match its timestamp')
        return { image, ts, width, height, url: string(frame.url) }
      }).sort((left, right) => left.ts - right.ts),
    }
  })
}

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
