import type { ReactNode } from 'react'
import { AlertCircle, ArrowLeft, Download, FileText, LockKeyhole, Mail, Printer, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'

export function ReportLoadingState() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-5" role="status" aria-live="polite">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" aria-hidden="true" />
        <h1 className="text-xl font-bold text-slate-900">Preparing your report…</h1>
        <div className="mt-6 space-y-2" aria-hidden="true">
          <div className="h-3 animate-pulse rounded-full bg-slate-100" />
          <div className="h-3 w-4/5 animate-pulse rounded-full bg-slate-100" />
          <div className="h-3 w-3/5 animate-pulse rounded-full bg-slate-100" />
        </div>
      </div>
    </main>
  )
}

export function ReportUnavailableState({
  title, message, restricted = false, onRetry,
}: { title: string; message: string; restricted?: boolean; onRetry?: () => void }) {
  const Icon = restricted ? LockKeyhole : AlertCircle
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9" role="alert">
        <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${restricted ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          {onRetry && <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"><RefreshCw className="h-4 w-4" /> Try again</button>}
          {restricted && <Link to="/login" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Teacher sign in</Link>}
          <Link to="/" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /> Return home</Link>
        </div>
      </div>
    </main>
  )
}

export type ReportJump = { id: string; label: string }
export function ReportQuickNavigation({ sections }: { sections: ReportJump[] }) {
  if (sections.length < 2) return null
  return (
    <nav aria-label="Report sections" className="ms-report-jump no-print mx-auto max-w-5xl px-4 pt-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <span className="mr-1 text-xs font-bold uppercase tracking-wide text-slate-500">Jump to</span>
        {sections.map((section) => (
          <button key={section.id} type="button" onClick={() => document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">{section.label}</button>
        ))}
      </div>
    </nav>
  )
}

export function ReportActionBar({ title, subtitle, date, busy, canEmail, preview, onDownload, onEmail, onPrint }: {
  title: string; subtitle: string; date: string; busy: boolean; canEmail: boolean; preview: boolean;
  onDownload: () => void; onEmail: () => void; onPrint: () => void;
}) {
  return (
    <header className="ms-report-toolbar no-print sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
            <h2 className="truncate text-sm font-bold text-slate-900">{title}</h2>
            {preview && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">Preview</span>}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-slate-500">{subtitle} · {date}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={onDownload} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 sm:flex-none"><Download className="h-4 w-4" /> {busy ? 'Preparing…' : 'Download PDF'}</button>
          {canEmail && !preview && <button type="button" disabled={busy} onClick={onEmail} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50 sm:flex-none"><Mail className="h-4 w-4" /> Email</button>}
          <button type="button" onClick={onPrint} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 sm:flex-none"><Printer className="h-4 w-4" /> Print</button>
        </div>
      </div>
    </header>
  )
}

export function ReportStatusNotice({ tone, children, onDismiss }: { tone: 'sending' | 'success' | 'error'; children: ReactNode; onDismiss: () => void }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} aria-live={tone === 'error' ? 'assertive' : 'polite'} className={`no-print border-b px-4 py-3 text-sm ${tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : tone === 'error' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3"><span>{children}</span><button type="button" onClick={onDismiss} className="shrink-0 rounded-lg border border-current/20 px-2 py-1 text-xs font-semibold">Dismiss</button></div>
    </div>
  )
}
