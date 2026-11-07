import { parseNumericAnswer, parseNumericTolerance } from '../lib/numericAnswer'
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate, useParams, Link, useSearchParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import 'katex/dist/katex.min.css'
import { InlineMath, BlockMath } from 'react-katex'
import {
  ArrowLeft,
  Save,
  Eye,
  CheckCircle2,
  HelpCircle,
  Sparkles,
  Layers,
  BookOpen,
  Plus,
  Trash2,
  Calculator,
  Clock,
  Image as ImageIcon,
  Check,
  AlertCircle,
  Lightbulb,
  FileCode,
  Sliders,
  Upload,
  X,
  FileText,
  FolderPlus,
  Loader2,
} from 'lucide-react'
import {
  questionBankService,
  QuestionChoice,
  QuestionBankItem,
  GenericTaxonomy,
} from '../lib/questionBankService'
import { executeUnitOfWork } from '../lib/unitOfWork'
import { assessmentService } from '../lib/assessmentService'
import MathRenderer from '../components/MathRenderer'
import MathSymbolInserter, { MathSymbolItem } from '../components/MathSymbolInserter'
import { useUnsavedChanges } from '../contexts/UnsavedChangesContext'
import { supabase } from '../lib/supabaseClient'
import { QuestionEditorOverview, QuestionEditorNavigation, QuestionEditorViewSwitch, type QuestionEditorStep, type QuestionEditorStepId } from '../components/question-editor/QuestionEditorUI'
import '../components/question-editor/QuestionEditor.css'

