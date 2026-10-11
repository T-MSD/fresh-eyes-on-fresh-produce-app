import { useState } from 'react'
import type { Frame } from './camera'
import type { StoreArea } from './store'
import { isUnsure } from './confidence'

export function CameraFrameView({ cameraId, frame, areas, showPredictions, selectedAreaId, onImageReady }: { cameraId: string; frame: Frame; areas: StoreArea[]; showPredictions: boolean; selectedAreaId?: string; onImageReady?: (url: string) => void }) {
  const [imageState, setImageState] = useState<'loading' | 'ready' | 'error'>('loading')
  const points = areas.flatMap(area => area.corners)
  const left = Math.max(0, Math.min(...points.map(point => point[0])) - 20)
  const top = Math.max(0, Math.min(...points.map(point => point[1])) - 20)
  const right = Math.min(frame.width, Math.max(...points.map(point => point[0])) + 20)
  const bottom = Math.min(frame.height, Math.max(...points.map(point => point[1])) + 20)
  const width = right - left, height = bottom - top
  if (width <= 0 || height <= 0 || !areas.length) return <div className="label-frame-message">No Planogram Areas are visible in this Frame.</div>
  return <div className="label-frame">
    {imageState === 'loading' && <p className="label-image-status" role="status">Loading Frame…</p>}
    {imageState === 'error' && <div className="label-image-status" role="alert">Frame unavailable. Close this view and try again.</div>}
    <svg viewBox={`${left} ${top} ${width} ${height}`} style={{ aspectRatio: `${width} / ${height}` }} role="img" aria-label={`Camera ${cameraId}, Frame ${frame.image}${selectedAreaId ? `, Area ${selectedAreaId} highlighted` : ''}`}>
      <image href={frame.url} width={frame.width} height={frame.height} onLoad={() => { setImageState('ready'); onImageReady?.(frame.url) }} onError={() => { setImageState('error'); onImageReady?.('') }} />
      {imageState === 'ready' && areas.map(area => {
        const available = showPredictions && area.status === 'available'
        const uncertain = available && isUnsure(area.confidence)
        const center = area.corners.reduce(([x, y], point) => [x + point[0] / 4, y + point[1] / 4], [0, 0])
        return <g key={area.id}>
          <polygon points={area.corners.map(point => point.join(',')).join(' ')} className={`label-polygon${selectedAreaId === area.id ? ' selected' : ''}${available ? ` camera-stock-${area.stock}${area.compliant ? '' : ' camera-wrong-product'}` : showPredictions ? ' camera-area-unavailable' : ''}${uncertain ? ' camera-uncertain' : ''}`} />
          {showPredictions && <text x={center[0]} y={center[1]} className="camera-polygon-label" textAnchor="middle">{area.number}{available && !area.compliant ? ' ⚠' : area.status === 'unavailable' ? ' ?' : ''}</text>}
        </g>
      })}
    </svg>
  </div>
}
