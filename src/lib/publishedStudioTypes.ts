import type { ReportData } from '../components/Reports/Types'
export type StudioMetric = 'accuracy' | 'correct' | 'domain' | 'taxonomy' | 'difficulty' | 'duration' | 'unanswered'
export interface PublishedStudioPointer { versionKey: string; version: number; publishedAt: string }
export interface PublishedStudioRule { metric: StudioMetric; operator: 'lt' | 'gte'; threshold: number; thresholdSource?: 'custom' | 'strong' | 'moderate'; minQuestions: number; action: 'show' | 'highlight'; groupLabel?: string }
export interface PublishedFeedbackCriterion {
  metric: 'percentage' | 'correctCount' | 'incorrectCount' | 'unansweredCount' | 'practiceScaledScore'
  operator: 'gte' | 'lte' | 'eq'
  value: number
}
export interface PublishedFeedbackRule {
  id: string; title: string; enabled: boolean; match: 'all' | 'any'; criteria: PublishedFeedbackCriterion[]
  message?: string; recommendation?: string
}
export interface PublishedStudioElement {
 id: string; kind: string; title: string; subtitle?: string; body?: string; section?: string; metric?: StudioMetric; visible: boolean; width?: 'full' | 'half'; rule?: PublishedStudioRule; feedbackRuleId?: string;
 feedback?: { learningTarget: string; recommendedAction: string; successCriterion: string; priority: 'high' | 'normal' }
}
export interface PublishedStudioTemplate { schemaVersion: 1; version: number; publishedAt: string; criteriaSnapshot?: { strongThreshold: number; moderateThreshold: number; rubricTiers: Array<{ id: string; name: string; minScore: number; maxScore: number; badgeColor: string; description: string; recommendation: string }>; feedbackRules?: PublishedFeedbackRule[] }; layout: { title: string; subtitle: string; elements: PublishedStudioElement[] } }
export function evaluatePublishedRule(rule: PublishedStudioRule | undefined, report: ReportData, criteria?: PublishedStudioTemplate['criteriaSnapshot']): boolean {
 if (!rule) return true
 const overall = report.overall
 const count = Number(overall.total_questions)
 let value: number | null = null
 let evidence = count
 if (rule.metric === 'accuracy') value = count > 0 ? 100 * Number(overall.correct_count) / count : null
 if (rule.metric === 'correct') value = Number(overall.correct_count)
 if (rule.metric === 'unanswered') value = overall.unanswered_count == null ? null : Number(overall.unanswered_count)
 if (rule.metric === 'duration') value = report.student_info.total_time_seconds == null ? null : Number(report.student_info.total_time_seconds) / 60
 if (['domain','taxonomy','difficulty'].includes(rule.metric)) {
   const type = rule.metric === 'domain' ? 'category' : rule.metric === 'taxonomy' ? 'module' : 'difficulty'
   const matches = (report.breakdowns || []).filter(row => row.type === type && row.label === rule.groupLabel)
   if (!rule.groupLabel || matches.length !== 1) return false
   value = Number(matches[0].percentage)
   evidence = Number(matches[0].total_questions)
 }
 if (!Number.isFinite(value) || !Number.isFinite(evidence) || evidence < rule.minQuestions) return false
 const threshold = rule.thresholdSource === 'strong' ? criteria?.strongThreshold ?? rule.threshold : rule.thresholdSource === 'moderate' ? criteria?.moderateThreshold ?? rule.threshold : rule.threshold
 return rule.operator === 'lt' ? Number(value) < threshold : Number(value) >= threshold
}

/** Evaluate the Report Design feedback rule snapshot using only saved report evidence.
 * Missing/unsupported metrics are never treated as a match. Scaled score deliberately
 * remains unavailable unless a canonical scaled score is present in the saved report.
 */
