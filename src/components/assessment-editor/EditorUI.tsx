import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'

/** Shared visual primitives for the Assessment Studio editor screens. */
interface EditorMetricProps {
  icon: LucideIcon
  label: string
  value: ReactNode
  hint?: string
}

export function EditorMetric({ icon: Icon, label, value, hint }: EditorMetricProps) {
  return (
    <div className="min-w-0 border-r border-b border-slate-100 px-4 py-4 last:border-r-0 sm:px-6 sm:py-5 lg:border-b-0">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
        <Icon className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" /> {label}
      </div>
      <p className="mt-1 break-words text-lg font-extrabold tracking-tight text-slate-950 sm:text-xl">{value}</p>
      {hint && <p className="mt-1 text-[11px] leading-4 text-slate-500">{hint}</p>}
    </div>
  )
}

interface EditorTabButtonProps {
  icon: LucideIcon
  label: string
  description: string
  active: boolean
  onClick: () => void
}

export function EditorTabButton({ icon: Icon, label, description, active, onClick }: EditorTabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-[92px] min-w-0 flex-col items-start justify-center rounded-2xl border px-3.5 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:px-4 ${
        active ? 'border-blue-600 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-blue-700' : 'text-slate-500'}`} aria-hidden="true" />
        <span className={`text-xs font-bold leading-5 sm:text-sm ${active ? 'text-blue-900' : 'text-slate-800'}`}>{label}</span>
      </span>
      <span className={`mt-1 pl-6 text-[11px] leading-4 ${active ? 'text-blue-700' : 'text-slate-500'}`}>{description}</span>
    </button>
  )
}

interface EditorActionLinkProps {
  icon: LucideIcon
  to: string
  children: ReactNode
  primary?: boolean
}

export function EditorActionLink({ icon: Icon, to, children, primary = false }: EditorActionLinkProps) {
  return (
    <Link
      to={to}
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
        primary ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50'
      }`}
      style={{ color: primary ? '#ffffff' : '#334155' }}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> {children}
    </Link>
  )
}

interface EditorActionButtonProps {
  icon: LucideIcon
  onClick: () => void
  children: ReactNode
  disabled?: boolean
}

export function EditorActionButton({ icon: Icon, onClick, children, disabled = false }: EditorActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> {children}
    </button>
  )
}
