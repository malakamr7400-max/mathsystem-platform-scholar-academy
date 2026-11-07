import { useState, type ReactNode } from 'react'
import { AlertCircle, ArrowRight, Award, CheckCircle2, ClipboardList, FileText, LayoutDashboard, ShieldCheck, SlidersHorizontal, type LucideIcon } from 'lucide-react'
import type { ReportSectionId, ReportTemplateConfig, RubricTier } from '../../lib/reportTemplateService'

export type ReportSettingsTab = 'sections' | 'rubric' | 'thresholds' | 'branding'

const TABS: Array<{ id: ReportSettingsTab; title: string; subtitle: string; icon: LucideIcon }> = [
  { id: 'sections', title: 'Report sections', subtitle: 'Visibility, conditions & fields', icon: LayoutDashboard },
  { id: 'rubric', title: 'Performance tiers', subtitle: 'Score bands & study advice', icon: Award },
  { id: 'thresholds', title: 'Mastery criteria', subtitle: 'Domain thresholds & pacing', icon: SlidersHorizontal },
  { id: 'branding', title: 'Report identity', subtitle: 'Titles, guidance & footer', icon: FileText },
]

export function ReportSettingsHero({ target, dirty, saving, children }: { target: string; dirty: boolean; saving: boolean; children?: ReactNode }) {
  return <section className="rounded-3xl bg-slate-950 px-5 py-6 text-white shadow-sm sm:px-7 sm:py-8">
    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="max-w-3xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-blue-100"><ShieldCheck className="h-3.5 w-3.5"/> Report design workspace</span>
        <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Design a clearer student report.</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">Configure which evidence appears, how scores are classified, and the guidance students receive. Existing results are not recalculated here.</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs"><span className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5">Target: {target}</span><span className={`rounded-lg px-2.5 py-1.5 font-semibold ${dirty ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>{saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved'}</span></div>
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </div>
  </section>
}

