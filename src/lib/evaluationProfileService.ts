import { supabase, isSupabaseConfigured } from './supabaseClient'

export type EvaluationScoringMethod =
  | 'percentage'
  | 'points'
  | 'weighted_percentage'

export interface EvaluationProfile {
  id: string
  organizationId: string
  name: string
  code?: string
  description?: string
  isActive: boolean
  scoringMethod: EvaluationScoringMethod
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface EvaluationProfileLevel {
  id: string
  evaluationProfileId: string
  name: string
  code?: string
  description?: string
  minValue: number
  maxValue: number
  displayOrder: number
  isActive: boolean
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface EvaluationProfileRule {
  id: string
  evaluationProfileId: string
  ruleKey: string
  ruleValue: unknown
  description?: string
  createdAt: string
  updatedAt: string
}

export interface EvaluationProfileWithConfiguration
  extends EvaluationProfile {
  levels: EvaluationProfileLevel[]
  rules: EvaluationProfileRule[]
}

const mapProfile = (row: any): EvaluationProfile => ({
  id: String(row.id),
  organizationId: String(row.organization_id),
  name: String(row.name),
  code: row.code ?? undefined,
  description: row.description ?? undefined,
  isActive: Boolean(row.is_active),
  scoringMethod: row.scoring_method as EvaluationScoringMethod,
  metadata:
    row.metadata && typeof row.metadata === 'object'
      ? row.metadata
      : {},
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
})

const mapLevel = (row: any): EvaluationProfileLevel => ({
  id: String(row.id),
  evaluationProfileId: String(row.evaluation_profile_id),
  name: String(row.name),
  code: row.code ?? undefined,
  description: row.description ?? undefined,
  minValue: Number(row.min_value),
  maxValue: Number(row.max_value),
  displayOrder: Number(row.display_order ?? 0),
  isActive: Boolean(row.is_active),
  metadata:
    row.metadata && typeof row.metadata === 'object'
      ? row.metadata
      : {},
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
})

const mapRule = (row: any): EvaluationProfileRule => ({
  id: String(row.id),
  evaluationProfileId: String(row.evaluation_profile_id),
  ruleKey: String(row.rule_key),
  ruleValue: row.rule_value,
  description: row.description ?? undefined,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
})

async function getCurrentOrganizationId(): Promise<string> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured.')
  }

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError

