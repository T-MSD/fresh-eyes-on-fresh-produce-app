import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'
import { formatTime, getTimeline } from '../src/time.ts'
import { demoTasks } from '../src/tasks.ts'
import { getDemoStoreSnapshot } from '../src/store.ts'
import { isUnsure } from '../src/confidence.ts'
import { createDevAnnotations, findLabelFrame, labelBackupKey, labelStorageKey, loadLabels, parseLabellingDataset, resetUnreadableLabels, saveLabels } from '../src/labelling.ts'

const area = { id: '6215_7', productId: '11906', productName: 'Laranja', corners: [[1, 1], [9, 1], [9, 9], [1, 9]] }
const frame = ts => ({ image: `${ts}.jpg`, ts, width: 10, height: 10, url: `/label-frames/6215/${ts}.jpg` })
const camera = frames => ({ id: '6215', areas: [area], frames })
const dataset = cameras => ({ status: 'ready', cameras })
const label = { camera: '6215', image: '1751052241.jpg', areaId: '6215_7', productId: '11906', stock: 'full', compliant: false }

function memoryStorage() {
  const entries = new Map()
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) }
}

test('Lisbon clock handles winter, summer and midnight', () => {
  assert.equal(formatTime(Date.parse('2026-01-10T12:00:00Z') / 1000), '12:00')
  assert.equal(formatTime(Date.parse('2026-06-10T12:00:00Z') / 1000), '13:00')
  assert.equal(formatTime(Date.parse('2026-06-10T23:30:00Z') / 1000), '00:30')
})

test('Frame selection respects seconds and dates, including midnight', () => {
  const midnight = Date.parse('2026-06-10T23:00:00Z') / 1000
  const value = camera([frame(midnight - 1), frame(midnight + 1)])
  assert.equal(findLabelFrame(value, midnight - 2), undefined)
  assert.equal(findLabelFrame(value, midnight), value.frames[0])
  assert.equal(findLabelFrame(value, midnight + 1), value.frames[1])
  assert.equal(getTimeline([]), null)
  assert.equal(getTimeline([midnight + 1, midnight - 1]).start, midnight - 1)
})

test('early-morning Store and verification agree about available Frames', () => {
  const early = Date.parse('2025-06-27T05:12:35Z') / 1000
  const value = camera([frame(early)])
  for (const now of [early - 1, early, early + 85, early + 3600]) {
    const snapshot = getDemoStoreSnapshot(now, dataset([value]))
    assert.equal(snapshot.status, 'ready')
    const displayed = snapshot.cameras[0].frame
    const verified = findLabelFrame(value, now)
    assert.equal(displayed.status, verified ? 'available' : 'missing')
    if (displayed.status === 'available') assert.equal(displayed.frame, verified)
  }
  assert.equal(getDemoStoreSnapshot(early, { status: 'loading' }).status, 'loading')
})

test('Tasks and counts change at the selected Frame, and full can be wrong', () => {
  const task = demoTasks.find(task => task.area_id === area.id)
  const value = camera([frame(task.since - 1), frame(task.since)])
  const before = getDemoStoreSnapshot(task.since - 1, dataset([value]))
  assert.equal(before.tasks.length, 0)
  const after = getDemoStoreSnapshot(task.since, dataset([value]))
  assert.equal(after.tasks[0].area_id, area.id)
  assert.equal(after.cameras[0].areas[0].stock, 'full')
  assert.equal(after.cameras[0].areas[0].compliant, false)
  assert.equal(after.counts.wrong, 1)
  assert.equal(after.counts.ok, 0)
  value.areas[0] = { ...area, corners: [[-1, 1], [9, 1], [9, 9], [1, 9]] }
  const outside = getDemoStoreSnapshot(task.since, dataset([value]))
  assert.equal(outside.cameras[0].areas[0].reason, 'area-outside-frame')
  assert.equal(outside.tasks.length, 0)
})

test('confidence distinguishes healthy demo Areas and preserves unknown estimates', () => {
  assert.equal(isUnsure(null), true)
  assert.equal(isUnsure(0.69), true)
  assert.equal(isUnsure(0.7), false)
  assert.equal(isUnsure(0.95), false)
  const value = camera([frame(100)])
  const confidence = () => getDemoStoreSnapshot(100, dataset([value])).cameras[0].areas[0].confidence
  assert.equal(confidence(), 0.95)
  assert.equal(isUnsure(confidence()), false)
  const originalLength = demoTasks.length
  const task = { ...demoTasks[0], camera: '6215', area_id: area.id, since: 100 }
  try {
    demoTasks.push({ ...task, id: 'numeric', confidence: 0.9 })
    assert.equal(confidence(), 0.9)
    demoTasks.push({ ...task, id: 'unknown', confidence: null })
    assert.equal(confidence(), null)
    demoTasks.splice(originalLength, 2,
      { ...task, id: 'unknown', confidence: null },
      { ...task, id: 'numeric', confidence: 0.9 })
    assert.equal(confidence(), null)
    demoTasks.splice(originalLength, 2,
      { ...task, id: 'high', confidence: 0.9 },
      { ...task, id: 'low', confidence: 0.58 })
    assert.equal(confidence(), 0.58)
    assert.equal(isUnsure(confidence()), true)
  } finally { demoTasks.splice(originalLength) }
})