export function ReportSettingsStats({ enabled, total, conditional, tiers }: { enabled: number; total: number; conditional: number; tiers: number }) {
  const stats = [
    { label: 'Visible sections', value: `${enabled} / ${total}`, detail: 'Shown in generated reports' },
    { label: 'Conditional sections', value: conditional, detail: 'Display rules configured' },
    { label: 'Performance tiers', value: tiers, detail: 'Score classifications' },
    { label: 'Hidden sections', value: total - enabled, detail: 'Excluded from report layout' },
  ]
  return <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{stats.map(stat => <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs font-semibold text-slate-500">{stat.label}</div><div className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{stat.value}</div><div className="mt-1 text-xs leading-5 text-slate-500">{stat.detail}</div></div>)}</div>
}

export function ReportSettingsTabs({ active, onChange, tiers }: { active: ReportSettingsTab; onChange: (tab: ReportSettingsTab) => void; tiers: number }) {
  return <div role="tablist" aria-label="Report settings workspaces" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{TABS.map(tab => { const Icon = tab.icon; const selected = active === tab.id; return <button key={tab.id} type="button" role="tab" aria-selected={selected} onClick={() => onChange(tab.id)} className={`flex min-w-0 items-center gap-3 rounded-2xl border p-3.5 text-left transition ${selected ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'}`}><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-blue-700'}`}><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">{tab.title}{tab.id === 'rubric' ? ` (${tiers})` : ''}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{tab.subtitle}</span></span><ArrowRight className={`h-4 w-4 shrink-0 ${selected ? 'text-blue-600' : 'text-slate-400'}`} /></button> })}</div>
}

export function ReportSettingsNotice({ kind, title, children }: { kind: 'error' | 'warning' | 'success' | 'info'; title: string; children?: ReactNode }) {
  const cls = kind === 'error' ? 'border-rose-200 bg-rose-50 text-rose-900' : kind === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-900' : kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-blue-200 bg-blue-50 text-blue-900'
  const Icon = kind === 'success' ? CheckCircle2 : kind === 'info' ? ClipboardList : AlertCircle
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${cls}`}><Icon className="mt-0.5 h-4 w-4 shrink-0"/><div className="min-w-0"><p className="text-sm font-bold">{title}</p>{children && <div className="mt-1 text-xs leading-5">{children}</div>}</div></div>
}

export interface ReportValidation { errors: string[]; warnings: string[] }

/** Inclusive integer score bands, consistent with the existing default 0–49, 50–64, 65–79, 80–100 configuration. */
export function validateReportTemplate(template: ReportTemplateConfig): ReportValidation {
  const errors: string[] = []
  const warnings: string[] = []
  if (!template.title?.trim()) errors.push('Report title is required.')
  if (!Number.isFinite(template.strongThreshold) || !Number.isFinite(template.moderateThreshold) || template.moderateThreshold < 0 || template.moderateThreshold > 100 || template.strongThreshold < 0 || template.strongThreshold > 100 || template.strongThreshold <= template.moderateThreshold) {
    errors.push('Strong mastery threshold must be higher than the moderate threshold; both must be within 0–100%.')
  }
  if (!Number.isFinite(template.slowTimeThresholdPct) || template.slowTimeThresholdPct < 0) errors.push('Pacing delay threshold must be zero or greater.')
  if (!template.rubricTiers?.length) errors.push('Add at least one rubric tier.')
  const usedNames = new Set<string>()
  template.rubricTiers.forEach((tier, index) => {
    const label = `Tier ${index + 1}`
    if (!tier.name?.trim()) errors.push(`${label} needs a name.`)
    const name = tier.name?.trim().toLowerCase()
    if (name && usedNames.has(name)) warnings.push(`Multiple rubric tiers are named “${tier.name}”.`)
    if (name) usedNames.add(name)
    if (!Number.isFinite(tier.minScore) || !Number.isFinite(tier.maxScore) || tier.minScore < 0 || tier.maxScore > 100 || tier.minScore > tier.maxScore) errors.push(`${label} has an invalid score range (use 0–100%, minimum ≤ maximum).`)
  })
  if (!errors.some(error => error.includes('invalid score range')) && template.rubricTiers.length > 0) {
    const covered = new Array<boolean>(101).fill(false)
    const overlapping = new Set<number>()
    for (const tier of template.rubricTiers) {
      for (let score = 0; score <= 100; score++) {
        if (score >= tier.minScore && score <= tier.maxScore) {
          if (covered[score]) overlapping.add(score)
          covered[score] = true
        }
      }
    }
    if (overlapping.size) errors.push(`Rubric tiers overlap at ${overlapping.size} whole-number score${overlapping.size === 1 ? '' : 's'} (e.g. ${Math.min(...overlapping)}%). Each score must match one tier.`)
    const uncovered = covered.flatMap((value, index) => value ? [] : [index])
    if (uncovered.length) warnings.push(`${uncovered.length} whole-number score${uncovered.length === 1 ? ' is' : 's are'} not covered by a tier (e.g. ${uncovered[0]}%). The existing report engine will use its fallback classification.`)
  }
  for (const [section, rule] of Object.entries(template.sectionRules || {})) {
    if (!rule) continue
    const ruleValue = String(rule.value ?? '').trim()
    if (ruleValue === '') errors.push(`A display condition for ${section} needs a value.`)
    if (rule.metric !== 'grade' && ruleValue !== '' && !Number.isFinite(Number(ruleValue))) errors.push(`A display condition for ${section} needs a numeric value.`)
  }
  const sections = (['showHeroMetrics', 'showThreeStateDonut', 'showStrongDomains', 'showWeakDomains', 'showTimeAnalysis', 'showTaxonomyTree', 'showErrorPatterns', 'showQuestionSolutions', 'showActionPlan', 'showCourseRecommendations'] as ReportSectionId[])
  if (!sections.some(section => template[section])) warnings.push('Every report section is hidden; the generated report may be nearly empty.')
  return { errors, warnings }
}

export function RubricScorePreview({ tiers }: { tiers: RubricTier[] }) {
  const [score, setScore] = useState(75)
  const matches = tiers.filter(t => score >= t.minScore && score <= t.maxScore)
  const sampleScores = [0, 25, 50, 65, 75, 85, 100]
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-bold text-slate-900">Score-band preview</h4><span className="text-xs text-slate-500">Read-only · Does not create attempts</span></div>
    <p className="mt-1 text-xs leading-5 text-slate-500">Test how a whole-number percentage matches your tiers. Missing matches and overlaps are displayed rather than hidden by the report engine's fallback.</p>
    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
      <label className="flex-1"><span className="mb-2 block text-xs font-bold text-slate-700">Test score: <span className="text-blue-700">{score}%</span></span><input aria-label="Test score percentage" type="range" min={0} max={100} step={1} value={score} onChange={event => setScore(Number(event.target.value))} className="w-full accent-blue-600"/></label>
      <div className={`rounded-xl px-4 py-2 text-sm font-bold sm:max-w-[55%] ${matches.length === 1 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{matches.length === 1 ? matches[0].name : matches.length > 1 ? `${matches.length} overlapping tiers` : 'No matching tier'}</div>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">{sampleScores.map(sample => { const hits = tiers.filter(t => sample >= t.minScore && sample <= t.maxScore); const name = hits.length === 1 ? hits[0].name : hits.length > 1 ? 'Overlap' : 'No matching tier'; return <div key={sample} className={`rounded-xl border px-3 py-3 ${hits.length === 1 ? 'border-slate-200 bg-white' : 'border-amber-200 bg-amber-50'}`}><p className="text-lg font-bold tabular-nums text-slate-900">{sample}%</p><p className="mt-1 text-xs font-medium leading-5 text-slate-600">{name}</p></div> })}</div>
  </div>
}
