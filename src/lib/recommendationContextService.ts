import { supabase, isSupabaseConfigured } from './supabaseClient'
import recommendationEngine, {
  type RecommendationContext,
  type RecommendationEvaluationResult,
} from './recommendationEngine'

export interface AttemptRecommendationOverall {
  totalQuestions: number
  correctCount: number
  incorrectCount: number
  pointsEarned: number
  pointsPossible: number
  percentage: number
  calculatedAt: string | null
}

export interface AttemptRecommendationBreakdown {
  id?: string
  type: string
  breakdownId: string | null
  label: string
  totalQuestions: number
  correctCount: number
  pointsEarned: number
  pointsPossible: number
  percentage: number
  classification: string | null
}

export interface AttemptRecommendationTaxonomyNode {
  nodeId: string
  taxonomyId: string
  name: string
  code: string | null
  totalQuestions: number
  correctCount: number
  pointsEarned: number
  pointsPossible: number
  percentage: number
}

export interface AttemptRecommendationContext {
  attempt: {
    id: string
    assessmentId: string
    status: string
    organizationId: string
  }
  overall: AttemptRecommendationOverall
  breakdowns: {
    list: AttemptRecommendationBreakdown[]
    [breakdownType: string]: unknown
  }
  taxonomy: {
    [taxonomyId: string]: {
      name: string
      code: string | null
      nodes: {
        [nodeId: string]: AttemptRecommendationTaxonomyNode
      }
    }
  }
}

interface AnswerRow {
  question_id: string
  is_correct: boolean | null
  points_earned: number | null
}

interface QuestionRow {
  id: string
  points: number | null
}

interface QuestionTaxonomyRow {
  question_id: string
  taxonomy_node_id: string
}

interface TaxonomyNodeRow {
  id: string
  taxonomy_id: string
  parent_id: string | null
  name: string
  code: string | null
}

interface TaxonomyRow {
  id: string
  name: string
  code: string | null
}

interface AttemptRow {
  id: string
  assessment_id: string
  organization_id: string
  status: string
}

interface AttemptResultRow {
  attempt_id: string
  total_questions: number
  correct_count: number
  incorrect_count: number
  points_earned: number
  points_possible: number
  percentage: number
  calculated_at: string | null
}

interface AttemptBreakdownRow {
  id: string
  breakdown_type: string
  breakdown_id: string | null
  breakdown_label: string
  total_questions: number
  correct_count: number
  points_earned: number
  points_possible: number
  percentage: number
  classification: string | null
}

function asNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function emptyMetric(label = '') {
  return {
    label,
    totalQuestions: 0,
    correctCount: 0,
    pointsEarned: 0,
    pointsPossible: 0,
    percentage: 0,
  }
}

function finalizeMetric(metric: ReturnType<typeof emptyMetric>) {
  metric.percentage =
    metric.pointsPossible > 0
      ? Math.round((metric.pointsEarned / metric.pointsPossible) * 10000) / 100
      : 0
  return metric
}

function addAnswerToMetric(
  metric: ReturnType<typeof emptyMetric>,
  answer: AnswerRow,
  pointsPossible: number
) {
  metric.totalQuestions += 1
  if (answer.is_correct === true) metric.correctCount += 1
  metric.pointsEarned += asNumber(answer.points_earned)
  metric.pointsPossible += pointsPossible
}

function groupBreakdowns(rows: AttemptBreakdownRow[]) {
  const grouped: Record<string, Record<string, AttemptRecommendationBreakdown>> = {}

  for (const row of rows) {
    const type = row.breakdown_type
    const key = row.breakdown_id || row.breakdown_label

    if (!grouped[type]) grouped[type] = {}

    grouped[type][key] = {
      id: row.id,
      type,
      breakdownId: row.breakdown_id,
      label: row.breakdown_label,
      totalQuestions: asNumber(row.total_questions),
      correctCount: asNumber(row.correct_count),
      pointsEarned: asNumber(row.points_earned),
      pointsPossible: asNumber(row.points_possible),
      percentage: asNumber(row.percentage),
      classification: row.classification,
    }
  }

  return grouped
}

