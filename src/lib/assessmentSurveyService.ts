import { supabase, isSupabaseConfigured } from './supabaseClient'

export interface AssessmentSurvey {
  id: string
  assessmentId: string
  name: string
  description?: string
  instructions?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface SurveyQuestionOption {
  id: string
  questionId: string
  value: string
  label: string
  displayOrder: number
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface SurveyQuestion {
  id: string
  surveyId: string
  questionType: string
  prompt: string
  isRequired: boolean
  displayOrder: number
  config: Record<string, unknown>
  options: SurveyQuestionOption[]
  createdAt: string
  updatedAt: string
}

export interface AssessmentSurveyConfiguration {
  survey: AssessmentSurvey
  questions: SurveyQuestion[]
}

export interface CreateSurveyInput {
  assessmentId: string
  name: string
  description?: string
  instructions?: string
  isActive?: boolean
}

export interface UpdateSurveyInput {
  name?: string
  description?: string | null
  instructions?: string | null
  isActive?: boolean
}

export interface CreateSurveyQuestionInput {
  surveyId: string
  questionType: string
  prompt: string
  isRequired?: boolean
  displayOrder?: number
  config?: Record<string, unknown>
}

export interface UpdateSurveyQuestionInput {
  questionType?: string
  prompt?: string
  isRequired?: boolean
  displayOrder?: number
  config?: Record<string, unknown>
}

export interface CreateSurveyQuestionOptionInput {
  questionId: string
  value: string
  label: string
  displayOrder?: number
  metadata?: Record<string, unknown>
}

export interface UpdateSurveyQuestionOptionInput {
  value?: string
  label?: string
  displayOrder?: number
  metadata?: Record<string, unknown>
}

function requireConfigured(): void {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
    )
  }
}

