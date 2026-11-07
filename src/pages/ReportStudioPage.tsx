import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { attemptService, type StoredAttemptRecord } from '../lib/attemptService'
import { loadOrganizationConfig, saveOrganizationConfig } from '../lib/organizationConfigService'
import { reportTemplateService, type ReportTemplateConfig, type FeedbackRule, type FeedbackCriterion } from '../lib/reportTemplateService'
import {
  Activity, Award, BarChart3, Check, ChevronDown, CircleHelp, Clock3, Eye, FileText,
  GripVertical, Image as ImageIcon, LayoutGrid, Plus, RotateCcw, Save, Settings2,
  Table2, Trash2, Type,
} from 'lucide-react'

type ReportSection = 'overview' | 'curriculum' | 'cognitive' | 'timing' | 'findings' | 'action'
type Metric = 'accuracy' | 'correct' | 'domain' | 'taxonomy' | 'difficulty' | 'duration' | 'unanswered'
type ElementRule = { metric: Metric; operator: 'lt' | 'gte'; threshold: number; thresholdSource?: 'custom' | 'strong' | 'moderate'; minQuestions: number; action: 'show' | 'highlight'; groupLabel?: string }
const sectionOptions: { id: ReportSection; label: string }[] = [
  { id: 'overview', label: 'Learning Overview' }, { id: 'curriculum', label: 'Knowledge & Curriculum' },
  { id: 'cognitive', label: 'Cognitive & Difficulty' }, { id: 'timing', label: 'Time & Answer Behavior' },
  { id: 'findings', label: 'Diagnostic Findings' }, { id: 'action', label: 'My Learning Action Plan' },
]
const metricOptions: { id: Metric; label: string }[] = [
  { id: 'accuracy', label: 'Overall accuracy (%)' }, { id: 'correct', label: 'Correct answers' },
  { id: 'domain', label: 'Domain performance (%)' }, { id: 'taxonomy', label: 'Taxonomy performance (%)' },
  { id: 'difficulty', label: 'Difficulty performance (%)' }, { id: 'duration', label: 'Duration (minutes)' },
  { id: 'unanswered', label: 'Unanswered questions' },
]
type PreviewMetrics = Record<Metric, number | null>
function attemptMetrics(attempt: StoredAttemptRecord | null): PreviewMetrics {
  if (!attempt?.report_data || attempt.status !== 'completed') return { accuracy: null, correct: null, domain: null, taxonomy: null, difficulty: null, duration: null, unanswered: null }
  const report = attempt.report_data
  const overall = report.overall
  const total = Number(overall.total_questions)
  const correct = Number(overall.correct_count)
  const accuracy = total > 0 && Number.isFinite(correct) ? 100 * correct / total : null
  const breakdown = report.breakdowns || []
  const metricGroup = (type: string) => {
    const rows = breakdown.filter(row => row.type === type && row.total_questions > 0)
    if (rows.length !== 1) return null // A category metric must not silently aggregate overlapping tags.
    return Number.isFinite(rows[0].percentage) ? rows[0].percentage : null
  }
  return {
    accuracy, correct: Number.isFinite(correct) ? correct : null,
    domain: metricGroup('category'), taxonomy: metricGroup('module'), difficulty: metricGroup('difficulty'),
    duration: Number.isFinite(attempt.total_time_seconds) && attempt.total_time_seconds > 0 ? attempt.total_time_seconds / 60 : null,
    unanswered: Number.isFinite(overall.unanswered_count) ? Number(overall.unanswered_count) : null,
  }
}
function ruleResult(rule: ElementRule | undefined, metrics: PreviewMetrics, questionCount: number, attempt: StoredAttemptRecord | null, criteria?: Pick<ReportTemplateConfig, 'strongThreshold' | 'moderateThreshold'>): 'match' | 'no-match' | 'insufficient' {
  if (!rule) return 'match'
  if (!attempt || attempt.status !== 'completed') return 'insufficient'
  let value = metrics[rule.metric]
  let evidenceCount = questionCount
  if (rule.metric === 'domain' || rule.metric === 'taxonomy' || rule.metric === 'difficulty') {
    // A rule must name exactly one assessed category; never average or pick one implicitly.
    const type = rule.metric === 'domain' ? 'category' : rule.metric === 'taxonomy' ? 'module' : 'difficulty'
    const matches = (attempt?.report_data?.breakdowns || []).filter(row => row.type === type && row.label === rule.groupLabel)
    if (!rule.groupLabel || matches.length !== 1) return 'insufficient'
    value = Number.isFinite(matches[0].percentage) ? matches[0].percentage : null
    evidenceCount = matches[0].total_questions
  }
  if (value === null || !Number.isFinite(value) || evidenceCount < rule.minQuestions) return 'insufficient'
  const threshold = rule.thresholdSource === 'strong' ? criteria?.strongThreshold ?? rule.threshold : rule.thresholdSource === 'moderate' ? criteria?.moderateThreshold ?? rule.threshold : rule.threshold
  return rule.operator === 'lt' ? (value < threshold ? 'match' : 'no-match') : (value >= threshold ? 'match' : 'no-match')
}
type ElementKind = 'score' | 'bar' | 'donut' | 'text' | 'table' | 'gauge' | 'image'
type StudioElement = {
  id: string
  kind: ElementKind
  title: string
  subtitle: string
  width: 'full' | 'half'
  accent: string
  visible: boolean
  body?: string
  section?: ReportSection
  metric?: Metric
  rule?: ElementRule
  feedback?: { learningTarget: string; recommendedAction: string; successCriterion: string; priority: 'high' | 'normal' }
  /** Links an existing Report Design feedback rule; rule definitions remain owned by Report Design. */
  feedbackRuleId?: string
}
type StudioLayout = { version: 1; title: string; subtitle: string; elements: StudioElement[] }

const STORAGE_KEY = 'mathsystem.report-studio.layout.v1'
function describePublishError(error: unknown, stage: string): string {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : null
  const parts = [
    typeof value?.message === 'string' ? value.message : error instanceof Error ? error.message : '',
    typeof value?.details === 'string' ? value.details : '',
    typeof value?.hint === 'string' ? value.hint : '',
    typeof value?.code === 'string' ? `Code: ${value.code}` : '',
  ].filter(Boolean)
  const detail = parts.join(' · ') || 'Unknown error returned by the publishing service.'
  return `Publishing failed while ${stage}. ${detail} Previously completed student reports were not modified. A draft version may have been saved; the current published pointer was not confirmed.`
}

