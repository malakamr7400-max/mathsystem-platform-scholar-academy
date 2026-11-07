import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface LibraryMetricProps {
  label: string
  value: ReactNode
  icon: LucideIcon
  hint?: string
}

/** Shared library summary card. Works in question, assessment, and resource libraries. */
export function LibraryMetric({ label, value, icon: Icon, hint }: LibraryMetricProps) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span>{label}</span>
      </div>
      <div className="mt-3 text-2xl font-extrabold tracking-tight text-slate-950">{value}</div>
      {hint && <p className="mt-1 text-[11px] leading-4 text-slate-500">{hint}</p>}
    </div>
  )
}

interface LibraryPaginationProps {
  page: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
}

/** Reusable, accessible pager. Its parent owns the filtered data and page state. */
export function LibraryPagination({ page, totalPages, totalItems, pageSize, onPageChange }: LibraryPaginationProps) {
  if (totalItems <= pageSize) return null
  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, totalItems)
  return (
    <nav aria-label="Library pages" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <span className="text-xs font-medium text-slate-600">Showing {first}–{last} of {totalItems}</span>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Previous page" onClick={() => onPageChange(page - 1)} disabled={page <= 1}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[88px] text-center text-xs font-semibold text-slate-700">Page {page} of {totalPages}</span>
        <button type="button" aria-label="Next page" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  )
}