function mapSurvey(row: any): AssessmentSurvey {
  return {
    id: String(row.id),
    assessmentId: String(row.assessment_id),
    name: String(row.name),
    description: row.description ?? undefined,
    instructions: row.instructions ?? undefined,
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapOption(row: any): SurveyQuestionOption {
  return {
    id: String(row.id),
    questionId: String(row.question_id),
    value: String(row.value),
    label: String(row.label),
    displayOrder: Number(row.display_order ?? 0),
    metadata:
      row.metadata && typeof row.metadata === 'object'
        ? row.metadata
        : {},
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapQuestion(row: any, options: SurveyQuestionOption[] = []): SurveyQuestion {
  return {
    id: String(row.id),
    surveyId: String(row.survey_id),
    questionType: String(row.question_type),
    prompt: String(row.prompt),
    isRequired: Boolean(row.is_required),
    displayOrder: Number(row.display_order ?? 0),
    config:
      row.config && typeof row.config === 'object'
        ? row.config
        : {},
    options,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

async function fetchQuestionsForSurvey(surveyId: string): Promise<SurveyQuestion[]> {
  const { data: questionRows, error: questionError } = await supabase
    .from('survey_questions')
    .select(
      'id, survey_id, question_type, prompt, is_required, display_order, config, created_at, updated_at'
    )
    .eq('survey_id', surveyId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (questionError) throw questionError

  const questions: SurveyQuestion[] = (questionRows || []).map((row: any) => mapQuestion(row))

  if (questions.length === 0) {
    return []
  }

  const questionIds = questions.map((question: SurveyQuestion) => question.id)

  const { data: optionRows, error: optionError } = await supabase
    .from('survey_question_options')
    .select(
      'id, question_id, value, label, display_order, metadata, created_at, updated_at'
    )
    .in('question_id', questionIds)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (optionError) throw optionError

  const optionsByQuestion = new Map<string, SurveyQuestionOption[]>()

  for (const row of optionRows || []) {
    const option = mapOption(row)
    const current = optionsByQuestion.get(option.questionId) || []
    current.push(option)
    optionsByQuestion.set(option.questionId, current)
  }

  return questions.map((question: SurveyQuestion) => ({
    ...question,
    options: optionsByQuestion.get(question.id) || [],
  }))
}

export const assessmentSurveyService = {
  async fetchSurveyByAssessment(
    assessmentId: string
  ): Promise<AssessmentSurveyConfiguration | null> {
    requireConfigured()

    const { data, error } = await supabase
      .from('assessment_surveys')
      .select(
        'id, assessment_id, name, description, instructions, is_active, created_at, updated_at'
      )
      .eq('assessment_id', assessmentId)
      .maybeSingle()

    if (error) throw error
    if (!data) return null

    const survey = mapSurvey(data)
    const questions = await fetchQuestionsForSurvey(survey.id)

    return {
      survey,
      questions,
    }
  },

  async fetchSurvey(surveyId: string): Promise<AssessmentSurveyConfiguration> {
    requireConfigured()

    const { data, error } = await supabase
      .from('assessment_surveys')
      .select(
        'id, assessment_id, name, description, instructions, is_active, created_at, updated_at'
      )
      .eq('id', surveyId)
      .single()

    if (error) throw error

    const survey = mapSurvey(data)
    const questions = await fetchQuestionsForSurvey(survey.id)

    return {
      survey,
      questions,
    }
  },

  async createSurvey(input: CreateSurveyInput): Promise<AssessmentSurvey> {
    requireConfigured()

    const name = input.name.trim()
    if (!name) {
      throw new Error('Survey name is required.')
    }

    if (!input.assessmentId) {
      throw new Error('Assessment ID is required.')
    }

    const { data, error } = await supabase
      .from('assessment_surveys')
      .insert({
        assessment_id: input.assessmentId,
        name,
        description: input.description?.trim() || null,
        instructions: input.instructions?.trim() || null,
        is_active: input.isActive ?? true,
      })
      .select(
        'id, assessment_id, name, description, instructions, is_active, created_at, updated_at'
      )
      .single()

    if (error) throw error

    return mapSurvey(data)
  },

  async updateSurvey(
    surveyId: string,
    updates: UpdateSurveyInput
  ): Promise<AssessmentSurvey> {
    requireConfigured()

    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (updates.name !== undefined) {
      const name = updates.name.trim()
      if (!name) throw new Error('Survey name is required.')
      payload.name = name
    }

    if (updates.description !== undefined) {
      payload.description = updates.description?.trim() || null
    }

    if (updates.instructions !== undefined) {
      payload.instructions = updates.instructions?.trim() || null
    }

    if (updates.isActive !== undefined) {
      payload.is_active = updates.isActive
    }

    const { data, error } = await supabase
      .from('assessment_surveys')
      .update(payload)
      .eq('id', surveyId)
      .select(
        'id, assessment_id, name, description, instructions, is_active, created_at, updated_at'
      )
      .single()

    if (error) throw error

    return mapSurvey(data)
  },

  async deleteSurvey(surveyId: string): Promise<void> {
    requireConfigured()

    const { error } = await supabase
      .from('assessment_surveys')
      .delete()
      .eq('id', surveyId)

    if (error) throw error
  },

  async createQuestion(
    input: CreateSurveyQuestionInput
  ): Promise<SurveyQuestion> {
    requireConfigured()

    const questionType = input.questionType.trim()
    const prompt = input.prompt.trim()

    if (!input.surveyId) throw new Error('Survey ID is required.')
    if (!questionType) throw new Error('Question type is required.')
    if (!prompt) throw new Error('Question prompt is required.')

    const { data, error } = await supabase
      .from('survey_questions')
      .insert({
        survey_id: input.surveyId,
        question_type: questionType,
        prompt,
        is_required: input.isRequired ?? false,
        display_order: input.displayOrder ?? 0,
        config: input.config ?? {},
      })
      .select(
        'id, survey_id, question_type, prompt, is_required, display_order, config, created_at, updated_at'
      )
      .single()

    if (error) throw error

    return mapQuestion(data)
  },

  async updateQuestion(
    questionId: string,
    updates: UpdateSurveyQuestionInput
  ): Promise<SurveyQuestion> {
    requireConfigured()

    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (updates.questionType !== undefined) {
      const questionType = updates.questionType.trim()
      if (!questionType) throw new Error('Question type is required.')
      payload.question_type = questionType
    }

    if (updates.prompt !== undefined) {
      const prompt = updates.prompt.trim()
      if (!prompt) throw new Error('Question prompt is required.')
      payload.prompt = prompt
    }

    if (updates.isRequired !== undefined) {
      payload.is_required = updates.isRequired
    }

    if (updates.displayOrder !== undefined) {
      payload.display_order = updates.displayOrder
    }

    if (updates.config !== undefined) {
      payload.config = updates.config
    }

    const { data, error } = await supabase
      .from('survey_questions')
      .update(payload)
      .eq('id', questionId)
      .select(
        'id, survey_id, question_type, prompt, is_required, display_order, config, created_at, updated_at'
      )
      .single()

    if (error) throw error

    return mapQuestion(data)
  },

  async deleteQuestion(questionId: string): Promise<void> {
    requireConfigured()

    const { error } = await supabase
      .from('survey_questions')
      .delete()
      .eq('id', questionId)

    if (error) throw error
  },

  async reorderQuestions(surveyId: string, questionIds: string[]): Promise<void> {
    requireConfigured()

    const uniqueIds = Array.from(new Set(questionIds.filter(Boolean)))

    for (let index = 0; index < uniqueIds.length; index += 1) {
      const { error } = await supabase
        .from('survey_questions')
        .update({
          display_order: index,
          updated_at: new Date().toISOString(),
        })
        .eq('id', uniqueIds[index])
        .eq('survey_id', surveyId)

      if (error) throw error
    }
  },

  async createOption(
    input: CreateSurveyQuestionOptionInput
  ): Promise<SurveyQuestionOption> {
    requireConfigured()

    const value = input.value.trim()
    const label = input.label.trim()

    if (!input.questionId) throw new Error('Question ID is required.')
    if (!value) throw new Error('Option value is required.')
    if (!label) throw new Error('Option label is required.')

    const { data, error } = await supabase
      .from('survey_question_options')
      .insert({
        question_id: input.questionId,
        value,
        label,
        display_order: input.displayOrder ?? 0,
        metadata: input.metadata ?? {},
      })
      .select(
        'id, question_id, value, label, display_order, metadata, created_at, updated_at'
      )
      .single()

    if (error) throw error

    return mapOption(data)
  },

  async updateOption(
    optionId: string,
    updates: UpdateSurveyQuestionOptionInput
  ): Promise<SurveyQuestionOption> {
    requireConfigured()

    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (updates.value !== undefined) {
      const value = updates.value.trim()
      if (!value) throw new Error('Option value is required.')
      payload.value = value
    }

    if (updates.label !== undefined) {
      const label = updates.label.trim()
      if (!label) throw new Error('Option label is required.')
      payload.label = label
    }

    if (updates.displayOrder !== undefined) {
      payload.display_order = updates.displayOrder
    }

    if (updates.metadata !== undefined) {
      payload.metadata = updates.metadata
    }

    const { data, error } = await supabase
      .from('survey_question_options')
      .update(payload)
      .eq('id', optionId)
      .select(
        'id, question_id, value, label, display_order, metadata, created_at, updated_at'
      )
      .single()

    if (error) throw error

    return mapOption(data)
  },

  async deleteOption(optionId: string): Promise<void> {
    requireConfigured()

    const { error } = await supabase
      .from('survey_question_options')
      .delete()
      .eq('id', optionId)

    if (error) throw error
  },

  async reorderOptions(questionId: string, optionIds: string[]): Promise<void> {
    requireConfigured()

    const uniqueIds = Array.from(new Set(optionIds.filter(Boolean)))

    for (let index = 0; index < uniqueIds.length; index += 1) {
      const { error } = await supabase
        .from('survey_question_options')
        .update({
          display_order: index,
          updated_at: new Date().toISOString(),
        })
        .eq('id', uniqueIds[index])
        .eq('question_id', questionId)

      if (error) throw error
    }
  },
}
