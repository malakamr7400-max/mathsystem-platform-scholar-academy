import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import {
  FolderTree,
  Plus,
  BookOpen,
  Bookmark,
  Layers,
  HelpCircle,
  Edit2,
  Trash2,
  ExternalLink,
  Search,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  ArrowLeft,
  AlertCircle,
  X,
  RotateCcw,
  Database,
  RefreshCw,
  Info,
} from 'lucide-react'
import {
  questionBankService,
  type TaxonomyRegistry,
  type QuestionBankItem,
  type GenericTaxonomyNode,
} from '../lib/questionBankService'
import { useUnsavedChanges } from '../contexts/UnsavedChangesContext'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { TaxonomyHero, TaxonomyWorkspaceTabs, TaxonomySectionHeading } from '../components/taxonomy/TaxonomyWorkspaceUI'

type ActiveTab = 'overview' | 'manage' | 'matrix' | 'generic'

interface TaxonomyItemToDelete {
  type: 'domain' | 'chapter' | 'lesson' | 'all'
  domainName: string
  chapterName?: string
  lessonName?: string
  unitLabel?: string
  code?: string
  chaptersCount?: number
  lessonsCount?: number
  linkedQuestionsCount: number
}

interface StandardDomainCode {
  code: string
  label: string
  suggestedName: string
  suggestedUnit: string
}

const STANDARD_DOMAIN_CODES: StandardDomainCode[] = [
  {
    code: 'ALG',
    label: 'ALG — Algebra & Functions',
    suggestedName: 'Algebra & Functions',
    suggestedUnit: 'Unit 1: Foundations of Algebraic Modeling',
  },
  {
    code: 'GEO',
    label: 'GEO — Geometry & Trigonometry',
    suggestedName: 'Geometry & Trigonometry',
    suggestedUnit: 'Unit 2: Geometric & Spatial Reasoning',
  },
  {
    code: 'STAT',
    label: 'STAT — Statistics & Probability',
    suggestedName: 'Statistics & Probability',
    suggestedUnit: 'Unit 3: Data Analysis & Statistical Inference',
  },
  {
    code: 'ADV',
    label: 'ADV — Advanced Math & Pre-Calculus',
    suggestedName: 'Advanced Math & Pre-Calculus',
    suggestedUnit: 'Unit 4: Advanced Functions & Transformations',
  },
  {
    code: 'CALC',
    label: 'CALC — Calculus & Mathematical Analysis',
    suggestedName: 'Calculus & Mathematical Analysis',
    suggestedUnit: 'Unit 5: Differential & Integral Calculus',
  },
  {
    code: 'NUM',
    label: 'NUM — Numbers & Operations',
    suggestedName: 'Numbers & Number Systems',
    suggestedUnit: 'Unit 0: Numerical Fluency & Operations',
  },
  {
    code: 'PSDA',
    label: 'PSDA — Problem Solving & Data Analysis',
    suggestedName: 'Problem Solving & Data Analysis',
    suggestedUnit: 'Unit: Quantitative Reasoning & Modeling',
  },
  {
    code: 'FND',
    label: 'FND — Foundations of Mathematics',
    suggestedName: 'Foundations of Mathematics',
    suggestedUnit: 'Unit: Fundamental Mathematical Concepts',
  },
  {
    code: 'UNIT-1',
    label: 'UNIT-1 — Unit 1 Curriculum Module',
    suggestedName: 'Unit 1 Core Curriculum',
    suggestedUnit: 'Unit 1',
  },
  {
    code: 'UNIT-2',
    label: 'UNIT-2 — Unit 2 Curriculum Module',
    suggestedName: 'Unit 2 Core Curriculum',
    suggestedUnit: 'Unit 2',
  },
  {
    code: 'UNIT-3',
    label: 'UNIT-3 — Unit 3 Curriculum Module',
    suggestedName: 'Unit 3 Core Curriculum',
    suggestedUnit: 'Unit 3',
  },
  {
    code: 'UNIT-4',
    label: 'UNIT-4 — Unit 4 Curriculum Module',
    suggestedName: 'Unit 4 Core Curriculum',
    suggestedUnit: 'Unit 4',
  },
  {
    code: 'UNIT-5',
    label: 'UNIT-5 — Unit 5 Curriculum Module',
    suggestedName: 'Unit 5 Core Curriculum',
    suggestedUnit: 'Unit 5',
  },
  {
    code: 'UNIT-6',
    label: 'UNIT-6 — Unit 6 Curriculum Module',
    suggestedName: 'Unit 6 Core Curriculum',
    suggestedUnit: 'Unit 6',
  },
  {
    code: 'UNIT-7',
    label: 'UNIT-7 — Unit 7 Curriculum Module',
    suggestedName: 'Unit 7 Core Curriculum',
    suggestedUnit: 'Unit 7',
  },
  {
    code: 'UNIT-8',
    label: 'UNIT-8 — Unit 8 Curriculum Module',
    suggestedName: 'Unit 8 Core Curriculum',
    suggestedUnit: 'Unit 8',
  },
]

