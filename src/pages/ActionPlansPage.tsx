import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RecommendationHero, RecommendationStats, RecommendationTabs, RecommendationSearch, RecommendationEmpty, RecommendationBadge, validateRecommendationConditions, type RecommendationWorkspace } from '../components/recommendations/RecommendationWorkspaceUI'
import AdminLayout from '../components/AdminLayout'
import {
  actionPlanService,
  recommendationRuleService,
  type ActionPlan,
  type ActionPlanItem,
  type RecommendationRule,
  type RecommendationRuleActionPlan,
} from '../lib/actionPlanService'
import {
  Plus,
  Trash2,
  Edit2,
  ChevronUp,
  ChevronDown,
  Save,
  X,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Link2,
  Search,
  Settings2,
  BookOpen,
  ArrowRight,
} from 'lucide-react'

type Toast = { type: 'success' | 'error'; message: string } | null

const emptyPlanDraft = {
  name: '',
  code: '',
  description: '',
  isActive: true,
}

const emptyItemDraft = {
  itemType: 'task',
  title: '',
  description: '',
  isRequired: false,
  isActive: true,
  payload: '{}',
}

const emptyRuleDraft = {
  name: '',
  code: '',
  description: '',
  priority: '0',
  isActive: true,
  conditions: '{}',
  metadata: '{}',
}