const PUBLISHED_POINTER_KEY = 'report-studio.published.v1'
type PublishedPointer = { versionKey: string; version: number; publishedAt: string }
type PublishedStudioTemplate = { schemaVersion: 1; version: number; publishedAt: string; criteriaSnapshot: { strongThreshold: number; moderateThreshold: number; rubricTiers: ReportTemplateConfig['rubricTiers']; feedbackRules: FeedbackRule[] }; layout: StudioLayout }
function feedbackCriterionValue(criterion: FeedbackCriterion, attempt: StoredAttemptRecord | null): number | null {
  if (!attempt || attempt.status !== 'completed' || !attempt.report_data) return null
  const overall = attempt.report_data.overall
  const total = Number(overall.total_questions)
  const correct = Number(overall.correct_count)
  switch (criterion.metric) {
    case 'percentage': return Number.isFinite(Number(overall.percentage)) ? Number(overall.percentage) : total > 0 && Number.isFinite(correct) ? correct * 100 / total : null
    case 'correctCount': return Number.isFinite(correct) ? correct : null
    case 'incorrectCount': return Number.isFinite(Number(overall.incorrect_count)) ? Number(overall.incorrect_count) : null
    case 'unansweredCount': return Number.isFinite(Number(overall.unanswered_count)) ? Number(overall.unanswered_count) : null
    // ReportData does not expose a canonical practice-scaled score. Do not substitute raw percentage.
    case 'practiceScaledScore': return null
    default: return null
  }
}
function evaluateFeedbackRule(rule: FeedbackRule | undefined, attempt: StoredAttemptRecord | null): 'match' | 'no-match' | 'insufficient' {
  if (!rule || !rule.enabled) return 'no-match'
  if (!attempt || attempt.status !== 'completed' || !attempt.report_data) return 'insufficient'
  if (!rule.criteria.length) return 'insufficient'
  const results = rule.criteria.map(criterion => {
    const actual = feedbackCriterionValue(criterion, attempt)
    if (actual === null || !Number.isFinite(actual)) return 'insufficient' as const
    const matched = criterion.operator === 'gte' ? actual >= criterion.value : criterion.operator === 'lte' ? actual <= criterion.value : actual === criterion.value
    return matched ? 'match' as const : 'no-match' as const
  })
  // ALL/ANY never treats missing evidence as a passing condition.
  if (rule.match === 'all') {
    if (results.includes('no-match')) return 'no-match'
    return results.every(result => result === 'match') ? 'match' : 'insufficient'
  }
  if (results.includes('match')) return 'match'
  return results.every(result => result === 'no-match') ? 'no-match' : 'insufficient'
}
function linkedFeedbackRule(element: StudioElement, config: ReportTemplateConfig): FeedbackRule | undefined {
  return element.feedbackRuleId ? config.feedbackRules?.find(rule => rule.id === element.feedbackRuleId) : undefined
}

function validateForPublishing(layout: StudioLayout, config: ReportTemplateConfig): string[] {
  const errors: string[] = []
  if (!layout.title.trim()) errors.push('Give the report a title.')
  if (!layout.elements.length) errors.push('Add at least one report element.')
  if (new Set(layout.elements.map(item => item.id)).size !== layout.elements.length) errors.push('Report elements must have unique identifiers.')
  for (const item of layout.elements) {
    if (!item.title.trim()) errors.push('Every report element needs a title.')
    if (item.rule) {
      if (!Number.isFinite(item.rule.threshold)) errors.push(`Set a valid threshold for ${item.title}.`)
      if (!Number.isInteger(item.rule.minQuestions) || item.rule.minQuestions < 0) errors.push(`Set a valid minimum question count for ${item.title}.`)
      if (['accuracy', 'domain', 'taxonomy', 'difficulty'].includes(item.rule.metric) && (item.rule.threshold < 0 || item.rule.threshold > 100)) errors.push(`Percentage thresholds must be between 0 and 100 for ${item.title}.`)
      if (['domain', 'taxonomy', 'difficulty'].includes(item.rule.metric) && !item.rule.groupLabel?.trim()) errors.push(`Choose a specific category for the rule on ${item.title}.`)
    }
    if (item.feedback && (!item.rule && !item.feedbackRuleId || !item.feedback.learningTarget.trim() || !item.feedback.recommendedAction.trim())) errors.push(`Complete the recommendation and connect a rule for ${item.title}.`)
    if (item.feedbackRuleId) {
      const linked = config.feedbackRules?.find(rule => rule.id === item.feedbackRuleId)
      if (!linked) errors.push(`Reconnect the missing feedback rule for ${item.title}.`)
      else if (!linked.enabled) errors.push(`Enable the connected feedback rule for ${item.title}, or disconnect it before publishing.`)
    }
  }
  return [...new Set(errors)]
}
const colors = [
  { label: 'Navy', value: '#173149' }, { label: 'Teal', value: '#147D75' },
  { label: 'Blue', value: '#3767B1' }, { label: 'Violet', value: '#7656A6' },
  { label: 'Amber', value: '#B7791F' },
]
const defaultLayout: StudioLayout = {
  version: 1,
  title: 'Student Performance Report',
  subtitle: 'Diagnostic assessment report',
  elements: [
    { id: 'score-overall', kind: 'score', title: 'Overall score', subtitle: 'Overall percentage', width: 'half', accent: '#173149', visible: true, section: 'overview', metric: 'accuracy' },
    { id: 'score-correct', kind: 'score', title: 'Correct answers', subtitle: 'Questions answered correctly', width: 'half', accent: '#147D75', visible: true, section: 'overview', metric: 'correct' },
    { id: 'domain-chart', kind: 'bar', title: 'Performance by domain', subtitle: 'Compare student performance across domains', width: 'full', accent: '#147D75', visible: true, section: 'curriculum', metric: 'domain' },
    { id: 'answer-breakdown', kind: 'donut', title: 'Answer breakdown', subtitle: 'Correct, incorrect and unanswered', width: 'half', accent: '#3767B1', visible: true, section: 'overview' },
    { id: 'teacher-feedback', kind: 'text', title: 'Teacher feedback', subtitle: 'Personalized guidance for the student', width: 'full', accent: '#7656A6', visible: true, section: 'findings', body: 'Use this space for supportive, actionable feedback based on the student’s assessment results.' },
  ],
}

