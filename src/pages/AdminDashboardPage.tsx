
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  BookOpenText,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileQuestion,
  Layers3,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import AdminLayout from '../components/AdminLayout'
import { useAuth } from '../contexts/AuthContext'
import { dashboardService, type DashboardOverview } from '../lib/dashboardService'

function formatDate(value: string | null): string {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function statusStyle(status: string): string {
  if (status === 'published' || status === 'completed') {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  }
  if (status === 'draft' || status === 'in_progress') {
    return 'bg-amber-50 text-amber-700 ring-amber-200'
  }
  return 'bg-slate-100 text-slate-600 ring-slate-200'
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ring-1 ring-inset ${statusStyle(status)}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function SectionHeader({ title, description, link, linkLabel }: {
  title: string
  description: string
  link?: string
  linkLabel?: string
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-bold tracking-tight text-slate-900">{title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
      </div>
      {link && (
        <Link to={link} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900">
          {linkLabel || 'View all'} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  )
}

function MetricCard({ label, value, icon, tone, detail }: {
  label: string
  value: number
  icon: ReactNode
  tone: string
  detail: string
}) {
  return (
    <div className="ms-dashboard-metric rounded-2xl border bg-white p-5 transition-shadow">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-slate-600">{label}</p>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`} aria-hidden="true">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight tabular-nums text-slate-900">{value.toLocaleString()}</p>
      <p className="mt-1.5 text-xs text-slate-500">{detail}</p>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard statistics" className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-40 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="h-4 w-24 rounded bg-slate-100" />
            <div className="mt-7 h-9 w-16 rounded bg-slate-100" />
            <div className="mt-3 h-3 w-32 rounded bg-slate-100" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="h-72 rounded-2xl border border-slate-200 bg-white" />
        <div className="h-72 rounded-2xl border border-slate-200 bg-white" />
      </div>
      <span className="sr-only">Loading dashboard…</span>
    </div>
  )
}

export default function AdminDashboardPage() {
  const { profile } = useAuth()
  const [overview, setOverview] = useState<DashboardOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setOverview(null)

    dashboardService.loadOverview()
      .then((result) => {
        if (active) setOverview(result)
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Unable to load workspace statistics.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [refreshKey])

  const displayName = profile?.full_name?.trim()?.split(/\s+/)[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <AdminLayout showBackButton={false}>
      <div className="space-y-7 pb-6">
        <div className="ms-dashboard-welcome flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="ms-eyebrow flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-600" aria-hidden="true" />
              Your teaching overview
            </div>
            <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.045em] text-slate-950 sm:text-[38px]">
              {greeting}{displayName ? `, ${displayName}` : ''}
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-slate-500">
              Create assessments and review student progress.
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <button
              type="button"
              onClick={() => setRefreshKey((key) => key + 1)}
              disabled={loading}
              aria-label="Refresh dashboard data"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <Link
              to="/admin/assessments/new"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              New assessment
            </Link>
          </div>
        </div>

        <div className="ms-gradient-hero ms-dashboard-hero relative overflow-hidden rounded-[24px] px-5 py-6 text-white sm:px-9 sm:py-9">
          <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full border-[38px] border-white/[0.045]" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-36 right-36 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" aria-hidden="true" />
          <div className="relative grid min-w-0 items-center gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,.7fr)]">
            <div className="max-w-xl">
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-blue-300/20 bg-blue-400/10 px-3 py-1 text-[11px] font-semibold text-blue-100">
                <Sparkles className="h-3.5 w-3.5" /> TEACHER WORKSPACE
              </div>
              <h2
                className="ms-hero-heading text-[27px] font-semibold leading-[1.16] tracking-[-0.04em] sm:text-[36px]"
                style={{ color: '#ffffff' }}
              >
                Assessments and student progress
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                Create, share, and review assessments in one place.
              </p>
            </div>
            <div className="ms-hero-steps" aria-label="Your teaching workflow">
              <div className="ms-hero-steps-heading">A simple way to get started</div>
              <Link to="/admin/assessments/new" className="ms-hero-step"><span>01</span><span>Build an assessment</span><ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
              <Link to="/admin/assessments" className="ms-hero-step"><span>02</span><span>Preview and share</span><ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
              <a href="#recent-student-attempts" className="ms-hero-step"><span>03</span><span>Review student progress</span><ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a>
            </div>
          </div>
        </div>

        {loading && <DashboardSkeleton />}

        {!loading && error && (
          <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold text-rose-900">We couldn't load the dashboard data</h2>
                <p className="mt-1 text-sm text-rose-800">{error}</p>
                <p className="mt-2 text-xs text-rose-700">Check your connection and try again.</p>
                <button
                  type="button"
                  onClick={() => setRefreshKey((key) => key + 1)}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3.5 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Try again
                </button>
              </div>
            </div>
          </div>
        )}

        {!loading && overview && (
          <>
            <section aria-labelledby="metrics-heading" className="space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="metrics-heading" className="text-base font-bold text-slate-900">At a glance</h2>
                <span className="text-[11px] text-slate-500">Latest totals · updated {new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(overview.loadedAt)}</span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Total assessments" value={overview.totalAssessments} detail="Active library (draft and published)" tone="bg-blue-50 text-blue-700" icon={<ClipboardList className="h-5 w-5" />} />
                <MetricCard label="Published" value={overview.publishedAssessments} detail="Ready to share with students" tone="bg-emerald-50 text-emerald-700" icon={<CheckCircle2 className="h-5 w-5" />} />
                <MetricCard label="Question Bank" value={overview.questionCount} detail="All questions in your organization" tone="bg-violet-50 text-violet-700" icon={<FileQuestion className="h-5 w-5" />} />
                <MetricCard label="Completed attempts" value={overview.completedAttempts} detail="Completed in active assessments" tone="bg-amber-50 text-amber-700" icon={<Activity className="h-5 w-5" />} />
              </div>
            </section>

            <section aria-label="Current assessment activity" className="grid gap-4 sm:grid-cols-3">
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700"><Layers3 className="h-4 w-4" /></span>
                <div><p className="text-xs text-slate-500">Draft assessments</p><p className="text-lg font-bold tabular-nums text-slate-900">{overview.draftAssessments}</p></div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Clock3 className="h-4 w-4" /></span>
                <div><p className="text-xs text-slate-500">In-progress attempts</p><p className="text-lg font-bold tabular-nums text-slate-900">{overview.inProgressAttempts}</p></div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><BookOpenText className="h-4 w-4" /></span>
                <div><p className="text-xs text-slate-500">Archived assessments</p><p className="text-lg font-bold tabular-nums text-slate-900">{overview.archivedAssessments}</p></div>
              </div>
            </section>

            <div className="grid gap-5 xl:grid-cols-2">
              <section className="ms-dashboard-section min-w-0 rounded-2xl border bg-white p-5 sm:p-6" aria-labelledby="recent-assessments-heading">
                <SectionHeader title="Recently updated assessments" description="Latest draft and published assessments." link="/admin/assessments" linkLabel="View all" />
                <div className="mt-5 divide-y divide-slate-100">
                  {overview.recentAssessments.length === 0 ? (
                    <div className="flex flex-col items-center py-10 text-center">
                      <ClipboardList className="h-8 w-8 text-slate-300" />
                      <p className="mt-3 text-sm font-semibold text-slate-800">No assessments yet</p>
                      <p className="mt-1 text-xs text-slate-500">Create an assessment to see it here.</p>
                      <Link to="/admin/assessments/new" className="mt-4 text-xs font-semibold text-blue-700 hover:underline">Create your first assessment</Link>
                    </div>
                  ) : overview.recentAssessments.map((assessment) => (
                    <Link
                      key={assessment.id}
                      to={`/admin/assessments/${assessment.id}`}
                      className="group flex items-center gap-3 py-3.5 transition hover:bg-slate-50/80"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><ClipboardList className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900 group-hover:text-blue-700">{assessment.name}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">Updated {formatDate(assessment.updatedAt)}</p>
                      </div>
                      <StatusPill status={assessment.status} />
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </Link>
                  ))}
                </div>
              </section>

              <section id="recent-student-attempts" className="ms-dashboard-section min-w-0 rounded-2xl border bg-white p-5 sm:p-6" aria-labelledby="recent-attempts-heading">
                <SectionHeader title="Recent student assessments" description="Activity in active assessments" />
                <div className="mt-5 divide-y divide-slate-100">
                  {overview.recentAttempts.length === 0 ? (
                    <div className="flex flex-col items-center py-10 text-center">
                      <Activity className="h-8 w-8 text-slate-300" />
                      <p className="mt-3 text-sm font-semibold text-slate-800">No student assessments yet</p>
                      <p className="mt-1 text-xs text-slate-500">Student activity will appear here once assessments begin.</p>
                    </div>
                  ) : overview.recentAttempts.map((attempt) => (
                    <Link
                      key={attempt.id}
                      to={`/admin/attempts/${attempt.id}`}
                      className="group flex items-center gap-3 py-3.5 transition hover:bg-slate-50/80"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Activity className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900 group-hover:text-blue-700">{attempt.studentName}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">Started {formatDate(attempt.startedAt)}{attempt.status === 'completed' && attempt.percentage !== null ? ` · ${attempt.percentage.toFixed(0)}%` : ''}</p>
                      </div>
                      <StatusPill status={attempt.status} />
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </Link>
                  ))}
                </div>
              </section>
            </div>
          </>
        )}

        <section aria-label="Quick actions" className="space-y-3.5">
          <SectionHeader title="Quick actions" description="Jump straight to the tools you use most." />
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: 'Build an assessment', description: 'Create sections, set rules, and prepare questions.', path: '/admin/assessments/new', icon: <Plus className="h-5 w-5" />, tone: 'bg-blue-50 text-blue-700' },
              { label: 'Manage Question Bank', description: 'Review, organize, and create assessment questions.', path: '/admin/questions', icon: <FileQuestion className="h-5 w-5" />, tone: 'bg-violet-50 text-violet-700' },
              { label: 'Customize reports', description: 'Choose how student reports are presented.', path: '/admin/report-settings', icon: <BookOpenText className="h-5 w-5" />, tone: 'bg-emerald-50 text-emerald-700' },
            ].map((action) => (
              <Link key={action.path} to={action.path} className="ms-quick-action group flex items-start gap-3 rounded-2xl border bg-white p-5 transition">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${action.tone}`}>{action.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-sm font-bold text-slate-900 group-hover:text-blue-700">{action.label}<ArrowUpRight className="h-3.5 w-3.5 shrink-0" /></span>
                  <span className="mt-1 block text-xs leading-relaxed text-slate-500">{action.description}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AdminLayout>
  )
}