function parseJsonObject(value: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(value || '{}')
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`)
  }
  return parsed as Record<string, unknown>
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2)
  } catch {
    return '{}'
  }
}

type SimpleScoreCondition = { path: string; operator: 'lt' | 'lte' | 'gte' | 'gt'; value: number }

const SIMPLE_METRICS = [
  { path: 'overall.percentage', label: 'Overall accuracy (%)' },
  { path: 'overall.correct_count', label: 'Questions correct' },
  { path: 'overall.total_questions', label: 'Questions assessed' },
] as const

function readSimpleCondition(raw: string): SimpleScoreCondition | null {
  try {
    const parsed = parseJsonObject(raw, 'Conditions')
    const allowed = ['path', 'operator', 'value']
    if (Object.keys(parsed).some(key => !allowed.includes(key))) return null
    if (!SIMPLE_METRICS.some(item => item.path === parsed.path)) return null
    if (!['lt', 'lte', 'gt', 'gte'].includes(String(parsed.operator))) return null
    if (typeof parsed.value !== 'number' || !Number.isFinite(parsed.value)) return null
    return parsed as SimpleScoreCondition
  } catch { return null }
}

function conditionDescription(raw: unknown): string {
  const condition = readSimpleCondition(formatJson(raw))
  if (!condition) return Object.keys((raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {}).length === 0
    ? 'Applies to every eligible assessment (no condition)'
    : 'Advanced conditions — open Edit to review'
  const label = SIMPLE_METRICS.find(metric => metric.path === condition.path)?.label || 'Score'
  const verb = ({lt:'below', lte:'at or below', gt:'above', gte:'at or above'} as const)[condition.operator]
  return `${label} is ${verb} ${condition.value}${condition.path === 'overall.percentage' ? '%' : ''}`
}

export const ActionPlansPage: React.FC = () => {
  const navigate = useNavigate()
  const [view, setView] = useState<RecommendationWorkspace>('rules')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [plans, setPlans] = useState<ActionPlan[]>([])
  const [rules, setRules] = useState<RecommendationRule[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<(ActionPlan & { items: ActionPlanItem[] }) | null>(null)
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null)
  const [selectedRule, setSelectedRule] = useState<(RecommendationRule & { actionPlans: RecommendationRuleActionPlan[] }) | null>(null)
  const [rulePlans, setRulePlans] = useState<RecommendationRuleActionPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [toast, setToast] = useState<Toast>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [planDraft, setPlanDraft] = useState(emptyPlanDraft)
  const [showPlanForm, setShowPlanForm] = useState(false)
  const [editingPlan, setEditingPlan] = useState(false)
  const [savingPlan, setSavingPlan] = useState(false)

  const [itemDraft, setItemDraft] = useState(emptyItemDraft)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [showItemForm, setShowItemForm] = useState(false)
  const [savingItem, setSavingItem] = useState(false)

  const [ruleDraft, setRuleDraft] = useState(emptyRuleDraft)
  const [showRuleForm, setShowRuleForm] = useState(false)
  const [advancedConditions, setAdvancedConditions] = useState(false)
  const [editingRule, setEditingRule] = useState(false)
  const [savingRule, setSavingRule] = useState(false)
  const [savingRulePlans, setSavingRulePlans] = useState(false)
  const [selectedRulePlanIds, setSelectedRulePlanIds] = useState<string[]>([])

  const availablePlans = useMemo(() => plans.filter(plan => plan.isActive || selectedRulePlanIds.includes(plan.id)), [plans, selectedRulePlanIds])
  const filteredRules = useMemo(() => rules.filter(rule => {
    const text = `${rule.name} ${rule.code || ''} ${rule.description || ''}`.toLowerCase()
    return text.includes(search.toLowerCase()) && (statusFilter === 'all' || (statusFilter === 'active') === rule.isActive)
  }), [rules, search, statusFilter])
  const filteredPlans = useMemo(() => plans.filter(plan => {
    const text = `${plan.name} ${plan.code || ''} ${plan.description || ''}`.toLowerCase()
    return text.includes(search.toLowerCase()) && (statusFilter === 'all' || (statusFilter === 'active') === plan.isActive)
  }), [plans, search, statusFilter])
  const rulePlanChanged = selectedRule !== null && selectedRulePlanIds.join('|') !== [...rulePlans].sort((a,b) => a.displayOrder - b.displayOrder).map(link => link.actionPlanId).join('|')
  const hasSavedPlanAssignment = rulePlans.some(link => plans.some(plan => plan.id === link.actionPlanId && plan.isActive))
  const selectedRuleNeedsPlan = Boolean(selectedRule?.isActive && !hasSavedPlanAssignment)

  const ruleDraftChanged = showRuleForm && JSON.stringify(ruleDraft) !== JSON.stringify(editingRule && selectedRule ? {
    name: selectedRule.name, code: selectedRule.code || '', description: selectedRule.description || '', priority: String(selectedRule.priority), isActive: selectedRule.isActive, conditions: formatJson(selectedRule.conditions), metadata: formatJson(selectedRule.metadata),
  } : emptyRuleDraft)
  const planDraftChanged = showPlanForm && JSON.stringify(planDraft) !== JSON.stringify(editingPlan && selectedPlan ? {
    name: selectedPlan.name, code: selectedPlan.code || '', description: selectedPlan.description || '', isActive: selectedPlan.isActive,
  } : emptyPlanDraft)
  const itemDraftChanged = showItemForm && JSON.stringify(itemDraft) !== JSON.stringify(editingItemId && selectedPlan ? (() => { const item = selectedPlan.items.find(item => item.id === editingItemId); return item ? {itemType: item.itemType, title: item.title, description: item.description || '', isRequired: item.isRequired, isActive: item.isActive, payload: formatJson(item.payload)} : emptyItemDraft })() : emptyItemDraft)
  function confirmDiscard(): boolean {
    if (!(ruleDraftChanged || planDraftChanged || itemDraftChanged || rulePlanChanged)) return true
    return window.confirm('You have unsaved changes. Discard them and continue?')
  }
  function chooseRule(id: string | null) {
    if (!confirmDiscard()) return
    setShowRuleForm(false); setShowPlanForm(false); setShowItemForm(false); setSelectedRuleId(id)
  }
  function choosePlan(id: string | null) {
    if (!confirmDiscard()) return
    setShowRuleForm(false); setShowPlanForm(false); setShowItemForm(false); setSelectedPlanId(id)
  }
  function changeView(next: RecommendationWorkspace) {
    if (view === next || !confirmDiscard()) return
    setView(next); setSearch(''); setStatusFilter('all'); setShowAdvanced(false)
    setShowRuleForm(false); setShowPlanForm(false); setShowItemForm(false)
  }
  function cancelEditor(kind: 'rule' | 'plan' | 'item') {
    const dirty = kind === 'rule' ? ruleDraftChanged : kind === 'plan' ? planDraftChanged : itemDraftChanged
    if (dirty && !window.confirm('Discard your unsaved edits?')) return
    if (kind === 'rule') { setShowRuleForm(false); if (!editingRule) setSelectedRuleId(rules[0]?.id || null) }
    if (kind === 'plan') { setShowPlanForm(false); if (!editingPlan) setSelectedPlanId(plans[0]?.id || null) }
    if (kind === 'item') setShowItemForm(false)
  }
  const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
  const labelClass = 'mb-1.5 block text-xs font-bold text-slate-600'
  const secondaryButton = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50'
  const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50'


  useEffect(() => {
    void loadAll()
  }, [])

  useEffect(() => {
    if (selectedPlanId) void loadPlan(selectedPlanId)
    else setSelectedPlan(null)
  }, [selectedPlanId])

  useEffect(() => {
    if (selectedRuleId) void loadRule(selectedRuleId)
    else {
      setSelectedRule(null)
      setRulePlans([])
      setSelectedRulePlanIds([])
    }
  }, [selectedRuleId])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(timer)
  }, [toast])

  async function loadAll() {
    setLoading(true)
    setErrorMessage(null)
    try {
      const [planData, ruleData] = await Promise.all([
        actionPlanService.fetchPlans(true),
        recommendationRuleService.fetchRules(true),
      ])
      setPlans(planData)
      setRules(ruleData)
      setSelectedPlanId((current) => current && planData.some((p) => p.id === current) ? current : planData[0]?.id || null)
      setSelectedRuleId((current) => current && ruleData.some((r) => r.id === current) ? current : ruleData[0]?.id || null)
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to load learning plans.')
    } finally {
      setLoading(false)
    }
  }

  async function loadPlan(planId: string) {
    setLoadingDetail(true)
    try {
      const data = await actionPlanService.fetchPlan(planId)
      setSelectedPlan(data)
      if (data) setPlanDraft({
        name: data.name,
        code: data.code || '',
        description: data.description || '',
        isActive: data.isActive,
      })
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to load the action plan.')
    } finally {
      setLoadingDetail(false)
    }
  }

  async function loadRule(ruleId: string) {
    setLoadingDetail(true)
    try {
      const data = await recommendationRuleService.fetchRule(ruleId)
      const links = await recommendationRuleService.fetchRuleActionPlans(ruleId)
      setSelectedRule(data)
      setRulePlans(links)
      setSelectedRulePlanIds(links.sort((a, b) => a.displayOrder - b.displayOrder).map((link) => link.actionPlanId))
      if (data) setRuleDraft({
        name: data.name,
        code: data.code || '',
        description: data.description || '',
        priority: String(data.priority),
        isActive: data.isActive,
        conditions: formatJson(data.conditions),
        metadata: formatJson(data.metadata),
      })
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to load the recommendation rule.')
    } finally {
      setLoadingDetail(false)
    }
  }

  function startCreatePlan() {
    if (!confirmDiscard()) return
    setPlanDraft(emptyPlanDraft)
    setEditingPlan(false)
    setShowPlanForm(true)
    setSelectedPlanId(null)
    setSelectedPlan(null)
  }

  function startEditPlan() {
    if (!selectedPlan) return
    setPlanDraft({
      name: selectedPlan.name,
      code: selectedPlan.code || '',
      description: selectedPlan.description || '',
      isActive: selectedPlan.isActive,
    })
    setEditingPlan(true)
    setShowPlanForm(true)
  }

  async function savePlan() {
    if (!planDraft.name.trim()) {
      setErrorMessage('Action plan name is required.')
      return
    }
    setSavingPlan(true)
    setErrorMessage(null)
    try {
      if (editingPlan && selectedPlan) {
        const updated = await actionPlanService.updatePlan(selectedPlan.id, planDraft)
        setPlans((current) => current.map((p) => p.id === updated.id ? updated : p))
        setToast({ type: 'success', message: 'Action plan updated.' })
        setShowPlanForm(false)
        await loadPlan(updated.id)
      } else {
        const created = await actionPlanService.createPlan(planDraft)
        setPlans((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)))
        setSelectedPlanId(created.id)
        setShowPlanForm(false)
        setToast({ type: 'success', message: 'Action plan created.' })
      }
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to save the action plan.')
    } finally {
      setSavingPlan(false)
    }
  }

  async function deletePlan() {
    if (!selectedPlan) return
    if (!window.confirm(`Delete "${selectedPlan.name}"? This cannot be undone.`)) return
    try {
      await actionPlanService.deletePlan(selectedPlan.id)
      setToast({ type: 'success', message: 'Action plan deleted.' })
      await loadAll()
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to delete the action plan.')
    }
  }

  function startAddItem() {
    setItemDraft(emptyItemDraft)
    setEditingItemId(null)
    setShowItemForm(true)
  }

  function startEditItem(item: ActionPlanItem) {
    setEditingItemId(item.id)
    setItemDraft({
      itemType: item.itemType,
      title: item.title,
      description: item.description || '',
      isRequired: item.isRequired,
      isActive: item.isActive,
      payload: formatJson(item.payload),
    })
    setShowItemForm(true)
  }

  async function saveItem() {
    if (!selectedPlan) return
    if (!itemDraft.title.trim() || !itemDraft.itemType.trim()) {
      setErrorMessage('Item type and title are required.')
      return
    }
    setSavingItem(true)
    setErrorMessage(null)
    try {
      const payload = parseJsonObject(itemDraft.payload, 'Item payload')
      if (editingItemId) {
        await actionPlanService.updateItem(editingItemId, {
          itemType: itemDraft.itemType,
          title: itemDraft.title,
          description: itemDraft.description || null,
          isRequired: itemDraft.isRequired,
          isActive: itemDraft.isActive,
          payload,
        })
        setToast({ type: 'success', message: 'Action-plan item updated.' })
      } else {
        await actionPlanService.createItem({
          actionPlanId: selectedPlan.id,
          itemType: itemDraft.itemType,
          title: itemDraft.title,
          description: itemDraft.description || undefined,
          displayOrder: selectedPlan.items.length,
          isRequired: itemDraft.isRequired,
          isActive: itemDraft.isActive,
          payload,
        })
        setToast({ type: 'success', message: 'Action-plan item added.' })
      }
      setShowItemForm(false)
      await loadPlan(selectedPlan.id)
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to save the action-plan item.')
    } finally {
      setSavingItem(false)
    }
  }

  async function deleteItem(item: ActionPlanItem) {
    if (!selectedPlan) return
    if (!window.confirm(`Delete "${item.title}"?`)) return
    try {
      await actionPlanService.deleteItem(item.id)
      setToast({ type: 'success', message: 'Action-plan item deleted.' })
      await loadPlan(selectedPlan.id)
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to delete the item.')
    }
  }

  async function moveItem(item: ActionPlanItem, direction: 'up' | 'down') {
    if (!selectedPlan) return
    const items = [...selectedPlan.items].sort((a, b) => a.displayOrder - b.displayOrder)
    const index = items.findIndex((candidate) => candidate.id === item.id)
    const target = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || target < 0 || target >= items.length) return
    const ids = items.map((candidate) => candidate.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    try {
      await actionPlanService.reorderItems(selectedPlan.id, ids)
      await loadPlan(selectedPlan.id)
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to reorder action-plan items.')
    }
  }

  function startCreateRule() {
    if (!confirmDiscard()) return
    setRuleDraft({...emptyRuleDraft, conditions: formatJson({path:'overall.percentage', operator:'lt', value:60})})
    setAdvancedConditions(false)
    setEditingRule(false)
    setShowRuleForm(true)
    setSelectedRuleId(null)
    setSelectedRule(null)
    setSelectedRulePlanIds([])
  }

  function startEditRule() {
    if (!selectedRule) return
    setAdvancedConditions(readSimpleCondition(formatJson(selectedRule.conditions)) === null)
    setRuleDraft({
      name: selectedRule.name,
      code: selectedRule.code || '',
      description: selectedRule.description || '',
      priority: String(selectedRule.priority),
      isActive: selectedRule.isActive,
      conditions: formatJson(selectedRule.conditions),
      metadata: formatJson(selectedRule.metadata),
    })
    setEditingRule(true)
    setShowRuleForm(true)
  }

  async function saveRule() {
    if (!ruleDraft.name.trim()) {
      setErrorMessage('Recommendation rule name is required.')
      return
    }
    setSavingRule(true)
    setErrorMessage(null)
    try {
      const conditions = parseJsonObject(ruleDraft.conditions, 'Conditions')
      const metadata = parseJsonObject(ruleDraft.metadata, 'Metadata')
      const validationError = validateRecommendationConditions(conditions)
      if (Object.keys(conditions).length === 0) throw new Error('Choose a matching condition. A rule without conditions could recommend this plan to everyone.')
      if (readSimpleCondition(formatJson(conditions))) {
        const simple = readSimpleCondition(formatJson(conditions))!
        if (simple.value < 0 || (simple.path === 'overall.percentage' && simple.value > 100) || (simple.path !== 'overall.percentage' && !Number.isInteger(simple.value))) throw new Error('Enter a valid score or question count for the selected measure.')
      }
      if (validationError) throw new Error(validationError)
      const priority = Number(ruleDraft.priority)
      if (!Number.isSafeInteger(priority)) throw new Error('Priority must be a whole number.')

      if (editingRule && selectedRule) {
        const updated = await recommendationRuleService.updateRule(selectedRule.id, {
          name: ruleDraft.name,
          code: ruleDraft.code || null,
          description: ruleDraft.description || null,
          priority,
          isActive: ruleDraft.isActive,
          conditions,
          metadata,
        })
        setRules((current) => current.map((r) => r.id === updated.id ? updated : r))
        setSelectedRule((current) => current ? { ...current, ...updated } : current)
        setToast({ type: 'success', message: 'Rule saved. Review the attached plans below before using it.' })
        setShowRuleForm(false)
      } else {
        const created = await recommendationRuleService.createRule({
          name: ruleDraft.name,
          code: ruleDraft.code || undefined,
          description: ruleDraft.description || undefined,
          priority,
          isActive: ruleDraft.isActive,
          conditions,
          metadata,
        })
        setRules((current) => [...current, created].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name)))
        setSelectedRuleId(created.id)
        setShowRuleForm(false)
        setToast({ type: 'success', message: 'Rule saved. Next, attach a learning plan and select Save assignments.' })
      }
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to save the recommendation rule.')
    } finally {
      setSavingRule(false)
    }
  }

  async function deleteRule() {
    if (!selectedRule) return
    if (!window.confirm(`Delete "${selectedRule.name}"?`)) return
    try {
      await recommendationRuleService.deleteRule(selectedRule.id)
      setToast({ type: 'success', message: 'Recommendation rule deleted.' })
      await loadAll()
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to delete the recommendation rule.')
    }
  }

  async function saveRulePlans() {
    if (!selectedRule) return
    setSavingRulePlans(true)
    setErrorMessage(null)
    try {
      await recommendationRuleService.setRuleActionPlans(selectedRule.id, selectedRulePlanIds)
      const links = await recommendationRuleService.fetchRuleActionPlans(selectedRule.id)
      setRulePlans(links)
      setSelectedRulePlanIds([...links].sort((a,b) => a.displayOrder - b.displayOrder).map(link => link.actionPlanId))
      setToast({ type: 'success', message: 'Rule action plans updated.' })
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to update rule action plans.')
    } finally {
      setSavingRulePlans(false)
    }
  }

  async function moveRulePlan(index: number, direction: 'up' | 'down') {
    if (!selectedRule) return
    const ids = [...selectedRulePlanIds]
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    setSelectedRulePlanIds(ids)
  }

  return (
    <AdminLayout title="Learning Plans" subtitle="Create guidance and choose when students should receive it." actions={
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { if (confirmDiscard()) void loadAll() }} disabled={loading} className={secondaryButton}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
      </div>
    }>
      <div className="space-y-5 p-4 md:p-6">
        <RecommendationHero onAction={() => { if (confirmDiscard()) navigate('/admin/assessments') }} actionLabel="Open assessments" />
        <section aria-label="Learning plan setup steps" className="rounded-2xl border border-blue-100 bg-blue-50/50 px-4 py-4 sm:px-5">
          <h2 className="text-sm font-bold text-slate-900">Set up recommendations in three steps</h2>
          <ol className="mt-2 grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
            <li><span className="mr-1 font-bold text-blue-800">1.</span> Create a learning plan with practical next steps.</li>
            <li><span className="mr-1 font-bold text-blue-800">2.</span> Choose when the plan should be recommended.</li>
            <li><span className="mr-1 font-bold text-blue-800">3.</span> Attach the plan to the rule and save the assignment.</li>
          </ol>
          <p className="mt-2 text-xs leading-5 text-slate-600">A saved rule alone does not assign a learning plan. Changes here do not alter completed students’ scores or reports.</p>
        </section>
        <RecommendationStats stats={[
          {label: 'Rules', value: rules.length, note: 'Recommendation rules'},
          {label: 'Active rules', value: rules.filter(rule => rule.isActive).length, note: 'Plan assignments may still be needed'},
          {label: 'Action plans', value: plans.length, note: 'Learning guidance templates'},
          {label: 'Active plans', value: plans.filter(plan => plan.isActive).length, note: 'Ready to assign'},
        ]}/>
        <RecommendationTabs active={view} onChange={changeView} ruleCount={rules.length} planCount={plans.length}/>
        {toast && <div role="status" className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${toast.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}><CheckCircle2 className="h-4 w-4"/>{toast.message}</div>}
        {errorMessage && <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><span><AlertCircle className="mr-2 inline h-4 w-4"/>{errorMessage}</span><button type="button" aria-label="Dismiss error" onClick={() => setErrorMessage(null)}><X className="h-4 w-4"/></button></div>}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.65fr)]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
              <div><h2 className="text-base font-bold text-slate-900">{view === 'rules' ? 'Rule library' : 'Action plan library'}</h2><p className="mt-1 text-xs text-slate-500">Select an entry to view and edit its details.</p></div>
              <button type="button" onClick={view === 'rules' ? startCreateRule : startCreatePlan} className={primaryButton}><Plus className="h-4 w-4"/>{view === 'rules' ? 'New rule' : 'New plan'}</button>
            </div>
            <RecommendationSearch value={search} onChange={setSearch} filter={statusFilter} onFilter={setStatusFilter} label={view === 'rules' ? 'rules' : 'plans'} count={view === 'rules' ? filteredRules.length : filteredPlans.length} total={view === 'rules' ? rules.length : plans.length}/>
            {loading ? <div className="p-8 text-center text-sm text-slate-500">Loading recommendations…</div> : view === 'rules' ? (
              filteredRules.length === 0 ? <RecommendationEmpty title="No matching rules" description="Create a rule or change your search and status filters."/> :
              <div className="max-h-[660px] divide-y divide-slate-100 overflow-y-auto">{filteredRules.map(rule => <button key={rule.id} type="button" onClick={() => chooseRule(rule.id)} aria-pressed={selectedRuleId === rule.id} className={`w-full p-4 text-left transition hover:bg-slate-50 ${selectedRuleId === rule.id ? 'bg-blue-50/80 ring-inset ring-2 ring-blue-200' : ''}`}>
                <div className="flex items-start justify-between gap-2"><span className="min-w-0 break-words text-sm font-bold text-slate-900">{rule.name}</span><RecommendationBadge active={rule.isActive}/></div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{rule.description || 'No description'}</p><div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500"><span>Priority {rule.priority}</span>{rule.code && <span className="font-mono">· {rule.code}</span>}{Object.keys(rule.conditions || {}).length === 0 && <span className="font-semibold text-amber-700">· Match all</span>}</div>
              </button>)}</div>
            ) : filteredPlans.length === 0 ? <RecommendationEmpty title="No matching plans" description="Create a plan or adjust your filters."/> : <div className="max-h-[660px] divide-y divide-slate-100 overflow-y-auto">{filteredPlans.map(plan => <button key={plan.id} type="button" onClick={() => choosePlan(plan.id)} aria-pressed={selectedPlanId === plan.id} className={`w-full p-4 text-left transition hover:bg-slate-50 ${selectedPlanId === plan.id ? 'bg-blue-50/80 ring-inset ring-2 ring-blue-200' : ''}`}><div className="flex items-start justify-between gap-2"><span className="min-w-0 break-words text-sm font-bold text-slate-900">{plan.name}</span><RecommendationBadge active={plan.isActive}/></div><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{plan.description || 'No description'}</p>{plan.code && <p className="mt-2 font-mono text-xs text-slate-400">{plan.code}</p>}</button>)}</div>}
          </section>

          <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {loadingDetail && <div className="border-b border-slate-100 bg-blue-50 px-5 py-2 text-xs text-blue-700">Loading details…</div>}
            {view === 'rules' ? <>
              {showRuleForm ? <div className="space-y-5 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">{editingRule ? 'Edit recommendation rule' : 'Create recommendation rule'}</h2><p className="mt-1 text-sm text-slate-500">Choose when this guidance should be recommended. No technical setup is needed for a basic score condition.</p></div><button type="button" aria-label="Close rule editor" onClick={() => cancelEditor('rule')} className={secondaryButton}><X className="h-4 w-4"/></button></div>
                <div className="grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2"><span className={labelClass}>Rule name *</span><input value={ruleDraft.name} onChange={e => setRuleDraft({...ruleDraft,name:e.target.value})} className={inputClass} placeholder="e.g. Foundational support"/></label><label><span className={labelClass}>Reference code</span><input value={ruleDraft.code} onChange={e => setRuleDraft({...ruleDraft,code:e.target.value})} className={inputClass} placeholder="Optional"/></label><label><span className={labelClass}>Priority (integer)</span><input type="number" step="1" value={ruleDraft.priority} onChange={e => setRuleDraft({...ruleDraft,priority:e.target.value})} className={inputClass}/></label></div>
                <label className="block"><span className={labelClass}>Description</span><textarea value={ruleDraft.description} onChange={e => setRuleDraft({...ruleDraft,description:e.target.value})} rows={3} className={inputClass}/></label>
                <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 space-y-3">
                  <div><h3 className="text-sm font-bold text-slate-900">When should this plan be recommended?</h3><p className="mt-1 text-xs text-slate-600">Choose one condition. The student's saved results are used; this does not change their score.</p></div>
                  {!advancedConditions && readSimpleCondition(ruleDraft.conditions) ? (() => {
                    const current = readSimpleCondition(ruleDraft.conditions)!
                    const change = (patch: Partial<SimpleScoreCondition>) => setRuleDraft(draft => ({...draft, conditions:formatJson({...current,...patch})}))
                    return <div className="grid gap-3 sm:grid-cols-3">
                      <label><span className={labelClass}>Measure</span><select className={inputClass} value={current.path} onChange={e => change({path:e.target.value})}>{SIMPLE_METRICS.map(option => <option key={option.path} value={option.path}>{option.label}</option>)}</select></label>
                      <label><span className={labelClass}>Condition</span><select className={inputClass} value={current.operator} onChange={e => change({operator:e.target.value as SimpleScoreCondition['operator']})}><option value="lt">Below</option><option value="lte">At or below</option><option value="gte">At or above</option><option value="gt">Above</option></select></label>
                      <label><span className={labelClass}>Value</span><input type="number" min="0" max={current.path === 'overall.percentage' ? 100 : undefined} step={current.path === 'overall.percentage' ? '0.1' : '1'} className={inputClass} value={current.value} onChange={e => change({value:Number(e.target.value)})}/></label>
                    </div>
                  })() : <div className="space-y-2"><p className="text-xs text-amber-800">This rule has advanced or empty conditions. They are preserved unless you explicitly replace them.</p><label htmlFor="rule-conditions" className={labelClass}>Advanced matching conditions</label><textarea id="rule-conditions" spellCheck={false} value={ruleDraft.conditions} onChange={e => setRuleDraft({...ruleDraft,conditions:e.target.value})} rows={7} className={`${inputClass} font-mono text-xs leading-6`}/></div>}
                  <button type="button" className="text-xs font-semibold text-blue-800 underline underline-offset-4" onClick={() => { if (advancedConditions) { const simple = readSimpleCondition(ruleDraft.conditions); if (!simple) { if (!window.confirm('Replace the existing advanced condition with a simple overall accuracy condition?')) return; setRuleDraft(draft => ({...draft,conditions:formatJson({path:'overall.percentage',operator:'lt',value:60})})) }} setAdvancedConditions(value => !value) }}>{advancedConditions ? 'Use simple condition' : 'Advanced conditions'}</button>
                  <p className="text-xs text-slate-600">{conditionDescription((() => {try{return parseJsonObject(ruleDraft.conditions,'Conditions')}catch{return {}}})())}</p>
                </div>
                <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-700">Advanced rule settings</summary><textarea value={ruleDraft.metadata} onChange={e => setRuleDraft({...ruleDraft,metadata:e.target.value})} rows={5} className={`${inputClass} mt-3 font-mono text-xs`}/></details>
                <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={ruleDraft.isActive} onChange={e => setRuleDraft({...ruleDraft,isActive:e.target.checked})}/>Rule is active</label>
                <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => cancelEditor('rule')} className={secondaryButton}>Cancel</button><button type="button" onClick={() => void saveRule()} disabled={savingRule || !ruleDraft.name.trim()} className={primaryButton}><Save className="h-4 w-4"/>{savingRule ? 'Saving…' : 'Save rule'}</button></div>
              </div> : selectedRule ? <div className="space-y-5 p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-blue-700">Recommendation rule</p><h2 className="mt-1 text-xl font-bold text-slate-900">{selectedRule.name}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{selectedRule.description || 'No description added.'}</p><div className="mt-3 flex flex-wrap items-center gap-2"><RecommendationBadge active={selectedRule.isActive}/><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Priority {selectedRule.priority}</span>{selectedRule.code && <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-xs text-slate-600">{selectedRule.code}</span>}</div></div><button type="button" onClick={startEditRule} className={secondaryButton}><Edit2 className="h-4 w-4"/>Edit rule</button></div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold text-slate-900">Rule conditions</h3><span className="text-xs text-slate-500">Read-only</span></div>{Object.keys(selectedRule.conditions || {}).length === 0 && <p className="mt-2 text-xs font-semibold text-amber-700">Match-all: this rule has no conditions.</p>}<p className="mt-3 text-sm font-semibold text-slate-800">{conditionDescription(selectedRule.conditions)}</p><details className="mt-3"><summary className="cursor-pointer text-xs font-medium text-slate-500">View technical conditions</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-4 text-xs leading-6 text-slate-100">{formatJson(selectedRule.conditions)}</pre></details></div>
                {selectedRuleNeedsPlan && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><strong>One more step:</strong> This active rule has no saved assignment to an active learning plan. Select a plan below, then choose <strong>Save assignments</strong>. Until then, this rule will not provide a learning plan.</div>}
                <div className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-900">Attached action plans</h3><p className="mt-1 text-xs leading-5 text-slate-500">Choose plans and set their display order. Changes are saved separately.</p></div><span className="text-xs font-semibold text-slate-500">{selectedRulePlanIds.length} selected</span></div>
                  <div className="mt-4 space-y-2">{availablePlans.length === 0 ? <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600"><p>No learning plans are available yet.</p><button type="button" className="mt-2 font-semibold text-blue-800 underline underline-offset-4" onClick={() => changeView('plans')}>Open learning plan library</button></div> : availablePlans.map(plan => <label key={plan.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50"><input type="checkbox" checked={selectedRulePlanIds.includes(plan.id)} onChange={e => setSelectedRulePlanIds(current => e.target.checked ? [...current,plan.id] : current.filter(id => id !== plan.id))}/><span className="min-w-0 flex-1 text-sm font-semibold text-slate-800">{plan.name}</span><RecommendationBadge active={plan.isActive}/></label>)}</div>
                  {selectedRulePlanIds.length > 1 && <div className="mt-4 space-y-2"><p className="text-xs font-bold text-slate-600">Display order</p>{selectedRulePlanIds.map((id,index) => {const plan=plans.find(plan => plan.id === id); return <div key={id} className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 text-sm"><span className="w-5 text-center text-xs text-slate-400">{index+1}</span><span className="min-w-0 flex-1 text-slate-700">{plan?.name || 'Plan unavailable'}</span><button type="button" aria-label={`Move ${plan?.name || 'plan'} up`} disabled={index===0} onClick={() => void moveRulePlan(index,'up')} className="rounded p-1 hover:bg-slate-200 disabled:opacity-30"><ChevronUp className="h-4 w-4"/></button><button type="button" aria-label={`Move ${plan?.name || 'plan'} down`} disabled={index===selectedRulePlanIds.length-1} onClick={() => void moveRulePlan(index,'down')} className="rounded p-1 hover:bg-slate-200 disabled:opacity-30"><ChevronDown className="h-4 w-4"/></button></div>})}</div>}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className={`text-xs font-semibold ${rulePlanChanged ? 'text-amber-700' : 'text-slate-500'}`}>{rulePlanChanged ? 'Unsaved plan assignments' : hasSavedPlanAssignment ? 'Plan assignment saved' : 'No active plan attached'}</span><button type="button" onClick={() => void saveRulePlans()} disabled={savingRulePlans || !rulePlanChanged} className={primaryButton}><Save className="h-4 w-4"/>{savingRulePlans ? 'Saving…' : 'Save assignments'}</button></div>
                </div>
                <div className="border-t border-slate-100 pt-4"><button type="button" onClick={() => setShowAdvanced(value => !value)} aria-expanded={showAdvanced} className={secondaryButton}><Settings2 className="h-4 w-4"/>More tools</button>{showAdvanced && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-4"><p className="mb-3 text-sm text-rose-700">Deleting a rule is permanent. Consider archiving it by editing its active status instead.</p><button type="button" onClick={() => { if (rulePlanChanged && !confirmDiscard()) return; void deleteRule() }} className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-700"><Trash2 className="h-4 w-4"/>Delete rule</button></div>}</div>
              </div> : <RecommendationEmpty title="Select or create a rule" description="Choose a rule from the library to edit conditions and attach action plans."/>}
            </> : <>
              {showPlanForm ? <div className="space-y-5 p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">{editingPlan ? 'Edit action plan' : 'Create action plan'}</h2><p className="mt-1 text-sm text-slate-500">Create a reusable set of student guidance items.</p></div><button type="button" aria-label="Close plan editor" onClick={() => cancelEditor('plan')} className={secondaryButton}><X className="h-4 w-4"/></button></div><label className="block"><span className={labelClass}>Plan name *</span><input value={planDraft.name} onChange={e => setPlanDraft({...planDraft,name:e.target.value})} className={inputClass}/></label><label className="block"><span className={labelClass}>Reference code</span><input value={planDraft.code} onChange={e => setPlanDraft({...planDraft,code:e.target.value})} className={inputClass}/></label><label className="block"><span className={labelClass}>Description</span><textarea rows={4} value={planDraft.description} onChange={e => setPlanDraft({...planDraft,description:e.target.value})} className={inputClass}/></label><label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={planDraft.isActive} onChange={e => setPlanDraft({...planDraft,isActive:e.target.checked})}/>Plan is active</label><div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => cancelEditor('plan')} className={secondaryButton}>Cancel</button><button type="button" onClick={() => void savePlan()} disabled={savingPlan || !planDraft.name.trim()} className={primaryButton}><Save className="h-4 w-4"/>{savingPlan ? 'Saving…' : 'Save plan'}</button></div></div> : selectedPlan ? <div className="space-y-5 p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-blue-700">Action plan</p><h2 className="mt-1 text-xl font-bold text-slate-900">{selectedPlan.name}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{selectedPlan.description || 'No description added.'}</p><div className="mt-3"><RecommendationBadge active={selectedPlan.isActive}/></div></div><button type="button" onClick={startEditPlan} className={secondaryButton}><Edit2 className="h-4 w-4"/>Edit plan</button></div>
                <div className="rounded-xl border border-slate-200"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4"><div><h3 className="text-sm font-bold text-slate-900">Guidance items ({selectedPlan.items.length})</h3><p className="mt-1 text-xs text-slate-500">Reorder items to control their presentation.</p></div><button type="button" onClick={startAddItem} className={primaryButton}><Plus className="h-4 w-4"/>Add item</button></div>
                  {showItemForm && <div className="space-y-3 border-b border-slate-200 bg-blue-50/40 p-4"><div className="flex items-center justify-between"><h4 className="text-sm font-bold text-slate-900">{editingItemId ? 'Edit item' : 'New item'}</h4><button type="button" aria-label="Close item editor" onClick={() => cancelEditor('item')}><X className="h-4 w-4"/></button></div><div className="grid gap-3 sm:grid-cols-2"><label><span className={labelClass}>Item type *</span><input value={itemDraft.itemType} onChange={e => setItemDraft({...itemDraft,itemType:e.target.value})} className={inputClass}/></label><label><span className={labelClass}>Title *</span><input value={itemDraft.title} onChange={e => setItemDraft({...itemDraft,title:e.target.value})} className={inputClass}/></label></div><label className="block"><span className={labelClass}>Description</span><textarea rows={3} value={itemDraft.description} onChange={e => setItemDraft({...itemDraft,description:e.target.value})} className={inputClass}/></label><details><summary className="cursor-pointer text-sm font-semibold text-slate-700">Advanced item settings</summary><textarea rows={5} spellCheck={false} value={itemDraft.payload} onChange={e => setItemDraft({...itemDraft,payload:e.target.value})} className={`${inputClass} mt-2 font-mono text-xs`}/></details><div className="flex flex-wrap gap-5 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={itemDraft.isRequired} onChange={e => setItemDraft({...itemDraft,isRequired:e.target.checked})}/>Required</label><label className="flex items-center gap-2"><input type="checkbox" checked={itemDraft.isActive} onChange={e => setItemDraft({...itemDraft,isActive:e.target.checked})}/>Active</label></div><div className="flex justify-end gap-2"><button type="button" onClick={() => cancelEditor('item')} className={secondaryButton}>Cancel</button><button type="button" onClick={() => void saveItem()} disabled={savingItem || !itemDraft.title.trim() || !itemDraft.itemType.trim()} className={primaryButton}>{savingItem ? 'Saving…' : 'Save item'}</button></div></div>}
                  {selectedPlan.items.length === 0 ? <RecommendationEmpty title="No items in this plan" description="Add a task, resource or follow-up action to guide students."/> : <div className="divide-y divide-slate-100">{[...selectedPlan.items].sort((a,b) => a.displayOrder - b.displayOrder).map((item,index) => <div key={item.id} className="flex items-start gap-3 p-4"><div className="flex flex-col gap-1"><button type="button" disabled={index===0} aria-label={`Move ${item.title} up`} onClick={() => void moveItem(item,'up')} className="rounded p-1 hover:bg-slate-100 disabled:opacity-25"><ChevronUp className="h-4 w-4"/></button><button type="button" disabled={index===selectedPlan.items.length-1} aria-label={`Move ${item.title} down`} onClick={() => void moveItem(item,'down')} className="rounded p-1 hover:bg-slate-100 disabled:opacity-25"><ChevronDown className="h-4 w-4"/></button></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold text-slate-900">{item.title}</span><span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{item.itemType}</span>{item.isRequired && <span className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">Required</span>}{!item.isActive && <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-500">Inactive</span>}</div>{item.description && <p className="mt-2 text-sm leading-5 text-slate-500">{item.description}</p>}</div><div className="flex shrink-0 gap-1"><button type="button" aria-label={`Edit ${item.title}`} onClick={() => startEditItem(item)} className="rounded-lg p-2 hover:bg-slate-100"><Edit2 className="h-4 w-4"/></button><button type="button" aria-label={`Delete ${item.title}`} onClick={() => void deleteItem(item)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4"/></button></div></div>)}</div>}
                </div>
                <div className="border-t border-slate-100 pt-4"><button type="button" onClick={() => setShowAdvanced(value => !value)} aria-expanded={showAdvanced} className={secondaryButton}><Settings2 className="h-4 w-4"/>More tools</button>{showAdvanced && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-4"><p className="mb-3 text-sm text-rose-700">Deleting a plan is permanent. Consider archiving it instead.</p><button type="button" onClick={() => void deletePlan()} className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-700"><Trash2 className="h-4 w-4"/>Delete plan</button></div>}</div>
              </div> : <RecommendationEmpty title="Select or create an action plan" description="Action plans contain ordered items and can be linked to any recommendation rule."/>}
            </>}
          </section>
        </div>
        <p className="text-xs leading-5 text-slate-500">Manage the guidance students receive after an assessment. To review actual student outcomes, open an assessment and choose Results.</p>
      </div>
    </AdminLayout>
  )
}

export default ActionPlansPage