export const CreateQuestionPage: React.FC = () => {
  const navigate = useNavigate()
  const { questionId } = useParams()
  const [searchParams] = useSearchParams()
  const queryCollection = searchParams.get('collection')
  const isEditing = Boolean(questionId)

  // Question Categorization State (Domain (Unit) -> Chapter -> Lesson)
  // Strictly database-backed: starts empty if database has no taxonomy, never seeded with hardcoded fallbacks
  const [taxonomyData, setTaxonomyData] = useState<Record<string, any>>(() => questionBankService.getTaxonomy() || {})
  const [genericTaxonomies, setGenericTaxonomies] = useState<GenericTaxonomy[]>([])
  const [customTaxonomyId, setCustomTaxonomyId] = useState('')
  const [selectedTaxonomyNodes, setSelectedTaxonomyNodes] = useState<any[]>([])
  const [isLoadingSelectedTaxonomyNodes, setIsLoadingSelectedTaxonomyNodes] = useState(false)
  // Taxonomy selected for the question itself. This is the parent context for
  // Domain / Chapter / Lesson and for any custom taxonomy items created here.
  const [selectedQuestionTaxonomyId, setSelectedQuestionTaxonomyId] = useState('')
  const initialQuestionTaxonomyIdRef = useRef<string>('')
  const [domain, setDomain] = useState<string>('')
  const [chapter, setChapter] = useState<string>('')
  const [lesson, setLesson] = useState<string>('')
  const [savedGenericTaxonomyLabels, setSavedGenericTaxonomyLabels] = useState<string[]>([])
  const [originalQuestionClassification, setOriginalQuestionClassification] = useState<{ domain: string; chapter: string; lesson: string } | null>(null)
  const [savedTaxonomyNodeIds, setSavedTaxonomyNodeIds] = useState<string[]>([])
  const [savedTaxonomyNodeTaxonomyIds, setSavedTaxonomyNodeTaxonomyIds] = useState<Record<string, string>>({})
  const [isLoadingSavedTaxonomy, setIsLoadingSavedTaxonomy] = useState(false)

  // Taxonomy items created while editing are drafts. They are shown immediately
  // in the selectors, but are not written to Supabase until the question is saved.
  type DraftTaxonomyNode = {
    taxonomyId: string
    type: 'domain' | 'chapter' | 'lesson'
    domain: string
    chapter?: string
    lesson?: string
  }
  const [draftTaxonomyNodes, setDraftTaxonomyNodes] = useState<DraftTaxonomyNode[]>([])
  const [draftTaxonomyData, setDraftTaxonomyData] = useState<Record<string, any>>({})
  const [collection, setCollection] = useState<string>(queryCollection || 'General Question Bank')
  const [isCustomDomain, setIsCustomDomain] = useState(false)
  const [isCustomChapter, setIsCustomChapter] = useState(false)
  const [isCustomLesson, setIsCustomLesson] = useState(false)
  const [isCreatingDomain, setIsCreatingDomain] = useState(false)
  const [isCreatingChapter, setIsCreatingChapter] = useState(false)
  const [isCreatingLesson, setIsCreatingLesson] = useState(false)
  const [customTaxonomyFeedback, setCustomTaxonomyFeedback] = useState<{
    field: 'domain' | 'chapter' | 'lesson'
    message: string
  } | null>(null)

  // Quick Collection Creation Modal
  const [isQuickCollectionModalOpen, setIsQuickCollectionModalOpen] = useState(false)
  const [quickColName, setQuickColName] = useState('')
  const [quickColDesc, setQuickColDesc] = useState('')
  const [quickColError, setQuickColError] = useState<string | null>(null)
  const [isSavingQuickCollection, setIsSavingQuickCollection] = useState(false)
  const [quickColSuccess, setQuickColSuccess] = useState<string | null>(null)
  const quickCollectionInFlightRef = useRef(false)
  const saveQuestionInFlightRef = useRef(false)
  const saveCompletedRef = useRef(false)

  // Delete Question confirmation modal in edit mode
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChangesState] = useState(false)
  const hasUnsavedChangesRef = useRef(false)
  const setHasUnsavedChanges = useCallback((value: boolean | ((current: boolean) => boolean)) => {
    setHasUnsavedChangesState((current) => {
      const next = typeof value === 'function' ? value(current) : value
      hasUnsavedChangesRef.current = next
      return next
    })
  }, [])
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null)

  // Pedagogical & Exam Metadata
  const [questionType, setQuestionType] = useState<'multiple_choice' | 'multi_select' | 'grid_in'>(
    'multiple_choice'
  )
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium')
  const [calculatorAllowed, setCalculatorAllowed] = useState(false)
  const [estimatedSeconds, setEstimatedSeconds] = useState(90)
  const [targetExam, setTargetExam] = useState('EST 1 / SAT Math')

  // Problem Stem & Media (File upload based)
  const [prompt, setPrompt] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imageFileName, setImageFileName] = useState('')
  const [imageFileSize, setImageFileSize] = useState('')
  const [imageCaption, setImageCaption] = useState('')
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Answer Choices for MCQ
  const [choices, setChoices] = useState<QuestionChoice[]>([
    {
      id: 'c1',
      text: '',
      isCorrect: true,
      rationale: '',
    },
    {
      id: 'c2',
      text: '',
      isCorrect: false,
      rationale: '',
    },
    {
      id: 'c3',
      text: '',
      isCorrect: false,
      rationale: '',
    },
    {
      id: 'c4',
      text: '',
      isCorrect: false,
      rationale: '',
    },
  ])

  // Numeric Free Response / Grid-in Answer
  const [numericAnswer, setNumericAnswer] = useState('')
  // step92-7-grid-format: numeric keys stay strict; text keys support short algebraic expressions.
  const [gridAnswerKind, setGridAnswerKind] = useState<'numeric' | 'text'>('numeric')
  const [numericTolerance, setNumericTolerance] = useState('0')
  const [numericAlternateAnswers, setNumericAlternateAnswers] = useState('')

  // Detailed Solution & Diagnostic Feedback
  const [explanation, setExplanation] = useState('')
  const [commonMisconception, setCommonMisconception] = useState('')

  // Preview interactive state
  const [previewSelectedChoice, setPreviewSelectedChoice] = useState<string | null>(null)
  const [previewMultiSelected, setPreviewMultiSelected] = useState<string[]>([])
  const [previewInputAnswer, setPreviewInputAnswer] = useState('')
  const [showExplanationInPreview, setShowExplanationInPreview] = useState(false)
  const [previewMode, setPreviewMode] = useState<'split' | 'editor' | 'preview'>('split')
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null)
  const explanationTextareaRef = useRef<HTMLTextAreaElement>(null)
  const misconceptionTextareaRef = useRef<HTMLTextAreaElement>(null)
  const choiceInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const activeInputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null)
  const [activeTargetName, setActiveTargetName] = useState<string>('prompt')

  // Existing collections list for dropdown
  const [existingCollections, setExistingCollections] = useState<string[]>([])
  const [questionNotFound, setQuestionNotFound] = useState(false)
  const isQuestionLoadedRef = useRef(false)
  const initialDomainRef = useRef<string | null>(null)
  const initialEditorSnapshotRef = useRef<string | null>(null)
  const [isEditorHydrated, setIsEditorHydrated] = useState(false)

  // Snapshot every persisted editor value so dirty-state tracking is not limited
  // to native input change events. This also covers button-driven edits such as
  // calculator permission, answer-key changes, adding/removing choices, and image removal.
  const editorSnapshot = useMemo(() => JSON.stringify({
    domain,
    chapter,
    lesson,
    collection,
    selectedQuestionTaxonomyId,
    difficulty,
    questionType,
    calculatorAllowed,
    estimatedSeconds,
    targetExam,
    prompt,
    imageUrl,
    imageCaption,
    choices: choices.map((choice) => ({
      id: choice.id,
      text: choice.text,
      isCorrect: choice.isCorrect,
      rationale: choice.rationale || '',
    })),
    numericAnswer,
    gridAnswerKind,
    numericAlternateAnswers,
    numericTolerance,
    explanation,
    commonMisconception,
    savedTaxonomyNodeIds: [...savedTaxonomyNodeIds].map(String).sort(),
    savedTaxonomyNodeTaxonomyIds,
    draftTaxonomyNodes,
    draftTaxonomyData,
  }), [
    domain,
    chapter,
    lesson,
    collection,
    selectedQuestionTaxonomyId,
    difficulty,
    questionType,
    calculatorAllowed,
    estimatedSeconds,
    targetExam,
    prompt,
    imageUrl,
    imageCaption,
    choices,
    numericAnswer,
    gridAnswerKind,
    numericAlternateAnswers,
    numericTolerance,
    explanation,
    commonMisconception,
    savedTaxonomyNodeIds,
    savedTaxonomyNodeTaxonomyIds,
    draftTaxonomyNodes,
    draftTaxonomyData,
  ])

  useEffect(() => {
    if (!isEditorHydrated) return

    if (initialEditorSnapshotRef.current === null) {
      initialEditorSnapshotRef.current = editorSnapshot
      setHasUnsavedChanges(false)
      return
    }

    // A successful explicit save may update draft-related state immediately
    // after persistence. Establish the new clean baseline from the committed
    // state before resuming normal dirty tracking.
    if (saveCompletedRef.current) {
      initialEditorSnapshotRef.current = editorSnapshot
      saveCompletedRef.current = false
      setHasUnsavedChanges(false)
      return
    }

    const nextDirty = editorSnapshot !== initialEditorSnapshotRef.current
    setHasUnsavedChanges((current) => current === nextDirty ? current : nextDirty)
  }, [editorSnapshot, isEditorHydrated])

  // Domain / Chapter / Lesson selectors are derived ONLY from the currently
  // selected generic taxonomy. Legacy taxonomyData is intentionally not used
  // here because it contains items from multiple taxonomies. Draft custom
  // items are merged into this selected-taxonomy view until the question is saved.
  const editorTaxonomyData = useMemo(() => {
    const merged: Record<string, any> = {}

    const nodes = selectedTaxonomyNodes.filter(
      (node) => String(node.taxonomyId || '') === String(selectedQuestionTaxonomyId || '')
    )

    const byId = new Map<string, any>(nodes.map((node) => [String(node.id), node]))

    for (const node of nodes) {
      if (node.parentId) continue
      merged[node.name] = {
        unitLabel: node.name,
        code: node.code || '',
        chapters: [],
        nodeId: String(node.id),
      }
    }

    for (const node of nodes) {
      if (!node.parentId) continue
      const parent = byId.get(String(node.parentId))
      if (!parent) continue
      const parentDomain = merged[parent.name]
      if (!parentDomain) continue
      const hasChild = parentDomain.chapters.some((item: any) => String(item.nodeId) === String(node.id))
      if (!hasChild) {
        parentDomain.chapters.push({
          name: node.name,
          code: node.code || '',
          lessons: [],
          nodeId: String(node.id),
        })
      }
    }

    // The generic taxonomy supports arbitrary depth. For this compatibility
    // editor, the first three levels are exposed as Domain -> Chapter -> Lesson.
    for (const node of nodes) {
      if (!node.parentId) continue
      const chapterNode = byId.get(String(node.parentId))
      if (!chapterNode?.parentId) continue
      const domainNode = byId.get(String(chapterNode.parentId))
      if (!domainNode) continue
      const domainEntry = merged[domainNode.name]
      const chapterEntry = domainEntry?.chapters?.find(
        (item: any) => String(item.nodeId) === String(chapterNode.id)
      )
      if (chapterEntry && !chapterEntry.lessons.some((item: any) => String(item.nodeId || item) === String(node.id))) {
        chapterEntry.lessons.push({
          name: node.name,
          code: node.code || '',
          nodeId: String(node.id),
        })
      }
    }

    // Merge only draft nodes belonging to the currently selected taxonomy.
    const drafts = draftTaxonomyNodes.filter(
      (node) => String(node.taxonomyId) === String(selectedQuestionTaxonomyId || '')
    )
    for (const draft of drafts) {
      const domainName = draft.domain.trim()
      if (draft.type === 'domain') {
        if (!merged[domainName]) {
          merged[domainName] = { unitLabel: domainName, code: '', chapters: [], isDraft: true }
        }
      } else if (draft.type === 'chapter') {
        const domainEntry = merged[domainName] || { unitLabel: domainName, code: '', chapters: [], isDraft: true }
        if (!merged[domainName]) merged[domainName] = domainEntry
        if (!domainEntry.chapters.some((item: any) => String(item.name).toLowerCase() === String(draft.chapter || '').trim().toLowerCase())) {
          domainEntry.chapters.push({ name: String(draft.chapter || '').trim(), code: '', lessons: [], isDraft: true })
        }
      } else if (draft.type === 'lesson') {
        const domainEntry = merged[domainName] || { unitLabel: domainName, code: '', chapters: [], isDraft: true }
        if (!merged[domainName]) merged[domainName] = domainEntry
        let chapterEntry = domainEntry.chapters.find(
          (item: any) => String(item.name).toLowerCase() === String(draft.chapter || '').trim().toLowerCase()
        )
        if (!chapterEntry) {
          chapterEntry = { name: String(draft.chapter || '').trim(), code: '', lessons: [], isDraft: true }
          domainEntry.chapters.push(chapterEntry)
        }
        if (!chapterEntry.lessons.some((item: any) => String(item.name || item).toLowerCase() === String(draft.lesson || '').trim().toLowerCase())) {
          chapterEntry.lessons.push({ name: String(draft.lesson || '').trim(), code: '', isDraft: true })
        }
      }
    }

    return merged
  }, [selectedTaxonomyNodes, selectedQuestionTaxonomyId, draftTaxonomyNodes])

  // Load the authoritative generic taxonomy list and saved collections once when
  // the editor mounts. The selectors must never depend on the legacy taxonomy cache:
  // a new question needs an explicit parent taxonomy before its hierarchy can be chosen.
  useEffect(() => {
    let cancelled = false

    const loadEditorReferenceData = async () => {
      try {
        const [taxonomies] = await Promise.all([
          questionBankService.fetchGenericTaxonomies(),
          questionBankService.fetchCollectionsFromDatabase(),
        ])

        if (cancelled) return

        // Keep the full GenericTaxonomy contract intact. Do not reduce these
        // objects to { id, name, code }, because the editor state intentionally
        // models organization ownership and active/inactive status as well.
        const activeTaxonomies: GenericTaxonomy[] = (taxonomies || [])
          .filter((taxonomy): taxonomy is GenericTaxonomy => Boolean(taxonomy?.id && taxonomy?.name))
          .filter((taxonomy) => taxonomy.isActive !== false)
          .map((taxonomy) => ({
            id: String(taxonomy.id),
            organizationId: String(taxonomy.organizationId || ''),
            name: String(taxonomy.name || '').trim(),
            code: taxonomy.code ? String(taxonomy.code) : undefined,
            description: taxonomy.description ? String(taxonomy.description) : undefined,
            isActive: taxonomy.isActive !== false,
          }))
          .filter((taxonomy) => taxonomy.id && taxonomy.name && taxonomy.organizationId)

        setGenericTaxonomies(activeTaxonomies)

        const collectionNames = Array.from(
          new Set(
            questionBankService
              .getCollectionsList()
              .map((item) => String(item?.name || '').trim())
              .filter(Boolean)
          )
        )
        setExistingCollections(collectionNames)

        // Keep the persisted edit selection if one exists. For a new question,
        // intentionally leave Taxonomy empty so the author explicitly chooses
        // where the question belongs.
      } catch (error) {
        if (!cancelled) {
          console.error('[Question Editor] Failed to load taxonomy/collection references:', error)
          setGenericTaxonomies([])
          setExistingCollections([])
        }
      }
    }

    void loadEditorReferenceData()

    return () => {
      cancelled = true
    }
  }, [])

  // Load only the nodes belonging to the selected taxonomy.
  useEffect(() => {
    let cancelled = false
    const taxonomyId = String(selectedQuestionTaxonomyId || '').trim()
    if (!taxonomyId) {
      setSelectedTaxonomyNodes([])
      setIsLoadingSelectedTaxonomyNodes(false)
      return
    }

    setIsLoadingSelectedTaxonomyNodes(true)
    void questionBankService.fetchGenericTaxonomyNodes(taxonomyId)
      .then((nodes) => {
        if (!cancelled) setSelectedTaxonomyNodes(nodes || [])
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('[Question Editor] Failed to load selected taxonomy nodes:', error)
          setSelectedTaxonomyNodes([])
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSelectedTaxonomyNodes(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedQuestionTaxonomyId])

  // Load the complete persisted question context before hydrating dependent
  // selectors. Edit mode must never render a default/empty taxonomy and then
  // overwrite the persisted value because a second request finished later.
  useEffect(() => {
    let cancelled = false

    const hydrateQuestion = async () => {
      setIsEditorHydrated(false)
      initialEditorSnapshotRef.current = null
      setHasUnsavedChanges(false)
      setSavedGenericTaxonomyLabels([])
      setSavedTaxonomyNodeIds([])
      setSavedTaxonomyNodeTaxonomyIds({})
      setIsLoadingSavedTaxonomy(false)
      setQuestionNotFound(false)

      if (!questionId) {
        if (queryCollection) setCollection(queryCollection)
        setIsEditorHydrated(true)
        return
      }

      let existing: QuestionBankItem | null = null

      try {
        // Cache-first, database-backed fallback. This is required for direct
        // navigation and browser refreshes in edit mode.
        existing = await questionBankService.fetchQuestionById(questionId)
      } catch (error: any) {
        console.error('[Question Editor] Failed to load question from database:', error)
        if (!cancelled) {
          setFormError(error?.message || 'Could not load this question. Please try again.')
        }
        return
      }

      if (!existing) {
        const assessments = assessmentService.getStoredAssessments()
        outer: for (const assessment of assessments) {
          for (const section of assessment.sections || []) {
            const match = (section.questions || []).find(
              (item) => item.questionId === questionId || item.id === questionId
            )
            if (match?.questionSnapshot) {
              existing = match.questionSnapshot as QuestionBankItem
              break outer
            }
          }
        }
      }

      if (!existing) {
        if (!cancelled) setQuestionNotFound(true)
        return
      }

      if (cancelled) return

      // Hydrate scalar question data first. Relationship state is hydrated below
      // from its authoritative database relationships and must not be replaced
      // by defaults from the local question cache.
      setOriginalQuestionClassification({ domain: existing.domain || '', chapter: existing.chapter || '', lesson: existing.lesson || '' })
      initialDomainRef.current = existing.domain || ''
      setDomain(existing.domain || '')
      setChapter(existing.chapter || '')
      setLesson(existing.lesson || '')
      setCollection(existing.collection || 'General Question Bank')
      setQuestionType(existing.questionType || 'multiple_choice')
      setDifficulty(existing.difficulty || 'medium')
      setCalculatorAllowed(Boolean(existing.calculatorAllowed))
      setEstimatedSeconds(existing.estimatedSeconds || 90)
      setTargetExam(existing.targetExam || 'EST 1 / SAT Math')
      setPrompt(existing.prompt || '')
      setImageUrl(existing.imageUrl || '')
      setImageCaption(existing.imageCaption || '')
      if (existing.choices && Array.isArray(existing.choices) && existing.choices.length > 0) {
        setChoices(existing.choices.map((choice: any, index: number) => ({
          id: choice?.id || `c${index + 1}`,
          text: typeof choice === 'string' ? choice : (choice?.text ?? ''),
          isCorrect: Boolean(choice?.isCorrect),
          rationale: choice?.rationale || '',
        })))
      }
      setNumericAnswer(existing.numericAnswer || '')
      setGridAnswerKind(existing.gridAnswerKind === 'text' ? 'text' : 'numeric')
      setNumericAlternateAnswers((existing.numericAlternateAnswers || []).join('\n'))
      setNumericTolerance(existing.numericTolerance || '0')
      setExplanation(existing.explanation || '')
      setCommonMisconception(existing.commonMisconception || '')

      setIsLoadingSavedTaxonomy(true)
      try {
        const context = await questionBankService.fetchQuestionEditorContext(questionId)
        if (cancelled) return

        if (context.collectionName) setCollection(context.collectionName)

        let nodeIds = Array.from(new Set(context.taxonomyNodeIds.map(String).filter(Boolean)))
        let taxonomyId = context.taxonomyId ? String(context.taxonomyId) : ''
        let taxonomyNodes = context.taxonomyNodes || []

        // Compatibility fallback for older/local questions whose relationship
        // rows predate the generic taxonomy relationship table.
        if (nodeIds.length === 0 && Array.isArray(existing.taxonomyNodeIds) && existing.taxonomyNodeIds.length > 0) {
          nodeIds = Array.from(new Set(existing.taxonomyNodeIds.map(String).filter(Boolean)))
        }

        if (!taxonomyId && nodeIds.length > 0) {
          const taxonomies = await questionBankService.fetchGenericTaxonomies()
          const nodeSets = await Promise.all(
            taxonomies.map(async (taxonomy) => ({
              taxonomyId: String(taxonomy.id),
              nodes: await questionBankService.fetchGenericTaxonomyNodes(String(taxonomy.id)),
            }))
          )
          for (const set of nodeSets) {
            if (set.nodes.some((node) => nodeIds.includes(String(node.id)))) {
              taxonomyId = set.taxonomyId
              taxonomyNodes = set.nodes
              break
            }
          }
        }

        // Last compatibility path: resolve legacy Domain > Chapter > Lesson
        // labels into the generic taxonomy without creating or mutating data.
        if (!taxonomyId) {
          const legacyDomain = String(existing.domain || '').trim().toLowerCase()
          const legacyChapter = String(existing.chapter || '').trim().toLowerCase()
          const legacyLesson = String(existing.lesson || '').trim().toLowerCase()
          if (legacyDomain && legacyChapter && legacyLesson) {
            const taxonomies = await questionBankService.fetchGenericTaxonomies()
            for (const taxonomy of taxonomies.filter((item) => item.isActive)) {
              const nodes = await questionBankService.fetchGenericTaxonomyNodes(String(taxonomy.id))
              const domainNode = nodes.find(
                (node) => !node.parentId && node.name.trim().toLowerCase() === legacyDomain
              )
              if (!domainNode) continue
              const chapterNode = nodes.find(
                (node) => String(node.parentId || '') === String(domainNode.id) &&
                  node.name.trim().toLowerCase() === legacyChapter
              )
              if (!chapterNode) continue
              const lessonNode = nodes.find(
                (node) => String(node.parentId || '') === String(chapterNode.id) &&
                  node.name.trim().toLowerCase() === legacyLesson
              )
              const resolved = lessonNode || chapterNode || domainNode
              taxonomyId = String(taxonomy.id)
              taxonomyNodes = nodes
              nodeIds = [String(resolved.id)]
              break
            }
          }
        }

        // Some persisted editor contexts contain the taxonomy ID but omit its
        // node collection. Fetch the actual hierarchy before restoring selectors.
        if (taxonomyId && taxonomyNodes.length === 0) {
          taxonomyNodes = await questionBankService.fetchGenericTaxonomyNodes(taxonomyId)
          if (cancelled) return
        }

        if (taxonomyId) {
          // Establish parent taxonomy and its complete node set before the
          // dependent Domain/Chapter/Lesson selectors are considered hydrated.
          setSelectedQuestionTaxonomyId(taxonomyId)
          setCustomTaxonomyId(taxonomyId)
          initialQuestionTaxonomyIdRef.current = taxonomyId
          setSelectedTaxonomyNodes(
            taxonomyNodes.filter((node) => String(node.taxonomyId) === taxonomyId)
          )
        }

        const nodesById = new Map(taxonomyNodes.map((node) => [String(node.id), node]))
        const taxonomies = await questionBankService.fetchGenericTaxonomies()
        const taxonomyNames = new Map(taxonomies.map((item) => [String(item.id), item.name]))

        const taxonomyIdMap: Record<string, string> = {}
        for (const id of nodeIds) {
          const node = nodesById.get(String(id))
          if (node) taxonomyIdMap[String(id)] = String(node.taxonomyId)
        }

        setSavedTaxonomyNodeIds(nodeIds)
        setSavedTaxonomyNodeTaxonomyIds(taxonomyIdMap)

        if (nodeIds.length > 0) {
          const labels = nodeIds.map((id) => {
            const node = nodesById.get(String(id))
            if (!node) return `Saved taxonomy node (${id})`
            const path = [node.name]
            let parentId = node.parentId ? String(node.parentId) : ''
            const visited = new Set<string>([String(node.id)])
            while (parentId && !visited.has(parentId)) {
              visited.add(parentId)
              const parent = nodesById.get(parentId)
              if (!parent) break
              path.unshift(parent.name)
              parentId = parent.parentId ? String(parent.parentId) : ''
            }
            const taxonomyName = taxonomyNames.get(String(node.taxonomyId))
            return taxonomyName ? `${taxonomyName}: ${path.join(' › ')}` : path.join(' › ')
          })
          setSavedGenericTaxonomyLabels(Array.from(new Set(labels)))

          // The persisted assignment is represented by the deepest selected
          // node. Derive the visible hierarchy from its ancestry.
          const primaryNode = nodesById.get(String(nodeIds[0]))
          if (primaryNode) {
            const path: typeof primaryNode[] = []
            let cursor: typeof primaryNode | undefined = primaryNode
            const visited = new Set<string>()
            while (cursor && !visited.has(String(cursor.id))) {
              visited.add(String(cursor.id))
              path.unshift(cursor)
              cursor = cursor.parentId ? nodesById.get(String(cursor.parentId)) : undefined
            }
            if (path[0]) setDomain(path[0].name)
            if (path[1]) setChapter(path[1].name)
            if (path[2]) setLesson(path[2].name)
          }
        }
      } catch (error) {
        // Never clear valid persisted editor state because an auxiliary request
        // failed. Keep the question editable and surface the error in logs.
        console.error('[Question Editor] Failed to hydrate persisted context:', error)
      } finally {
        if (!cancelled) {
          setIsLoadingSavedTaxonomy(false)
          isQuestionLoadedRef.current = true
          setIsEditorHydrated(true)
        }
      }
    }

    void hydrateQuestion()
    return () => {
      cancelled = true
    }
  }, [questionId, queryCollection])

  // Default domain, chapter, lesson for a new question when taxonomyData is populated
  useEffect(() => {
    if (isEditing) return
    const domainKeys = Object.keys(editorTaxonomyData)
    if (domainKeys.length === 0) {
      if (!isCustomDomain) setDomain('')
      if (!isCustomChapter) setChapter('')
      if (!isCustomLesson) setLesson('')
      return
    }

    // If current domain is empty or invalid, select the first valid domain from DB
    if (!isCustomDomain && (!domain || !editorTaxonomyData[domain])) {
      const firstDom = domainKeys[0]
      setDomain(firstDom)
      const chapters = editorTaxonomyData[firstDom]?.chapters || []
      if (!isCustomChapter) {
        if (chapters.length > 0) {
          setChapter(chapters[0].name)
          if (!isCustomLesson) {
            const firstLesson = chapters[0].lessons?.[0] as unknown
            const firstLessonName =
              typeof firstLesson === 'string'
                ? firstLesson
                : firstLesson && typeof firstLesson === 'object' && 'name' in firstLesson
                ? String((firstLesson as { name?: unknown }).name ?? '')
                : ''
            setLesson(firstLessonName)
          }
        } else {
          setChapter('')
          if (!isCustomLesson) setLesson('')
        }
      }
    }
  }, [editorTaxonomyData, isEditing, isCustomDomain, isCustomChapter, isCustomLesson])

  const handleQuickCreateCollection = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (quickCollectionInFlightRef.current) return
    setQuickColError(null)
    setQuickColSuccess(null)

    const name = quickColName.trim()
    if (!name) {
      setQuickColError('Collection name cannot be empty.')
      return
    }

    quickCollectionInFlightRef.current = true
    setIsSavingQuickCollection(true)

    try {
      // Persist to Supabase before closing the modal or showing success.
      const res = await questionBankService.createCollectionAndPersist(
        name,
        quickColDesc.trim()
      )

      if (!res.success || !res.collection) {
        setQuickColError(res.error || 'Could not save the collection. Please try again.')
        return
      }

      // Re-read the authoritative database-backed collection list so this page
      // and the Question Bank page see the same saved collections.
      const savedCollections = await questionBankService.fetchCollectionsFromDatabase()
      const updatedList = Array.from(new Set(savedCollections.map((item) => item.name)))
      setExistingCollections(updatedList)
      setCollection(res.collection.name)
      setIsQuickCollectionModalOpen(false)
      setQuickColName('')
      setQuickColDesc('')
      setQuickColSuccess(`Collection "${res.collection.name}" created and selected successfully.`)
      window.setTimeout(() => setQuickColSuccess(null), 4500)
    } catch (error: any) {
      setQuickColError(error?.message || 'Could not save the collection. Please try again.')
    } finally {
      quickCollectionInFlightRef.current = false
      setIsSavingQuickCollection(false)
    }
  }

  // Update chapters only when user changes domain interactively
  useEffect(() => {
    if (isCustomChapter) return
    // Prevent overriding chapter during initial question load
    if (isEditing && !isQuestionLoadedRef.current) return
    if (initialDomainRef.current === domain) return

    const domainData = domain ? editorTaxonomyData[domain] : null
    if (isEditing && isQuestionLoadedRef.current && !domainData) return
    if (domainData && domainData.chapters && domainData.chapters.length > 0) {
      const defaultChapter = domainData.chapters[0].name
      setChapter(defaultChapter)
      if (!isCustomLesson) {
        const firstLesson = domainData.chapters[0].lessons?.[0]
        setLesson(firstLesson ? (typeof firstLesson === 'string' ? firstLesson : firstLesson.name) : '')
      }
    } else {
      setChapter('')
      if (!isCustomLesson) {
        setLesson('')
      }
    }
  }, [domain, isCustomChapter, isCustomLesson, editorTaxonomyData, isEditing])

  // Update lessons when chapter changes interactively
  useEffect(() => {
    if (isCustomLesson || isCustomChapter) return
    if (isEditing && !isQuestionLoadedRef.current) return

    const domainData = domain ? editorTaxonomyData[domain] : null
    const matched = domainData?.chapters?.find((c: any) => c.name === chapter)
    if (isEditing && isQuestionLoadedRef.current && !matched) return
    if (matched && matched.lessons && matched.lessons.length > 0) {
      // Keep existing lesson if valid in this chapter, otherwise pick first
      const lessonNames = matched.lessons.map((item: any) => typeof item === 'string' ? item : item.name)
      if (!lessonNames.includes(lesson)) {
        const firstLesson = matched.lessons[0]
        setLesson(typeof firstLesson === 'string' ? firstLesson : firstLesson.name)
      }
    } else {
      setLesson('')
    }
  }, [chapter, domain, isCustomLesson, isCustomChapter, editorTaxonomyData, isEditing, lesson])

  const handleQuestionTaxonomyChange = async (taxonomyId: string) => {
    const currentTaxonomyId = selectedQuestionTaxonomyId || customTaxonomyId
    if (taxonomyId !== currentTaxonomyId && draftTaxonomyNodes.length > 0) {
      setFormError('You have pending custom Domain / Chapter / Lesson items. Save the question or discard those changes before switching taxonomy.')
      return
    }

    setSelectedQuestionTaxonomyId(taxonomyId)
    setCustomTaxonomyId(taxonomyId)
    setFormError(null)

    if (!taxonomyId) {
      setSelectedTaxonomyNodes([])
      setSavedTaxonomyNodeIds([])
      setDomain('')
      setChapter('')
      setLesson('')
      setHasUnsavedChanges(true)
      return
    }

    try {
      // The selected taxonomy is the sole source for the Domain / Chapter /
      // Lesson selectors. Never fall back to the global legacy taxonomy here.
      const nodes = await questionBankService.fetchGenericTaxonomyNodes(taxonomyId)
      setSelectedTaxonomyNodes(nodes || [])

      const byId = new Map((nodes || []).map((node: any) => [String(node.id), node]))
      const roots = (nodes || []).filter((node: any) => !node.parentId)
      const normalized = (value: string) => value.trim().toLowerCase()

      const currentRoot = roots.find((node: any) => normalized(node.name) === normalized(domain))
      const domainNode = currentRoot || roots[0]

      // Keep these outside the conditional so the exact hierarchy selected above
      // is also available when rebuilding the taxonomy assignment below.
      let selectedChapterNode: any = null
      let selectedLessonNode: any = null

      if (domainNode) {
        const chapters = (nodes || []).filter(
          (node: any) => String(node.parentId || '') === String(domainNode.id)
        )
        const currentChapter = chapters.find((node: any) => normalized(node.name) === normalized(chapter))
        selectedChapterNode = currentChapter || chapters[0] || null

        const lessons = selectedChapterNode
          ? (nodes || []).filter(
              (node: any) => String(node.parentId || '') === String(selectedChapterNode.id)
            )
          : []
        const currentLesson = lessons.find((node: any) => normalized(node.name) === normalized(lesson))
        selectedLessonNode = currentLesson || lessons[0] || null

        setDomain(String(domainNode.name))
        setChapter(selectedChapterNode ? String(selectedChapterNode.name) : '')
        setLesson(selectedLessonNode ? String(selectedLessonNode.name) : '')
      } else {
        setDomain('')
        setChapter('')
        setLesson('')
      }

      // Keep the question's generic assignment aligned with the exact selected
      // Domain -> Chapter -> Lesson path, but only inside this taxonomy.
      // Use the newly selected hierarchy values instead of stale React state.
      const selectedDomain = domainNode?.name ? String(domainNode.name) : ''
      const selectedChapter = selectedChapterNode?.name ? String(selectedChapterNode.name) : ''
      const selectedLesson = selectedLessonNode?.name ? String(selectedLessonNode.name) : ''
      const target = [selectedDomain, selectedChapter, selectedLesson].filter(Boolean)

      const candidates = (nodes || [])
        .filter((node: any) => node.isActive !== false)
        .filter((node: any) => {
          const names: string[] = [String(node.name || '')]
          let parentId = node.parentId ? String(node.parentId) : ''
          const visited = new Set<string>([String(node.id)])
          while (parentId && !visited.has(parentId)) {
            visited.add(parentId)
            const parent = byId.get(parentId)
            if (!parent) break
            names.unshift(String(parent.name || ''))
            parentId = parent.parentId ? String(parent.parentId) : ''
          }
          if (names.length < target.length) return false
          const tail = names.slice(-target.length)
          return tail.every((name, index) => normalized(name) === normalized(target[index]))
        })
        .sort((a: any, b: any) => Number(b.sortOrder || 0) - Number(a.sortOrder || 0))

      if (candidates[0]) {
        setSavedTaxonomyNodeIds([String(candidates[0].id)])
        setSavedTaxonomyNodeTaxonomyIds({ [String(candidates[0].id)]: taxonomyId })
      } else {
        setSavedTaxonomyNodeIds([])
        setSavedTaxonomyNodeTaxonomyIds({})
      }
      setHasUnsavedChanges(true)
    } catch (error: any) {
      setFormError(error?.message || 'Could not load the selected taxonomy.')
    }
  }

  const syncGenericAssignmentFromPath = (nextDomain: string, nextChapter: string, nextLesson: string) => {
    const taxonomyId = selectedQuestionTaxonomyId || customTaxonomyId
    if (!taxonomyId || selectedTaxonomyNodes.length === 0) return

    const normalized = (value: unknown) => String(value ?? '').trim().toLowerCase()
    const nodes = selectedTaxonomyNodes.filter(
      (node: any) => String(node.taxonomyId || '') === String(taxonomyId)
    )
    const domainNode = nodes.find(
      (node: any) => !node.parentId && normalized(node.name) === normalized(nextDomain)
    )
    if (!domainNode) return

    const chapterNode = nodes.find(
      (node: any) => String(node.parentId || '') === String(domainNode.id) &&
        normalized(node.name) === normalized(nextChapter)
    )
    if (!chapterNode) {
      setSavedTaxonomyNodeIds([String(domainNode.id)])
      setSavedTaxonomyNodeTaxonomyIds({ [String(domainNode.id)]: String(taxonomyId) })
      return
    }

    const lessonNode = nodes.find(
      (node: any) => String(node.parentId || '') === String(chapterNode.id) &&
        normalized(node.name) === normalized(nextLesson)
    )
    const targetNode = lessonNode || chapterNode
    setSavedTaxonomyNodeIds([String(targetNode.id)])
    setSavedTaxonomyNodeTaxonomyIds({ [String(targetNode.id)]: String(taxonomyId) })
  }

  const addDraftDomain = (taxonomyId: string, name: string) => {
    setDraftTaxonomyNodes((current) => {
      const withoutSame = current.filter(
        (node) => !(node.taxonomyId === taxonomyId && node.type === 'domain' && node.domain.toLowerCase() === name.toLowerCase())
      )
      return [...withoutSame, { taxonomyId, type: 'domain', domain: name }]
    })
    setDraftTaxonomyData((current) => ({
      ...current,
      [name]: current[name] || { unitLabel: `Unit: ${name}`, code: '', chapters: [] },
    }))
  }

  const addDraftChapter = (taxonomyId: string, domainName: string, chapterName: string) => {
    setDraftTaxonomyNodes((current) => {
      const withoutSame = current.filter(
        (node) => !(node.taxonomyId === taxonomyId && node.type === 'chapter' && node.domain.toLowerCase() === domainName.toLowerCase() && node.chapter?.toLowerCase() === chapterName.toLowerCase())
      )
      return [...withoutSame, { taxonomyId, type: 'chapter', domain: domainName, chapter: chapterName }]
    })
    setDraftTaxonomyData((current) => {
      const domainData = current[domainName] || { unitLabel: `Unit: ${domainName}`, code: '', chapters: [] }
      const chapters = [...(domainData.chapters || [])]
      if (!chapters.some((item: any) => item.name.toLowerCase() === chapterName.toLowerCase())) {
        chapters.push({ name: chapterName, code: '', lessons: [] })
      }
      return { ...current, [domainName]: { ...domainData, chapters } }
    })
  }

  const addDraftLesson = (taxonomyId: string, domainName: string, chapterName: string, lessonName: string) => {
    setDraftTaxonomyNodes((current) => {
      const withoutSame = current.filter(
        (node) => !(node.taxonomyId === taxonomyId && node.type === 'lesson' && node.domain.toLowerCase() === domainName.toLowerCase() && node.chapter?.toLowerCase() === chapterName.toLowerCase() && node.lesson?.toLowerCase() === lessonName.toLowerCase())
      )
      return [...withoutSame, { taxonomyId, type: 'lesson', domain: domainName, chapter: chapterName, lesson: lessonName }]
    })
    setDraftTaxonomyData((current) => {
      const domainData = current[domainName] || { unitLabel: `Unit: ${domainName}`, code: '', chapters: [] }
      const chapters = [...(domainData.chapters || [])]
      let target = chapters.find((item: any) => item.name.toLowerCase() === chapterName.toLowerCase())
      if (!target) {
        target = { name: chapterName, code: '', lessons: [] }
        chapters.push(target)
      }
      if (!target.lessons.some((item: string) => item.toLowerCase() === lessonName.toLowerCase())) {
        target.lessons = [...target.lessons, lessonName]
      }
      return { ...current, [domainName]: { ...domainData, chapters } }
    })
  }

  const handleCreateCustomDomain = async () => {
    const trimmed = domain.trim()
    if (!trimmed || isCreatingDomain) return
    if (!customTaxonomyId) { setFormError('Select a taxonomy before creating a custom domain.'); return }
    setIsCreatingDomain(true)
    setCustomTaxonomyFeedback(null)
    try {
      addDraftDomain(customTaxonomyId, trimmed)
      setIsCustomDomain(false)
      setIsCustomChapter(true)
      setIsCustomLesson(true)
      setDomain(trimmed)
      setChapter('')
      setLesson('')
      setHasUnsavedChanges(true)
      setCustomTaxonomyFeedback({
        field: 'domain',
        message: `Domain "${trimmed}" is ready and selected. It will be created when you save the question.`,
      })
      setTimeout(() => setCustomTaxonomyFeedback(null), 4500)
    } finally {
      setIsCreatingDomain(false)
    }
  }

  const handleCreateCustomChapter = async () => {
    const trimmedChap = chapter.trim()
    const trimmedDom = domain.trim()
    if (!trimmedChap || isCreatingChapter) return
    if (!customTaxonomyId) { setFormError('Select a taxonomy before creating a custom chapter.'); return }
    if (!trimmedDom) {
      setFormError('Please select or specify a Domain first before adding a Chapter.')
      return
    }
    setIsCreatingChapter(true)
    setCustomTaxonomyFeedback(null)
    try {
      addDraftChapter(customTaxonomyId, trimmedDom, trimmedChap)
      setIsCustomChapter(false)
      setIsCustomLesson(true)
      setChapter(trimmedChap)
      setLesson('')
      setHasUnsavedChanges(true)
      setCustomTaxonomyFeedback({
        field: 'chapter',
        message: `Chapter "${trimmedChap}" is ready under ${trimmedDom}. It will be created when you save the question.`,
      })
      setTimeout(() => setCustomTaxonomyFeedback(null), 4500)
    } finally {
      setIsCreatingChapter(false)
    }
  }

  const handleCreateCustomLesson = async () => {
    const trimmedLess = lesson.trim()
    const trimmedChap = chapter.trim()
    const trimmedDom = domain.trim()
    if (!trimmedLess || isCreatingLesson) return
    if (!customTaxonomyId) { setFormError('Select a taxonomy before creating a custom lesson.'); return }
    if (!trimmedDom) {
      setFormError('Please select or specify a Domain first before adding a Lesson.')
      return
    }
    if (!trimmedChap) {
      setFormError('Please select or specify a Chapter first before adding a Lesson.')
      return
    }
    setIsCreatingLesson(true)
    setCustomTaxonomyFeedback(null)
    try {
      addDraftLesson(customTaxonomyId, trimmedDom, trimmedChap, trimmedLess)
      setIsCustomLesson(false)
      setLesson(trimmedLess)
      setHasUnsavedChanges(true)
      setCustomTaxonomyFeedback({
        field: 'lesson',
        message: `Lesson "${trimmedLess}" is ready under ${trimmedChap}. It will be created when you save the question.`,
      })
      setTimeout(() => setCustomTaxonomyFeedback(null), 4500)
    } finally {
      setIsCreatingLesson(false)
    }
  }

  const persistDraftTaxonomy = async (): Promise<{ taxonomyNodeIds: string[]; createdNodeIds: string[] }> => {
    if (draftTaxonomyNodes.length === 0) {
      // No new custom nodes are being staged. Preserve the question's existing
      // persisted taxonomy assignment instead of accidentally clearing it.
      // This is especially important when editing a question and changing only
      // its content.
      return {
        taxonomyNodeIds: Array.from(new Set(savedTaxonomyNodeIds.map(String).filter(Boolean))),
        createdNodeIds: [],
      }
    }

    const createdNodeIds: string[] = []
    const selectedIdsByTaxonomy = new Map<string, string[]>()
    const sorted = [...draftTaxonomyNodes].sort((a, b) => {
      const order = { domain: 0, chapter: 1, lesson: 2 }
      return order[a.type] - order[b.type]
    })

    for (const draft of sorted) {
      const before = await questionBankService.fetchGenericTaxonomyNodes(draft.taxonomyId)
      const beforeIds = new Set(before.map((node) => String(node.id)))

      if (draft.type === 'domain') {
        await questionBankService.addDomain(draft.domain, undefined, undefined, draft.taxonomyId)
      } else if (draft.type === 'chapter') {
        await questionBankService.addChapter(draft.domain, draft.chapter || '', undefined, draft.taxonomyId)
      } else {
        await questionBankService.addLesson(draft.domain, draft.chapter || '', draft.lesson || '', draft.taxonomyId)
      }

      const after = await questionBankService.fetchGenericTaxonomyNodes(draft.taxonomyId)
      let target: any
      if (draft.type === 'domain') {
        target = after.find((node) => !node.parentId && node.name.trim().toLowerCase() === draft.domain.trim().toLowerCase())
      } else if (draft.type === 'chapter') {
        const domainNode = after.find((node) => !node.parentId && node.name.trim().toLowerCase() === draft.domain.trim().toLowerCase())
        target = after.find((node) => node.parentId === domainNode?.id && node.name.trim().toLowerCase() === (draft.chapter || '').trim().toLowerCase())
      } else {
        const domainNode = after.find((node) => !node.parentId && node.name.trim().toLowerCase() === draft.domain.trim().toLowerCase())
        const chapterNode = after.find((node) => node.parentId === domainNode?.id && node.name.trim().toLowerCase() === (draft.chapter || '').trim().toLowerCase())
        target = after.find((node) => node.parentId === chapterNode?.id && node.name.trim().toLowerCase() === (draft.lesson || '').trim().toLowerCase())
      }
      if (!target) throw new Error(`Could not resolve the newly created ${draft.type} in the selected taxonomy.`)

      const targetId = String(target.id)
      if (!beforeIds.has(targetId)) createdNodeIds.push(targetId)
      const ids = selectedIdsByTaxonomy.get(draft.taxonomyId) || []
      if (!ids.includes(targetId)) ids.push(targetId)
      selectedIdsByTaxonomy.set(draft.taxonomyId, ids)
    }

    const nextIds = [...savedTaxonomyNodeIds]
    const taxonomyIdsToReplace = new Set(sorted.map((draft) => draft.taxonomyId))
    const preserved = nextIds.filter((id) => !taxonomyIdsToReplace.has(savedTaxonomyNodeTaxonomyIds[id]))
    const finalIds = [...preserved]
    for (const ids of selectedIdsByTaxonomy.values()) {
      for (const id of ids) if (!finalIds.includes(id)) finalIds.push(id)
    }

    return { taxonomyNodeIds: finalIds, createdNodeIds }
  }

  const rollbackCreatedTaxonomyNodes = async (createdNodeIds: string[]) => {
    if (createdNodeIds.length === 0) return
    try {
      await supabase.from('question_taxonomy_nodes').delete().in('taxonomy_node_id', createdNodeIds)
      await supabase.from('taxonomy_nodes').delete().in('id', [...createdNodeIds].reverse())
    } catch (error) {
      console.error('[Question Edit] Failed to rollback draft taxonomy nodes:', error)
    }
  }

  const discardUnsavedChanges = () => {
    setDraftTaxonomyNodes([])
    setDraftTaxonomyData({})
    setCustomTaxonomyFeedback(null)
    setSelectedQuestionTaxonomyId(initialQuestionTaxonomyIdRef.current)
    setCustomTaxonomyId(initialQuestionTaxonomyIdRef.current)
    setHasUnsavedChanges(false)
  }

  // Active target label computation
  const activeTargetLabel = useMemo(() => {
    if (activeTargetName === 'prompt') return 'Problem Stem'
    if (activeTargetName === 'explanation') return 'Step-by-Step Solution'
    if (activeTargetName === 'misconception') return 'Misconceptions'
    if (activeTargetName.startsWith('choice-')) {
      const cId = activeTargetName.replace('choice-', '')
      const idx = choices.findIndex((c) => c.id === cId)
      if (idx !== -1) {
        return `Option ${String.fromCharCode(65 + idx)}`
      }
      return 'Choice Option'
    }
    return 'Problem Stem'
  }, [activeTargetName, choices])

  // Quick Math & LaTeX Snippet Inserter (supports dollar sign, wrapping, and cursor positioning)
  const handleInsertMathSnippet = (item: MathSymbolItem) => {
    // Determine the active target element
    let targetEl: HTMLTextAreaElement | HTMLInputElement | null = activeInputRef.current
    if (!targetEl || !document.body.contains(targetEl)) {
      targetEl = promptTextareaRef.current
      setActiveTargetName('prompt')
    }
    if (!targetEl) return

    const start = targetEl.selectionStart ?? 0
    const end = targetEl.selectionEnd ?? 0
    const currentText = targetEl.value ?? ''
    const hasSelection = end > start
    const selectedText = currentText.substring(start, end)

    // Check if cursor is already inside an inline math delimiter ($ ... $)
    let dollarCountBefore = 0
    for (let i = 0; i < start; i++) {
      if (currentText[i] === '$' && (i === 0 || currentText[i - 1] !== '\\')) {
        dollarCountBefore++
      }
    }
    const isInsideMath = dollarCountBefore % 2 === 1

    let insertionText = ''
    let newCursorPos = start
    let newSelectLength = 0

    if (item.isCurrency) {
      // Literal currency dollar sign: \$ (prevents LaTeX parser breaking)
      insertionText = '\\$'
      newCursorPos = start + insertionText.length
    } else if (item.isDelimiter) {
      if (item.latex === '$') {
        if (hasSelection) {
          // If already surrounded by $, toggle it off, else wrap in $
          if (selectedText.startsWith('$') && selectedText.endsWith('$') && selectedText.length >= 2) {
            insertionText = selectedText.slice(1, -1)
            newCursorPos = start
            newSelectLength = insertionText.length
          } else {
            insertionText = `$${selectedText}$`
            newCursorPos = start
            newSelectLength = insertionText.length
          }
        } else {
          // Insert $ $ and position cursor in the middle
          insertionText = '$ $'
          newCursorPos = start + 1
        }
      } else if (item.latex === '$$') {
        if (hasSelection) {
          insertionText = `$$${selectedText}$$`
          newCursorPos = start
          newSelectLength = insertionText.length
        } else {
          insertionText = '$$\n\n$$'
          newCursorPos = start + 3
        }
      }
    } else if (hasSelection) {
      // Wrapping selected text
      const wrapped = item.wrapTemplate ? item.wrapTemplate(selectedText) : item.latex
      if (!isInsideMath && !item.isDelimiter) {
        insertionText = `$${wrapped}$`
      } else {
        insertionText = wrapped
      }
      newCursorPos = start
      newSelectLength = insertionText.length
    } else {
      // No text selected: insert symbol
      if (item.wrapTemplate) {
        const dummyWrapped = item.wrapTemplate('x')
        if (!isInsideMath) {
          insertionText = `$${dummyWrapped}$`
          newCursorPos = start + (item.cursorOffsetInside ? item.cursorOffsetInside + 1 : 1)
          newSelectLength = item.selectLengthInside ?? 1
        } else {
          insertionText = dummyWrapped
          newCursorPos = start + (item.cursorOffsetInside ?? 0)
          newSelectLength = item.selectLengthInside ?? 1
        }
      } else {
        if (!isInsideMath) {
          insertionText = `$${item.latex}$`
          newCursorPos = start + insertionText.length
        } else {
          insertionText = item.latex
          newCursorPos = start + insertionText.length
        }
      }
    }

    const updatedText = currentText.substring(0, start) + insertionText + currentText.substring(end)

    // Update state based on active target
    if (activeTargetName === 'prompt' || targetEl === promptTextareaRef.current) {
      setPrompt(updatedText)
    } else if (activeTargetName === 'explanation' || targetEl === explanationTextareaRef.current) {
      setExplanation(updatedText)
    } else if (activeTargetName === 'misconception' || targetEl === misconceptionTextareaRef.current) {
      setCommonMisconception(updatedText)
    } else if (activeTargetName.startsWith('choice-')) {
      const choiceId = activeTargetName.replace('choice-', '')
      handleUpdateChoiceText(choiceId, updatedText)
    } else {
      setPrompt(updatedText)
    }

    // Set cursor and focus
    setTimeout(() => {
      if (targetEl) {
        targetEl.focus()
        targetEl.setSelectionRange(newCursorPos, newCursorPos + newSelectLength)
      }
    }, 30)
  }

  // Fallback alias for existing calls
  const insertMathSnippet = (latex: string) => {
    handleInsertMathSnippet({
      label: latex,
      latex,
      name: latex,
      category: 'algebra',
    })
  }

  // Choices Management
  const handleAddChoice = () => {
    const nextId = `c${choices.length + 1}-${Date.now()}`
    setChoices([...choices, { id: nextId, text: '', isCorrect: false, rationale: '' }])
  }

  const handleUpdateChoiceText = (id: string, text: string) => {
    setChoices(choices.map((c) => (c.id === id ? { ...c, text } : c)))
  }

  const handleUpdateChoiceRationale = (id: string, rationale: string) => {
    setChoices(choices.map((c) => (c.id === id ? { ...c, rationale } : c)))
  }

  const handleSetCorrectChoice = (id: string) => {
    if (questionType === 'multiple_choice') {
      setChoices(choices.map((c) => ({ ...c, isCorrect: c.id === id })))
    } else {
      setChoices(choices.map((c) => (c.id === id ? { ...c, isCorrect: !c.isCorrect } : c)))
    }
  }

  const handleRemoveChoice = (id: string) => {
    if (choices.length <= 2) {
      alert('A multiple choice question must have at least 2 options.')
      return
    }
    setChoices(choices.filter((c) => c.id !== id))
  }

  // File-based Image Upload Handling
  const handleFileSelected = (file: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (PNG, JPG, WEBP, SVG).')
      return
    }

    // Format size
    const sizeInKb = (file.size / 1024).toFixed(1)
    const sizeStr = file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : `${sizeInKb} KB`

    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setImageUrl(dataUrl)
      setImageFileName(file.name)
      setImageFileSize(sizeStr)
    }
    reader.readAsDataURL(file)
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0])
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDraggingFile(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0])
    }
  }

  const handleRemoveImage = () => {
    setImageUrl('')
    setImageFileName('')
    setImageFileSize('')
    setImageCaption('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Save to Question Bank Service
  const persistQuestion = async (): Promise<QuestionBankItem> => {
    setFormError(null)

    // Taxonomy hierarchy is mandatory for every newly authored/edited question.
    // We validate the parent taxonomy and the visible Domain -> Chapter -> Lesson
    // path before any database write or staged taxonomy creation can occur.
    const activeTaxonomyId = String(selectedQuestionTaxonomyId || customTaxonomyId || '').trim()
    if (!activeTaxonomyId) {
      const message = 'Please select a Taxonomy before saving the question.'
      setFormError(message)
      throw new Error(message)
    }

    const trimmedDomainForValidation = domain.trim()
    const trimmedChapterForValidation = chapter.trim()
    const trimmedLessonForValidation = lesson.trim()

    if (!trimmedDomainForValidation) {
      const message = 'Please select or create a Domain for the selected Taxonomy.'
      setFormError(message)
      throw new Error(message)
    }

    if (!trimmedChapterForValidation) {
      const message = 'Please select or create a Chapter under the selected Domain.'
      setFormError(message)
      throw new Error(message)
    }

    if (!trimmedLessonForValidation) {
      const message = 'Please select or create a Lesson under the selected Chapter.'
      setFormError(message)
      throw new Error(message)
    }

    if (!prompt.trim()) {
      const message = 'Question Prompt / Stem is mandatory.'
      setFormError(message)
      throw new Error(message)
    }

    if (!targetExam.trim()) {
      const message = 'Target Exam is mandatory.'
      setFormError(message)
      throw new Error(message)
    }

    if (!collection.trim()) {
      const message = 'Collection is mandatory.'
      setFormError(message)
      throw new Error(message)
    }

    const estSec = Number(estimatedSeconds)
    if (!estimatedSeconds || isNaN(estSec) || estSec < 10) {
      const message = 'Time Estimate is mandatory and must be at least 10 seconds.'
      setFormError(message)
      throw new Error(message)
    }

    if (questionType === 'multiple_choice' || questionType === 'multi_select') {
      const filledChoices = choices.filter((c) => c.text.trim().length > 0)
      if (filledChoices.length < 2) {
        const message = 'Please provide at least 2 non-empty answer choices.'
        setFormError(message)
        throw new Error(message)
      }
      const correctCount = choices.filter((c) => c.isCorrect && c.text.trim().length > 0).length
      if (correctCount === 0) {
        const message = 'Please mark at least one valid choice as the correct answer key.'
        setFormError(message)
        throw new Error(message)
      }
      if (questionType === 'multiple_choice' && correctCount !== 1) {
        const message = 'Single-choice questions must have exactly one correct answer.'
        setFormError(message)
        throw new Error(message)
      }
    } else if (questionType === 'grid_in') {
      if (!numericAnswer.trim() || (gridAnswerKind === 'numeric' && parseNumericAnswer(numericAnswer) === null)) {
        const message = gridAnswerKind === 'text' ? 'Enter an accepted text or algebraic answer.' : 'Enter a valid finite numeric answer (for example 2.5 or 5/2).'
        setFormError(message)
        throw new Error(message)
      }
      if (gridAnswerKind === 'numeric' && numericAlternateAnswers.split(/[,\n]/).some(answer => answer.trim() && parseNumericAnswer(answer.trim()) === null)) {
        const message = 'Each alternative answer must be a valid number or fraction.'
        setFormError(message)
        throw new Error(message)
      }
      if (gridAnswerKind === 'numeric' && parseNumericTolerance(numericTolerance) === null) {
        const message = 'Tolerance must be a nonnegative number.'
        setFormError(message)
        throw new Error(message)
      }
    }

    const generateUUID = () => {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
      }
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
      })
    }

    const trimmedDomain = domain.trim()
    const trimmedChapter = chapter.trim()
    const trimmedLesson = lesson.trim()

    if (isCustomDomain && !draftTaxonomyNodes.some((node) => node.taxonomyId === (selectedQuestionTaxonomyId || customTaxonomyId) && node.type === 'domain' && node.domain.toLowerCase() === trimmedDomain.toLowerCase())) {
      const message = 'Click Save Domain before saving this question.'
      setFormError(message)
      throw new Error(message)
    }
    if (isCustomChapter && !draftTaxonomyNodes.some((node) => node.taxonomyId === (selectedQuestionTaxonomyId || customTaxonomyId) && node.type === 'chapter' && node.domain.toLowerCase() === trimmedDomain.toLowerCase() && node.chapter?.toLowerCase() === trimmedChapter.toLowerCase())) {
      const message = 'Click Save Chapter before saving this question.'
      setFormError(message)
      throw new Error(message)
    }
    if (isCustomLesson && !draftTaxonomyNodes.some((node) => node.taxonomyId === (selectedQuestionTaxonomyId || customTaxonomyId) && node.type === 'lesson' && node.domain.toLowerCase() === trimmedDomain.toLowerCase() && node.chapter?.toLowerCase() === trimmedChapter.toLowerCase() && node.lesson?.toLowerCase() === trimmedLesson.toLowerCase())) {
      const message = 'Click Save Lesson before saving this question.'
      setFormError(message)
      throw new Error(message)
    }

    const questionItem: QuestionBankItem = {
      id: questionId || generateUUID(),
      collection: collection.trim() || 'General Question Bank',
      domain: trimmedDomain,
      chapter: trimmedChapter,
      lesson: trimmedLesson,
      difficulty,
      questionType,
      calculatorAllowed,
      estimatedSeconds: Math.max(10, estSec),
      targetExam: targetExam.trim(),
      prompt: prompt.trim(),
      imageUrl,
      imageCaption,
      choices: questionType === 'grid_in' ? [] : choices.filter((c) => c.text.trim().length > 0),
      numericAnswer: questionType === 'grid_in' ? numericAnswer.trim() : undefined,
      gridAnswerKind: questionType === 'grid_in' ? gridAnswerKind : undefined,
      numericAlternateAnswers: questionType === 'grid_in' ? numericAlternateAnswers.split(gridAnswerKind === 'text' ? /\n/ : /[,\n]/).map(a => a.trim()).filter(Boolean) : undefined,
      numericTolerance: questionType === 'grid_in' ? numericTolerance : undefined,
      explanation: explanation.trim(),
      commonMisconception: commonMisconception.trim(),
      taxonomyNodeIds: Array.from(new Set(savedTaxonomyNodeIds.map(String).filter(Boolean))),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    let createdDraftNodeIds: string[] = []
    try {
      const draftResult = await persistDraftTaxonomy()
      questionItem.taxonomyNodeIds = draftResult.taxonomyNodeIds
      createdDraftNodeIds = draftResult.createdNodeIds

      // The generic taxonomy relationship model is authoritative.
    // When generic taxonomyNodeIds is present, do not create or mutate legacy
    // Domain/Chapter/Lesson taxonomy records as a side effect of saving a question.
    // Keep the legacy taxonomy staging path only for older callers that do not
    // provide generic taxonomy mappings.
    if (Array.isArray(questionItem.taxonomyNodeIds)) {
      await executeUnitOfWork((uow) => {
        uow.registerQuestion(questionItem)
      })
    } else {
      await executeUnitOfWork((uow) => {
        const curTax = questionBankService.getTaxonomy() || {}
        if (!curTax[trimmedDomain]) {
          uow.registerNewDomain(trimmedDomain)
        }

        const hasChap = curTax[trimmedDomain]?.chapters?.some(
          (c: any) => c.name.toLowerCase() === trimmedChapter.toLowerCase()
        )
        if (!hasChap) {
          uow.registerNewChapter(trimmedDomain, trimmedChapter)
        }

        const chapObj = curTax[trimmedDomain]?.chapters?.find(
          (c: any) => c.name.toLowerCase() === trimmedChapter.toLowerCase()
        )
        const hasLesson = chapObj?.lessons?.some(
          (l: string) => l.toLowerCase() === trimmedLesson.toLowerCase()
        )
        if (!hasLesson) {
          uow.registerNewLesson(trimmedDomain, trimmedChapter, trimmedLesson)
        }

        uow.registerQuestion(questionItem)
      })
    }

      // Sync to Supabase so the generic question_taxonomy_nodes relationships
      // are saved together with the question. Legacy taxonomy fields remain intact.
      await questionBankService.syncQuestionToDatabase(questionItem)

      return questionItem
    } catch (error) {
      // The draft taxonomy was not meant to exist independently of this question.
      // If saving fails, remove only nodes created by this edit attempt.
      await rollbackCreatedTaxonomyNodes(createdDraftNodeIds)
      throw error
    }
  }

  const saveBeforeNavigation = async () => {
    setIsSaving(true)
    setFormError(null)
    setSaveSuccessMessage(null)
    try {
      await persistQuestion()
      initialEditorSnapshotRef.current = editorSnapshot
      saveCompletedRef.current = false
      markClean()
      setHasUnsavedChanges(false)
      setSaveSuccessMessage('Changes saved successfully.')
    } catch (err: any) {
      console.error('Save before navigation failed:', err)
      throw new Error(err?.message || 'Could not save your changes before leaving this page.')
    } finally {
      setIsSaving(false)
    }
  }
  const markClean = useUnsavedChanges(hasUnsavedChanges, saveBeforeNavigation, discardUnsavedChanges)

  const focusFieldForSaveError = (message: string) => {
    const lower = message.toLowerCase()
    let target: HTMLElement | null = null
    if (lower.includes('prompt') || lower.includes('stem')) target = promptTextareaRef.current
    else if (lower.includes('collection')) target = document.querySelector('[aria-label="Question Collection / Test Pool"]') as HTMLElement | null
    else if (lower.includes('target exam')) target = document.querySelector('input[placeholder*="exam" i], select[aria-label*="exam" i]') as HTMLElement | null
    else if (lower.includes('time estimate') || lower.includes('seconds')) target = document.querySelector('input[type="number"]') as HTMLElement | null
    else if (lower.includes('choice') || lower.includes('answer key') || lower.includes('correct answer')) target = Object.values(choiceInputRefs.current).find((el) => el) || null
    else if (lower.includes('grid-in') || lower.includes('numeric answer')) target = document.querySelector('input[placeholder*="numeric" i], input[aria-label*="numeric" i]') as HTMLElement | null
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      window.setTimeout(() => target?.focus(), 250)
    } else {
      const banner = document.getElementById('question-save-feedback')
      banner?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (saveQuestionInFlightRef.current || isSaving) return
    saveQuestionInFlightRef.current = true
    saveCompletedRef.current = false
    setIsSaving(true)
    setFormError(null)
    setSaveSuccessMessage(null)

    try {
      const saved = await persistQuestion()

      // The database save succeeded: lock the editor's dirty tracking before
      // clearing the context guard and navigating away.
      saveCompletedRef.current = true
      setDraftTaxonomyNodes([])
      setDraftTaxonomyData({})
      initialQuestionTaxonomyIdRef.current = selectedQuestionTaxonomyId
      setCustomTaxonomyId(selectedQuestionTaxonomyId)
      setHasUnsavedChanges(false)
      markClean()
      setSaveSuccessMessage('Question saved.')

      // Refresh the Question Bank cache, but do not let a cache-refresh issue
      // turn a successful database save into a failed-save state.
      try {
        await questionBankService.fetchQuestionsFromDatabase()
      } catch (refreshError) {
        console.warn('Question saved, but refreshing the Question Bank cache failed:', refreshError)
      }

      window.setTimeout(() => {
        markClean()
        navigate('/admin/questions', { replace: true })
      }, 2200)
    } catch (err: any) {
      console.error('Save question error:', err)
      saveCompletedRef.current = false
      const message = err?.message || 'Could not save the question. Check your answers and try again.'
      setFormError(message)
      window.setTimeout(() => focusFieldForSaveError(message), 50)
    } finally {
      saveQuestionInFlightRef.current = false
      setIsSaving(false)
    }
  }

  // Helper to render math text or LaTeX safely (supports both $block$ and $inline$)
  const renderMathSafe = (text: string) => {
    if (!text) return null
    return <MathRenderer text={text} />
  }

  if (questionNotFound) {
    return (
      <AdminLayout
        title="Question Not Found"
        subtitle="The requested question could not be located in the question bank."
        showBackButton={true}
        backButtonPath="/admin/questions"
      >
        <div className="max-w-md mx-auto my-12 bg-white rounded-3xl p-8 border border-slate-200 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Question Unavailable</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            The question ID <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-700">{questionId}</code> was not found in the question repository. It may have been deleted or moved.
          </p>
          <div className="pt-2 flex items-center justify-center gap-2">
            <Link
              to="/admin/questions"
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition"
            >
              Return to Question Bank
            </Link>
            <Link
              to="/admin/questions/new"
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition"
            >
              Create New Question
            </Link>
          </div>
        </div>
      </AdminLayout>
    )
  }

  // Readiness is advisory; the authoritative save validations below remain unchanged.
  const hasValidAnswer = questionType === 'grid_in'
    ? Boolean(numericAnswer.trim()) && (gridAnswerKind === 'text' || (parseNumericAnswer(numericAnswer) !== null && parseNumericTolerance(numericTolerance) !== null && numericAlternateAnswers.split(/[,\n]/).every(answer => !answer.trim() || parseNumericAnswer(answer.trim()) !== null)))
    : choices.filter(choice => choice.text.trim()).length >= 2 &&
      choices.some(choice => choice.isCorrect && choice.text.trim()) &&
      (questionType !== 'multiple_choice' || choices.filter(choice => choice.isCorrect && choice.text.trim()).length === 1)
  const editorSteps: QuestionEditorStep[] = [
    { id: 'organization', title: 'Organization', description: 'Curriculum and collection', required: true, complete: Boolean(selectedQuestionTaxonomyId && domain.trim() && chapter.trim() && lesson.trim() && collection.trim()) },
    { id: 'format', title: 'Question settings', description: 'Type, level, and timing', required: true, complete: Boolean(targetExam.trim() && Number(estimatedSeconds) >= 10) },
    { id: 'prompt', title: 'Question', description: 'Problem and media', required: true, complete: Boolean(prompt.trim()) },
    { id: 'answers', title: 'Answer key', description: 'Correct response', required: true, complete: Boolean(hasValidAnswer) },
    { id: 'guidance', title: 'Explanation', description: 'Optional teaching notes', required: false, complete: Boolean(explanation.trim()) },
  ]
  const jumpToEditorSection = (id: QuestionEditorStepId) => {
    if (previewMode === 'preview') setPreviewMode('split')
    window.setTimeout(() => document.getElementById(`question-editor-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
  }

  const currentChapters = (domain && editorTaxonomyData[domain]?.chapters) || []
  const currentLessons = (chapter && currentChapters.find((c: any) => c.name === chapter)?.lessons) || []

  return (
    <AdminLayout
      title={isEditing ? 'Edit Question' : 'Create Question'}
      subtitle="Write and preview questions for your assessments"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/admin/questions"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" /> Question Bank
          </Link>
          <button
            type="button"
            disabled={isSaving || !isEditorHydrated}
            onClick={() => handleSave()}
            style={{ backgroundColor: '#2563eb', color: '#ffffff' }}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Save question'}
          </button>
        </div>
      }
    >
      {isSaving && (
        <div role="status" aria-live="polite" className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-[min(92vw,560px)] rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 shadow-2xl flex items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-blue-700 shrink-0" />
          <div><p className="text-sm font-bold text-blue-950">Saving question…</p></div>
        </div>
      )}
      {/* Toast Notifications */}
      {quickColSuccess && (
        <div role="status" className="fixed bottom-20 right-6 z-50 bg-emerald-700 text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-medium">
          <CheckCircle2 className="h-4 w-4" />
          <span>{quickColSuccess}</span>
        </div>
      )}
      {saveSuccessMessage && (
        <div role="status" aria-live="polite" className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-[min(92vw,680px)] rounded-2xl border border-emerald-300 bg-white px-5 py-4 shadow-2xl animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-emerald-100 p-2"><CheckCircle2 className="h-6 w-6 text-emerald-700" /></div>
            <div className="min-w-0"><p className="text-base font-bold text-emerald-950">Question saved successfully</p><p className="mt-1 text-sm leading-relaxed text-slate-700">{saveSuccessMessage}</p></div>
          </div>
        </div>
      )}
      <div className="mb-5 space-y-4">
        <QuestionEditorOverview
          editing={isEditing}
          questionType={questionType}
          collection={collection}
          isSaving={isSaving}
          dirty={hasUnsavedChanges}
          hydrated={isEditorHydrated}
          steps={editorSteps}
        />
        <QuestionEditorNavigation steps={editorSteps} onJump={jumpToEditorSection} />
        <QuestionEditorViewSwitch mode={previewMode} onChange={setPreviewMode} />
      </div>
      <div
        className={`grid gap-6 ${
          previewMode === 'split'
            ? 'grid-cols-1 lg:grid-cols-12'
            : previewMode === 'editor'
            ? 'grid-cols-1 max-w-4xl mx-auto'
            : 'grid-cols-1 max-w-3xl mx-auto'
        }`}
      >
        {/* Editor Form Column */}
        {previewMode !== 'preview' && (
          <form
            onSubmit={handleSave}
            onChangeCapture={() => {
              if (!saveCompletedRef.current) setHasUnsavedChanges(true)
            }}
            className={`question-editor-form space-y-8 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm min-w-0 ${
              previewMode === 'split' ? 'lg:col-span-7' : 'w-full'
            }`}
          >
            {/* Section 1: Legacy compatibility categorization */}
            <div id="question-editor-organization" className="space-y-4">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-blue-600" />
                  1. Curriculum & Collection
                </h3>
                <span className="text-[11px] font-semibold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
                  Required to save
                </span>
              </div>

              {draftTaxonomyNodes.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900" role="status">
                  <span className="font-semibold">Pending taxonomy changes:</span>{' '}
                  {draftTaxonomyNodes.map((node) =>
                    node.type === 'domain'
                      ? node.domain
                      : node.type === 'chapter'
                      ? `${node.domain} › ${node.chapter}`
                      : `${node.domain} › ${node.chapter} › ${node.lesson}`
                  ).join(' • ')}
                  <span className="block mt-1 text-[10px] text-amber-700">These disappear if you discard the question.</span>
                </div>
              )}

              <p className="text-xs leading-relaxed text-slate-500">
                {isEditing ? 'Your saved curriculum selections are shown below. Change them only if this question belongs somewhere else.' : 'Choose the curriculum, then the domain, chapter, and lesson for this question.'}
              </p>

              {/* Question Taxonomy assignment */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    Taxonomy <span className="text-rose-500 font-bold ml-0.5">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400">Curriculum</span>
                </div>
                <select
                  value={selectedQuestionTaxonomyId}
                  onChange={(e) => {
                    void handleQuestionTaxonomyChange(e.target.value)
                  }}
                  disabled={isSaving || genericTaxonomies.length === 0}
                  aria-label="Question Taxonomy"
                  className="mt-1 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">Select a taxonomy...</option>
                  {selectedQuestionTaxonomyId && !genericTaxonomies.some((item) => String(item.id) === selectedQuestionTaxonomyId) && (
                    <option value={selectedQuestionTaxonomyId}>Saved taxonomy</option>
                  )}
                  {genericTaxonomies.map((taxonomy) => (
                    <option key={taxonomy.id} value={taxonomy.id}>
                      {taxonomy.name}{taxonomy.code ? ` (${taxonomy.code})` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Choose the curriculum for this question. The available domains, chapters, and lessons depend on this selection.
                </p>
              </div>

              {/* Only show custom-taxonomy context after the user actually enters
                  a custom Domain / Chapter / Lesson flow or has staged a custom item. */}
              {(isCustomDomain || isCustomChapter || isCustomLesson || draftTaxonomyNodes.length > 0) && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3" aria-live="polite">
                  <div className="text-xs font-semibold text-indigo-950">Taxonomy for new Domain / Chapter / Lesson</div>
                  <div className="mt-1 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-slate-800">
                    {genericTaxonomies.find((taxonomy) => taxonomy.id === selectedQuestionTaxonomyId)?.name || 'Select a taxonomy above'}
                  </div>
                  <p className="mt-1 text-[10px] text-indigo-700">
                    New topics will be added when you save the question. Leave without saving to discard them.
                  </p>
                </div>
              )}

              {/* Target Collection assignment */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    Question Collection / Test Pool
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickColName('')
                      setQuickColDesc('')
                      setQuickColError(null)
                      setIsQuickCollectionModalOpen(true)
                    }}
                    className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 transition"
                  >
                    <Plus className="h-3 w-3" />
                    <span>New Collection</span>
                  </button>
                </div>
                <div className="mt-1">
                  <select
                    value={collection}
                    onChange={(e) => setCollection(e.target.value)}
                    aria-label="Question Collection / Test Pool"
                    className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="" disabled>
                      Select a question collection...
                    </option>
                    {Array.from(
                      new Set([
                        ...existingCollections,
                        'General Question Bank',
                        ...(collection.trim() ? [collection.trim()] : []),
                      ])
                    ).map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Choose the question bank collection where teachers will find this question.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Domain Selector with Custom option */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-700">
                      Domain (Unit)
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !isCustomDomain
                        setIsCustomDomain(next)
                        if (next) {
                          setIsCustomChapter(true)
                          setIsCustomLesson(true)
                        } else {
                          const domainKeys = Object.keys(editorTaxonomyData)
                          if (domainKeys.length > 0 && !domainKeys.includes(domain)) {
                            setDomain(domainKeys[0])
                          }
                        }
                      }}
                      className="text-[10px] font-semibold text-blue-600 hover:underline"
                    >
                      {isCustomDomain ? 'Select from list' : '+ Custom domain'}
                    </button>
                  </div>
                  {isCustomDomain ? (
                    <div>
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={domain}
                          onChange={(e) => setDomain(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleCreateCustomDomain()
                            }
                          }}
                          placeholder="Enter new domain name..."
                          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-500 focus:outline-hidden bg-white"
                        />
                        <button
                          type="button"
                          disabled={!domain.trim() || isCreatingDomain}
                          onClick={handleCreateCustomDomain}
                          title="Save this domain"
                          className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition disabled:opacity-50 whitespace-nowrap flex items-center gap-1 shadow-xs cursor-pointer"
                        >
                          {isCreatingDomain ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                          <span>Save Domain</span>
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Click &quot;Save Domain&quot; to stage this item. It is committed only when you save the question.
                      </p>
                    </div>
                  ) : (
                    <select
                      value={domain}
                      disabled={Object.keys(editorTaxonomyData).length === 0 && !domain}
                      onChange={(e) => {
                        const newDomain = e.target.value
                        setDomain(newDomain)
                        setIsCustomChapter(false)
                        setIsCustomLesson(false)
                        const dInfo = newDomain ? editorTaxonomyData[newDomain] : null
                        if (dInfo && dInfo.chapters && dInfo.chapters.length > 0) {
                          const firstChap = dInfo.chapters[0].name
                          setChapter(firstChap)
                          if (dInfo.chapters[0].lessons && dInfo.chapters[0].lessons.length > 0) {
                            const firstLesson = dInfo.chapters[0].lessons[0]
                            setLesson(typeof firstLesson === 'string' ? firstLesson : firstLesson.name)
                          } else {
                            setLesson('')
                          }
                        } else {
                          setChapter('')
                          setLesson('')
                        }

                        const nextChapter = dInfo?.chapters?.[0]?.name || ''
                        const firstLesson = dInfo?.chapters?.[0]?.lessons?.[0]
                        const nextLesson = firstLesson
                          ? (typeof firstLesson === 'string' ? firstLesson : firstLesson.name)
                          : ''
                        syncGenericAssignmentFromPath(newDomain, nextChapter, nextLesson)
                        setHasUnsavedChanges(true)
                      }}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-500 focus:outline-hidden bg-white disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      {Object.keys(editorTaxonomyData).length === 0 ? (
                        <>
                          <option value="">— No domains available —</option>
                          {isEditing && domain && <option value={domain}>{domain}</option>}
                        </>
                      ) : (
                        <>
                          <option value="">— Select Domain —</option>
                          {isEditing && domain && !editorTaxonomyData[domain] && <option value={domain}>{domain}</option>}
                          {Object.keys(editorTaxonomyData).map((d) => {
                            const dInfo = editorTaxonomyData[d]
                            const codeBadge = dInfo?.code ? `[${dInfo.code}] ` : ''
                            return (
                              <option key={d} value={d}>
                                {codeBadge}{d}
                              </option>
                            )
                          })}
                        </>
                      )}
                    </select>
                  )}
                  {customTaxonomyFeedback?.field === 'domain' && (
                    <p className="text-[11px] text-emerald-600 font-medium mt-1 flex items-center gap-1 animate-in fade-in">
                      <Check className="h-3.5 w-3.5" />
                      <span>{customTaxonomyFeedback.message}</span>
                    </p>
                  )}
                  {Object.keys(editorTaxonomyData).length === 0 && !isCustomDomain && (
                    <p className="text-[11px] text-amber-700 mt-1.5 flex items-center gap-1">
                      <span>No domains available.</span>
                      <Link to="/admin/taxonomy" className="font-semibold underline text-blue-600 hover:text-blue-800">
                        Create domains in Taxonomy
                      </Link>
                      <span>or click &quot;+ Custom domain&quot;.</span>
                    </p>
                  )}
                </div>

                {/* Chapter Selector with Custom option */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-700">
                      Chapter
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCustomChapter(!isCustomChapter)}
                      className="text-[10px] font-semibold text-blue-600 hover:underline"
                    >
                      {isCustomChapter ? 'Select from list' : '+ Custom chapter'}
                    </button>
                  </div>
                  {isCustomChapter ? (
                    <div>
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={chapter}
                          onChange={(e) => setChapter(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleCreateCustomChapter()
                            }
                          }}
                          placeholder="Enter new chapter name..."
                          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-500 focus:outline-hidden bg-white"
                        />
                        <button
                          type="button"
                          disabled={!chapter.trim() || !domain.trim() || isCreatingChapter}
                          onClick={handleCreateCustomChapter}
                          title="Save this chapter"
                          className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition disabled:opacity-50 whitespace-nowrap flex items-center gap-1 shadow-xs cursor-pointer"
                        >
                          {isCreatingChapter ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                          <span>Save Chapter</span>
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Click &quot;Save Chapter&quot; to stage this item. It is committed only when you save the question.
                      </p>
                    </div>
                  ) : (
                    <select
                      value={chapter}
                      disabled={!domain || (currentChapters.length === 0 && !chapter)}
                      onChange={(e) => {
                        const newChapter = e.target.value
                        setChapter(newChapter)
                        setIsCustomLesson(false)
                        const dInfo = domain ? editorTaxonomyData[domain] : null
                        const matched = dInfo?.chapters?.find((c: any) => c.name === newChapter)
                        if (matched && matched.lessons && matched.lessons.length > 0) {
                          const firstLesson = matched.lessons[0]
                          setLesson(typeof firstLesson === 'string' ? firstLesson : firstLesson.name)
                        } else {
                          setLesson('')
                        }

                        const firstLesson = matched?.lessons?.[0]
                        const nextLesson = firstLesson
                          ? (typeof firstLesson === 'string' ? firstLesson : firstLesson.name)
                          : ''
                        syncGenericAssignmentFromPath(domain, newChapter, nextLesson)
                        setHasUnsavedChanges(true)
                      }}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-500 focus:outline-hidden bg-white disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      {!domain ? (
                        <option value="">— Select Domain first —</option>
                      ) : currentChapters.length === 0 && !chapter ? (
                        <>
                          <option value="">— No chapters in this domain —</option>
                          {isEditing && chapter && <option value={chapter}>{chapter}</option>}
                        </>
                      ) : (
                        <>
                          <option value="">— Select Chapter —</option>
                          {isEditing && chapter && !currentChapters.some((item: any) => item.name === chapter) && <option value={chapter}>{chapter}</option>}
                          {currentChapters.map((c: any) => {
                            const cCodeBadge = c.code ? `[${c.code}] ` : ''
                            return (
                              <option key={c.name} value={c.name}>
                                {cCodeBadge}{c.name}
                              </option>
                            )
                          })}
                        </>
                      )}
                    </select>
                  )}
                  {customTaxonomyFeedback?.field === 'chapter' && (
                    <p className="text-[11px] text-emerald-600 font-medium mt-1 flex items-center gap-1 animate-in fade-in">
                      <Check className="h-3.5 w-3.5" />
                      <span>{customTaxonomyFeedback.message}</span>
                    </p>
                  )}
                  {domain && !isCustomDomain && currentChapters.length === 0 && !isCustomChapter && (
                    <p className="text-[11px] text-amber-700 mt-1.5 flex items-center gap-1">
                      <span>No chapters linked to this domain.</span>
                      <Link to="/admin/taxonomy" className="font-semibold underline text-blue-600 hover:text-blue-800">
                        Add chapters in Taxonomy
                      </Link>
                      <span>or click &quot;+ Custom chapter&quot;.</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Lesson Selector with Custom option */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    Lesson <span className="text-rose-500 font-bold ml-0.5">* Required</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsCustomLesson(!isCustomLesson)}
                    className="text-[10px] font-semibold text-blue-600 hover:underline"
                  >
                    {isCustomLesson ? 'Select from list' : '+ Custom lesson'}
                  </button>
                </div>
                {isCustomLesson ? (
                  <div>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="text"
                        value={lesson}
                        onChange={(e) => setLesson(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleCreateCustomLesson()
                          }
                        }}
                        placeholder="Enter new lesson name..."
                        className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-500 focus:outline-hidden bg-white"
                      />
                      <button
                        type="button"
                        disabled={!lesson.trim() || !chapter.trim() || !domain.trim() || isCreatingLesson}
                        onClick={handleCreateCustomLesson}
                        title="Save this lesson"
                        className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition disabled:opacity-50 whitespace-nowrap flex items-center gap-1 shadow-xs cursor-pointer"
                      >
                        {isCreatingLesson ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                        <span>Save Lesson</span>
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Click &quot;Save Lesson&quot; to stage this item. It is committed only when you save the question.
                    </p>
                  </div>
                ) : (
                  <select
                    value={lesson}
                    disabled={!chapter || (currentLessons.length === 0 && !lesson)}
                    onChange={(e) => {
                      const nextLesson = e.target.value
                      setLesson(nextLesson)
                      syncGenericAssignmentFromPath(domain, chapter, nextLesson)
                      setHasUnsavedChanges(true)
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-500 focus:outline-hidden bg-white disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    {!chapter ? (
                      <>
                        <option value="">— Select Chapter first —</option>
                        {isEditing && lesson && <option value={lesson}>{lesson}</option>}
                      </>
                    ) : currentLessons.length === 0 && !lesson ? (
                      <>
                        <option value="">— No lessons in this chapter —</option>
                        {isEditing && lesson && <option value={lesson}>{lesson}</option>}
                      </>
                    ) : (
                      <>
                        <option value="">— Select Lesson —</option>
                        {isEditing && lesson && !currentLessons.some((item: any) => (typeof item === 'string' ? item : item.name) === lesson) && <option value={lesson}>{lesson}</option>}
                        {currentLessons.map((l: any) => {
                          const lessonName = typeof l === 'string' ? l : l.name
                          const lessonCode = typeof l === 'string' ? '' : l.code
                          return (
                            <option key={lessonName} value={lessonName}>
                              {lessonCode ? `[${lessonCode}] ` : ''}{lessonName}
                            </option>
                          )
                        })}
                      </>
                    )}
                  </select>
                )}
                {customTaxonomyFeedback?.field === 'lesson' && (
                  <p className="text-[11px] text-emerald-600 font-medium mt-1 flex items-center gap-1 animate-in fade-in">
                    <Check className="h-3.5 w-3.5" />
                    <span>{customTaxonomyFeedback.message}</span>
                  </p>
                )}
                {chapter && !isCustomChapter && currentLessons.length === 0 && !isCustomLesson && (
                  <p className="text-[11px] text-amber-700 mt-1.5 flex items-center gap-1">
                    <span>No lessons linked to this chapter.</span>
                    <Link to="/admin/taxonomy" className="font-semibold underline text-blue-600 hover:text-blue-800">
                      Add lessons in Taxonomy
                    </Link>
                    <span>or click &quot;+ Custom lesson&quot;.</span>
                  </p>
                )}
              </div>
            </div>

            {/* Section 2: Format & Difficulty Parameters */}
            <div id="question-editor-format" className="space-y-4 pt-2">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-indigo-600" />
                  2. Question Settings
                </h3>
              </div>
              <p className="text-xs text-slate-500">Set how students will answer this question and how much time they should have.</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Question Format <span className="text-rose-500 ml-0.5">*</span>
                  </label>
                  <select
                    value={questionType}
                    onChange={(e) => setQuestionType(e.target.value as any)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-500 focus:outline-hidden bg-white"
                  >
                    <option value="multiple_choice">Single Choice (MCQ)</option>
                    <option value="multi_select">Multi-Select (Choose All)</option>
                    <option value="grid_in">Free Response / Grid-In</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Difficulty <span className="text-rose-500 ml-0.5">*</span>
                  </label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as any)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-500 focus:outline-hidden bg-white"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Target Exam <span className="text-rose-500 ml-0.5">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={targetExam}
                    onChange={(e) => setTargetExam(e.target.value)}
                    placeholder="e.g. EST 1 / SAT Math"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Calculator Usage</label>
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCalculatorAllowed(false)}
                      className={`flex-1 py-1.5 rounded-xl border text-xs font-medium transition ${
                        !calculatorAllowed
                          ? 'bg-rose-50 border-rose-200 text-rose-700 font-semibold'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      No Calculator
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalculatorAllowed(true)}
                      className={`flex-1 py-1.5 rounded-xl border text-xs font-medium transition ${
                        calculatorAllowed
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-semibold'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Permitted
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Time Estimate (sec) <span className="text-rose-500 font-bold ml-0.5">* Required</span>
                  </label>
                  <div className="relative mt-1">
                    <input
                      type="number"
                      required
                      min="10"
                      max="600"
                      step="5"
                      value={estimatedSeconds}
                      onChange={(e) => setEstimatedSeconds(Math.max(10, Number(e.target.value) || 10))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-500 focus:outline-hidden pl-8"
                    />
                    <Clock className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Estimated time a student needs to answer this question (minimum 10 seconds).
                  </p>
                </div>
              </div>
            </div>

            {/* Section 3: Problem Stem & Math Notation */}
            <div id="question-editor-prompt" className="space-y-4 pt-2">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <FileCode className="h-4 w-4 text-emerald-600" />
                  3. Question & Math
                </h3>
                <span className="text-[11px] text-slate-400">Math symbols supported</span>
              </div>

              <p className="text-xs text-slate-500">Write the question as students should see it. Use the math toolbar for equations and symbols.</p>

              {/* Math Quick Inserter Toolbar */}
              <MathSymbolInserter
                onInsert={handleInsertMathSnippet}
                activeTargetLabel={activeTargetLabel}
              />

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Problem Stem Text <span className="text-rose-500 ml-0.5">*</span>
                </label>
                <textarea
                  ref={promptTextareaRef}
                  onFocus={() => {
                    activeInputRef.current = promptTextareaRef.current
                    setActiveTargetName('prompt')
                  }}
                  rows={4}
                  required
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Enter the mathematical problem stem. Use $...$ for inline equations or $$...$$ for block math."
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-500 focus:outline-hidden font-mono"
                />
              </div>

              {/* File-Based Image Uploading */}
              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <ImageIcon className="h-4 w-4 text-blue-600" />
                    <span>Attach Diagram / Geometric Stimulus (File Upload)</span>
                  </div>
                  {imageUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="text-xs text-rose-600 hover:text-rose-700 font-medium inline-flex items-center gap-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Remove Image</span>
                    </button>
                  )}
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                {!imageUrl ? (
                  /* Drag and Drop Zone */
                  <div
                    onDragOver={(e) => {
                      e.preventDefault()
                      setIsDraggingFile(true)
                    }}
                    onDragLeave={() => setIsDraggingFile(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition ${
                      isDraggingFile
                        ? 'border-blue-500 bg-blue-50/50'
                        : 'border-slate-300 hover:border-blue-400 bg-white hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                        <Upload className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-700">
                          Click to browse image or drag and drop here
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Supports PNG, JPG, JPEG, WEBP, or SVG files
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Uploaded Image Preview & Caption */
                  <div className="space-y-3 bg-white p-3.5 rounded-xl border border-slate-200">
                    <div className="flex items-start gap-4">
                      <div className="w-24 h-20 rounded-lg border border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center shrink-0">
                        <img
                          src={imageUrl}
                          alt="Uploaded stimulus preview"
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-xs font-semibold text-slate-800 truncate">
                          {imageFileName || 'Uploaded Diagram'}
                        </p>
                        {imageFileSize && (
                          <p className="text-[11px] text-slate-400">File size: {imageFileSize}</p>
                        )}
                        <div className="pt-1 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                          >
                            Replace Image
                          </button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600">
                        Image Caption / Figure Label (Optional)
                      </label>
                      <input
                        type="text"
                        value={imageCaption}
                        onChange={(e) => setImageCaption(e.target.value)}
                        placeholder="e.g. Figure 1: Graph of y = f(x) in the standard coordinate plane"
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-hidden"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 4: Answer Choices or Free-Response Key */}
            <div id="question-editor-answers" className="space-y-4 pt-2">
              <p className="text-xs leading-relaxed text-slate-500">
                {questionType === 'grid_in' ? 'Choose Numeric for numbers and fractions, or Text / algebraic expression for answers such as 3x.' : questionType === 'multi_select' ? 'Add at least two answer options, then mark every correct option.' : 'Add at least two answer options, then mark the single correct answer.'}
              </p>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-600" />
                  4. Answer Key
                </h3>
                {questionType !== 'grid_in' && (
                  <button
                    type="button"
                    onClick={handleAddChoice}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Option</span>
                  </button>
                )}
              </div>

              {questionType === 'grid_in' ? (
                /* Free Response / Grid-in Section */
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="space-y-1">
                    <label htmlFor="grid-answer-format" className="block text-xs font-semibold text-slate-700">Answer format</label>
                    <select id="grid-answer-format" value={gridAnswerKind}
                      onChange={(e) => setGridAnswerKind(e.target.value as 'numeric' | 'text')}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
                      <option value="numeric">Numeric — number or fraction</option>
                      <option value="text">Text / algebraic expression — e.g. 3x</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        {gridAnswerKind === 'text' ? 'Accepted Text / Algebraic Answer' : 'Exact Numeric Answer Key'}
                      </label>
                      <input
                        type="text"
                        value={numericAnswer}
                        onChange={(e) => setNumericAnswer(e.target.value)}
                        placeholder={gridAnswerKind === 'text' ? 'e.g. 3x' : 'e.g. 2 or 5/2 or 2.5'}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-emerald-700 focus:border-blue-500 focus:outline-hidden"
                      />
                    </div>
                    {gridAnswerKind === 'numeric' && <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        Tolerance Window (±)
                      </label>
                      <input
                        type="text"
                        value={numericTolerance}
                        onChange={(e) => setNumericTolerance(e.target.value)}
                        placeholder="0 for exact matching"
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-blue-500 focus:outline-hidden"
                      />
                    </div>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Other accepted answers (optional)</label>
                    <textarea
                      value={numericAlternateAnswers}
                      onChange={(e) => setNumericAlternateAnswers(e.target.value)}
                      rows={3}
                      placeholder={gridAnswerKind === 'text' ? 'One accepted expression per line, e.g. 3 X' : 'One number per line, e.g. 3\n-3'}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-blue-500 focus:outline-hidden"
                    />
                    <p className="mt-1 text-xs text-slate-500">{gridAnswerKind === 'text' ? 'Add alternative accepted spellings or forms, one per line. Expression comparison follows your installed server grader.' : 'Use this only when more than one distinct numeric answer is correct. Equivalent values such as 0.5 and 1/2 already represent the same answer.'}</p>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {gridAnswerKind === 'text' ? 'Students will type a short text or algebraic response.' : 'Students will enter a numeric value; fractions and decimals are normalized automatically.'}
                  </p>
                </div>
              ) : (
                /* Multiple Choice & Multi-Select Options */
                <div className="space-y-3">
                  {choices.map((c, idx) => {
                    const letter = String.fromCharCode(65 + idx)
                    return (
                      <div
                        key={c.id}
                        className={`p-3 rounded-2xl border transition ${
                          c.isCorrect
                            ? 'border-emerald-300 bg-emerald-50/40 ring-1 ring-emerald-200'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleSetCorrectChoice(c.id)}
                            className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 transition ${
                              c.isCorrect
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                            }`}
                            title={c.isCorrect ? 'Correct key marked' : 'Click to set as correct answer'}
                          >
                            {c.isCorrect ? <Check className="h-4 w-4" /> : letter}
                          </button>

                          <div className="flex-1 space-y-1.5">
                            <input
                              ref={(el) => {
                                choiceInputRefs.current[c.id] = el
                              }}
                              onFocus={() => {
                                activeInputRef.current = choiceInputRefs.current[c.id]
                                setActiveTargetName(`choice-${c.id}`)
                              }}
                              type="text"
                              value={c.text}
                              onChange={(e) => handleUpdateChoiceText(c.id, e.target.value)}
                              placeholder={`Option ${letter} (e.g. k = 2 or $x = \\frac{1}{2}$)`}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-hidden font-mono"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveChoice(c.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 transition"
                            title="Remove choice"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Optional Distractor Rationale */}
                        <div className="mt-2 pl-10">
                          <input
                            type="text"
                            value={c.rationale || ''}
                            onChange={(e) => handleUpdateChoiceRationale(c.id, e.target.value)}
                            placeholder={`Rationale / Distractor explanation for Option ${letter} (optional)`}
                            className="w-full text-[11px] text-slate-500 placeholder:text-slate-300 border-none bg-transparent focus:outline-hidden"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Section 5: Solution Derivation & Misconceptions */}
            <div id="question-editor-guidance" className="space-y-4 pt-2">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  5. Explanation & Teaching Notes
                </h3>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    Complete Step-by-Step Solution (LaTeX supported)
                  </label>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (explanationTextareaRef.current) {
                        explanationTextareaRef.current.focus()
                        activeInputRef.current = explanationTextareaRef.current
                        setActiveTargetName('explanation')
                      }
                    }}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                  >
                    Target with Math Inserter
                  </button>
                </div>
                <textarea
                  ref={explanationTextareaRef}
                  onFocus={() => {
                    activeInputRef.current = explanationTextareaRef.current
                    setActiveTargetName('explanation')
                  }}
                  rows={4}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Explain why the correct answer is true, step-by-step..."
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-500 focus:outline-hidden font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Common Trap / Student Misconception Analysis (LaTeX supported)
                </label>
                <textarea
                  ref={misconceptionTextareaRef}
                  onFocus={() => {
                    activeInputRef.current = misconceptionTextareaRef.current
                    setActiveTargetName('misconception')
                  }}
                  rows={2}
                  value={commonMisconception}
                  onChange={(e) => setCommonMisconception(e.target.value)}
                  placeholder="Explain why students commonly pick the wrong distractors (LaTeX formulas $...$ supported)..."
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-500 focus:outline-hidden font-mono"
                />
              </div>
            </div>

            {/* Form Validation Error Banner */}
            {formError && (
              <div id="question-save-feedback" role="alert" aria-live="assertive" className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 shadow-sm">
                <div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" /><div><p className="font-bold">Please review this question</p><p className="mt-1 leading-relaxed">{formError}</p><p className="mt-2 text-xs text-rose-800">Your work is still here. Make the correction and save again.</p></div></div>
              </div>
            )}

            {/* Submit Bar */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {questionType === 'grid_in'
                  ? `Grid-in Key: ${numericAnswer || 'None set'}`
                  : `${choices.filter((c) => c.isCorrect).length} correct key(s) designated`}
              </span>
              <div className="flex items-center gap-2">
                {isEditing && (
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-semibold hover:bg-rose-100 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete</span>
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSaving}
                  style={{ backgroundColor: '#2563eb', color: '#ffffff' }}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition shadow-xs"
                >
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  <span>{isSaving ? 'Saving…' : isEditing ? 'Update Question' : 'Save Question to Bank'}</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Live Interactive Student Preview Panel */}
        {(previewMode === 'split' || previewMode === 'preview') && (
          <div
            className={`space-y-4 min-w-0 ${previewMode === 'split' ? 'lg:col-span-5' : 'w-full'}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Student preview · local only
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPreviewSelectedChoice(null)
                    setPreviewMultiSelected([])
                    setPreviewInputAnswer('')
                  }}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Reset answer
                </button>
                <button
                  type="button"
                  aria-pressed={showExplanationInPreview}
                  onClick={() => setShowExplanationInPreview(!showExplanationInPreview)}
                  className="text-xs font-semibold text-blue-700 hover:text-blue-900"
                >
                  {showExplanationInPreview ? 'Hide answer key' : 'Reveal answer key'}
                </button>
              </div>
            </div>

            {/* Live Rendered Card */}
            <div className="bg-white rounded-3xl border-2 border-blue-200/70 p-6 shadow-md space-y-5">
              {/* Question Metadata Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg">
                    Question 1
                  </span>
                  <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-md">
                    {domain}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full ${
                      difficulty === 'easy'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : difficulty === 'medium'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {difficulty}
                  </span>

                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                      calculatorAllowed
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    <Calculator className="h-3 w-3" />
                    <span>{calculatorAllowed ? 'Calc Allowed' : 'No Calc'}</span>
                  </span>
                </div>
              </div>

              {/* Legacy compatibility categorization breadcrumb */}
              <div className="text-[11px] text-slate-500 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-slate-700">{domain}</span>
                <span className="text-slate-300">›</span>
                <span className="font-medium text-slate-600">{chapter}</span>
                <span className="text-slate-300">›</span>
                <span className="font-medium text-blue-600">{lesson}</span>
              </div>

              {/* Collection affiliation badge */}
              {collection && (
                <div className="text-[10px] font-medium text-slate-500 flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                    Collection: {collection}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700">
                    {targetExam}
                  </span>
                </div>
              )}

              {/* Stimulus / Image if uploaded - formatted bigger and fitting with question size */}
              {imageUrl && (
                <div className="w-full rounded-2xl border border-slate-200/90 bg-slate-50/70 p-3 sm:p-4 text-center space-y-2 shadow-2xs overflow-hidden">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-medium pb-2 border-b border-slate-200/70">
                    <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                      <ImageIcon className="h-3.5 w-3.5 text-blue-600" />
                      Stimulus / Problem Diagram
                    </span>
                    <span className="text-[11px] text-slate-400">Fitting Question Size</span>
                  </div>
                  <div className="w-full bg-white rounded-xl border border-slate-200/80 p-2.5 flex items-center justify-center overflow-hidden">
                    <img
                      src={imageUrl}
                      alt={imageCaption || 'Problem diagram'}
                      className="w-full max-h-[460px] sm:max-h-[500px] mx-auto object-contain rounded-lg transition-transform duration-200 hover:scale-[1.01]"
                    />
                  </div>
                  {imageCaption && (
                    <p className="text-xs text-slate-600 italic font-medium pt-1 flex items-center justify-center gap-1">
                      <span>Figure: {imageCaption}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Problem Stem */}
              <div className="text-slate-800 text-sm leading-relaxed whitespace-pre-line">
                {prompt ? (
                  renderMathSafe(prompt)
                ) : (
                  <span className="text-slate-300 italic">Enter question prompt above...</span>
                )}
              </div>

              {/* Interactive Student Answer Section */}
              <div className="pt-2 space-y-2">
                <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                  {questionType === 'grid_in'
                    ? 'Student Free Response:'
                    : questionType === 'multi_select'
                    ? 'Student Options (Select all that apply):'
                    : 'Student Options (Click to test):'}
                </span>

                {questionType === 'grid_in' ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={previewInputAnswer}
                      onChange={(e) => setPreviewInputAnswer(e.target.value)}
                      placeholder={gridAnswerKind === 'text' ? 'Enter an expression, e.g. 3x' : 'Enter a number or fraction...'}
                      className="w-full rounded-xl border-2 border-blue-200 p-3 text-sm font-semibold text-slate-800 focus:outline-hidden focus:border-blue-500"
                    />
                    {showExplanationInPreview && (
                      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span>Accepted Value: {numericAnswer || '2'}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {choices.map((c, i) => {
                      const letter = String.fromCharCode(65 + i)
                      const isSelected =
                        questionType === 'multiple_choice'
                          ? previewSelectedChoice === c.id
                          : previewMultiSelected.includes(c.id)

                      const handleChoiceClick = () => {
                        if (questionType === 'multiple_choice') {
                          setPreviewSelectedChoice(c.id)
                        } else {
                          if (previewMultiSelected.includes(c.id)) {
                            setPreviewMultiSelected(previewMultiSelected.filter((id) => id !== c.id))
                          } else {
                            setPreviewMultiSelected([...previewMultiSelected, c.id])
                          }
                        }
                      }

                      return (
                        <div
                          key={c.id}
                          onClick={handleChoiceClick}
                          className={`flex items-center gap-3 p-3 rounded-2xl border text-xs cursor-pointer transition select-none ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50/70 font-semibold ring-2 ring-blue-200'
                              : 'border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <span
                            className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                              isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {letter}
                          </span>

                          <span className="flex-1 text-slate-800">
                            {c.text ? (
                              renderMathSafe(c.text)
                            ) : (
                              <span className="text-slate-300 italic">Option {letter}...</span>
                            )}
                          </span>

                          {showExplanationInPreview && c.isCorrect && (
                            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                              Correct Key
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Live Explanation & Misconception Breakdown */}
              {showExplanationInPreview && (
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  {explanation && (
                    <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-xs space-y-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span>Solution & Mathematical Derivation:</span>
                      </div>
                      <div className="text-emerald-900/90 text-xs leading-relaxed pl-5 whitespace-pre-line">
                        {renderMathSafe(explanation)}
                      </div>
                    </div>
                  )}

                  {commonMisconception && (
                    <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-amber-900">
                        <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                        <span>Common Student Trap / Misconception:</span>
                      </div>
                      <div className="text-amber-900/90 text-xs leading-relaxed pl-5 whitespace-pre-line">
                        {renderMathSafe(commonMisconception)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Quick Create Collection Modal */}
      {isQuickCollectionModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsQuickCollectionModalOpen(false)}
        >
          <div
            className="relative max-w-md w-full bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <FolderPlus className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Add Question Collection</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsQuickCollectionModalOpen(false)}
                disabled={isSavingQuickCollection}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {quickColError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{quickColError}</span>
              </div>
            )}

            <form onSubmit={handleQuickCreateCollection} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Collection Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={quickColName}
                  onChange={(e) => setQuickColName(e.target.value)}
                  placeholder="e.g. Geometry Circles Test Pool"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  value={quickColDesc}
                  onChange={(e) => setQuickColDesc(e.target.value)}
                  placeholder="Notes about curriculum coverage..."
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsQuickCollectionModalOpen(false)}
                  disabled={isSavingQuickCollection}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingQuickCollection || !quickColName.trim()}
                  style={{ backgroundColor: '#4f46e5', color: '#ffffff' }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 shadow-xs"
                >
                  {isSavingQuickCollection && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {isSavingQuickCollection ? 'Creating & selecting…' : 'Create & Select'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Delete Question Confirmation Modal (Edit Mode) */}
      {showDeleteModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowDeleteModal(false)}
        >
          <div
            className="relative max-w-md w-full bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Question</h3>
                <p className="text-xs text-slate-500">
                  Are you sure you want to permanently delete this question?
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
              <p className="font-semibold text-slate-800">{domain} › {chapter}</p>
              <p className="text-slate-500 line-clamp-2">{prompt}</p>
            </div>

            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <span>
                This will delete the question and any associated solutions from the question bank. This action cannot be undone.
              </span>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  if (!questionId || isDeleting) return
                  setIsDeleting(true)
                  setFormError(null)
                  setSaveSuccessMessage(null)
                  try {
                    await questionBankService.deleteQuestion(questionId)
                    setSaveSuccessMessage('Question deleted successfully.')
                    setShowDeleteModal(false)
                    setTimeout(() => navigate('/admin/questions'), 350)
                  } catch (err: any) {
                    console.error('Delete question error:', err)
                    setFormError(err?.message || 'Failed to delete question. Please try again.')
                  } finally {
                    setIsDeleting(false)
                  }
                }}
                style={{ backgroundColor: '#e11d48', color: '#ffffff' }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition shadow-xs disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                <span>{isDeleting ? 'Deleting...' : 'Delete Question'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

export default CreateQuestionPage