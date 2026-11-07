import type { ReactNode } from 'react'
import { BookOpen, CheckCircle2, ChevronRight, FolderTree, Layers, ShieldCheck } from 'lucide-react'

type WorkspaceMode = 'generic' | 'legacy'

export function TaxonomyWorkspaceTabs({ mode, onChange }: {
  mode: WorkspaceMode
  onChange: (mode: WorkspaceMode) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Taxonomy workspace view">
      <button type="button" onClick={() => onChange('generic')} aria-pressed={mode === 'generic'}
        className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${mode === 'generic' ? 'border-blue-300 bg-blue-50 shadow-sm ring-1 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'}`}>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${mode === 'generic' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}><Layers className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900">Flexible taxonomy manager <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">Recommended</span></span><span className="mt-1 block text-xs leading-5 text-slate-600">Create separate taxonomies and organize nodes at any depth.</span></span>
        {mode === 'generic' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-blue-600" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
      </button>
      <button type="button" onClick={() => onChange('legacy')} aria-pressed={mode === 'legacy'}
        className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${mode === 'legacy' ? 'border-blue-300 bg-blue-50 shadow-sm ring-1 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'}`}>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${mode === 'legacy' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}><FolderTree className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">Curriculum compatibility view</span><span className="mt-1 block text-xs leading-5 text-slate-600">Manage the existing Domain → Chapter → Lesson structure.</span></span>
        {mode === 'legacy' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-blue-600" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
      </button>
    </div>
  )
}

export function TaxonomyHero({ count, nodeCount, rootCount, bankCount }: {
  count: number
  nodeCount: number | null
  rootCount: number | null
  bankCount: number
}) {
  return (
    <div className="ms-taxonomy-contrast-hero overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 p-5 text-white shadow-sm md:p-7">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-blue-100"><BookOpen className="h-3.5 w-3.5" /> Curriculum workspace</span>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-white md:text-3xl">Organize what students learn.</h2>
          <p className="mt-2 text-sm leading-6 text-slate-200">Choose a taxonomy, open a node, and add its children. Your existing question links and assessment records are not changed by navigating this workspace.</p>
        </div>
        <div className="flex max-w-xs items-start gap-2 rounded-2xl border border-white/15 bg-white/10 p-3 text-xs leading-5 text-slate-100"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /><span>Creating and editing nodes saves to the existing taxonomy records. Deletion still requires confirmation.</span></div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TaxonomyMetric label="Taxonomies" value={count} hint="Available workspaces" dark />
        <TaxonomyMetric label="Selected nodes" value={nodeCount ?? '—'} hint="All levels" dark />
        <TaxonomyMetric label="Root nodes" value={rootCount ?? '—'} hint="Top level of selection" dark />
        <TaxonomyMetric label="Bank questions" value={bankCount} hint="All saved questions" dark />
      </div>
    </div>
  )
}

export function TaxonomyMetric({ label, value, hint, dark = false }: {
  label: string
  value: number | string
  hint: string
  dark?: boolean
}) {
  return (
    <div className={`rounded-2xl border p-3.5 ${dark ? 'border-white/15 bg-white/10' : 'border-slate-200 bg-white'}`}>
      <p className={`text-xs font-semibold ${dark ? 'text-slate-200' : 'text-slate-600'}`}>{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${dark ? 'text-white' : 'text-slate-900'}`}>{value}</p>
      <p className={`mt-1 text-xs ${dark ? 'text-slate-300' : 'text-slate-500'}`}>{hint}</p>
    </div>
  )
}

export function TaxonomySectionHeading({ title, description, action }: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-base font-bold text-slate-900">{title}</h3>{description && <p className="mt-1 text-sm leading-5 text-slate-600">{description}</p>}</div>
      {action}
    </div>
  )
}
