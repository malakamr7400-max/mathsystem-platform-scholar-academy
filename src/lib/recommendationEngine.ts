import {
  actionPlanService,
  recommendationRuleService,
  type ActionPlanWithItems,
  type RecommendationRule,
  type RecommendationRuleActionPlan,
} from './actionPlanService'

export type RecommendationValue = string | number | boolean | null

export interface RecommendationContext {
  [key: string]: unknown
}

export type RecommendationOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'not_contains'
  | 'exists'
  | 'not_exists'
  | 'between'

export interface RecommendationCondition {
  path: string
  operator?: RecommendationOperator
  value?: unknown
}

export interface RecommendationConditionGroup {
  all?: RecommendationExpression[]
  any?: RecommendationExpression[]
  not?: RecommendationExpression
}

export type RecommendationExpression = RecommendationCondition | RecommendationConditionGroup

export interface MatchedRecommendationActionPlan {
  actionPlanId: string
  displayOrder: number
  actionPlan: ActionPlanWithItems | null
}

export interface MatchedRecommendation {
  rule: RecommendationRule
  matchedActionPlans: MatchedRecommendationActionPlan[]
}

export interface RecommendationEvaluationResult {
  matchedRecommendations: MatchedRecommendation[]
}

function getPathValue(source: unknown, path: string): unknown {
  if (!path.trim()) return source

  return path
    .split('.')
    .filter(Boolean)
    .reduce<unknown>((current, segment) => {
      if (current === null || current === undefined) return undefined
      if (Array.isArray(current)) {
        const index = Number(segment)
        return Number.isInteger(index) ? current[index] : undefined
      }
      if (typeof current !== 'object') return undefined
      return (current as Record<string, unknown>)[segment]
    }, source)
}

function isCondition(value: unknown): value is RecommendationCondition {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as RecommendationCondition).path === 'string'
  )
}

function compareValues(actual: unknown, operator: RecommendationOperator, expected: unknown): boolean {
  switch (operator) {
    case 'exists':
      return actual !== undefined && actual !== null
    case 'not_exists':
      return actual === undefined || actual === null
    case 'eq':
      return actual === expected
    case 'neq':
      return actual !== expected
    case 'gt':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected
    case 'gte':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected
    case 'lt':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected
    case 'lte':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected
    case 'in':
      return Array.isArray(expected) && expected.some((item) => item === actual)
    case 'not_in':
      return Array.isArray(expected) && !expected.some((item) => item === actual)
    case 'contains':
      if (typeof actual === 'string') return typeof expected === 'string' && actual.includes(expected)
      if (Array.isArray(actual)) return actual.some((item) => item === expected)
      return false
    case 'not_contains':
      if (typeof actual === 'string') return typeof expected === 'string' && !actual.includes(expected)
      if (Array.isArray(actual)) return !actual.some((item) => item === expected)
      return false
    case 'between':
      return (
        Array.isArray(expected) &&
        expected.length >= 2 &&
        typeof actual === 'number' &&
        typeof expected[0] === 'number' &&
        typeof expected[1] === 'number' &&
        actual >= expected[0] &&
        actual <= expected[1]
      )
    default:
      return false
  }
}

function evaluateExpression(expression: unknown, context: RecommendationContext): boolean {
  if (isCondition(expression)) {
    return compareValues(
      getPathValue(context, expression.path),
      expression.operator || 'eq',
      expression.value
    )
  }

  if (!expression || typeof expression !== 'object') return false

  const group = expression as RecommendationConditionGroup

  if (Array.isArray(group.all)) {
    return group.all.every((item) => evaluateExpression(item, context))
  }

  if (Array.isArray(group.any)) {
    return group.any.some((item) => evaluateExpression(item, context))
  }

  if (group.not !== undefined) {
    return !evaluateExpression(group.not, context)
  }

  return false
}

function evaluateRule(rule: RecommendationRule, context: RecommendationContext): boolean {
  if (!rule.isActive) return false

  const conditions = rule.conditions || {}
  if (Object.keys(conditions).length === 0) return true

  return evaluateExpression(conditions, context)
}

async function loadActionPlans(
  links: RecommendationRuleActionPlan[]
): Promise<MatchedRecommendationActionPlan[]> {
  return Promise.all(
    links
      .slice()
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map(async (link) => ({
        actionPlanId: link.actionPlanId,
        displayOrder: link.displayOrder,
        actionPlan: await actionPlanService.fetchPlan(link.actionPlanId),
      }))
  )
}

export const recommendationEngine = {
  evaluateConditions(
    conditions: Record<string, unknown>,
    context: RecommendationContext
  ): boolean {
    if (!conditions || Object.keys(conditions).length === 0) return true
    return evaluateExpression(conditions, context)
  },

  async evaluate(
    context: RecommendationContext,
    options: { includeInactive?: boolean } = {}
  ): Promise<RecommendationEvaluationResult> {
    const rules = await recommendationRuleService.fetchRules(options.includeInactive ?? false)

    const matchedRecommendations: MatchedRecommendation[] = []

    for (const rule of rules) {
      if (!evaluateRule(rule, context)) continue

      const links = await recommendationRuleService.fetchRuleActionPlans(rule.id)
      const matchedActionPlans = await loadActionPlans(links)

      matchedRecommendations.push({
        rule,
        matchedActionPlans,
      })
    }

    return { matchedRecommendations }
  },
}

export default recommendationEngine
