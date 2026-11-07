import type { ReactNode } from 'react'
import { CheckCircle2, AlertCircle, Info, Settings2, Users, Eye, Palette, type LucideIcon } from 'lucide-react'

export type SettingsTab = 'fields' | 'branding' | 'preview'

const NAV: Array<{ id: SettingsTab; label: string; detail: string; icon: LucideIcon }> = [
  { id: 'fields', label: 'Registration fields', detail: 'Student intake form', icon: Users },
  { id: 'branding', label: 'Organization branding', detail: 'Contact & report details', icon: Palette },
  { id: 'preview', label: 'Student preview', detail: 'Try the intake form', icon: Eye },
]

export function SettingsWorkspaceHeader({ active, onChange, total, activeCount, required, hidden }: {
  active: SettingsTab
  onChange: (tab: SettingsTab) => void
  total: number
  activeCount: number
  required: number
  hidden: number
}) {
  const metrics = [
    { label: 'Total fields', value: total },
    { label: 'Visible to students', value: activeCount },
    { label: 'Required & visible', value: required },
    { label: 'Hidden fields', value: hidden },
  ]
  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-slate-800 bg-slate-900 px-5 py-6 text-white shadow-sm sm:px-7">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10"><Settings2 className="h-5 w-5" /></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-200">Administration / Settings</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">Configure the student experience</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Manage the registration form, organization contact details, and a safe preview of what students see. Changes are saved to your existing organization records.</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">{item.label}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>
      <div role="tablist" aria-label="Settings workspaces" className="grid gap-2 sm:grid-cols-3">
        {NAV.map(({ id, label, detail, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={active === id} onClick={() => onChange(id)}
            className={`flex min-w-0 items-center gap-3 rounded-2xl border px-4 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${active === id ? 'border-blue-300 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}>
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active === id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}><Icon className="h-5 w-5" /></span>
            <span className="min-w-0"><span className="block text-sm font-bold text-slate-900">{label}</span><span className="mt-0.5 block text-xs text-slate-500">{detail}</span></span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function SettingsPanel({ title, description, action, children }: { title: string; description: string; action?: ReactNode; children: ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
      <div><h3 className="text-base font-bold text-slate-900">{title}</h3><p className="mt-1 text-sm text-slate-500">{description}</p></div>
      {action}
    </div>
    <div className="p-5 sm:p-6">{children}</div>
  </section>
}

export function SettingsNotice({ kind, children, onDismiss }: { kind: 'error' | 'success' | 'info'; children: ReactNode; onDismiss?: () => void }) {
  const classes = kind === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-blue-200 bg-blue-50 text-blue-800'
  const Icon = kind === 'error' ? AlertCircle : kind === 'success' ? CheckCircle2 : Info
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${classes}`}>
    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
    <div className="min-w-0 flex-1">{children}</div>
    {onDismiss && <button type="button" onClick={onDismiss} aria-label="Dismiss message" className="rounded px-2 font-semibold hover:bg-black/5">×</button>}
  </div>
}
