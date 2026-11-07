/** Step 89 — validated AI-generated assessment blueprints. No DB writes in this module. */
import {
  defaultAssessmentSettings, defaultSectionSettings,
  type Assessment, type AssessmentSection, type AssessmentSettings,
} from './assessmentService'
import { type QuestionBankItem } from './questionBankService'
import { validateScoringConfig, scoringSectionDefaults } from './scoringSchemes'

export interface BlueprintQuestion { bank: QuestionBankItem; points: number; required: boolean }
export interface BlueprintSection { title: string; description: string; settings: AssessmentSection['settings']; questions: BlueprintQuestion[] }
export interface ValidatedBlueprint {
  title: string; subtitle: string; description: string; subject: string; grade: string; instructions: string
  settings: AssessmentSettings; sections: BlueprintSection[]; warnings: string[]; questionCount: number
}
const obj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => typeof v === 'string' ? v.trim() : ''
const uuid = () => globalThis.crypto.randomUUID()
function fail(path: string, reason: string): never { throw new Error(`${path}: ${reason}`) }
function finite(v: unknown, min: number, max: number, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(path, `use a number from ${min} to ${max}`)
  return v
}
function boolean(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') fail(path, 'must be true or false')
  return v
}
function choose<T extends string>(v: unknown, allowed: readonly T[], path: string): T {
  if (!allowed.includes(v as T)) fail(path, `choose ${allowed.join(', ')}`)
  return v as T
}
function numeric(v: string): boolean { return /^[-+]?\d+(?:\.\d+)?(?:\s*\/\s*[-+]?\d+(?:\.\d+)?)?$/.test(v) && !/\/\s*[-+]?0(?:\.0+)?$/.test(v) }
function parseQuestion(raw: unknown, path: string, subject: string, warnings: string[]): BlueprintQuestion {
  if (!obj(raw)) fail(path, 'expected a question object')
  const prompt = str(raw.prompt ?? raw.question)
  if (!prompt) fail(`${path}.prompt`, 'question text is required')
  if (prompt.length > 12000) fail(`${path}.prompt`, 'question text is too long')
  const originalType = str(raw.type ?? raw.questionType).toLowerCase()
  const kind = originalType === 'mcq' || originalType === 'multiple_choice' ? 'multiple_choice'
    : originalType === 'grid_in' ? 'grid_in' : null
  if (!kind) fail(`${path}.type`, 'use MCQ or GRID_IN; True/False may be represented as a two-choice MCQ')
  const difficulty = raw.difficulty === undefined ? 'medium' : choose(raw.difficulty, ['easy','medium','hard'] as const, `${path}.difficulty`)
  const points = raw.points === undefined ? 1 : finite(raw.points, 0.01, 1000000, `${path}.points`)
  const choices: QuestionBankItem['choices'] = []
  let numericAnswer: string | undefined
  let gridAnswerKind: 'numeric' | 'text' | undefined
  let numericTolerance: string | undefined
  let numericAlternateAnswers: string[] | undefined
  if (kind === 'multiple_choice') {
    if (!Array.isArray(raw.choices) || raw.choices.length < 2 || raw.choices.length > 12) fail(`${path}.choices`, 'include 2–12 choices')
    raw.choices.forEach((item: unknown, index: number) => {
      if (!obj(item) || !str(item.text)) fail(`${path}.choices[${index}]`, 'choice text required')
      const correct = item.isCorrect ?? item.is_correct
      if (typeof correct !== 'boolean') fail(`${path}.choices[${index}].isCorrect`, 'must be true or false')
      choices.push({ id: uuid(), text: str(item.text), isCorrect: correct, rationale: str(item.rationale) })
    })
    if (choices.filter(c => c.isCorrect).length !== 1) fail(`${path}.choices`, 'exactly one answer must be correct')
  } else {
    gridAnswerKind = raw.gridAnswerKind === undefined && raw.answerFormat === undefined ? 'numeric'
      : choose(raw.gridAnswerKind ?? raw.answerFormat, ['numeric', 'text'] as const, `${path}.gridAnswerKind`)
    const key = raw.numericAnswer ?? raw.correct_answer ?? raw.correctAnswer
    numericAnswer = typeof key === 'number' ? String(key) : str(key)
    if (!numericAnswer) fail(`${path}.numericAnswer`, 'correct answer is required')
    if (numericAnswer.length > 500) fail(`${path}.numericAnswer`, 'answer is too long')
    const alts = raw.numericAlternateAnswers ?? raw.alternatives ?? []
    if (!Array.isArray(alts) || alts.length > 30 || alts.some((v: unknown) => typeof v !== 'string' || !v.trim() || v.length > 500)) fail(`${path}.alternatives`, 'provide at most 30 nonempty strings')
    numericAlternateAnswers = alts.map((v: string) => v.trim())
    numericTolerance = String(raw.numericTolerance ?? raw.tolerance ?? 0)
    if (gridAnswerKind === 'numeric') {
      if (![numericAnswer, ...numericAlternateAnswers].every(numeric)) fail(path, 'numeric keys must be numbers or fractions')
      const tolerance = Number(numericTolerance)
      if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 1000000) fail(`${path}.tolerance`, 'must be a nonnegative finite number')
    } else {
      numericTolerance = '0'
      warnings.push(`${path}: expression answers ignore whitespace and case, but are not algebraically simplified.`)
    }
  }
  const taxonomyNodeIds = raw.taxonomyNodeIds ?? []
  if (!Array.isArray(taxonomyNodeIds) || taxonomyNodeIds.some((v: unknown) => typeof v !== 'string' || !/^[0-9a-f-]{36}$/i.test(v))) fail(`${path}.taxonomyNodeIds`, 'use existing taxonomy node UUIDs only')
  const bank: QuestionBankItem = {
    id: uuid(), collection: str(raw.collection) || undefined,
    subject: str(raw.subject) || subject, domain: str(raw.domain ?? raw.category),
    chapter: str(raw.chapter), lesson: str(raw.lesson), taxonomyNodeIds,
    difficulty, questionType: kind,
    calculatorAllowed: raw.calculatorAllowed === undefined ? true : boolean(raw.calculatorAllowed, `${path}.calculatorAllowed`),
    estimatedSeconds: raw.estimatedSeconds === undefined ? 90 : finite(raw.estimatedSeconds, 10, 36000, `${path}.estimatedSeconds`),
    targetExam: str(raw.targetExam) || undefined, prompt,
    imageUrl: str(raw.imageUrl) || undefined, imageCaption: str(raw.imageCaption) || undefined,
    choices, numericAnswer, gridAnswerKind, numericTolerance, numericAlternateAnswers,
    explanation: str(raw.explanation), commonMisconception: str(raw.commonMisconception) || undefined,
  }
  if (raw.imageUrl && !/^https:\/\//i.test(str(raw.imageUrl))) fail(`${path}.imageUrl`, 'use an HTTPS image URL')
  return { bank, points, required: raw.required === undefined ? true : boolean(raw.required, `${path}.required`) }
}
export function validateAssessmentBlueprint(text: string): ValidatedBlueprint {
  if (text.length > 5 * 1024 * 1024) throw new Error('JSON is larger than 5 MB.')
  let input: unknown
  try { input = JSON.parse(text) } catch { throw new Error('Invalid JSON syntax.') }
  if (!obj(input)) throw new Error('Expected a JSON object with assessment and sections.')
  const root = input
  const meta = obj(root.assessment) ? root.assessment : root
  const title = str(meta.title ?? meta.name)
  if (!title || title.length > 200) fail('assessment.title', 'provide a title up to 200 characters')
  const sourceSections = root.sections ?? root.modules
  if (!Array.isArray(sourceSections) || sourceSections.length < 1 || sourceSections.length > 40) fail('sections', 'provide 1–40 sections')
  const subject = str(meta.subject) || 'Mathematics'
  const warnings: string[] = []
  let total = 0
  const sections: BlueprintSection[] = sourceSections.map((section: unknown, index: number) => {
    const path = `sections[${index}]`
    if (!obj(section)) fail(path, 'expected a section object')
    const title = str(section.title ?? section.name)
    if (!title) fail(`${path}.title`, 'section title is required')
    if (!Array.isArray(section.questions) || section.questions.length < 1) fail(`${path}.questions`, 'include at least one question')
    total += section.questions.length
    if (total > 1000) fail('sections', 'maximum 1000 questions')
    const settings: AssessmentSection['settings'] = { ...defaultSectionSettings }
    if (section.settings !== undefined && !obj(section.settings)) fail(`${path}.settings`, 'expected an object')
    const ss = section.settings || {}
    for (const key of ['optional','timingEnabled','calculatorAllowed','shuffleQuestions','shuffleChoices','allowBack','requireAnswer','hasBreakAfter'] as const) {
      if (ss[key] !== undefined) (settings as any)[key] = boolean(ss[key], `${path}.settings.${key}`)
    }
    for (const key of ['timeLimitMinutes','breakDurationMinutes'] as const) {
      if (ss[key] !== undefined) settings[key] = finite(ss[key], 0, 10080, `${path}.settings.${key}`)
    }
    if (ss.breakInstructions !== undefined) settings.breakInstructions = str(ss.breakInstructions)
    if (settings.timingEnabled && settings.timeLimitMinutes <= 0) fail(`${path}.settings.timeLimitMinutes`, 'timed section must have positive minutes')
    return { title, description: str(section.description), settings,
      questions: section.questions.map((q: unknown, qi: number) => parseQuestion(q, `${path}.questions[${qi}]`, subject, warnings)) }
  })
  const settings: AssessmentSettings = { ...defaultAssessmentSettings, scoring: { ...defaultAssessmentSettings.scoring }, mastery: { ...defaultAssessmentSettings.mastery }, studentFields: defaultAssessmentSettings.studentFields.map(f => ({ ...f })) }
  if (root.settings !== undefined && !obj(root.settings)) fail('settings', 'must be an object')
  const rawSettings = obj(root.settings) ? root.settings : {}
  const boolKeys = ['timerEnabled','allowBack','requireAnswer','saveProgress','shuffleQuestions','shuffleChoices','showScore','showCorrectAnswers','showExplanations','showAnalytics','passcodeEnabled'] as const
  for (const key of boolKeys) if (rawSettings[key] !== undefined) (settings as any)[key] = boolean(rawSettings[key], `settings.${key}`)
  if (rawSettings.timerMode !== undefined) settings.timerMode = choose(rawSettings.timerMode, ['untimed','per_section','per_assessment'] as const, 'settings.timerMode')
  if (rawSettings.timerMinutes !== undefined) settings.timerMinutes = finite(rawSettings.timerMinutes, 0, 10080, 'settings.timerMinutes')
  if (rawSettings.attempts !== undefined) settings.attempts = finite(rawSettings.attempts, 1, 100, 'settings.attempts')
  if (rawSettings.passingPercentage !== undefined) settings.passingPercentage = finite(rawSettings.passingPercentage, 0, 100, 'settings.passingPercentage')
  if (settings.timerMode === 'per_assessment' && settings.timerEnabled && settings.timerMinutes <= 0) fail('settings.timerMinutes', 'must be positive for timed assessment')
  if (settings.timerMode === 'untimed') settings.timerEnabled = false
  if (rawSettings.passingBenchmark !== undefined) {
    if (!obj(rawSettings.passingBenchmark)) fail('settings.passingBenchmark', 'expected an object')
    const scheme = choose(rawSettings.passingBenchmark.scheme, ['standard','sat','act','est'] as const, 'settings.passingBenchmark.scheme')
    const max = scheme === 'standard' ? 100 : scheme === 'act' ? 36 : 800
    const min = scheme === 'act' ? 1 : 0
    const value = finite(rawSettings.passingBenchmark.value, min, max, 'settings.passingBenchmark.value')
    if (scheme !== 'standard' && !Number.isInteger(value)) fail('settings.passingBenchmark.value', 'must be a whole number')
    settings.passingBenchmark = { scheme, value }
  }
  const scoring = rawSettings.scoring ?? { scheme: 'standard', mode: 'default', sections: [] }
  if (!obj(scoring)) fail('settings.scoring', 'expected an object')
  const scheme = choose(scoring.scheme, ['standard','sat','act','est'] as const, 'settings.scoring.scheme')
  const mode = choose(scoring.mode ?? 'default', ['default','custom'] as const, 'settings.scoring.mode')
  if (mode === 'custom') fail('settings.scoring.mode', 'custom conversion tables need manual review in the assessment editor; import default mode and configure there')
  settings.scoring = { scheme, mode, sections: [] }
  if (settings.passingBenchmark && settings.passingBenchmark.scheme !== scheme) fail('settings.passingBenchmark.scheme', 'must match selected scoring system')
  if (rawSettings.passcode !== undefined && settings.passcodeEnabled) fail('settings.passcode', 'for security, set passcode manually after importing')
  if (rawSettings.mastery !== undefined || rawSettings.studentFields !== undefined) warnings.push('Review mastery levels and student registration fields in the editor; these settings were not imported.')
  if (settings.passcodeEnabled) { settings.passcodeEnabled = false; warnings.push('Passcode is disabled in the draft. Configure a new passcode manually before publishing.') }
  if (scheme !== 'standard') warnings.push(`${scheme.toUpperCase()} scores are practice estimates; review scoring section roles and benchmark before publishing.`)
  return { title, subtitle: str(meta.subtitle), description: str(meta.description), subject,
    grade: str(meta.grade) || 'Grade 10', instructions: str(meta.instructions) || 'Answer all questions carefully.',
    settings, sections, warnings, questionCount: total }
}
export function materializeBlueprint(bp: ValidatedBlueprint): Partial<Assessment> {
  const sections: AssessmentSection[] = bp.sections.map((section, index) => ({
    id: `sec_${uuid()}`, title: section.title, description: section.description, displayOrder: index,
    settings: section.settings,
    questions: section.questions.map((question, i) => ({
      id: `sq_${uuid()}`, questionId: question.bank.id, displayOrder: i,
      pointsOverride: question.points, required: question.required, questionSnapshot: question.bank,
    })),
  }))
  if (bp.settings.scoring.scheme !== 'standard') {
    bp.settings.scoring.sections = sections.map(s => scoringSectionDefaults(bp.settings.scoring.scheme, s.id, s.title))
  }
  const errors = validateScoringConfig(bp.settings.scoring, sections)
  if (errors.length) throw new Error(`Scoring configuration: ${errors.join(' ')}`)
  return { title: bp.title, subtitle: bp.subtitle, description: bp.description,
    subject: bp.subject, grade: bp.grade, instructions: bp.instructions,
    status: 'draft', settings: bp.settings, sections, taxonomyIds: [] }
}
