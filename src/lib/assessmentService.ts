import { defaultScoringConfig, type AssessmentScoringConfig } from './scoringSchemes'
import { questionBankService, type QuestionBankItem } from './questionBankService'
import { supabase, isSupabaseConfigured } from './supabaseClient'

export interface AssessmentDeletionImpact {
  assessment_id: string
  assessment_name: string
  status: string
  attempts: number
  completed_attempts: number
  in_progress_attempts: number
  versions: number
  blockers: string[]
  can_delete: boolean
}

export interface StudentFieldConfig {
  id: string
  label: string
  type: 'text' | 'email' | 'number' | 'select'
  required: boolean
  enabled: boolean
  options?: string[]
}

export interface AssessmentSettings {
  scoring: AssessmentScoringConfig
  // Timing
  timerMode: 'per_section' | 'per_assessment' | 'untimed'
  timerMinutes: number
  timerEnabled: boolean

  // Navigation & Rules
  allowBack: boolean
  requireAnswer: boolean
  saveProgress: boolean
  shuffleQuestions: boolean
  shuffleChoices: boolean
  attempts: number

  // Results & Feedback
  showScore: boolean
  showCorrectAnswers: boolean
  showExplanations: boolean
  showAnalytics: boolean
  passingPercentage: number
  /** Scheme-specific passing grade. Optional for backward compatibility. */
  passingBenchmark?: { scheme: 'standard' | 'sat' | 'act' | 'est'; value: number }

  // Student Intake
  studentFields: StudentFieldConfig[]

  // Security
  passcodeEnabled: boolean
  passcode: string

  // Mastery Criteria
  mastery: {
    mastered: number
    proficient: number
    developing: number
    minEvidence: number
  }
}

export interface SectionSettings {
  /** Optional sections may be declined before their first question. Existing sections are required. */
  optional?: boolean
  timingEnabled: boolean
  timeLimitMinutes: number
  calculatorAllowed: boolean
  shuffleQuestions: boolean
  shuffleChoices: boolean
  allowBack: boolean
  requireAnswer: boolean
  hasBreakAfter: boolean
  breakDurationMinutes: number
  breakInstructions?: string
}

export interface SectionQuestionItem {
  id: string
  questionId: string
  displayOrder: number
  pointsOverride: number | null
  required: boolean
  questionSnapshot?: Partial<QuestionBankItem>
}

export interface AssessmentSection {
  id: string
  title: string
  description?: string
  displayOrder: number
  settings: SectionSettings
  questions: SectionQuestionItem[]
}

export interface Assessment {
  id: string
  title: string
  subtitle?: string
  description?: string
  subject: string
  grade: string
  instructions?: string
  status: 'draft' | 'published' | 'archived'
  /** Soft-removed from the active library; remains recoverable in Archived. */
  removedFromLibrary?: boolean
  attemptsCount?: number
  settings: AssessmentSettings
  sections: AssessmentSection[]
  /** Generic taxonomy relationships. Legacy exam/subject concepts remain separate compatibility metadata. */
  taxonomyIds?: string[]
  createdAt: string
  updatedAt: string
}

export const defaultAssessmentSettings: AssessmentSettings = {
  scoring: defaultScoringConfig,
  timerMode: 'per_section',
  timerMinutes: 60,
  timerEnabled: true,
  allowBack: true,
  requireAnswer: false,
  saveProgress: true,
  shuffleQuestions: false,
  shuffleChoices: false,
  attempts: 1,
  showScore: true,
  showCorrectAnswers: true,
  showExplanations: true,
  showAnalytics: true,
  passingPercentage: 70,
  studentFields: [
    { id: 'name', label: 'Student Full Name', type: 'text', required: true, enabled: true },
    { id: 'email', label: 'Student Email', type: 'email', required: false, enabled: true },
    { id: 'grade', label: 'Grade / Level', type: 'text', required: true, enabled: true },
    { id: 'studentId', label: 'Student ID Number', type: 'text', required: false, enabled: false },
  ],
  passcodeEnabled: false,
  passcode: '1234',
  mastery: {
    mastered: 85,
    proficient: 70,
    developing: 55,
    minEvidence: 2,
  },
}

export const defaultSectionSettings: SectionSettings = {
  optional: false,
  timingEnabled: true,
  timeLimitMinutes: 30,
  calculatorAllowed: true,
  shuffleQuestions: false,
  shuffleChoices: false,
  allowBack: true,
  requireAnswer: false,
  hasBreakAfter: false,
  breakDurationMinutes: 10,
  breakInstructions: 'Take a short break before starting the next section.',
}

