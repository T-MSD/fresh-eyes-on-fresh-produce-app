import { useEffect, useState } from 'react'
import { fetchAreaStock } from './api.ts'
import type { StockReading } from './camera.ts'

export type AreaStockState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; readings: StockReading[] }

export function useAreaStock(areaId: string): AreaStockState {
  const [state, setState] = useState<{ areaId: string; stock: AreaStockState }>({ areaId, stock: { status: 'loading' } })
  useEffect(() => {
    const controller = new AbortController()
    fetchAreaStock(areaId, controller.signal)
      .then(readings => { if (!controller.signal.aborted) setState({ areaId, stock: { status: 'ready', readings } }) })
      .catch(() => { if (!controller.signal.aborted) setState({ areaId, stock: { status: 'error' } }) })
    return () => controller.abort()
  }, [areaId])
  return state.areaId === areaId ? state.stock : { status: 'loading' }
}
