import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'
import { formatTime } from '../src/time.ts'
import { isOpenAt } from '../src/tasks.ts'
import { buildStoreSnapshot, cameraName } from '../src/store.ts'
import { isUnsure } from '../src/confidence.ts'
import { parseAreaStock, parseCameraFrame, parseCameras, parseHourRange, parseTasks } from '../src/api.ts'
import { describeArea, openingArea } from '../src/areaDisplay.ts'
import { createDevAnnotations, labelBackupKey, labelStorageKey, loadLabels, resetUnreadableLabels, saveLabels } from '../src/labelling.ts'

const imageUrl = (camera, image) => `http://api.test/images/${camera}/${image}`
const iso = ts => new Date(ts * 1000).toISOString().replace('.000Z', 'Z')
const apiPrediction = (values = {}) => ({ planogram_compliant: true, stock_level: 'full', stock_value: 1, detected_product_id: '11906', detected_product_name: 'Laranja', compliance_confidence: 0.9, stock_confidence: 0.8, ...values })
const apiArea = (values = {}) => ({ area_id: '6215_7', number: 7, product_id: '11906', product_name: 'Laranja', corners: { top_left: [1, 1], top_right: [9, 1], bottom_right: [9, 9], bottom_left: [1, 9] }, prediction: apiPrediction(), ...values })
const apiFrame = (ts, values = {}) => ({ camera: '6215', camera_name: null, filename: `${ts}.jpg`, ts: iso(ts), width: 10, height: 10, areas: [apiArea()], ...values })
const apiTask = (values = {}) => ({ camera: '6215', area_id: '6215_7', product_id: '11906', product_name: 'Laranja', kind: 'move_product', opened: { filename: '100.jpg', ts: iso(100) }, closed: null, ...values })
const found = value => ({ status: 'found', reading: parseCameraFrame(value, imageUrl) })
const planogram = parseCameraFrame(apiFrame(100), imageUrl).camera
const snapshot = (now, reading, tasks = []) => buildStoreSnapshot(now, [planogram], new Map([['6215', reading]]), parseTasks({ tasks }))
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

test('hour range parses UTC bounds and an empty run', () => {
  assert.deepEqual(parseHourRange({ start: '2025-06-27T08:00:00Z', end: '2025-06-27T20:00:00Z' }), { start: 1751011200, end: 1751054400 })
  assert.equal(parseHourRange({ start: null, end: null }), null)
  assert.throws(() => parseHourRange({ start: '2025-06-27T08:00:00', end: '2025-06-27T20:00:00Z' }))
  assert.throws(() => parseHourRange({ start: '2025-06-27T20:00:00Z', end: '2025-06-27T08:00:00Z' }))
})

test('Task boundary maps kinds and rejects unknown kinds and foreign Areas', () => {
  const [task] = parseTasks({ tasks: [apiTask({ closed: { filename: '200.jpg', ts: iso(200) } })] })
  assert.equal(task.kind, 'move-product')
  assert.deepEqual(task.opened, { image: '100.jpg', ts: 100 })
  assert.deepEqual(task.closed, { image: '200.jpg', ts: 200 })
  assert.equal(parseTasks({ tasks: [apiTask({ kind: 'top_up' })] })[0].kind, 'top-up')
  assert.throws(() => parseTasks({ tasks: [apiTask({ kind: 'clean' })] }))
  assert.throws(() => parseTasks({ tasks: [apiTask({ area_id: '6376_1' })] }))
  assert.throws(() => parseTasks([apiTask()]))
})

test('Task is open from its opening Frame until its closing Frame', () => {
  const [task] = parseTasks({ tasks: [apiTask({ closed: { filename: '200.jpg', ts: iso(200) } })] })
  assert.equal(isOpenAt(task, 99), false)
  assert.equal(isOpenAt(task, 100), true)
  assert.equal(isOpenAt(task, 199), true)
  assert.equal(isOpenAt(task, 200), false)
  assert.equal(isOpenAt(parseTasks({ tasks: [apiTask()] })[0], 10_000), true)
})

