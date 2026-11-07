import { AssessmentPassingBenchmarkEditor } from '../components/AssessmentPassingBenchmarkEditor'
import { AssessmentScoringEditor } from '../components/AssessmentScoringEditor'
import React, { useState, useEffect, useMemo, useRef } from 'react'
import 'katex/dist/katex.min.css'
import { supabase } from '../lib/supabaseClient'
import { InlineMath, BlockMath } from 'react-katex'
import { useParams, Link, useNavigate } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import ShareAssessmentModal from '../components/ShareAssessmentModal'
import { useUnsavedChanges } from '../contexts/UnsavedChangesContext'
import ContentBlockRenderer from '../components/ContentBlockRenderer'
import MathRenderer from '../components/MathRenderer'
import { EditorActionButton, EditorActionLink, EditorMetric, EditorTabButton } from '../components/assessment-editor/EditorUI'
import {
  assessmentService,
  defaultSectionSettings,
  type Assessment,
  type AssessmentSection,
  type SectionSettings,
  type SectionQuestionItem,
  type StudentFieldConfig,
  defaultAssessmentSettings,
} from '../lib/assessmentService'
import { assessmentVersionService, type AssessmentVersionSummary } from '../lib/assessmentVersionService'
import {
  questionBankService,
  type QuestionBankItem,
  type GenericTaxonomy,
} from '../lib/questionBankService'
import {
  evaluationProfileService,
  type EvaluationProfile,
} from '../lib/evaluationProfileService'
import {
  assessmentSurveyService,
  type AssessmentSurvey,
  type SurveyQuestion,
  type SurveyQuestionOption,
} from '../lib/assessmentSurveyService'
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Clock,
  Calculator,
  Sliders,
  FileText,
  PlayCircle,
  Share2,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
  Check,
  X,
  Shuffle,
  Shield,
  Layers,
  GraduationCap,
  Sparkles,
  Coffee,
  Award,
  HelpCircle,
} from 'lucide-react'

