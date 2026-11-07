import { scoreSummaryLines } from '../lib/scoringSchemes'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AlertCircle, ArrowLeft, BarChart3, BookOpen, ChevronDown,
  FileText, GraduationCap, Printer, RefreshCw, Search, ShieldCheck, Target,
} from 'lucide-react'
import AdminLayout from '../components/AdminLayout'
import ContentBlockRenderer from '../components/ContentBlockRenderer'
import type { ReportData, QuestionReviewItem, BreakdownRow } from '../components/Reports/Types'
import { supabase } from '../lib/supabaseClient'
import { difficultyFromSavedQuestions } from '../lib/reportPresentation'

type Tab = 'overview' | 'skills' | 'questions' | 'recommendations'
type QuestionFilter = 'all' | 'correct' | 'incorrect' | 'unanswered'

type AttemptRow = {
  id: string
  assessment_id: string | null
  status: string | null
  student_name: string | null
  student_email: string | null
  started_at: string | null
  completed_at: string | null
  percentage: number | string | null
  correct_count: number | null
  total_questions: number | null
  report_data: ReportData | null
}

type LoadedReport = { data: ReportData; attempt: AttemptRow | null }

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}
function numberText(value: unknown, digits = 0): string {
  const n = finite(value)
  return n === null ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: digits })
}
function percent(value: unknown): string {
  const n = finite(value)
  return n === null ? '—' : `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
}
function dateText(value: string | null | undefined): string {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString()
}
function durationText(value: unknown): string {
  const seconds = finite(value)
  if (seconds === null || seconds < 0) return 'Not recorded'
  const rounded = Math.floor(seconds)
  const minutes = Math.floor(rounded / 60)
  return minutes ? `${minutes}m ${rounded % 60}s` : `${rounded}s`
}
function cleanText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}
function questionState(q: QuestionReviewItem): 'correct' | 'incorrect' | 'unanswered' {
  if (q.status === 'unanswered' || q.is_answered === false) return 'unanswered'
  if (q.status === 'correct' || q.is_correct) return 'correct'
  return 'incorrect'
}
function selectedChoices(q: QuestionReviewItem): Set<string> {
  const answer = q.student_answer || {}
  const chosen = answer.choice_ids ?? answer.selected_choice_ids ?? answer.choice_id
  if (chosen !== null && chosen !== undefined) {
    return new Set((Array.isArray(chosen) ? chosen : [chosen]).map(String))
  }
  // Server-authoritative scoring v1 stores zero-based choice indexes, not choice IDs.
  const rawIndex = answer.choice_idx
  const index = finite(rawIndex)
  if (index !== null && Number.isInteger(index) && index >= 0 && index < (q.choices?.length ?? 0)) {
    return new Set([String(q.choices[index].id)])
  }
  return new Set()
}
function nonChoiceAnswer(q: QuestionReviewItem): string {
  if (questionState(q) === 'unanswered') return 'No response recorded'
  const answer = q.student_answer || {}
  const raw = answer.value ?? answer.text ?? answer.numerical
  return raw === null || raw === undefined || raw === '' ? 'Not recorded' : cleanText(raw)
}
function labelTone(state: 'correct' | 'incorrect' | 'unanswered'): string {
  return state === 'correct'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : state === 'incorrect'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : 'border-slate-200 bg-slate-100 text-slate-600'
}
function CardMetric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
    <p className="text-xs font-semibold text-slate-500">{label}</p>
    <p className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 tabular-nums">{value}</p>
    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{hint}</p>
  </div>
}
function BreakdownCard({ title, subtitle, rows }: { title: string; subtitle: string; rows: BreakdownRow[] }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
    <h3 className="text-sm font-bold text-slate-900">{title}</h3>
    <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
    {rows.length === 0 ? (
      <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">No saved breakdown is available for this category.</div>
    ) : <div className="mt-5 space-y-4">
      {rows.map((row, index) => {
        const score = finite(row.percentage)
        const barWidth = score === null ? 0 : Math.min(100, Math.max(0, score))
        return <div key={`${row.type}-${row.id ?? row.label}-${index}`} className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-800">{row.label}</span>
            <span className="font-bold tabular-nums text-slate-700">{percent(score)} <span className="font-normal text-slate-500">· {numberText(row.correct_count)}/{numberText(row.total_questions)} correct</span></span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="meter" aria-label={`${row.label} score`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={barWidth}>
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${barWidth}%` }} />
          </div>
          <p className="text-[11px] text-slate-500">{numberText(row.points_earned, 2)} / {numberText(row.points_possible, 2)} points</p>
        </div>
      })}
    </div>}
  </section>
}
function QuestionCard({ question, index }: { question: QuestionReviewItem; index: number }) {
  const [open, setOpen] = useState(false)
  const state = questionState(question)
  const choices = Array.isArray(question.choices) ? question.choices : []
  const chosen = selectedChoices(question)
  const isChoiceQuestion = choices.length > 0
  return <article className="break-inside-avoid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
    <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}
      className="flex w-full items-start justify-between gap-4 p-4 text-left hover:bg-slate-50 print:hidden">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-slate-900">Question {index + 1}</span>
          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold capitalize ${labelTone(state)}`}>{state}</span>
          <span className="text-[11px] capitalize text-slate-500">{question.difficulty}</span>
        </div>
        <div className="text-xs text-slate-700"><ContentBlockRenderer blocks={question.content_blocks} /></div>
      </div>
      <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    <div className={`${open ? 'block' : 'hidden'} space-y-4 border-t border-slate-100 p-4 print:block print:border-0`}>
      <div className="hidden items-center gap-2 print:flex">
        <span className="text-sm font-bold">Question {index + 1}</span>
        <span className="text-xs capitalize">· {state}</span>
      </div>
      <div className="hidden print:block"><ContentBlockRenderer blocks={question.content_blocks} /></div>
      <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
        <span className="rounded-lg bg-slate-100 px-2.5 py-1">Points: {numberText(question.points_earned, 2)} / {numberText(question.points_possible, 2)}</span>
        {question.category_name && <span className="rounded-lg bg-slate-100 px-2.5 py-1">{question.category_name}</span>}
        {question.skill_name && <span className="rounded-lg bg-slate-100 px-2.5 py-1">{question.skill_name}</span>}
        {finite(question.time_spent_seconds) !== null && Number(question.time_spent_seconds) > 0 &&
          <span className="rounded-lg bg-slate-100 px-2.5 py-1">Time: {durationText(question.time_spent_seconds)}</span>}
      </div>
      {isChoiceQuestion ? <div className="space-y-2">
        {choices.map((choice, choiceIndex) => {
          const isChosen = chosen.has(String(choice.id))
          const isCorrect = choice.is_correct
          const tone = isCorrect ? 'border-emerald-200 bg-emerald-50/70' : isChosen ? 'border-rose-200 bg-rose-50/70' : 'border-slate-200 bg-slate-50/60'
          return <div key={`${choice.id}-${choiceIndex}`} className={`flex items-start justify-between gap-3 rounded-xl border p-3 ${tone}`}>
            <div className="flex min-w-0 items-start gap-2 text-xs text-slate-800">
              <span className="font-bold">{String.fromCharCode(65 + choiceIndex)}.</span>
              <ContentBlockRenderer blocks={choice.content_blocks} />
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1 text-[10px] font-bold">
              {isCorrect && <span className="text-emerald-700">Correct answer</span>}
              {isChosen && <span className={isCorrect ? 'text-emerald-700' : 'text-rose-700'}>Student selected</span>}
            </div>
          </div>
        })}
        {state === 'unanswered' && <p className="text-xs text-slate-500">Student did not answer this question.</p>}
      </div> : <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] font-bold text-slate-500">Student response</p>
          <p className="mt-1 break-words text-sm font-semibold text-slate-800">{nonChoiceAnswer(question)}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
          <p className="text-[11px] font-bold text-emerald-700">Expected answer</p>
          <p className="mt-1 break-words text-sm font-semibold text-emerald-900">{cleanText(question.correct_answer_data?.value)}</p>
          {finite(question.correct_answer_data?.tolerance) !== null && Number(question.correct_answer_data?.tolerance) > 0 &&
            <p className="mt-1 text-[11px] text-emerald-700">Tolerance: ±{question.correct_answer_data?.tolerance}</p>}
        </div>
      </div>}
      {Array.isArray(question.explanation_blocks) && question.explanation_blocks.length > 0 &&
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-blue-800">Saved explanation</p>
          <ContentBlockRenderer blocks={question.explanation_blocks} />
        </div>}
    </div>
  </article>
}

export default function AdminAttemptDetailPage() {
  const { attemptId } = useParams<{ attemptId: string }>()
  const [loaded, setLoaded] = useState<LoadedReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [tab, setTab] = useState<Tab>('overview')
  const [questionFilter, setQuestionFilter] = useState<QuestionFilter>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!attemptId) {
        setError('No attempt ID was provided.')
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      setLoaded(null)
      try {
        // Query the database first: never trust a stale in-memory attempt cache.
        // Existing Supabase RLS determines which staff can read this row.
        const { data: row, error: queryError } = await supabase
          .from('attempts')
          .select('id, assessment_id, status, student_name, student_email, started_at, completed_at, percentage, correct_count, total_questions, report_data')
          .eq('id', attemptId)
          .maybeSingle()
        if (queryError) throw queryError
        if (cancelled) return
        const attempt = row as AttemptRow | null
        if (attempt && attempt.status !== 'completed') {
          throw new Error('This attempt is not completed. A final diagnostic report is not available yet.')
        }
        if (attempt?.report_data?.student_info && attempt.report_data.overall) {
          setLoaded({ data: attempt.report_data, attempt })
          return
        }
        // Compatibility with installations that expose reports through a staff RPC.
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_admin_attempt_report', { p_attempt_id: attemptId })
        if (cancelled) return
        if (!rpcError && rpcData && typeof rpcData === 'object' && rpcData.student_info && rpcData.overall) {
          setLoaded({ data: rpcData as ReportData, attempt })
          return
        }
        throw new Error(attempt
          ? 'This completed attempt has no readable saved report. Its score was not reconstructed or estimated.'
          : 'This attempt was not found or your account does not have permission to view it.')
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load this report.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [attemptId, reloadKey])

  const report = loaded?.data ?? null
  const breakdowns = useMemo(() => Array.isArray(report?.breakdowns) ? report.breakdowns : [], [report])
  const questions = useMemo(() => Array.isArray(report?.questions) ? report.questions : [], [report])
  const courses = useMemo(() => Array.isArray(report?.courses) ? report.courses : [], [report])
  const visibleQuestions = useMemo(() => questions
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => questionFilter === 'all' || questionState(question) === questionFilter)
    .filter(({ question }) => !search.trim() || [question.category_name, question.skill_name, question.lesson_name, question.difficulty, question.question_id]
      .some(value => String(value ?? '').toLowerCase().includes(search.toLowerCase().trim()))), [questions, questionFilter, search])

  if (loading) return <AdminLayout title="Student report"><div className="mx-auto max-w-5xl space-y-4" role="status">
    <div className="h-24 animate-pulse rounded-2xl bg-slate-200/70" />
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map(item => <div key={item} className="h-28 animate-pulse rounded-2xl bg-slate-200/70" />)}</div>
    <p className="text-center text-xs text-slate-500">Loading saved student results...</p>
  </div></AdminLayout>

  if (!report || error) return <AdminLayout title="Student report">
    <div className="mx-auto max-w-lg rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-xs" role="alert">
      <AlertCircle className="mx-auto h-9 w-9 text-rose-500" />
      <h2 className="mt-3 text-base font-bold text-slate-900">Report unavailable</h2>
      <p className="mt-2 text-sm text-slate-600">{error || 'The report could not be loaded.'}</p>
      <div className="mt-5 flex justify-center gap-2">
        <Link to="/admin/assessments" className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700">Assessments</Link>
        <button type="button" onClick={() => setReloadKey(key => key + 1)} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white">Try again</button>
      </div>
    </div>
  </AdminLayout>

  const info = report.student_info
  const overall = report.overall
  const registration = info?.registration_responses && typeof info.registration_responses === 'object' ? info.registration_responses : {}
  const studentName = (typeof registration.full_name === 'string' && registration.full_name.trim()) || loaded?.attempt?.student_name?.trim() || cleanText(registration.name || 'Student')
  const assessmentId = loaded?.attempt?.assessment_id
  const score = loaded?.attempt?.percentage !== null && loaded?.attempt?.percentage !== undefined
    ? loaded?.attempt?.percentage : overall.percentage
  const savedScore = finite(overall.percentage)
  const rowScore = finite(loaded?.attempt?.percentage)
  const mismatch = rowScore !== null && savedScore !== null && Math.abs(rowScore - savedScore) > 0.01
  const total = finite(overall.total_questions)
  const correct = finite(overall.correct_count)
  const unanswered = finite(overall.unanswered_count)
  const incorrect = total !== null && correct !== null
    ? Math.max(0, total - correct - (unanswered ?? 0)) : finite(overall.incorrect_count)
  const categories = breakdowns.filter(row => row.type === 'category' || row.type === 'module')
  const skills = breakdowns.filter(row => row.type === 'skill' || row.type === 'lesson' || row.type === 'chapter')
  const storedDifficulties = breakdowns.filter(row => row.type === 'difficulty')
  const difficulties = storedDifficulties.length ? storedDifficulties : difficultyFromSavedQuestions(questions)
  const difficultyIsDerived = storedDifficulties.length === 0 && difficulties.length > 0
  const version = (info as typeof info & { assessment_version?: number }).assessment_version
  const tabs: { key: Tab; label: string; icon: typeof BarChart3 }[] = [
    { key: 'overview', label: 'Overview', icon: BarChart3 },
    { key: 'skills', label: 'Skills & domains', icon: Target },
    { key: 'questions', label: `Question review (${questions.length})`, icon: BookOpen },
    { key: 'recommendations', label: 'Next steps', icon: GraduationCap },
  ]

  return <AdminLayout title="Student diagnostic report" subtitle={info.assessment_name || 'Assessment results'}
    actions={<div className="flex flex-wrap gap-2 print:hidden">
      <Link to={assessmentId ? `/admin/assessments/${assessmentId}/results` : '/admin/assessments'} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /> Back to results</Link>
      <button type="button" onClick={() => setReloadKey(key => key + 1)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /> Refresh</button>
      <Link to={`/report/${attemptId}`} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-700" style={{ color: '#ffffff' }}><FileText className="h-4 w-4" /> View student report</Link>
      <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><Printer className="h-4 w-4" /> Print staff details</button>
    </div>}>
    <div className="mx-auto max-w-6xl space-y-5 pb-10 print:max-w-none print:space-y-4">
      <section className="rounded-3xl bg-slate-900 p-5 text-white shadow-xs sm:p-7 print:rounded-none print:bg-white print:p-0 print:text-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold text-slate-300 print:text-slate-500"><ShieldCheck className="h-4 w-4" /> Saved diagnostic result</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-white print:text-slate-900">{studentName}</h2>
            <p className="mt-1 text-sm text-slate-300 print:text-slate-600">{info.assessment_name}</p>
            <p className="mt-2 text-xs text-slate-400 print:text-slate-500">Completed: {dateText(info.completed_at || loaded?.attempt?.completed_at)}{version !== undefined && version !== null ? ` · Assessment version ${version}` : ''}</p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-right print:border-slate-200 print:bg-white">
            <p className="text-[11px] font-semibold text-slate-200 print:text-slate-500">Final score</p>
            <p className="mt-1 text-4xl font-extrabold tabular-nums text-white print:text-slate-900">{percent(score)}</p>
            <p className="mt-1 text-xs text-slate-200 print:text-slate-500">{numberText(overall.points_earned, 2)} / {numberText(overall.points_possible, 2)} points</p>
          </div>
        </div>
      </section>

      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-900 print:hidden">
        This is the staff-only saved-data detail view. To see the exact student-facing report layout, including its configured sections and personalized plan when available, select <Link to={`/report/${attemptId}`} className="font-bold underline">View student report</Link>. Both views use the saved result of this attempt; neither regrades it.
      </div>

      {mismatch && <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
        <AlertCircle className="h-4 w-4 shrink-0" /><span><strong>Data integrity warning:</strong> The saved attempt score ({percent(rowScore)}) differs from the stored report score ({percent(savedScore)}). The header displays the attempt's saved score. Review the underlying record before sharing this report.</span>
      </div>}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CardMetric label="Correct answers" value={numberText(correct)} hint={`${numberText(total)} total questions`} />
        <CardMetric label="Incorrect answers" value={numberText(incorrect)} hint={unanswered !== null ? `${numberText(unanswered)} unanswered separately` : 'Includes unanswered if not separately recorded'} />
        <CardMetric label="Time elapsed" value={durationText(info.total_time_seconds)} hint="Elapsed attempt duration" />
        <CardMetric label="Evaluation level" value={overall.level?.name || 'Not assigned'} hint={overall.level ? 'Saved evaluation profile' : 'No level stored in this report'} />
      </section>

      {report.scoring && <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <h3 className="text-sm font-bold text-slate-900">Saved raw and scaled scoring</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{scoreSummaryLines(report.scoring).map((line,i)=><p key={i} className="rounded-lg bg-white p-3 text-xs text-slate-700">{line}</p>)}</div>
      </section>}

      {Object.keys(registration).length > 0 && <details className="rounded-2xl border border-slate-200 bg-white px-5 py-4 print:hidden">
        <summary className="cursor-pointer text-xs font-bold text-slate-800">Student registration details</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {Object.entries(registration).map(([key, value]) => <div key={key} className="rounded-lg bg-slate-50 px-3 py-2 text-xs"><span className="font-semibold capitalize text-slate-600">{key.replace(/_/g, ' ')}:</span> <span className="break-words text-slate-800">{cleanText(value)}</span></div>)}
        </div>
      </details>}

      <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 print:hidden" aria-label="Report sections">
        {tabs.map(item => <button key={item.key} type="button" onClick={() => setTab(item.key)} aria-current={tab === item.key ? 'page' : undefined}
          className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${tab === item.key ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          style={tab === item.key ? { color: '#ffffff' } : undefined}><item.icon className="h-4 w-4" />{item.label}</button>)}
      </nav>

      <div className={tab === 'overview' ? 'space-y-4' : 'hidden space-y-4 print:block'}>
        <div className="grid gap-4 lg:grid-cols-2">
          <BreakdownCard title="Performance by domain" subtitle="Saved assessment taxonomy results; no inferred mastery data." rows={categories} />
          <BreakdownCard title="Performance by difficulty" subtitle={difficultyIsDerived ? 'Calculated from saved question results for display only; not a stored scoring breakdown.' : 'Only difficulty breakdowns stored in this report are shown.'} rows={difficulties} />
        </div>
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Saved question evidence</h3>
              <p className="mt-1 text-xs text-slate-600">The saved report contains {questions.length} question review{questions.length === 1 ? '' : 's'}. These details are available even when no evaluation level was assigned.</p>
            </div>
            <button type="button" onClick={() => setTab('questions')} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">Open full question review</button>
          </div>
          {questions.length ? <div className="mt-4 space-y-2">
            {questions.map((question, index) => <div key={`${question.question_id}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <span className="font-semibold text-slate-800">Question {index + 1} · {question.category_name || 'Uncategorized'} · {question.difficulty || 'Unspecified difficulty'}</span>
              <span className="font-bold text-slate-700">{questionState(question)} · {numberText(question.points_earned, 2)}/{numberText(question.points_possible, 2)} points</span>
            </div>)}
          </div> : <p className="mt-3 text-xs text-amber-700">Question details were not saved for this attempt.</p>}
          {!overall.level && <p className="mt-3 text-xs text-amber-800">No evaluation level was stored by the scoring service. Configure and persist evaluation profiles for future attempts; this report will not invent one.</p>}
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-bold text-slate-900">Assessment summary</h3>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">This report reflects the saved result of one student attempt. Scores are based on the assessment version used by that student. Missing classifications, timings, and recommendations are not estimated.</p>
          {overall.level?.description && <p className="mt-3 rounded-xl bg-blue-50 p-3 text-xs leading-relaxed text-blue-900">{overall.level.description}</p>}
        </section>
      </div>

      <div className={tab === 'skills' ? 'space-y-4' : 'hidden space-y-4 print:block'}>
        <BreakdownCard title="Skill mastery" subtitle="Recorded skills, lessons, and chapters for this attempt." rows={skills} />
        {breakdowns.length === 0 && <p className="text-xs text-slate-500">This report has no saved taxonomy breakdowns.</p>}
      </div>

      <div className={tab === 'questions' ? 'space-y-4' : 'hidden space-y-4 print:block'}>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 print:hidden">
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'correct', 'incorrect', 'unanswered'] as const).map(filter => <button key={filter} type="button" onClick={() => setQuestionFilter(filter)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${questionFilter === filter ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              style={questionFilter === filter ? { color: '#ffffff' } : undefined}>{filter}</button>)}
          </div>
          <label className="relative flex w-full max-w-xs items-center"><Search className="absolute left-3 h-4 w-4 text-slate-400" /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search category, skill, question ID" className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-900" /></label>
        </div>
        <p className="text-xs text-slate-500 print:hidden">Showing {visibleQuestions.length} of {questions.length} saved question reviews. Open a question to see its recorded answer and points.</p>
        {questions.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-xs text-slate-500">No question-by-question review was saved for this attempt.</div>
          : visibleQuestions.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-xs text-slate-500">No questions match the selected filters.</div>
          : <div className="space-y-3 print:hidden">{visibleQuestions.map(({ question, index }) => <QuestionCard key={`${question.question_id}-${index}`} question={question} index={index} />)}</div>}
        {/* Print the full saved question review in original order, regardless of UI filters. */}
        <div className="hidden space-y-3 print:block">{questions.map((question, index) => <QuestionCard key={`print-${question.question_id}-${index}`} question={question} index={index} />)}</div>
      </div>

      <div className={tab === 'recommendations' ? 'space-y-4' : 'hidden space-y-4 print:block'}>
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2"><Target className="h-4 w-4 text-blue-600" /><h3 className="text-sm font-bold text-slate-900">Saved recommendations</h3></div>
          {overall.level?.recommendation ? <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-relaxed text-slate-800">{overall.level.recommendation}</p>
            : <p className="mt-3 text-xs text-slate-500">No personalized recommendation was saved with this attempt. The report does not generate one automatically.</p>}
        </section>
        {courses.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-bold text-slate-900">Saved learning resources</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">{courses.map(course => <div key={course.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h4 className="text-sm font-bold text-slate-800">{course.name}</h4>
            {course.description && <p className="mt-1 text-xs leading-relaxed text-slate-600">{course.description}</p>}
            {course.registration_url && <a href={course.registration_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-semibold text-blue-700 underline print:hidden">View resource</a>}
          </div>)}</div>
        </section>}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4 text-[11px] text-slate-500">
        <FileText className="h-4 w-4" /><span>Attempt ID: {attemptId}</span>
        <span>·</span><span>Saved score and details only</span>
        <span>·</span><span>Read-only staff report</span>
      </footer>
    </div>
  </AdminLayout>
}