test('Camera Frame boundary keeps missing predictions, negative corners and unreadable Frames', () => {
  const reading = parseCameraFrame(apiFrame(100, { areas: [apiArea({ corners: { top_left: [-4, 1], top_right: [9, 1], bottom_right: [9, 9], bottom_left: [1, 9] } }), apiArea({ area_id: '6215_8', number: 8, prediction: null })] }), imageUrl)
  assert.deepEqual(reading.camera.areas[0].corners[0], [-4, 1])
  assert.equal(reading.predictions.has('6215_8'), false)
  assert.equal(reading.frame.status, 'readable')
  assert.equal(reading.frame.frame.url, 'http://api.test/images/6215/100.jpg')
  assert.equal(parseCameraFrame(apiFrame(100, { width: null, height: null }), imageUrl).frame.status, 'unreadable')
  assert.throws(() => parseCameraFrame(apiFrame(100, { areas: [apiArea({ prediction: apiPrediction({ stock_level: 'quarter' }) })] }), imageUrl))
  assert.throws(() => parseCameraFrame(apiFrame(100, { areas: [apiArea({ prediction: apiPrediction({ stock_confidence: 1.2 }) })] }), imageUrl))
  assert.throws(() => parseCameraFrame(apiFrame(100, { width: 0 }), imageUrl))
})

test('Camera list boundary keeps Cameras without Areas and rejects foreign Areas', () => {
  const { prediction: _, ...planogramArea } = apiArea({ corners: { top_left: [-4, 1], top_right: [9, 1], bottom_right: [9, 9], bottom_left: [1, 9] } })
  const cameras = parseCameras({ cameras: [{ camera: '6215', camera_name: 'Bananas', areas: [planogramArea] }, { camera: '6383', camera_name: null, areas: [] }] })
  assert.deepEqual(cameras.map(camera => [camera.id, camera.name, camera.areas.length]), [['6215', 'Bananas', 1], ['6383', null, 0]])
  assert.deepEqual(cameras[0].areas[0].corners[0], [-4, 1])
  assert.throws(() => parseCameras({ cameras: [{ camera: '6383', camera_name: null, areas: [planogramArea] }] }))
  assert.throws(() => parseCameras([{ camera: '6215', camera_name: null, areas: [] }]))
})

test('stock history is sorted by time and keeps unknown confidence', () => {
  const readings = parseAreaStock([{ ts: iso(200), stock_level: 'half', stock_value: 0.5, stock_confidence: 0.7 }, { ts: iso(100), stock_level: 'empty', stock_value: 0, stock_confidence: null }])
  assert.deepEqual(readings, [{ ts: 100, stock: 'empty', confidence: null }, { ts: 200, stock: 'half', confidence: 0.7 }])
  assert.throws(() => parseAreaStock([{ ts: iso(100), stock_level: 'lots', stock_value: 1, stock_confidence: null }]))
  assert.throws(() => parseAreaStock({ readings: [] }))
})

test('Camera view opens on the requested Area, else the most urgent one, and describes each Area in words', () => {
  const areas = snapshot(100, found(apiFrame(100, { areas: [
    apiArea(),
    apiArea({ area_id: '6215_8', number: 8, prediction: apiPrediction({ stock_level: 'half', planogram_compliant: false, stock_confidence: null }) }),
    apiArea({ area_id: '6215_9', number: 9, prediction: null }),
  ] }))).cameras[0].areas
  assert.equal(openingArea(areas, null)?.id, '6215_8')
  assert.equal(openingArea(areas, '6215_9')?.id, '6215_9')
  assert.equal(openingArea(areas, '6376_1')?.id, '6215_8')
  assert.equal(openingArea([], '6215_9'), undefined)
  assert.deepEqual(areas.map(describeArea), ['Full', 'Half · wrong product · unsure', 'No prediction'])
})

test('Tasks and counts follow Now, and a full Area can hold the wrong product', () => {
  const wrong = found(apiFrame(100, { areas: [apiArea({ prediction: apiPrediction({ planogram_compliant: false, detected_product_name: 'Banana', compliance_confidence: 0.58 }) })] }))
  const tasks = [apiTask({ closed: { filename: '200.jpg', ts: iso(200) } })]
  assert.equal(snapshot(99, wrong, tasks).tasks.length, 0)
  const open = snapshot(100, wrong, tasks)
  assert.equal(open.tasks[0].kind, 'move-product')
  assert.equal(open.tasks[0].detectedProduct, 'Banana')
  assert.equal(open.tasks[0].confidence, 0.58)
  assert.equal(open.tasks[0].location, 'Laranja')
  assert.equal(open.cameras[0].areas[0].stock, 'full')
  assert.equal(open.cameras[0].areas[0].compliant, false)
  assert.equal(open.counts.wrong, 1)
  assert.equal(open.counts.ok, 0)
  assert.equal(snapshot(200, wrong, tasks).tasks.length, 0)
})