export const TaxonomyPage: React.FC = () => {
  const navigate = useNavigate()
  const [taxonomy, setTaxonomy] = useState<TaxonomyRegistry>({})
  const [questions, setQuestions] = useState<QuestionBankItem[]>([])
  const [activeTab, setActiveTab] = useState<ActiveTab>('generic')
  const [searchQuery, setSearchQuery] = useState('')
  const [genericTaxonomies, setGenericTaxonomies] = useState<Array<{ id: string; name: string; code?: string; description?: string }>>([])
  const [selectedTaxonomyId, setSelectedTaxonomyId] = useState('')
  const [genericNodes, setGenericNodes] = useState<GenericTaxonomyNode[]>([])
  const [genericBrowseParentId, setGenericBrowseParentId] = useState<string | null>(null)
  const [genericNodeSearch, setGenericNodeSearch] = useState('')
  const [genericParentId, setGenericParentId] = useState<string | null>(null)
  const [isGenericNodeFormOpen, setIsGenericNodeFormOpen] = useState(false)
  const [genericNodeName, setGenericNodeName] = useState('')
  const [genericNodeCode, setGenericNodeCode] = useState('')
  const [genericTaxonomyName, setGenericTaxonomyName] = useState('')
  const [isTaxonomyFormOpen, setIsTaxonomyFormOpen] = useState(false)
  const [genericTaxonomyCode, setGenericTaxonomyCode] = useState('')
  const [genericTaxonomyDescription, setGenericTaxonomyDescription] = useState('')
  const [isCreatingGenericTaxonomy, setIsCreatingGenericTaxonomy] = useState(false)
  const [isCreatingGenericNode, setIsCreatingGenericNode] = useState(false)
  const [genericEditTarget, setGenericEditTarget] = useState<{ type: 'taxonomy'; id: string } | { type: 'node'; id: string } | null>(null)
  const [genericEditName, setGenericEditName] = useState('')
  const [genericEditCode, setGenericEditCode] = useState('')
  const [genericEditDescription, setGenericEditDescription] = useState('')
  const [isSavingGenericEdit, setIsSavingGenericEdit] = useState(false)

  // Selected item in the hierarchy
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null)
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null)
  const [selectedLesson, setSelectedLesson] = useState<string | null>(null)

  // Deletion confirmation modal state
  const [deleteTarget, setDeleteTarget] = useState<TaxonomyItemToDelete | null>(null)
  const [deleteLinkedQuestions, setDeleteLinkedQuestions] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Modal / Form state for Add/Edit
  const [modalMode, setModalMode] = useState<'addDomain' | 'editDomain' | 'addChapter' | 'editChapter' | 'addLesson' | 'editLesson' | null>(null)
  const [hasTaxonomyDraftChanges, setHasTaxonomyDraftChanges] = useState(false)
  const [formDomainName, setFormDomainName] = useState('')
  const [formDomainUnitLabel, setFormDomainUnitLabel] = useState('')
  const [formDomainCode, setFormDomainCode] = useState('')
  const [isCustomDomainCode, setIsCustomDomainCode] = useState(false)
  const [formChapterName, setFormChapterName] = useState('')
  const [formChapterCode, setFormChapterCode] = useState('')
  const [isCustomChapterCode, setIsCustomChapterCode] = useState(false)
  const [formLessonName, setFormLessonName] = useState('')
  const [targetDomain, setTargetDomain] = useState('')
  const [targetChapter, setTargetChapter] = useState('')
  const [originalParentDomain, setOriginalParentDomain] = useState('')
  const [originalParentChapter, setOriginalParentChapter] = useState('')
  const [originalName, setOriginalName] = useState('')
  const [isLoadingTaxonomy, setIsLoadingTaxonomy] = useState(true)
  const [isSavingTaxonomy, setIsSavingTaxonomy] = useState(false)
  const taxonomySaveInFlightRef = useRef(false)
  const [isSyncingToSupabase, setIsSyncingToSupabase] = useState(false)

  // Load from service on mount
  const refreshData = async () => {
    try {
      const [freshTax, activeGenericTaxonomies] = await Promise.all([
        questionBankService.fetchTaxonomy(),
        questionBankService.fetchGenericTaxonomies(),
      ])
      setTaxonomy(freshTax)
      setGenericTaxonomies(activeGenericTaxonomies)
      if (activeGenericTaxonomies.length === 1) setSelectedTaxonomyId((prev) => prev || activeGenericTaxonomies[0].id)
      const qList = await questionBankService.fetchQuestionsFromDatabase().catch(() => questionBankService.getStoredQuestions())
      setQuestions(qList || [])

      const domains = Object.keys(freshTax)
      if (domains.length > 0 && (!selectedDomain || !freshTax[selectedDomain])) {
        setSelectedDomain(domains[0])
        if (freshTax[domains[0]].chapters.length > 0) {
          setSelectedChapter(freshTax[domains[0]].chapters[0].name)
          if (freshTax[domains[0]].chapters[0].lessons.length > 0) {
            setSelectedLesson(freshTax[domains[0]].chapters[0].lessons[0])
          }
        }
      }
    } catch (e) {
      console.warn('Error refreshing taxonomy:', e)
      const tax = questionBankService.getTaxonomy()
      setTaxonomy(tax)
    }
  }

  useEffect(() => {
    let isMounted = true
    setIsLoadingTaxonomy(true)

    // Subscribe to any taxonomy updates
    const unsubscribe = questionBankService.subscribeTaxonomy((latestTax: any) => {
      if (!isMounted) return
      setTaxonomy(latestTax)
      const domains = Object.keys(latestTax)
      setSelectedDomain((prev) => (prev && latestTax[prev] ? prev : domains[0] || null))
    })

    // Fetch fresh taxonomy and questions from the database
    Promise.all([
      questionBankService.fetchTaxonomy(),
      questionBankService.fetchQuestionsFromDatabase().catch(() => questionBankService.getStoredQuestions()),
      questionBankService.fetchGenericTaxonomies(),
    ]).then(([freshTax, qList, activeGenericTaxonomies]) => {
      if (!isMounted) return
      setTaxonomy(freshTax)
      setQuestions(qList || [])
      setGenericTaxonomies(activeGenericTaxonomies)
      if (activeGenericTaxonomies.length === 1) setSelectedTaxonomyId(activeGenericTaxonomies[0].id)
      const domains = Object.keys(freshTax)
      setSelectedDomain((prev) => (prev && freshTax[prev] ? prev : domains[0] || null))
    }).catch((err) => {
      console.warn('Error on initial taxonomy mount:', err)
      const tax = questionBankService.getTaxonomy()
      setTaxonomy(tax)
    }).finally(() => {
      if (isMounted) setIsLoadingTaxonomy(false)
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

    const domainNames = Object.keys(taxonomy)

  // Calculate statistics linking questions to taxonomy
  const taxonomyStats = useMemo(() => {
    let totalLessonsCount = 0
    let totalChaptersCount = 0
    const domainCounts: Record<string, number> = {}
    const chapterCounts: Record<string, number> = {}
    const lessonCounts: Record<string, number> = {}

    // Initialize counts
    domainNames.forEach((d) => {
      domainCounts[d] = 0
      taxonomy[d].chapters.forEach((c) => {
        totalChaptersCount++
        chapterCounts[`${d}::${c.name}`] = 0
        c.lessons.forEach((l) => {
          totalLessonsCount++
          lessonCounts[`${d}::${c.name}::${l}`] = 0
        })
      })
    })

    // Match questions
    questions.forEach((q) => {
      if (q.domain && domainCounts[q.domain] !== undefined) {
        domainCounts[q.domain]++
      }
      if (q.domain && q.chapter) {
        const cKey = `${q.domain}::${q.chapter}`
        if (chapterCounts[cKey] !== undefined) {
          chapterCounts[cKey]++
        }
      }
      if (q.domain && q.chapter && q.lesson) {
        const lKey = `${q.domain}::${q.chapter}::${q.lesson}`
        if (lessonCounts[lKey] !== undefined) {
          lessonCounts[lKey]++
        }
      }
    })

    return {
      domainsCount: domainNames.length,
      chaptersCount: totalChaptersCount,
      lessonsCount: totalLessonsCount,
      totalQuestions: questions.length,
      domainCounts,
      chapterCounts,
      lessonCounts,
    }
  }, [taxonomy, questions, domainNames])

  // Get current active chapters and lessons
  const currentChapters = selectedDomain && taxonomy[selectedDomain] ? taxonomy[selectedDomain].chapters : []
  const currentChapterObj = currentChapters.find((c) => c.name === selectedChapter)
  const currentLessons = currentChapterObj ? currentChapterObj.lessons : []

  // Linked questions for currently selected level
  const linkedQuestions = useMemo(() => {
    if (selectedLesson && selectedChapter && selectedDomain) {
      return questions.filter(
        (q) => q.domain === selectedDomain && q.chapter === selectedChapter && q.lesson === selectedLesson
      )
    }
    if (selectedChapter && selectedDomain) {
      return questions.filter((q) => q.domain === selectedDomain && q.chapter === selectedChapter)
    }
    if (selectedDomain) {
      return questions.filter((q) => q.domain === selectedDomain)
    }
    return questions
  }, [questions, selectedDomain, selectedChapter, selectedLesson])

  // Chapter code dropdown options grouped dynamically based on targetDomain
  const chapterCodeOptions = useMemo(() => {
    const parent = targetDomain ? taxonomy[targetDomain] : null
    const parentCode = parent?.code || 'CH'
    const list: { code: string; label: string; suggestedTitle: string; group: string }[] = []

    // Domain-specific curated clusters
    if (parentCode.includes('ALG') || targetDomain.toLowerCase().includes('algebra')) {
      const algChapters = [
        { code: `${parentCode}.1`, label: 'Linear Equations & Systems', title: 'Linear Equations, Inequalities & Systems' },
        { code: `${parentCode}.2`, label: 'Quadratic & Polynomial Equations', title: 'Quadratic & Polynomial Equations' },
        { code: `${parentCode}.3`, label: 'Functions & Transformations', title: 'Functions, Compositions & Graphical Transformations' },
        { code: `${parentCode}.4`, label: 'Exponential & Logarithmic Functions', title: 'Exponential & Logarithmic Functions' },
        { code: `${parentCode}.5`, label: 'Rational & Radical Expressions', title: 'Rational & Radical Expressions' },
        { code: `${parentCode}.6`, label: 'Inequalities & Absolute Value', title: 'Inequalities & Absolute Value Modeling' },
        { code: `${parentCode}.7`, label: 'Sequences & Series', title: 'Sequences, Series & Progression Patterns' },
      ]
      algChapters.forEach((c) => list.push({ ...c, suggestedTitle: c.title, group: `Curated ${parentCode} Curriculum Clusters` }))
    } else if (parentCode.includes('GEO') || targetDomain.toLowerCase().includes('geometry')) {
      const geoChapters = [
        { code: `${parentCode}.1`, label: 'Lines, Angles & Triangles', title: 'Lines, Angles & Triangle Properties' },
        { code: `${parentCode}.2`, label: 'Right Triangle Trigonometry', title: 'Right Triangle Trigonometry & SOH-CAH-TOA' },
        { code: `${parentCode}.3`, label: 'Circles, Radians & Arc Length', title: 'Circles, Radians, Sectors & Tangents' },
        { code: `${parentCode}.4`, label: 'Coordinate Geometry & Conics', title: 'Coordinate Geometry & Conic Sections' },
        { code: `${parentCode}.5`, label: '3D Geometry & Solid Volume', title: '3D Solids, Surface Area & Volume' },
      ]
      geoChapters.forEach((c) => list.push({ ...c, suggestedTitle: c.title, group: `Curated ${parentCode} Curriculum Clusters` }))
    } else if (parentCode.includes('STAT') || targetDomain.toLowerCase().includes('statistic')) {
      const statChapters = [
        { code: `${parentCode}.1`, label: 'Descriptive Statistics & Summary Metrics', title: 'Descriptive Statistics & Central Tendency' },
        { code: `${parentCode}.2`, label: 'Probability & Combinatorics', title: 'Probability, Combinations & Conditional Odds' },
        { code: `${parentCode}.3`, label: 'Normal Distributions & Empirical Rule', title: 'Normal Distributions & Standard Z-Scores' },
        { code: `${parentCode}.4`, label: 'Scatterplots & Linear Regression', title: 'Two-Variable Data, Scatterplots & Correlation' },
        { code: `${parentCode}.5`, label: 'Surveys, Sampling & Inferences', title: 'Sampling Methods & Statistical Inferences' },
      ]
      statChapters.forEach((c) => list.push({ ...c, suggestedTitle: c.title, group: `Curated ${parentCode} Curriculum Clusters` }))
    }

    // Numbered Sequence options based on parent code (1 to 8)
    for (let i = 1; i <= 8; i++) {
      const code = `${parentCode}.${i}`
      if (!list.some((o) => o.code === code)) {
        list.push({ code, label: `Chapter ${i}`, suggestedTitle: `Chapter ${i}`, group: `${parentCode} Numbered Sequence` })
      }
    }

    // General chapter codes CH.1 to CH.6
    for (let i = 1; i <= 6; i++) {
      const code = `CH.${i}`
      if (!list.some((o) => o.code === code)) {
        list.push({ code, label: `General Chapter ${i}`, suggestedTitle: `Chapter ${i}`, group: 'Standard Chapter Codes' })
      }
    }

    return list
  }, [targetDomain, taxonomy])

  // Handlers for Add/Edit actions
  const handleOpenAddDomain = () => {
    setFormDomainName('')
    setFormDomainUnitLabel(`Unit ${domainNames.length + 1}: `)
    const initialCode = STANDARD_DOMAIN_CODES[domainNames.length % STANDARD_DOMAIN_CODES.length]?.code || 'ALG'
    setFormDomainCode(initialCode)
    setIsCustomDomainCode(false)
    setModalMode('addDomain')
  }

  const handleOpenEditDomain = (domain: string) => {
    const data = taxonomy[domain]
    setOriginalName(domain)
    setFormDomainName(domain)
    setFormDomainUnitLabel(data?.unitLabel || '')
    const curCode = data?.code || ''
    setFormDomainCode(curCode)
    setIsCustomDomainCode(curCode ? !STANDARD_DOMAIN_CODES.some((c) => c.code === curCode) : false)
    if (genericTaxonomies.length === 1) setSelectedTaxonomyId(genericTaxonomies[0].id)
    setModalMode('editDomain')
  }

  const handleOpenAddChapter = (defaultDomain?: string) => {
    const domain = defaultDomain || selectedDomain || domainNames[0] || ''
    setTargetDomain(domain)
    setOriginalParentDomain(domain)
    setFormChapterName('')
    const pCode = taxonomy[domain]?.code || 'CH'
    const nextNum = (taxonomy[domain]?.chapters.length || 0) + 1
    const initialCode = `${pCode}.${nextNum}`
    setFormChapterCode(initialCode)
    setIsCustomChapterCode(false)
    if (genericTaxonomies.length === 1) setSelectedTaxonomyId(genericTaxonomies[0].id)
    setModalMode('addChapter')
  }

  const handleOpenEditChapter = (domain: string, chapter: { name: string; code?: string }) => {
    setTargetDomain(domain)
    setOriginalParentDomain(domain)
    setOriginalName(chapter.name)
    setFormChapterName(chapter.name)
    const curCode = chapter.code || ''
    setFormChapterCode(curCode)
    setIsCustomChapterCode(false)
    if (genericTaxonomies.length === 1) setSelectedTaxonomyId(genericTaxonomies[0].id)
    setModalMode('editChapter')
  }

  const handleOpenAddLesson = (defaultDomain?: string, defaultChapter?: string) => {
    const domain = defaultDomain || selectedDomain || domainNames[0] || ''
    const availableChaps = taxonomy[domain]?.chapters || []
    const chapter = defaultChapter || selectedChapter || availableChaps[0]?.name || ''
    setTargetDomain(domain)
    setTargetChapter(chapter)
    setOriginalParentDomain(domain)
    setOriginalParentChapter(chapter)
    setFormLessonName('')
    setModalMode('addLesson')
  }

  const handleOpenEditLesson = (domain: string, chapter: string, lesson: string) => {
    setTargetDomain(domain)
    setTargetChapter(chapter)
    setOriginalParentDomain(domain)
    setOriginalParentChapter(chapter)
    setOriginalName(lesson)
    setFormLessonName(lesson)
    if (genericTaxonomies.length === 1) setSelectedTaxonomyId(genericTaxonomies[0].id)
    setModalMode('editLesson')
  }

  const persistTaxonomyModal = async () => {
    if (!modalMode) return false

    const requiresDomainName = modalMode === 'addDomain' || modalMode === 'editDomain'
    const requiresChapterName = modalMode === 'addChapter' || modalMode === 'editChapter'
    const requiresLessonName = modalMode === 'addLesson' || modalMode === 'editLesson'

    if (
      (requiresDomainName && !formDomainName.trim()) ||
      (requiresChapterName && !formChapterName.trim()) ||
      (requiresLessonName && !formLessonName.trim())
    ) {
      return false
    }

    if (
      modalMode === 'editDomain' ||
      modalMode === 'editChapter' ||
      modalMode === 'editLesson'
    ) {
      if (!selectedTaxonomyId) return false
    }

    if (modalMode === 'addDomain' && formDomainName.trim()) {
      if (!selectedTaxonomyId) return false
      await questionBankService.addDomain(formDomainName.trim(), formDomainUnitLabel.trim(), formDomainCode.trim(), selectedTaxonomyId)
      setSelectedDomain(formDomainName.trim())
    } else if (modalMode === 'editDomain' && formDomainName.trim()) {
      if (!selectedTaxonomyId) return false
      await questionBankService.updateDomain(originalName, formDomainName.trim(), formDomainUnitLabel.trim(), formDomainCode.trim(), selectedTaxonomyId)
      if (selectedDomain === originalName) setSelectedDomain(formDomainName.trim())
    } else if (modalMode === 'addChapter' && formChapterName.trim()) {
      if (!selectedTaxonomyId) return false
      await questionBankService.addChapter(targetDomain, formChapterName.trim(), formChapterCode.trim(), selectedTaxonomyId)
      setSelectedDomain(targetDomain)
      setSelectedChapter(formChapterName.trim())
    } else if (modalMode === 'editChapter' && formChapterName.trim()) {
      if (!selectedTaxonomyId) return false
      if (originalParentDomain && originalParentDomain !== targetDomain) {
        await questionBankService.moveChapter(originalParentDomain, targetDomain, originalName, formChapterName.trim(), formChapterCode.trim(), selectedTaxonomyId)
      } else {
        await questionBankService.updateChapter(targetDomain, originalName, formChapterName.trim(), formChapterCode.trim(), selectedTaxonomyId)
      }
      setSelectedDomain(targetDomain)
      setSelectedChapter(formChapterName.trim())
    } else if (modalMode === 'addLesson' && formLessonName.trim()) {
      if (!selectedTaxonomyId) return false
      await questionBankService.addLesson(targetDomain, targetChapter, formLessonName.trim(), selectedTaxonomyId)
      setSelectedDomain(targetDomain)
      setSelectedChapter(targetChapter)
      setSelectedLesson(formLessonName.trim())
    } else if (modalMode === 'editLesson' && formLessonName.trim()) {
      if (!selectedTaxonomyId) return false
      if (
        (originalParentDomain && originalParentDomain !== targetDomain) ||
        (originalParentChapter && originalParentChapter !== targetChapter)
      ) {
        await questionBankService.moveLesson(
          originalParentDomain,
          originalParentChapter,
          targetDomain,
          targetChapter,
          originalName,
          formLessonName.trim(),
          selectedTaxonomyId
        )
      } else {
        await questionBankService.updateLesson(targetDomain, targetChapter, originalName, formLessonName.trim(), selectedTaxonomyId)
      }
      setSelectedDomain(targetDomain)
      setSelectedChapter(targetChapter)
      setSelectedLesson(formLessonName.trim())
    }

    setModalMode(null)
    setHasTaxonomyDraftChanges(false)
    markTaxonomyClean()
    await refreshData()
    if (selectedTaxonomyId) {
      await refreshGenericNodes(selectedTaxonomyId)
    }
    return true
  }

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (taxonomySaveInFlightRef.current || isSavingTaxonomy) return
    taxonomySaveInFlightRef.current = true
    setIsSavingTaxonomy(true)
    setStatusMessage(null)
    try {
      const savedMode = modalMode
      const taxonomyLabel = genericTaxonomies.find((item) => item.id === selectedTaxonomyId)?.name || 'selected taxonomy'
      const ok = await persistTaxonomyModal()
      if (ok) {
        const itemLabel = savedMode === 'addDomain' || savedMode === 'editDomain' ? 'domain' : savedMode === 'addChapter' || savedMode === 'editChapter' ? 'chapter' : 'lesson'
        setStatusMessage({ type: 'success', text: `The ${itemLabel} was saved under ${taxonomyLabel} and the taxonomy view has been refreshed.` })
      } else {
        setStatusMessage({ type: 'error', text: 'Enter a name before saving this taxonomy item.' })
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to save to database.' })
    } finally {
      taxonomySaveInFlightRef.current = false
      setIsSavingTaxonomy(false)
    }
  }

  const saveTaxonomyBeforeNavigation = () => {
    void persistTaxonomyModal()
  }
  const markTaxonomyClean = useUnsavedChanges(hasTaxonomyDraftChanges, saveTaxonomyBeforeNavigation)

  const closeTaxonomyModal = () => {
    setModalMode(null)
    setHasTaxonomyDraftChanges(false)
  }

  const handleOpenDeleteDomain = (domainName: string) => {
    const dData = taxonomy[domainName]
    const qCount = taxonomyStats.domainCounts[domainName] || 0
    let lessonsCount = 0
    if (dData?.chapters) {
      dData.chapters.forEach((c) => {
        lessonsCount += c.lessons.length
      })
    }
    setDeleteLinkedQuestions(false)
    setDeleteTarget({
      type: 'domain',
      domainName,
      unitLabel: dData?.unitLabel,
      code: dData?.code,
      chaptersCount: dData?.chapters.length || 0,
      lessonsCount,
      linkedQuestionsCount: qCount,
    })
  }

  const handleOpenDeleteChapter = (domainName: string, chapterName: string) => {
    const dData = taxonomy[domainName]
    const chap = dData?.chapters.find((c) => c.name === chapterName)
    const cKey = `${domainName}::${chapterName}`
    const qCount = taxonomyStats.chapterCounts[cKey] || 0
    setDeleteLinkedQuestions(false)
    setDeleteTarget({
      type: 'chapter',
      domainName,
      chapterName,
      code: chap?.code,
      lessonsCount: chap?.lessons.length || 0,
      linkedQuestionsCount: qCount,
    })
  }

  const handleOpenDeleteLesson = (domainName: string, chapterName: string, lessonName: string) => {
    const lKey = `${domainName}::${chapterName}::${lessonName}`
    const qCount = taxonomyStats.lessonCounts[lKey] || 0
    setDeleteLinkedQuestions(false)
    setDeleteTarget({
      type: 'lesson',
      domainName,
      chapterName,
      lessonName,
      linkedQuestionsCount: qCount,
    })
  }

  const handleOpenClearAllTaxonomy = () => {
    setDeleteLinkedQuestions(false)
    setDeleteTarget({
      type: 'all',
      domainName: '',
      chaptersCount: taxonomyStats.chaptersCount,
      lessonsCount: taxonomyStats.lessonsCount,
      linkedQuestionsCount: questions.length,
    })
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setIsSavingTaxonomy(true)
    try {
      if (deleteTarget.type === 'domain') {
        await questionBankService.deleteDomain(deleteTarget.domainName, deleteLinkedQuestions)
        if (selectedDomain === deleteTarget.domainName) {
          setSelectedDomain(null)
          setSelectedChapter(null)
          setSelectedLesson(null)
        }
        setStatusMessage({
          type: 'success',
          text: `Domain "${deleteTarget.domainName}" was permanently deleted${
            deleteLinkedQuestions ? ` along with ${deleteTarget.linkedQuestionsCount} linked questions.` : '.'
          }`,
        })
      } else if (deleteTarget.type === 'chapter') {
        await questionBankService.deleteChapter(
          deleteTarget.domainName,
          deleteTarget.chapterName!,
          deleteLinkedQuestions
        )
        if (selectedChapter === deleteTarget.chapterName) {
          setSelectedChapter(null)
          setSelectedLesson(null)
        }
        setStatusMessage({
          type: 'success',
          text: `Chapter "${deleteTarget.chapterName}" was permanently deleted${
            deleteLinkedQuestions ? ` along with ${deleteTarget.linkedQuestionsCount} linked questions.` : '.'
          }`,
        })
      } else if (deleteTarget.type === 'lesson') {
        await questionBankService.deleteLesson(
          deleteTarget.domainName,
          deleteTarget.chapterName!,
          deleteTarget.lessonName!,
          deleteLinkedQuestions
        )
        if (selectedLesson === deleteTarget.lessonName) {
          setSelectedLesson(null)
        }
        setStatusMessage({
          type: 'success',
          text: `Lesson "${deleteTarget.lessonName}" was permanently deleted${
            deleteLinkedQuestions ? ` along with ${deleteTarget.linkedQuestionsCount} linked questions.` : '.'
          }`,
        })
      } else if (deleteTarget.type === 'all') {
        questionBankService.clearAllTaxonomy()
        if (deleteLinkedQuestions) {
          await questionBankService.clearAllQuestions()
        }
        setSelectedDomain(null)
        setSelectedChapter(null)
        setSelectedLesson(null)
        setStatusMessage({
          type: 'success',
          text: `All taxonomy nodes have been permanently deleted${
            deleteLinkedQuestions ? ' along with all questions.' : '.'
          }`,
        })
      }
      setDeleteTarget(null)
      await refreshData()
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error deleting taxonomy node from database.' })
    } finally {
      setIsSavingTaxonomy(false)
    }
  }

  const refreshGenericNodes = async (taxonomyId: string) => {
    if (!taxonomyId) { setGenericNodes([]); return }
    try {
      setGenericNodes(await questionBankService.fetchGenericTaxonomyNodes(taxonomyId))
    } catch (err: any) {
      setGenericNodes([])
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to load generic taxonomy nodes.' })
    }
  }

  // Refresh the view being entered so changes made in either taxonomy view
  // are visible immediately without requiring a browser reload. Responses from
  // an older tab/selection are ignored to prevent cross-taxonomy UI races.
  useEffect(() => {
    let cancelled = false

    const refreshActiveTaxonomyView = async () => {
      try {
        if (activeTab === 'generic') {
          const latestTaxonomies = await questionBankService.fetchGenericTaxonomies()
          if (cancelled) return
          setGenericTaxonomies(latestTaxonomies)

          const nextSelectedId = selectedTaxonomyId && latestTaxonomies.some((item) => item.id === selectedTaxonomyId)
            ? selectedTaxonomyId
            : latestTaxonomies[0]?.id || ''
          if (nextSelectedId !== selectedTaxonomyId) setSelectedTaxonomyId(nextSelectedId)

          if (nextSelectedId) {
            const latestNodes = await questionBankService.fetchGenericTaxonomyNodes(nextSelectedId)
            if (!cancelled) setGenericNodes(latestNodes)
          } else if (!cancelled) {
            setGenericNodes([])
          }
          return
        }

        // The legacy view reads the service's compatibility registry. Reload it
        // from Supabase on tab entry instead of only refreshing genericNodes.
        const [latestTaxonomy, latestTaxonomies] = await Promise.all([
          questionBankService.fetchTaxonomy(),
          questionBankService.fetchGenericTaxonomies(),
        ])
        if (cancelled) return
        setTaxonomy(latestTaxonomy)
        setGenericTaxonomies(latestTaxonomies)

        const nextSelectedId = selectedTaxonomyId && latestTaxonomies.some((item) => item.id === selectedTaxonomyId)
          ? selectedTaxonomyId
          : latestTaxonomies[0]?.id || ''
        if (nextSelectedId !== selectedTaxonomyId) setSelectedTaxonomyId(nextSelectedId)
        if (nextSelectedId) {
          const latestNodes = await questionBankService.fetchGenericTaxonomyNodes(nextSelectedId)
          if (!cancelled) setGenericNodes(latestNodes)
        } else if (!cancelled) {
          setGenericNodes([])
        }
      } catch (err: any) {
        if (!cancelled) {
          setStatusMessage({ type: 'error', text: err?.message || 'Failed to refresh taxonomy view.' })
        }
      }
    }

    void refreshActiveTaxonomyView()
    return () => { cancelled = true }
  }, [activeTab, selectedTaxonomyId])

  const handleCreateGenericTaxonomy = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!genericTaxonomyName.trim()) return
    setIsCreatingGenericTaxonomy(true)
    try {
      const created = await questionBankService.createGenericTaxonomy(genericTaxonomyName, genericTaxonomyCode, genericTaxonomyDescription)
      const taxonomies = await questionBankService.fetchGenericTaxonomies()
      setGenericTaxonomies(taxonomies)
      setSelectedTaxonomyId(created.id)
      setGenericBrowseParentId(null)
      setGenericNodeSearch('')
      setGenericNodes([])
      setGenericTaxonomyName(''); setGenericTaxonomyCode(''); setGenericTaxonomyDescription('')
      setIsTaxonomyFormOpen(false)
      setStatusMessage({ type: 'success', text: `Created taxonomy: ${created.name}` })
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to create taxonomy.' })
    } finally { setIsCreatingGenericTaxonomy(false) }
  }

  const handleEditGenericTaxonomy = () => {
    const selected = genericTaxonomies.find((item) => item.id === selectedTaxonomyId)
    if (!selected) return
    setGenericEditTarget({ type: 'taxonomy', id: selected.id })
    setGenericEditName(selected.name)
    setGenericEditCode(selected.code || '')
    setGenericEditDescription(selected.description || '')
  }

  const handleRenameGenericNode = (node: GenericTaxonomyNode) => {
    setGenericEditTarget({ type: 'node', id: node.id })
    setGenericEditName(node.name)
    setGenericEditCode(node.code || '')
    setGenericEditDescription(node.description || '')
  }

  const handleSaveGenericEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!genericEditTarget) return
    const name = genericEditName.trim()
    if (!name) {
      setStatusMessage({ type: 'error', text: genericEditTarget.type === 'taxonomy' ? 'Taxonomy name is required.' : 'Node name is required.' })
      return
    }
    setIsSavingGenericEdit(true)
    try {
      if (genericEditTarget.type === 'taxonomy') {
        const updated = await questionBankService.updateGenericTaxonomy(genericEditTarget.id, {
          name,
          code: genericEditCode.trim(),
          description: genericEditDescription.trim(),
        })
        setGenericTaxonomies(current => current.map(item => item.id === updated.id ? updated : item))
        setStatusMessage({ type: 'success', text: `Updated taxonomy “${updated.name}”.` })
      } else {
        await questionBankService.updateGenericTaxonomyNode(genericEditTarget.id, {
          name,
          code: genericEditCode.trim(),
          description: genericEditDescription.trim(),
        })
        await refreshGenericNodes(selectedTaxonomyId)
        setStatusMessage({ type: 'success', text: `Updated node “${name}”.` })
      }
      setGenericEditTarget(null)
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to save changes. Check Supabase permissions.' })
    } finally {
      setIsSavingGenericEdit(false)
    }
  }

  const handleDeleteGenericTaxonomy = async () => {
    const selected = genericTaxonomies.find((item) => item.id === selectedTaxonomyId)
    if (!selected) return

    try {
      const impact = await questionBankService.getGenericTaxonomyDeleteImpact(selected.id)
      const confirmed = window.confirm(
        `Permanently delete the taxonomy “${selected.name}”?\n\n` +
        `• ${impact.nodeCount} node(s) across all hierarchy levels will be deleted.\n` +
        `• ${impact.linkedQuestionCount} distinct question(s) are linked to these nodes; their assignments to this taxonomy will be removed.\n` +
        `• The questions themselves and their assignments to other taxonomies will be preserved.\n\n` +
        `This cannot be undone. Continue?`
      )
      if (!confirmed) return

      const result = await questionBankService.deleteGenericTaxonomy(selected.id)
      const taxonomies = await questionBankService.fetchGenericTaxonomies()
      setGenericTaxonomies(taxonomies)
      setSelectedTaxonomyId(taxonomies[0]?.id ?? '')
      setGenericNodes([])
      setGenericBrowseParentId(null)
      setGenericNodeSearch('')
      setGenericParentId(null)
      setIsGenericNodeFormOpen(false)
      if (taxonomies[0]?.id) await refreshGenericNodes(taxonomies[0].id)
      setStatusMessage({
        type: 'success',
        text: `Deleted taxonomy “${selected.name}” and ${result.deletedNodeCount} node(s). Preserved all questions; removed assignments to this taxonomy.`,
      })
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to delete taxonomy.' })
    }
  }

  const handleCreateGenericNode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTaxonomyId || !genericNodeName.trim()) return
    setIsCreatingGenericNode(true)
    try {
      await questionBankService.createGenericTaxonomyNode(selectedTaxonomyId, genericNodeName, genericParentId, { code: genericNodeCode, sortOrder: genericNodes.filter(node => (node.parentId || null) === genericParentId).length })
      setGenericNodeName(''); setGenericNodeCode(''); setGenericParentId(null); setIsGenericNodeFormOpen(false)
      await refreshGenericNodes(selectedTaxonomyId)
      setStatusMessage({ type: 'success', text: `Node "${genericNodeName.trim()}" created under ${genericParentId ? (genericNodes.find((node) => node.id === genericParentId)?.name || 'the selected parent') : (genericTaxonomies.find((item) => item.id === selectedTaxonomyId)?.name || 'the selected taxonomy')} and saved successfully.` })
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to create taxonomy node.' })
    } finally { setIsCreatingGenericNode(false) }
  }


  const handleDeleteGenericNode = async (node: GenericTaxonomyNode) => {
    try {
      const impact = await questionBankService.getGenericTaxonomyNodeDeleteImpact(node.id)
      if (impact.linkedQuestionCount > 0) {
        setStatusMessage({ type: 'error', text: `Cannot delete “${node.name}”: ${impact.linkedQuestionCount} question(s) are linked to this branch. Reassign or remove those mappings first; no data was deleted.` })
        return
      }
      const confirmed = window.confirm(
        `Delete “${node.name}” and ${impact.descendantCount} descendant(s)?\n\nNo questions are currently linked to this branch. This action cannot be undone.`
      )
      if (!confirmed) return
      await questionBankService.deleteGenericTaxonomyNode(node.id)
      await refreshGenericNodes(selectedTaxonomyId)
      if (genericBrowseParentId && (genericBrowseParentId === node.id || !genericNodes.some(item => item.id === genericBrowseParentId && item.id !== node.id))) {
        setGenericBrowseParentId(node.parentId || null)
      }
      setStatusMessage({ type: 'success', text: `Deleted “${node.name}” and its ${impact.descendantCount} descendant(s). Existing questions were preserved.` })
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Unable to delete this taxonomy branch.' })
    }
  }


  // Display all levels in the compatibility workspace without changing the
  // existing Domain → Chapter → Lesson compatibility registry.
  const openGenericNodeCreator = (parentId: string | null) => {
    setGenericParentId(parentId)
    setGenericNodeName('')
    setGenericNodeCode('')
    setIsGenericNodeFormOpen(true)
  }

  const handleSyncToSupabase = async () => {
    setIsSyncingToSupabase(true)
    try {
      const res = await questionBankService.syncAllTaxonomyToSupabase()
      setStatusMessage({
        type: 'success',
        text: `Successfully synchronized ${res.domainsCount} domain(s), ${res.chaptersCount} chapter(s), and ${res.lessonsCount} lesson(s) to Supabase database.`,
      })
      await refreshData()
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Failed to sync with Supabase: ${err.message}`,
      })
    } finally {
      setIsSyncingToSupabase(false)
    }
  }

  const handleReloadFromDatabase = async () => {
    setIsLoadingTaxonomy(true)
    try {
      const fresh = await questionBankService.fetchTaxonomy()
      setTaxonomy(fresh)
      setStatusMessage({
        type: 'success',
        text: `Refreshed taxonomy from database: ${Object.keys(fresh).length} domain(s) loaded.`,
      })
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Failed to reload from database: ${err.message}`,
      })
    } finally {
      setIsLoadingTaxonomy(false)
    }
  }

    const handleRestoreDefaultTaxonomy = () => {
    questionBankService.restoreDefaultTaxonomy()
    refreshData()
    setStatusMessage({
      type: 'success',
      text: 'Restored default curriculum taxonomy architecture successfully.',
    })
  }

  const selectedGenericTaxonomy = genericTaxonomies.find((item) => item.id === selectedTaxonomyId)
  const genericChildrenOf = (parentId: string | null) =>
    genericNodes.filter((node) => (node.parentId || null) === parentId)
  const genericBreadcrumbs = useMemo(() => {
    const trail: GenericTaxonomyNode[] = []
    const visited = new Set<string>()
    let cursor = genericBrowseParentId
    while (cursor && !visited.has(cursor)) {
      visited.add(cursor)
      const node = genericNodes.find((item) => item.id === cursor)
      if (!node) break
      trail.unshift(node)
      cursor = node.parentId
    }
    return trail
  }, [genericNodes, genericBrowseParentId])
  // Search across the whole selected taxonomy, not just the currently open level.
  const genericSearchTerm = genericNodeSearch.trim().toLocaleLowerCase()
  const genericVisibleNodes = (genericSearchTerm ? genericNodes : genericChildrenOf(genericBrowseParentId)).filter((node) =>
    !genericSearchTerm || node.name.toLocaleLowerCase().includes(genericSearchTerm) ||
    (node.code || '').toLocaleLowerCase().includes(genericSearchTerm)
  )
  const genericNodePath = (node: GenericTaxonomyNode): string => {
    const labels: string[] = []
    const visited = new Set<string>()
    let parentId = node.parentId
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId)
      const parent = genericNodes.find((item) => item.id === parentId)
      if (!parent) break
      labels.unshift(parent.name)
      parentId = parent.parentId
    }
    return labels.length ? labels.join(' / ') : 'Top level'
  }
  const compatibilityTreeNodes = useMemo(() => {
    const children = new Map<string | null, GenericTaxonomyNode[]>()
    for (const node of genericNodes) {
      const parent = node.parentId && genericNodes.some(item => item.id === node.parentId) ? node.parentId : null
      children.set(parent, [...(children.get(parent) || []), node])
    }
    const flattened: Array<{ node: GenericTaxonomyNode; depth: number }> = []
    const visited = new Set<string>()
    const visit = (parent: string | null, depth: number) => {
      for (const node of children.get(parent) || []) {
        if (visited.has(node.id)) continue
        visited.add(node.id)
        flattened.push({ node, depth })
        visit(node.id, depth + 1)
      }
    }
    visit(null, 0)
    return flattened
  }, [genericNodes])

  const genericDepth = genericBreadcrumbs.length

  return (
    <AdminLayout
      title="Curriculum & Taxonomy"
      subtitle="Organize curriculum topics and link questions to learning outcomes."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={isLoadingTaxonomy} onClick={() => { void refreshData(); if (selectedTaxonomyId) void refreshGenericNodes(selectedTaxonomyId) }}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${isLoadingTaxonomy ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button type="button" onClick={() => navigate('/admin/questions/new')}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-blue-700"
            style={{ color: '#ffffff' }}>
            <Plus className="h-4 w-4" /> Create question
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <TaxonomyWorkspaceTabs mode={activeTab === 'generic' ? 'generic' : 'legacy'} onChange={(mode) => setActiveTab(mode === 'generic' ? 'generic' : 'overview')} />

        {activeTab === 'generic' && (
          <div className="space-y-5">
            {statusMessage && <div role="status" className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-xs font-medium ${statusMessage.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}><span className="mt-0.5">{statusMessage.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}</span><span className="flex-1">{statusMessage.text}</span><button type="button" onClick={() => setStatusMessage(null)} className="rounded-md p-0.5 opacity-70 hover:opacity-100" aria-label="Dismiss notification"><X className="h-3.5 w-3.5" /></button></div>}
            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="p-3 md:p-4">
                <TaxonomyHero
                  count={genericTaxonomies.length}
                  nodeCount={selectedTaxonomyId ? genericNodes.length : null}
                  rootCount={selectedTaxonomyId ? genericChildrenOf(null).length : null}
                  bankCount={questions.length}
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)]">
                <aside className="border-b border-slate-100 bg-slate-50/70 p-4 md:p-5 xl:border-b-0 xl:border-r">
                  <div className="mb-4 space-y-3">
                    <TaxonomySectionHeading title="Your taxonomies" description="Select a workspace to manage its hierarchy." />
                    {genericTaxonomies.length > 0 && <button type="button" onClick={() => setIsTaxonomyFormOpen((open) => !open)}
                      aria-expanded={isTaxonomyFormOpen}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100">
                      <Plus className="h-4 w-4" /> {isTaxonomyFormOpen ? 'Close new taxonomy form' : 'New taxonomy'}
                    </button>}
                  </div>
                  {(isTaxonomyFormOpen || genericTaxonomies.length === 0) && <form onSubmit={handleCreateGenericTaxonomy} className="mb-4 space-y-3 rounded-2xl border border-blue-200 bg-white p-4 shadow-sm">
                    <label htmlFor="taxonomy-create-name" className="block text-sm font-semibold text-slate-800">Taxonomy name *</label>
                    <input id="taxonomy-create-name" value={genericTaxonomyName} onChange={e => setGenericTaxonomyName(e.target.value)} required maxLength={200} placeholder="e.g. Grade 10 Mathematics" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                    <label htmlFor="taxonomy-create-code" className="block text-xs font-semibold text-slate-700">Code (optional)</label>
                    <input id="taxonomy-create-code" value={genericTaxonomyCode} onChange={e => setGenericTaxonomyCode(e.target.value)} placeholder="e.g. MATH10" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                    <label htmlFor="taxonomy-create-description" className="block text-xs font-semibold text-slate-700">Description (optional)</label>
                    <textarea id="taxonomy-create-description" rows={2} value={genericTaxonomyDescription} onChange={e => setGenericTaxonomyDescription(e.target.value)} placeholder="What does this taxonomy cover?" className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                    <button type="submit" disabled={isCreatingGenericTaxonomy || !genericTaxonomyName.trim()}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ color: '#ffffff' }}><Plus className="h-4 w-4" />{isCreatingGenericTaxonomy ? 'Creating…' : 'Create taxonomy'}</button>
                  </form>}
                  <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                    {genericTaxonomies.map((item) => {
                      const isSelected = selectedTaxonomyId === item.id
                      return (
                        <button key={item.id} type="button" onClick={() => { setSelectedTaxonomyId(item.id); setGenericNodes([]); setGenericBrowseParentId(null); setGenericNodeSearch(''); setGenericParentId(null); setIsGenericNodeFormOpen(false); setGenericNodeName(''); setGenericNodeCode(''); void refreshGenericNodes(item.id) }} className={`group flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${isSelected ? 'border-blue-300 bg-white shadow-sm ring-2 ring-blue-50' : 'border-transparent bg-white/70 hover:border-slate-200 hover:bg-white'}`}>
                          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600'}`}><Layers className="h-4 w-4" /></span>
                          <span className="min-w-0 flex-1"><span className={`block truncate text-sm font-bold ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>{item.name}</span><span className="mt-1 block truncate text-xs text-slate-500">{item.code || 'No code assigned'}</span></span>
                          {isSelected ? <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />}
                        </button>
                      )
                    })}
                    {genericTaxonomies.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center"><Layers className="mx-auto h-6 w-6 text-slate-300" /><p className="mt-2 text-xs font-semibold text-slate-700">No taxonomies yet</p><p className="mt-1 text-[11px] text-slate-500">Create one above to start building your hierarchy.</p></div>}
                  </div>
                </aside>

                <main className="min-w-0 p-4 md:p-6">
                  {selectedTaxonomyId && selectedGenericTaxonomy ? <>
                    <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-lg bg-blue-50 p-2 text-blue-700"><FolderTree className="h-4 w-4" /></span>
                          <h3 className="text-lg font-bold tracking-tight text-slate-950">{selectedGenericTaxonomy.name}</h3>
                          {selectedGenericTaxonomy.code && <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-500">{selectedGenericTaxonomy.code}</span>}
                        </div>
                        {selectedGenericTaxonomy.description && <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">{selectedGenericTaxonomy.description}</p>}
                        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]" aria-label="Taxonomy breadcrumbs">
                          <button type="button" onClick={() => { setGenericBrowseParentId(null); setGenericNodeSearch(''); setIsGenericNodeFormOpen(false) }} className={`rounded-lg px-2.5 py-1.5 font-semibold transition ${genericBrowseParentId === null ? 'bg-blue-600 text-white' : 'text-blue-700 hover:bg-blue-50'}`}>{selectedGenericTaxonomy.name}</button>
                          {genericBreadcrumbs.map((crumb, index) => <React.Fragment key={crumb.id}><ChevronRight className="h-3 w-3 text-slate-300" /><button type="button" onClick={() => { setGenericBrowseParentId(crumb.id); setGenericNodeSearch(''); setIsGenericNodeFormOpen(false) }} className={`max-w-[180px] truncate rounded-lg px-2.5 py-1.5 font-semibold transition ${index === genericBreadcrumbs.length - 1 ? 'bg-blue-600 text-white' : 'text-blue-700 hover:bg-blue-50'}`}>{crumb.name}</button></React.Fragment>)}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => { openGenericNodeCreator(genericBrowseParentId); setGenericNodeSearch('') }}
                          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700" style={{ color: '#ffffff' }}>
                          <Plus className="h-4 w-4" />{genericBrowseParentId ? `Add node to ${genericBreadcrumbs[genericBreadcrumbs.length - 1]?.name || 'this level'}` : 'Add root node'}
                        </button>
                        {genericBrowseParentId && <button type="button" onClick={() => { openGenericNodeCreator(null); setGenericNodeSearch('') }}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                          <Plus className="h-4 w-4" />Add root node
                        </button>}
                        <button type="button" onClick={() => void refreshGenericNodes(selectedTaxonomyId)} className="rounded-xl border border-slate-200 p-2.5 text-slate-600 transition hover:bg-slate-50" aria-label="Refresh nodes" title="Refresh nodes"><RefreshCw className="h-4 w-4" /></button>
                        <details className="group relative">
                          <summary className="cursor-pointer list-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Taxonomy options</summary>
                          <div className="absolute right-0 z-20 mt-2 flex w-56 flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                            <button type="button" onClick={() => void handleEditGenericTaxonomy()} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-blue-50"><Edit2 className="h-4 w-4" /> Edit taxonomy</button>
                            <button type="button" onClick={() => void handleDeleteGenericTaxonomy()} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4" /> Delete taxonomy…</button>
                          </div>
                        </details>
                      </div>
                    </div>

                    {isGenericNodeFormOpen && <form onSubmit={handleCreateGenericNode} className="my-5 rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
                      <div className="mb-3 flex items-start justify-between gap-3"><div><h4 className="text-sm font-bold text-slate-900">{genericParentId ? 'Add child node' : 'Add root node'}</h4><p className="mt-1 text-[11px] text-slate-600">{genericParentId ? `New node will be added under ${genericNodes.find(n => n.id === genericParentId)?.name || 'the selected parent'}.` : `New node will be added at the top level of ${selectedGenericTaxonomy.name}.`}</p></div><button type="button" onClick={() => { setIsGenericNodeFormOpen(false); setGenericParentId(null); setGenericNodeName(''); setGenericNodeCode('') }} disabled={isCreatingGenericNode} className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-50" aria-label="Close node form"><X className="h-4 w-4" /></button></div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
                        <input value={genericNodeName} onChange={e => setGenericNodeName(e.target.value)} required maxLength={200} autoFocus placeholder="Node name (required)" aria-label="Node name" className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                        <input value={genericNodeCode} onChange={e => setGenericNodeCode(e.target.value)} maxLength={80} placeholder="Code (optional)" aria-label="Node code" className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                        <button type="submit" disabled={isCreatingGenericNode || !genericNodeName.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />{isCreatingGenericNode ? 'Saving…' : genericParentId ? 'Create child' : 'Create root'}</button>
                      </div>
                    </form>}

                    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div><p className="text-sm font-bold text-slate-900">{genericBrowseParentId ? genericBreadcrumbs[genericBreadcrumbs.length - 1]?.name : 'Root nodes'}</p><p className="mt-1 text-[11px] text-slate-500">{genericVisibleNodes.length} {genericSearchTerm ? 'matching nodes across all levels' : `items at this level · Level ${genericDepth + 1}`}</p></div>
                      <label className="relative block w-full sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input value={genericNodeSearch} onChange={e => setGenericNodeSearch(e.target.value)} placeholder="Search nodes at any level…" aria-label="Search nodes across all levels" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></label>
                    </div>

                    <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
                      <div className="hidden grid-cols-[minmax(0,1fr)_110px_150px] items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:grid"><span>Node</span><span>Children</span><span className="text-right">Actions</span></div>
                      {genericVisibleNodes.map((node) => {
                        const childCount = genericChildrenOf(node.id).length
                        return <div key={node.id} className="group flex flex-col gap-3 border-b border-slate-100 p-3 last:border-b-0 hover:bg-slate-50/70 sm:grid sm:grid-cols-[minmax(0,1fr)_110px_150px] sm:items-center sm:gap-3 sm:px-4">
                          <button type="button" onClick={() => { setGenericBrowseParentId(node.id); setGenericNodeSearch(''); setIsGenericNodeFormOpen(false); setGenericParentId(null) }} className="flex min-w-0 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition group-hover:border-blue-200 group-hover:text-blue-600"><FolderTree className="h-4 w-4" /></span>
                            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-800">{node.name}</span><span className="mt-1 block truncate text-xs text-slate-500">{node.code || 'No code'} · {genericSearchTerm ? genericNodePath(node) : 'Open to view child nodes'}</span></span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
                          </button>
                          <div className="flex items-center gap-2 pl-[52px] sm:pl-0"><span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{childCount} child{childCount === 1 ? '' : 'ren'}</span></div>
                          <div className="flex items-center gap-1 pl-[48px] sm:justify-end sm:pl-0"><button type="button" onClick={() => { setGenericParentId(node.id); setGenericBrowseParentId(node.id); setGenericNodeName(''); setGenericNodeCode(''); setIsGenericNodeFormOpen(true) }} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-[10px] font-semibold text-blue-700 transition hover:bg-blue-50"><Plus className="h-3.5 w-3.5" />Add child</button><button type="button" onClick={() => void handleRenameGenericNode(node)} className="rounded-lg p-2 text-slate-500 transition hover:bg-white hover:text-blue-700" aria-label={`Edit ${node.name}`} title="Edit node name and code"><Edit2 className="h-3.5 w-3.5" /></button><button type="button" onClick={() => void handleDeleteGenericNode(node)} className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-700" aria-label={`Delete ${node.name}`} title={childCount > 0 ? 'Permanently delete this node and all descendants' : 'Permanently delete node'}><Trash2 className="h-3.5 w-3.5" /></button></div>
                        </div>})}
                      {genericVisibleNodes.length === 0 && <div className="px-5 py-12 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><FolderTree className="h-5 w-5" /></span><h4 className="mt-3 text-sm font-bold text-slate-800">{genericNodeSearch ? 'No matching nodes' : genericBrowseParentId ? 'No child nodes yet' : 'This taxonomy is empty'}</h4><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">{genericNodeSearch ? 'Try a different name or code.' : genericBrowseParentId ? 'Add a child node to build the next level of this hierarchy.' : 'Create a root node to establish the first level of this taxonomy.'}</p>{!genericNodeSearch && <button type="button" onClick={() => { setGenericParentId(genericBrowseParentId); setGenericNodeName(''); setGenericNodeCode(''); setIsGenericNodeFormOpen(true) }} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-blue-700"><Plus className="h-4 w-4" />{genericBrowseParentId ? 'Add child node' : 'Add root node'}</button>}</div>}
                    </div>
                  </> : <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center"><span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-50 text-blue-600"><FolderTree className="h-7 w-7" /></span><h3 className="mt-5 text-lg font-bold text-slate-900">Choose a taxonomy to begin</h3><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Each taxonomy opens in its own workspace. Your nodes stay scoped to that taxonomy, with unlimited hierarchy depth and clear breadcrumbs.</p></div>}
                </main>
              </div>
            </section>
          </div>
        )}

        {genericEditTarget && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSavingGenericEdit) setGenericEditTarget(null) }}>
            <form onSubmit={handleSaveGenericEdit} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="generic-edit-title">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div><h3 id="generic-edit-title" className="text-base font-bold text-slate-900">{genericEditTarget.type === 'taxonomy' ? 'Edit taxonomy' : 'Edit node'}</h3><p className="mt-1 text-xs text-slate-500">Changes are saved to the existing database record.</p></div>
                <button type="button" disabled={isSavingGenericEdit} onClick={() => setGenericEditTarget(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50" aria-label="Close edit dialog"><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-3">
                <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Name <span className="text-rose-600">*</span></span><input autoFocus required maxLength={200} value={genericEditName} onChange={e => setGenericEditName(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></label>
                <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Code</span><input maxLength={80} value={genericEditCode} onChange={e => setGenericEditCode(e.target.value)} placeholder="Optional" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></label>
                {<label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Description</span><textarea rows={3} maxLength={1000} value={genericEditDescription} onChange={e => setGenericEditDescription(e.target.value)} placeholder="Optional description" className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></label>}
              </div>
              <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button type="button" disabled={isSavingGenericEdit} onClick={() => setGenericEditTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={isSavingGenericEdit || !genericEditName.trim()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />{isSavingGenericEdit ? 'Saving…' : 'Save changes'}</button>
              </div>
            </form>
          </div>
        )}

        {activeTab !== 'generic' && (
        <React.Fragment>
        {/* Status Message Notification */}
        {statusMessage && (
          <div
            className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-xs font-medium border shadow-2xs animate-in fade-in duration-200 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{statusMessage.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="p-1 hover:bg-black/5 rounded-lg transition text-slate-400 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3"><Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><p className="text-sm font-bold text-amber-950">Curriculum compatibility tools</p><p className="mt-1 text-sm leading-6 text-amber-900">Manage the original Domain → Chapter → Lesson curriculum below, and edit your full dynamic taxonomy at any depth in the panel on this page. Existing question mappings are protected.</p></div></div>
          <details className="mt-3 rounded-xl border border-amber-200 bg-white p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">Maintenance and bulk curriculum actions</summary>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={handleOpenAddDomain} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Plus className="h-4 w-4" />Add domain</button>
              <button type="button" disabled={isLoadingTaxonomy} onClick={handleReloadFromDatabase} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className="h-4 w-4" />Reload from DB</button>
              {isSupabaseConfigured && <button type="button" disabled={isSyncingToSupabase || isLoadingTaxonomy} onClick={handleSyncToSupabase} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Database className="h-4 w-4" />{isSyncingToSupabase ? 'Syncing…' : 'Sync to Supabase'}</button>}
              {taxonomyStats.domainsCount === 0 ? <button type="button" onClick={handleRestoreDefaultTaxonomy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RotateCcw className="h-4 w-4" />Restore defaults</button> : <button type="button" onClick={handleOpenClearAllTaxonomy} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4" />Clear all…</button>}
            </div>
          </details>
        </div>

        {/* Shared dynamic-taxonomy controls: accessible without leaving compatibility mode. */}
        <section className="rounded-3xl border border-blue-100 bg-white p-4 shadow-sm md:p-5" aria-label="Dynamic taxonomy management">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-base font-bold text-slate-900"><Layers className="h-5 w-5 text-blue-600" />Dynamic taxonomy management</h3>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">Create, rename, or delete taxonomy items at any depth, directly from Curriculum Compatibility. The original three-level curriculum remains available below.</p>
            </div>
            <button type="button" onClick={() => setIsTaxonomyFormOpen(open => !open)} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"><Plus className="h-4 w-4" />New taxonomy</button>
          </div>
          {isTaxonomyFormOpen && <form onSubmit={handleCreateGenericTaxonomy} className="mt-4 grid gap-2 rounded-xl border border-blue-100 bg-blue-50/50 p-3 sm:grid-cols-2">
            <input required maxLength={200} aria-label="New taxonomy name" placeholder="Taxonomy name" value={genericTaxonomyName} onChange={e => setGenericTaxonomyName(e.target.value)} className="rounded-lg border border-slate-200 p-2 text-sm" />
            <input maxLength={80} aria-label="New taxonomy code" placeholder="Code (optional)" value={genericTaxonomyCode} onChange={e => setGenericTaxonomyCode(e.target.value)} className="rounded-lg border border-slate-200 p-2 text-sm" />
            <textarea maxLength={1000} aria-label="New taxonomy description" placeholder="Description (optional)" value={genericTaxonomyDescription} onChange={e => setGenericTaxonomyDescription(e.target.value)} className="rounded-lg border border-slate-200 p-2 text-sm sm:col-span-2" />
            <button type="submit" disabled={isCreatingGenericTaxonomy || !genericTaxonomyName.trim()} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{isCreatingGenericTaxonomy ? 'Creating…' : 'Create taxonomy'}</button>
          </form>}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label htmlFor="compat-taxonomy-select" className="text-xs font-semibold text-slate-700">Taxonomy</label>
            <select id="compat-taxonomy-select" value={selectedTaxonomyId} onChange={e => {setSelectedTaxonomyId(e.target.value);setGenericNodes([]);setIsGenericNodeFormOpen(false);setGenericBrowseParentId(null);void refreshGenericNodes(e.target.value)}} className="min-w-[180px] max-w-full flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">Select a taxonomy</option>
              {genericTaxonomies.map(tax => <option key={tax.id} value={tax.id}>{tax.name}</option>)}
            </select>
            <button type="button" disabled={!selectedTaxonomyId} onClick={handleEditGenericTaxonomy} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"><Edit2 className="mr-1 inline h-3.5 w-3.5" />Edit</button>
            <button type="button" disabled={!selectedTaxonomyId} onClick={() => void handleDeleteGenericTaxonomy()} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-40"><Trash2 className="mr-1 inline h-3.5 w-3.5" />Delete</button>
            <button type="button" disabled={!selectedTaxonomyId} onClick={() => openGenericNodeCreator(null)} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><Plus className="mr-1 inline h-3.5 w-3.5" />Add root</button>
          </div>
          {selectedTaxonomyId && <>
            {isGenericNodeFormOpen && <form onSubmit={handleCreateGenericNode} className="mt-4 grid gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 sm:grid-cols-[minmax(0,1fr)_140px_auto_auto]">
              <label className="sr-only" htmlFor="compat-node-name">Node name</label><input id="compat-node-name" required maxLength={200} value={genericNodeName} onChange={e => setGenericNodeName(e.target.value)} placeholder={`Name under ${genericParentId ? genericNodes.find(n=>n.id===genericParentId)?.name || 'selected parent' : 'taxonomy root'}`} className="min-w-0 rounded-lg border border-slate-200 p-2 text-sm" />
              <input aria-label="Node code" maxLength={80} value={genericNodeCode} onChange={e => setGenericNodeCode(e.target.value)} placeholder="Code (optional)" className="rounded-lg border border-slate-200 p-2 text-sm" />
              <button type="submit" disabled={isCreatingGenericNode || !genericNodeName.trim()} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{isCreatingGenericNode?'Saving…':'Save item'}</button>
              <button type="button" onClick={() => setIsGenericNodeFormOpen(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold">Cancel</button>
            </form>}
            <div className="mt-4 max-h-[420px] overflow-auto rounded-xl border border-slate-200" role="tree" aria-label="Editable taxonomy hierarchy">
              {compatibilityTreeNodes.map(({node,depth}) => <div key={node.id} role="treeitem" aria-level={depth+1} className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-0 hover:bg-slate-50" style={{paddingLeft:`${12+Math.min(depth,10)*18}px`}}>
                <FolderTree className="h-4 w-4 shrink-0 text-slate-400" /><div className="min-w-[120px] flex-1"><p className="truncate text-xs font-semibold text-slate-800">{node.name}</p><p className="text-[11px] text-slate-500">{node.code || `Level ${depth+1}`}</p></div>
                <button type="button" onClick={() => openGenericNodeCreator(node.id)} aria-label={`Add child to ${node.name}`} className="rounded-lg p-2 text-blue-700 hover:bg-blue-50"><Plus className="h-4 w-4" /></button>
                <button type="button" onClick={() => handleRenameGenericNode(node)} aria-label={`Edit ${node.name}`} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><Edit2 className="h-4 w-4" /></button>
                <button type="button" onClick={() => void handleDeleteGenericNode(node)} aria-label={`Delete ${node.name}`} className="rounded-lg p-2 text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
              </div>)}
              {compatibilityTreeNodes.length===0 && <p className="p-5 text-center text-xs text-slate-500">No nodes yet. Add a root item to start this taxonomy.</p>}
            </div>
          </>}
          {!selectedTaxonomyId && <p className="mt-4 text-xs text-slate-500">Choose or create a taxonomy to manage its levels.</p>}
        </section>

        {/* Top Summary Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Tier 1: Domains (Units)</span>
            <p className="text-xl font-bold text-blue-950 mt-0.5">{taxonomyStats.domainsCount}</p>
            <p className="text-[11px] text-blue-600/80 mt-0.5">Core curriculum areas</p>
          </div>
          <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Tier 2: Chapters</span>
            <p className="text-xl font-bold text-indigo-950 mt-0.5">{taxonomyStats.chaptersCount}</p>
            <p className="text-[11px] text-indigo-600/80 mt-0.5">Thematic clusters</p>
          </div>
          <div className="p-3 bg-teal-50/60 rounded-xl border border-teal-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Tier 3: Lessons</span>
            <p className="text-xl font-bold text-teal-950 mt-0.5">{taxonomyStats.lessonsCount}</p>
            <p className="text-[11px] text-teal-600/80 mt-0.5">Granular competencies</p>
          </div>
          <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Linked Questions</span>
            <p className="text-xl font-bold text-emerald-950 mt-0.5">{taxonomyStats.totalQuestions}</p>
            <p className="text-[11px] text-emerald-600/80 mt-0.5">In Active Bank</p>
          </div>
        </div>

        {/* 3-Column Visual Hierarchy Browser (Domain(Unit) -> Chapter -> Lesson) */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60">
            <div className="flex items-center gap-2">
              <FolderTree className="h-5 w-5 text-blue-600" />
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  Curriculum Hierarchy Navigator: Domain (Unit) → Chapter → Lesson
                </h3>
                <p className="text-xs text-slate-500">
                  Select a tier below to view associated lessons, manage standards, or filter linked questions.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter taxonomy..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:border-blue-500 bg-white"
                />
              </div>
            </div>
          </div>

            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200 min-h-[440px]">
              {/* COLUMN 1: DOMAINS (UNITS) */}
              <div className="flex flex-col bg-slate-50/30">
                <div className="p-3.5 border-b border-slate-200 bg-slate-100/50">
                  <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wider text-slate-700">Domain (Unit)</span><button type="button" onClick={handleOpenAddDomain} aria-label="Add domain" className="rounded-md p-1 text-blue-700 hover:bg-blue-50"><Plus className="h-4 w-4" /></button></div>
                </div>
                <div className="p-3 space-y-1.5 flex-1 overflow-y-auto max-h-[500px]">
                  {domainNames
                    .filter((d) => !searchQuery || d.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((domain) => (
                      <div key={domain} className="relative group">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDomain(domain)
                          setSelectedChapter(null)
                          setSelectedLesson(null)
                        }}
                        className={`w-full text-left p-3 rounded-2xl border transition ${
                          selectedDomain === domain
                            ? 'bg-blue-50 border-blue-300 shadow-2xs'
                            : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 truncate">{domain}</div>
                            {taxonomy[domain]?.unitLabel && (
                              <div className="text-[10px] text-slate-400 mt-0.5">{taxonomy[domain].unitLabel}</div>
                            )}
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                        </div>
                      </button>
                      <div className="mt-1 flex justify-end gap-1"><button type="button" onClick={() => handleOpenEditDomain(domain)} className="rounded-md p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-700" aria-label={`Edit domain ${domain}`}><Edit2 className="h-3.5 w-3.5" /></button><button type="button" onClick={() => handleOpenDeleteDomain(domain)} className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50" aria-label={`Delete domain ${domain}`}><Trash2 className="h-3.5 w-3.5" /></button></div>
                      </div>
                    ))}
                  {domainNames.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-10">No domains available.</p>
                  )}
                </div>
              </div>

              {/* COLUMN 2: CHAPTERS */}
              <div className="flex flex-col bg-white">
                <div className="p-3.5 border-b border-slate-200 bg-slate-100/50">
                  <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wider text-slate-700">Chapter</span><button type="button" disabled={!selectedDomain} onClick={() => handleOpenAddChapter(selectedDomain || undefined)} aria-label="Add chapter" className="rounded-md p-1 text-blue-700 hover:bg-blue-50 disabled:opacity-40"><Plus className="h-4 w-4" /></button></div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {selectedDomain ? `Chapters in ${selectedDomain}` : 'Select a domain to view its chapters.'}
                  </p>
                </div>
                <div className="p-3 space-y-1.5 flex-1 overflow-y-auto max-h-[500px]">
                  {selectedDomain && currentChapters.map((chapter) => (
                    <div key={chapter.name}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedChapter(chapter.name)
                        setSelectedLesson(null)
                      }}
                      className={`w-full text-left p-3 rounded-2xl border transition ${
                        selectedChapter === chapter.name
                          ? 'bg-indigo-50 border-indigo-300 shadow-2xs'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">{chapter.name}</div>
                          {chapter.code && <div className="text-[10px] font-mono text-slate-400 mt-0.5">{chapter.code}</div>}
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                      </div>
                    </button>
                    <div className="mt-1 flex justify-end gap-1"><button type="button" onClick={() => handleOpenEditChapter(selectedDomain,chapter)} aria-label={`Edit chapter ${chapter.name}`} className="rounded-md p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-700"><Edit2 className="h-3.5 w-3.5" /></button><button type="button" onClick={() => handleOpenDeleteChapter(selectedDomain, chapter.name)} aria-label={`Delete chapter ${chapter.name}`} className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button></div>
                    </div>
                  ))}
                  {selectedDomain && currentChapters.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-10">This domain has no chapters.</p>
                  )}
                  {!selectedDomain && (
                    <p className="text-xs text-slate-400 text-center py-10">Select a domain to view its chapters.</p>
                  )}
                </div>
              </div>

              {/* COLUMN 3: LESSONS */}
              <div className="flex flex-col bg-white">
                <div className="p-3.5 border-b border-slate-200 bg-slate-100/50">
                  <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wider text-slate-700">Lesson</span><button type="button" disabled={!selectedDomain || !selectedChapter} onClick={() => handleOpenAddLesson(selectedDomain || undefined, selectedChapter || undefined)} aria-label="Add lesson" className="rounded-md p-1 text-blue-700 hover:bg-blue-50 disabled:opacity-40"><Plus className="h-4 w-4" /></button></div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {selectedChapter ? `Lessons in ${selectedChapter}` : 'Select a chapter to view its lessons.'}
                  </p>
                </div>
                <div className="p-3 space-y-1.5 flex-1 overflow-y-auto max-h-[500px]">
                  {selectedChapter && currentLessons.map((lesson) => (
                    <div key={lesson}>
                    <button
                      type="button"
                      onClick={() => setSelectedLesson(lesson)}
                      className={`w-full text-left p-3 rounded-2xl border transition ${
                        selectedLesson === lesson
                          ? 'bg-teal-50 border-teal-300 shadow-2xs'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-bold text-slate-900 truncate">{lesson}</div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                      </div>
                    </button>
                    <div className="mt-1 flex justify-end gap-1"><button type="button" onClick={() => handleOpenEditLesson(selectedDomain!,selectedChapter!,lesson)} aria-label={`Edit lesson ${lesson}`} className="rounded-md p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-700"><Edit2 className="h-3.5 w-3.5" /></button><button type="button" onClick={() => handleOpenDeleteLesson(selectedDomain!,selectedChapter!,lesson)} aria-label={`Delete lesson ${lesson}`} className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button></div>
                    </div>
                  ))}
                  {selectedChapter && currentLessons.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-10">This chapter has no lessons.</p>
                  )}
                  {!selectedChapter && (
                    <p className="text-xs text-slate-400 text-center py-10">Select a chapter to view its lessons.</p>
                  )}
                </div>
              </div>
            </div>
        </div>

        {/* Linked Questions Section */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900">
                  Questions Linked to Selected Taxonomy Node ({linkedQuestions.length})
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Active context: <strong className="text-slate-800">{selectedDomain || 'All Domains'}</strong>
                {selectedChapter && <span> → <strong className="text-slate-800">{selectedChapter}</strong></span>}
                {selectedLesson && <span> → <strong className="text-slate-800">{selectedLesson}</strong></span>}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                to={`/admin/questions?domain=${encodeURIComponent(selectedDomain || '')}&chapter=${encodeURIComponent(selectedChapter || '')}`}
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold"
              >
                <span>Open in Question Bank</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {linkedQuestions.length === 0 ? (
            <div className="p-8 border-2 border-dashed border-slate-200 rounded-2xl text-center space-y-2">
              <p className="text-xs text-slate-400">
                No questions are currently mapped to this exact lesson.
              </p>
              <button
                type="button"
                onClick={() => navigate('/admin/questions/new')}
                style={{ backgroundColor: '#2563eb', color: '#ffffff' }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create Question for this Lesson</span>
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
              {linkedQuestions.map((q) => (
                <div key={q.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-medium text-slate-900 line-clamp-2">{q.prompt}</p>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span className="font-semibold text-blue-600">{q.collection || 'General Question Bank'}</span>
                      <span>•</span>
                      <span className="capitalize font-medium">{q.questionType.replace('_', ' ')}</span>
                      <span>•</span>
                      <span className="capitalize font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded">
                        {q.difficulty}
                      </span>
                    </div>
                  </div>

                  <Link
                    to={`/admin/questions/${q.id}/edit`}
                    className="p-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 shrink-0"
                  >
                    Edit Question
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

      {/* Modal: Add or Edit Domain / Chapter / Lesson */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {modalMode === 'addDomain' && 'Add Root Domain (Unit)'}
                {modalMode === 'editDomain' && `Edit Domain: ${originalName}`}
                {modalMode === 'addChapter' && `Add Chapter to ${targetDomain}`}
                {modalMode === 'editChapter' && `Edit Chapter: ${originalName}`}
                {modalMode === 'addLesson' && `Add Lesson to ${targetChapter}`}
                {modalMode === 'editLesson' && `Edit Lesson: ${originalName}`}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Changes persist dynamically and synchronize automatically across question bank categorizations.
              </p>
            </div>

            <form
              onSubmit={handleSaveModal}
              onChangeCapture={() => setHasTaxonomyDraftChanges(true)}
              onClickCapture={() => setHasTaxonomyDraftChanges(true)}
              className="space-y-3.5"
            >
              {/* Generic taxonomy target for all edit operations */}
              {(modalMode === 'editDomain' || modalMode === 'editChapter' || modalMode === 'editLesson') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Taxonomy *</label>
                  <select
                    value={selectedTaxonomyId}
                    onChange={(e) => setSelectedTaxonomyId(e.target.value)}
                    required
                    className="w-full text-xs font-medium border border-slate-300 rounded-xl px-3 py-2 bg-white text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                  >
                    <option value="">Select a taxonomy...</option>
                    {genericTaxonomies.map((tax) => (
                      <option key={tax.id} value={tax.id}>
                        {tax.code ? `[${tax.code}] ` : ''}{tax.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Domain inputs */}
              {(modalMode === 'addDomain' || modalMode === 'editDomain') && (
                <>
                  {modalMode === 'addDomain' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Taxonomy *</label>
                      <select value={selectedTaxonomyId} onChange={(e) => setSelectedTaxonomyId(e.target.value)} required className="w-full text-xs font-medium border border-slate-300 rounded-xl px-3 py-2 bg-white text-slate-800 focus:border-indigo-500 focus:outline-hidden">
                        <option value="">Select a taxonomy...</option>
                        {genericTaxonomies.map((tax) => <option key={tax.id} value={tax.id}>{tax.code ? `[${tax.code}] ` : ''}{tax.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Domain Title *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Algebra & Functions"
                      value={formDomainName}
                      onChange={(e) => setFormDomainName(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Unit Label / Header (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Unit 1: Foundations of Algebraic Modeling"
                      value={formDomainUnitLabel}
                      onChange={(e) => setFormDomainUnitLabel(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        Code Identifier Option *
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsCustomDomainCode(!isCustomDomainCode)}
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                      >
                        {isCustomDomainCode ? 'Select from options' : '+ Custom Code'}
                      </button>
                    </div>

                    {!isCustomDomainCode ? (
                      <select
                        value={formDomainCode}
                        onChange={(e) => {
                          const val = e.target.value
                          if (val === '__CUSTOM__') {
                            setIsCustomDomainCode(true)
                          } else {
                            setFormDomainCode(val)
                            const match = STANDARD_DOMAIN_CODES.find((c) => c.code === val)
                            if (match) {
                              if (
                                !formDomainName ||
                                formDomainName === originalName ||
                                STANDARD_DOMAIN_CODES.some((c) => c.suggestedName === formDomainName)
                              ) {
                                setFormDomainName(match.suggestedName)
                              }
                              if (
                                !formDomainUnitLabel ||
                                STANDARD_DOMAIN_CODES.some((c) => c.suggestedUnit === formDomainUnitLabel)
                              ) {
                                setFormDomainUnitLabel(match.suggestedUnit)
                              }
                            }
                          }
                        }}
                        className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 bg-white focus:border-blue-500 focus:outline-hidden"
                      >
                        <optgroup label="Standard Curriculum Domains">
                          {STANDARD_DOMAIN_CODES.filter((c) => !c.code.startsWith('UNIT-')).map((opt) => (
                            <option key={opt.code} value={opt.code}>
                              {opt.label}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Unit Modules">
                          {STANDARD_DOMAIN_CODES.filter((c) => c.code.startsWith('UNIT-')).map((opt) => (
                            <option key={opt.code} value={opt.code}>
                              {opt.label}
                            </option>
                          ))}
                        </optgroup>
                        <option value="__CUSTOM__">✨ Enter Custom Code Identifier...</option>
                      </select>
                    ) : (
                      <div className="space-y-1">
                        <input
                          type="text"
                          required
                          placeholder="e.g. ALG, ADV.MATH, CALC"
                          value={formDomainCode}
                          onChange={(e) => setFormDomainCode(e.target.value.toUpperCase())}
                          className="w-full text-xs border border-blue-300 rounded-xl px-3 py-2 bg-blue-50/30 focus:border-blue-500 focus:outline-hidden font-mono"
                        />
                        <p className="text-[10px] text-slate-500">
                          Custom alphanumeric uppercase code identifier for this domain.
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Chapter inputs */}
              {(modalMode === 'addChapter' || modalMode === 'editChapter') && (
                <>
                  {modalMode === 'addChapter' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Taxonomy *</label>
                      <select value={selectedTaxonomyId} onChange={(e) => setSelectedTaxonomyId(e.target.value)} required className="w-full text-xs font-medium border border-slate-300 rounded-xl px-3 py-2 bg-white text-slate-800 focus:border-indigo-500 focus:outline-hidden">
                        <option value="">Select a taxonomy...</option>
                        {genericTaxonomies.map((tax) => <option key={tax.id} value={tax.id}>{tax.code ? `[${tax.code}] ` : ''}{tax.name}</option>)}
                      </select>
                      <p className="text-[10px] text-slate-500 mt-1">The chapter will be created as a child of the selected taxonomy domain node.</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Domain (Available Domains) *
                    </label>
                    <select
                      value={targetDomain}
                      onChange={(e) => {
                        const newD = e.target.value
                        setTargetDomain(newD)
                        const pCode = taxonomy[newD]?.code || 'CH'
                        const nextNum = (taxonomy[newD]?.chapters.length || 0) + 1
                        setFormChapterCode(`${pCode}.${nextNum}`)
                      }}
                      className="w-full text-xs font-medium border border-slate-300 rounded-xl px-3 py-2 bg-white text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                    >
                      {domainNames.map((d) => {
                        const dInfo = taxonomy[d]
                        const codeBadge = dInfo?.code ? `[${dInfo.code}] ` : ''
                        return (
                          <option key={d} value={d}>
                            {codeBadge}{dInfo?.unitLabel ? `${dInfo.unitLabel} — ${d}` : d}
                          </option>
                        )
                      })}
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Select which curriculum domain this chapter belongs to.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Chapter Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Linear Equations & Systems"
                      value={formChapterName}
                      onChange={(e) => setFormChapterName(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        Chapter Code Option *
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsCustomChapterCode(!isCustomChapterCode)}
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700"
                      >
                        {isCustomChapterCode ? 'Select from options' : '+ Custom Code'}
                      </button>
                    </div>

                    {!isCustomChapterCode ? (
                      <select
                        value={formChapterCode}
                        onChange={(e) => {
                          const val = e.target.value
                          if (val === '__CUSTOM__') {
                            setIsCustomChapterCode(true)
                          } else {
                            setFormChapterCode(val)
                            const matchedOpt = chapterCodeOptions.find((o) => o.code === val)
                            if (
                              matchedOpt?.suggestedTitle &&
                              (!formChapterName || chapterCodeOptions.some((o) => o.suggestedTitle === formChapterName))
                            ) {
                              setFormChapterName(matchedOpt.suggestedTitle)
                            }
                          }
                        }}
                        className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 bg-white focus:border-indigo-500 focus:outline-hidden"
                      >
                        {Array.from(new Set(chapterCodeOptions.map((o) => o.group))).map((grp) => (
                          <optgroup key={grp} label={grp}>
                            {chapterCodeOptions
                              .filter((o) => o.group === grp)
                              .map((opt) => (
                                <option key={opt.code} value={opt.code}>
                                  {opt.code} — {opt.label}
                                </option>
                              ))}
                          </optgroup>
                        ))}
                        <option value="__CUSTOM__">✨ Enter Custom Chapter Code...</option>
                      </select>
                    ) : (
                      <div className="space-y-1">
                        <input
                          type="text"
                          required
                          placeholder="e.g. ALG.1, GEO.2, CH.3"
                          value={formChapterCode}
                          onChange={(e) => setFormChapterCode(e.target.value.toUpperCase())}
                          className="w-full text-xs border border-indigo-300 rounded-xl px-3 py-2 bg-indigo-50/30 focus:border-indigo-500 focus:outline-hidden font-mono"
                        />
                        <p className="text-[10px] text-slate-500">
                          Custom chapter code formatted e.g. DOMAIN.NUMBER.
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Lesson inputs */}
              {(modalMode === 'addLesson' || modalMode === 'editLesson') && (
                <>
                  {modalMode === 'addLesson' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Taxonomy *
                      </label>
                      <select
                        value={selectedTaxonomyId}
                        onChange={(e) => setSelectedTaxonomyId(e.target.value)}
                        required
                        className="w-full text-xs font-medium border border-slate-300 rounded-xl px-3 py-2 bg-white text-slate-800 focus:border-teal-500 focus:outline-hidden"
                      >
                        <option value="">Select taxonomy...</option>
                        {genericTaxonomies.map((taxonomyOption) => (
                          <option key={taxonomyOption.id} value={taxonomyOption.id}>
                            {taxonomyOption.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Domain (Available Domains) *
                    </label>
                    <select
                      value={targetDomain}
                      onChange={(e) => {
                        const newD = e.target.value
                        setTargetDomain(newD)
                        const availableChaps = taxonomy[newD]?.chapters || []
                        setTargetChapter(availableChaps[0]?.name || '')
                      }}
                      className="w-full text-xs font-medium border border-slate-300 rounded-xl px-3 py-2 bg-white text-slate-800 focus:border-teal-500 focus:outline-hidden"
                    >
                      {domainNames.map((d) => {
                        const dInfo = taxonomy[d]
                        const codeBadge = dInfo?.code ? `[${dInfo.code}] ` : ''
                        return (
                          <option key={d} value={d}>
                            {codeBadge}{dInfo?.unitLabel ? `${dInfo.unitLabel} — ${d}` : d}
                          </option>
                        )
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Chapter (Available Chapters in Domain) *
                    </label>
                    {taxonomy[targetDomain]?.chapters && taxonomy[targetDomain]?.chapters.length > 0 ? (
                      <select
                        value={targetChapter}
                        onChange={(e) => setTargetChapter(e.target.value)}
                        className="w-full text-xs font-medium border border-slate-300 rounded-xl px-3 py-2 bg-white text-slate-800 focus:border-teal-500 focus:outline-hidden"
                      >
                        {taxonomy[targetDomain]?.chapters.map((chap) => {
                          const cCodeBadge = chap.code ? `[${chap.code}] ` : ''
                          return (
                            <option key={chap.name} value={chap.name}>
                              {cCodeBadge}{chap.name} ({chap.lessons.length} lessons)
                            </option>
                          )
                        })}
                      </select>
                    ) : (
                      <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                        No chapters exist in {targetDomain} yet. Please create a chapter in this domain first.
                      </div>
                    )}
                    <p className="text-[10px] text-slate-500 mt-1">
                      Select which chapter this competency lesson belongs to.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Lesson / Specific Competency Name *
                    </label>
                    <textarea
                      rows={2}
                      required
                      placeholder="e.g. Quadratic Formula & Discriminant Analysis"
                      value={formLessonName}
                      onChange={(e) => setFormLessonName(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeTaxonomyModal}
                  disabled={isSavingTaxonomy}
                  className="px-3 py-1.5 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingTaxonomy}
                  style={{ backgroundColor: '#2563eb', color: '#ffffff' }}
                  className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSavingTaxonomy && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  {isSavingTaxonomy ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Modal: Delete Domain / Chapter / Lesson / Clear All Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {deleteTarget.type === 'domain' && 'Confirm Domain Deletion'}
                    {deleteTarget.type === 'chapter' && 'Confirm Chapter Deletion'}
                    {deleteTarget.type === 'lesson' && 'Confirm Lesson Deletion'}
                    {deleteTarget.type === 'all' && 'Confirm Delete Entire Taxonomy'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Are you sure you want to permanently delete this taxonomy node?
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Target Item Summary Card */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                    deleteTarget.type === 'domain'
                      ? 'bg-blue-100 text-blue-700'
                      : deleteTarget.type === 'chapter'
                      ? 'bg-indigo-100 text-indigo-700'
                      : deleteTarget.type === 'lesson'
                      ? 'bg-teal-100 text-teal-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {deleteTarget.type === 'domain' && 'Domain (Unit)'}
                  {deleteTarget.type === 'chapter' && 'Chapter'}
                  {deleteTarget.type === 'lesson' && 'Lesson (Competency)'}
                  {deleteTarget.type === 'all' && 'All Taxonomy Architecture'}
                </span>
                {deleteTarget.code && (
                  <span className="font-mono text-[10px] font-bold text-slate-600 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                    {deleteTarget.code}
                  </span>
                )}
              </div>

              {deleteTarget.type === 'all' ? (
                <div>
                  <h4 className="font-bold text-sm text-slate-900">All Curriculum Domains, Chapters & Lessons</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    {deleteTarget.chaptersCount} Chapters • {deleteTarget.lessonsCount} Lessons across {taxonomyStats.domainsCount} Domains
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {deleteTarget.unitLabel && (
                    <span className="block text-[11px] font-semibold text-blue-600">
                      {deleteTarget.unitLabel}
                    </span>
                  )}
                  {deleteTarget.type === 'domain' && (
                    <h4 className="font-bold text-sm text-slate-900">{deleteTarget.domainName}</h4>
                  )}
                  {deleteTarget.type === 'chapter' && (
                    <div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1">
                        <span>{deleteTarget.domainName}</span>
                        <span>→</span>
                      </div>
                      <h4 className="font-bold text-sm text-slate-900 mt-0.5">{deleteTarget.chapterName}</h4>
                    </div>
                  )}
                  {deleteTarget.type === 'lesson' && (
                    <div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1">
                        <span>{deleteTarget.domainName}</span>
                        <span>→</span>
                        <span>{deleteTarget.chapterName}</span>
                        <span>→</span>
                      </div>
                      <h4 className="font-bold text-sm text-slate-900 mt-0.5">{deleteTarget.lessonName}</h4>
                    </div>
                  )}
                </div>
              )}

              {/* Counts breakdown */}
              <div className="pt-2 border-t border-slate-200/60 flex flex-wrap items-center gap-3 text-[11px] text-slate-600 font-medium">
                {deleteTarget.chaptersCount !== undefined && deleteTarget.type === 'domain' && (
                  <span>{deleteTarget.chaptersCount} Chapters</span>
                )}
                {deleteTarget.lessonsCount !== undefined && (deleteTarget.type === 'domain' || deleteTarget.type === 'chapter') && (
                  <span>• {deleteTarget.lessonsCount} Lessons</span>
                )}
                <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                  {deleteTarget.linkedQuestionsCount} Questions Linked
                </span>
              </div>
            </div>

            {/* Linked Questions Treatment Option */}
            {deleteTarget.linkedQuestionsCount > 0 ? (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800">
                  What would you like to do with the {deleteTarget.linkedQuestionsCount} linked question(s)?
                </label>
                <div className="space-y-2">
                  <label
                    className={`flex items-start gap-3 p-3 rounded-2xl border transition cursor-pointer ${
                      !deleteLinkedQuestions
                        ? 'border-blue-500 bg-blue-50/50 text-blue-900'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="linkedQuestionsChoice"
                      checked={!deleteLinkedQuestions}
                      onChange={() => setDeleteLinkedQuestions(false)}
                      className="mt-0.5 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="text-xs">
                      <p className="font-semibold text-slate-900">
                        Keep questions in Question Bank
                      </p>
                      <p className="text-slate-500 mt-0.5 leading-relaxed">
                        Questions will remain safely in the question bank. Their text, explanations, and metadata are preserved without taxonomy linking.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-3 p-3 rounded-2xl border transition cursor-pointer ${
                      deleteLinkedQuestions
                        ? 'border-rose-500 bg-rose-50/60 text-rose-900'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="linkedQuestionsChoice"
                      checked={deleteLinkedQuestions}
                      onChange={() => setDeleteLinkedQuestions(true)}
                      className="mt-0.5 text-rose-600 focus:ring-rose-500"
                    />
                    <div className="text-xs">
                      <p className="font-semibold text-rose-900">
                        Also permanently delete all {deleteTarget.linkedQuestionsCount} linked questions
                      </p>
                      <p className="text-rose-700/80 mt-0.5 leading-relaxed">
                        Destructive: The associated questions will be permanently removed from the question bank.
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>No questions are mapped to this node. Deleting will not affect any Question Bank items.</span>
              </div>
            )}

            {/* Permanent Warning */}
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">
                <strong>Warning:</strong> This deletion permanently updates your curriculum taxonomy. This action cannot be undone.
              </p>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                style={{ backgroundColor: '#e11d48', color: '#ffffff' }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>
                  {deleteTarget.type === 'all'
                    ? 'Clear Entire Taxonomy'
                    : `Delete ${deleteTarget.type === 'domain' ? 'Domain' : deleteTarget.type === 'chapter' ? 'Chapter' : 'Lesson'}`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
        </React.Fragment>
      )}
      </div>
    </AdminLayout>
  )
}

export default TaxonomyPage
