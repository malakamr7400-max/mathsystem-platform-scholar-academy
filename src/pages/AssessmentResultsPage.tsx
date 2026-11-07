import { benchmarkScore, benchmarkLabel, resolvePassingBenchmark } from '../lib/passingBenchmark'
import type { SavedScoringResult } from '../lib/scoringSchemes'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  RefreshCw,
  Search,
  Share2,
  Trash2,
  Users,
} from 'lucide-react'
import AdminLayout from '../components/AdminLayout'
import ShareAssessmentModal from '../components/ShareAssessmentModal'
import { assessmentService, type Assessment } from '../lib/assessmentService'
import { attemptService } from '../lib/attemptService'
import { supabase } from '../lib/supabaseClient'
import { buildAssessmentStatisticsXlsx } from '../lib/assessmentStatisticsExcel'

type AttemptStatus = 'completed' | 'in_progress' | 'abandoned' | 'unknown'
type StatusFilter = 'all' | AttemptStatus
type ScoreFilter = 'all' | 'mastered' | 'proficient' | 'developing' | 'support' | 'unscored'
type SortOption = 'recent' | 'oldest' | 'highest' | 'lowest' | 'name'

interface ResultRow {
  id: string
  status: AttemptStatus
  studentName: string
  studentEmail: string
  startedAt: string | null
  completedAt: string | null
  percentage: number | null
  benchmarkScore: number | null
  correctCount: number | null
  totalQuestions: number | null
  levelName: string | null
}

interface DatabaseAttemptRow {
  id: string
  status: string | null
  student_name: string | null
  student_email: string | null
  started_at: string | null
  completed_at: string | null
  percentage: number | string | null
  correct_count: number | string | null
  total_questions: number | string | null
  level_name: string | null
  report_data: {
    scoring?: SavedScoringResult
    student_info?: {
      registration_responses?: Record<string, unknown>
    }
  } | null
}

const PAGE_SIZE = 12
const FETCH_BATCH_SIZE = 500

