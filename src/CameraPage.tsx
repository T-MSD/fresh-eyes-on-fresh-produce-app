import { useState } from 'react'
import { formatTime } from './time'
import { isUnsure } from './confidence'
import { Icon } from './Icon'
import { CameraFrameView } from './CameraFrameView'
import { countAreas, type CameraState, type StoreArea } from './store'
import type { Task } from './tasks'
import { useAreaStock } from './useAreaStock'
import { describeArea, formatConfidence, mostUrgentArea, stockIcons, stockLabels, unavailableAreaLabels } from './areaDisplay'

export type CameraOrigin = 'tasks' | 'store'

const barHeights = { empty: 18, half: 55, full: 100 }

function frameTime(camera: CameraState): number | null {
  if (camera.frame.status === 'available') return camera.frame.frame.ts
  if (camera.frame.status === 'unreadable') return camera.frame.ts
  return null
}

function SummaryPills({ camera }: { camera: CameraState }) {
  const counts = countAreas(camera.areas)
  return <ul className="camera-pills" aria-label="Areas on this Camera">
    {counts.empty > 0 && <li className="pill-empty"><Icon name="restock" />{counts.empty} empty</li>}
    {counts.wrong > 0 && <li className="pill-wrong"><Icon name="move-product" />{counts.wrong} wrong</li>}
    {counts.half > 0 && <li className="pill-half"><Icon name="top-up" />{counts.half} half</li>}
    {counts.ok > 0 && <li className="pill-ok"><Icon name="full" />{counts.ok} OK</li>}
    {counts.unavailable > 0 && <li className="pill-unknown"><span aria-hidden="true">?</span>{counts.unavailable} unknown</li>}
  </ul>
}

function FrameSection({ camera, selectedAreaId, onSelectArea }: { camera: CameraState; selectedAreaId: string | undefined; onSelectArea: (areaId: string) => void }) {
  const { frame } = camera
  if (frame.status === 'available') return <CameraFrameView key={frame.frame.image} cameraId={camera.id} frame={frame.frame} areas={camera.areas} showPredictions selectedAreaId={selectedAreaId} onSelectArea={onSelectArea} />
  if (frame.status === 'unreadable') return <p className="label-frame-message" role="status">Frame {frame.image} is unreadable, so it cannot be shown. The Areas below use fallback predictions.</p>
  return <p className="label-frame-message" role="status">{frame.status === 'missing' ? 'No Frame at or before Now. Move the time slider later.' : 'This Camera could not be loaded.'}</p>
}

function StockToday({ areaId, now }: { areaId: string; now: number }) {
  const history = useAreaStock(areaId)
  if (history.status === 'loading') return <p className="stock-today-message" role="status">Loading stock history…</p>
  if (history.status === 'error') return <p className="stock-today-message" role="alert">Stock history could not be loaded.</p>
  const { readings } = history
  if (!readings.length) return <p className="stock-today-message">No stock readings for this Area yet.</p>
  const nowIndex = readings.findLastIndex(reading => reading.ts <= now)
  return <figure className="stock-today">
    <div className="stock-bars" aria-hidden="true">
      {readings.map(reading => <span key={reading.ts} className={`stock-bar${reading.ts > now ? ' later' : ''}${isUnsure(reading.confidence) ? ' unsure' : ''}`} style={{ height: `${barHeights[reading.stock]}%` }} title={`${formatTime(reading.ts)} · ${stockLabels[reading.stock]} · ${formatConfidence(reading.confidence)}`} />)}
    </div>
    <div className="stock-now-marker" aria-hidden="true">{nowIndex >= 0 && <span style={{ left: `${(nowIndex + 0.5) / readings.length * 100}%` }}>▲</span>}</div>
    <figcaption className="stock-axis"><time>{formatTime(readings[0].ts)}</time><span>▲ now <time>{formatTime(now)}</time></span><time>{formatTime(readings[readings.length - 1].ts)}</time></figcaption>
    <ul className="sr-only">{readings.map(reading => <li key={reading.ts}>{formatTime(reading.ts)}: {stockLabels[reading.stock]}, {formatConfidence(reading.confidence)}{reading.ts > now ? ', after Now' : ''}</li>)}</ul>
  </figure>
}