test('dataset boundary rejects malformed Frames and Areas', () => {
  const valid = [{ id: '6215', areas: [{ area_id: area.id, product_id: area.productId, product_name: area.productName, image_coordinates: { top_left: [1,1], top_right: [9,1], bottom_right: [9,9], bottom_left: [1,9] } }], frames: [frame(100)] }]
  assert.equal(parseLabellingDataset(valid)[0].frames[0].ts, 100)
  assert.throws(() => parseLabellingDataset([{ ...valid[0], frames: [{ ...frame(100), width: 0 }] }]))
  assert.throws(() => parseLabellingDataset([{ ...valid[0], frames: [{ ...frame(100), image: '101.jpg' }] }]))
  assert.throws(() => parseLabellingDataset([{ ...valid[0], areas: [{ ...valid[0].areas[0], area_id: 'other_7' }] }]))
})

test('label storage restores values and keeps corrupt data until backed up', () => {
  const storage = memoryStorage()
  assert.deepEqual(loadLabels(storage), { status: 'ready', labels: [] })
  assert.deepEqual(saveLabels([label], storage), { status: 'saved' })
  assert.deepEqual(loadLabels(storage), { status: 'ready', labels: [label] })
  storage.setItem(labelStorageKey, '{broken')
  assert.equal(loadLabels(storage).reason, 'corrupt')
  assert.equal(storage.getItem(labelStorageKey), '{broken')
  assert.deepEqual(resetUnreadableLabels(storage), { status: 'ready', labels: [] })
  assert.equal(storage.getItem(labelBackupKey), '{broken')
  assert.equal(storage.getItem(labelStorageKey), null)
})

test('failed storage or backup keeps the original data', () => {
  const storage = memoryStorage()
  storage.setItem(labelStorageKey, '{broken')
  const blocked = { ...storage, setItem() { throw new Error('Quota') } }
  assert.equal(saveLabels([label], blocked).status, 'error')
  assert.equal(resetUnreadableLabels(blocked).status, 'error')
  assert.equal(storage.getItem(labelStorageKey), '{broken')
  assert.equal(loadLabels({ ...storage, getItem() { throw new Error('Denied') } }).reason, 'unavailable')
})

test('export matches the pipeline documented dev-label contract', () => {
  const expected = JSON.parse(readFileSync(new URL('./dev-label-contract.json', import.meta.url), 'utf8'))
  assert.deepEqual(createDevAnnotations([{ ...label, image: '1751052241.jpg', areaId: '6215_2', stock: 'half', compliant: true }]), expected)
  for (const [stock, value] of [['empty', 0], ['half', 0.5], ['full', 1]]) {
    for (const compliant of [true, false]) {
      const exported = createDevAnnotations([{ ...label, stock, compliant }])['6215'][label.image][label.areaId]
      assert.equal(exported.stock_value, value)
      assert.equal(exported.planogram_compliant, compliant)
      assert.deepEqual(Object.keys(exported).sort(), ['planogram_compliant', 'stock_level', 'stock_value'])
    }
  }
})

test('Task and Frame types reject contradictory states', () => {
  const directory = mkdtempSync(join(tmpdir(), 'fresh-eyes-types-'))
  try {
    const file = join(directory, 'invalid.ts')
    const taskPath = resolve('src/tasks.ts'), storePath = resolve('src/store.ts')
    writeFileSync(file, `import type { Task } from ${JSON.stringify(taskPath)}\nimport type { CameraFrame } from ${JSON.stringify(storePath)}\nconst details = { id: 'x', product: 'x', location: 'x', camera: '6215', area_id: '6215_7', since: 1, confidence: null }\nconst missingProduct: Task = { ...details, kind: 'move-product' }\nconst extraProduct: Task = { ...details, kind: 'restock', detectedProduct: 'x' }\nconst missingFrame: CameraFrame = { status: 'missing', stale: true }\n`)
    const program = ts.createProgram([file], { noEmit: true, skipLibCheck: true, allowImportingTsExtensions: true, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, target: ts.ScriptTarget.ES2023, types: [] })
    const errors = ts.getPreEmitDiagnostics(program).filter(diagnostic => diagnostic.file?.fileName === file)
    assert.equal(errors.length, 3, errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'))
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
