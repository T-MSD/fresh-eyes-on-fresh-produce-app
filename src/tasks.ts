export type StockLevel = 'empty' | 'half' | 'full'
export type TaskKind = 'restock' | 'move-product' | 'top-up'

export type TaskFrame = { image: string; ts: number }
export type TaskRecord = { camera: string; areaId: string; productId: string; productName: string; kind: TaskKind; opened: TaskFrame; closed: TaskFrame | null }

type TaskDetails = {
  id: string
  product: string
  camera: string
  area_id: string
  openedImage: string
  since: number
  confidence: number | null
}

export type Task = TaskDetails & (
  | { kind: 'move-product'; detectedProduct: string | null }
  | { kind: 'restock' | 'top-up'; detectedProduct?: never }
)

export const taskGroups: { kind: TaskKind; title: string; description: string }[] = [
  { kind: 'restock', title: 'Restock', description: 'Empty areas' },
  { kind: 'move-product', title: 'Move product', description: 'Wrong product on the shelf' },
  { kind: 'top-up', title: 'Top up', description: 'Half-full areas' },
]

export function isOpenAt(task: TaskRecord, now: number): boolean {
  return task.opened.ts <= now && (task.closed === null || task.closed.ts > now)
}

export function getTaskId(task: TaskRecord): string {
  return `${task.areaId}/${task.kind}/${task.opened.image}`
}