function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Assessment IDs are persisted to assessments.id, which is a PostgreSQL UUID.
 * Keep UI/section IDs free-form, but always use a real UUID for assessment rows.
 */
function createUuid(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16)
    const value = char === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

/** Map one persisted row into the editor model; never invent section questions. */
function mapDatabaseAssessment(row: any): Assessment {
  const storedPayload = row.payload && typeof row.payload === 'object' ? row.payload : {}

  // Keep a defensive fallback for older rows that were written by the
  // previous representation. New saves always use payload.
  const legacySections = Array.isArray(row.sections) ? row.sections : []
  const sections = Array.isArray(storedPayload.sections)
    ? storedPayload.sections
    : legacySections

  const settings = {
    ...defaultAssessmentSettings,
    ...(storedPayload.settings && typeof storedPayload.settings === 'object'
      ? storedPayload.settings
      : {}),
  }

  return {
    id: String(row.id),
    title: row.name || row.title || 'Untitled Assessment',
    subtitle: typeof storedPayload.subtitle === 'string' ? storedPayload.subtitle : '',
    description: row.description || '',
    subject: storedPayload.subject || row.subject || 'Mathematics',
    grade: storedPayload.grade || row.grade || 'Grade 10',
    instructions:
      row.instructions ||
      storedPayload.instructions ||
      'Please complete all sections to the best of your ability.',
    // step90-6: synchronize removed assessment state even if a legacy edit saved draft.
    status: (storedPayload.removedFromLibrary === true ? 'archived'
      : (row.status || (row.is_published ? 'published' : 'draft'))) as Assessment['status'],
    removedFromLibrary: storedPayload.removedFromLibrary === true,
    attemptsCount: Number.isFinite(storedPayload.attemptsCount)
      ? Number(storedPayload.attemptsCount)
      : 0,
    settings,
    sections,
    taxonomyIds: Array.isArray(storedPayload.taxonomyIds) ? storedPayload.taxonomyIds : [],
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  }
}

let _assessmentsCache: Assessment[] = []