const elementOptions: Array<{ kind: ElementKind; label: string; detail: string; icon: React.ElementType }> = [
  { kind: 'score', label: 'Score card', detail: 'A headline metric', icon: Award },
  { kind: 'bar', label: 'Bar chart', detail: 'Compare domains or skills', icon: BarChart3 },
  { kind: 'donut', label: 'Answer breakdown', detail: 'Correct, incorrect, unanswered', icon: Activity },
  { kind: 'gauge', label: 'Score gauge', detail: 'Show a score at a glance', icon: Activity },
  { kind: 'text', label: 'Text & feedback', detail: 'Add explanations or advice', icon: Type },
  { kind: 'table', label: 'Results table', detail: 'Summarize assessment data', icon: Table2 },
  { kind: 'image', label: 'Image or logo', detail: 'Branding or supporting image', icon: ImageIcon },
]

function makeElement(kind: ElementKind, count: number): StudioElement {
  const option = elementOptions.find(item => item.kind === kind)!
  return {
    id: `element-${Date.now()}-${count}`,
    kind,
    title: kind === 'score' ? 'New score card' : kind === 'text' ? 'New text block' : option.label,
    subtitle: option.detail,
    width: kind === 'bar' || kind === 'text' || kind === 'table' || kind === 'image' ? 'full' : 'half',
    accent: '#173149',
    visible: true,
    section: kind === 'text' ? 'findings' : 'overview',
    metric: kind === 'bar' ? 'domain' : 'accuracy',
    body: kind === 'text' ? 'Write your report text here.' : undefined,
  }
}

function safeReadLayout(): StudioLayout {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as StudioLayout
      if (parsed?.version === 1 && Array.isArray(parsed.elements) && typeof parsed.title === 'string') return parsed
    }
  } catch { /* Use the safe starter layout if local storage is unavailable or invalid. */ }
  return defaultLayout
}

