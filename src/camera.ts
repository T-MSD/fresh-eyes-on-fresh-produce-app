import type { StockLevel } from './tasks.ts'

export type Point = [number, number]
export type PlanogramArea = { id: string; number: number; productId: string; productName: string; corners: [Point, Point, Point, Point] }
export type Frame = { image: string; ts: number; width: number; height: number; url: string }
export type FrameReading = { status: 'readable'; frame: Frame } | { status: 'unreadable'; image: string; ts: number }
export type AreaPrediction = { stock: StockLevel; compliant: boolean; detectedProductName: string | null; stockConfidence: number | null; complianceConfidence: number | null }
export type StockReading = { ts: number; stock: StockLevel; confidence: number | null }
export type CameraPlanogram = { id: string; name: string | null; areas: PlanogramArea[] }
export type CameraFrameReading = { camera: CameraPlanogram; frame: FrameReading; predictions: ReadonlyMap<string, AreaPrediction> }

export function extendsOutsideFrame(area: PlanogramArea, frame: Frame): boolean {
  return area.corners.some(([x, y]) => x < 0 || y < 0 || x > frame.width || y > frame.height)
}
