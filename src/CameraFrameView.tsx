import { useState } from 'react'
import type { Frame } from './camera'
import type { StoreArea } from './store'
import { isUnsure } from './confidence'
import { Icon } from './Icon'
import { describeArea, stockIcons } from './areaDisplay'

function polygonClass(area: StoreArea, showPredictions: boolean, selected: boolean): string {
  const classes = ['label-polygon']
  if (selected) classes.push('selected')
  if (showPredictions && area.status === 'available') {
    classes.push(`camera-stock-${area.stock}`)
    if (!area.compliant) classes.push('camera-wrong-product')
    if (isUnsure(area.confidence)) classes.push('camera-uncertain')
  } else if (showPredictions) classes.push('camera-area-unavailable')
  return classes.join(' ')
}

export function CameraFrameView({ cameraId, frame, areas, showPredictions, selectedAreaId, onSelectArea, onImageReady }: { cameraId: string; frame: Frame; areas: StoreArea[]; showPredictions: boolean; selectedAreaId?: string; onSelectArea?: (areaId: string) => void; onImageReady?: (url: string) => void }) {
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
    {imageState === 'error' && <div className="label-image-status" role="alert">Frame unavailable. Go back and try again.</div>}
    <div className="frame-canvas" style={{ aspectRatio: `${width} / ${height}` }}>
      <svg viewBox={`${left} ${top} ${width} ${height}`} role="img" aria-label={`Camera ${cameraId}, Frame ${frame.image}${selectedAreaId ? `, Area ${selectedAreaId} highlighted` : ''}`}>
        <image href={frame.url} width={frame.width} height={frame.height} onLoad={() => { setImageState('ready'); onImageReady?.(frame.url) }} onError={() => { setImageState('error'); onImageReady?.('') }} />
        {imageState === 'ready' && areas.map(area => <polygon key={area.id} points={area.corners.map(point => point.join(',')).join(' ')} className={`${polygonClass(area, showPredictions, selectedAreaId === area.id)}${onSelectArea ? ' selectable' : ''}`} onClick={onSelectArea ? () => onSelectArea(area.id) : undefined} />)}
      </svg>
      {imageState === 'ready' && showPredictions && areas.map(area => {
        const [x, y] = area.corners.reduce(([sumX, sumY], point) => [sumX + point[0] / 4, sumY + point[1] / 4], [0, 0])
        const selected = selectedAreaId === area.id
        const tagClass = `area-tag${selected ? ' selected' : ''}${area.status === 'available' && isUnsure(area.confidence) ? ' uncertain' : ''}${area.status === 'unavailable' ? ' unavailable' : ''}`
        const tagStyle = { left: `${(x - left) / width * 100}%`, top: `${(y - top) / height * 100}%` }
        const content = <>
          <span>{area.number}</span>
          {area.status === 'available' ? <Icon name={stockIcons[area.stock]} className={`area-tag-stock tag-${area.stock}`} /> : <span aria-hidden="true">?</span>}
          {area.status === 'available' && !area.compliant && <Icon name="move-product" className="area-tag-wrong" />}
        </>
        return onSelectArea
          ? <button key={area.id} type="button" className={tagClass} style={tagStyle} aria-pressed={selected} aria-label={`Area ${area.number}: ${describeArea(area)}`} onClick={() => onSelectArea(area.id)}>{content}</button>
          : <span key={area.id} className={tagClass} style={tagStyle} role="img" aria-label={`Area ${area.number}: ${describeArea(area)}`}>{content}</span>
      })}
    </div>
  </div>
}
