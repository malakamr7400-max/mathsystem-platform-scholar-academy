
import { assessmentService } from './assessmentService'
import { supabase } from './supabaseClient'

/**
 * Read-only workspace overview. All queries are scoped to the authenticated
 * staff member's organization; existing Supabase RLS is also enforced.
 * This service never creates or changes student attempts or assessment data.
 */
export interface DashboardAssessment {
  id: string
  name: string
  status: string
  updatedAt: string | null
}

export interface DashboardAttempt {
  id: string
  assessmentId: string
  studentName: string
  status: string
  startedAt: string | null
  percentage: number | null
}
interface AssessmentRow {
  id: string
  name: string | null
  status: string | null
  updated_at: string | null
}

interface AttemptRow {
  id: string
  assessment_id: string
  student_name: string | null
  status: string | null
  started_at: string | null
  percentage: number | null
}
export interface DashboardOverview {
  totalAssessments: number
  publishedAssessments: number
  draftAssessments: number
  archivedAssessments: number
  questionCount: number
  completedAttempts: number
  inProgressAttempts: number
  recentAssessments: DashboardAssessment[]
  recentAttempts: DashboardAttempt[]
  loadedAt: Date
}

function verifiedCount(
  result: { count: number | null; error: { message: string } | null },
  label: string,
): number {
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
  if (result.count === null) {
    throw new Error(`${label}: Supabase did not return a verified count.`)
  }
  return result.count
}

/** Assessment rows as returned by the dashboard's organization-scoped query. */
interface DashboardAssessmentDatabaseRow {
  id: string
  name: string | null
  status: string | null
  updated_at: string | null
  payload: { removedFromLibrary?: boolean } | null
}

export const dashboardService = {
  async loadOverview(): Promise<DashboardOverview> {
    const organizationId = await assessmentService.getCurrentOrganizationId()

    // Build every statistic from the same accessible assessment rows. The
    // removedFromLibrary marker is distinct from archived status.
    const { data: rows, error: rowsError } = await supabase.from('assessments')
      .select('id,name,status,updated_at,payload')
      .eq('organization_id', organizationId)
    if (rowsError) throw new Error(`Assessments: ${rowsError.message}`)
    const all: DashboardAssessmentDatabaseRow[] = (rows ?? []) as DashboardAssessmentDatabaseRow[]
    const active = all.filter((row) => row.status !== 'archived' && row.payload?.removedFromLibrary !== true)
    const activeIds = active.map((row) => String(row.id))
    const { count: questionCount, error: questionsError } = await supabase.from('questions')
      .select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)
    if (questionsError || questionCount === null) throw new Error(`Question Bank: ${questionsError?.message ?? 'Count unavailable'}`)

    // An empty active list has zero active attempts. Never issue an unscoped
    // attempts query and accidentally include historical student submissions.
    let completedAttempts = 0
    let inProgressAttempts = 0
    let recentAttempts: DashboardAttempt[] = []
    if (activeIds.length) {
      // PostgREST IN clauses can become large in big schools; batch IDs.
      const recentRows: AttemptRow[] = []
      for (let offset = 0; offset < activeIds.length; offset += 100) {
        const ids = activeIds.slice(offset, offset + 100)
        const [completed, inProgress, recent] = await Promise.all([
          supabase.from('attempts').select('id', { count: 'exact', head: true })
            .eq('organization_id', organizationId).in('assessment_id', ids).eq('status', 'completed'),
          supabase.from('attempts').select('id', { count: 'exact', head: true })
            .eq('organization_id', organizationId).in('assessment_id', ids).eq('status', 'in_progress'),
          supabase.from('attempts').select('id,assessment_id,student_name,status,started_at,percentage')
            .eq('organization_id', organizationId).in('assessment_id', ids)
            .order('started_at', { ascending: false }).limit(5),
        ])
        completedAttempts += verifiedCount(completed, 'Completed attempts')
        inProgressAttempts += verifiedCount(inProgress, 'In-progress attempts')
        if (recent.error) throw new Error(`Recent student attempts: ${recent.error.message}`)
        recentRows.push(...(recent.data ?? []))
      }
      recentAttempts = recentRows.sort((a, b) =>
        (Date.parse(b.started_at || '') || 0) - (Date.parse(a.started_at || '') || 0))
        .slice(0, 5).map((row) => ({
          id: String(row.id), assessmentId: String(row.assessment_id),
          studentName: String(row.student_name || 'Student participant'),
          status: String(row.status || 'in_progress'),
          startedAt: row.started_at || null,
          percentage: row.percentage === null ? null : Number(row.percentage),
        }))
    }
    return {
      totalAssessments: active.length,
      publishedAssessments: active.filter((a) => a.status === 'published').length,
      draftAssessments: active.filter((a) => a.status === 'draft').length,
      archivedAssessments: all.filter((a) => a.status === 'archived').length,
      questionCount,
      completedAttempts,
      inProgressAttempts,
      recentAssessments: active.slice().sort((a, b) =>
        (Date.parse(b.updated_at || '') || 0) - (Date.parse(a.updated_at || '') || 0))
        .slice(0, 5).map((row) => ({ id: String(row.id),
          name: String(row.name || 'Untitled assessment'),
          status: String(row.status || 'draft'), updatedAt: row.updated_at || null })),
      recentAttempts,
      loadedAt: new Date(),
    }

  },
}
