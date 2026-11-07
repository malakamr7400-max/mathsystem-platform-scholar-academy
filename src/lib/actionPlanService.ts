import { supabase, isSupabaseConfigured } from './supabaseClient'

export interface ActionPlan {
  id: string
  organizationId: string
  name: string
  code?: string
  description?: string
  isActive: boolean
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface ActionPlanItem {
  id: string
  actionPlanId: string
  itemType: string
  title: string
  description?: string
  displayOrder: number
  isRequired: boolean
  isActive: boolean
  payload: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface ActionPlanWithItems extends ActionPlan {
  items: ActionPlanItem[]
}

export interface CreateActionPlanInput {
  name: string
  code?: string
  description?: string
  isActive?: boolean
  metadata?: Record<string, unknown>
}

export interface UpdateActionPlanInput {
  name?: string
  code?: string | null
  description?: string | null
  isActive?: boolean
  metadata?: Record<string, unknown>
}

export interface CreateActionPlanItemInput {
  actionPlanId: string
  itemType: string
  title: string
  description?: string
  displayOrder?: number
  isRequired?: boolean
  isActive?: boolean
  payload?: Record<string, unknown>
}

export interface UpdateActionPlanItemInput {
  itemType?: string
  title?: string
  description?: string | null
  displayOrder?: number
  isRequired?: boolean
  isActive?: boolean
  payload?: Record<string, unknown>
}

export interface RecommendationRule {
  id: string
  organizationId: string
  name: string
  code?: string
  description?: string
  priority: number
  isActive: boolean
  conditions: Record<string, unknown>
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface RecommendationRuleActionPlan {
  recommendationRuleId: string
  actionPlanId: string
  displayOrder: number
  createdAt: string
}

export interface RecommendationRuleWithActionPlans extends RecommendationRule {
  actionPlans: RecommendationRuleActionPlan[]
}

export interface CreateRecommendationRuleInput {
  name: string
  code?: string
  description?: string
  priority?: number
  isActive?: boolean
  conditions?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface UpdateRecommendationRuleInput {
  name?: string
  code?: string | null
  description?: string | null
  priority?: number
  isActive?: boolean
  conditions?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

const mapActionPlan = (row: any): ActionPlan => ({
  id: String(row.id),
  organizationId: String(row.organization_id),
  name: String(row.name),
  code: row.code ?? undefined,
  description: row.description ?? undefined,
  isActive: Boolean(row.is_active),
  metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
})

const mapActionPlanItem = (row: any): ActionPlanItem => ({
  id: String(row.id),
  actionPlanId: String(row.action_plan_id),
  itemType: String(row.item_type),
  title: String(row.title),
  description: row.description ?? undefined,
  displayOrder: Number(row.display_order ?? 0),
  isRequired: Boolean(row.is_required),
  isActive: Boolean(row.is_active),
  payload: row.payload && typeof row.payload === 'object' ? row.payload : {},
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
})

const mapRecommendationRule = (row: any): RecommendationRule => ({
  id: String(row.id),
  organizationId: String(row.organization_id),
  name: String(row.name),
  code: row.code ?? undefined,
  description: row.description ?? undefined,
  priority: Number(row.priority ?? 0),
  isActive: Boolean(row.is_active),
  conditions:
    row.conditions && typeof row.conditions === 'object' ? row.conditions : {},
  metadata:
    row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
})

const mapRuleActionPlan = (row: any): RecommendationRuleActionPlan => ({
  recommendationRuleId: String(row.recommendation_rule_id),
  actionPlanId: String(row.action_plan_id),
  displayOrder: Number(row.display_order ?? 0),
  createdAt: String(row.created_at),
})

async function getCurrentOrganizationId(): Promise<string> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured.')
  }

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError

  const userId = userData.user?.id
  if (!userId) {
    throw new Error('You must be signed in to manage action plans and recommendation rules.')
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  if (!profile?.organization_id) {
    throw new Error('Your account is not associated with an organization.')
  }

  return String(profile.organization_id)
}

function requireName(value: string, label: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required.`)
  return normalized
}

function normalizeJsonObject(
  value: Record<string, unknown> | undefined
): Record<string, unknown> {
  return value && typeof value === 'object' ? value : {}
}

export const actionPlanService = {
  async fetchPlans(includeInactive = false): Promise<ActionPlan[]> {
    if (!isSupabaseConfigured) return []

    let query = supabase
      .from('action_plans')
      .select('*')
      .order('name', { ascending: true })

    if (!includeInactive) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapActionPlan)
  },

  async fetchPlan(planId: string): Promise<ActionPlanWithItems | null> {
    if (!isSupabaseConfigured) return null

    const { data, error } = await supabase
      .from('action_plans')
      .select('*')
      .eq('id', planId)
      .maybeSingle()

    if (error) throw error
    if (!data) return null

    const { data: itemRows, error: itemError } = await supabase
      .from('action_plan_items')
      .select('*')
      .eq('action_plan_id', planId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (itemError) throw itemError

    return {
      ...mapActionPlan(data),
      items: (itemRows || []).map(mapActionPlanItem),
    }
  },

  async createPlan(input: CreateActionPlanInput): Promise<ActionPlan> {
    const organizationId = await getCurrentOrganizationId()
    const name = requireName(input.name, 'Action plan name')

    const { data, error } = await supabase
      .from('action_plans')
      .insert({
        organization_id: organizationId,
        name,
        code: input.code?.trim() || null,
        description: input.description?.trim() || null,
        is_active: input.isActive ?? true,
        metadata: normalizeJsonObject(input.metadata),
      })
      .select('*')
      .single()

    if (error) throw error
    return mapActionPlan(data)
  },

  async updatePlan(
    planId: string,
    updates: UpdateActionPlanInput
  ): Promise<ActionPlan> {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')

    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (updates.name !== undefined) {
      payload.name = requireName(updates.name, 'Action plan name')
    }
    if (updates.code !== undefined) payload.code = updates.code?.trim() || null
    if (updates.description !== undefined) {
      payload.description = updates.description?.trim() || null
    }
    if (updates.isActive !== undefined) payload.is_active = updates.isActive
    if (updates.metadata !== undefined) {
      payload.metadata = normalizeJsonObject(updates.metadata)
    }

    const { data, error } = await supabase
      .from('action_plans')
      .update(payload)
      .eq('id', planId)
      .select('*')
      .single()

    if (error) throw error
    return mapActionPlan(data)
  },

  async deletePlan(planId: string): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')

    const { error } = await supabase
      .from('action_plans')
      .delete()
      .eq('id', planId)

    if (error) throw error
  },

  async fetchItems(planId: string): Promise<ActionPlanItem[]> {
    if (!isSupabaseConfigured) return []

    const { data, error } = await supabase
      .from('action_plan_items')
      .select('*')
      .eq('action_plan_id', planId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) throw error
    return (data || []).map(mapActionPlanItem)
  },

  async createItem(input: CreateActionPlanItemInput): Promise<ActionPlanItem> {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')

    const itemType = requireName(input.itemType, 'Action item type')
    const title = requireName(input.title, 'Action item title')

    const { data, error } = await supabase
      .from('action_plan_items')
      .insert({
        action_plan_id: input.actionPlanId,
        item_type: itemType,
        title,
        description: input.description?.trim() || null,
        display_order: input.displayOrder ?? 0,
        is_required: input.isRequired ?? false,
        is_active: input.isActive ?? true,
        payload: normalizeJsonObject(input.payload),
      })
      .select('*')
      .single()

    if (error) throw error
    return mapActionPlanItem(data)
  },

  async updateItem(
    itemId: string,
    updates: UpdateActionPlanItemInput
  ): Promise<ActionPlanItem> {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')

    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (updates.itemType !== undefined) {
      payload.item_type = requireName(updates.itemType, 'Action item type')
    }
    if (updates.title !== undefined) {
      payload.title = requireName(updates.title, 'Action item title')
    }
    if (updates.description !== undefined) {
      payload.description = updates.description?.trim() || null
    }
    if (updates.displayOrder !== undefined) payload.display_order = updates.displayOrder
    if (updates.isRequired !== undefined) payload.is_required = updates.isRequired
    if (updates.isActive !== undefined) payload.is_active = updates.isActive
    if (updates.payload !== undefined) {
      payload.payload = normalizeJsonObject(updates.payload)
    }

    const { data, error } = await supabase
      .from('action_plan_items')
      .update(payload)
      .eq('id', itemId)
      .select('*')
      .single()

    if (error) throw error
    return mapActionPlanItem(data)
  },

  async deleteItem(itemId: string): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')

    const { error } = await supabase
      .from('action_plan_items')
      .delete()
      .eq('id', itemId)

    if (error) throw error
  },

  async reorderItems(planId: string, itemIds: string[]): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')

    const ids = Array.from(new Set(itemIds.map(String).filter(Boolean)))
    for (let index = 0; index < ids.length; index += 1) {
      const { error } = await supabase
        .from('action_plan_items')
        .update({
          display_order: index,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ids[index])
        .eq('action_plan_id', planId)

      if (error) throw error
    }
  },
}

export const recommendationRuleService = {
  async fetchRules(includeInactive = false): Promise<RecommendationRule[]> {
    if (!isSupabaseConfigured) return []

    let query = supabase
      .from('recommendation_rules')
      .select('*')
      .order('priority', { ascending: false })
      .order('name', { ascending: true })

    if (!includeInactive) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapRecommendationRule)
  },

  async fetchRule(
    ruleId: string
  ): Promise<RecommendationRuleWithActionPlans | null> {
    if (!isSupabaseConfigured) return null

    const { data, error } = await supabase
      .from('recommendation_rules')
      .select('*')
      .eq('id', ruleId)
      .maybeSingle()

    if (error) throw error
    if (!data) return null

    const { data: links, error: linkError } = await supabase
      .from('recommendation_rule_action_plans')
      .select('*')
      .eq('recommendation_rule_id', ruleId)
      .order('display_order', { ascending: true })

    if (linkError) throw linkError

    return {
      ...mapRecommendationRule(data),
      actionPlans: (links || []).map(mapRuleActionPlan),
    }
  },

  async createRule(input: CreateRecommendationRuleInput): Promise<RecommendationRule> {
    const organizationId = await getCurrentOrganizationId()
    const name = requireName(input.name, 'Recommendation rule name')

    const { data, error } = await supabase
      .from('recommendation_rules')
      .insert({
        organization_id: organizationId,
        name,
        code: input.code?.trim() || null,
        description: input.description?.trim() || null,
        priority: input.priority ?? 0,
        is_active: input.isActive ?? true,
        conditions: normalizeJsonObject(input.conditions),
        metadata: normalizeJsonObject(input.metadata),
      })
      .select('*')
      .single()

    if (error) throw error
    return mapRecommendationRule(data)
  },

  async updateRule(
    ruleId: string,
    updates: UpdateRecommendationRuleInput
  ): Promise<RecommendationRule> {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')

    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (updates.name !== undefined) {
      payload.name = requireName(updates.name, 'Recommendation rule name')
    }
    if (updates.code !== undefined) payload.code = updates.code?.trim() || null
    if (updates.description !== undefined) {
      payload.description = updates.description?.trim() || null
    }
    if (updates.priority !== undefined) payload.priority = updates.priority
    if (updates.isActive !== undefined) payload.is_active = updates.isActive
    if (updates.conditions !== undefined) {
      payload.conditions = normalizeJsonObject(updates.conditions)
    }
    if (updates.metadata !== undefined) {
      payload.metadata = normalizeJsonObject(updates.metadata)
    }

    const { data, error } = await supabase
      .from('recommendation_rules')
      .update(payload)
      .eq('id', ruleId)
      .select('*')
      .single()

    if (error) throw error
    return mapRecommendationRule(data)
  },

  async deleteRule(ruleId: string): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')

    const { error } = await supabase
      .from('recommendation_rules')
      .delete()
      .eq('id', ruleId)

    if (error) throw error
  },

  async fetchRuleActionPlans(
    ruleId: string
  ): Promise<RecommendationRuleActionPlan[]> {
    if (!isSupabaseConfigured) return []

    const { data, error } = await supabase
      .from('recommendation_rule_action_plans')
      .select('*')
      .eq('recommendation_rule_id', ruleId)
      .order('display_order', { ascending: true })

    if (error) throw error
    return (data || []).map(mapRuleActionPlan)
  },

  async setRuleActionPlans(
    ruleId: string,
    actionPlanIds: string[]
  ): Promise<RecommendationRuleActionPlan[]> {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')

    const ids = Array.from(new Set(actionPlanIds.map(String).filter(Boolean)))

    const { error: deleteError } = await supabase
      .from('recommendation_rule_action_plans')
      .delete()
      .eq('recommendation_rule_id', ruleId)

    if (deleteError) throw deleteError

    if (ids.length === 0) return []

    const rows = ids.map((actionPlanId, index) => ({
      recommendation_rule_id: ruleId,
      action_plan_id: actionPlanId,
      display_order: index,
    }))

    const { data, error } = await supabase
      .from('recommendation_rule_action_plans')
      .insert(rows)
      .select('*')

    if (error) throw error

    return (data || [])
      .map(mapRuleActionPlan)
      .sort(
        (a: RecommendationRuleActionPlan, b: RecommendationRuleActionPlan) =>
          a.displayOrder - b.displayOrder
      )
  },

  async addActionPlanToRule(
    ruleId: string,
    actionPlanId: string,
    displayOrder = 0
  ): Promise<RecommendationRuleActionPlan> {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')

    const { data, error } = await supabase
      .from('recommendation_rule_action_plans')
      .insert({
        recommendation_rule_id: ruleId,
        action_plan_id: actionPlanId,
        display_order: displayOrder,
      })
      .select('*')
      .single()

    if (error) throw error
    return mapRuleActionPlan(data)
  },

  async removeActionPlanFromRule(
    ruleId: string,
    actionPlanId: string
  ): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')

    const { error } = await supabase
      .from('recommendation_rule_action_plans')
      .delete()
      .eq('recommendation_rule_id', ruleId)
      .eq('action_plan_id', actionPlanId)

    if (error) throw error
  },

  async reorderRuleActionPlans(
    ruleId: string,
    actionPlanIds: string[]
  ): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')

    const ids = Array.from(new Set(actionPlanIds.map(String).filter(Boolean)))
    for (let index = 0; index < ids.length; index += 1) {
      const { error } = await supabase
        .from('recommendation_rule_action_plans')
        .update({ display_order: index })
        .eq('recommendation_rule_id', ruleId)
        .eq('action_plan_id', ids[index])

      if (error) throw error
    }
  },
}