  const userId = userData.user?.id
  if (!userId) {
    throw new Error('You must be signed in to manage evaluation profiles.')
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

export const evaluationProfileService = {
  async fetchProfiles(includeInactive = false): Promise<EvaluationProfile[]> {
    if (!isSupabaseConfigured) return []

    let query = supabase
      .from('evaluation_profiles')
      .select(
        'id, organization_id, name, code, description, is_active, scoring_method, metadata, created_at, updated_at'
      )
      .order('name')

    if (!includeInactive) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query
    if (error) throw error

    return (data ?? []).map(mapProfile)
  },

  async fetchProfile(
    profileId: string
  ): Promise<EvaluationProfileWithConfiguration | null> {
    if (!isSupabaseConfigured) return null

    const { data: profile, error: profileError } = await supabase
      .from('evaluation_profiles')
      .select(
        'id, organization_id, name, code, description, is_active, scoring_method, metadata, created_at, updated_at'
      )
      .eq('id', profileId)
      .maybeSingle()

    if (profileError) throw profileError
    if (!profile) return null

    const [levelsResult, rulesResult] = await Promise.all([
      supabase
        .from('evaluation_profile_levels')
        .select(
          'id, evaluation_profile_id, name, code, description, min_value, max_value, display_order, is_active, metadata, created_at, updated_at'
        )
        .eq('evaluation_profile_id', profileId)
        .order('display_order')
        .order('name'),
      supabase
        .from('evaluation_profile_rules')
        .select(
          'id, evaluation_profile_id, rule_key, rule_value, description, created_at, updated_at'
        )
        .eq('evaluation_profile_id', profileId)
        .order('rule_key'),
    ])

    if (levelsResult.error) throw levelsResult.error
    if (rulesResult.error) throw rulesResult.error

    return {
      ...mapProfile(profile),
      levels: (levelsResult.data ?? []).map(mapLevel),
      rules: (rulesResult.data ?? []).map(mapRule),
    }
  },

  async createProfile(input: {
    name: string
    code?: string
    description?: string
    scoringMethod?: EvaluationScoringMethod
    metadata?: Record<string, unknown>
  }): Promise<EvaluationProfile> {
    const name = input.name.trim()
    if (!name) throw new Error('Evaluation profile name is required.')

    const organizationId = await getCurrentOrganizationId()

    const { data, error } = await supabase
      .from('evaluation_profiles')
      .insert({
        organization_id: organizationId,
        name,
        code: input.code?.trim() || null,
        description: input.description?.trim() || null,
        scoring_method: input.scoringMethod || 'percentage',
        metadata: input.metadata || {},
      })
      .select(
        'id, organization_id, name, code, description, is_active, scoring_method, metadata, created_at, updated_at'
      )
      .single()

    if (error) throw error
    return mapProfile(data)
  },

  async updateProfile(
    profileId: string,
    updates: {
      name?: string
      code?: string | null
      description?: string | null
      isActive?: boolean
      scoringMethod?: EvaluationScoringMethod
      metadata?: Record<string, unknown>
    }
  ): Promise<EvaluationProfile> {
    const payload: Record<string, unknown> = {}

    if (updates.name !== undefined) {
      const name = updates.name.trim()
      if (!name) throw new Error('Evaluation profile name cannot be empty.')
      payload.name = name
    }
    if (updates.code !== undefined) payload.code = updates.code?.trim() || null
    if (updates.description !== undefined) {
      payload.description = updates.description?.trim() || null
    }
    if (updates.isActive !== undefined) payload.is_active = updates.isActive
    if (updates.scoringMethod !== undefined) {
      payload.scoring_method = updates.scoringMethod
    }
    if (updates.metadata !== undefined) payload.metadata = updates.metadata

    if (Object.keys(payload).length === 0) {
      const existing = await this.fetchProfile(profileId)
      if (!existing) throw new Error('Evaluation profile not found.')
      return existing
    }

    const { data, error } = await supabase
      .from('evaluation_profiles')
      .update(payload)
      .eq('id', profileId)
      .select(
        'id, organization_id, name, code, description, is_active, scoring_method, metadata, created_at, updated_at'
      )
      .single()

    if (error) throw error
    return mapProfile(data)
  },

  async deleteProfile(profileId: string): Promise<void> {
    const { error } = await supabase
      .from('evaluation_profiles')
      .delete()
      .eq('id', profileId)

    if (error) throw error
  },

  async createLevel(
    profileId: string,
    input: {
      name: string
      code?: string
      description?: string
      minValue: number
      maxValue: number
      displayOrder?: number
      isActive?: boolean
      metadata?: Record<string, unknown>
    }
  ): Promise<EvaluationProfileLevel> {
    const name = input.name.trim()
    if (!name) throw new Error('Evaluation level name is required.')
    if (!Number.isFinite(input.minValue) || !Number.isFinite(input.maxValue)) {
      throw new Error('Evaluation level bounds must be valid numbers.')
    }
    if (input.minValue > input.maxValue) {
      throw new Error('Minimum value cannot be greater than maximum value.')
    }

    const { data, error } = await supabase
      .from('evaluation_profile_levels')
      .insert({
        evaluation_profile_id: profileId,
        name,
        code: input.code?.trim() || null,
        description: input.description?.trim() || null,
        min_value: input.minValue,
        max_value: input.maxValue,
        display_order: input.displayOrder ?? 0,
        is_active: input.isActive ?? true,
        metadata: input.metadata || {},
      })
      .select(
        'id, evaluation_profile_id, name, code, description, min_value, max_value, display_order, is_active, metadata, created_at, updated_at'
      )
      .single()

    if (error) throw error
    return mapLevel(data)
  },

  async updateLevel(
    levelId: string,
    updates: {
      name?: string
      code?: string | null
      description?: string | null
      minValue?: number
      maxValue?: number
      displayOrder?: number
      isActive?: boolean
      metadata?: Record<string, unknown>
    }
  ): Promise<EvaluationProfileLevel> {
    const payload: Record<string, unknown> = {}

    if (updates.name !== undefined) {
      const name = updates.name.trim()
      if (!name) throw new Error('Evaluation level name cannot be empty.')
      payload.name = name
    }
    if (updates.code !== undefined) payload.code = updates.code?.trim() || null
    if (updates.description !== undefined) {
      payload.description = updates.description?.trim() || null
    }
    if (updates.minValue !== undefined) payload.min_value = updates.minValue
    if (updates.maxValue !== undefined) payload.max_value = updates.maxValue
    if (updates.displayOrder !== undefined) payload.display_order = updates.displayOrder
    if (updates.isActive !== undefined) payload.is_active = updates.isActive
    if (updates.metadata !== undefined) payload.metadata = updates.metadata

    const { data: existing, error: existingError } = await supabase
      .from('evaluation_profile_levels')
      .select('min_value, max_value')
      .eq('id', levelId)
      .single()

    if (existingError) throw existingError

    const minValue =
      updates.minValue !== undefined ? updates.minValue : Number(existing.min_value)
    const maxValue =
      updates.maxValue !== undefined ? updates.maxValue : Number(existing.max_value)

    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
      throw new Error('Evaluation level bounds must be valid numbers.')
    }
    if (minValue > maxValue) {
      throw new Error('Minimum value cannot be greater than maximum value.')
    }

    if (Object.keys(payload).length === 0) {
      const { data, error } = await supabase
        .from('evaluation_profile_levels')
        .select(
          'id, evaluation_profile_id, name, code, description, min_value, max_value, display_order, is_active, metadata, created_at, updated_at'
        )
        .eq('id', levelId)
        .single()
      if (error) throw error
      return mapLevel(data)
    }

    const { data, error } = await supabase
      .from('evaluation_profile_levels')
      .update(payload)
      .eq('id', levelId)
      .select(
        'id, evaluation_profile_id, name, code, description, min_value, max_value, display_order, is_active, metadata, created_at, updated_at'
      )
      .single()

    if (error) throw error
    return mapLevel(data)
  },

  async deleteLevel(levelId: string): Promise<void> {
    const { error } = await supabase
      .from('evaluation_profile_levels')
      .delete()
      .eq('id', levelId)

    if (error) throw error
  },

  async upsertRule(
    profileId: string,
    input: {
      ruleKey: string
      ruleValue: unknown
      description?: string
    }
  ): Promise<EvaluationProfileRule> {
    const ruleKey = input.ruleKey.trim()
    if (!ruleKey) throw new Error('Evaluation rule key is required.')

    const { data, error } = await supabase
      .from('evaluation_profile_rules')
      .upsert(
        {
          evaluation_profile_id: profileId,
          rule_key: ruleKey,
          rule_value: input.ruleValue,
          description: input.description?.trim() || null,
        },
        { onConflict: 'evaluation_profile_id,rule_key' }
      )
      .select(
        'id, evaluation_profile_id, rule_key, rule_value, description, created_at, updated_at'
      )
      .single()

    if (error) throw error
    return mapRule(data)
  },

  async deleteRule(ruleId: string): Promise<void> {
    const { error } = await supabase
      .from('evaluation_profile_rules')
      .delete()
      .eq('id', ruleId)

    if (error) throw error
  },

  async fetchAssessmentProfileId(
    assessmentId: string
  ): Promise<string | null> {
    if (!isSupabaseConfigured) return null

    const { data, error } = await supabase
      .from('assessment_evaluation_profiles')
      .select('evaluation_profile_id')
      .eq('assessment_id', assessmentId)
      .maybeSingle()

    if (error) throw error
    return data?.evaluation_profile_id
      ? String(data.evaluation_profile_id)
      : null
  },

  async setAssessmentProfile(
    assessmentId: string,
    profileId: string | null
  ): Promise<void> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured.')
    }

    const { error: deleteError } = await supabase
      .from('assessment_evaluation_profiles')
      .delete()
      .eq('assessment_id', assessmentId)

    if (deleteError) throw deleteError

    if (!profileId) return

    const { error: insertError } = await supabase
      .from('assessment_evaluation_profiles')
      .insert({
        assessment_id: assessmentId,
        evaluation_profile_id: profileId,
      })

    if (insertError) throw insertError
  },

  async fetchAssessmentProfile(
    assessmentId: string
  ): Promise<EvaluationProfileWithConfiguration | null> {
    const profileId = await this.fetchAssessmentProfileId(assessmentId)
    if (!profileId) return null
    return this.fetchProfile(profileId)
  },
}
