import type { AreaPrediction, CameraFrameReading, CameraPlanogram, FrameReading, PlanogramArea, Point, StockReading } from './camera.ts'
import type { StockLevel, TaskFrame, TaskKind, TaskRecord } from './tasks.ts'
import { array, nullableString, number, record, string } from './parse.ts'

export type ApiFailure = 'not-found' | 'unreachable' | 'invalid-response'

export class ApiError extends Error {
  readonly failure: ApiFailure
  constructor(failure: ApiFailure, message: string) {
    super(message)
    this.failure = failure
  }
}

export type HourRange = { start: number; end: number }
export type ImageUrlBuilder = (camera: string, image: string) => string

const taskKinds: Record<string, TaskKind> = { restock: 'restock', move_product: 'move-product', top_up: 'top-up' }
const apiTaskKinds: Record<TaskKind, string> = { restock: 'restock', 'move-product': 'move_product', 'top-up': 'top_up' }

function apiUrl(path: string): string {
  const base = import.meta.env?.VITE_API_URL
  if (!base) throw new ApiError('unreachable', 'VITE_API_URL is not set')
  return `${base.replace(/\/+$/, '')}${path}`
}

export function frameImageUrl(camera: string, image: string): string {
  return apiUrl(`/images/${encodeURIComponent(camera)}/${encodeURIComponent(image)}`)
}

async function request(path: string, init: RequestInit): Promise<Response> {
  let response: Response
  try { response = await fetch(apiUrl(path), init) } catch (error) {
    if (init.signal?.aborted || error instanceof ApiError) throw error
    throw new ApiError('unreachable', 'The API could not be reached')
  }
  if (response.status === 404) throw new ApiError('not-found', `${path} was not found`)
  if (!response.ok) throw new ApiError('unreachable', `${path} answered ${response.status}`)
  return response
}

async function getParsed<T>(path: string, signal: AbortSignal, parse: (value: unknown) => T): Promise<T> {
  const response = await request(path, { signal })
  try {
    const value: unknown = await response.json()
    return parse(value)
  } catch (error) {
    if (signal.aborted) throw error
    throw new ApiError('invalid-response', `${path} sent an unexpected response`)
  }
}

/** Returns null when the latest completed run has no predictions. Throws `not-found` when no run has completed. */
export function fetchHourRange(signal: AbortSignal): Promise<HourRange | null> {
  return getParsed('/hour-range', signal, parseHourRange)
}

export function fetchTasks(signal: AbortSignal): Promise<TaskRecord[]> {
  return getParsed('/tasks', signal, parseTasks)
}

export function fetchCameras(signal: AbortSignal): Promise<CameraPlanogram[]> {
  return getParsed('/cameras', signal, parseCameras)
}

/** The Camera's last Frame at or before `now`. Returns null when there is none. */
export async function fetchCameraFrame(camera: string, now: number, signal: AbortSignal): Promise<CameraFrameReading | null> {
  const at = encodeURIComponent(new Date(now * 1000).toISOString())
  try {
    return await getParsed(`/cameras/${encodeURIComponent(camera)}/frame?at=${at}`, signal, value => parseCameraFrame(value, frameImageUrl))
  } catch (error) {
    if (error instanceof ApiError && error.failure === 'not-found') return null
    throw error
  }
}

/** The Area's Stock level at every predicted Frame of the run, oldest first. An Area the run does not know has none. */
export async function fetchAreaStock(areaId: string, signal: AbortSignal): Promise<StockReading[]> {
  try {
    return await getParsed(`/areas/${encodeURIComponent(areaId)}/stock`, signal, parseAreaStock)
  } catch (error) {
    if (error instanceof ApiError && error.failure === 'not-found') return []
    throw error
  }
}

export async function markTaskDone(task: { area_id: string; kind: TaskKind; openedImage: string }): Promise<void> {
  await request('/tasks/done', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ area_id: task.area_id, kind: apiTaskKinds[task.kind], opened_filename: task.openedImage }),
    keepalive: true,
  })
}

function timestamp(value: unknown): number {
  const text = string(value)
  const milliseconds = Date.parse(text)
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(text) || !Number.isFinite(milliseconds)) throw new Error('Expected an ISO 8601 timestamp with a time zone')
  return Math.floor(milliseconds / 1000)
}

function confidence(value: unknown): number | null {
  if (value === null) return null
  const estimate = number(value)
  if (estimate < 0 || estimate > 1) throw new Error('Confidence must be between 0 and 1')
  return estimate
}