test('Camera name comes from the API, else from its most common Planogram products', () => {
  const areas = names => names.map((productName, index) => ({ ...planogram.areas[0], id: `6215_${index + 1}`, number: index + 1, productName }))
  assert.equal(cameraName({ id: '6215', name: null, areas: areas(['CITRINOS DO ALGARVE KG', 'BANANA CAT I CNT KG', 'BANANA DA MADEIRA CNT KG', 'CITRINOS LIMA KG', 'BANANA BIO KG', 'MAÇA GOLDEN 1 KG']) }), 'Banana · Citrinos')
  assert.equal(cameraName({ id: '6385', name: null, areas: areas(['MACA FUJI KG', 'MAÇÃ GALA KG', 'MAÇÃ REINETA KG', 'PERA ROCHA KG', 'PERA CONFERENCE KG']) }), 'Maçã · Pera')
  assert.equal(cameraName({ id: '6443', name: null, areas: areas(['TOMATE REDONDO KG', 'TOMATE CACHO KG', 'MINI TOMATE CACHO 500G']) }), 'Tomate')
  assert.equal(cameraName({ id: '6215', name: 'Front gondola', areas: areas(['BANANA CAT I CNT KG']) }), 'Front gondola')
  assert.equal(cameraName({ id: '6383', name: null, areas: [] }), 'Camera 6383')
})

test('missing Frames, failed Cameras and missing predictions mark Areas unavailable', () => {
  assert.equal(snapshot(100, { status: 'no-frame' }).cameras[0].frame.status, 'missing')
  assert.equal(snapshot(100, { status: 'no-frame' }).cameras[0].areas[0].reason, 'frame-missing')
  assert.equal(snapshot(100, { status: 'failed' }).cameras[0].areas[0].reason, 'camera-failed')
  const noPrediction = snapshot(100, found(apiFrame(100, { areas: [apiArea({ prediction: null })] })))
  assert.equal(noPrediction.cameras[0].areas[0].reason, 'no-prediction')
  assert.equal(noPrediction.counts.unavailable, 1)
  assert.equal(snapshot(100 + 30 * 60 + 1, found(apiFrame(100))).cameras[0].frame.stale, true)
  assert.equal(snapshot(100 + 30 * 60, found(apiFrame(100))).cameras[0].frame.stale, false)
})

test('confidence is the weaker estimate and stays unknown when either is missing', () => {
  assert.equal(isUnsure(null), true)
  assert.equal(isUnsure(0.69), true)
  assert.equal(isUnsure(0.7), false)
  const confidence = values => snapshot(100, found(apiFrame(100, { areas: [apiArea({ prediction: apiPrediction(values) })] }))).cameras[0].areas[0].confidence
  assert.equal(confidence({}), 0.8)
  assert.equal(confidence({ stock_confidence: null }), null)
  assert.equal(confidence({ compliance_confidence: 0.4 }), 0.4)
  const restock = snapshot(100, found(apiFrame(100, { areas: [apiArea({ prediction: apiPrediction({ stock_level: 'empty', stock_confidence: null }) })] })), [apiTask({ kind: 'restock' })])
  assert.equal(restock.tasks[0].confidence, null)
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
    writeFileSync(file, `import type { Task } from ${JSON.stringify(taskPath)}\nimport type { CameraFrame } from ${JSON.stringify(storePath)}\nconst details = { id: 'x', product: 'x', location: 'x', camera: '6215', area_id: '6215_7', openedImage: '1.jpg', since: 1, confidence: null }\nconst missingProduct: Task = { ...details, kind: 'move-product' }\nconst extraProduct: Task = { ...details, kind: 'restock', detectedProduct: 'x' }\nconst missingFrame: CameraFrame = { status: 'missing', stale: true }\n`)
    const program = ts.createProgram([file], { noEmit: true, skipLibCheck: true, allowImportingTsExtensions: true, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, target: ts.ScriptTarget.ES2023, types: [] })
    const errors = ts.getPreEmitDiagnostics(program).filter(diagnostic => diagnostic.file?.fileName === file)
    assert.equal(errors.length, 3, errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'))
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