export function evaluatePublishedFeedbackRule(rule: PublishedFeedbackRule | undefined, report: ReportData): boolean {
  if (!rule || !rule.enabled || !Array.isArray(rule.criteria) || rule.criteria.length === 0) return false
  const overall = report.overall
  const valueFor = (metric: PublishedFeedbackCriterion['metric']): number | null => {
    if (metric === 'percentage') {
      const saved = Number(overall.percentage)
      if (overall.percentage !== null && overall.percentage !== undefined && Number.isFinite(saved)) return saved
      const total = Number(overall.total_questions), correct = Number(overall.correct_count)
      return Number.isFinite(total) && total > 0 && Number.isFinite(correct) ? correct * 100 / total : null
    }
    if (metric === 'correctCount') return Number.isFinite(Number(overall.correct_count)) ? Number(overall.correct_count) : null
    if (metric === 'incorrectCount') return overall.incorrect_count == null ? null : Number.isFinite(Number(overall.incorrect_count)) ? Number(overall.incorrect_count) : null
    if (metric === 'unansweredCount') return overall.unanswered_count == null ? null : Number.isFinite(Number(overall.unanswered_count)) ? Number(overall.unanswered_count) : null
    // Do not substitute raw percentage for a practice-scaled score.
    return null
  }
  const outcomes = rule.criteria.map(criterion => {
    if (!Number.isFinite(criterion.value)) return null
    const actual = valueFor(criterion.metric)
    if (actual === null || !Number.isFinite(actual)) return null
    if (criterion.operator === 'gte') return actual >= criterion.value
    if (criterion.operator === 'lte') return actual <= criterion.value
    return actual === criterion.value
  })
  if (rule.match === 'all') return outcomes.every(result => result === true)
  return outcomes.some(result => result === true)
}
export function linkedPublishedFeedbackRule(element: PublishedStudioElement, template: PublishedStudioTemplate): PublishedFeedbackRule | undefined {
  if (!element.feedbackRuleId) return undefined
  return template.criteriaSnapshot?.feedbackRules?.find(rule => rule.id === element.feedbackRuleId)
}

export function studioMetricValue(metric: StudioMetric | undefined, report: ReportData): string | null {
  const total = Number(report.overall.total_questions)
  if (metric === 'accuracy') return total > 0 ? `${(100 * Number(report.overall.correct_count) / total).toFixed(1)}%` : null
  if (metric === 'correct') return `${report.overall.correct_count} / ${total}`
  if (metric === 'unanswered') return report.overall.unanswered_count == null ? null : String(report.overall.unanswered_count)
  if (metric === 'duration') return report.student_info.total_time_seconds != null && Number.isFinite(Number(report.student_info.total_time_seconds)) ? `${Math.round(Number(report.student_info.total_time_seconds) / 60)} min` : null
  return null
}
export const STUDIO_SECTIONS = [
  ['overview','Learning Overview'], ['curriculum','Knowledge & Curriculum'],
  ['cognitive','Cognitive & Difficulty Profile'], ['timing','Time & Answer Behavior'],
  ['findings','Diagnostic Findings'], ['action','My Learning Action Plan']
] as const
export interface StudioChartRow { label: string; percentage: number; count: number; correct: number }
export interface StudioRenderedItem { id: string; title: string; value: string; kind: 'metric' | 'text' | 'chart' | 'table' | 'gauge' | 'donut' | 'unsupported'; segments?: { label: string; count: number; percentage: number }[]; percentage?: number; width: 'full' | 'half'; rows?: StudioChartRow[] }
export interface StudioRenderedSection { id: string; title: string; items: StudioRenderedItem[] }
function hasMeaningfulText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function isUnfinishedPlaceholder(item: PublishedStudioElement, linkedRule: PublishedFeedbackRule | undefined): boolean {
  const title = typeof item.title === 'string' ? item.title.trim() : ''
  const ruleTitle = typeof linkedRule?.title === 'string' ? linkedRule.title.trim() : ''
  const hasElementContent = hasMeaningfulText(item.body)
    || hasMeaningfulText(item.feedback?.learningTarget)
    || hasMeaningfulText(item.feedback?.recommendedAction)
    || hasMeaningfulText(item.feedback?.successCriterion)
  const hasRuleContent = hasMeaningfulText(linkedRule?.message) || hasMeaningfulText(linkedRule?.recommendation)
  // A default editor label is not student-facing content. Keep the teacher's rule in
  // the editor, but don't leak an untouched placeholder into the shared web/PDF model.
  return (/^new rule$/i.test(title) || /^new rule$/i.test(ruleTitle))
    && !hasElementContent
    && !hasRuleContent
}