export const assessmentService = {
  getStoredAssessments(): Assessment[] {
    return _assessmentsCache
  },

  saveStoredAssessments(assessments: Assessment[]): void {
    _assessmentsCache = assessments
  },

  /**
   * Resolve the authenticated user's organization. The assessments table requires
   * organization_id, while the editor's Assessment model intentionally keeps that
   * database concern outside the UI model.
   */
  async getCurrentOrganizationId(): Promise<string> {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
    }

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError

    const userId = userData.user?.id
    if (!userId) throw new Error('You must be signed in to save an assessment.')

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', userId)
      .maybeSingle()

    if (profileError) throw profileError
    if (!profile?.organization_id) {
      throw new Error('Your account is not associated with an organization.')
    }

    return String(profile.organization_id)
  },

  /**
   * Persist the complete editor model using the actual assessments schema.
   *
   * The structured assessment model (sections, questions, settings, etc.) lives
   * in the payload JSONB column. Only fields that actually exist on the
   * assessments table are written as top-level columns.
   */
  async syncAssessmentToDatabase(assessment: Assessment): Promise<void> {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
    }
    if (!isUuid(assessment.id)) throw new Error('Invalid assessment ID.')
    if (assessment.removedFromLibrary && assessment.status !== 'archived') {
      throw new Error('This assessment was removed from the library. Restore it before editing or publishing.')
    }

    // Keep the existing payload-based editor model. The normalized modules and
    // module_questions tables are not currently written by this service.
    const taxonomyIds = Array.from(
      new Set((assessment.taxonomyIds || []).map(String).map((id) => id.trim()).filter(Boolean))
    )
    for (const taxonomyId of taxonomyIds) {
      if (!isUuid(taxonomyId)) throw new Error(`Invalid taxonomy ID: ${taxonomyId}`)
    }

    const payload = {
      subtitle: assessment.subtitle || '',
      subject: assessment.subject || 'Mathematics',
      grade: assessment.grade || 'Grade 10',
      attemptsCount: assessment.attemptsCount ?? 0,
      settings: assessment.settings,
      sections: assessment.sections || [],
      taxonomyIds,
      ...(assessment.removedFromLibrary ? { removedFromLibrary: true } : {}),
    }

    // Step 30: a single PostgreSQL function saves the assessment row and
    // taxonomy relationships transactionally, under the caller's RLS policies.
    // Install migration 0043 before deploying this file. Never fall back to
    // multi-request writes, as that would silently lose the atomicity guarantee.
    const { data: savedId, error: saveError } = await supabase.rpc('save_assessment_atomic_v1', {
      p_assessment_id: assessment.id,
      p_name: assessment.title,
      p_description: assessment.description || '',
      p_instructions: assessment.instructions || '',
      p_status: assessment.status,
      p_payload: payload,
      p_taxonomy_ids: taxonomyIds,
      p_created_at: assessment.createdAt || new Date().toISOString(),
    })

    if (saveError) {
      if (saveError.code === 'PGRST202' || saveError.message.includes('save_assessment_atomic_v1')) {
        throw new Error('Atomic save RPC is unavailable. Apply migration 0043_assessment_payload_taxonomy_atomic.sql before using this version of the app. ' + saveError.message)
      }
      throw saveError
    }
    if (savedId !== assessment.id) {
      throw new Error(`Assessment ${assessment.id} was not confirmed by the atomic database save.`)
    }

    // Verify the saved row can be read with the current session; this catches
    // SELECT policy mismatch before the editor reports a successful save.
    const { data: verified, error: readError } = await supabase
      .from('assessments')
      .select('id')
      .eq('id', assessment.id)
      .maybeSingle()
    if (readError) throw readError
    if (!verified) {
      throw new Error(`Assessment ${assessment.id} was saved but is not readable. Check assessments SELECT RLS permissions.`)
    }
  },

  /**
   * Delete an assessment from database
   */
  async deleteAssessmentFromDatabase(id: string): Promise<void> {
    const { data, error } = await supabase.rpc('remove_assessment_from_library_safely_v1', { p_assessment_id: id })
    if (error) throw error
    if (data !== true) throw new Error('Assessment removal was not confirmed by the database.')
  },

  /** Restores a soft-removed archived assessment without touching its history. */
  async restoreAssessment(id: string): Promise<void> {
    if (!isUuid(id)) throw new Error('Invalid assessment ID.')
    const { data, error } = await supabase.rpc('restore_assessment_to_library_v1', { p_assessment_id: id })
    if (error) throw error
    if (data !== true) throw new Error('Assessment restoration was not confirmed.')
  },

  /** Read-only, organization-scoped deletion preview. */
  async getDeletionImpact(id: string): Promise<AssessmentDeletionImpact> {
    if (!isUuid(id)) throw new Error('Invalid assessment ID.')
    const {data,error}=await supabase.rpc('assessment_deletion_impact_v1',{p_assessment_id:id})
    if(error) throw error
    if(!data || data.assessment_id!==id || !Array.isArray(data.blockers))
      throw new Error('Invalid deletion preview received from server.')
    return data as AssessmentDeletionImpact
  },

  /** Transactional server deletion; never operates on Question Bank or taxonomy. */
  async permanentlyDeleteAssessment(id:string, exactName:string, deleteAttempts:boolean):Promise<{deleted_attempts:number;deleted_versions:number}> {
    if(!isUuid(id)) throw new Error('Invalid assessment ID.')
    const {data,error}=await supabase.rpc('permanently_delete_assessment_v2',{
      p_assessment_id:id,p_confirm_name:exactName,p_delete_attempts:deleteAttempts
    })
    if(error) throw error
    if(data?.deleted!==true || data?.assessment_id!==id) throw new Error('Server did not confirm deletion.')
    try { this.saveStoredAssessments(this.getStoredAssessments().filter((a)=>a.id!==id)) } catch { /* Database deletion is authoritative. */ }
    return {deleted_attempts:Number(data.deleted_attempts)||0,deleted_versions:Number(data.deleted_versions)||0}
  },

  /** Only succeeds for archived assessments with no linked attempts/dependencies. */
  async permanentlyDeleteUnusedAssessment(id: string): Promise<void> {
    if (!isUuid(id)) throw new Error('Invalid assessment ID.')
    const { data, error } = await supabase.rpc('permanently_delete_unused_assessment_v1', { p_assessment_id: id })
    if (error) throw error
    if (data !== true) throw new Error('Permanent deletion was not confirmed.')
    this.saveStoredAssessments(this.getStoredAssessments().filter((a) => a.id !== id))
  },

  /**
   * Fetch all assessments from database without any programmatic seeding
   */
  async fetchAssessmentsFromDatabase(): Promise<Assessment[]> {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
    }
    const { data, error } = await supabase
      .from('assessments')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error

    const mapped: Assessment[] = (data ?? [])
      .map(mapDatabaseAssessment)
    if (mapped.length > 0) {
      const taxonomyPairs: [string, string[]][] = await Promise.all(
        mapped.map(async (assessment): Promise<[string, string[]]> => {
          const taxonomyIds = await this.fetchAssessmentTaxonomyIds(assessment.id)
          return [assessment.id, taxonomyIds]
        })
      )
      const taxonomyMap = new Map<string, string[]>(taxonomyPairs)
      mapped.forEach((assessment) => {
        assessment.taxonomyIds = taxonomyMap.get(assessment.id) || []
      })
    }

    _assessmentsCache = mapped
    return _assessmentsCache
  },

  /**
   * Fetch one assessment directly by primary key rather than relying on a
   * potentially incomplete list or an in-memory copy. Returns null only when
   * Supabase cannot see the row (not found or blocked by SELECT RLS).
   */
  async fetchAssessmentById(id: string): Promise<Assessment | null> {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error('Supabase is not configured.')
    }
    if (!isUuid(id)) throw new Error('Invalid assessment ID.')

    const { data, error } = await supabase
      .from('assessments')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!data) return null

    const assessment = mapDatabaseAssessment(data)
    assessment.taxonomyIds = await this.fetchAssessmentTaxonomyIds(id)

    // The database is authoritative; retain the verified model for synchronous
    // section/question editor methods without persisting local-only changes.
    const others = this.getStoredAssessments().filter((item) => item.id !== id)
    this.saveStoredAssessments([assessment, ...others])
    return assessment
  },

  /**
   * Sync all assessments to database
   */
  async syncAllToDatabase(list?: Assessment[]): Promise<void> {
    const assessmentsToSync = list || this.getStoredAssessments()
    for (const a of assessmentsToSync) {
      await this.syncAssessmentToDatabase(a)
    }
  },

  getAssessments(): Assessment[] {
    return this.getStoredAssessments()
  },

  getAssessmentById(id: string): Assessment | null {
    const list = this.getStoredAssessments()
    return list.find((a) => a.id === id) || null
  },

  /**
   * Read the generic taxonomy relationships configured for an assessment.
   * This is intentionally separate from legacy exam_id compatibility.
   */
  async fetchAssessmentTaxonomyIds(assessmentId: string): Promise<string[]> {
    if (!supabase || !isSupabaseConfigured || !assessmentId) return []

    const { data, error } = await supabase
      .from('assessment_taxonomies')
      .select('taxonomy_id')
      .eq('assessment_id', assessmentId)
      .order('sort_order', { ascending: true })

    if (error) throw error
    return (data || [])
      .map((row: any) => String(row.taxonomy_id))
      .filter(Boolean)
  },

  /**
   * Replace the complete generic taxonomy relationship set for an assessment.
   * An empty array is a valid explicit configuration.
   */
  async setAssessmentTaxonomies(assessmentId: string, taxonomyIds: string[]): Promise<void> {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
    }
    if (!assessmentId) throw new Error('Assessment ID is required.')

    const uniqueTaxonomyIds = Array.from(
      new Set((taxonomyIds || []).map(String).map((id) => id.trim()).filter(Boolean))
    )

    const { data: existingRows, error: fetchError } = await supabase
      .from('assessment_taxonomies')
      .select('taxonomy_id, is_primary, sort_order')
      .eq('assessment_id', assessmentId)
    if (fetchError) throw fetchError

    const desired = new Set(uniqueTaxonomyIds)
    const existing = new Set((existingRows || []).map((row: { taxonomy_id: string }) => String(row.taxonomy_id)))

    // Insert missing relationships first; a failed insert cannot erase existing links.
    const toInsert = uniqueTaxonomyIds
      .filter((id) => !existing.has(id))
      .map((taxonomyId, index) => ({
        assessment_id: assessmentId,
        taxonomy_id: taxonomyId,
        is_primary: uniqueTaxonomyIds[0] === taxonomyId,
        sort_order: uniqueTaxonomyIds.indexOf(taxonomyId),
      }))
    if (toInsert.length > 0) {
      const { error } = await supabase.from('assessment_taxonomies').insert(toInsert)
      if (error) throw error
    }

    // Reorder and update primary status for retained relationships.
    for (let index = 0; index < uniqueTaxonomyIds.length; index++) {
      const taxonomyId = uniqueTaxonomyIds[index]
      if (!existing.has(taxonomyId)) continue
      const { error } = await supabase.from('assessment_taxonomies')
        .update({ is_primary: index === 0, sort_order: index })
        .eq('assessment_id', assessmentId)
        .eq('taxonomy_id', taxonomyId)
      if (error) throw error
    }

    for (const row of (existingRows || []) as Array<{ taxonomy_id: string }>) {
      if (desired.has(String(row.taxonomy_id))) continue
      const { error } = await supabase.from('assessment_taxonomies')
        .delete()
        .eq('assessment_id', assessmentId)
        .eq('taxonomy_id', row.taxonomy_id)
      if (error) throw error
    }

  },

  async addAssessmentTaxonomy(assessmentId: string, taxonomyId: string, isPrimary = false): Promise<void> {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
    }
    if (!assessmentId || !taxonomyId) return

    const existing = await this.fetchAssessmentTaxonomyIds(assessmentId)
    if (existing.includes(taxonomyId)) return

    const { error } = await supabase
      .from('assessment_taxonomies')
      .insert({
        assessment_id: assessmentId,
        taxonomy_id: taxonomyId,
        is_primary: isPrimary || existing.length === 0,
        sort_order: existing.length,
      })

    if (error) throw error
  },

  async removeAssessmentTaxonomy(assessmentId: string, taxonomyId: string): Promise<void> {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
    }
    if (!assessmentId || !taxonomyId) return

    const { error } = await supabase
      .from('assessment_taxonomies')
      .delete()
      .eq('assessment_id', assessmentId)
      .eq('taxonomy_id', taxonomyId)

    if (error) throw error

    // If the removed taxonomy was primary, promote the first remaining one.
    const remaining = await this.fetchAssessmentTaxonomyIds(assessmentId)
    if (remaining.length > 0) {
      const { error: promoteError } = await supabase
        .from('assessment_taxonomies')
        .update({ is_primary: true })
        .eq('assessment_id', assessmentId)
        .eq('taxonomy_id', remaining[0])

      if (promoteError) throw promoteError
    }
  },

  createAssessment(payload: Partial<Assessment>): Assessment {
    const list = this.getStoredAssessments()

    const newId = isUuid(payload.id) ? payload.id : createUuid()
    // Draft sections may be empty; never manufacture question references.
    const defaultInitialSection: AssessmentSection = {
      id: uid('sec'),
      title: 'Section 1: General',
      description: 'Primary assessment section',
      displayOrder: 0,
      settings: { ...defaultSectionSettings },
      questions: [],
    }

    const newAssessment: Assessment = {
      id: newId,
      title: payload.title || 'Untitled Diagnostic Assessment',
      subtitle: payload.subtitle || '',
      description: payload.description || '',
      subject: payload.subject || 'Mathematics',
      grade: payload.grade || 'Grade 10',
      instructions: payload.instructions || 'Please complete all sections to the best of your ability.',
      status: payload.status || 'draft',
      attemptsCount: 0,
      settings: {
        ...defaultAssessmentSettings,
        ...(payload.settings || {}),
      },
      taxonomyIds: Array.isArray(payload.taxonomyIds) ? [...payload.taxonomyIds] : [],
      sections:
        payload.sections && payload.sections.length > 0
          ? payload.sections.map((sec, idx) => ({
              ...sec,
              displayOrder: idx,
              questions: sec.questions || [],
            }))
          : [defaultInitialSection],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    list.unshift(newAssessment)
    this.saveStoredAssessments(list)

    // Caller explicitly awaits persistence and handles failures.

    return newAssessment
  },

  updateAssessment(
    id: string,
    updates: Partial<Assessment>,
    options?: { skipDatabaseSync?: boolean }
  ): Assessment {
    const list = this.getStoredAssessments()
    const idx = list.findIndex((a) => a.id === id)
    if (idx === -1) {
      throw new Error(`Assessment with ID "${id}" not found.`)
    }

    const current = list[idx]
    const updated: Assessment = {
      ...current,
      ...updates,
      settings: {
        ...current.settings,
        ...(updates.settings || {}),
      },
      sections: updates.sections ? updates.sections : current.sections,
      updatedAt: new Date().toISOString(),
    }

    // Ensure at least 1 section exists
    if (!updated.sections || updated.sections.length === 0) {
      throw new Error('An assessment must have at least one section.')
    }

    // Draft assessments may temporarily contain empty sections while the
    // assessment is being authored. Published assessments are validated at
    // the delivery boundary.
    if (updated.status === 'published') {
      for (const sec of updated.sections) {
        if (!sec.questions || sec.questions.length === 0) {
          throw new Error(`Cannot publish assessment: section "${sec.title}" must have at least one question.`)
        }
      }
    }

    list[idx] = updated
    this.saveStoredAssessments(list)

    // This is a synchronous in-memory editor mutation only. Callers must await
    // syncAssessmentToDatabase(updated) before reporting successful persistence.
    // skipDatabaseSync is retained for backward compatibility.
    void options

    return updated
  },

  async publishAssessment(assessmentId: string): Promise<Assessment> {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
    }
    if (!assessmentId) throw new Error('Assessment ID is required.')

    const assessment = this.getAssessmentById(assessmentId)
    if (!assessment) throw new Error('Assessment not found.')

    for (const sec of assessment.sections) {
      if (!sec.questions || sec.questions.length === 0) {
        throw new Error(`Cannot publish assessment: section "${sec.title}" must have at least one question.`)
      }
    }

    // Persist the complete assessment first, then mark it published. This keeps
    // the database and the local editor model aligned without relying on any
    // obsolete top-level assessment columns.
    const updated: Assessment = {
      ...assessment,
      status: 'published',
      updatedAt: new Date().toISOString(),
    }

    await this.syncAssessmentToDatabase(updated)
    this.saveStoredAssessments(
      this.getStoredAssessments().map((item) =>
        item.id === assessmentId ? updated : item
      )
    )

    return updated
  },

  async deleteAssessment(id: string): Promise<void> {
    await this.deleteAssessmentFromDatabase(id)
    this.saveStoredAssessments(this.getStoredAssessments().filter((a) => a.id !== id))
  },

  duplicateAssessment(id: string): Assessment {
    const orig = this.getAssessmentById(id)
    if (!orig) {
      throw new Error(`Assessment with ID "${id}" not found.`)
    }

    // Smart duplicate title: avoids runaway "Title (Copy) (Copy)"
    let baseTitle = orig.title.trim()
    const copyMatch = baseTitle.match(/^(.*?)\s*\(Copy(?:\s+(\d+))?\)$/i)
    if (copyMatch) {
      baseTitle = copyMatch[1].trim()
    }

    const all = this.getStoredAssessments()
    const existingTitles = new Set(all.map((a) => a.title.toLowerCase()))

    let newTitle = `${baseTitle} (Copy)`
    if (existingTitles.has(newTitle.toLowerCase())) {
      let counter = 2
      while (existingTitles.has(`${baseTitle} (Copy ${counter})`.toLowerCase())) {
        counter++
      }
      newTitle = `${baseTitle} (Copy ${counter})`
    }

    const uniqueSuffix = `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`
    const cloned: Assessment = {
      ...JSON.parse(JSON.stringify(orig)),
      id: createUuid(),
      title: newTitle,
      status: 'draft',
      removedFromLibrary: false,
      attemptsCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    // Re-generate section and question item IDs to guarantee 100% uniqueness
    cloned.sections = (cloned.sections || []).map((sec, sIdx) => {
      const secId = `sec_${uniqueSuffix}_${sIdx}`
      return {
        ...sec,
        id: secId,
        displayOrder: sIdx,
        questions: (sec.questions || []).map((q, qIdx) => ({
          ...q,
          id: `sq_${uniqueSuffix}_${sIdx}_${qIdx}`,
          displayOrder: qIdx,
        })),
      }
    })

    const list = this.getStoredAssessments()
    list.unshift(cloned)
    this.saveStoredAssessments(list)

    // Caller explicitly awaits persistence before reporting success.

    return cloned
  },

  /** Duplicate a database-visible assessment and verify the new record before navigating. */
  async duplicateAssessmentAndPersist(id: string): Promise<Assessment> {
    const source = await this.fetchAssessmentById(id)
    if (!source) {
      throw new Error(
        `Cannot duplicate assessment ${id}: the source record is not readable in Supabase.`
      )
    }

    const clone = this.duplicateAssessment(source.id)
    try {
      await this.syncAssessmentToDatabase(clone)
      const persisted = await this.fetchAssessmentById(clone.id)
      if (!persisted) {
        throw new Error(
          `The duplicated assessment ${clone.id} is not readable after saving. ` +
          'Check the assessments RLS SELECT policy for draft assessments.'
        )
      }
      return persisted
    } catch (error) {
      // Roll back only the transient editor entry, not database records: an
      // earlier DB operation might already have succeeded.
      this.saveStoredAssessments(
        this.getStoredAssessments().filter((item) => item.id !== clone.id)
      )
      throw error
    }
  },

  duplicateSection(assessmentId: string, sectionId: string, options?: { skipDatabaseSync?: boolean }): Assessment {
    const assessment = this.getAssessmentById(assessmentId)
    if (!assessment) throw new Error('Assessment not found.')

    const secIdx = assessment.sections.findIndex((s) => s.id === sectionId)
    if (secIdx === -1) throw new Error('Section not found.')

    const origSec = assessment.sections[secIdx]
    const uniqueSuffix = `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`

    const clonedSec: AssessmentSection = {
      ...JSON.parse(JSON.stringify(origSec)),
      id: `sec_${uniqueSuffix}`,
      title: `${origSec.title} (Copy)`,
      displayOrder: secIdx + 1,
      questions: (origSec.questions || []).map((q, qIdx) => ({
        ...q,
        id: `sq_${uniqueSuffix}_${qIdx}`,
        displayOrder: qIdx,
      })),
    }

    const updatedSections = [...assessment.sections]
    updatedSections.splice(secIdx + 1, 0, clonedSec)
    updatedSections.forEach((s, idx) => {
      s.displayOrder = idx
    })

    return this.updateAssessment(assessmentId, { sections: updatedSections }, options)
  },

  duplicateQuestion(assessmentId: string, sectionId: string, questionItemId: string, options?: { skipDatabaseSync?: boolean }): Assessment {
    const assessment = this.getAssessmentById(assessmentId)
    if (!assessment) throw new Error('Assessment not found.')

    const secIdx = assessment.sections.findIndex((s) => s.id === sectionId)
    if (secIdx === -1) throw new Error('Section not found.')

    const sec = assessment.sections[secIdx]
    const qIdx = sec.questions.findIndex((q) => q.id === questionItemId)
    if (qIdx === -1) throw new Error('Question not found in section.')

    const origQ = sec.questions[qIdx]
    const uniqueSuffix = `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`

    const clonedQ: SectionQuestionItem = {
      ...JSON.parse(JSON.stringify(origQ)),
      id: `sq_${uniqueSuffix}`,
      displayOrder: qIdx + 1,
    }

    const updatedQuestions = [...sec.questions]
    updatedQuestions.splice(qIdx + 1, 0, clonedQ)
    updatedQuestions.forEach((q, idx) => {
      q.displayOrder = idx
    })

    const updatedSections = [...assessment.sections]
    updatedSections[secIdx] = {
      ...sec,
      questions: updatedQuestions,
    }

    return this.updateAssessment(assessmentId, { sections: updatedSections }, options)
  },

  // Section Management
  addSection(assessmentId: string, sectionPayload?: Partial<AssessmentSection>, options?: { skipDatabaseSync?: boolean }): Assessment {
    const assessment = this.getAssessmentById(assessmentId)
    if (!assessment) throw new Error('Assessment not found.')

    const newSection: AssessmentSection = {
      id: uid('sec'),
      title: sectionPayload?.title || `Section ${assessment.sections.length + 1}`,
      description: sectionPayload?.description || '',
      displayOrder: assessment.sections.length,
      settings: {
        ...defaultSectionSettings,
        ...(sectionPayload?.settings || {}),
      },
      questions: sectionPayload?.questions || [],
    }

    const updatedSections = [...assessment.sections, newSection]
    return this.updateAssessment(assessmentId, { sections: updatedSections }, options)
  },

  updateSection(
    assessmentId: string,
    sectionId: string,
    updates: Partial<AssessmentSection>,
    options?: { skipDatabaseSync?: boolean }
  ): Assessment {
    const assessment = this.getAssessmentById(assessmentId)
    if (!assessment) throw new Error('Assessment not found.')

    const updatedSections = assessment.sections.map((sec) => {
      if (sec.id !== sectionId) return sec

      return {
        ...sec,
        ...updates,
        settings: {
          ...sec.settings,
          ...(updates.settings || {}),
        },
      }
    })

    return this.updateAssessment(assessmentId, { sections: updatedSections }, options)
  },

  deleteSection(assessmentId: string, sectionId: string, options?: { skipDatabaseSync?: boolean }): Assessment {
    const assessment = this.getAssessmentById(assessmentId)
    if (!assessment) throw new Error('Assessment not found.')

    if (assessment.sections.length <= 1) {
      throw new Error('An assessment must have at least one section.')
    }

    const updatedSections = assessment.sections
      .filter((sec) => sec.id !== sectionId)
      .map((sec, idx) => ({ ...sec, displayOrder: idx }))

    return this.updateAssessment(assessmentId, { sections: updatedSections }, options)
  },

  reorderSections(assessmentId: string, sectionIds: string[], options?: { skipDatabaseSync?: boolean }): Assessment {
    const assessment = this.getAssessmentById(assessmentId)
    if (!assessment) throw new Error('Assessment not found.')

    const map = new Map<string, AssessmentSection>(
      assessment.sections.map((s): [string, AssessmentSection] => [s.id, s])
    )
    const reordered: AssessmentSection[] = []

    sectionIds.forEach((id, idx) => {
      const sec = map.get(id)
      if (sec) {
        reordered.push({ ...sec, displayOrder: idx })
      }
    })

    // Add any missing sections
    assessment.sections.forEach((sec) => {
      if (!reordered.find((s) => s.id === sec.id)) {
        reordered.push({ ...sec, displayOrder: reordered.length })
      }
    })

    return this.updateAssessment(assessmentId, { sections: reordered }, options)
  },

  // Questions within Section Management
  addQuestionsToSection(
    assessmentId: string,
    sectionId: string,
    questionIds: string[],
    options?: { skipDatabaseSync?: boolean }
  ): Assessment {
    const assessment = this.getAssessmentById(assessmentId)
    if (!assessment) throw new Error('Assessment not found.')

    const bank = questionBankService.getStoredQuestions()
    const questionMap = new Map(bank.map((q) => [q.id, q]))

    const updatedSections = assessment.sections.map((sec) => {
      if (sec.id !== sectionId) return sec

      const existingIds = new Set(sec.questions.map((q) => q.questionId))
      const newItems: SectionQuestionItem[] = []

      questionIds.forEach((qId) => {
        if (!existingIds.has(qId)) {
          const bankQ = questionMap.get(qId)
          newItems.push({
            id: uid('sq'),
            questionId: qId,
            displayOrder: sec.questions.length + newItems.length,
            pointsOverride: 1,
            required: true,
            questionSnapshot: bankQ || undefined,
          })
        }
      })

      return {
        ...sec,
        questions: [...sec.questions, ...newItems],
      }
    })

    return this.updateAssessment(assessmentId, { sections: updatedSections }, options)
  },

  removeQuestionFromSection(
    assessmentId: string,
    sectionId: string,
    sectionQuestionId: string,
    options?: { skipDatabaseSync?: boolean }
  ): Assessment {
    const assessment = this.getAssessmentById(assessmentId)
    if (!assessment) throw new Error('Assessment not found.')

    const targetSection = assessment.sections.find((s) => s.id === sectionId)
    if (!targetSection) throw new Error('Section not found.')

    if (assessment.status === 'published' && targetSection.questions.length <= 1) {
      throw new Error('A published section must have at least 1 question.')
    }

    const updatedSections = assessment.sections.map((sec) => {
      if (sec.id !== sectionId) return sec

      const filteredQuestions = sec.questions
        .filter((q) => q.id !== sectionQuestionId && q.questionId !== sectionQuestionId)
        .map((q, idx) => ({ ...q, displayOrder: idx }))

      return {
        ...sec,
        questions: filteredQuestions,
      }
    })

    return this.updateAssessment(assessmentId, { sections: updatedSections }, options)
  },

  reorderSectionQuestions(
    assessmentId: string,
    sectionId: string,
    questionItemIds: string[],
    options?: { skipDatabaseSync?: boolean }
  ): Assessment {
    const assessment = this.getAssessmentById(assessmentId)
    if (!assessment) throw new Error('Assessment not found.')

    const updatedSections = assessment.sections.map((sec) => {
      if (sec.id !== sectionId) return sec

      const qMap = new Map<string, SectionQuestionItem>(
        sec.questions.map((q): [string, SectionQuestionItem] => [q.id, q])
      )
      const reordered: SectionQuestionItem[] = []

      questionItemIds.forEach((id, idx) => {
        const q = qMap.get(id)
        if (q) {
          reordered.push({ ...q, displayOrder: idx })
        }
      })

      return {
        ...sec,
        questions: reordered,
      }
    })

    return this.updateAssessment(assessmentId, { sections: updatedSections }, options)
  },

  updateSectionQuestion(
    assessmentId: string,
    sectionId: string,
    questionItemId: string,
    updates: Partial<SectionQuestionItem>,
    options?: { skipDatabaseSync?: boolean }
  ): Assessment {
    const assessment = this.getAssessmentById(assessmentId)
    if (!assessment) throw new Error('Assessment not found.')

    const updatedSections = assessment.sections.map((sec) => {
      if (sec.id !== sectionId) return sec

      const updatedQuestions = sec.questions.map((q) => {
        if (q.id !== questionItemId) return q
        return { ...q, ...updates }
      })

      return {
        ...sec,
        questions: updatedQuestions,
      }
    })

    return this.updateAssessment(assessmentId, { sections: updatedSections }, options)
  },

  exportAssessmentJSON(id: string): string {
    const a = this.getAssessmentById(id)
    if (!a) throw new Error('Assessment not found.')
    return JSON.stringify(a, null, 2)
  },

  importAssessmentJSON(jsonString: string): Assessment {
    const parsed = JSON.parse(jsonString)
    if (!parsed || !parsed.title || !Array.isArray(parsed.sections)) {
      throw new Error('Invalid assessment JSON format.')
    }

    const imported: Partial<Assessment> = {
      ...parsed,
      id: createUuid(),
      title: `${parsed.title} (Imported)`,
      status: 'draft',
      attemptsCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    return this.createAssessment(imported)
  },
}
