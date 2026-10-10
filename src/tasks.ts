export type StockLevel = 'empty' | 'half' | 'full'
export type TaskKind = 'restock' | 'move-product' | 'top-up'

type TaskDetails = {
  id: string
  product: string
  location: string
  camera: string
  area_id: string
  since: number
  confidence: number | null
}

export type Task = TaskDetails & (
  | { kind: 'move-product'; detectedProduct: string }
  | { kind: 'restock' | 'top-up'; detectedProduct?: never }
)

export type TasksState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; tasks: Task[]; healthyAreas: number; unavailableAreas: number }

export const taskGroups: { kind: TaskKind; title: string; description: string }[] = [
  { kind: 'restock', title: 'Restock', description: 'Empty areas' },
  { kind: 'move-product', title: 'Move product', description: 'Wrong product on the shelf' },
  { kind: 'top-up', title: 'Top up', description: 'Half-full areas' },
]

export const demoTasks: Task[] = [
  { id: '6462_8-restock', kind: 'restock', product: 'Cereja 24+ 500 g', location: 'Berries & grapes', camera: '6462', area_id: '6462_8', since: 1751029680, confidence: null },
  { id: '6376_3-restock', kind: 'restock', product: 'Kiwi Gold Zespri 500 g', location: 'Citrus & kiwi', camera: '6376', area_id: '6376_3', since: 1751029680, confidence: null },
  { id: '6443_4-restock', kind: 'restock', product: 'Tomate cherry bio 250 g', location: 'Tomatoes', camera: '6443', area_id: '6443_4', since: 1751033640, confidence: null },
  { id: '6215_7-move', kind: 'move-product', product: 'Laranja Algarve 70/95', detectedProduct: 'Banana Cat I', location: 'Banana island', camera: '6215', area_id: '6215_7', since: 1751017200, confidence: null },
  { id: '6215_9-move', kind: 'move-product', product: 'Laranja Algarve 70/95', detectedProduct: 'Banana Cat I', location: 'Banana island', camera: '6215', area_id: '6215_9', since: 1751021400, confidence: null },
  { id: '6594_8-move', kind: 'move-product', product: 'Alho seco', detectedProduct: 'Cebola roxa', location: 'Onions & garlic', camera: '6594', area_id: '6594_8', since: 1751025600, confidence: 0.58 },
  { id: '6491_4-top-up', kind: 'top-up', product: 'Pêssego R0', location: 'Stone fruit', camera: '6491', area_id: '6491_4', since: 1751021400, confidence: null },
  { id: '6215_6-top-up', kind: 'top-up', product: 'Banana Cat I', location: 'Banana island', camera: '6215', area_id: '6215_6', since: 1751025600, confidence: null },
  { id: '6386_1-top-up', kind: 'top-up', product: 'Couve brócolo', location: 'Cabbages', camera: '6386', area_id: '6386_1', since: 1751029680, confidence: null },
  { id: '6591_6-top-up', kind: 'top-up', product: 'Batata doce', location: 'Potatoes', camera: '6591', area_id: '6591_6', since: 1751029680, confidence: 0.55 },
]

