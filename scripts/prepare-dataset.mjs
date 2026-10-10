import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const source = resolve(process.env.DATASET_DIRECTORY ?? '../new_dataset_hackathon_junctionx_10_oct_2026_v2')
const planogram = JSON.parse(await readFile(join(source, 'planogram.json'), 'utf8'))
const cameras = planogram['Frutas e Legumes']?.cameras
if (!cameras || typeof cameras !== 'object') throw new Error('Dataset is missing the Frutas e Legumes Planogram')
const dataset = []
for (const [id, camera] of Object.entries(cameras)) {
  const frameDirectory = join(source, 'training', id)
  const organiserDirectory = join(source, 'Frutas e Legumes (train & test)', id)
  let directory = frameDirectory
  let files
  try { files = await readdir(directory) } catch { directory = organiserDirectory; files = await readdir(directory) }
  const destination = resolve('public/label-frames', id)
  await mkdir(destination, { recursive: true })
  const frames = []
  for (const image of files.filter(file => /^\d+\.jpg$/.test(file)).sort()) {
    const file = join(directory, image)
    const bytes = await readFile(file)
    const { width, height } = jpegDimensions(bytes)
    await copyFile(file, join(destination, image))
    frames.push({ image, ts: Number(image.slice(0, -4)), width, height, url: `/label-frames/${id}/${image}` })
  }
  dataset.push({ id, areas: camera.products, frames })
}
await writeFile(resolve('public/labelling-dataset.json'), JSON.stringify(dataset))
console.log('Prepared local Frames and Planogram for the design preview.')

function jpegDimensions(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Invalid JPEG Frame')
  let offset = 2
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error('Invalid JPEG marker')
    while (bytes[offset] === 0xff) offset++
    const marker = bytes[offset++]
    if (marker === 0xd9 || marker === 0xda) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    const length = bytes.readUInt16BE(offset)
    if (length < 2 || offset + length > bytes.length) throw new Error('Invalid JPEG segment')
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) }
    }
    offset += length
  }
  throw new Error('Frame dimensions not found')
}
