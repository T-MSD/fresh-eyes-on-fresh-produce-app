import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseCameraFrame, parseStockHistory } from '../src/cameraContract.ts'

const frame = {
  camera: '6215', camera_name: null, filename: '1751052241.jpg',
  ts: '2025-06-27T19:24:01Z', width: null, height: null,
  areas: [{ area_id: '6215_2', number: 2, product_id: '11908', product_name: 'Banana',
    corners: { top_left: [-10, 0], top_right: [10, 0], bottom_right: [10, 10], bottom_left: [0, 10] }, prediction: null }],
}

test('Camera contract preserves missing estimates, dimensions and negative corners', () => {
  const result = parseCameraFrame(frame)
  assert.equal(result.ts, 1751052241)
  assert.equal(result.width, null)
  assert.equal(result.areas[0].prediction, null)
  assert.deepEqual(result.areas[0].corners[0], [-10, 0])
})

test('Camera boundary rejects mismatched areas and malformed stock predictions', () => {
  assert.throws(() => parseCameraFrame({ ...frame, areas: [{ ...frame.areas[0], area_id: '6383_2' }] }))
  assert.throws(() => parseCameraFrame({ ...frame, ts: 'invalid' }))
  assert.throws(() => parseCameraFrame({ ...frame, filename: '../secret.jpg' }))
  const prediction = { planogram_compliant: false, stock_level: 'half', stock_value: 0.5, detected_product_id: 'other', detected_product_name: 'Apple', compliance_confidence: null, stock_confidence: 0.8 }
  const result = parseCameraFrame({ ...frame, areas: [{ ...frame.areas[0], prediction }] })
  assert.equal(result.areas[0].prediction.detectedProductName, 'Apple')
  assert.equal(result.areas[0].prediction.complianceConfidence, null)
  assert.throws(() => parseCameraFrame({ ...frame, areas: [{ ...frame.areas[0], prediction: { ...prediction, stock_value: 1 } }] }))
})

test('Stock history keeps empty and unknown-confidence states and validates derived values', () => {
  assert.deepEqual(parseStockHistory([]), [])
  assert.deepEqual(parseStockHistory([{ ts: frame.ts, stock_level: 'half', stock_value: 0.5, stock_confidence: null }]), [{ ts: 1751052241, stock: 'half', value: 0.5, confidence: null }])
  assert.throws(() => parseStockHistory([{ ts: frame.ts, stock_level: 'half', stock_value: 1, stock_confidence: null }]))
})