/**
 * Builds a read-only generic recommendation context from the existing
 * attempt/result data. This does not calculate or write results.
 *
 * Generic taxonomy metrics are derived from question_taxonomy_nodes and
 * student_answers. A question linked to multiple taxonomy nodes contributes
 * to each linked node, which preserves the many-to-many taxonomy model.
 */
export async function buildAttemptRecommendationContext(
  attemptId: string
): Promise<AttemptRecommendationContext> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured.')
  }

  const { data: attempt, error: attemptError } = await supabase
    .from('attempts')
    .select('id, assessment_id, organization_id, status')
    .eq('id', attemptId)
    .single()

  if (attemptError) throw attemptError

  const typedAttempt = attempt as AttemptRow

  const [{ data: result, error: resultError }, { data: breakdownRows, error: breakdownError }, { data: answers, error: answersError }] =
    await Promise.all([
      supabase
        .from('attempt_results')
        .select(
          'attempt_id, total_questions, correct_count, incorrect_count, points_earned, points_possible, percentage, calculated_at'
        )
        .eq('attempt_id', attemptId)
        .single(),
      supabase
        .from('attempt_breakdowns')
        .select(
          'id, breakdown_type, breakdown_id, breakdown_label, total_questions, correct_count, points_earned, points_possible, percentage, classification'
        )
        .eq('attempt_id', attemptId),
      supabase
        .from('student_answers')
        .select('question_id, is_correct, points_earned')
        .eq('attempt_id', attemptId),
    ])

  if (resultError) throw resultError
  if (breakdownError) throw breakdownError
  if (answersError) throw answersError

  const typedResult = result as AttemptResultRow
  const typedBreakdowns = (breakdownRows || []) as AttemptBreakdownRow[]
  const typedAnswers = (answers || []) as AnswerRow[]

  const questionIds = Array.from(
    new Set(typedAnswers.map((answer) => String(answer.question_id)).filter(Boolean))
  )

  const questionPoints: Record<string, number> = {}

  if (questionIds.length > 0) {
    const { data: questions, error: questionsError } = await supabase
      .from('questions')
      .select('id, points')
      .in('id', questionIds)

    if (questionsError) throw questionsError

    for (const question of (questions || []) as QuestionRow[]) {
      questionPoints[String(question.id)] = asNumber(question.points)
    }
  }

  const taxonomyLinks: QuestionTaxonomyRow[] = []
  if (questionIds.length > 0) {
    const { data: links, error: linksError } = await supabase
      .from('question_taxonomy_nodes')
      .select('question_id, taxonomy_node_id')
      .in('question_id', questionIds)

    if (linksError) throw linksError
    taxonomyLinks.push(...((links || []) as QuestionTaxonomyRow[]))
  }

  const nodeIds = Array.from(
    new Set(taxonomyLinks.map((link) => String(link.taxonomy_node_id)).filter(Boolean))
  )

  const taxonomyNodes: TaxonomyNodeRow[] = []
  if (nodeIds.length > 0) {
    const { data: nodes, error: nodesError } = await supabase
      .from('taxonomy_nodes')
      .select('id, taxonomy_id, parent_id, name, code')
      .in('id', nodeIds)

    if (nodesError) throw nodesError
    taxonomyNodes.push(...((nodes || []) as TaxonomyNodeRow[]))
  }

  const taxonomyIds = Array.from(
    new Set(taxonomyNodes.map((node) => String(node.taxonomy_id)).filter(Boolean))
  )

  const taxonomies: TaxonomyRow[] = []
  if (taxonomyIds.length > 0) {
    const { data: taxonomyRows, error: taxonomiesError } = await supabase
      .from('taxonomies')
      .select('id, name, code')
      .in('id', taxonomyIds)

    if (taxonomiesError) throw taxonomiesError
    taxonomies.push(...((taxonomyRows || []) as TaxonomyRow[]))
  }

  const answerByQuestion = new Map<string, AnswerRow>()
  for (const answer of typedAnswers) {
    answerByQuestion.set(String(answer.question_id), answer)
  }

  const taxonomy: AttemptRecommendationContext['taxonomy'] = {}
  const nodeById = new Map<string, TaxonomyNodeRow>()

  for (const node of taxonomyNodes) {
    nodeById.set(String(node.id), node)
    const taxonomyId = String(node.taxonomy_id)
    const taxonomyMeta = taxonomies.find((item) => String(item.id) === taxonomyId)

    if (!taxonomy[taxonomyId]) {
      taxonomy[taxonomyId] = {
        name: taxonomyMeta?.name || taxonomyId,
        code: taxonomyMeta?.code || null,
        nodes: {},
      }
    }

    taxonomy[taxonomyId].nodes[String(node.id)] = {
      nodeId: String(node.id),
      taxonomyId,
      name: node.name,
      code: node.code,
      totalQuestions: 0,
      correctCount: 0,
      pointsEarned: 0,
      pointsPossible: 0,
      percentage: 0,
    }
  }

  for (const link of taxonomyLinks) {
    const node = nodeById.get(String(link.taxonomy_node_id))
    const answer = answerByQuestion.get(String(link.question_id))
    if (!node || !answer) continue

    const taxonomyId = String(node.taxonomy_id)
    const nodeId = String(node.id)
    const metric = taxonomy[taxonomyId]?.nodes[nodeId]
    if (!metric) continue

    metric.totalQuestions += 1
    if (answer.is_correct === true) metric.correctCount += 1
    metric.pointsEarned += asNumber(answer.points_earned)
    metric.pointsPossible += questionPoints[String(link.question_id)] || 0
  }

  for (const taxonomyValue of Object.values(taxonomy)) {
    for (const node of Object.values(taxonomyValue.nodes)) {
      node.percentage =
        node.pointsPossible > 0
          ? Math.round((node.pointsEarned / node.pointsPossible) * 10000) / 100
          : 0
    }
  }

  const groupedBreakdowns = groupBreakdowns(typedBreakdowns)

  const breakdowns: AttemptRecommendationContext['breakdowns'] = {
    list: typedBreakdowns.map((row) => ({
      id: row.id,
      type: row.breakdown_type,
      breakdownId: row.breakdown_id,
      label: row.breakdown_label,
      totalQuestions: asNumber(row.total_questions),
      correctCount: asNumber(row.correct_count),
      pointsEarned: asNumber(row.points_earned),
      pointsPossible: asNumber(row.points_possible),
      percentage: asNumber(row.percentage),
      classification: row.classification,
    })),
  }

  for (const [type, values] of Object.entries(groupedBreakdowns)) {
    breakdowns[type] = values
  }

  return {
    attempt: {
      id: String(typedAttempt.id),
      assessmentId: String(typedAttempt.assessment_id),
      status: typedAttempt.status,
      organizationId: String(typedAttempt.organization_id),
    },
    overall: {
      totalQuestions: asNumber(typedResult.total_questions),
      correctCount: asNumber(typedResult.correct_count),
      incorrectCount: asNumber(typedResult.incorrect_count),
      pointsEarned: asNumber(typedResult.points_earned),
      pointsPossible: asNumber(typedResult.points_possible),
      percentage: asNumber(typedResult.percentage),
      calculatedAt: typedResult.calculated_at,
    },
    breakdowns,
    taxonomy,
  }
}

export async function evaluateAttemptRecommendations(
  attemptId: string
): Promise<{
  context: AttemptRecommendationContext
  evaluation: RecommendationEvaluationResult
}> {
  const context = await buildAttemptRecommendationContext(attemptId)
  const evaluation = await recommendationEngine.evaluate(context as unknown as RecommendationContext)
  return { context, evaluation }
}

export const recommendationContextService = {
  buildAttemptRecommendationContext,
  evaluateAttemptRecommendations,
}

export default recommendationContextService
