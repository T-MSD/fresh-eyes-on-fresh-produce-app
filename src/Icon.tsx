import type { TaskKind } from './tasks'

export type IconName = 'eye' | 'check' | 'chevron' | TaskKind

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'eye' && <><path d="M2 12s3.5-8 10-8 10 8 10 8-3.5 8-10 8S2 12 2 12Z" /><circle cx="12" cy="12" r="3.5" /></>}
    {name === 'check' && <path d="m5 12 4 4L19 6" />}
    {name === 'chevron' && <path d="m9 6 6 6-6 6" />}
    {name === 'restock' && <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="m6 20 12-16" /></>}
    {name === 'move-product' && <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5m0 3h.01" /></>}
    {name === 'top-up' && <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M5 11h14v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z" fill="currentColor" /></>}
  </svg>
}