function stockLevel(value: unknown): StockLevel {
  if (value !== 'empty' && value !== 'half' && value !== 'full') throw new Error('Invalid Stock level')
  return value
}

function cameraId(value: unknown): string {
  const id = string(value)
  if (!/^\d+$/.test(id)) throw new Error('Invalid Camera ID')
  return id
}

function areaId(value: unknown, camera: string): string {
  const id = string(value)
  if (!new RegExp(`^${camera}_[1-9]\\d*$`).test(id)) throw new Error('Area belongs to another Camera')
  return id
}

function frameFilename(value: unknown): string {
  const image = string(value)
  if (!/^\d+\.jpg$/.test(image)) throw new Error('Invalid Frame filename')
  return image
}

function point(value: unknown): Point {
  const values = array(value)
  if (values.length !== 2) throw new Error('Expected an image coordinate')
  return [number(values[0]), number(values[1])]
}

function taskFrame(value: unknown): TaskFrame {
  const frame = record(value)
  return { image: frameFilename(frame.filename), ts: timestamp(frame.ts) }
}

export function parseHourRange(value: unknown): HourRange | null {
  const range = record(value)
  if (range.start === null && range.end === null) return null
  const start = timestamp(range.start), end = timestamp(range.end)
  if (end < start) throw new Error('Hour range ends before it starts')
  return { start, end }
}

export function parseTasks(value: unknown): TaskRecord[] {
  return array(record(value).tasks).map(value => {
    const task = record(value)
    const camera = cameraId(task.camera)
    const kind = taskKinds[string(task.kind)]
    if (!kind) throw new Error('Invalid Task kind')
    return {
      camera,
      areaId: areaId(task.area_id, camera),
      productId: string(task.product_id),
      productName: string(task.product_name),
      kind,
      opened: taskFrame(task.opened),
      closed: task.closed === null ? null : taskFrame(task.closed),
    }
  })
}

function prediction(value: unknown): AreaPrediction {
  const values = record(value)
  if (typeof values.planogram_compliant !== 'boolean') throw new Error('Invalid Compliance')
  return {
    stock: stockLevel(values.stock_level),
    compliant: values.planogram_compliant,
    detectedProductName: nullableString(values.detected_product_name),
    stockConfidence: confidence(values.stock_confidence),
    complianceConfidence: confidence(values.compliance_confidence),
  }
}

function planogramArea(value: Record<string, unknown>, camera: string): PlanogramArea {
  const areaNumber = number(value.number)
  if (!Number.isInteger(areaNumber) || areaNumber < 1) throw new Error('Invalid Area number')
  const corners = record(value.corners)
  return { id: areaId(value.area_id, camera), number: areaNumber, productId: string(value.product_id), productName: string(value.product_name), corners: [point(corners.top_left), point(corners.top_right), point(corners.bottom_right), point(corners.bottom_left)] }
}

export function parseAreaStock(value: unknown): StockReading[] {
  return array(value)
    .map(value => {
      const reading = record(value)
      return { ts: timestamp(reading.ts), stock: stockLevel(reading.stock_level), confidence: confidence(reading.stock_confidence) }
    })
    .sort((left, right) => left.ts - right.ts)
}

export function parseCameras(value: unknown): CameraPlanogram[] {
  return array(record(value).cameras).map(value => {
    const camera = record(value)
    const id = cameraId(camera.camera)
    return { id, name: nullableString(camera.camera_name), areas: array(camera.areas).map(area => planogramArea(record(area), id)) }
  })
}

export function parseCameraFrame(value: unknown, imageUrl: ImageUrlBuilder): CameraFrameReading {
  const response = record(value)
  const camera = cameraId(response.camera)
  const image = frameFilename(response.filename)
  const ts = timestamp(response.ts)
  const predictions = new Map<string, AreaPrediction>()
  const areas = array(response.areas).map(value => {
    const area = record(value)
    const parsed = planogramArea(area, camera)
    if (area.prediction !== null) predictions.set(parsed.id, prediction(area.prediction))
    return parsed
  })
  let frame: FrameReading = { status: 'unreadable', image, ts }
  if (response.width !== null && response.height !== null) {
    const width = number(response.width), height = number(response.height)
    if (width <= 0 || height <= 0) throw new Error('Invalid Frame dimensions')
    frame = { status: 'readable', frame: { image, ts, width, height, url: imageUrl(camera, image) } }
  }
  return { camera: { id: camera, name: nullableString(response.camera_name), areas }, frame, predictions }
}
