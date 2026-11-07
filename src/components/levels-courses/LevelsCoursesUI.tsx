import type { ReactNode } from 'react'
import { BookOpen, Layers3, ArrowRight, type LucideIcon } from 'lucide-react'

export type WorkspaceView = 'levels' | 'courses'

export function LevelsCoursesHero({ onCreateLevel, onCreateCourse }: {
  onCreateLevel: () => void
  onCreateCourse: () => void
}) {
  return (
    <section className="rounded-3xl bg-slate-950 px-5 py-6 text-white shadow-sm sm:px-7 sm:py-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-blue-100">
            <Layers3 className="h-3.5 w-3.5" /> Learning pathways
          </span>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">Match performance to the next step.</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">Define score ranges, connect curriculum categories, and recommend courses. All changes use your existing saved data.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onCreateLevel} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500">+ New performance level</button>
          <button type="button" onClick={onCreateCourse} className="rounded-xl border border-white/25 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-blue-50">+ New course</button>
        </div>
      </div>
    </section>
  )
}

export function LevelsCoursesStats({ items }: { items: Array<{ label: string; value: number; hint: string }> }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(item => (
        <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">{item.label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{item.value}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{item.hint}</p>
        </div>
      ))}
    </div>
  )
}

export function LevelsCoursesTabs({ view, onChange, levelCount, courseCount }: {
  view: WorkspaceView
  onChange: (view: WorkspaceView) => void
  levelCount: number
  courseCount: number
}) {
  const tabs: Array<{ id: WorkspaceView; title: string; description: string; count: number; icon: LucideIcon }> = [
    { id: 'levels', title: 'Performance levels', description: 'Score bands, categories and recommendations', count: levelCount, icon: Layers3 },
    { id: 'courses', title: 'Courses & programs', description: 'Offerings, enrollment and contact links', count: courseCount, icon: BookOpen },
  ]
  return (
    <div role="tablist" aria-label="Levels and courses" className="grid gap-3 sm:grid-cols-2">
      {tabs.map(tab => {
        const Icon = tab.icon
        const selected = view === tab.id
        return (
          <button key={tab.id} type="button" role="tab" aria-selected={selected} onClick={() => onChange(tab.id)}
            className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${selected ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'}`}>
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-blue-700'}`}><Icon className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-slate-900">{tab.title} <span className="ml-1 text-xs font-semibold text-slate-500">{tab.count}</span></span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">{tab.description}</span>
            </span>
            <ArrowRight className={`h-4 w-4 shrink-0 ${selected ? 'text-blue-600' : 'text-slate-400'}`} />
          </button>
        )
      })}
    </div>
  )
}

export function LevelsCoursesEmpty({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center">
      <p className="text-base font-bold text-slate-900">{title}</p>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