export function buildPublishedStudioSections(template: PublishedStudioTemplate, report: ReportData): StudioRenderedSection[] {
  const elements = template.layout.elements.filter(item => {
    if (!item.visible || !evaluatePublishedRule(item.rule, report, template.criteriaSnapshot)) return false
    const linkedRule = linkedPublishedFeedbackRule(item, template)
    if (isUnfinishedPlaceholder(item, linkedRule)) return false
    if (!item.feedbackRuleId) return true
    return evaluatePublishedFeedbackRule(linkedRule, report)
  })
  const recommendations = elements.filter(item => {
      const linked = linkedPublishedFeedbackRule(item, template)
      return Boolean((item.feedback?.learningTarget.trim() || linked?.title.trim()) && (item.feedback?.recommendedAction.trim() || linked?.recommendation?.trim() || linked?.message?.trim()))
    })
    .sort((a,b) => (a.feedback?.priority === 'high' ? 0 : 1) - (b.feedback?.priority === 'high' ? 0 : 1))
    .filter((item,index,all) => all.findIndex(other => {
      const otherRule = linkedPublishedFeedbackRule(other, template)
      const itemRule = linkedPublishedFeedbackRule(item, template)
      const otherTarget = other.feedback?.learningTarget.trim() || otherRule?.title.trim() || ''
      const itemTarget = item.feedback?.learningTarget.trim() || itemRule?.title.trim() || ''
      return otherTarget.toLowerCase() === itemTarget.toLowerCase()
    }) === index)
    .slice(0,3)
  return STUDIO_SECTIONS.map(([id,title]) => {
    const items: StudioRenderedItem[] = elements.filter(item => (item.section || 'overview') === id).map(item => {
      const metric = studioMetricValue(item.metric,report)
      const groupType = item.metric === 'difficulty' ? 'difficulty' : item.metric === 'taxonomy' ? 'module' : 'category'
      const rows = (report.breakdowns || []).filter(row => row.type === groupType && Number.isFinite(Number(row.percentage)) && Number(row.total_questions) > 0)
        .map(row => ({ label: row.label, percentage: Math.max(0, Math.min(100, Number(row.percentage))), count: Number(row.total_questions), correct: Number(row.correct_count) }))
      const visualKind = item.kind === 'bar' || item.kind === 'table' ? (item.kind === 'bar' ? 'chart' : 'table') : null
      const total = Number(report.overall.total_questions)
      const correct = Number(report.overall.correct_count)
      const incorrect = Number(report.overall.incorrect_count)
      const unanswered = report.overall.unanswered_count == null ? total - correct - incorrect : Number(report.overall.unanswered_count)
      const validAnswers = Number.isInteger(total) && total > 0 && [correct,incorrect,unanswered].every(n => Number.isInteger(n) && n >= 0) && correct + incorrect + unanswered === total
      const gaugePercent = item.metric === 'accuracy' || !item.metric ? (validAnswers ? 100 * correct / total : null) : null
      const segments = validAnswers ? [{label:'Correct',count:correct,percentage:100*correct/total},{label:'Incorrect',count:incorrect,percentage:100*incorrect/total},{label:'Unanswered',count:unanswered,percentage:100*unanswered/total}] : undefined
      const gaugeReady = item.kind === 'gauge' && gaugePercent !== null
      const donutReady = item.kind === 'donut' && Boolean(segments)

      return { id:item.id, title:item.title, value: visualKind ? (rows.length ? '' : 'No eligible breakdown data for this assessment.') : gaugeReady ? `${gaugePercent!.toFixed(1)}%` : donutReady ? '' : (item.kind === 'donut' || item.kind === 'gauge') ? 'Not enough valid assessment data to display this visualization.' : metric || (item.kind === 'text' ? item.body || 'No text provided.' : 'Visualization not supported in this report version.'),
        kind: gaugeReady ? 'gauge' as const : donutReady ? 'donut' as const : visualKind && rows.length ? visualKind : visualKind ? 'text' as const : metric ? 'metric' as const : item.kind === 'text' ? 'text' as const : 'unsupported' as const,
        width:item.width || 'half', rows: visualKind && rows.length ? rows : undefined, percentage: gaugeReady ? gaugePercent! : undefined, segments: donutReady ? segments : undefined }
    })
    if (id === 'action') recommendations.forEach((item,index) => {
      const f = item.feedback
      const linked = linkedPublishedFeedbackRule(item, template)
      const target = f?.learningTarget.trim() || linked?.title || item.title
      const action = f?.recommendedAction.trim() || linked?.recommendation?.trim() || linked?.message?.trim() || ''
      const goal = f?.successCriterion?.trim()
      items.push({ id:`recommendation-${item.id}`, title:`Priority ${index+1}: ${target}`, value:`${action}${goal ? `\nNext goal: ${goal}` : ''}`, kind:'text', width:'full' })
    })
    return {id,title,items}
  }).filter(section => section.items.length)
}