function AreaPanel({ area, task, now, onComplete, onVerify }: { area: StoreArea; task: Task | undefined; now: number; onComplete: (task: Task) => void; onVerify: (areaId: string) => void }) {
  return <section className="area-panel" aria-labelledby="area-panel-title">
    <p className="area-panel-id">Area {area.id}</p>
    <h2 id="area-panel-title">{area.productName}</h2>
    {area.status === 'available' ? <div className="area-tiles">
      <div className={`area-tile${isUnsure(area.stockConfidence) ? ' unsure' : ''}`}>
        <span className="area-tile-label">Stock</span>
        <strong className={`tile-value tile-${area.stock}`}><Icon name={stockIcons[area.stock]} />{stockLabels[area.stock]}</strong>
        <span className="area-tile-confidence">{formatConfidence(area.stockConfidence)}</span>
      </div>
      <div className={`area-tile${isUnsure(area.complianceConfidence) ? ' unsure' : ''}`}>
        <span className="area-tile-label">Product</span>
        <strong className={`tile-value ${area.compliant ? 'tile-right' : 'tile-wrong'}`}><Icon name={area.compliant ? 'check' : 'move-product'} />{area.compliant ? 'Right' : 'Wrong'}</strong>
        <span className="area-tile-confidence">{!area.compliant && area.detectedProductName ? `Shelf shows ${area.detectedProductName} · ` : ''}{formatConfidence(area.complianceConfidence)}</span>
      </div>
    </div> : <p className="area-panel-unavailable" role="status">{unavailableAreaLabels[area.reason]} at the selected time.</p>}
    <h3 className="area-panel-heading">Stock today</h3>
    <StockToday areaId={area.id} now={now} />
    {task && <button className="area-panel-done" onClick={() => onComplete(task)}><Icon name="check" />Mark as done</button>}
    <button className="area-panel-verify" onClick={() => onVerify(area.id)}>Not right?</button>
  </section>
}

export function CameraPage({ camera, initialAreaId, origin, now, hiddenTaskIds, onComplete, onVerify }: { camera: CameraState; initialAreaId: string | null; origin: CameraOrigin; now: number; hiddenTaskIds: ReadonlySet<string>; onComplete: (task: Task) => void; onVerify: (areaId: string) => void }) {
  const [selectedAreaId, setSelectedAreaId] = useState(initialAreaId ?? mostUrgentArea(camera.areas)?.id)
  const selectedArea = camera.areas.find(area => area.id === selectedAreaId)
  const task = camera.tasks.find(task => task.area_id === selectedAreaId && !hiddenTaskIds.has(task.id))
  const ts = frameTime(camera)
  return <div className="camera-page">
    <div className="camera-page-heading">
      <a className="back-link" href={`#${origin}`}><Icon name="back" />{origin === 'tasks' ? 'Tasks' : 'Store'}</a>
      <div className="camera-page-title">
        <h1>{camera.name}</h1>
        <p>Camera {camera.id} · {ts === null ? 'no Frame at Now' : <>frame taken <time>{formatTime(ts)}</time></>}</p>
      </div>
      <SummaryPills camera={camera} />
    </div>
    <div className="camera-layout">
      <section className="camera-frame-card" aria-label="Camera Frame">
        <FrameSection camera={camera} selectedAreaId={selectedAreaId} onSelectArea={setSelectedAreaId} />
        <div className="camera-legend" aria-label="Legend">
          <span className="legend-full"><Icon name="full" />Full</span>
          <span className="legend-half"><Icon name="top-up" />Half</span>
          <span className="legend-empty"><Icon name="restock" />Empty</span>
          <span className="legend-wrong"><Icon name="move-product" />Wrong product (thick outline)</span>
          <span><span className="legend-dashed" aria-hidden="true" />Unsure (dashed)</span>
        </div>
      </section>
      {selectedArea ? <AreaPanel key={selectedArea.id} area={selectedArea} task={task} now={now} onComplete={onComplete} onVerify={onVerify} /> : <section className="area-panel"><p>This Camera has no Planogram Areas.</p></section>}
    </div>
    {camera.areas.length > 0 && <>
      <h2 className="camera-areas-heading">All areas on this camera</h2>
      <ul className="camera-area-grid">{camera.areas.map(area => <li key={area.id}>
        <button className={`camera-area-card${area.id === selectedAreaId ? ' selected' : ''}`} aria-pressed={area.id === selectedAreaId} onClick={() => setSelectedAreaId(area.id)}>
          <span className="camera-area-number">{area.number}</span>
          <span className="camera-area-text"><strong>{area.productName}</strong><span>{describeArea(area)}</span></span>
        </button>
      </li>)}</ul>
    </>}
  </div>
}