export default function ReportStudioPage() {
  const [attempts, setAttempts] = useState<StoredAttemptRecord[]>([])
  const [sharedCriteria, setSharedCriteria] = useState<ReportTemplateConfig>(() => reportTemplateService.getTemplateForAssessment())
  const [criteriaLoadMessage, setCriteriaLoadMessage] = useState('Loading shared scoring criteria…')
  const [attemptId, setAttemptId] = useState('')
  const [attemptError, setAttemptError] = useState('')
  const [attemptLoading, setAttemptLoading] = useState(false)
  const [layout, setLayout] = useState<StudioLayout>(defaultLayout)
  const [savedLayout, setSavedLayout] = useState<StudioLayout>(defaultLayout)
  const [selectedId, setSelectedId] = useState<string | null>('score-overall')
  const [previewMode, setPreviewMode] = useState(false)
  const [savedMessage, setSavedMessage] = useState('')
  const [published, setPublished] = useState<PublishedPointer | null>(null)
  const [publishBusy, setPublishBusy] = useState(false)
  const [publishErrors, setPublishErrors] = useState<string[]>([])
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const selected = layout.elements.find(item => item.id === selectedId) || null
  const dirty = useMemo(() => JSON.stringify(layout) !== JSON.stringify(savedLayout), [layout, savedLayout])
  const attempt = attempts.find(row => row.id === attemptId) || null
  useEffect(() => {
    let active = true
    reportTemplateService.loadTemplateForAssessment(attempt?.assessment_id || undefined).then(config => {
      if (active) {
        setSharedCriteria(config)
        setCriteriaLoadMessage(`${attempt?.assessment_name ? `Criteria for ${attempt.assessment_name}` : 'Organization-wide scoring criteria'} · Strong ${config.strongThreshold}% · Moderate ${config.moderateThreshold}%.`)
      }
    }).catch(() => { if (active) setCriteriaLoadMessage('Scoring criteria could not be loaded. Custom thresholds remain available.') })
    return () => { active = false }
  }, [attempt?.assessment_id, attempt?.assessment_name])
  const metrics = attemptMetrics(attempt)
  const questionCount = attempt?.report_data?.overall?.total_questions || 0
  const ruleStatus = (rule?: ElementRule) => ruleResult(rule, metrics, questionCount, attempt, sharedCriteria)
  const ruleGroups = (metric: Metric) => {
    const type = metric === 'domain' ? 'category' : metric === 'taxonomy' ? 'module' : metric === 'difficulty' ? 'difficulty' : null
    return type ? (attempt?.report_data?.breakdowns || []).filter(row => row.type === type && row.total_questions > 0) : []
  }
  const feedbackRuleStatus = (item: StudioElement) => evaluateFeedbackRule(linkedFeedbackRule(item, sharedCriteria), attempt)
  const elementStatus = (item: StudioElement) => {
    const elementResult = ruleStatus(item.rule)
    if (elementResult !== 'match') return elementResult
    return item.feedbackRuleId ? feedbackRuleStatus(item) : 'match'
  }
  const visibleElements = layout.elements.filter(item => item.visible && elementStatus(item) === 'match')
  // Teacher-authored guidance is only generated from explicitly attached, evidence-eligible rules.
  // A missing or ambiguous category cannot create a diagnostic recommendation.
  const findings = layout.elements
    .filter(item => item.kind === 'text' && (item.feedback?.recommendedAction.trim() || linkedFeedbackRule(item, sharedCriteria)?.recommendation.trim()) && elementStatus(item) === 'match')
    .map(item => {
      const rule = item.rule!
      const type = rule.metric === 'domain' ? 'category' : rule.metric === 'taxonomy' ? 'module' : rule.metric === 'difficulty' ? 'difficulty' : null
      const row = type ? (attempt?.report_data?.breakdowns || []).find(group => group.type === type && group.label === rule.groupLabel) : null
      const count = row?.total_questions ?? questionCount
      const percent = row?.percentage ?? metrics[rule.metric]
      const linked = linkedFeedbackRule(item, sharedCriteria)
      return { item, count, percent, priority: item.feedback?.priority || 'normal', linkedRule: linked }
    })
    .sort((a, b) => (a.priority === 'high' ? 0 : 1) - (b.priority === 'high' ? 0 : 1) || (a.percent ?? 100) - (b.percent ?? 100))
  const learningPlan = findings.filter((finding, index, all) =>
    all.findIndex(other => (other.item.feedback?.learningTarget || other.item.title).trim().toLowerCase() === (finding.item.feedback?.learningTarget || finding.item.title).trim().toLowerCase()) === index
  ).slice(0, 3)

  useEffect(() => {
    const initial = safeReadLayout()
    setLayout(initial)
    setSavedLayout(initial)
    setSelectedId(initial.elements[0]?.id || null)
  }, [])

  useEffect(() => {
    let active = true
    reportTemplateService.loadTemplateForAssessment().then(config => {
      if (active) { setSharedCriteria(config); setCriteriaLoadMessage(`Connected to shared scoring criteria · Strong ${config.strongThreshold}% · Moderate ${config.moderateThreshold}%.`) }
    }).catch(() => { if (active) setCriteriaLoadMessage('Shared scoring criteria could not be loaded. Custom rule thresholds remain available.') })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    loadOrganizationConfig<PublishedPointer>(PUBLISHED_POINTER_KEY).then(pointer => {
      if (active) setPublished(pointer)
    }).catch(() => { /* Publishing remains unavailable until a signed-in staff member can load organization settings. */ })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    setAttemptLoading(true)
    attemptService.fetchAttemptsFromDatabase().then(() => {
      if (!active) return
      setAttempts(attemptService.getAllAttempts().filter(item => item.status === 'completed' && !!item.report_data))
    }).catch(error => { if (active) setAttemptError(error instanceof Error ? error.message : 'Unable to load completed attempts.') })
      .finally(() => { if (active) setAttemptLoading(false) })
    return () => { active = false }
  }, [])

  const updateLayout = (patch: Partial<StudioLayout>) => setLayout(previous => ({ ...previous, ...patch }))
  const updateElement = (id: string, patch: Partial<StudioElement>) => {
    setLayout(previous => ({ ...previous, elements: previous.elements.map(item => item.id === id ? { ...item, ...patch } : item) }))
  }
  const addElement = (kind: ElementKind) => {
    const item = makeElement(kind, layout.elements.length)
    setLayout(previous => ({ ...previous, elements: [...previous.elements, item] }))
    setSelectedId(item.id)
    setPreviewMode(false)
    setSavedMessage('')
  }
  const removeElement = (id: string) => {
    const next = layout.elements.filter(item => item.id !== id)
    setLayout(previous => ({ ...previous, elements: next }))
    if (selectedId === id) setSelectedId(next[0]?.id || null)
    setSavedMessage('')
  }
  const moveElement = (fromId: string, toId: string) => {
    if (fromId === toId) return
    setLayout(previous => {
      const elements = [...previous.elements]
      const from = elements.findIndex(item => item.id === fromId)
      const to = elements.findIndex(item => item.id === toId)
      if (from < 0 || to < 0) return previous
      const [moved] = elements.splice(from, 1)
      elements.splice(to, 0, moved)
      return { ...previous, elements }
    })
    setSavedMessage('')
  }
  const saveLayout = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
      setSavedLayout(layout)
      setSavedMessage('Layout saved in this browser.')
    } catch {
      setSavedMessage('This browser could not save the layout. Check storage permissions and try again.')
    }
  }
  const publishTemplate = async () => {
    if (publishBusy) return
    const errors = validateForPublishing(layout, sharedCriteria)
    setPublishErrors(errors)
    if (errors.length) return
    if (!window.confirm('Publish this report design for your organization? This saves a new version. Previously completed assessments keep their existing saved reports. New completed assessments can use this design when template pinning is enabled.')) return
    setPublishBusy(true)
    setSavedMessage('')
    let publishStage = 'loading the current published version'
    try {
      // A distinct config key is used for every release so previous versions are never edited.
      // The pointer changes only after the new snapshot has been saved and verified.
      const current = await loadOrganizationConfig<PublishedPointer>(PUBLISHED_POINTER_KEY)
      const version = (current?.version || 0) + 1
      const versionKey = `report-studio.version.${crypto.randomUUID()}`
      const publishedAt = new Date().toISOString()
      const snapshot: PublishedStudioTemplate = { schemaVersion: 1, version, publishedAt, criteriaSnapshot: { strongThreshold: sharedCriteria.strongThreshold, moderateThreshold: sharedCriteria.moderateThreshold, rubricTiers: JSON.parse(JSON.stringify(sharedCriteria.rubricTiers)), feedbackRules: JSON.parse(JSON.stringify(sharedCriteria.feedbackRules || [])) }, layout: JSON.parse(JSON.stringify(layout)) as StudioLayout }
      publishStage = 'saving the new versioned template'
      await saveOrganizationConfig(versionKey, snapshot)
      publishStage = 'verifying the saved template'
      const verified = await loadOrganizationConfig<PublishedStudioTemplate>(versionKey)
      if (!verified || verified.version !== version || JSON.stringify(verified.layout) !== JSON.stringify(snapshot.layout) || JSON.stringify(verified.criteriaSnapshot) !== JSON.stringify(snapshot.criteriaSnapshot)) throw new Error('Could not verify the saved report template.')
      const pointer: PublishedPointer = { versionKey, version, publishedAt }
      publishStage = 'updating the current published-version pointer'
      await saveOrganizationConfig(PUBLISHED_POINTER_KEY, pointer)
      setPublished(pointer)
      setSavedMessage(`Report Studio configuration v${version} published for this organization. Previously completed assessments are not rewritten. Newly completed attempts can use this design when the database snapshot trigger is installed.`)
    } catch (error) {
      setSavedMessage(describePublishError(error, publishStage))
    } finally {
      setPublishBusy(false)
    }
  }
  const restorePublished = async () => {
    if (dirty && !window.confirm('Discard unsaved changes and load the published template?')) return
    try {
      const pointer = await loadOrganizationConfig<PublishedPointer>(PUBLISHED_POINTER_KEY)
      if (!pointer) { setSavedMessage('No published template is available.'); return }
      const snapshot = await loadOrganizationConfig<PublishedStudioTemplate>(pointer.versionKey)
      if (!snapshot || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.layout?.elements)) throw new Error('The published template could not be loaded.')
      setLayout(snapshot.layout)
      setSelectedId(snapshot.layout.elements[0]?.id || null)
      setPublished(pointer)
      setSavedMessage(`Loaded published version ${pointer.version} into the editor. Save locally if you want to keep editing this copy.`)
    } catch (error) {
      setSavedMessage(error instanceof Error ? error.message : 'Unable to load the published template.')
    }
  }
  const resetLayout = () => {
    setLayout(defaultLayout)
    setSavedLayout(defaultLayout)
    setSelectedId(defaultLayout.elements[0]?.id || null)
    setSavedMessage('Starter layout restored. Save to keep this version in this browser.')
  }

  return (
    <AdminLayout title="Report Studio" subtitle="Build the student report with a guided, teacher-friendly workflow.">
      <div className="mx-auto w-full max-w-[1600px] space-y-5 pb-10">
        <section aria-label="Report setup steps" className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5">
          <div className="mb-3">
            <h2 className="text-sm font-bold text-slate-900">Set up a student report</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">You do not need to understand the technical settings. Follow these steps in order. Scoring criteria decide how results are interpreted; Studio decides how those results are presented.</p><p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800" role="status">{criteriaLoadMessage} Rules can use the shared strong/moderate thresholds or a custom value.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Link to="/admin/report-settings" className="group rounded-xl border border-blue-100 bg-white p-3 transition hover:border-blue-300 hover:shadow-sm">
              <span className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800">1</span>
              <span className="block text-sm font-semibold text-slate-900">Set scoring & criteria</span>
              <span className="mt-1 block text-xs leading-relaxed text-slate-500">Choose score bands, mastery thresholds, and the report sections enabled for your assessment.</span>
              <span className="mt-2 block text-xs font-semibold text-blue-700">Open scoring & criteria →</span>
            </Link>
            <div className="rounded-xl border border-blue-200 bg-white p-3 ring-1 ring-blue-100">
              <span className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">2</span>
              <span className="block text-sm font-semibold text-slate-900">Arrange the report</span>
              <span className="mt-1 block text-xs leading-relaxed text-slate-500">Choose elements, group them into sections, and add rules for when each element should appear.</span>
              <span className="mt-2 block text-xs font-semibold text-blue-700">You are here</span>
            </div>
            <div className="rounded-xl border border-blue-100 bg-white p-3">
              <span className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">3</span>
              <span className="block text-sm font-semibold text-slate-900">Preview before publishing</span>
              <span className="mt-1 block text-xs leading-relaxed text-slate-500">Use a completed assessment, check the findings, then publish only after the report is correct.</span>
              <span className="mt-2 block text-xs font-semibold text-slate-500">Publishing does not rewrite old attempts</span>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">Important: scoring and mastery criteria are configured on the Scoring & Criteria page. Element-level display rules are configured here. If a measure or category has insufficient evidence, the element should not make a diagnostic claim.</p>
        </section>

        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white"><LayoutGrid className="h-5 w-5" /></div>
            <div>
              <div className="flex flex-wrap items-center gap-2"><h1 className="text-lg font-bold tracking-tight text-slate-900">Report Studio</h1><span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">Structured draft</span></div>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">Organize diagnostic sections and connect elements to measures and evidence-aware rules. Preview uses a selected completed assessment. No attempt is modified.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/admin/report-settings" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"><Settings2 className="h-4 w-4" /> Existing report settings</Link>
            <button type="button" onClick={() => setPreviewMode(value => !value)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${previewMode ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}><Eye className="h-4 w-4" /> {previewMode ? 'Edit layout' : 'Preview report'}</button>
            <button type="button" onClick={restorePublished} disabled={publishBusy} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Load published</button>
            <button type="button" onClick={publishTemplate} disabled={publishBusy} className="rounded-xl bg-teal-700 px-3 py-2.5 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50">{publishBusy ? 'Publishing…' : 'Publish template'}</button>
            <button type="button" onClick={saveLayout} className="inline-flex items-center gap-2 rounded-xl bg-[#173149] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#24465f]"><Save className="h-4 w-4" /> Save layout</button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
          {published ? <>Organization template: <strong>Version {published.version}</strong> · Published {new Date(published.publishedAt).toLocaleString()}</> : 'No organization template loaded. Local drafts are not shared.'}
          <p className="mt-1">Publishing saves a versioned design. New attempts pin that design when they are completed (requires the Step 65.8 database migration). Older attempts keep their saved report version. The website and visual PDF use the pinned design when available.</p>
          {publishErrors.length > 0 && <div role="alert" className="mt-2 text-red-700"><strong>Resolve before publishing:</strong><ul className="list-disc pl-5">{publishErrors.map((error, index) => <li key={index}>{error}</li>)}</ul></div>}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <label htmlFor="studio-attempt" className="mb-2 block text-xs font-semibold text-slate-700">Preview using a completed student assessment</label>
          <select id="studio-attempt" value={attemptId} onChange={event => setAttemptId(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm" disabled={attemptLoading}>
            <option value="">Select a completed assessment</option>
            {attempts.map(item => <option key={item.id} value={item.id}>{item.student_name} — {item.assessment_name} ({new Date(item.started_at).toLocaleDateString()})</option>)}
          </select>
          {attemptLoading && <p className="mt-2 text-xs text-slate-500">Loading completed assessments…</p>}
          {attemptError && <p role="alert" className="mt-2 text-xs text-red-700">{attemptError}</p>}
          {!attemptLoading && !attemptError && attempts.length === 0 && <p className="mt-2 text-xs text-slate-500">No completed assessments with saved report data are available.</p>}
          {!attempt && <p className="mt-2 text-xs text-amber-700">Choose a saved assessment to evaluate rules and display results. No fabricated sample scores are shown.</p>}
        </div>
        {savedMessage && <div role="status" className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />{savedMessage}</div>}
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2 text-xs text-slate-500"><span className={`h-2 w-2 rounded-full ${dirty ? 'bg-amber-500' : 'bg-emerald-500'}`} />{dirty ? 'Unsaved changes' : 'All changes saved'}<span className="text-slate-300">·</span>{visibleElements.length} visible elements</div>
          <button type="button" onClick={resetLayout} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-white hover:text-slate-800"><RotateCcw className="h-3.5 w-3.5" /> Restore starter layout</button>
        </div>

        <div className={`grid items-start gap-4 ${previewMode ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-[250px_minmax(0,1fr)_290px]'}`}>
          {!previewMode && <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Elements</h2><span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">ADD</span></div>
            <div className="mb-4 space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Report sections</p>
              {sectionOptions.map(section => <button key={section.id} type="button" onClick={() => {
                const first = layout.elements.find(el => (el.section || 'overview') === section.id)
                if (first) setSelectedId(first.id)
                document.getElementById(`studio-section-${section.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }} className="w-full rounded-lg border border-slate-100 px-2 py-2 text-left text-xs text-slate-700 hover:bg-slate-50">{section.label}</button>)}
            </div>
            <div className="space-y-2">
              {elementOptions.map(option => {
                const Icon = option.icon
                return <button key={option.kind} type="button" onClick={() => addElement(option.kind)} className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 group-hover:bg-white"><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-slate-800">{option.label}</span><span className="mt-0.5 block text-[10px] leading-relaxed text-slate-500">{option.detail}</span></span><Plus className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              })}
            </div>
            <div className="mt-4 rounded-xl bg-blue-50/70 p-3"><div className="flex gap-2"><CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" /><p className="text-[11px] leading-relaxed text-blue-900">Select an element on the page to edit its title, color, size, and visibility. Drag elements to reorder them.</p></div></div>
          </aside>}

          <main className="min-w-0 rounded-2xl border border-slate-200 bg-slate-100/80 p-3 shadow-inner sm:p-5">
            <div className="mx-auto max-w-[820px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="px-5 py-6 sm:px-8 sm:py-8" style={{ borderTop: '5px solid #173149' }}>
                {previewMode ? <><h2 className="text-2xl font-bold tracking-tight text-slate-900">{layout.title}</h2><p className="mt-1 text-sm text-slate-500">{layout.subtitle}</p></> : <>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Report title</label><input value={layout.title} onChange={e => updateLayout({ title: e.target.value })} className="w-full border-0 border-b border-transparent bg-transparent px-0 py-1 text-2xl font-bold tracking-tight text-slate-900 outline-none transition focus:border-slate-300 focus:ring-0" />
                  <input value={layout.subtitle} onChange={e => updateLayout({ subtitle: e.target.value })} aria-label="Report subtitle" className="mt-1 w-full border-0 border-b border-transparent bg-transparent px-0 py-1 text-sm text-slate-500 outline-none transition focus:border-slate-300 focus:ring-0" />
                </>}
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 px-3 py-2.5"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Student</p><p className="mt-1 text-sm font-semibold text-slate-700">{attempt?.student_name || "Select a completed assessment"}</p></div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2.5"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Assessment</p><p className="mt-1 text-sm font-semibold text-slate-700">{attempt?.assessment_name || "No assessment selected"}</p></div>
                </div>
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {layout.elements.map((item, index) => {
                    if (!item.visible || elementStatus(item) !== 'match') return null
                    const selectedItem = selectedId === item.id && !previewMode
                    const dragProps = previewMode ? {} : { draggable: true, onDragStart: (event: React.DragEvent) => { setDraggingId(item.id); event.dataTransfer.effectAllowed = 'move' }, onDragOver: (event: React.DragEvent) => event.preventDefault(), onDrop: (event: React.DragEvent) => { event.preventDefault(); if (draggingId) moveElement(draggingId, item.id); setDraggingId(null) }, onDragEnd: () => setDraggingId(null) }
                    return <section key={item.id} id={`studio-section-${item.section || 'overview'}`} {...dragProps} onClick={() => !previewMode && setSelectedId(item.id)} className={`${item.width === 'full' ? 'sm:col-span-2' : ''} relative min-w-0 rounded-xl border bg-white p-4 transition ${selectedItem ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'} ${!previewMode ? 'cursor-pointer hover:border-slate-300' : ''} ${draggingId === item.id ? 'opacity-50' : ''}`}>
                      {!previewMode && <div className="mb-3 flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><GripVertical className="h-3.5 w-3.5" />{elementOptions.find(option => option.kind === item.kind)?.label || 'Report element'}</span><span className="text-[10px] text-slate-400">{index + 1}</span></div>}
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{sectionOptions.find(section => section.id === (item.section || 'overview'))?.label}</p>
                      <h3 className="text-sm font-bold text-slate-800">{item.title}</h3>
                      {item.kind === 'score' && <div className="mt-3 flex items-end gap-2"><span className="text-3xl font-bold tracking-tight" style={{ color: item.accent }}>{metrics[item.metric || 'accuracy'] === null ? 'Not available' : `${Number(metrics[item.metric || 'accuracy']!.toFixed(1))}${['accuracy', 'domain', 'taxonomy', 'difficulty'].includes(item.metric || 'accuracy') ? '%' : ''}`}</span><span className="pb-1 text-[10px] text-slate-400">{item.subtitle}</span></div>}
                      {item.kind === 'bar' && <div className="mt-4 space-y-3">{(attempt?.report_data?.breakdowns || []).filter(row => row.type === (item.metric === 'difficulty' ? 'difficulty' : item.metric === 'taxonomy' ? 'module' : 'category') && row.total_questions > 0).map(row => ({name: row.label, value: row.percentage, count: row.total_questions})).map(row => <div key={row.name}><div className="mb-1.5 flex justify-between gap-2 text-[10px] text-slate-500"><span>{row.name}</span><span>{row.value.toFixed(1)}% · {row.count} questions</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${row.value}%`, backgroundColor: item.accent }} /></div></div>)}</div>}
                      {item.kind === 'donut' && attempt?.report_data && <div className="mt-4 flex items-center gap-4"><div className="h-20 w-20 shrink-0 rounded-full" style={{ background: `conic-gradient(${item.accent} 0 ${100 * (metrics.correct || 0) / Math.max(1, questionCount)}%, #D97757 0 100%)` }}><div className="m-3 flex h-14 w-14 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-700">{questionCount} Qs</div></div><div className="space-y-2 text-[10px] text-slate-600"><p>● Correct: {metrics.correct}</p><p>● Incorrect: {attempt.report_data.overall.incorrect_count}</p><p>● Unanswered: {metrics.unanswered ?? "Unavailable"}</p></div></div>}
                      {item.kind === 'gauge' && <div className="mt-3"><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, metrics[item.metric || 'accuracy'] || 0))}%`, backgroundColor: item.accent }} /></div><p className="mt-2 text-2xl font-bold" style={{ color: item.accent }}>{metrics[item.metric || "accuracy"] === null ? "Unavailable" : `${metrics[item.metric || "accuracy"]!.toFixed(1)}%`}</p></div>}
                      {item.kind === 'text' && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{item.body || 'Add report text in the properties panel.'}</p>}
                      {item.kind === 'table' && <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 text-slate-400"><th className="py-2 pr-2 font-semibold">Domain</th><th className="py-2 pr-2 font-semibold">Score</th><th className="py-2 font-semibold">Status</th></tr></thead><tbody>{(attempt?.report_data?.breakdowns || []).filter(row => row.type === 'category').map(row => [row.label, `${row.percentage.toFixed(1)}% (${row.total_questions} questions)`, row.classification || 'Not classified']).map(row => <tr key={row[0]} className="border-b border-slate-100 last:border-0"><td className="py-2 pr-2 text-slate-700">{row[0]}</td><td className="py-2 pr-2 text-slate-700">{row[1]}</td><td className="py-2 text-slate-500">{row[2]}</td></tr>)}</tbody></table></div>}
                      {item.kind === 'image' && <div className="mt-3 flex min-h-24 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-slate-400"><div className="text-center"><ImageIcon className="mx-auto h-6 w-6"/><p className="mt-1 text-xs">Logo / image placeholder</p></div></div>}
                    </section>
                  })}
                </div>
                {attempt && learningPlan.length > 0 && <section className="mt-5 rounded-xl border border-teal-100 bg-teal-50/50 p-5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">My Learning Action Plan</p>
                  <h3 className="mt-1 text-base font-bold text-slate-800">Recommended next steps</h3>
                  <p className="mt-1 text-xs text-slate-500">Up to three teacher-authored priorities supported by the selected assessment.</p>
                  <div className="mt-4 space-y-3">{learningPlan.map(({item, count, percent, linkedRule}, index) => <article key={item.id} className="rounded-lg border border-teal-100 bg-white p-3">
                    <div className="flex items-center gap-2"><span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">{index + 1}</span><h4 className="text-sm font-bold text-slate-800">{item.feedback?.learningTarget || item.title}</h4></div>
                    <p className="mt-2 text-xs text-slate-500">Evidence: {count} assessed questions{percent === null ? '' : ` · ${percent.toFixed(1)}% on the selected measure`}. This is a descriptive result, not proof of mastery.</p>
                    <p className="mt-2 text-sm text-slate-700">{item.feedback?.recommendedAction || linkedRule?.recommendation || linkedRule?.message}</p>
                    {item.feedback?.successCriterion && <p className="mt-2 text-xs text-slate-600"><strong>Next goal:</strong> {item.feedback.successCriterion}</p>}
                  </article>)}</div>
                </section>}
                {visibleElements.length === 0 && <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-8 text-center"><FileText className="mx-auto h-7 w-7 text-slate-300"/><p className="mt-2 text-sm font-semibold text-slate-700">Your report is ready for its first element</p><p className="mt-1 text-xs text-slate-500">Add a score card, chart, text block, or table from the element library.</p></div>}
                <div className="mt-6 border-t border-slate-100 pt-4 text-[10px] text-slate-400">Read-only preview of the selected saved attempt. Missing or unsupported measures are not estimated. This draft is not yet published to student reports.</div>
              </div>
            </div>
          </main>

          {!previewMode && <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between"><div><h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Properties</h2><p className="mt-1 text-[11px] text-slate-400">Customize the selected element</p></div><Settings2 className="h-4 w-4 text-slate-400" /></div>
            {!selected ? <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center"><ChevronDown className="mx-auto h-5 w-5 text-slate-300"/><p className="mt-2 text-xs text-slate-500">Select an element on the report canvas to edit its properties.</p></div> : <div className="space-y-4">
              <div><label htmlFor="studio-element-title" className="mb-1.5 block text-[11px] font-semibold text-slate-600">Element title</label><input id="studio-element-title" value={selected.title} onChange={event => updateElement(selected.id, { title: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></div>
              <div><label htmlFor="studio-element-subtitle" className="mb-1.5 block text-[11px] font-semibold text-slate-600">Description</label><input id="studio-element-subtitle" value={selected.subtitle} onChange={event => updateElement(selected.id, { subtitle: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></div>
              {selected.kind === 'text' && <div><label htmlFor="studio-element-body" className="mb-1.5 block text-[11px] font-semibold text-slate-600">Report text</label><textarea id="studio-element-body" rows={5} value={selected.body || ''} onChange={event => updateElement(selected.id, { body: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs leading-relaxed outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></div>}
              <div><label className="mb-1.5 block text-[11px] font-semibold text-slate-600">Report section</label><select value={selected.section || 'overview'} onChange={e => updateElement(selected.id, { section: e.target.value as ReportSection })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs">{sectionOptions.map(section => <option key={section.id} value={section.id}>{section.label}</option>)}</select></div>
              <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3">
                <label className="mb-1.5 block text-[11px] font-semibold text-slate-700">Connect an existing feedback rule</label>
                <select value={selected.feedbackRuleId || ''} onChange={event => updateElement(selected.id, { feedbackRuleId: event.target.value || undefined })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs">
                  <option value="">No existing rule connected</option>
                  {(sharedCriteria.feedbackRules || []).map(rule => <option key={rule.id} value={rule.id}>{rule.title}{rule.enabled ? '' : ' (disabled)'}</option>)}
                </select>
                {selected.feedbackRuleId && (() => { const linked = linkedFeedbackRule(selected, sharedCriteria); const status = feedbackRuleStatus(selected); return <p className="mt-2 text-[11px] leading-relaxed text-slate-600">{linked ? `${linked.enabled ? 'Enabled' : 'Disabled'} · ${linked.match.toUpperCase()} conditions · Preview: ${status === 'match' ? 'matches' : status === 'no-match' ? 'does not match' : 'insufficient evidence or unsupported metric'}.` : 'The linked rule is no longer available. Choose another rule or remove this connection.'}</p> })()}
                <p className="mt-2 text-[10px] leading-relaxed text-slate-500">Rule conditions stay managed in Report Design. This connection controls when the selected element appears; it does not edit the rule itself.</p>
              </div>
              <div><label className="mb-1.5 block text-[11px] font-semibold text-slate-600">Connected measure</label><select value={selected.metric || 'accuracy'} onChange={e => updateElement(selected.id, { metric: e.target.value as Metric })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs">{metricOptions.map(metric => <option key={metric.id} value={metric.id}>{metric.label}</option>)}</select></div>
              {selected.kind === 'text' && <div className="space-y-3 rounded-xl border border-teal-100 bg-teal-50/40 p-3">
                <div><p className="text-xs font-bold text-slate-800">Learning recommendation</p><p className="mt-1 text-[11px] text-slate-500">Attach a rule below to determine when this advice is appropriate. Only matching rules with sufficient evidence appear in the action plan.</p></div>
                <button type="button" onClick={() => updateElement(selected.id, { feedback: selected.feedback ? undefined : { learningTarget: selected.title, recommendedAction: '', successCriterion: '', priority: 'normal' } })} className="text-xs font-semibold text-teal-700">{selected.feedback ? 'Remove recommendation' : 'Add recommendation'}</button>
                {selected.feedback && <>
                  <label className="block text-[11px] text-slate-600">Learning target<input value={selected.feedback.learningTarget} onChange={e => updateElement(selected.id, { feedback: { ...selected.feedback!, learningTarget: e.target.value } })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"/></label>
                  <label className="block text-[11px] text-slate-600">Recommended action<textarea rows={3} value={selected.feedback.recommendedAction} onChange={e => updateElement(selected.id, { feedback: { ...selected.feedback!, recommendedAction: e.target.value } })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"/></label>
                  <label className="block text-[11px] text-slate-600">Success criterion<textarea rows={2} value={selected.feedback.successCriterion} onChange={e => updateElement(selected.id, { feedback: { ...selected.feedback!, successCriterion: e.target.value } })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"/></label>
                  <label className="block text-[11px] text-slate-600">Priority<select value={selected.feedback.priority} onChange={e => updateElement(selected.id, { feedback: { ...selected.feedback!, priority: e.target.value as 'high' | 'normal' } })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"><option value="normal">Normal</option><option value="high">High</option></select></label>
                  {!selected.rule && <p className="text-[11px] text-amber-700">Add an element rule below before this recommendation can appear.</p>}
                </>}
              </div>}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-slate-800">Element rule</span><button type="button" onClick={() => updateElement(selected.id, { rule: selected.rule ? undefined : { metric: selected.metric || 'accuracy', operator: 'lt', threshold: 40, minQuestions: 5, action: 'show' } })} className="text-xs font-semibold text-blue-700">{selected.rule ? 'Remove rule' : 'Add rule'}</button></div>
                {selected.rule ? <>
                  <label className="block text-[11px] text-slate-600">Evaluate measure<select value={selected.rule.metric} onChange={e => updateElement(selected.id, { rule: { ...selected.rule!, metric: e.target.value as Metric, groupLabel: undefined } })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs">{metricOptions.map(metric => <option key={metric.id} value={metric.id}>{metric.label}</option>)}</select></label>
                  {(selected.rule.metric === 'domain' || selected.rule.metric === 'taxonomy' || selected.rule.metric === 'difficulty') && <label className="block text-[11px] text-slate-600">Assessed category<select value={selected.rule.groupLabel || ''} onChange={e => updateElement(selected.id, { rule: { ...selected.rule!, groupLabel: e.target.value } })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"><option value="">Choose a category</option>{ruleGroups(selected.rule.metric).map((row, i) => <option key={`${row.label}-${i}`} value={row.label}>{row.label} ({row.total_questions} questions)</option>)}</select><span className="mt-1 block text-[10px] text-slate-500">Each category is evaluated independently using its own question count.</span></label>}
                  <label className="block text-[11px] text-slate-600">Threshold source<select value={selected.rule.thresholdSource || 'custom'} onChange={e => updateElement(selected.id, { rule: { ...selected.rule!, thresholdSource: e.target.value as 'custom' | 'strong' | 'moderate', threshold: e.target.value === 'strong' ? sharedCriteria.strongThreshold : e.target.value === 'moderate' ? sharedCriteria.moderateThreshold : selected.rule!.threshold } })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"><option value="custom">Custom threshold</option><option value="strong">Shared strong mastery ({sharedCriteria.strongThreshold}%)</option><option value="moderate">Shared moderate threshold ({sharedCriteria.moderateThreshold}%)</option></select><span className="mt-1 block text-[10px] text-slate-500">Shared thresholds are copied into this published version so historical reports keep their original criteria.</span></label>
                  <div className="grid grid-cols-2 gap-2"><label className="text-[11px] text-slate-600">Comparison<select value={selected.rule.operator} onChange={e => updateElement(selected.id, { rule: { ...selected.rule!, operator: e.target.value as 'lt' | 'gte' } })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"><option value="lt">Below</option><option value="gte">At least</option></select></label><label className="text-[11px] text-slate-600">Value<input type="number" value={selected.rule.threshold} onChange={e => updateElement(selected.id, { rule: { ...selected.rule!, threshold: Number(e.target.value) } })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"/></label></div>
                  <label className="block text-[11px] text-slate-600">Minimum assessed questions<input type="number" min={0} value={selected.rule.minQuestions} onChange={e => updateElement(selected.id, { rule: { ...selected.rule!, minQuestions: Math.max(0, Number(e.target.value)) } })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"/></label>
                  <label className="block text-[11px] text-slate-600">When matched<select value={selected.rule.action} onChange={e => updateElement(selected.id, { rule: { ...selected.rule!, action: e.target.value as 'show' | 'highlight' } })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"><option value="show">Show element</option><option value="highlight">Highlight element</option></select></label>
                  <p className="text-[11px] text-slate-500">Selected-attempt preview: {ruleStatus(selected.rule) === 'match' ? 'Rule matches' : ruleStatus(selected.rule) === 'insufficient' ? 'Not enough evidence, missing category, or metric unavailable' : 'Rule does not match'}. Only saved completed attempts are evaluated.</p>
                </> : <p className="text-[11px] text-slate-500">Without a rule, this element is always included in the draft.</p>}
              </div>
              <div><span className="mb-2 block text-[11px] font-semibold text-slate-600">Element width</span><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => updateElement(selected.id, { width: 'half' })} className={`rounded-xl border px-3 py-2.5 text-xs font-semibold ${selected.width === 'half' ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-600'}`}>Half width</button><button type="button" onClick={() => updateElement(selected.id, { width: 'full' })} className={`rounded-xl border px-3 py-2.5 text-xs font-semibold ${selected.width === 'full' ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-600'}`}>Full width</button></div></div>
              <div><span className="mb-2 block text-[11px] font-semibold text-slate-600">Accent color</span><div className="flex flex-wrap gap-2">{colors.map(color => <button key={color.value} type="button" title={color.label} aria-label={`${color.label} accent`} onClick={() => updateElement(selected.id, { accent: color.value })} className={`h-8 w-8 rounded-full border-2 transition ${selected.accent === color.value ? 'border-slate-900 ring-2 ring-slate-200 ring-offset-1' : 'border-white shadow-sm'}`} style={{ backgroundColor: color.value }} />)}</div></div>

              <button type="button" onClick={() => removeElement(selected.id)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 px-3 py-2.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"><Trash2 className="h-4 w-4" /> Remove element</button>
            </div>}
            <div className="mt-5 border-t border-slate-100 pt-4"><div className="flex gap-2"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400"/><p className="text-[10px] leading-relaxed text-slate-500">This first version saves the layout in this browser only. It does not change existing report templates or student results.</p></div></div>
          </aside>}
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 sm:flex-row sm:items-start"><CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-amber-800"/><p className="text-xs leading-relaxed text-amber-950"><strong>Current scope:</strong> This page controls layout and where existing feedback rules apply. Rule conditions and scoring bands remain managed under Scoring &amp; Criteria. A saved Studio layout is not yet the sole source for every student report and PDF; verify the actual student report before publishing a template.</p></div>
      </div>
    </AdminLayout>
  )
}
