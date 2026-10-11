import { getTaskId, isOpenAt, type StockLevel, type Task, type TaskRecord } from './tasks.ts'
import type { AreaPrediction, CameraFrameReading, CameraPlanogram, Frame, PlanogramArea } from './camera.ts'

export type StoreArea = PlanogramArea & (
  | { status: 'available'; stock: StockLevel; compliant: boolean; detectedProductName: string | null; stockConfidence: number | null; complianceConfidence: number | null; confidence: number | null }
  | { status: 'unavailable'; reason: 'no-prediction' | 'frame-missing' | 'camera-failed' }
)

export type CameraFrame =
  | { status: 'available'; frame: Frame; stale: boolean }
  | { status: 'unreadable'; image: string; ts: number; stale: boolean }
  | { status: 'missing' }
  | { status: 'failed' }
export type CameraReading = { status: 'found'; reading: CameraFrameReading } | { status: 'no-frame' } | { status: 'failed' }
export type CameraState = { id: string; name: string; frame: CameraFrame; areas: StoreArea[]; tasks: Task[] }
export type StoreCounts = { empty: number; wrong: number; half: number; ok: number; unavailable: number }
export type StoreSnapshot = { status: 'ready'; now: number; cameras: CameraState[]; counts: StoreCounts; tasks: Task[] }
export type StoreState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'unavailable'; reason: 'no-run' | 'no-predictions' }
  | StoreSnapshot

const staleAfterSeconds = 30 * 60

const productsInCameraName = 2
const minimumAreasForSecondaryProduct = 2

export function countAreas(areas: StoreArea[]): StoreCounts {
  const counts: StoreCounts = { empty: 0, wrong: 0, half: 0, ok: 0, unavailable: 0 }
  for (const area of areas) {
    if (area.status === 'unavailable') { counts.unavailable++; continue }
    if (area.stock === 'empty') counts.empty++
    if (area.stock === 'half') counts.half++
    if (!area.compliant) counts.wrong++
    if (area.stock === 'full' && area.compliant) counts.ok++
  }
  return counts
}

function urgency(camera: CameraState): number {
  const counts = countAreas(camera.areas)
  return counts.empty > 0 ? 0 : counts.wrong > 0 ? 1 : counts.half > 0 ? 2 : 3
}

function productWord(productName: string): string {
  const word = productName.trim().split(/\s+/)[0].toLocaleLowerCase('pt-PT')
  return word.charAt(0).toLocaleUpperCase('pt-PT') + word.slice(1)
}

/** The API's Camera name, else the Camera's most common Planogram products, e.g. "Banana · Citrinos". */
export function cameraName(planogram: CameraPlanogram): string {
  if (planogram.name) return planogram.name
  const spellingsPerProduct = new Map<string, Map<string, number>>()
  for (const area of planogram.areas) {
    const word = productWord(area.productName)
    const key = word.normalize('NFD').replace(/\p{M}/gu, '')
    const spellings = spellingsPerProduct.get(key) ?? new Map<string, number>()
    spellings.set(word, (spellings.get(word) ?? 0) + 1)
    spellingsPerProduct.set(key, spellings)
  }
  const products = [...spellingsPerProduct.values()]
    .map(spellings => {
      const counts = [...spellings]
      return { word: counts.reduce((best, current) => current[1] > best[1] ? current : best)[0], areas: counts.reduce((total, [, areas]) => total + areas, 0) }
    })
    .sort((left, right) => right.areas - left.areas)
    .filter((product, index) => index === 0 || product.areas >= minimumAreasForSecondaryProduct)
    .slice(0, productsInCameraName)
    .map(product => product.word)
  return products.length ? products.join(' · ') : `Camera ${planogram.id}`
}

function combinedConfidence(prediction: AreaPrediction): number | null {
  if (prediction.stockConfidence === null || prediction.complianceConfidence === null) return null
  return Math.min(prediction.stockConfidence, prediction.complianceConfidence)
}

function toTask(record: TaskRecord, location: string, prediction: AreaPrediction | undefined): Task {
  const details = { id: getTaskId(record), product: record.productName, location, camera: record.camera, area_id: record.areaId, openedImage: record.opened.image, since: record.opened.ts }
  if (record.kind === 'move-product') return { ...details, kind: record.kind, detectedProduct: prediction?.detectedProductName ?? null, confidence: prediction?.complianceConfidence ?? null }
  return { ...details, kind: record.kind, confidence: prediction?.stockConfidence ?? null }
}

function toCameraFrame(reading: CameraReading, now: number): CameraFrame {
  if (reading.status !== 'found') return { status: reading.status === 'no-frame' ? 'missing' : 'failed' }
  const frame = reading.reading.frame
  if (frame.status === 'unreadable') return { status: 'unreadable', image: frame.image, ts: frame.ts, stale: now - frame.ts > staleAfterSeconds }
  return { status: 'available', frame: frame.frame, stale: now - frame.frame.ts > staleAfterSeconds }
}

function toStoreArea(area: PlanogramArea, reading: CameraReading): StoreArea {
  if (reading.status !== 'found') return { ...area, status: 'unavailable', reason: reading.status === 'no-frame' ? 'frame-missing' : 'camera-failed' }
  const prediction = reading.reading.predictions.get(area.id)
  if (!prediction) return { ...area, status: 'unavailable', reason: 'no-prediction' }
  return { ...area, status: 'available', stock: prediction.stock, compliant: prediction.compliant, detectedProductName: prediction.detectedProductName, stockConfidence: prediction.stockConfidence, complianceConfidence: prediction.complianceConfidence, confidence: combinedConfidence(prediction) }
}

/** Derives Areas, counts and the Tasks open at `now` from each Camera's Frame at or before `now`. */
export function buildStoreSnapshot(now: number, planograms: CameraPlanogram[], readings: ReadonlyMap<string, CameraReading>, taskRecords: TaskRecord[]): StoreSnapshot {
  const tasks = taskRecords.filter(task => isOpenAt(task, now)).flatMap(record => {
    const planogram = planograms.find(camera => camera.id === record.camera)
    if (!planogram) return []
    const reading = readings.get(planogram.id)
    return [toTask(record, cameraName(planogram), reading?.status === 'found' ? reading.reading.predictions.get(record.areaId) : undefined)]
  })
  const cameras = planograms.map((planogram): CameraState => {
    const reading = readings.get(planogram.id) ?? { status: 'failed' }
    const areas = (reading.status === 'found' ? reading.reading.camera.areas : planogram.areas).map(area => toStoreArea(area, reading))
    return { id: planogram.id, name: cameraName(planogram), frame: toCameraFrame(reading, now), areas, tasks: tasks.filter(task => task.camera === planogram.id) }
  })
  cameras.sort((left, right) => urgency(left) - urgency(right))
  return { status: 'ready', now, cameras, counts: countAreas(cameras.flatMap(camera => camera.areas)), tasks }
}
