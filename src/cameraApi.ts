import { parseCameraFrame, parseStockHistory } from './cameraContract'
import type { CameraState, StoreArea } from './store'

const apiUrl: string = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
export const cameraApiEnabled = apiUrl.length > 0

async function json(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(`${apiUrl}${path}`, { signal })
  if (!response.ok) throw new Error(response.status === 404 ? 'No data available for this Camera or Area at the selected time.' : 'Camera data unavailable. Try again.')
  return response.json()
}

async function imageDimensions(url: string, signal: AbortSignal): Promise<[number, number]> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const cleanup = () => { signal.removeEventListener('abort', abort); image.onload = null; image.onerror = null }
    const abort = () => { cleanup(); image.src = ''; reject(new DOMException('Aborted', 'AbortError')) }
    image.onload = () => { cleanup(); resolve([image.naturalWidth, image.naturalHeight]) }
    image.onerror = () => { cleanup(); reject(new Error('Frame image unavailable.')) }
    if (signal.aborted) { abort(); return }
    signal.addEventListener('abort', abort, { once: true })
    image.src = url
  })
}

export async function fetchCamera(camera: string, now: number, signal: AbortSignal): Promise<CameraState> {
  const at = encodeURIComponent(new Date(now * 1000).toISOString())
  const data = parseCameraFrame(await json(`/cameras/${encodeURIComponent(camera)}/frame?at=${at}`, signal))
  if (data.camera !== camera || data.ts > now) throw new Error('Unexpected Camera frame.')
  const url = `${apiUrl}/images/${encodeURIComponent(data.camera)}/${encodeURIComponent(data.filename)}`
  const [width, height] = data.width === null || data.height === null ? await imageDimensions(url, signal) : [data.width, data.height]
  const areas: StoreArea[] = data.areas.map(area => {
    const details = { id: area.id, productId: area.productId, productName: area.productName, corners: area.corners, number: String(area.number) }
    if (area.prediction === null) return { ...details, status: 'unavailable', reason: 'no-predictions' }
    const estimates = [area.prediction.stockConfidence, area.prediction.complianceConfidence]
    const confidence = estimates.includes(null) ? null : Math.min(...estimates.filter(value => value !== null))
    return { ...details, status: 'available', stock: area.prediction.stock, compliant: area.prediction.compliant, confidence, detectedProductName: area.prediction.detectedProductName }
  })
  return { id: data.camera, name: data.name ?? `Camera ${data.camera}`, frame: { status: 'available', stale: now - data.ts > 30 * 60, frame: { image: data.filename, ts: data.ts, width, height, url } }, areas, tasks: [] }
}

export async function fetchStockHistory(area: string, signal: AbortSignal) {
  return parseStockHistory(await json(`/areas/${encodeURIComponent(area)}/stock`, signal))
}