function readStatus(value: string | null): AttemptStatus {
  if (value === 'completed' || value === 'in_progress' || value === 'abandoned') return value
  return 'unknown'
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function scoreFor(row: DatabaseAttemptRow): number | null {
  if (row.status !== 'completed') return null
  const value = finiteNumber(row.percentage)
  return value !== null && value >= 0 && value <= 100 ? value : null
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatPercent(value: number | null, digits = 1): string {
  return value === null ? '—' : `${value.toFixed(digits).replace(/\.0$/, '')}%`
}

function safeCsvCell(value: string | number | null): string {
  let text = value === null ? '' : String(value)
  // Prevent spreadsheet formula injection from user-provided names/emails.
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

function statusText(status: AttemptStatus): string {
  switch (status) {
    case 'completed': return 'Completed'
    case 'in_progress': return 'In progress'
    case 'abandoned': return 'Abandoned'
    default: return 'Unknown'
  }
}

function scoreBand(score: number | null): ScoreFilter {
  if (score === null) return 'unscored'
  if (score >= 85) return 'mastered'
  if (score >= 70) return 'proficient'
  if (score >= 55) return 'developing'
  return 'support'
}

function timeNumber(value: string | null): number {
  if (!value) return 0
  const number = new Date(value).getTime()
  return Number.isFinite(number) ? number : 0
}

function SummaryCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string
  value: string
  description: string
  icon: typeof Users
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-slate-500">{label}</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">{value}</div>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
    </div>
  )
}

export default function AssessmentResultsPage() {
  const { assessmentId } = useParams<{ assessmentId: string }>()
  const requestId = useRef(0)
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [attempts, setAttempts] = useState<ResultRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('all')
  const [sort, setSort] = useState<SortOption>('recent')
  const [page, setPage] = useState(1)
  const [pendingDelete, setPendingDelete] = useState<ResultRow | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current
    if (!assessmentId) {
      setLoading(false)
      setError('Missing assessment identifier.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const [allAssessments, allRows] = await Promise.all([
        assessmentService.fetchAssessmentsFromDatabase(),
        (async (): Promise<DatabaseAttemptRow[]> => {
          const rows: DatabaseAttemptRow[] = []
          for (let start = 0; ; start += FETCH_BATCH_SIZE) {
            // Deterministic ordering prevents tied timestamps from moving across pages.
            const { data, error: queryError } = await supabase
              .from('attempts')
              .select('id, status, student_name, student_email, started_at, completed_at, percentage, correct_count, total_questions, level_name, report_data')
              .eq('assessment_id', assessmentId)
              .order('started_at', { ascending: false })
              .order('id', { ascending: false })
              .range(start, start + FETCH_BATCH_SIZE - 1)
            if (queryError) throw queryError
            const batch = (data ?? []) as DatabaseAttemptRow[]
            rows.push(...batch)
            if (batch.length < FETCH_BATCH_SIZE) break
          }
          return rows
        })(),
      ])

      const selected = allAssessments.find((item) => item.id === assessmentId)
      if (!selected) throw new Error('This assessment was not found or you do not have access to it.')

      const mapped: ResultRow[] = allRows.map((row) => {
        const registration = row.report_data?.student_info?.registration_responses
        const registeredName = registration?.full_name ?? registration?.name ?? registration?.student_name
        const name = row.student_name?.trim() ||
          (typeof registeredName === 'string' ? registeredName.trim() : '') ||
          'Unnamed student'
        return {
          id: String(row.id),
          status: readStatus(row.status),
          studentName: name,
          studentEmail: row.student_email?.trim() || '',
          startedAt: row.started_at,
          completedAt: row.completed_at,
          percentage: scoreFor(row),
          benchmarkScore: row.status === 'completed' ? benchmarkScore(selected.settings.scoring?.scheme ?? 'standard', scoreFor(row), row.report_data?.scoring ?? null) : null,
          correctCount: row.status === 'completed' ? finiteNumber(row.correct_count) : null,
          totalQuestions: row.status === 'completed' ? finiteNumber(row.total_questions) : null,
          levelName: row.status === 'completed' ? (row.level_name?.trim() || null) : null,
        }
      })

      if (currentRequest !== requestId.current) return
      setAssessment(selected)
      setAttempts(mapped)
      setLastUpdated(new Date())
    } catch (caught) {
      if (currentRequest !== requestId.current) return
      setAssessment(null)
      setAttempts([])
      setError(caught instanceof Error ? caught.message : 'Unable to load saved results. Please try again.')
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [assessmentId])

  useEffect(() => {
    void load()
    return () => { requestId.current += 1 }
  }, [load])

  const benchmark = useMemo(() => resolvePassingBenchmark(assessment?.settings), [assessment])
  const scoreScheme = assessment?.settings.scoring?.scheme ?? 'standard'
  const comparable = (row: ResultRow) => row.status === 'completed' && row.benchmarkScore !== null

  const stats = useMemo(() => {
    const completed = attempts.filter((row) => row.status === 'completed')
    const scored = completed.filter((row) => row.percentage !== null)
    const scores = scored.map((row) => row.percentage as number)
    const average = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null
    const eligible = attempts.filter(comparable)
    const passRate = eligible.length && benchmark !== null
      ? (eligible.filter((row) => row.benchmarkScore! >= benchmark.value).length / eligible.length) * 100
      : null
    const distribution = {
      mastered: scores.filter((score) => score >= 85).length,
      proficient: scores.filter((score) => score >= 70 && score < 85).length,
      developing: scores.filter((score) => score >= 55 && score < 70).length,
      support: scores.filter((score) => score < 55).length,
    }
    return {
      total: attempts.length,
      completed: completed.length,
      inProgress: attempts.filter((row) => row.status === 'in_progress').length,
      abandoned: attempts.filter((row) => row.status === 'abandoned').length,
      scored: scores.length,
      average,
      passRate,
      distribution,
    }
  }, [attempts, benchmark])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const rows = attempts.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (scoreFilter !== 'all' && scoreBand(row.percentage) !== scoreFilter) return false
      if (query && !`${row.studentName} ${row.studentEmail} ${row.id}`.toLowerCase().includes(query)) return false
      return true
    })
    return rows.sort((a, b) => {
      switch (sort) {
        case 'oldest': return timeNumber(a.startedAt) - timeNumber(b.startedAt)
        case 'highest': return (b.percentage ?? -1) - (a.percentage ?? -1)
        case 'lowest': return (a.percentage ?? Number.POSITIVE_INFINITY) - (b.percentage ?? Number.POSITIVE_INFINITY)
        case 'name': return a.studentName.localeCompare(b.studentName)
        default: return timeNumber(b.startedAt) - timeNumber(a.startedAt)
      }
    })
  }, [attempts, search, statusFilter, scoreFilter, sort])

  useEffect(() => { setPage(1) }, [search, statusFilter, scoreFilter, sort])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  async function deleteSubmission() {
    if (!assessmentId || !pendingDelete || deletingId || deleteConfirmation !== 'DELETE') return
    const target = pendingDelete
    setDeletingId(target.id)
    setDeleteError(null)
    setDeleteNotice(null)
    try {
      // The database must enforce staff-only deletion via RLS or an authorized RPC.
      // The browser confirmation is a safety step, never an authorization boundary.
      await attemptService.deleteAttempt(target.id)
      // Keep the results workspace mounted: all statistics, filters and page
      // counts derive from `attempts` and update without a full results reload.
      setAttempts((previous) => previous.filter((attempt) => attempt.id !== target.id))
      setPendingDelete(null)
      setDeleteConfirmation('')
      setDeleteNotice(`Submission for ${target.studentName} was deleted.`)
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : 'Could not delete the submission.')
    } finally {
      setDeletingId(null)
    }
  }

  function openDelete(row: ResultRow) {
    setPendingDelete(row)
    setDeleteConfirmation('')
    setDeleteError(null)
    setDeleteNotice(null)
  }

  function exportCsv() {
    if (!assessment || filtered.length === 0) return
    const headers = ['Student name', 'Student email', 'Status', 'Score (%)', 'Correct answers', 'Total questions', 'Evaluation level', 'Started at', 'Completed at', 'Attempt ID']
    const records = filtered.map((row) => [
      row.studentName,
      row.studentEmail,
      statusText(row.status),
      row.percentage,
      row.correctCount,
      row.totalQuestions,
      row.levelName ?? '',
      row.startedAt ?? '',
      row.completedAt ?? '',
      row.id,
    ])
    const csv = '\uFEFF' + [headers, ...records].map((record) => record.map((value) => safeCsvCell(value)).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    const safeName = assessment.title.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 60) || 'assessment'
    anchor.download = `${safeName}_student_results.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function exportExcel() {
    if (!assessment || filtered.length === 0) return
    setExportError(null)
    try {
      const workbook = buildAssessmentStatisticsXlsx(assessment.title, filtered, benchmark)
      const blob = new Blob([new Uint8Array(workbook)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      const safeName = assessment.title.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 60) || 'assessment'
      anchor.download = `${safeName}_submission_statistics.xlsx`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (caught) {
      setExportError(caught instanceof Error ? `Excel export failed: ${caught.message}` : 'Excel export failed. Please try again.')
    }
  }

  return (
    <AdminLayout
      title={assessment ? `${assessment.title} — Results` : 'Assessment Results'}
      subtitle="Student progress and assessment performance"
      showBackButton
      backButtonPath="/admin/assessments"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
          </button>
          {assessment && (
            <>
              <button type="button" onClick={() => setShareOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <Share2 className="h-4 w-4" aria-hidden="true" /> Share
              </button>
              <Link to={`/admin/assessments/${assessment.id}`} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
                Edit assessment <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-5 pb-10">
        {exportError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{exportError}</div>}
        {deleteNotice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{deleteNotice}</div>}
        {error && (
          <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-sm text-rose-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span><strong>Results could not be loaded.</strong> {error}</span>
            </div>
            <button type="button" onClick={() => void load()} className="self-start rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100">Try again</button>
          </div>
        )}

        {loading ? (
          <div role="status" aria-live="polite" className="rounded-2xl border border-slate-200 bg-white px-6 py-20 text-center">
            <RefreshCw className="mx-auto h-7 w-7 animate-spin text-blue-600" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-slate-700">Loading student results…</p>
          </div>
        ) : assessment && !error ? (
          <>
            {lastUpdated && <p className="text-right text-xs text-slate-500">Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard label="Students assessed" value={stats.total.toLocaleString()} description="Student attempts" icon={Users} />
              <SummaryCard label="Completed" value={stats.completed.toLocaleString()} description={`${stats.inProgress} in progress · ${stats.abandoned} abandoned`} icon={CheckCircle2} />
              <SummaryCard label="Average score" value={formatPercent(stats.average)} description={stats.scored ? `Based on ${stats.scored} completed scores` : 'No scores yet'} icon={BarChart3} />
              <SummaryCard label="Meeting pass mark" value={formatPercent(stats.passRate)} description={benchmark !== null ? `Pass mark: ${benchmarkLabel(benchmark, scoreScheme)} · eligible completed submissions` : 'Set benchmark in assessment settings'} icon={Clock3} />
            </div>

            <section aria-labelledby="distribution-heading" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 id="distribution-heading" className="text-sm font-bold text-slate-900">Completed score distribution</h2>
                  <p className="mt-1 text-xs text-slate-500">How completed students performed across score ranges.</p>
                </div>
                {stats.completed > stats.scored && <span className="text-xs text-amber-700">{stats.completed - stats.scored} completed attempts have no usable score</span>}
              </div>
              {stats.scored === 0 ? (
                <p className="mt-5 rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">Score insights will appear when students complete this assessment.</p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {([
                    { key: 'mastered', label: '85–100%', color: 'bg-emerald-500' },
                    { key: 'proficient', label: '70–84%', color: 'bg-blue-500' },
                    { key: 'developing', label: '55–69%', color: 'bg-amber-500' },
                    { key: 'support', label: 'Below 55%', color: 'bg-rose-500' },
                  ] as const).map((band) => {
                    const count = stats.distribution[band.key]
                    const fraction = (count / stats.scored) * 100
                    return (
                      <div key={band.key} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                        <div className="flex items-center justify-between gap-2 text-xs"><span className="font-semibold text-slate-600">{band.label}</span><span className="font-bold text-slate-900 tabular-nums">{count}</span></div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label={`${band.label} score band`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction)}>
                          <div className={`h-full rounded-full ${band.color}`} style={{ width: `${fraction}%` }} />
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">{formatPercent(fraction)} of scored results</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            <section aria-labelledby="records-heading" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 id="records-heading" className="text-base font-bold text-slate-900">Student records</h2>
                    <p className="mt-1 text-xs text-slate-500">Find a student and open their assessment report.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={exportExcel} disabled={filtered.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                      <Download className="h-4 w-4" aria-hidden="true" /> Export Excel (.xlsx)
                    </button>
                    <button type="button" onClick={exportCsv} disabled={filtered.length === 0} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                      <Download className="h-4 w-4" aria-hidden="true" /> CSV
                    </button>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="relative block lg:col-span-1">
                    <span className="sr-only">Search by student name, email, or record ID</span>
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search students…" className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                  </label>
                  <label className="block">
                    <span className="sr-only">Filter by attempt status</span>
                    <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100">
                      <option value="all">All statuses</option><option value="completed">Completed</option><option value="in_progress">In progress</option><option value="abandoned">Abandoned</option><option value="unknown">Unknown</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="sr-only">Filter by score band</span>
                    <select value={scoreFilter} onChange={(event) => setScoreFilter(event.target.value as ScoreFilter)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100">
                      <option value="all">All scores</option><option value="mastered">85–100%</option><option value="proficient">70–84%</option><option value="developing">55–69%</option><option value="support">Below 55%</option><option value="unscored">Not scored</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="sr-only">Sort student records</span>
                    <select value={sort} onChange={(event) => setSort(event.target.value as SortOption)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100">
                      <option value="recent">Newest first</option><option value="oldest">Oldest first</option><option value="highest">Highest score</option><option value="lowest">Lowest score</option><option value="name">Student name A–Z</option>
                    </select>
                  </label>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span aria-live="polite">{filtered.length} of {attempts.length} student records</span>
                  {(search || statusFilter !== 'all' || scoreFilter !== 'all') && (
                    <button type="button" onClick={() => { setSearch(''); setStatusFilter('all'); setScoreFilter('all') }} className="font-semibold text-blue-700 hover:underline">Clear filters</button>
                  )}
                </div>
              </div>

              {attempts.length === 0 ? (
                <div className="px-5 py-14 text-center">
                  <Users className="mx-auto h-9 w-9 text-slate-300" aria-hidden="true" />
                  <h3 className="mt-3 text-sm font-bold text-slate-900">No student results yet</h3>
                  <p className="mx-auto mt-1 max-w-lg text-xs leading-relaxed text-slate-500">Share the assessment link with students to see their results here.</p>
                  <button type="button" onClick={() => setShareOpen(true)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"><Share2 className="h-4 w-4" aria-hidden="true" /> Share student link</button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <Search className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
                  <p className="mt-3 text-sm font-semibold text-slate-800">No records match these filters</p>
                  <p className="mt-1 text-xs text-slate-500">Try another search term, status or score range.</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left text-xs">
                      <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                        <tr><th scope="col" className="px-5 py-3 font-semibold">Student</th><th scope="col" className="px-4 py-3 font-semibold">Status</th><th scope="col" className="px-4 py-3 font-semibold">Score</th><th scope="col" className="px-4 py-3 font-semibold">Correct</th><th scope="col" className="px-4 py-3 font-semibold">Evaluation</th><th scope="col" className="px-4 py-3 font-semibold">Completed</th><th scope="col" className="px-5 py-3 text-right font-semibold">Action</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visible.map((row) => (
                          <tr key={row.id} className="hover:bg-slate-50/70">
                            <td className="max-w-[260px] px-5 py-3.5"><span className="block truncate font-semibold text-slate-900" title={row.studentName}>{row.studentName}</span><span className="mt-0.5 block truncate text-[11px] text-slate-500" title={row.studentEmail}>{row.studentEmail || `Attempt ${row.id.slice(0, 8)}`}</span></td>
                            <td className="px-4 py-3.5"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${row.status === 'completed' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : row.status === 'in_progress' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>{statusText(row.status)}</span></td>
                            <td className="px-4 py-3.5 font-bold tabular-nums text-slate-900">{formatPercent(row.percentage)}</td>
                            <td className="px-4 py-3.5 tabular-nums text-slate-600">{row.correctCount !== null && row.totalQuestions !== null ? `${row.correctCount}/${row.totalQuestions}` : '—'}</td>
                            <td className="max-w-[160px] truncate px-4 py-3.5 text-slate-600" title={row.levelName ?? ''}>{row.levelName ?? '—'}</td>
                            <td className="whitespace-nowrap px-4 py-3.5 text-slate-500">{formatDate(row.completedAt)}</td>
                            <td className="px-5 py-3.5 text-right"><div className="flex flex-wrap items-center justify-end gap-2">{row.status === 'completed' ? <>
                              <Link to={`/report/${row.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 font-semibold text-white hover:bg-blue-700" title="Open student report"><FileText className="h-3.5 w-3.5" aria-hidden="true" /> View report</Link>
                              <Link to={`/admin/attempts/${row.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">Details</Link>
                            </> : null}
                              <button type="button" onClick={() => openDelete(row)} disabled={deletingId !== null} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50" aria-label={`Delete submission for ${row.studentName}`}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete</button>
                            </div></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                    <span>Rows {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
                    <div className="flex items-center gap-2">
                      <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">Previous</button>
                      <span className="px-1 font-semibold text-slate-600" aria-live="polite">Page {currentPage} of {totalPages}</span>
                      <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">Next</button>
                    </div>
                  </div>
                </>
              )}
            </section>

            <p className="text-xs leading-relaxed text-slate-500">Exported results contain student information. Share them securely.</p>
          </>
        ) : null}
      </div>

      {pendingDelete && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 px-4 py-8" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deletingId) setPendingDelete(null) }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-submission-title" aria-describedby="delete-submission-description" className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-rose-50 p-2 text-rose-700"><Trash2 className="h-5 w-5" aria-hidden="true" /></span>
              <div>
                <h2 id="delete-submission-title" className="text-lg font-bold text-slate-900">Delete student submission?</h2>
                <p id="delete-submission-description" className="mt-2 text-sm leading-relaxed text-slate-600">This permanently removes the saved attempt, its answers and associated report. The student report link will stop working. This cannot be undone.</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-semibold">{pendingDelete.studentName}</p>
              <p className="mt-1 text-xs text-slate-500">{pendingDelete.studentEmail || 'No email'} · {statusText(pendingDelete.status)}</p>
              <p className="mt-1 font-mono text-[11px] text-slate-500">Submission ID: {pendingDelete.id}</p>
            </div>
            <label htmlFor="delete-submission-confirmation" className="mt-4 block text-sm font-medium text-slate-800">Type <strong>DELETE</strong> to confirm</label>
            <input id="delete-submission-confirmation" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} disabled={deletingId !== null} autoComplete="off" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100" />
            {deleteError && <p role="alert" className="mt-3 text-sm text-rose-700">Deletion failed: {deleteError}</p>}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setPendingDelete(null)} disabled={deletingId !== null} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => void deleteSubmission()} disabled={deleteConfirmation !== 'DELETE' || deletingId !== null} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="h-4 w-4" aria-hidden="true" />{deletingId ? 'Deleting…' : 'Permanently delete'}</button>
            </div>
          </div>
        </div>
      )}

      {shareOpen && assessment && (
        <ShareAssessmentModal assessmentId={assessment.id} assessmentName={assessment.title} isOpen onClose={() => setShareOpen(false)} />
      )}
    </AdminLayout>
  )
}
