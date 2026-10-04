/**
 * Unit of Work Pattern for Application Data Mutations
 *
 * Coordinates atomic transactional operations across multiple aggregates/entities:
 * - Questions, Taxonomy (Domains, Chapters, Lessons), Collections, Assessments, and Attempts.
 *
 * Applies staged operations through Supabase. Each database operation is
 * persisted independently; a failure leaves later operations pending.
 */

import { questionBankService, QuestionBankItem, QuestionCollection } from './questionBankService'
import { assessmentService, Assessment } from './assessmentService'
import { supabase } from './supabaseClient'

export type UnitOfWorkActionType =
  | 'save_domain'
  | 'save_chapter'
  | 'save_lesson'
  | 'save_question'
  | 'save_questions'
  | 'delete_question'
  | 'save_collection'
  | 'delete_collection'
  | 'save_assessment'
  | 'delete_assessment'
  | 'save_attempt'
  | 'delete_attempt'
  | 'delete_taxonomy'

export interface UnitOfWorkAction {
  id: string
  type: UnitOfWorkActionType
  payload: any
  timestamp: string
}

export interface UnitOfWorkCommitResult {
  success: boolean
  committedCount: number
  error?: string
  results?: any[]
}

export class UnitOfWork {
  private actions: UnitOfWorkAction[] = []
  private isCommitted: boolean = false
  private isRolledBack: boolean = false

  /**
   * Stage a new or updated Domain in the Unit of Work
   */
  registerNewDomain(name: string, unitLabel?: string, code?: string): this {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Domain name cannot be empty in Unit of Work')
    this.actions.push({
      id: `act-dom-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type: 'save_domain',
      payload: { name: trimmed, unitLabel, code },
      timestamp: new Date().toISOString(),
    })
    return this
  }

  /**
   * Stage a new or updated Chapter in the Unit of Work
   */
  registerNewChapter(domain: string, name: string, code?: string): this {
    const dTrim = domain.trim()
    const cTrim = name.trim()
    if (!dTrim || !cTrim) throw new Error('Domain and chapter name cannot be empty in Unit of Work')
    this.actions.push({
      id: `act-chap-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type: 'save_chapter',
      payload: { domain: dTrim, name: cTrim, code },
      timestamp: new Date().toISOString(),
    })
    return this
  }

