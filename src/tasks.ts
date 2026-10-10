export type StockLevel = 'empty' | 'half' | 'full'
export type TaskKind = 'restock' | 'move-product' | 'top-up'

export type Prediction = {
  camera: string
  image: string
  ts: number
  area_id: string
  product_id: string
  product_name: string
  planogram_compliant: boolean
  stock_level: StockLevel
  stock_value: 0 | 0.5 | 1
  detected_product_id: string | null
  compliance_confidence: number | null
  stock_confidence: number | null
}

type TaskBase = {
  id: string
  product: string
  location: string
  camera: string
  area: number
  since: number
  confidence: number | null
}

export type Task =
  | (TaskBase & { kind: 'restock' | 'top-up'; detectedProduct?: never })
  | (TaskBase & { kind: 'move-product'; detectedProduct: string })

export const lowConfidenceThreshold = 0.7
const demoAreaCount = 152

export type AreaState =
  | { status: 'available'; stock: StockLevel; compliant: boolean }
  | { status: 'unavailable'; reason: 'no-predictions' | 'frame-missing' | 'area-outside-frame' }

export type TasksState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; tasks: Task[]; healthyAreas: number; unavailableAreas: number }

export const timeline = { start: 6 * 60 + 14, initial: 15 * 60 + 14, end: 18 * 60 + 36 }

export const taskGroups: { kind: TaskKind; title: string; description: string }[] = [
  { kind: 'restock', title: 'Restock', description: 'Empty areas' },
  { kind: 'move-product', title: 'Move product', description: 'Wrong product on the shelf' },
  { kind: 'top-up', title: 'Top up', description: 'Half-full areas' },
]

const demoTasks: Task[] = [
  { id: '6462_8-restock', kind: 'restock', product: 'Cereja 24+ 500 g', location: 'Berries & grapes', camera: '6462', area: 8, since: 848, confidence: null },
  { id: '6376_3-restock', kind: 'restock', product: 'Kiwi Gold Zespri 500 g', location: 'Citrus & kiwi', camera: '6376', area: 3, since: 848, confidence: null },
  { id: '6443_4-restock', kind: 'restock', product: 'Tomate cherry bio 250 g', location: 'Tomatoes', camera: '6443', area: 4, since: 914, confidence: null },
  { id: '6215_7-move', kind: 'move-product', product: 'Laranja Algarve 70/95', detectedProduct: 'Banana Cat I', location: 'Banana island', camera: '6215', area: 7, since: 640, confidence: null },
  { id: '6215_9-move', kind: 'move-product', product: 'Laranja Algarve 70/95', detectedProduct: 'Banana Cat I', location: 'Banana island', camera: '6215', area: 9, since: 710, confidence: null },
  { id: '6594_8-move', kind: 'move-product', product: 'Alho seco', detectedProduct: 'Cebola roxa', location: 'Onions & garlic', camera: '6594', area: 8, since: 780, confidence: 0.58 },
  { id: '6491_4-top-up', kind: 'top-up', product: 'Pêssego R0', location: 'Stone fruit', camera: '6491', area: 4, since: 710, confidence: null },
  { id: '6215_6-top-up', kind: 'top-up', product: 'Banana Cat I', location: 'Banana island', camera: '6215', area: 6, since: 780, confidence: null },
  { id: '6386_1-top-up', kind: 'top-up', product: 'Couve brócolo', location: 'Cabbages', camera: '6386', area: 1, since: 848, confidence: null },
  { id: '6591_6-top-up', kind: 'top-up', product: 'Batata doce', location: 'Potatoes', camera: '6591', area: 6, since: 848, confidence: 0.55 },
]

export function formatTime(minutes: number) {
  return `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`
}

export function getDemoSnapshot(now: number): TasksState {
  const tasks = demoTasks.filter(task => task.since <= now)
  return { status: 'ready', tasks, healthyAreas: demoAreaCount - tasks.length, unavailableAreas: 0 }
}
