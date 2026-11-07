import { supabase } from './supabaseClient'
import {
  defaultAssessmentSettings,
  defaultSectionSettings,
  type Assessment,
  type AssessmentSection,
} from './assessmentService'
import type { QuestionBankItem } from './questionBankService'

export interface PinnedAssessmentVersion {
  assessment: Assessment
  questions: Map<string, QuestionBankItem>
  versionId: string
  versionNumber: number
}

export interface AssessmentVersionSummary {
  id: string
  version_number: number
  created_at: string
  name: string
  status: string
  sections: number
  questions: number
  attempts: number
}

function deserializeVersion(
  data: any,
  staffPreview: boolean
): PinnedAssessmentVersion {
  if (
    !data ||
    !data.assessment ||
    !data.questions ||
    !data.version_id
  ) {
    throw new Error(
      'Supabase did not return a complete assessment version.'
    )
  }

  const row = data.assessment
  const payload = row.payload

  if (!payload || !Array.isArray(payload.sections)) {
    throw new Error(
      'The saved assessment version contains invalid sections.'
    )
  }

  const sections: AssessmentSection[] =
    payload.sections.map((section: any) => ({
      ...section,
      settings: {
        ...defaultSectionSettings,
        ...(section.settings || {}),
      },
      questions: Array.isArray(section.questions)
        ? section.questions
        : [],
    }))

  const assessment: Assessment = {
    id: String(row.id),
    title: String(row.name || ''),
    subtitle: payload.subtitle || '',
    description: row.description || '',
    subject: payload.subject || 'Mathematics',
    grade: payload.grade || 'Grade 10',
    instructions: row.instructions || '',
    status: row.status || 'draft',
    attemptsCount: Number(payload.attemptsCount || 0),
    settings: {
      ...defaultAssessmentSettings,
      ...(payload.settings || {}),
    },
    sections,
    taxonomyIds: Array.isArray(payload.taxonomyIds)
      ? payload.taxonomyIds
      : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }

  const questions = new Map<string, QuestionBankItem>()

  for (const [id, value] of Object.entries(
    data.questions as Record<string, any>
  )) {
    if (!value || value.id !== id) {
      throw new Error(`Invalid question snapshot ${id}`)
    }

    questions.set(id, {
      ...value,
      choices: Array.isArray(value.choices)
        ? value.choices.map((choice: any) => ({
            ...choice,
            isCorrect: staffPreview
              ? Boolean(choice.isCorrect)
              : false,
          }))
        : [],
      numericAnswer: staffPreview
        ? value.numericAnswer
        : undefined,
      numericTolerance: staffPreview
        ? value.numericTolerance
        : undefined,
      explanation: staffPreview
        ? value.explanation
        : undefined,
    } as QuestionBankItem)
  }

  const required = new Set(
    sections.flatMap((section) =>
      section.questions.map((item) => item.questionId)
    )
  )

  const missing = [...required].filter(
    (id) => !questions.has(id)
  )

  if (missing.length > 0) {
    throw new Error(
      `Saved assessment version is missing ${
        missing.length
      } question snapshot(s): ${missing.join(', ')}`
    )
  }

  return {
    assessment,
    questions,
    versionId: String(data.version_id),
    versionNumber: Number(data.version_number),
  }
}

export const assessmentVersionService = {
  async listHistory(
    assessmentId: string
  ): Promise<AssessmentVersionSummary[]> {
    const { data, error } = await supabase.rpc(
      'list_assessment_versions_v1',
      {
        p_assessment_id: assessmentId,
      }
    )

    if (error) throw error

    if (!Array.isArray(data)) {
      throw new Error(
        'Invalid assessment version history response.'
      )
    }

    return data as AssessmentVersionSummary[]
  },

  async loadForAttempt(
    attemptId: string,
    resumeToken: string
  ): Promise<PinnedAssessmentVersion> {
    if (!resumeToken) {
      throw new Error(
        'Missing attempt resume token. Start from the assessment registration page.'
      )
    }

    const { data, error } = await supabase.rpc(
      'get_attempt_version_v1',
      {
        p_attempt_id: attemptId,
        p_resume_token: resumeToken,
      }
    )

    if (error) {
      throw new Error(
        `${error.message}${
          error.code ? ` — Code: ${error.code}` : ''
        }`
      )
    }

    return deserializeVersion(data, false)
  },

  async loadForStaffPreview(
    assessmentId: string
  ): Promise<PinnedAssessmentVersion> {
    if (!assessmentId) {
      throw new Error(
        'A saved assessment is required for staff trial preview.'
      )
    }

    const { data, error } = await supabase.rpc(
      'get_staff_assessment_preview_v1',
      {
        p_assessment_id: assessmentId,
      }
    )

    if (error) {
      throw new Error(
        `${error.message}${
          error.code ? ` — Code: ${error.code}` : ''
        }`
      )
    }

    return deserializeVersion(data, true)
  },
}