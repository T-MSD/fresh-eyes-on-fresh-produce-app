import type { LabelArea, Point } from './labelling.ts'
import type { StockLevel } from './tasks.ts'

export type StockSample = { ts: number; stock: StockLevel; value: number; confidence: number | null }
export type CameraPrediction = { compliant: boolean; stock: StockLevel; detectedProductId: string | null; detectedProductName: string | null; complianceConfidence: number | null; stockConfidence: number | null }
export type CameraArea = LabelArea & { number: number; prediction: CameraPrediction | null }
export type CameraFrameData = { camera: string; name: string | null; filename: string; ts: number; width: number | null; height: number | null; areas: CameraArea[] }

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid camera response')
  return Object.fromEntries(Object.entries(value))
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.length) throw new Error('Expected text')
  return value
}

function nullableText(value: unknown): string | null { return value === null ? null : text(value) }

function numeric(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Expected a number')
  return value
}

function confidence(value: unknown): number | null {
  if (value === null) return null
  const result = numeric(value)
  if (result < 0 || result > 1) throw new Error('Invalid confidence')
  return result
}

function dimension(value: unknown): number | null {
  if (value === null) return null
  const result = numeric(value)
  if (!Number.isInteger(result) || result <= 0) throw new Error('Invalid dimension')
  return result
}

function timestamp(value: unknown): number {
  const source = text(value)
  const result = Date.parse(source) / 1000
  if (!source.endsWith('Z') || !Number.isFinite(result)) throw new Error('Invalid timestamp')
  return result
}

function stock(value: unknown, amount: unknown): StockLevel {
  if (value !== 'empty' && value !== 'half' && value !== 'full') throw new Error('Invalid stock level')
  if (amount !== { empty: 0, half: 0.5, full: 1 }[value]) throw new Error('Invalid stock value')
  return value
}

function point(value: unknown): Point {
  if (!Array.isArray(value) || value.length !== 2) throw new Error('Invalid corner')
  return [numeric(value[0]), numeric(value[1])]
}

function prediction(value: unknown): CameraPrediction | null {
  if (value === null) return null
  const row = object(value)
  if (typeof row.planogram_compliant !== 'boolean') throw new Error('Invalid compliance')
  return {
    compliant: row.planogram_compliant, stock: stock(row.stock_level, row.stock_value),
    detectedProductId: nullableText(row.detected_product_id), detectedProductName: nullableText(row.detected_product_name),
    complianceConfidence: confidence(row.compliance_confidence), stockConfidence: confidence(row.stock_confidence),
  }
}

export function parseCameraFrame(value: unknown): CameraFrameData {
  const row = object(value)
  const camera = text(row.camera)
  const filename = text(row.filename)
  if (camera.includes('/') || !/^\d+\.jpe?g$/i.test(filename)) throw new Error('Invalid frame address')
  if (!Array.isArray(row.areas)) throw new Error('Invalid areas')
  const areas: CameraArea[] = row.areas.map(value => {
    const area = object(value), corners = object(area.corners)
    const id = text(area.area_id), number = numeric(area.number)
    if (!Number.isInteger(number) || number <= 0 || id !== `${camera}_${number}`) throw new Error('Invalid area address')
    return {
      id, number, productId: text(area.product_id), productName: text(area.product_name),
      corners: [point(corners.top_left), point(corners.top_right), point(corners.bottom_right), point(corners.bottom_left)],
      prediction: prediction(area.prediction),
    }
  })
  return { camera, filename, name: nullableText(row.camera_name), ts: timestamp(row.ts), width: dimension(row.width), height: dimension(row.height), areas }
}

export function parseStockHistory(value: unknown): StockSample[] {
  if (!Array.isArray(value)) throw new Error('Invalid stock history')
  return value.map(value => {
    const row = object(value), level = stock(row.stock_level, row.stock_value)
    return { ts: timestamp(row.ts), stock: level, value: { empty: 0, half: 0.5, full: 1 }[level], confidence: confidence(row.stock_confidence) }
  })
}
