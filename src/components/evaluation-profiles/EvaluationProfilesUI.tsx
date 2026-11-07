import type { ReactNode } from 'react'
import { ArrowRight, BarChart3, Layers3, ListChecks, Settings2, ShieldCheck, type LucideIcon } from 'lucide-react'

export type EvaluationWorkspace = 'levels' | 'rules'

export function EvaluationProfilesHero({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="rounded-3xl bg-slate-950 px-5 py-6 text-white shadow-sm sm:px-7 sm:py-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-blue-100">
            <ShieldCheck className="h-3.5 w-3.5" /> Evaluation workspace
          </span>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">Design consistent, reusable evaluation.</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">Create a scoring profile, define its performance bands, and configure optional rules. Your existing assessments and student results stay untouched.</p>
        </div>
        <button type="button" onClick={onCreate} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-blue-50">
          <Settings2 className="h-4 w-4" /> New evaluation profile
        </button>
      </div>
    </section>
  )
}

export function EvaluationProfilesStats({ items }: { items: Array<{ label: string; value: number; hint: string }> }) {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">{item.label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{item.value}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{item.hint}</p>
        </div>
      ))}
    </div>
  )
}

export function EvaluationWorkspaceTabs({ view, onChange, levelCount, ruleCount }: {
  view: EvaluationWorkspace
  onChange: (view: EvaluationWorkspace) => void
  levelCount: number
  ruleCount: number
}) {
  const tabs: Array<{ id: EvaluationWorkspace; title: string; description: string; count: number; icon: LucideIcon }> = [
    { id: 'levels', title: 'Performance levels', description: 'Define score bands and classification labels', count: levelCount, icon: Layers3 },
    { id: 'rules', title: 'Evaluation rules', description: 'Configure optional key/value evaluation settings', count: ruleCount, icon: ListChecks },
  ]
  return (
    <div role="tablist" aria-label="Evaluation configuration" className="grid gap-3 sm:grid-cols-2">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const active = view === tab.id
        return (
          <button key={tab.id} type="button" role="tab" aria-selected={active} onClick={() => onChange(tab.id)}
            className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${active ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'}`}>
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-blue-700'}`}><Icon className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-slate-900">{tab.title} <span className="ml-1 text-xs font-semibold text-slate-500">{tab.count}</span></span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">{tab.description}</span>
            </span>
            <ArrowRight className={`h-4 w-4 shrink-0 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
          </button>
        )
      })}
    </div>
  )
}

export function EvaluationEmpty({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
      <BarChart3 className="mx-auto h-7 w-7 text-slate-400" />
      <p className="mt-3 text-base font-bold text-slate-900">{title}</p>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