  /**
   * Stage a new or updated Lesson in the Unit of Work
   */
  registerNewLesson(domain: string, chapter: string, name: string): this {
    const dTrim = domain.trim()
    const cTrim = chapter.trim()
    const lTrim = name.trim()
    if (!dTrim || !cTrim || !lTrim) {
      throw new Error('Domain, chapter, and lesson name cannot be empty in Unit of Work')
    }
    this.actions.push({
      id: `act-les-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type: 'save_lesson',
      payload: { domain: dTrim, chapter: cTrim, name: lTrim },
      timestamp: new Date().toISOString(),
    })
    return this
  }

  /**
   * Stage a Question to be saved (inserted or updated) in the Unit of Work
   */
  registerQuestion(question: QuestionBankItem): this {
    if (!question || !question.prompt?.trim()) {
      throw new Error('Question must have a valid prompt stem in Unit of Work')
    }
    this.actions.push({
      id: `act-q-${question.id || Date.now()}`,
      type: 'save_question',
      payload: question,
      timestamp: new Date().toISOString(),
    })
    return this
  }

  /**
   * Stage a Question to be deleted in the Unit of Work
   */
  registerDeleteQuestion(questionId: string): this {
    const qId = String(questionId).trim()
    if (!qId) throw new Error('Question ID is required for delete in Unit of Work')
    this.actions.push({
      id: `act-del-q-${qId}`,
      type: 'delete_question',
      payload: { id: qId },
      timestamp: new Date().toISOString(),
    })
    return this
  }

  /**
   * Stage a Collection to be saved in the Unit of Work
   */
  registerCollection(collection: QuestionCollection): this {
    if (!collection || !collection.name?.trim()) {
      throw new Error('Collection must have a valid name in Unit of Work')
    }
    this.actions.push({
      id: `act-col-${collection.id || collection.name}`,
      type: 'save_collection',
      payload: collection,
      timestamp: new Date().toISOString(),
    })
    return this
  }

  /**
   * Stage an Assessment to be saved in the Unit of Work
   */
  registerAssessment(assessment: Assessment): this {
    if (!assessment || !assessment.id) {
      throw new Error('Assessment must have an ID in Unit of Work')
    }
    this.actions.push({
      id: `act-ass-${assessment.id}`,
      type: 'save_assessment',
      payload: assessment,
      timestamp: new Date().toISOString(),
    })
    return this
  }

  /**
   * Stage multiple Questions to be saved in batch in the Unit of Work
   */
  registerQuestions(questions: QuestionBankItem[]): this {
    if (!Array.isArray(questions) || questions.length === 0) return this
    for (const q of questions) {
      if (!q.prompt?.trim()) {
        throw new Error('All questions in Unit of Work must have a valid prompt stem')
      }
    }
    this.actions.push({
      id: `act-qs-${Date.now()}`,
      type: 'save_questions',
      payload: questions,
      timestamp: new Date().toISOString(),
    })
    return this
  }

  /**
   * Stage a Collection to be deleted in the Unit of Work
   */
  registerDeleteCollection(collectionId: string): this {
    const cId = String(collectionId).trim()
    if (!cId) throw new Error('Collection ID/name is required for delete in Unit of Work')
    this.actions.push({
      id: `act-del-col-${cId}`,
      type: 'delete_collection',
      payload: { id: cId, name: cId },
      timestamp: new Date().toISOString(),
    })
    return this
  }

  /**
   * Stage an Attempt to be saved in the Unit of Work
   */
  registerAttempt(attempt: any): this {
    if (!attempt || !attempt.id) throw new Error('Attempt must have an ID in Unit of Work')
    this.actions.push({
      id: `act-att-${attempt.id}`,
      type: 'save_attempt',
      payload: attempt,
      timestamp: new Date().toISOString(),
    })
    return this
  }

  /**
   * Stage an Attempt to be deleted in the Unit of Work
   */
  registerDeleteAttempt(attemptId: string): this {
    const aId = String(attemptId).trim()
    if (!aId) throw new Error('Attempt ID is required for delete in Unit of Work')
    this.actions.push({
      id: `act-del-att-${aId}`,
      type: 'delete_attempt',
      payload: { id: aId },
      timestamp: new Date().toISOString(),
    })
    return this
  }

  /**
   * Stage a Taxonomy item (domain, chapter, lesson) to be deleted in the Unit of Work
   */
  registerDeleteTaxonomy(payload: {
    type: 'domain' | 'chapter' | 'lesson' | 'all'
    domain?: string
    chapter?: string
    lesson?: string
    deleteQuestions?: boolean
  }): this {
    this.actions.push({
      id: `act-del-tax-${Date.now()}`,
      type: 'delete_taxonomy',
      payload,
      timestamp: new Date().toISOString(),
    })
    return this
  }

  /**
   * Stage an Assessment and all its dependent entities to be deleted
   */
  registerDeleteAssessment(assessmentId: string): this {
    const aId = String(assessmentId).trim()
    if (!aId) throw new Error('Assessment ID is required for delete in Unit of Work')
    this.actions.push({
      id: `act-del-ass-${aId}`,
      type: 'delete_assessment',
      payload: { id: aId },
      timestamp: new Date().toISOString(),
    })
    return this
  }

  /**
   * Get all currently staged actions
   */
  getActions(): ReadonlyArray<UnitOfWorkAction> {
    return [...this.actions]
  }

  /**
   * Check if there are any pending operations staged
   */
  get hasPendingOperations(): boolean {
    return this.actions.length > 0 && !this.isCommitted && !this.isRolledBack
  }

  /**
   * Clear all staged operations without committing
   */
  rollback(): void {
    this.actions = []
    this.isRolledBack = true
  }

  /**
  * Commit staged operations sequentially through Supabase.
   */
  async commit(): Promise<UnitOfWorkCommitResult> {
    if (this.actions.length === 0) {
      return { success: true, committedCount: 0 }
    }

    if (this.isCommitted) {
      throw new Error('This Unit of Work has already been committed.')
    }

    const totalCount = this.actions.length
    let committedCount = 0
    const results: Array<{ id: string; success: true }> = []

    while (committedCount < this.actions.length) {
      const action = this.actions[committedCount]
      try {
        switch (action.type) {
          case 'save_domain':
            await questionBankService.addDomain(action.payload.name, action.payload.unitLabel, action.payload.code)
            break
          case 'save_chapter':
            await questionBankService.addChapter(action.payload.domain, action.payload.name, action.payload.code)
            break
          case 'save_lesson':
            await questionBankService.addLesson(action.payload.domain, action.payload.chapter, action.payload.name)
            break
          case 'save_question':
            await questionBankService.addQuestion(action.payload)
            break
          case 'save_questions': {
            const saved = await questionBankService.saveQuestions(action.payload)
            if (!saved) throw new Error('Failed to save questions to Supabase.')
            break
          }
          case 'delete_question':
            await questionBankService.deleteQuestion(action.payload.id)
            break
          case 'save_collection': {
            const collections = questionBankService.getStoredCollections()
            const next = collections.filter(
              (collection) => collection.id !== action.payload.id && collection.name !== action.payload.name
            )
            await questionBankService.persistCollections([...next, action.payload])
            break
          }
          case 'delete_collection': {
            const collections = questionBankService.getStoredCollections()
            await questionBankService.persistCollections(
              collections.filter(
                (collection) => collection.id !== action.payload.id && collection.name !== action.payload.name
              )
            )
            break
          }
          case 'save_assessment':
            await assessmentService.syncAssessmentToDatabase(action.payload)
            break
          case 'delete_assessment':
            await assessmentService.deleteAssessmentFromDatabase(action.payload.id)
            break
          case 'save_attempt': {
            const { error } = await supabase.from('attempts').upsert(action.payload)
            if (error) throw error
            break
          }
          case 'delete_attempt': {
            const { error } = await supabase.from('attempts').delete().eq('id', action.payload.id)
            if (error) throw error
            break
          }
          case 'delete_taxonomy': {
            const payload = action.payload
            if (payload.type === 'all') {
              await questionBankService.clearAllTaxonomy(payload.deleteQuestions)
            } else if (payload.type === 'domain') {
              await questionBankService.deleteDomain(payload.domain || '', payload.deleteQuestions)
            } else if (payload.type === 'chapter') {
              await questionBankService.deleteChapter(payload.domain || '', payload.chapter || '', payload.deleteQuestions)
            } else {
              await questionBankService.deleteLesson(
                payload.domain || '',
                payload.chapter || '',
                payload.lesson || '',
                payload.deleteQuestions
              )
            }
            break
          }
        }
        results.push({ id: action.id, success: true })
        committedCount++
      } catch (error) {
        this.actions = this.actions.slice(committedCount)
        const message = error instanceof Error ? error.message : 'Unknown Supabase error.'
        throw new Error(`Supabase commit failed after ${committedCount} of ${totalCount} operations: ${message}`)
      }
    }

    this.isCommitted = true
    await this.syncLocalCaches()

    return { success: true, committedCount, results }
  }

  /**
   * Synchronize frontend caches after successful atomic server commit
   */
  private async syncLocalCaches(): Promise<void> {
    const hasTaxonomyActions = this.actions.some((a) =>
      ['save_domain', 'save_chapter', 'save_lesson', 'save_question', 'save_questions', 'delete_taxonomy'].includes(a.type)
    )
    const hasQuestionActions = this.actions.some((a) =>
      ['save_question', 'save_questions', 'delete_question', 'delete_taxonomy'].includes(a.type)
    )
    const hasCollectionActions = this.actions.some((a) =>
      ['save_collection', 'delete_collection', 'save_question', 'save_questions', 'delete_question'].includes(a.type)
    )
    const hasAssessmentActions = this.actions.some((a) =>
      ['save_assessment', 'delete_assessment'].includes(a.type)
    )

    try {
      if (hasTaxonomyActions) {
        await questionBankService.fetchTaxonomy().catch(() => {})
      }
      if (hasQuestionActions) {
        await questionBankService.fetchQuestionsFromDatabase().catch(() => {})
      }
      if (hasCollectionActions) {
        await questionBankService.fetchCollectionsFromDatabase().catch(() => {})
      }
      if (hasAssessmentActions) {
        await assessmentService.fetchAssessmentsFromDatabase().catch(() => {})
      }
    } catch (cacheErr) {
      console.warn('[UnitOfWork] Notice synchronizing local caches post-commit:', cacheErr)
    }
  }
}

/**
   Convenient helper to build and atomically execute a Unit of Work
 */
export async function executeUnitOfWork(
  buildWork: (uow: UnitOfWork) => void | Promise<void>
): Promise<UnitOfWorkCommitResult> {
  const uow = new UnitOfWork()
  await buildWork(uow)
  return await uow.commit()
}
