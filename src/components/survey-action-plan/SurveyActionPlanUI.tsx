import type { ReactNode } from 'react'
import { ArrowRight, BookOpenCheck, Eye, ListOrdered, Plus, Search, Settings2, ShieldCheck, Sparkles, Target, type LucideIcon } from 'lucide-react'

export type SurveyWorkspace = 'questions' | 'plans'

export function SurveyWorkspaceHero({ active, onCreate, onPreview }: {
  active: SurveyWorkspace
  onCreate: () => void
  onPreview: () => void
}) {
  return (
    <section className="rounded-3xl bg-slate-950 px-5 py-6 text-white shadow-sm sm:px-7 sm:py-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-blue-100">
            <ShieldCheck className="h-3.5 w-3.5" /> Student guidance workspace
          </span>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">Turn assessment results into a clear next step.</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">Configure student reflection questions and score-aware study roadmaps. Preview the experience without creating student attempts or changing results.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
          <button type="button" onClick={onPreview} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20">
            <Eye className="h-4 w-4" /> Preview experience
          </button>
          <button type="button" onClick={onCreate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-blue-50">
            <Plus className="h-4 w-4" /> {active === 'questions' ? 'New survey question' : 'New action plan'}
          </button>
        </div>
      </div>
    </section>
  )
}

export function SurveyWorkspaceStats({ items }: { items: Array<{ label: string; value: number; hint: string }> }) {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
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

export function SurveyWorkspaceTabs({ active, onChange, questionCount, planCount }: {
  active: SurveyWorkspace
  onChange: (next: SurveyWorkspace) => void
  questionCount: number
  planCount: number
}) {
  const tabs: Array<{ id: SurveyWorkspace; title: string; description: string; count: number; icon: LucideIcon }> = [
    { id: 'questions', title: 'Student reflection survey', description: 'Prompts, response types, and required answers', count: questionCount, icon: ListOrdered },
    { id: 'plans', title: 'Action plans & roadmaps', description: 'Score bands, milestones, and study routines', count: planCount, icon: Target },
  ]
  return (
    <div role="tablist" aria-label="Student guidance configuration" className="grid gap-3 sm:grid-cols-2">
      {tabs.map(tab => {
        const Icon = tab.icon
        const selected = active === tab.id
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

export function SurveyWorkspaceToolbar({ active, search, onSearch, category, onCategory, categories, onClear, onReset, showAdvanced, onToggleAdvanced, filteredCount, totalCount, busy }: {
  active: SurveyWorkspace
  search: string
  onSearch: (value: string) => void
  category: string
  onCategory: (value: string) => void
  categories: Array<{ value: string; label: string }>
  onClear: () => void
  onReset: () => void
  showAdvanced: boolean
  onToggleAdvanced: () => void
  filteredCount: number
  totalCount: number
  busy: boolean
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">Search {active === 'questions' ? 'survey questions' : 'action plans'}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input type="search" value={search} onChange={event => onSearch(event.target.value)}
            placeholder={active === 'questions' ? 'Search question prompts and descriptions' : 'Search plans, audiences, and summaries'}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        </label>
        {active === 'questions' && (
          <label className="block min-w-0 md:w-56">
            <span className="sr-only">Survey category</span>
            <select value={category} onChange={event => onCategory(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
              <option value="all">All categories</option>
              {categories.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        )}
        <button type="button" onClick={onToggleAdvanced} aria-expanded={showAdvanced} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
          <Settings2 className="h-4 w-4" /> More tools
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>Showing <strong className="text-slate-800">{filteredCount}</strong> of <strong className="text-slate-800">{totalCount}</strong> {active === 'questions' ? 'questions' : 'plans'}</span>
        {(search || (active === 'questions' && category !== 'all')) && <button type="button" onClick={onClear} className="font-semibold text-blue-700 hover:underline">Clear filters</button>}
      </div>
      {showAdvanced && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-amber-900"><strong>Destructive action:</strong> clear the currently configured {active === 'questions' ? 'survey questions' : 'action plans'}. This does not restore the starter templates.</p>
          <button type="button" disabled={busy || totalCount === 0} onClick={onReset} className="shrink-0 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Clear all {active === 'questions' ? 'questions' : 'plans'}</button>
        </div>
      )}
    </div>
  )
}

export function SurveyScoreBandNotice({ gaps, overlaps, planCount }: { gaps: number; overlaps: number; planCount: number }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <BookOpenCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">Score-band configuration check</p>
        <p className="mt-1 text-xs leading-5 text-slate-600">{planCount === 0 ? 'No action plans are configured.' : `${gaps} percentage points are outside all configured score bands; ${overlaps} percentage points belong to multiple bands.`} These counts are advisory only: the actual plan matcher also considers student survey answers, and can select a plan outside its score band.</p>
      </div>
    </div>
  )
}

export function SurveyEmptyState({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
      <Sparkles className="mx-auto h-7 w-7 text-slate-400" />
      <p className="mt-3 text-base font-bold text-slate-900">{title}</p>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{description}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}
