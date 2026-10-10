import { demoTasks, type StockLevel, type Task } from './tasks.ts'
import { findLabelFrame, type LabelArea, type LabelCamera, type LabelFrame, type LabellingState } from './labelling.ts'

export type StoreArea = LabelArea & { number: string } & (
  | { status: 'available'; stock: StockLevel; compliant: boolean; confidence: number | null }
  | { status: 'unavailable'; reason: 'no-predictions' | 'frame-missing' | 'area-outside-frame' }
)

export type CameraFrame = { status: 'available'; frame: LabelFrame; stale: boolean } | { status: 'missing' }
export type CameraState = { id: string; name: string; frame: CameraFrame; areas: StoreArea[]; tasks: Task[] }
export type StoreCounts = { empty: number; wrong: number; half: number; ok: number; unavailable: number }
export type StoreState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; cameras: CameraState[]; counts: StoreCounts; tasks: Task[] }

const cameraNames: Record<string, string> = {
  '6376': 'Citrus & kiwi', '6443': 'Tomatoes', '6462': 'Berries & grapes', '6215': 'Banana island',
  '6594': 'Onions & garlic', '6386': 'Cabbages', '6491': 'Stone fruit', '6591': 'Potatoes',
  '6383': 'Greens & peppers', '6371': 'Melons', '6373': 'Apples & pears', '6385': 'Apples',
  '6468': 'Tropical', '6781': 'Onions & potatoes',
}

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

export function getDemoStoreSnapshot(now: number, dataset: LabellingState): StoreState {
  if (dataset.status !== 'ready') return dataset
  const cameras: CameraState[] = dataset.cameras.map(camera => {
    const selectedFrame = findLabelFrame(camera, now)
    const frame: CameraFrame = selectedFrame ? { status: 'available', frame: selectedFrame, stale: now - selectedFrame.ts > 30 * 60 } : { status: 'missing' }
    const frameTasks = selectedFrame ? demoTasks.filter(task => task.camera === camera.id && task.since <= selectedFrame.ts) : []
    const areas: StoreArea[] = camera.areas.map(area => {
      const details = { ...area, number: area.id.slice(camera.id.length + 1) }
      if (!selectedFrame) return { ...details, status: 'unavailable', reason: 'frame-missing' }
      if (area.corners.some(([x, y]) => x < 0 || y < 0 || x > selectedFrame.width || y > selectedFrame.height)) return { ...details, status: 'unavailable', reason: 'area-outside-frame' }
      const areaTasks = frameTasks.filter(task => task.area_id === area.id)
      const confidence = areaTasks.reduce<number | null>((lowest, task) => task.confidence === null ? lowest : Math.min(lowest ?? 1, task.confidence), null)
      return { ...details, status: 'available', stock: areaTasks.some(task => task.kind === 'restock') ? 'empty' : areaTasks.some(task => task.kind === 'top-up') ? 'half' : 'full', compliant: !areaTasks.some(task => task.kind === 'move-product'), confidence }
    })
    const tasks = frameTasks.filter(task => areas.some(area => area.id === task.area_id && area.status === 'available'))
    return { id: camera.id, name: cameraNames[camera.id] ?? `Camera ${camera.id}`, frame, areas, tasks }
  })
  cameras.sort((left, right) => urgency(left) - urgency(right))
  return { status: 'ready', cameras, counts: countAreas(cameras.flatMap(camera => camera.areas)), tasks: cameras.flatMap(camera => camera.tasks) }
}

export function getCameraPlanogram(camera: CameraState): LabelCamera {
  return { id: camera.id, areas: camera.areas, frames: camera.frame.status === 'available' ? [camera.frame.frame] : [] }
}