export const AssessmentDetailPage: React.FC = () => {
  const { assessmentId } = useParams<{ assessmentId: string }>()
  const navigate = useNavigate()

  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [versionHistory, setVersionHistory] = useState<AssessmentVersionSummary[]>([])
  const [activeTab, setActiveTab] = useState<'settings' | 'sections' | 'survey' | 'preview'>('sections')
  const [sectionSearch, setSectionSearch] = useState('')
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<string[]>([])
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [savingStatus, setSavingStatus] = useState<string | null>(null)

  // Version metadata is staff-only. A failed history lookup must not block
  // the assessment editor; the save RPC remains authoritative.
  useEffect(() => {
    if (!assessmentId) return
    let cancelled = false
    assessmentVersionService.listHistory(assessmentId)
      .then((items) => { if (!cancelled) setVersionHistory(items) })
      .catch((error) => { console.warn('Could not load version history:', error) })
    return () => { cancelled = true }
  }, [assessmentId, saveSuccessMessage])

  // Section Settings Modal
  const [editingSection, setEditingSection] = useState<AssessmentSection | null>(null)
  const [sectionTitle, setSectionTitle] = useState('')
  const [sectionDesc, setSectionDesc] = useState('')
  const [sectionSettings, setSectionSettings] = useState<SectionSettings>({ ...defaultSectionSettings })
  // The edit page follows the same single dirty-state contract as Create Assessment.
  // The baseline is the last explicitly saved assessment state, so changing a value
  // and then changing it back automatically returns the page to a clean state.
  const savedAssessmentSnapshotRef = useRef<string | null>(null)
  const assessmentSnapshot = useMemo(
    () => (assessment ? JSON.stringify(assessment) : null),
    [assessment]
  )

  const assessmentDirty = Boolean(
    assessmentSnapshot &&
    savedAssessmentSnapshotRef.current !== null &&
    assessmentSnapshot !== savedAssessmentSnapshotRef.current
  )

  const sectionSettingsDirty = Boolean(
    editingSection &&
    (sectionTitle !== editingSection.title ||
      sectionDesc !== (editingSection.description || '') ||
      JSON.stringify(sectionSettings) !== JSON.stringify(editingSection.settings))
  )

  const editAssessmentDirty = assessmentDirty || sectionSettingsDirty

  // Question Bank Picker Modal
  const [pickerSectionId, setPickerSectionId] = useState<string | null>(null)
  const [bankQuestions, setBankQuestions] = useState<QuestionBankItem[]>([])
  const [bankQuestionsLoaded, setBankQuestionsLoaded] = useState(false)
  const [bankQuestionsError, setBankQuestionsError] = useState<string | null>(null)
  const [availableTaxonomies, setAvailableTaxonomies] = useState<GenericTaxonomy[]>([])
  const [taxonomyLoadError, setTaxonomyLoadError] = useState<string | null>(null)

  // Generic evaluation profile configuration
  const [availableEvaluationProfiles, setAvailableEvaluationProfiles] = useState<EvaluationProfile[]>([])
  const [selectedEvaluationProfileId, setSelectedEvaluationProfileId] = useState<string | null>(null)
  const [isLoadingEvaluationProfiles, setIsLoadingEvaluationProfiles] = useState(true)
  const [evaluationProfileLoadError, setEvaluationProfileLoadError] = useState<string | null>(null)
  const [isSavingEvaluationProfile, setIsSavingEvaluationProfile] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')

  // Normalized assessment survey configuration
  const [assessmentSurvey, setAssessmentSurvey] = useState<AssessmentSurvey | null>(null)
  const [surveyQuestions, setSurveyQuestions] = useState<SurveyQuestion[]>([])
  const [isLoadingSurvey, setIsLoadingSurvey] = useState(true)
  const [surveyLoadError, setSurveyLoadError] = useState<string | null>(null)
  const [isSavingSurvey, setIsSavingSurvey] = useState(false)
  const [newSurveyName, setNewSurveyName] = useState('Assessment Survey')
  const [pickerCollectionFilter, setPickerCollectionFilter] = useState('all')
  const [pickerTaxonomyId, setPickerTaxonomyId] = useState('')
  const [pickerTaxonomyNodeId, setPickerTaxonomyNodeId] = useState('all')
  const [pickerDomainFilter, setPickerDomainFilter] = useState('all')
  const [pickerChapterFilter, setPickerChapterFilter] = useState('all')
  const [pickerDifficultyFilter, setPickerDifficultyFilter] = useState('all')
  const [pickerTypeFilter, setPickerTypeFilter] = useState('all')
  const [pickerTaxonomyNodes, setPickerTaxonomyNodes] = useState<any[]>([])
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([])

  // Destructive-action confirmations
  const [pendingQuestionRemoval, setPendingQuestionRemoval] = useState<{
    sectionId: string
    questionItemId: string
    preview: string
  } | null>(null)
  const [isRemovingQuestion, setIsRemovingQuestion] = useState(false)
  const [pendingSectionRemoval, setPendingSectionRemoval] = useState<{
    sectionId: string
    title: string
    questionCount: number
  } | null>(null)
  const [isRemovingSection, setIsRemovingSection] = useState(false)

  // Share Modal
  const [showShareModal, setShowShareModal] = useState(false)

  useEffect(() => {
    if (assessmentId) {
      loadAssessment(assessmentId)
    }
    setBankQuestionsLoaded(false)
    setBankQuestionsError(null)
    questionBankService.fetchQuestionsFromDatabase()
      .then((qList) => {
        setBankQuestions(qList)
        setBankQuestionsLoaded(true)
      })
      .catch((error) => {
        setBankQuestions([])
        setBankQuestionsLoaded(false)
        setBankQuestionsError(
          error instanceof Error ? error.message : 'Could not load the Question Bank.'
        )
      })

    setTaxonomyLoadError(null)
    questionBankService.fetchGenericTaxonomies()
      .then((taxonomies) => setAvailableTaxonomies(taxonomies))
      .catch((error) => {
        console.warn('[Assessment Taxonomy] Failed to load generic taxonomies:', error)
        setAvailableTaxonomies([])
        setTaxonomyLoadError(
          error instanceof Error ? error.message : 'Failed to load available taxonomies.'
        )
      })

    setIsLoadingEvaluationProfiles(true)
    setEvaluationProfileLoadError(null)
    Promise.all([
      evaluationProfileService.fetchProfiles(),
      assessmentId
        ? evaluationProfileService.fetchAssessmentProfileId(assessmentId)
        : Promise.resolve(null),
    ])
      .then(([profiles, assignedProfileId]) => {
        setAvailableEvaluationProfiles(profiles)
        setSelectedEvaluationProfileId(assignedProfileId)
      })
      .catch((error) => {
        console.warn('[Assessment Evaluation] Failed to load evaluation profiles:', error)
        setAvailableEvaluationProfiles([])
        setSelectedEvaluationProfileId(null)
        setEvaluationProfileLoadError(
          error instanceof Error ? error.message : 'Failed to load evaluation profiles.'
        )
      })
      .finally(() => setIsLoadingEvaluationProfiles(false))

    if (!assessmentId) {
      setAssessmentSurvey(null)
      setSurveyQuestions([])
      setIsLoadingSurvey(false)
      return
    }

    setIsLoadingSurvey(true)
    setSurveyLoadError(null)
    assessmentSurveyService.fetchSurveyByAssessment(assessmentId)
      .then((configuration) => {
        setAssessmentSurvey(configuration?.survey || null)
        setSurveyQuestions(configuration?.questions || [])
      })
      .catch((error) => {
        console.warn('[Assessment Survey] Failed to load survey:', error)
        setAssessmentSurvey(null)
        setSurveyQuestions([])
        setSurveyLoadError(
          error instanceof Error ? error.message : 'Failed to load assessment survey.'
        )
      })
      .finally(() => setIsLoadingSurvey(false))
  }, [assessmentId])

  const loadAssessment = async (id: string) => {
    setSavingStatus('Loading assessment…')
    try {
      const data = await assessmentService.fetchAssessmentById(id)
      if (!data) {
        setErrorMessage(`This assessment could not be opened. Check that it exists and that you have permission to view it.`)
        return
      }

      // Keep the service cache aligned with the assessment currently displayed.
      // Section/question mutations use the service as their persistence boundary.
      const cached = assessmentService.getStoredAssessments()
      const existingIndex = cached.findIndex((item) => item.id === data!.id)
      if (existingIndex >= 0) {
        const next = [...cached]
        next[existingIndex] = data
        assessmentService.saveStoredAssessments(next)
      } else {
        assessmentService.saveStoredAssessments([data, ...cached])
      }

      setAssessment(data)
      savedAssessmentSnapshotRef.current = JSON.stringify(data)
    } catch (err: any) {
      console.error('Failed to load assessment:', err)
      setErrorMessage(err?.message || 'Failed to load the assessment.')
    } finally {
      setSavingStatus(null)
    }
  }

 async function persistAssessmentChanges() {
  if (!assessment) return

  setSavingStatus('Saving assessment changes…')

  try {
    // syncAssessmentToDatabase persists the current assessment but does not
    // return an Assessment object.
    await assessmentService.syncAssessmentToDatabase(assessment)

    // The assessment already represents the saved state locally.
    savedAssessmentSnapshotRef.current = JSON.stringify(assessment)

    setEditingSection(null)
    showNotification('Assessment changes saved successfully!')
  } finally {
    setSavingStatus(null)
  }
}

  const markAssessmentChanges = useUnsavedChanges(editAssessmentDirty, persistAssessmentChanges)

  const showNotification = (msg: string) => {
    setErrorMessage(null)
    setTaxonomyLoadError(null)
    setEvaluationProfileLoadError(null)
    setSurveyLoadError(null)
    setSaveSuccessMessage(msg)
    setTimeout(() => setSaveSuccessMessage(null), 3500)
  }

  // All operation failures must be visible even when the main assessment is already loaded.
  // Local feature-specific error states are preserved for their inline UI, while this
  // derived message guarantees a consistent global user-facing error toast.
  const globalErrorMessage =
    errorMessage ||
    taxonomyLoadError ||
    evaluationProfileLoadError ||
    surveyLoadError

  const handleDuplicateAssessment = async () => {
    if (!assessment || savingStatus !== null) return
    setSavingStatus('Copying assessment and saving…')
    try {
      const cloned = await assessmentService.duplicateAssessmentAndPersist(assessment.id)
      showNotification(`Duplicated as "${cloned.title}"!`)
      navigate(`/admin/assessments/${cloned.id}`)
    } catch (err: any) {
      console.error('Failed to duplicate assessment:', err)
      setErrorMessage(err.message || 'Failed to duplicate assessment.')
    } finally {
      setSavingStatus(null)
    }
  }

  const handleDuplicateSection = async (secId: string) => {
    if (!assessment) return
    setSavingStatus('Copying section and saving…')
    try {
      const updated = assessmentService.duplicateSection(assessment.id, secId)
      await assessmentService.syncAssessmentToDatabase(updated)
      setAssessment(updated)
      showNotification('Section duplicated with new question instances.')
    } catch (err: any) {
      console.error('Failed to duplicate section:', err)
      setErrorMessage(err.message || 'Failed to duplicate section.')
    } finally {
      setSavingStatus(null)
    }
  }

  const handleDuplicateQuestion = async (secId: string, qItemId: string) => {
    if (!assessment) return
    setSavingStatus('Copying question and saving…')
    try {
      const updated = assessmentService.duplicateQuestion(assessment.id, secId, qItemId)
      await assessmentService.syncAssessmentToDatabase(updated)
      setAssessment(updated)
      showNotification('Question duplicated in section.')
    } catch (err: any) {
      console.error('Failed to duplicate question:', err)
      setErrorMessage(err.message || 'Failed to duplicate question.')
    } finally {
      setSavingStatus(null)
    }
  }

  // Update Assessment field
  const handleUpdateAssessment = async (updates: Partial<Assessment>) => {
    if (!assessment) return

    // Publishing is a privileged database transition. Never publish by merely
    // changing the local status and syncing the row; use the secure RPC so the
    // database re-validates organization access and question/module state.
    if (updates.status === 'published') {
      setSavingStatus('Validating assessment and publishing...')
      try {
        const updated = await assessmentService.publishAssessment(assessment.id)
        setAssessment(updated)
        showNotification('Assessment published successfully!')
      } catch (err: any) {
        console.error('Failed to publish assessment:', err)
        setErrorMessage(err.message || 'Failed to publish assessment.')
      } finally {
        setSavingStatus(null)
      }
      return
    }

    setSavingStatus('Saving assessment settings…')
    try {
      const updated = assessmentService.updateAssessment(
        assessment.id,
        updates,
        { skipDatabaseSync: true }
      )
      await assessmentService.syncAssessmentToDatabase(updated)
      setAssessment(updated)
      showNotification('Assessment settings saved successfully!')
    } catch (err: any) {
      console.error('Failed to update assessment:', err)
      setErrorMessage(err.message || 'Failed to update assessment.')
    } finally {
      setSavingStatus(null)
    }
  }

  // Update nested settings
  const handleUpdateSettings = (updates: Partial<Assessment['settings']>) => {
    if (!assessment) return
    return handleUpdateAssessment({
      settings: {
        ...assessment.settings,
        ...updates,
      },
    })
  }

  const handleSetEvaluationProfile = async (profileId: string) => {
    if (!assessment) return

    const nextProfileId = profileId || null
    setIsSavingEvaluationProfile(true)
    setEvaluationProfileLoadError(null)
    setSavingStatus(nextProfileId ? 'Saving evaluation profile...' : 'Removing evaluation profile...')

    try {
      await evaluationProfileService.setAssessmentProfile(assessment.id, nextProfileId)
      setSelectedEvaluationProfileId(nextProfileId)
      showNotification(
        nextProfileId
          ? 'Evaluation profile assigned to this assessment.'
          : 'Evaluation profile removed from this assessment.'
      )
    } catch (err: any) {
      setEvaluationProfileLoadError(
        err?.message || 'Failed to update the assessment evaluation profile.'
      )
    } finally {
      setIsSavingEvaluationProfile(false)
      setSavingStatus(null)
    }
  }

  // Normalized Survey Actions
  const handleCreateSurvey = async () => {
    if (!assessment) return

    setIsSavingSurvey(true)
    setSurveyLoadError(null)
    setSavingStatus('Creating assessment survey...')

    try {
      const survey = await assessmentSurveyService.createSurvey({
        assessmentId: assessment.id,
        name: newSurveyName.trim() || 'Assessment Survey',
        description: '',
        instructions: '',
        isActive: true,
      })
      setAssessmentSurvey(survey)
      setSurveyQuestions([])
      showNotification('Assessment survey created.')
    } catch (err: any) {
      setSurveyLoadError(err?.message || 'Failed to create assessment survey.')
    } finally {
      setIsSavingSurvey(false)
      setSavingStatus(null)
    }
  }

  const handleUpdateSurvey = async (updates: {
    name?: string
    description?: string | null
    instructions?: string | null
    isActive?: boolean
  }) => {
    if (!assessmentSurvey) return

    setIsSavingSurvey(true)
    setSurveyLoadError(null)
    setSavingStatus('Saving survey settings...')

    try {
      const updated = await assessmentSurveyService.updateSurvey(assessmentSurvey.id, updates)
      setAssessmentSurvey(updated)
      showNotification('Survey settings saved.')
    } catch (err: any) {
      setSurveyLoadError(err?.message || 'Failed to update survey.')
    } finally {
      setIsSavingSurvey(false)
      setSavingStatus(null)
    }
  }

  const handleDeleteSurvey = async () => {
    if (!assessmentSurvey) return
    if (!confirm('Delete this assessment survey and all of its questions?')) return

    setIsSavingSurvey(true)
    setSurveyLoadError(null)
    setSavingStatus('Deleting assessment survey...')

    try {
      await assessmentSurveyService.deleteSurvey(assessmentSurvey.id)
      setAssessmentSurvey(null)
      setSurveyQuestions([])
      showNotification('Assessment survey deleted.')
    } catch (err: any) {
      setSurveyLoadError(err?.message || 'Failed to delete assessment survey.')
    } finally {
      setIsSavingSurvey(false)
      setSavingStatus(null)
    }
  }

  const handleAddSurveyQuestion = async () => {
    if (!assessmentSurvey) return

    setIsSavingSurvey(true)
    setSurveyLoadError(null)
    setSavingStatus('Adding survey question...')

    try {
      const question = await assessmentSurveyService.createQuestion({
        surveyId: assessmentSurvey.id,
        questionType: 'text',
        prompt: `Survey Question ${surveyQuestions.length + 1}`,
        isRequired: false,
        displayOrder: surveyQuestions.length,
        config: {},
      })
      setSurveyQuestions((current) => [...current, { ...question, options: [] }])
      showNotification('Survey question added.')
    } catch (err: any) {
      setSurveyLoadError(err?.message || 'Failed to add survey question.')
    } finally {
      setIsSavingSurvey(false)
      setSavingStatus(null)
    }
  }

  const handleUpdateSurveyQuestion = async (
    questionId: string,
    updates: {
      questionType?: string
      prompt?: string
      isRequired?: boolean
      config?: Record<string, unknown>
    }
  ) => {
    setSurveyLoadError(null)
    setSavingStatus('Saving survey question...')

    try {
      const updated = await assessmentSurveyService.updateQuestion(questionId, updates)
      setSurveyQuestions((current) =>
        current.map((question) =>
          question.id === questionId ? { ...question, ...updated } : question
        )
      )
      showNotification('Survey question saved.')
    } catch (err: any) {
      setSurveyLoadError(err?.message || 'Failed to update survey question.')
    } finally {
      setSavingStatus(null)
    }
  }

  const handleDeleteSurveyQuestion = async (questionId: string) => {
    if (!confirm('Delete this survey question?')) return

    setIsSavingSurvey(true)
    setSurveyLoadError(null)
    setSavingStatus('Deleting survey question...')

    try {
      await assessmentSurveyService.deleteQuestion(questionId)
      const remaining = surveyQuestions
        .filter((question) => question.id !== questionId)
        .map((question, index) => ({ ...question, displayOrder: index }))
      setSurveyQuestions(remaining)
      if (assessmentSurvey) {
        await assessmentSurveyService.reorderQuestions(
          assessmentSurvey.id,
          remaining.map((question) => question.id)
        )
      }
      showNotification('Survey question deleted.')
    } catch (err: any) {
      setSurveyLoadError(err?.message || 'Failed to delete survey question.')
    } finally {
      setIsSavingSurvey(false)
    }
  }

  const handleMoveSurveyQuestion = async (index: number, direction: -1 | 1) => {
    if (!assessmentSurvey) return
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= surveyQuestions.length) return

    const reordered = [...surveyQuestions]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(newIndex, 0, moved)
    const normalized = reordered.map((question, idx) => ({
      ...question,
      displayOrder: idx,
    }))

    setSurveyQuestions(normalized)
    setSavingStatus('Saving survey question order...')
    try {
      await assessmentSurveyService.reorderQuestions(
        assessmentSurvey.id,
        normalized.map((question) => question.id)
      )
      showNotification('Survey question order saved.')
    } catch (err: any) {
      setSurveyLoadError(err?.message || 'Failed to reorder survey questions.')
    } finally {
      setSavingStatus(null)
    }
  }

  const handleAddSurveyOption = async (question: SurveyQuestion) => {
    setIsSavingSurvey(true)
    setSurveyLoadError(null)
    setSavingStatus('Adding survey option...')

    try {
      const option = await assessmentSurveyService.createOption({
        questionId: question.id,
        value: `option_${question.options.length + 1}`,
        label: `Option ${question.options.length + 1}`,
        displayOrder: question.options.length,
      })
      setSurveyQuestions((current) =>
        current.map((item) =>
          item.id === question.id
            ? { ...item, options: [...item.options, option] }
            : item
        )
      )
      showNotification('Survey option added.')
    } catch (err: any) {
      setSurveyLoadError(err?.message || 'Failed to add survey option.')
    } finally {
      setIsSavingSurvey(false)
    }
  }

  const handleUpdateSurveyOption = async (
    questionId: string,
    optionId: string,
    updates: { value?: string; label?: string }
  ) => {
    setSavingStatus('Saving survey option...')
    try {
      const updated = await assessmentSurveyService.updateOption(optionId, updates)
      setSurveyQuestions((current) =>
        current.map((question) =>
          question.id === questionId
            ? {
                ...question,
                options: question.options.map((option) =>
                  option.id === optionId ? { ...option, ...updated } : option
                ),
              }
            : question
        )
      )
      showNotification('Survey option saved.')
    } catch (err: any) {
      setSurveyLoadError(err?.message || 'Failed to update survey option.')
    } finally {
      setSavingStatus(null)
    }
  }

  const handleDeleteSurveyOption = async (questionId: string, optionId: string) => {
    setSavingStatus('Deleting survey option and saving changes...')
    try {
      await assessmentSurveyService.deleteOption(optionId)
      const question = surveyQuestions.find((item) => item.id === questionId)
      const remaining = (question?.options || [])
        .filter((option) => option.id !== optionId)
        .map((option, index) => ({ ...option, displayOrder: index }))

      setSurveyQuestions((current) =>
        current.map((item) =>
          item.id === questionId ? { ...item, options: remaining } : item
        )
      )
      await assessmentSurveyService.reorderOptions(
        questionId,
        remaining.map((option) => option.id)
      )
      showNotification('Survey option deleted.')
    } catch (err: any) {
      setSurveyLoadError(err?.message || 'Failed to delete survey option.')
    } finally {
      setSavingStatus(null)
    }
  }

  const handleUpdateSurveyQuestionConfig = async (question: SurveyQuestion, rawConfig: string) => {
    try {
      const parsed = JSON.parse(rawConfig)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Question configuration must be a JSON object.')
      }
      await handleUpdateSurveyQuestion(question.id, { config: parsed as Record<string, unknown> })
    } catch (err: any) {
      setSurveyLoadError(err?.message || 'Invalid question configuration JSON.')
    }
  }

  // Section Actions
  const handleAddSection = async () => {
    if (!assessment) return

    setSavingStatus('Adding section and saving…')
    try {
      // Make sure the exact assessment displayed by this page is the one used
      // by the service mutation, even after a direct page refresh.
      const cached = assessmentService.getStoredAssessments()
      const existingIndex = cached.findIndex((item) => item.id === assessment.id)
      if (existingIndex >= 0) {
        const next = [...cached]
        next[existingIndex] = assessment
        assessmentService.saveStoredAssessments(next)
      } else {
        assessmentService.saveStoredAssessments([assessment, ...cached])
      }

      const updated = assessmentService.addSection(assessment.id, {
        title: `Section ${assessment.sections.length + 1}`,
        description: '',
      })

      await assessmentService.syncAssessmentToDatabase(updated)
      setAssessment(updated)
      showNotification('New section added and saved.')
    } catch (err: any) {
      console.error('Failed to add section:', err)
      setErrorMessage(err?.message || 'Failed to add section.')
    } finally {
      setSavingStatus(null)
    }
  }

  const handleDeleteSection = (secId: string, secTitle: string) => {
    if (!assessment) return
    if (assessment.sections.length <= 1) {
      setErrorMessage('An assessment must have at least one section.')
      return
    }

    const section = assessment.sections.find((item) => item.id === secId)
    setPendingSectionRemoval({
      sectionId: secId,
      title: secTitle,
      questionCount: section?.questions.length ?? 0,
    })
  }

  const handleConfirmSectionRemoval = async () => {
    if (!assessment || !pendingSectionRemoval || isRemovingSection) return

    setIsRemovingSection(true)
    setSavingStatus('Removing section and saving…')
    try {
      const updated = assessmentService.deleteSection(assessment.id, pendingSectionRemoval.sectionId)
      await assessmentService.syncAssessmentToDatabase(updated)
      setAssessment(updated)
      setPendingSectionRemoval(null)
      showNotification('Section removed.')
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to remove section.')
    } finally {
      setIsRemovingSection(false)
      setSavingStatus(null)
    }
  }

  const handleMoveSection = async (index: number, direction: -1 | 1) => {
    if (!assessment) return
    const newIdx = index + direction
    if (newIdx < 0 || newIdx >= assessment.sections.length) return

    const newSections = [...assessment.sections]
    const temp = newSections[index]
    newSections[index] = newSections[newIdx]
    newSections[newIdx] = temp

    setSavingStatus('Saving section order…')
    try {
      const updated = assessmentService.reorderSections(
        assessment.id,
        newSections.map((s) => s.id)
      )
      await assessmentService.syncAssessmentToDatabase(updated)
      setAssessment(updated)
      showNotification('Section order saved.')
    } catch (err: any) {
      setErrorMessage(err.message)
    } finally {
      setSavingStatus(null)
    }
  }

  // Section Settings Modal Handlers
  const openEditSectionModal = (sec: AssessmentSection) => {
    setEditingSection(sec)
    setSectionTitle(sec.title)
    setSectionDesc(sec.description || '')
    setSectionSettings({ ...sec.settings })
  }

  async function persistSectionSettings() {
    if (!assessment || !editingSection) return

    setSavingStatus('Saving section settings…')
    const updated = assessmentService.updateSection(assessment.id, editingSection.id, {
      title: sectionTitle.trim() || editingSection.title,
      description: sectionDesc.trim(),
      settings: sectionSettings,
    })
    await assessmentService.syncAssessmentToDatabase(updated)
    setAssessment(updated)
    savedAssessmentSnapshotRef.current = JSON.stringify(updated)
    setEditingSection(null)
    showNotification('Section settings saved!')
  }

  const handleSaveSectionSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingStatus('Saving section settings…')
    try {
      await persistSectionSettings()
      markAssessmentChanges()
    } catch (err: any) {
      setErrorMessage(err.message)
    } finally {
      setSavingStatus(null)
    }
  }

  // Question Management within Sections
  const handleRemoveQuestion = (secId: string, qItemId: string) => {
    if (!assessment) return
    const sec = assessment.sections.find((s) => s.id === secId)
    if (sec && sec.questions.length <= 1) {
      setErrorMessage('Each section must have at least 1 question. You cannot remove the only question.')
      return
    }

    const questionItem = sec?.questions.find((question) => question.id === qItemId)
    const bankMatch = questionItem
      ? bankQuestions.find((question) => question.id === questionItem.questionId)
      : undefined
    const questionPreview =
      questionItem?.questionSnapshot?.prompt ||
      bankMatch?.prompt ||
      'this question'
    const shortPreview = questionPreview.length > 120
      ? `${questionPreview.slice(0, 120)}…`
      : questionPreview

    setPendingQuestionRemoval({
      sectionId: secId,
      questionItemId: qItemId,
      preview: shortPreview,
    })
  }

  const handleConfirmQuestionRemoval = async () => {
    if (!assessment || !pendingQuestionRemoval || isRemovingQuestion) return

    setIsRemovingQuestion(true)
    setSavingStatus('Removing question and saving…')
    try {
      const updated = assessmentService.removeQuestionFromSection(
        assessment.id,
        pendingQuestionRemoval.sectionId,
        pendingQuestionRemoval.questionItemId
      )
      await assessmentService.syncAssessmentToDatabase(updated)
      setAssessment(updated)
      setPendingQuestionRemoval(null)
      showNotification('Question removed from section.')
    } catch (err: any) {
      setErrorMessage(err.message)
    } finally {
      setIsRemovingQuestion(false)
      setSavingStatus(null)
    }
  }

  const handleMoveQuestion = async (secId: string, qIndex: number, direction: -1 | 1) => {
    if (!assessment) return
    const sec = assessment.sections.find((s) => s.id === secId)
    if (!sec) return

    const targetIdx = qIndex + direction
    if (targetIdx < 0 || targetIdx >= sec.questions.length) return

    const newQuestions = [...sec.questions]
    const temp = newQuestions[qIndex]
    newQuestions[qIndex] = newQuestions[targetIdx]
    newQuestions[targetIdx] = temp

    setSavingStatus('Saving question order…')
    try {
      const updated = assessmentService.reorderSectionQuestions(
        assessment.id,
        secId,
        newQuestions.map((q) => q.id)
      )
      await assessmentService.syncAssessmentToDatabase(updated)
      setAssessment(updated)
      showNotification('Question order saved.')
    } catch (err: any) {
      setErrorMessage(err.message)
    } finally {
      setSavingStatus(null)
    }
  }

  const handleUpdatePoints = async (secId: string, qItemId: string, points: number) => {
    if (!assessment) return
    setSavingStatus('Saving question points…')
    try {
      const updated = assessmentService.updateSectionQuestion(assessment.id, secId, qItemId, {
        pointsOverride: points,
      })
      await assessmentService.syncAssessmentToDatabase(updated)
      setAssessment(updated)
      showNotification('Question points saved.')
    } catch (err: any) {
      setErrorMessage(err.message)
    } finally {
      setSavingStatus(null)
    }
  }

  // Question Picker Handlers
  const openQuestionPicker = (secId: string) => {
    setPickerSectionId(secId)
    setSelectedQuestionIds([])
    setPickerSearch('')
    setPickerCollectionFilter('all')
    setPickerTaxonomyId(availableTaxonomies.length === 1 ? availableTaxonomies[0].id : '')
    setPickerTaxonomyNodeId('all')
    setPickerDomainFilter('all')
    setPickerChapterFilter('all')
    setPickerDifficultyFilter('all')
    setPickerTypeFilter('all')
  }

  const handleTogglePickQuestion = (qId: string) => {
    setSelectedQuestionIds((prev) =>
      prev.includes(qId) ? prev.filter((id) => id !== qId) : [...prev, qId]
    )
  }

  const handleConfirmAddQuestions = async () => {
    if (!assessment || !pickerSectionId || selectedQuestionIds.length === 0) return

    setSavingStatus('Adding questions and saving…')
    try {
      const updated = assessmentService.addQuestionsToSection(
        assessment.id,
        pickerSectionId,
        selectedQuestionIds
      )
      await assessmentService.syncAssessmentToDatabase(updated)
      setAssessment(updated)
      showNotification(`Added ${selectedQuestionIds.length} question(s) to section!`)
      setPickerSectionId(null)
      setSelectedQuestionIds([])
    } catch (err: any) {
      setErrorMessage(err.message)
    } finally {
      setSavingStatus(null)
    }
  }

  useEffect(() => {
    let cancelled = false
    if (!pickerTaxonomyId) {
      setPickerTaxonomyNodes([])
      setPickerTaxonomyNodeId('all')
      return () => { cancelled = true }
    }

    questionBankService.fetchGenericTaxonomyNodes(pickerTaxonomyId)
      .then((nodes) => {
        if (!cancelled) setPickerTaxonomyNodes(Array.isArray(nodes) ? nodes : [])
      })
      .catch(() => {
        if (!cancelled) setPickerTaxonomyNodes([])
      })

    return () => { cancelled = true }
  }, [pickerTaxonomyId])

  const [workspaceFields, setWorkspaceFields] = useState<StudentFieldConfig[] | null>(null)
  const [workspaceFieldsError, setWorkspaceFieldsError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    async function loadWorkspaceFields() {
      try {
        const orgId = await assessmentService.getCurrentOrganizationId()
        const { data, error } = await supabase.from('registration_fields')
          .select('field_key,label,field_type,is_required,is_active,options')
          .eq('organization_id', orgId).order('display_order')
        if (error) throw error
        if (cancelled) return
        setWorkspaceFields(((data ?? []) as Array<{
          field_key: string
          label: string
          field_type: string
          is_required: boolean | null
          is_active: boolean | null
          options: StudentFieldConfig['options']
        }>).map((field) => ({
          id: field.field_key,
          label: field.label,
          type: field.field_type === 'dropdown' ? 'select' : field.field_type,
          required: Boolean(field.is_required),
          enabled: Boolean(field.is_active),
          options: field.options ?? undefined,
        })) as StudentFieldConfig[])
      } catch {
        if (!cancelled) setWorkspaceFieldsError('Workspace registration fields could not be loaded.')
      }
    }
    void loadWorkspaceFields()
    return () => { cancelled = true }
  }, [])

  const displayedStudentFields = useMemo(() => {
    const existing = assessment?.settings.studentFields ?? []
    const base = (workspaceFields ?? []).filter(field => field.enabled)
    return base.map(field => {
      const override = existing.find(item => item.id === field.id)
      return { ...field, enabled: override?.enabled ?? field.enabled, required: override?.required ?? field.required }
    })
  }, [assessment?.settings.studentFields, workspaceFields])

  // Student field toggling
  const handleToggleStudentField = (fId: string, key: 'enabled' | 'required') => {
    if (!assessment || workspaceFields === null || workspaceFieldsError) return
    const currentFields = displayedStudentFields
    const hiddenFields = (assessment.settings.studentFields ?? []).filter(f => !currentFields.some(visible => visible.id === f.id))
    const updatedFields = [...hiddenFields, ...currentFields.map((f) => {
      if (f.id !== fId) return f
      return {
        ...f,
        [key]: !f[key],
      }
    })]
    handleUpdateSettings({ studentFields: updatedFields })
  }

  if (errorMessage && !assessment) {
    return (
      <AdminLayout title="Assessment Not Found">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-4">
          <AlertCircle className="h-10 w-10 text-rose-500 mx-auto" />
          <h2 className="text-base font-bold text-slate-800">{errorMessage}</h2>
          <Link
            to="/admin/assessments"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold"
          >
            Return to Assessments
          </Link>
        </div>
      </AdminLayout>
    )
  }

  if (!assessment) {
    return (
      <AdminLayout title="Loading Assessment...">
        <div className="p-8 text-center text-xs text-slate-500">Loading diagnostic details...</div>
      </AdminLayout>
    )
  }

  const availableBankIds = new Set(bankQuestions.map((question) => question.id))
  const totalQuestions = assessment.sections.reduce((acc, s) => acc + s.questions.length, 0)
  const missingQuestionReferences = bankQuestionsLoaded
    ? assessment.sections.reduce(
        (count, section) => count + section.questions.filter((item) => !availableBankIds.has(item.questionId)).length,
        0
      )
    : null
  const assessmentChecks = [
    { label: 'Assessment title', ready: assessment.title.trim().length > 0 },
    { label: 'At least one section', ready: assessment.sections.length > 0 },
    { label: 'Questions in every section', ready: assessment.sections.length > 0 && assessment.sections.every((section) => section.questions.length > 0) },
  ]
  const isStructurallyReady = assessmentChecks.every((check) => check.ready)
  const normalizedSectionSearch = sectionSearch.trim().toLowerCase()
  const sectionMatchesSearch = (section: AssessmentSection) =>
    !normalizedSectionSearch ||
    section.title.toLowerCase().includes(normalizedSectionSearch) ||
    (section.description || '').toLowerCase().includes(normalizedSectionSearch) ||
    section.questions.some((item) => {
      const bankMatch = bankQuestions.find((question) => question.id === item.questionId)
      const prompt = item.questionSnapshot?.prompt || bankMatch?.prompt || ''
      return prompt.toLowerCase().includes(normalizedSectionSearch)
    })
  const matchingSections = assessment.sections.filter(sectionMatchesSearch).length
  const toggleSectionCollapsed = (sectionId: string) => {
    setCollapsedSectionIds((current) => current.includes(sectionId)
      ? current.filter((id) => id !== sectionId)
      : [...current, sectionId])
  }
  const totalDuration =
    assessment.settings.timerMode === 'per_assessment'
      ? assessment.settings.timerMinutes
      : assessment.sections.reduce(
          (acc, s) => acc + (s.settings.timingEnabled ? s.settings.timeLimitMinutes : 0),
          0
        )

  // Filtered available questions in modal. Keep these filters aligned with
  // QuestionBankPage: generic taxonomy/node filters are authoritative, while
  // legacy domain/chapter filters remain available only as compatibility data.
  const assignedInPickerSection = new Set(
    assessment.sections.find((s) => s.id === pickerSectionId)?.questions.map((q) => q.questionId) || []
  )

  const pickerTaxonomyNodeIds = new Set(
    pickerTaxonomyNodes.map((node) => String(node.id))
  )

  const getPickerDescendantIds = (nodeId: string): Set<string> => {
    const result = new Set<string>([nodeId])
    let changed = true
    while (changed) {
      changed = false
      for (const node of pickerTaxonomyNodes) {
        if (node.parentId && result.has(String(node.parentId)) && !result.has(String(node.id))) {
          result.add(String(node.id))
          changed = true
        }
      }
    }
    return result
  }

  const pickerMatchingNodeIds =
    pickerTaxonomyNodeId !== 'all' ? getPickerDescendantIds(pickerTaxonomyNodeId) : null

  const filteredPickerQuestions = bankQuestions.filter((q) => {
    if (assignedInPickerSection.has(q.id)) return false

    if (pickerCollectionFilter !== 'all' && (q.collection || 'General Question Bank') !== pickerCollectionFilter) {
      return false
    }

    if (pickerTaxonomyId) {
      const questionNodeIds = (q.taxonomyNodeIds || []).map(String)
      if (pickerMatchingNodeIds) {
        if (!questionNodeIds.some((id) => pickerMatchingNodeIds.has(id))) return false
      } else if (pickerTaxonomyNodes.length > 0) {
        if (!questionNodeIds.some((id) => pickerTaxonomyNodeIds.has(id))) return false
      }
    }

    // Legacy compatibility filters. These do not create or link assessment taxonomies.
    if (pickerDomainFilter !== 'all' && q.domain !== pickerDomainFilter) return false
    if (pickerChapterFilter !== 'all' && q.chapter !== pickerChapterFilter) return false
    if (pickerDifficultyFilter !== 'all' && q.difficulty !== pickerDifficultyFilter) return false
    if (pickerTypeFilter !== 'all' && q.questionType !== pickerTypeFilter) return false

    if (pickerSearch.trim()) {
      const term = pickerSearch.toLowerCase().trim()
      const matches = [
        q.prompt,
        q.domain,
        q.chapter,
        q.lesson,
        q.collection,
        q.explanation,
      ].some((value) => String(value || '').toLowerCase().includes(term))

      const matchesTaxonomyNode = (q.taxonomyNodeIds || []).some((nodeId) => {
        const node = pickerTaxonomyNodes.find((item) => String(item.id) === String(nodeId))
        return node?.name?.toLowerCase().includes(term)
      })

      if (!matches && !matchesTaxonomyNode) return false
    }

    return true
  })

  const uniqueCollections = Array.from(
    new Set(bankQuestions.map((q) => q.collection || 'General Question Bank'))
  ).sort((a, b) => a.localeCompare(b))

  const uniqueDomains = Array.from(new Set(bankQuestions.map((q) => q.domain).filter(Boolean))).sort()
  const pickerChapterOptions = Array.from(
    new Set(
      bankQuestions
        .filter((q) => pickerDomainFilter === 'all' || q.domain === pickerDomainFilter)
        .map((q) => q.chapter)
        .filter(Boolean)
    )
  ).sort()

  const renderPickerMath = (text: string) => {
    if (!text) return null
    const blockParts = text.split(/(\$\$[\s\S]+?\$\$)/g)
    return (
      <span>
        {blockParts.map((blockPart, bIdx) => {
          if (blockPart.startsWith('$$') && blockPart.endsWith('$$') && blockPart.length > 4) {
            const math = blockPart.slice(2, -2).trim()
            try {
              return (
                <span key={bIdx} className="block my-1 text-center overflow-x-auto py-1">
                  <BlockMath math={math} />
                </span>
              )
            } catch {
              return <code key={bIdx} className="text-blue-700 bg-blue-50 px-1 rounded">{blockPart}</code>
            }
          }

          const inlineParts = blockPart.split(/(\$[^$\n]+?\$)/g)
          return (
            <span key={bIdx}>
              {inlineParts.map((part, index) => {
                if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
                  try {
                    return <InlineMath key={index} math={part.slice(1, -1)} />
                  } catch {
                    return <code key={index} className="text-blue-700 bg-blue-50 px-1 rounded">{part}</code>
                  }
                }
                return <span key={index}>{part}</span>
              })}
            </span>
          )
        })}
      </span>
    )
  }

  return (
    <AdminLayout
      title="Assessment editor"
      subtitle={assessment.title}
      backButtonPath="/admin/assessments"
      actions={
        <div className="flex items-center gap-2">
          {savingStatus ? (
            <span role="status" className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-800">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
              Saving...
            </span>
          ) : editAssessmentDirty ? (
            <button
              type="button"
              onClick={() => { void persistAssessmentChanges().catch((error: unknown) => {
                setErrorMessage(error instanceof Error ? error.message : 'Unable to save assessment changes.')
              }) }}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              style={{ color: '#ffffff' }}
            >
              <Save className="h-4 w-4" /> Save changes
            </button>
          ) : (
            <span role="status" className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4" /> All changes saved
            </span>
          )}
        </div>
      }
    >
      {/* Toast Notification */}
      {saveSuccessMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-xl border border-slate-700 flex items-center gap-2 text-xs font-medium animate-in fade-in duration-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{saveSuccessMessage}</span>
        </div>
      )}

      {globalErrorMessage && (
        <div role="alert" aria-live="assertive" className="fixed bottom-6 right-6 z-[60] max-w-md bg-rose-50 text-rose-900 px-4 py-3 rounded-2xl shadow-xl border border-rose-200 flex items-start gap-3 text-xs font-medium animate-in fade-in duration-200">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="font-bold">Action failed</div>
            <div className="mt-0.5 break-words">{globalErrorMessage}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              setErrorMessage(null)
              setTaxonomyLoadError(null)
              setEvaluationProfileLoadError(null)
              setSurveyLoadError(null)
            }}
            className="p-1 rounded-lg hover:bg-rose-100"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {savingStatus && (
        <div role="status" aria-live="polite" className="fixed top-20 right-6 z-[60] max-w-md bg-blue-50 text-blue-900 px-4 py-3 rounded-2xl shadow-xl border border-blue-200 flex items-start gap-3 text-xs font-medium animate-in fade-in duration-200">
          <span className="h-4 w-4 shrink-0 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin mt-0.5" />
          <div>
            <div className="font-bold">Working...</div>
            <div className="mt-0.5">{savingStatus}</div>
          </div>
        </div>
      )}

      {/* Workspace overview: primary action, status and facts are separated from navigation. */}
      <section aria-label="Assessment overview" className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="px-5 py-6 sm:px-7 sm:py-7">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-blue-700">Assessment workspace</span>
                {versionHistory.length > 0 && (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
                    Version {versionHistory[0].version_number}
                  </span>
                )}
              </div>
              <h2 className="break-words text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">{assessment.title}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                {assessment.subtitle || 'Organize questions, set student rules, and test the experience before publishing.'}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold">
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-700">{assessment.grade || 'No grade'}</span>
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-700">{assessment.subject || 'No subject'}</span>
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-600">{assessment.status === 'published' ? 'Available to students' : assessment.status === 'draft' ? 'Not yet available to students' : 'Archived'}</span>
              </div>
            </div>
            <div className="flex w-full flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:w-auto sm:min-w-[230px]">
              <label htmlFor="editor-assessment-status" className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Publication status</label>
              <select
                id="editor-assessment-status"
                value={assessment.status}
                onChange={(event) => { void handleUpdateAssessment({ status: event.target.value as Assessment['status'] }) }}
                disabled={savingStatus !== null}
                aria-busy={savingStatus !== null}
                className={`w-full rounded-xl border px-3 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-200 ${
                  assessment.status === 'published'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : assessment.status === 'draft'
                    ? 'border-amber-200 bg-amber-50 text-amber-900'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
              <EditorActionLink to={`/admin/assessments/${assessment.id}/preview`} icon={PlayCircle} primary>
                Run staff trial
              </EditorActionLink>
              <p className="text-[11px] leading-4 text-slate-500">Trial runs do not save student attempts or reports.</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-slate-100 bg-slate-50/50 lg:grid-cols-4">
          <EditorMetric icon={Layers} label="Sections" value={assessment.sections.length} hint="Organized modules" />
          <EditorMetric icon={FileText} label="Questions" value={totalQuestions} hint="Across all sections" />
          <EditorMetric icon={Clock} label="Duration" value={assessment.settings.timerMode === 'untimed' || totalDuration <= 0 ? 'Untimed' : `${totalDuration} min`} hint={assessment.settings.timerMode === 'per_assessment' ? 'Overall timer' : 'Section timers'} />
          <EditorMetric icon={Shield} label="Readiness" value={isStructurallyReady && missingQuestionReferences === 0 ? 'Ready to review' : 'Needs review'} hint="Ready for publishing review" />
        </div>
      </section>

      {/* Four predictable destinations. Secondary utilities never cause horizontal scrolling. */}
      <section aria-label="Assessment editor navigation" className="mt-5 rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-950">Build your assessment</h2>
            <p className="mt-1 text-xs text-slate-500">Choose a workspace below. Your progress stays with this assessment.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">4 workspaces</span>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <EditorTabButton icon={Layers} label="Sections & questions" description="Build the test" active={activeTab === 'sections'} onClick={() => setActiveTab('sections')} />
          <EditorTabButton icon={Sliders} label="Settings" description="Timing & rules" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
          <EditorTabButton icon={FileText} label="Survey" description="Optional questions" active={activeTab === 'survey'} onClick={() => setActiveTab('survey')} />
          <EditorTabButton icon={PlayCircle} label="Staff trial" description="Test safely" active={activeTab === 'preview'} onClick={() => setActiveTab('preview')} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">More tools</span>
          <EditorActionButton icon={Share2} onClick={() => setShowShareModal(true)}>Share assessment</EditorActionButton>
          <EditorActionLink to={`/admin/assessments/${assessment.id}/results`} icon={BarChart3}>Student results</EditorActionLink>
          <EditorActionLink to={`/admin/assessments/${assessment.id}/report-settings`} icon={Award}>Report settings</EditorActionLink>
          <EditorActionButton icon={Copy} onClick={() => { void handleDuplicateAssessment() }} disabled={savingStatus !== null}>Duplicate</EditorActionButton>
        </div>
      </section>

      {/* Alerts only appear when action is required. */}
      {(editAssessmentDirty || !isStructurallyReady || (missingQuestionReferences !== null && missingQuestionReferences > 0) || bankQuestionsError) && (
        <div className="mt-4 space-y-3">
          {editAssessmentDirty && (
            <div role="status" className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-xs font-medium text-amber-900">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span><strong>Unsaved changes.</strong> Save before opening a staff trial to see the latest edits.</span>
              </div>
              <button type="button" onClick={() => { void persistAssessmentChanges().catch((error: unknown) => {
                setErrorMessage(error instanceof Error ? error.message : 'Unable to save assessment changes.')
              }) }} disabled={savingStatus !== null} className="self-start rounded-xl bg-amber-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-amber-800 disabled:opacity-60 sm:self-auto" style={{ color: '#ffffff' }}>Save now</button>
            </div>
          )}
          {(!isStructurallyReady || (missingQuestionReferences !== null && missingQuestionReferences > 0) || bankQuestionsError) && (
            <div role="status" className="rounded-2xl border border-amber-200 bg-white px-4 py-3 text-xs text-slate-700">
              <div className="flex items-center gap-2 font-bold text-slate-900"><Shield className="h-4 w-4 text-amber-600" /> Before publishing</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {assessmentChecks.filter((check) => !check.ready).map((check) => (
                  <span key={check.label} className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-900">Check: {check.label}</span>
                ))}
                {missingQuestionReferences !== null && missingQuestionReferences > 0 && (
                  <span className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-800">{missingQuestionReferences} unavailable question reference{missingQuestionReferences === 1 ? '' : 's'}</span>
                )}
                {bankQuestionsError && <span className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-900">Question Bank could not be verified</span>}
              </div>

            </div>
          )}
        </div>
      )}

      {versionHistory.length > 0 && (
        <details className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-700">
          <summary className="cursor-pointer py-1 font-semibold text-slate-700">Version history · {versionHistory.length} saved version{versionHistory.length === 1 ? '' : 's'} <span className="font-normal text-slate-400">(expand)</span></summary>
          <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
            {versionHistory.map((version) => (
              <div key={version.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <span>v{version.version_number} · {new Date(version.created_at).toLocaleString()} · {version.sections} section(s), {version.questions} question(s)</span>
                <span>{version.attempts} pinned attempt(s) · {version.status}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-slate-500">Existing student attempts remain tied to their original versions. The student link does not change.</p>
        </details>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: SECTIONS & QUESTIONS (Generic Multi-Section Architecture) */}
      {/* ========================================================================= */}
      {activeTab === 'sections' && (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-950">Sections & questions</h2>
              <p className="mt-1 text-xs text-slate-500">Add questions from your bank, arrange their order, and configure each section.</p>
            </div>

            <button
              type="button"
              onClick={handleAddSection}
              disabled={savingStatus !== null}
              style={{ backgroundColor: '#2563eb', color: '#ffffff' }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition shadow-2xs cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {savingStatus ? (
                <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span>{savingStatus ? 'Saving...' : 'Add section'}</span>
            </button>
          </div>

          {savingStatus && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
              <span className="h-4 w-4 shrink-0 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
              <div>
                <div className="font-semibold">{savingStatus}</div>
                <div className="text-[11px] text-blue-600 mt-0.5">
                  Please wait while the change is saved. You can continue when the button returns to normal.
                </div>
              </div>
            </div>
          )}

          {/* Search and navigation are view-only; no section/question IDs are changed. */}
          <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <label className="relative flex-1 min-w-0">
                <span className="sr-only">Search sections and question prompts</span>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="search"
                  value={sectionSearch}
                  onChange={(event) => setSectionSearch(event.target.value)}
                  placeholder="Find a section or question..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500" aria-live="polite">Showing {matchingSections} of {assessment.sections.length} sections</span>
                <button type="button" onClick={() => setCollapsedSectionIds(assessment.sections.map((section) => section.id))} className="rounded-lg border border-slate-200 px-2.5 py-2 font-semibold text-slate-700 hover:bg-slate-50">Collapse all</button>
                <button type="button" onClick={() => setCollapsedSectionIds([])} className="rounded-lg border border-slate-200 px-2.5 py-2 font-semibold text-slate-700 hover:bg-slate-50">Expand all</button>
              </div>
            </div>
            {assessment.sections.length > 1 && (
              <div className="flex flex-wrap gap-1.5" aria-label="Jump to section">
                {assessment.sections.map((section, index) => (
                  <button key={section.id} type="button" onClick={() => {
                    setSectionSearch('')
                    setCollapsedSectionIds((current) => current.filter((id) => id !== section.id))
                    window.requestAnimationFrame(() => document.getElementById(`assessment-section-${section.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
                  }} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700" title={section.title}>
                    {index + 1}. {section.title}
                  </button>
                ))}
              </div>
            )}
          </div>

          {matchingSections === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
              <Search className="mx-auto h-7 w-7 text-slate-400" />
              <h3 className="mt-2 text-sm font-semibold text-slate-900">No matching sections</h3>
              <p className="mt-1 text-xs text-slate-500">Try a different section title or question phrase.</p>
              <button type="button" onClick={() => setSectionSearch('')} className="mt-3 text-xs font-semibold text-blue-700 hover:underline">Clear search</button>
            </div>
          )}

          {/* List of Sections */}
          <div className="space-y-5">
            {assessment.sections.map((section, sIdx) => {
              if (!sectionMatchesSearch(section)) return null
              const hasMinQuestions = section.questions.length <= 1
              const isCollapsed = collapsedSectionIds.includes(section.id)

              return (
                <div
                  key={section.id}
                  id={`assessment-section-${section.id}`}
                  className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden transition scroll-mt-24"
                >
                  {/* Section Top Header */}
                  <div className="bg-slate-50/80 p-4 sm:p-5 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start sm:items-center gap-3">
                      <div className="w-7 h-7 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                        {sIdx + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-slate-900">{section.title}</h3>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${section.settings.optional ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-600'}`}>{section.settings.optional ? 'Optional' : 'Required'}</span>
                          {section.settings.calculatorAllowed ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              <Calculator className="h-3 w-3" />
                              Calculator Allowed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                              No Calculator
                            </span>
                          )}

                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            <Clock className="h-3 w-3" />
                            {section.settings.timingEnabled
                              ? `${section.settings.timeLimitMinutes} mins`
                              : 'Untimed'}
                          </span>

                          {section.settings.hasBreakAfter && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                              <Coffee className="h-3 w-3" />
                              {section.settings.breakDurationMinutes}m Break After
                            </span>
                          )}
                        </div>
                        {section.description && (
                          <p className="text-xs text-slate-500 mt-0.5">{section.description}</p>
                        )}
                      </div>
                    </div>

                    {/* Primary controls are always visible; advanced section actions are grouped. */}
                    <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                      <button
                        type="button"
                        onClick={() => toggleSectionCollapsed(section.id)}
                        aria-expanded={!isCollapsed}
                        aria-controls={`assessment-questions-${section.id}`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                        {isCollapsed ? `Show questions (${section.questions.length})` : 'Hide questions'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditSectionModal(section)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"
                      >
                        <Sliders className="h-4 w-4" /> Edit section
                      </button>
                      <details className="group w-full sm:w-auto">
                        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                          More actions <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:justify-end">
                          <button type="button" disabled={savingStatus !== null || sIdx === 0} onClick={() => { void handleMoveSection(sIdx, -1) }} title="Move section up" aria-label="Move section up" className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                          <button type="button" disabled={savingStatus !== null || sIdx === assessment.sections.length - 1} onClick={() => { void handleMoveSection(sIdx, 1) }} title="Move section down" aria-label="Move section down" className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                          <button type="button" disabled={savingStatus !== null} onClick={() => { void handleDuplicateSection(section.id) }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-30"><Copy className="h-3.5 w-3.5" /> Duplicate</button>
                          <button type="button" disabled={savingStatus !== null || assessment.sections.length <= 1} onClick={() => handleDeleteSection(section.id, section.title)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /> Remove</button>
                        </div>
                      </details>
                    </div>
                  </div>

                  {/* Missing references are historical snapshots, not usable questions. */}
                  {bankQuestionsError && (
                    <div className="mx-4 mt-3 p-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 text-xs">
                      Question Bank could not be verified: {bankQuestionsError}. Reload this page before changing question assignments.
                    </div>
                  )}
                  {bankQuestionsLoaded && section.questions.some((question) => !availableBankIds.has(question.questionId)) && (
                    <div className="mx-4 mt-3 p-3 rounded-xl border border-rose-300 bg-rose-50 text-rose-800 text-xs">
                      Some questions in this section are no longer available. Replace them from the Question Bank before publishing. Previous student results will remain unchanged.
                    </div>
                  )}
                  {/* Section Questions Sub-list */}
                  <div id={`assessment-questions-${section.id}`} hidden={isCollapsed} className="p-4 sm:p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 text-xs">
                      <div>
                        <h4 className="font-bold text-slate-900">Questions in this section <span className="text-blue-700">({section.questions.length})</span></h4>
                        <p className="mt-1 text-[11px] text-slate-500">Each section needs at least one question.</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => openQuestionPicker(section.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold transition cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Add questions</span>
                      </button>
                    </div>

                    {/* Question items */}
                    <div className="space-y-3">
                      {section.questions.map((qItem, qIdx) => {
                        const bankMatch = bankQuestions.find((bq) => bq.id === qItem.questionId)
                        const isUnavailable = bankQuestionsLoaded && !bankMatch
                        const promptText =
                          qItem.questionSnapshot?.prompt ||
                          bankMatch?.prompt ||
                          'Question Prompt Preview'
                        const diff =
                          qItem.questionSnapshot?.difficulty || bankMatch?.difficulty || 'medium'
                        const qType =
                          qItem.questionSnapshot?.questionType ||
                          bankMatch?.questionType ||
                          'multiple_choice'

                        return (
                          <div
                            key={qItem.id}
                            className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${isUnavailable ? 'bg-rose-50/80 border-rose-300' : 'bg-slate-50/70 hover:bg-slate-50 border-slate-200/80'}`}
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <span className="w-6 h-6 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0">
                                {qIdx + 1}
                              </span>

                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                    {qType.replace('_', ' ')}
                                  </span>
                                  <span
                                    className={`text-[9px] font-bold px-2 py-0.5 rounded-full capitalize ${
                                      diff === 'easy'
                                        ? 'bg-emerald-100/70 text-emerald-800'
                                        : diff === 'hard'
                                        ? 'bg-rose-100/70 text-rose-800'
                                        : 'bg-amber-100/70 text-amber-800'
                                    }`}
                                  >
                                    {diff}
                                  </span>
                                  {bankMatch?.domain && (
                                    <span className="text-[10px] text-slate-400 truncate max-w-[150px]">
                                      • {bankMatch.domain}
                                    </span>
                                  )}
                                </div>
                                {isUnavailable && (
                                  <div className="text-[11px] text-rose-700 font-bold mt-1">
                                    Missing or inaccessible in Question Bank — not usable in a student assessment.
                                    <span className="block text-[10px] font-normal break-all">ID: {qItem.questionId}</span>
                                  </div>
                                )}
                                <div className="text-xs text-slate-800 font-medium mt-1 leading-relaxed max-w-full overflow-x-auto">
                                  <MathRenderer text={promptText} />
                                </div>
                              </div>
                            </div>

                            {/* Question Actions */}
                            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                              <div className="flex items-center gap-1">
                                <label className="text-[11px] text-slate-500 font-medium">Points:</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={50}
                                  value={qItem.pointsOverride ?? 1}
                                  onChange={(e) =>
                                    handleUpdatePoints(section.id, qItem.id, Number(e.target.value))
                                  }
                                  className="w-14 px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs text-center font-semibold"
                                />
                              </div>

                              <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                                <button
                                  type="button"
                                  disabled={qIdx === 0}
                                  onClick={() => handleMoveQuestion(section.id, qIdx, -1)}
                                  className="p-1 rounded-lg hover:bg-white text-slate-500 disabled:opacity-30"
                                >
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={qIdx === section.questions.length - 1}
                                  onClick={() => handleMoveQuestion(section.id, qIdx, 1)}
                                  className="p-1 rounded-lg hover:bg-white text-slate-500 disabled:opacity-30"
                                >
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDuplicateQuestion(section.id, qItem.id)}
                                  disabled={isUnavailable}
                                  title={isUnavailable ? 'Unavailable question cannot be duplicated' : 'Duplicate question in section'}
                                  className="p-1 rounded-lg hover:bg-white text-slate-500 hover:text-blue-600 transition"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={hasMinQuestions}
                                  onClick={() => handleRemoveQuestion(section.id, qItem.id)}
                                  title={
                                    hasMinQuestions
                                      ? 'Each section must have at least 1 question'
                                      : 'Remove question from section'
                                  }
                                  className="p-1 rounded-lg hover:bg-rose-50 text-rose-500 disabled:opacity-30 ml-1 transition"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ASSESSMENT SETTINGS ("as the previous project") */}
      {/* ========================================================================= */}
      {activeTab === 'settings' && (
        <div className="space-y-6 max-w-4xl mx-auto">
          {/* Card A: General & Identity */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-blue-600" />
              <span>Assessment Overview & Identity</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Assessment Title</label>
                <input
                  type="text"
                  value={assessment.title}
                  onChange={(e) => handleUpdateAssessment({ title: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Subtitle / Sub-header</label>
                <input
                  type="text"
                  value={assessment.subtitle || ''}
                  onChange={(e) => handleUpdateAssessment({ subtitle: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Subject</label>
                  <input
                    type="text"
                    value={assessment.subject}
                    onChange={(e) => handleUpdateAssessment({ subject: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Grade / Level</label>
                  <input
                    type="text"
                    value={assessment.grade}
                    onChange={(e) => handleUpdateAssessment({ grade: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Assessment Description</label>
                <textarea
                  rows={2}
                  value={assessment.description || ''}
                  onChange={(e) => handleUpdateAssessment({ description: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  General Directions / Instructions
                </label>
                <textarea
                  rows={2}
                  value={assessment.instructions || ''}
                  onChange={(e) => handleUpdateAssessment({ instructions: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Survey availability is configured here, alongside the other assessment settings. */}
          <section aria-label="Post-assessment survey setting" className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Post-assessment Survey</h3>
            {isLoadingSurvey ? (
              <p className="text-xs text-slate-500">Loading survey setting...</p>
            ) : surveyLoadError ? (
              <div className="space-y-2">
                <p role="alert" className="text-xs text-rose-700">Survey setting could not be loaded. Please refresh before making changes.</p>
                <button type="button" onClick={() => setActiveTab('survey')} className="text-xs font-semibold text-blue-700 underline">Open survey details</button>
              </div>
            ) : assessmentSurvey ? (
              <>
                <label className="flex items-center gap-3 text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={assessmentSurvey.isActive}
                    onChange={(e) => handleUpdateSurvey({ isActive: e.target.checked })}
                    disabled={isSavingSurvey}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Show survey after assessment
                </label>
                <p className="text-xs text-slate-500">
                  {assessmentSurvey.isActive
                    ? 'On: students see the survey after submitting.'
                    : 'Off: students go directly to their diagnostic report.'}
                </p>
                <button type="button" onClick={() => setActiveTab('survey')} className="text-xs font-semibold text-blue-700 hover:underline">
                  Manage survey questions
                </button>
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-700">Off — no survey has been created for this assessment.</p>
                <p className="text-xs text-slate-500">Students go directly to the report. To turn the survey on, create it in the Survey tab.</p>
                <button type="button" onClick={() => setActiveTab('survey')} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
                  Create and enable survey
                </button>
              </div>
            )}
          </section>

          <AssessmentScoringEditor key={assessment.id} initial={assessment.settings.scoring || {scheme:'standard',mode:'default',sections:[]}}
            sections={assessment.sections} saving={savingStatus !== null}
            onSave={async scoring => { await handleUpdateSettings({scoring}) }} />

          <AssessmentPassingBenchmarkEditor key={`${assessment.id}:${assessment.settings.scoring?.scheme ?? 'standard'}`}
            settings={assessment.settings} saving={savingStatus !== null}
            onSave={async value => { await handleUpdateSettings({ passingBenchmark: { scheme: assessment.settings.scoring?.scheme ?? 'standard', value }, ...(assessment.settings.scoring?.scheme === 'standard' ? { passingPercentage: value } : {}) }) }} />

          {/* Card B: Generic Evaluation Profile */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Award className="h-4 w-4 text-indigo-600" />
                <span>Evaluation Profile</span>
              </h3>
              <p className="mt-1 text-[11px] text-slate-500 max-w-2xl">
                Choose the generic evaluation configuration used when this assessment is evaluated.
                The profile defines its scoring method, performance levels, and evaluation rules.
              </p>
            </div>

            {isLoadingEvaluationProfiles ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-5 text-xs text-slate-500">
                Loading evaluation profiles...
              </div>
            ) : evaluationProfileLoadError && availableEvaluationProfiles.length === 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                {evaluationProfileLoadError}
              </div>
            ) : availableEvaluationProfiles.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-5 text-xs text-slate-500">
                No active evaluation profiles are available. Create one in Evaluation Profiles first.
              </div>
            ) : (
              <div className="space-y-3">
                <select
                  value={selectedEvaluationProfileId || ''}
                  onChange={(e) => handleSetEvaluationProfile(e.target.value)}
                  disabled={isSavingEvaluationProfile}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-800 bg-white disabled:opacity-60"
                >
                  <option value="">No evaluation profile assigned</option>
                  {availableEvaluationProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}{profile.code ? ` (${profile.code})` : ''} — {profile.scoringMethod}
                    </option>
                  ))}
                </select>

                {selectedEvaluationProfileId && (
                  <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 px-4 py-3">
                    {(() => {
                      const selectedProfile = availableEvaluationProfiles.find(
                        (profile) => profile.id === selectedEvaluationProfileId
                      )
                      if (!selectedProfile) return null

                      return (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-indigo-900">
                            {selectedProfile.name}
                          </p>
                          {selectedProfile.description && (
                            <p className="text-[11px] leading-relaxed text-indigo-800/70">
                              {selectedProfile.description}
                            </p>
                          )}
                          <p className="text-[10px] font-medium uppercase tracking-wide text-indigo-600">
                            Scoring: {selectedProfile.scoringMethod.replace('_', ' ')}
                          </p>
                        </div>
                      )
                    })()}
                  </div>
                )}

                {evaluationProfileLoadError && (
                  <p className="text-[11px] text-amber-700">{evaluationProfileLoadError}</p>
                )}
              </div>
            )}
          </div>

          {/* Card D: Timing & Delivery Mode */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              <span>Timing & Delivery Modes</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Timer Mode</label>
                <select
                  value={assessment.settings.timerMode}
                  onChange={(e) => handleUpdateSettings({ timerMode: e.target.value as any })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 bg-white"
                >
                  <option value="per_section">Per-Section Timers (Independent)</option>
                  <option value="per_assessment">Single Overall Assessment Timer</option>
                  <option value="untimed">Untimed Mode</option>
                </select>
              </div>

              {assessment.settings.timerMode === 'per_assessment' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Overall Minutes Allowed
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={assessment.settings.timerMinutes}
                    onChange={(e) => handleUpdateSettings({ timerMinutes: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Allowed Attempts</label>
                <select
                  value={assessment.settings.attempts}
                  onChange={(e) => handleUpdateSettings({ attempts: Number(e.target.value) })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 bg-white"
                >
                  <option value={1}>1 Attempt Only</option>
                  <option value={2}>2 Attempts</option>
                  <option value={3}>3 Attempts</option>
                  <option value={0}>Unlimited Attempts</option>
                </select>
              </div>
            </div>
          </div>

          {/* Card D: Navigation & Behavior */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Shuffle className="h-4 w-4 text-blue-600" />
              <span>Navigation & Delivery Rules</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition cursor-pointer">
                <div>
                  <div className="text-xs font-semibold text-slate-800">Allow Backtracking</div>
                  <div className="text-[11px] text-slate-500">Students may revisit previous questions.</div>
                </div>
                <input
                  type="checkbox"
                  checked={assessment.settings.allowBack}
                  onChange={(e) => handleUpdateSettings({ allowBack: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition cursor-pointer">
                <div>
                  <div className="text-xs font-semibold text-slate-800">Require Answer</div>
                  <div className="text-[11px] text-slate-500">Must select an answer before advancing.</div>
                </div>
                <input
                  type="checkbox"
                  checked={assessment.settings.requireAnswer}
                  onChange={(e) => handleUpdateSettings({ requireAnswer: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition cursor-pointer">
                <div>
                  <div className="text-xs font-semibold text-slate-800">Auto-Save Progress</div>
                  <div className="text-[11px] text-slate-500">Persist student responses in real time.</div>
                </div>
                <input
                  type="checkbox"
                  checked={assessment.settings.saveProgress}
                  onChange={(e) => handleUpdateSettings({ saveProgress: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition cursor-pointer">
                <div>
                  <div className="text-xs font-semibold text-slate-800">Shuffle Answer Choices</div>
                  <div className="text-[11px] text-slate-500">Randomize multiple-choice option order.</div>
                </div>
                <input
                  type="checkbox"
                  checked={assessment.settings.shuffleChoices}
                  onChange={(e) => handleUpdateSettings({ shuffleChoices: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600"
                />
              </label>
            </div>
          </div>

          {/* Card E: Results & Feedback */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-blue-600" />
              <span>After Submission & Feedback</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition cursor-pointer">
                <div>
                  <div className="text-xs font-semibold text-slate-800">Show Final Score</div>
                  <div className="text-[11px] text-slate-500">Show student score percentage upon submission.</div>
                </div>
                <input
                  type="checkbox"
                  checked={assessment.settings.showScore}
                  onChange={(e) => handleUpdateSettings({ showScore: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition cursor-pointer">
                <div>
                  <div className="text-xs font-semibold text-slate-800">Show Correct Answers</div>
                  <div className="text-[11px] text-slate-500">Reveal correct answers in diagnostic review.</div>
                </div>
                <input
                  type="checkbox"
                  checked={assessment.settings.showCorrectAnswers}
                  onChange={(e) => handleUpdateSettings({ showCorrectAnswers: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition cursor-pointer">
                <div>
                  <div className="text-xs font-semibold text-slate-800">Show Step-by-Step Explanations</div>
                  <div className="text-[11px] text-slate-500">Provide detailed rationales for each problem.</div>
                </div>
                <input
                  type="checkbox"
                  checked={assessment.settings.showExplanations}
                  onChange={(e) => handleUpdateSettings({ showExplanations: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition cursor-pointer">
                <div>
                  <div className="text-xs font-semibold text-slate-800">Show Diagnostic Analytics</div>
                  <div className="text-[11px] text-slate-500">Display domain mastery radar and time analysis.</div>
                </div>
                <input
                  type="checkbox"
                  checked={assessment.settings.showAnalytics}
                  onChange={(e) => handleUpdateSettings({ showAnalytics: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600"
                />
              </label>
            </div>
          </div>

          {/* Card F: Student Registration Fields */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600" />
              <span>Student Registration / Intake Fields</span>
            </h3>
            <p className="text-xs text-slate-500">
              Choose which workspace registration fields appear on this assessment. Changes are saved with the assessment.
            </p>

            {workspaceFieldsError && <p className="text-xs text-amber-700">{workspaceFieldsError} Please retry loading this page before editing registration fields.</p>}
            {workspaceFields === null && !workspaceFieldsError && <p className="text-xs text-slate-500">Loading registration fields…</p>}
            <div className="space-y-2">
              {displayedStudentFields.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/60"
                >
                  <div>
                    <span className="text-xs font-semibold text-slate-800">{f.label}</span>
                    <span className="text-[10px] text-slate-400 ml-2 uppercase">({f.type})</span>
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={f.enabled}
                        onChange={() => handleToggleStudentField(f.id, 'enabled')}
                        className="rounded border-slate-300 text-blue-600"
                      />
                      <span>Enabled</span>
                    </label>

                    <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={!f.enabled}
                        checked={f.required}
                        onChange={() => handleToggleStudentField(f.id, 'required')}
                        className="rounded border-slate-300 text-blue-600 disabled:opacity-40"
                      />
                      <span>Required</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card G: Security & Passcode */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-600" />
              <span>Security & Access Control</span>
            </h3>

            <div className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 bg-slate-50/50">
              <div>
                <div className="text-xs font-semibold text-slate-800">Passcode Protection</div>
                <div className="text-[11px] text-slate-500">
                  Students must enter this passcode to launch the diagnostic.
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={assessment.settings.passcodeEnabled}
                  onChange={(e) => handleUpdateSettings({ passcodeEnabled: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600"
                />
                {assessment.settings.passcodeEnabled && (
                  <input
                    type="text"
                    value={assessment.settings.passcode}
                    onChange={(e) => handleUpdateSettings({ passcode: e.target.value })}
                    placeholder="Enter passcode"
                    className="w-28 px-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-white font-mono text-center font-bold"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: LIVE STUDENT SIMULATOR */}
      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* TAB 3: ASSESSMENT SURVEY */}
      {/* ========================================================================= */}
      {activeTab === 'survey' && (
        <div className="space-y-6 max-w-5xl mx-auto">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <span>Assessment Survey</span>
                </h3>
                <p className="mt-1 text-[11px] text-slate-500 max-w-3xl">
                  Choose whether students see a short follow-up survey after they finish this assessment.
                  Turning it off does not remove your saved survey questions.
                </p>
              </div>
              {assessmentSurvey && (
                <button
                  type="button"
                  onClick={handleDeleteSurvey}
                  disabled={isSavingSurvey}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-rose-600 border border-rose-200 hover:bg-rose-50 disabled:opacity-50"
                >
                  Delete Survey
                </button>
              )}
            </div>

            {isLoadingSurvey ? (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-xs text-slate-500">
                Loading survey configuration...
              </div>
            ) : !assessmentSurvey ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-6">
                <p className="text-xs font-semibold text-slate-800">No survey is configured.</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Survey is off for this assessment. Create one if you want to offer a follow-up survey after submission.
                </p>
                <div className="mt-4 flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={newSurveyName}
                    onChange={(e) => setNewSurveyName(e.target.value)}
                    className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900"
                    placeholder="Survey name"
                  />
                  <button
                    type="button"
                    onClick={handleCreateSurvey}
                    disabled={isSavingSurvey}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50"
                  >
                    Create Survey
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Survey Name</label>
                    <input
                      type="text"
                      value={assessmentSurvey.name}
                      onChange={(e) =>
                        setAssessmentSurvey((current) =>
                          current ? { ...current, name: e.target.value } : current
                        )
                      }
                      onBlur={() => handleUpdateSurvey({ name: assessmentSurvey.name })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                    <textarea
                      rows={3}
                      value={assessmentSurvey.description || ''}
                      onChange={(e) =>
                        setAssessmentSurvey((current) =>
                          current ? { ...current, description: e.target.value } : current
                        )
                      }
                      onBlur={() =>
                        handleUpdateSurvey({ description: assessmentSurvey.description || null })
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Instructions</label>
                    <textarea
                      rows={3}
                      value={assessmentSurvey.instructions || ''}
                      onChange={(e) =>
                        setAssessmentSurvey((current) =>
                          current ? { ...current, instructions: e.target.value } : current
                        )
                      }
                      onBlur={() =>
                        handleUpdateSurvey({ instructions: assessmentSurvey.instructions || null })
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900"
                    />
                  </div>
                </div>

                <p className="text-xs text-slate-500">
                  Survey visibility is controlled in <strong>Assessment Settings → Post-assessment Survey</strong>.
                  You can manage the survey questions here without changing whether it appears to students.
                </p>

                <div className="border-t border-slate-100 pt-5">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">
                        Survey Questions ({surveyQuestions.length})
                      </h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Question types and configuration remain generic and extensible.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddSurveyQuestion}
                      disabled={isSavingSurvey}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Question
                    </button>
                  </div>

                  {surveyQuestions.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-5 text-center text-xs text-slate-500">
                      No survey questions yet.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {surveyQuestions.map((question, index) => (
                        <div
                          key={question.id}
                          className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex flex-col gap-1 pt-1">
                              <button
                                type="button"
                                onClick={() => handleMoveSurveyQuestion(index, -1)}
                                disabled={index === 0}
                                className="p-1 rounded-lg hover:bg-white disabled:opacity-25"
                                title="Move up"
                              >
                                <ChevronUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveSurveyQuestion(index, 1)}
                                disabled={index === surveyQuestions.length - 1}
                                className="p-1 rounded-lg hover:bg-white disabled:opacity-25"
                                title="Move down"
                              >
                                <ChevronDown className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            <div className="flex-1 min-w-0 space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                  Question {index + 1}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSurveyQuestion(question.id)}
                                  disabled={isSavingSurvey}
                                  className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 disabled:opacity-50"
                                  title="Delete question"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="md:col-span-2">
                                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                                    Prompt
                                  </label>
                                  <textarea
                                    rows={2}
                                    value={question.prompt}
                                    onChange={(e) =>
                                      setSurveyQuestions((current) =>
                                        current.map((item) =>
                                          item.id === question.id
                                            ? { ...item, prompt: e.target.value }
                                            : item
                                        )
                                      )
                                    }
                                    onBlur={() =>
                                      handleUpdateSurveyQuestion(question.id, {
                                        prompt: question.prompt,
                                      })
                                    }
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 bg-white"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                                    Question Type
                                  </label>
                                  <input
                                    type="text"
                                    value={question.questionType}
                                    onChange={(e) =>
                                      setSurveyQuestions((current) =>
                                        current.map((item) =>
                                          item.id === question.id
                                            ? { ...item, questionType: e.target.value }
                                            : item
                                        )
                                      )
                                    }
                                    onBlur={() =>
                                      handleUpdateSurveyQuestion(question.id, {
                                        questionType: question.questionType,
                                      })
                                    }
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 bg-white"
                                    placeholder="e.g. text, scale, choice"
                                  />
                                  <label className="mt-2 inline-flex items-center gap-2 text-[10px] font-semibold text-slate-600">
                                    <input
                                      type="checkbox"
                                      checked={question.isRequired}
                                      onChange={(e) =>
                                        handleUpdateSurveyQuestion(question.id, {
                                          isRequired: e.target.checked,
                                        })
                                      }
                                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    Required
                                  </label>
                                </div>
                              </div>

                              <div>
                                <div className="flex items-center justify-between gap-3 mb-2">
                                  <div>
                                    <span className="text-[10px] font-semibold text-slate-600">Options</span>
                                    <span className="ml-2 text-[9px] text-slate-400">
                                      Optional — use when the question type needs choices.
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleAddSurveyOption(question)}
                                    disabled={isSavingSurvey}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                  >
                                    <Plus className="h-3 w-3" />
                                    Add Option
                                  </button>
                                </div>

                                {question.options.length > 0 && (
                                  <div className="space-y-2">
                                    {question.options.map((option: SurveyQuestionOption, optionIndex: number) => (
                                      <div key={option.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                                        <input
                                          type="text"
                                          value={option.value}
                                          onChange={(e) =>
                                            setSurveyQuestions((current) =>
                                              current.map((item) =>
                                                item.id === question.id
                                                  ? {
                                                      ...item,
                                                      options: item.options.map((entry) =>
                                                        entry.id === option.id
                                                          ? { ...entry, value: e.target.value }
                                                          : entry
                                                      ),
                                                    }
                                                  : item
                                              )
                                            )
                                          }
                                          onBlur={() =>
                                            handleUpdateSurveyOption(question.id, option.id, {
                                              value: option.value,
                                            })
                                          }
                                          placeholder={`value ${optionIndex + 1}`}
                                          className="rounded-lg border border-slate-200 px-2.5 py-2 text-[10px] bg-white"
                                        />
                                        <input
                                          type="text"
                                          value={option.label}
                                          onChange={(e) =>
                                            setSurveyQuestions((current) =>
                                              current.map((item) =>
                                                item.id === question.id
                                                  ? {
                                                      ...item,
                                                      options: item.options.map((entry) =>
                                                        entry.id === option.id
                                                          ? { ...entry, label: e.target.value }
                                                          : entry
                                                      ),
                                                    }
                                                  : item
                                              )
                                            )
                                          }
                                          onBlur={() =>
                                            handleUpdateSurveyOption(question.id, option.id, {
                                              label: option.label,
                                            })
                                          }
                                          placeholder={`label ${optionIndex + 1}`}
                                          className="rounded-lg border border-slate-200 px-2.5 py-2 text-[10px] bg-white"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteSurveyOption(question.id, option.id)}
                                          className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50"
                                          title="Delete option"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <details className="rounded-xl border border-slate-200 bg-white">
                                <summary className="cursor-pointer px-3 py-2 text-[10px] font-semibold text-slate-600">
                                  Advanced configuration (JSON)
                                </summary>
                                <div className="p-3 border-t border-slate-100">
                                  <textarea
                                    rows={4}
                                    defaultValue={JSON.stringify(question.config || {}, null, 2)}
                                    onBlur={(e) =>
                                      handleUpdateSurveyQuestionConfig(question, e.target.value)
                                    }
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-mono text-slate-800"
                                  />
                                  <p className="mt-1 text-[9px] text-slate-400">
                                    Store type-specific configuration here without adding new schema columns.
                                  </p>
                                </div>
                              </details>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {surveyLoadError && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                {surveyLoadError}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'preview' && (
        <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center space-y-4 max-w-2xl mx-auto shadow-2xs">
          <PlayCircle className="h-12 w-12 text-emerald-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-900">Staff Trial Preview</h3>
          <p className="text-xs text-slate-500 leading-relaxed max-w-md mx-auto">
            Test the student experience, section transitions, timers, breaks, and calculator rules. Staff trials do not create student attempts or reports. The trial uses the last saved version.
          </p>
          {editAssessmentDirty && <p className="text-xs font-semibold text-amber-700">Save your changes first to include them in the trial.</p>}
          <div className="pt-2">
            <Link
              to={`/admin/assessments/${assessment.id}/preview`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition"
            >
              <PlayCircle className="h-4 w-4" />
              <span>Launch Trial Preview (Not Saved)</span>
            </Link>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: REMOVE QUESTION CONFIRMATION */}
      {/* ========================================================================= */}
      {pendingQuestionRemoval && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-question-title"
          aria-describedby="remove-question-description"
          className="fixed inset-0 z-[70] bg-slate-950/55 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-5">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 border border-rose-100">
                  <Trash2 className="h-5 w-5 text-rose-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 id="remove-question-title" className="text-base font-bold text-slate-900">
                    Remove question from section?
                  </h3>
                  <p id="remove-question-description" className="mt-1.5 text-xs leading-5 text-slate-500">
                    This removes the question from this assessment section only. The original question remains safely available in the Question Bank.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !isRemovingQuestion && setPendingQuestionRemoval(null)}
                  disabled={isRemovingQuestion}
                  className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Close confirmation"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5">
                <div className="mb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  <FileText className="h-3.5 w-3.5" />
                  Question to remove
                </div>
                <div className="text-sm font-medium leading-6 text-slate-800 break-words">
                  {renderPickerMath(pendingQuestionRemoval.preview)}
                </div>
              </div>

              <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[11px] leading-5 text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  The assessment must keep at least one question in every section. This action cannot remove the section's final question.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
              <button
                type="button"
                onClick={() => setPendingQuestionRemoval(null)}
                disabled={isRemovingQuestion}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmQuestionRemoval}
                disabled={isRemovingQuestion || savingStatus !== null}
                aria-busy={isRemovingQuestion}
                className="inline-flex min-w-[150px] items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRemovingQuestion ? (
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                <span>{isRemovingQuestion ? 'Removing...' : 'Remove Question'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingSectionRemoval && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-section-title"
          aria-describedby="remove-section-description"
          className="fixed inset-0 z-[70] bg-slate-950/55 backdrop-blur-sm flex items-center justify-center p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isRemovingSection) {
              setPendingSectionRemoval(null)
            }
          }}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-5">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-rose-100 bg-rose-50">
                  <Trash2 className="h-5 w-5 text-rose-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 id="remove-section-title" className="text-base font-bold text-slate-900">
                    Remove section?
                  </h3>
                  <p id="remove-section-description" className="mt-1.5 text-xs leading-5 text-slate-500">
                    This permanently removes the section from this assessment. The questions themselves remain safely available in the Question Bank.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !isRemovingSection && setPendingSectionRemoval(null)}
                  disabled={isRemovingSection}
                  className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Close confirmation"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5">
                <div className="mb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  <Layers className="h-3.5 w-3.5" />
                  Section to remove
                </div>
                <div className="break-words text-sm font-semibold leading-6 text-slate-800">
                  {pendingSectionRemoval.title}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {pendingSectionRemoval.questionCount} {pendingSectionRemoval.questionCount === 1 ? 'question' : 'questions'} in this section
                </div>
              </div>

              <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[11px] leading-5 text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  The section and its assessment-specific question assignments will be removed. This action cannot be undone from the assessment.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
              <button
                type="button"
                onClick={() => setPendingSectionRemoval(null)}
                disabled={isRemovingSection}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSectionRemoval}
                disabled={isRemovingSection || savingStatus !== null}
                aria-busy={isRemovingSection}
                className="inline-flex min-w-[150px] items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRemovingSection ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                <span>{isRemovingSection ? 'Removing...' : 'Remove Section'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: SECTION SETTINGS */}
      {/* ========================================================================= */}
      {editingSection && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 border border-slate-200 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Sliders className="h-4 w-4 text-blue-600" />
                <span>Configure Section Settings</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingSection(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-semibold"
              >
                ✕
              </button>
            </div>

            {savingStatus && (
              <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-3.5 py-3 text-xs text-blue-800">
                <span className="h-4 w-4 shrink-0 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
                <div>
                  <div className="font-semibold">{savingStatus}</div>
                  <div className="text-[11px] text-blue-600 mt-0.5">
                    Please wait while the section changes are written…
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSaveSectionSettings} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Section Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={sectionTitle}
                  onChange={(e) => setSectionTitle(e.target.value)}
                  placeholder="e.g. Module 1: Math or Section 1 (No Calculator)"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Section Description / Specific Instructions
                </label>
                <textarea
                  rows={2}
                  value={sectionDesc}
                  onChange={(e) => setSectionDesc(e.target.value)}
                  placeholder="e.g. For questions in this section, calculators are strictly prohibited..."
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900"
                />
              </div>

              <fieldset className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <legend className="px-1 text-xs font-bold text-slate-800">Section participation</legend>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-white border border-slate-200 p-3">
                  <input type="radio" name="section-participation" className="mt-0.5 accent-teal-700"
                    checked={!sectionSettings.optional}
                    onChange={() => setSectionSettings((previous) => ({ ...previous, optional: false }))} />
                  <span><span className="block text-sm font-semibold text-slate-900">Required</span>
                    <span className="text-xs text-slate-600">Students start this section normally.</span></span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-white border border-slate-200 p-3">
                  <input type="radio" name="section-participation" className="mt-0.5 accent-teal-700"
                    checked={sectionSettings.optional === true}
                    onChange={() => setSectionSettings((previous) => ({ ...previous, optional: true }))} />
                  <span><span className="block text-sm font-semibold text-slate-900">Optional</span>
                    <span className="text-xs text-slate-600">Ask students whether to take this section or finish. Required sections later in the assessment cannot be skipped.</span></span>
                </label>
              </fieldset>

              {/* Section Timing */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-800">Timed Section</label>
                  <input
                    type="checkbox"
                    checked={sectionSettings.timingEnabled}
                    onChange={(e) =>
                      setSectionSettings((prev) => ({ ...prev, timingEnabled: e.target.checked }))
                    }
                    className="rounded border-slate-300 text-blue-600"
                  />
                </div>
                {sectionSettings.timingEnabled && (
                  <div className="flex items-center justify-between gap-4 pt-1">
                    <span className="text-xs text-slate-600">Time Limit:</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={300}
                        value={sectionSettings.timeLimitMinutes}
                        onChange={(e) =>
                          setSectionSettings((prev) => ({
                            ...prev,
                            timeLimitMinutes: Number(e.target.value),
                          }))
                        }
                        className="w-20 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs text-center font-bold"
                      />
                      <span className="text-xs text-slate-500">minutes</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Tools & Policies */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-slate-800">Calculator Allowed</div>
                    <div className="text-[11px] text-slate-500">
                      Show on-screen calculator during this section.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={sectionSettings.calculatorAllowed}
                    onChange={(e) =>
                      setSectionSettings((prev) => ({
                        ...prev,
                        calculatorAllowed: e.target.checked,
                      }))
                    }
                    className="rounded border-slate-300 text-blue-600"
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                  <span className="text-xs font-medium text-slate-700">Allow Backtracking in Section</span>
                  <input
                    type="checkbox"
                    checked={sectionSettings.allowBack}
                    onChange={(e) =>
                      setSectionSettings((prev) => ({ ...prev, allowBack: e.target.checked }))
                    }
                    className="rounded border-slate-300 text-blue-600"
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                  <span className="text-xs font-medium text-slate-700">Require Answer Before Next</span>
                  <input
                    type="checkbox"
                    checked={sectionSettings.requireAnswer}
                    onChange={(e) =>
                      setSectionSettings((prev) => ({ ...prev, requireAnswer: e.target.checked }))
                    }
                    className="rounded border-slate-300 text-blue-600"
                  />
                </div>
              </div>

              {/* Break Intermission */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-slate-800">Scheduled Break After Section</div>
                    <div className="text-[11px] text-slate-500">
                      Present intermission screen before next section begins.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={sectionSettings.hasBreakAfter}
                    onChange={(e) =>
                      setSectionSettings((prev) => ({ ...prev, hasBreakAfter: e.target.checked }))
                    }
                    className="rounded border-slate-300 text-blue-600"
                  />
                </div>

                {sectionSettings.hasBreakAfter && (
                  <div className="space-y-2 pt-2 border-t border-slate-200/60">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-600">Break Duration:</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={sectionSettings.breakDurationMinutes}
                          onChange={(e) =>
                            setSectionSettings((prev) => ({
                              ...prev,
                              breakDurationMinutes: Number(e.target.value),
                            }))
                          }
                          className="w-20 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs text-center font-bold"
                        />
                        <span className="text-xs text-slate-500">minutes</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 font-medium mb-1">
                        Break Message:
                      </label>
                      <input
                        type="text"
                        value={sectionSettings.breakInstructions || ''}
                        onChange={(e) =>
                          setSectionSettings((prev) => ({
                            ...prev,
                            breakInstructions: e.target.value,
                          }))
                        }
                        placeholder="e.g. Take a 10-minute break before Module 2."
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingSection(null)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingStatus !== null}
                  aria-busy={savingStatus !== null}
                  className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 shadow-xs disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {savingStatus ? (
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  <span>{savingStatus ? 'Saving...' : 'Save Section Settings'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD QUESTIONS FROM QUESTION BANK */}
      {/* ========================================================================= */}
      {pickerSectionId && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 border border-slate-200 shadow-xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Add Questions from Question Bank</h3>
                <p className="text-xs text-slate-500">
                  Select questions to add to this section. (Minimum 1 question per section is preserved).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPickerSectionId(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-semibold"
              >
                ✕
              </button>
            </div>

            {savingStatus && (
              <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-3.5 py-3 text-xs text-blue-800">
                <span className="h-4 w-4 shrink-0 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
                <div>
                  <div className="font-semibold">{savingStatus}</div>
                  <div className="text-[11px] text-blue-600 mt-0.5">
                    Please wait while the selected questions are added and saved.
                  </div>
                </div>
              </div>
            )}

            {/* Filter controls — intentionally mirrors Question Bank filters without linking the assessment to a taxonomy. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="Search prompt, lesson, collection..."
                  className="w-full pl-8 pr-2.5 py-1.5 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              <select
                value={pickerCollectionFilter}
                onChange={(e) => setPickerCollectionFilter(e.target.value)}
                className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs bg-white"
              >
                <option value="all">All Collections</option>
                {uniqueCollections.map((collection) => (
                  <option key={collection} value={collection}>{collection}</option>
                ))}
              </select>

              {availableTaxonomies.length > 0 ? (
                <select
                  value={pickerTaxonomyId}
                  onChange={(e) => {
                    setPickerTaxonomyId(e.target.value)
                    setPickerTaxonomyNodeId('all')
                  }}
                  className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs bg-white"
                >
                  <option value="">All Taxonomies</option>
                  {availableTaxonomies.map((taxonomy) => (
                    <option key={taxonomy.id} value={taxonomy.id}>{taxonomy.name}</option>
                  ))}
                </select>
              ) : (
                <select
                  value={pickerDomainFilter}
                  onChange={(e) => {
                    setPickerDomainFilter(e.target.value)
                    setPickerChapterFilter('all')
                  }}
                  className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs bg-white"
                >
                  <option value="all">All Domains (Units)</option>
                  {uniqueDomains.map((domain) => <option key={domain} value={domain}>{domain}</option>)}
                </select>
              )}

              <select
                value={pickerDifficultyFilter}
                onChange={(e) => setPickerDifficultyFilter(e.target.value)}
                className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs bg-white"
              >
                <option value="all">All Difficulties</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>

              {availableTaxonomies.length > 0 && pickerTaxonomyId && pickerTaxonomyNodes.length > 0 && (
                <select
                  value={pickerTaxonomyNodeId}
                  onChange={(e) => setPickerTaxonomyNodeId(e.target.value)}
                  className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs bg-white"
                >
                  <option value="all">All Taxonomy Nodes</option>
                  {pickerTaxonomyNodes
                    .slice()
                    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.name).localeCompare(String(b.name)))
                    .map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
                </select>
              )}

              {availableTaxonomies.length === 0 && pickerDomainFilter !== 'all' && pickerChapterOptions.length > 0 && (
                <select
                  value={pickerChapterFilter}
                  onChange={(e) => setPickerChapterFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs bg-white"
                >
                  <option value="all">All Chapters</option>
                  {pickerChapterOptions.map((chapter) => <option key={chapter} value={chapter}>{chapter}</option>)}
                </select>
              )}

              <select
                value={pickerTypeFilter}
                onChange={(e) => setPickerTypeFilter(e.target.value)}
                className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs bg-white"
              >
                <option value="all">All Formats</option>
                <option value="multiple_choice">Multiple Choice</option>
                <option value="multi_select">Multi-Select</option>
                <option value="grid_in">Grid-In</option>
              </select>
            </div>

            {/* Questions List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {filteredPickerQuestions.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No matching questions found or all are already added to this section.
                </div>
              ) : (
                filteredPickerQuestions.map((q) => {
                  const isSelected = selectedQuestionIds.includes(q.id)

                  return (
                    <div
                      key={q.id}
                      onClick={() => handleTogglePickQuestion(q.id)}
                      className={`p-3 rounded-2xl border transition cursor-pointer flex items-start gap-3 ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center border shrink-0 ${
                          isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-500">{q.domain}</span>
                          <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full capitalize bg-slate-100 text-slate-700">
                            {q.difficulty}
                          </span>
                        </div>
                        <div className="text-xs text-slate-900 font-medium mt-1 line-clamp-2 leading-relaxed">{renderPickerMath(q.prompt)}</div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Bottom Actions */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-600 font-medium">
                {selectedQuestionIds.length} question(s) selected
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPickerSectionId(null)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={selectedQuestionIds.length === 0 || savingStatus !== null}
                  aria-busy={savingStatus !== null}
                  onClick={handleConfirmAddQuestions}
                  className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-40 shadow-xs cursor-pointer"
                >
                  {savingStatus ? (
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  <span>{savingStatus ? 'Adding...' : 'Add Selected to Section'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <ShareAssessmentModal
          assessmentId={assessment.id}
          assessmentName={assessment.title}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </AdminLayout>
  )
}

export default AssessmentDetailPage
