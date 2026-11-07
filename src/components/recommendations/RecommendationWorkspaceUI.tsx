import type { ReactNode } from 'react'
import { ArrowRight, ClipboardCheck, Layers3, Link2, Search, ShieldCheck, type LucideIcon } from 'lucide-react'

export type RecommendationWorkspace = 'rules' | 'plans'

export function RecommendationHero({ onAction, actionLabel }: { onAction: () => void; actionLabel: string }) {
  return <section className="rounded-3xl bg-slate-950 px-5 py-6 text-white shadow-sm sm:px-7 sm:py-8">
    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="max-w-3xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-blue-100"><ShieldCheck className="h-3.5 w-3.5" /> Recommendation workspace</span>
        <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Turn evidence into the right next step.</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">Maintain reusable recommendation rules and action plans. Your students’ saved assessment results remain unchanged.</p>
      </div>
      <button type="button" onClick={onAction} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-blue-50"><ArrowRight className="h-4 w-4" /> {actionLabel}</button>
    </div>
  </section>
}

export function RecommendationStats({ stats }: { stats: Array<{ label: string; value: string | number; note: string }> }) {
  return <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{stats.map((stat) => <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs font-semibold text-slate-500">{stat.label}</div><div className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{stat.value}</div><div className="mt-1 text-xs leading-5 text-slate-500">{stat.note}</div></div>)}</div>
}

export function RecommendationTabs({ active, onChange, ruleCount, planCount }: { active: RecommendationWorkspace; onChange: (next: RecommendationWorkspace) => void; ruleCount: number; planCount: number }) {
  const tabs: Array<{ id: RecommendationWorkspace; title: string; detail: string; count: number; icon: LucideIcon }> = [
    { id: 'rules', title: 'Recommendation rules', detail: 'Conditions, priority and plan assignments', count: ruleCount, icon: ClipboardCheck },
    { id: 'plans', title: 'Action plan library', detail: 'Reusable plans, ordered tasks and resources', count: planCount, icon: Layers3 },
  ]
  return <div role="tablist" aria-label="Recommendation workspace" className="grid gap-3 sm:grid-cols-2">{tabs.map((tab) => { const Icon = tab.icon; const selected = active === tab.id; return <button key={tab.id} type="button" role="tab" aria-selected={selected} onClick={() => onChange(tab.id)} className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${selected ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'}`}><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-blue-700'}`}><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">{tab.title} <span className="ml-1 text-xs font-semibold text-slate-500">{tab.count}</span></span><span className="mt-1 block text-xs leading-5 text-slate-500">{tab.detail}</span></span><ArrowRight className={`h-4 w-4 shrink-0 ${selected ? 'text-blue-600' : 'text-slate-400'}`} /></button> })}</div>
}

export function RecommendationSearch({ value, onChange, filter, onFilter, label, count, total }: { value: string; onChange: (value: string) => void; filter: string; onFilter: (value: string) => void; label: string; count: number; total: number }) {
  return <div className="flex flex-col gap-3 border-b border-slate-100 p-4"><div className="flex flex-col gap-2 sm:flex-row"><label className="relative min-w-0 flex-1"><span className="sr-only">Search {label}</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input type="search" value={value} onChange={event => onChange(event.target.value)} placeholder={`Search ${label}…`} className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label><label className="sm:w-36"><span className="sr-only">Status</span><select value={filter} onChange={event => onFilter(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500"><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Archived</option></select></label></div><p className="text-xs text-slate-500">Showing <strong className="text-slate-800">{count}</strong> of <strong className="text-slate-800">{total}</strong> {label}</p></div>
}

export function RecommendationEmpty({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="px-6 py-12 text-center"><Link2 className="mx-auto h-8 w-8 text-slate-300"/><p className="mt-3 text-sm font-bold text-slate-900">{title}</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>{action && <div className="mt-4">{action}</div>}</div>
}

export function RecommendationBadge({ active }: { active: boolean }) { return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{active ? 'Active' : 'Archived'}</span> }

const OPERATORS = new Set(['eq','neq','gt','gte','lt','lte','in','not_in','contains','not_contains','exists','not_exists','between'])
export function validateRecommendationConditions(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Conditions must be a JSON object.'
  if (Object.keys(value).length === 0) return null // Existing engine treats {} as match-all.
  function validate(node: unknown, path: string, depth: number): string | null {
    if (depth > 16) return 'Conditions are nested too deeply.'
    if (!node || typeof node !== 'object' || Array.isArray(node)) return `${path} must be an object.`
    const item = node as Record<string, unknown>
    if ('path' in item) {
      if (typeof item.path !== 'string' || !item.path.trim()) return `${path}.path must be a non-empty string.`
      const operator = item.operator === undefined ? 'eq' : item.operator
      if (typeof operator !== 'string' || !OPERATORS.has(operator)) return `${path}.operator is not supported.`
      if (!['exists','not_exists'].includes(operator) && !('value' in item)) return `${path}.value is required for ${operator}.`
      if (['in','not_in'].includes(operator) && !Array.isArray(item.value)) return `${path}.value must be an array.`
      if (operator === 'between' && (!Array.isArray(item.value) || item.value.length < 2 || !item.value.slice(0,2).every(v => typeof v === 'number'))) return `${path}.value must contain two numeric bounds.`
      return null
    }
    const kinds = ['all','any','not'].filter(key => key in item)
    if (kinds.length !== 1) return `${path} must contain exactly one of all, any or not (or a path condition).`
    const kind = kinds[0]
    if (kind === 'not') return validate(item.not, `${path}.not`, depth + 1)
    const children = item[kind]
    if (!Array.isArray(children) || children.length === 0) return `${path}.${kind} must contain at least one condition.`
    for (let i = 0; i < children.length; i++) { const error = validate(children[i], `${path}.${kind}[${i}]`, depth + 1); if (error) return error }
    return null
  }
  return validate(value, 'Conditions', 0)
}
