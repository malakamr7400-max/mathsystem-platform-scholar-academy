import React, { useEffect, useMemo, useRef, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import {
  AlertCircle,
  Check,
  ChevronDown,
  Search,
  CheckCircle2,
  Edit2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import {
  evaluationProfileService,
  type EvaluationProfile,
  type EvaluationProfileLevel,
  type EvaluationProfileRule,
  type EvaluationProfileWithConfiguration,
  type EvaluationScoringMethod,
} from '../lib/evaluationProfileService'
import { EvaluationEmpty, EvaluationProfilesHero, EvaluationProfilesStats, EvaluationWorkspaceTabs, type EvaluationWorkspace } from '../components/evaluation-profiles/EvaluationProfilesUI'

interface ToastMessage {
  type: 'success' | 'error'
  text: string
}

interface ProfileDraft {
  name: string
  code: string
  description: string
  scoringMethod: EvaluationScoringMethod
  isActive: boolean
}

interface LevelDraft {
  name: string
  code: string
  description: string
  minValue: string
  maxValue: string
  displayOrder: string
  isActive: boolean
}

interface RuleDraft {
  ruleKey: string
  ruleValue: string
  description: string
}

const emptyProfileDraft: ProfileDraft = {
  name: '',
  code: '',
  description: '',
  scoringMethod: 'percentage',
  isActive: true,
}

const emptyLevelDraft: LevelDraft = {
  name: '',
  code: '',
  description: '',
  minValue: '0',
  maxValue: '100',
  displayOrder: '0',
  isActive: true,
}

const emptyRuleDraft: RuleDraft = {
  ruleKey: '',
  ruleValue: '',
  description: '',
}

function toProfileDraft(profile: EvaluationProfile): ProfileDraft {
  return {
    name: profile.name,
    code: profile.code || '',
    description: profile.description || '',
    scoringMethod: profile.scoringMethod,
    isActive: profile.isActive,
  }
}

function toLevelDraft(level: EvaluationProfileLevel): LevelDraft {
  return {
    name: level.name,
    code: level.code || '',
    description: level.description || '',
    minValue: String(level.minValue),
    maxValue: String(level.maxValue),
    displayOrder: String(level.displayOrder),
    isActive: level.isActive,
  }
}

function formatRuleValue(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value ?? '')
  }
}

function parseRuleValue(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed
  }
}

const scoringMethodLabels: Record<EvaluationScoringMethod, string> = {
  percentage: 'Percentage',
  points: 'Points',
  weighted_percentage: 'Weighted percentage',
}

export const EvaluationProfilesPage: React.FC = () => {
  const [profiles, setProfiles] = useState<EvaluationProfile[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [selectedProfile, setSelectedProfile] = useState<EvaluationProfileWithConfiguration | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [includeInactive, setIncludeInactive] = useState(true)
  const [workspaceView, setWorkspaceView] = useState<EvaluationWorkspace>('levels')
  const profileRequestId = useRef(0)

  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(emptyProfileDraft)
  const [isCreatingProfile, setIsCreatingProfile] = useState(false)
  const [showProfileForm, setShowProfileForm] = useState(false)

  const [editingLevelId, setEditingLevelId] = useState<string | null>(null)
  const [levelDraft, setLevelDraft] = useState<LevelDraft>(emptyLevelDraft)
  const [showLevelForm, setShowLevelForm] = useState(false)
  const [savingLevel, setSavingLevel] = useState(false)

  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [ruleDraft, setRuleDraft] = useState<RuleDraft>(emptyRuleDraft)
  const [showRuleForm, setShowRuleForm] = useState(false)
  const [savingRule, setSavingRule] = useState(false)

  const activeProfiles = useMemo(() => profiles.filter((profile) => profile.isActive), [profiles])
  const visibleProfiles = useMemo(() => profiles.filter((profile) => (includeInactive || profile.isActive) && [profile.name, profile.code || '', profile.description || ''].join(' ').toLowerCase().includes(search.trim().toLowerCase())), [profiles, includeInactive, search])
  const overlappingRanges = useMemo(() => {
    const levels = (selectedProfile?.levels || []).filter(level => level.isActive).sort((a, b) => a.minValue - b.minValue)
    let highestMax = -Infinity
    return levels.some((level) => {
      const overlaps = level.minValue <= highestMax
      highestMax = Math.max(highestMax, level.maxValue)
      return overlaps
    })
  }, [selectedProfile])

  useEffect(() => {
    void loadProfiles()
  }, [])

  useEffect(() => {
    if (!selectedProfileId) {
      profileRequestId.current += 1
      setSelectedProfile(null)
      return
    }
    void loadProfile(selectedProfileId)
  }, [selectedProfileId])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(timer)
  }, [toast])

  async function loadProfiles(selectFirst = true) {
    setLoading(true)
    setErrorMessage(null)
    try {
      const data = await evaluationProfileService.fetchProfiles(true)
      setProfiles(data)
      if (selectFirst) {
        setSelectedProfileId((current) => current && data.some((profile) => profile.id === current) ? current : data[0]?.id || null)
      }
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to load evaluation profiles.')
    } finally {
      setLoading(false)
    }
  }

  async function loadProfile(profileId: string) {
    const requestId = ++profileRequestId.current
    setLoadingProfile(true)
    setErrorMessage(null)
    try {
      const data = await evaluationProfileService.fetchProfile(profileId)
      if (requestId !== profileRequestId.current) return
      if (!data) {
        setSelectedProfile(null)
        setErrorMessage('The selected evaluation profile could not be found.')
        return
      }
      setSelectedProfile(data)
      setProfileDraft(toProfileDraft(data))
      setEditingLevelId(null)
      setEditingRuleId(null)
      setShowLevelForm(false)
      setShowRuleForm(false)
    } catch (error: any) {
      if (requestId === profileRequestId.current) setErrorMessage(error?.message || 'Unable to load the evaluation profile.')
    } finally {
      if (requestId === profileRequestId.current) setLoadingProfile(false)
    }
  }

  function confirmLeaveForms(): boolean {
    if (saving || savingLevel || savingRule) {
      setErrorMessage('Wait for the current save to finish before switching profiles.')
      return false
    }
    if (!(showProfileForm || showLevelForm || showRuleForm)) return true
    return window.confirm('Leave this form? Unsaved changes will be lost.')
  }

  function selectProfile(profileId: string) {
    if (profileId === selectedProfileId) return
    if (!confirmLeaveForms()) return
    setSelectedProfileId(profileId)
    setShowProfileForm(false)
    setShowLevelForm(false)
    setShowRuleForm(false)
    setWorkspaceView('levels')
  }

  function startCreateProfile() {
    if (!confirmLeaveForms()) return
    profileRequestId.current += 1
    setProfileDraft(emptyProfileDraft)
    setIsCreatingProfile(true)
    setShowProfileForm(true)
    setSelectedProfileId(null)
    setSelectedProfile(null)
    setErrorMessage(null)
    setWorkspaceView('levels')
  }

  function startEditProfile() {
    if (!selectedProfile) return
    setIsCreatingProfile(false)
    setProfileDraft(toProfileDraft(selectedProfile))
    setShowProfileForm(true)
  }

  function cancelProfileForm() {
    setShowProfileForm(false)
    setIsCreatingProfile(false)
    if (selectedProfile) setProfileDraft(toProfileDraft(selectedProfile))
  }

  async function saveProfile() {
    if (!profileDraft.name.trim()) {
      setErrorMessage('Profile name is required.')
      return
    }

    setSaving(true)
    setErrorMessage(null)
    try {
      if (isCreatingProfile) {
        const created = await evaluationProfileService.createProfile({
          name: profileDraft.name,
          code: profileDraft.code,
          description: profileDraft.description,
          scoringMethod: profileDraft.scoringMethod,
        })
        setToast({ type: 'success', text: 'Evaluation profile created.' })
        setShowProfileForm(false)
        setIsCreatingProfile(false)
        await loadProfiles(false)
        setSelectedProfileId(created.id)
      } else if (selectedProfile) {
        const updated = await evaluationProfileService.updateProfile(selectedProfile.id, {
          name: profileDraft.name,
          code: profileDraft.code,
          description: profileDraft.description,
          scoringMethod: profileDraft.scoringMethod,
          isActive: profileDraft.isActive,
        })
        setSelectedProfile((current) => current ? { ...current, ...updated } : current)
        setProfiles((current) => current.map((profile) => profile.id === updated.id ? updated : profile))
        setProfileDraft(toProfileDraft(updated))
        setShowProfileForm(false)
        setToast({ type: 'success', text: 'Evaluation profile updated.' })
      }
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to save the evaluation profile.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleProfileActive(profile: EvaluationProfile) {
    try {
      const updated = await evaluationProfileService.updateProfile(profile.id, { isActive: !profile.isActive })
      setProfiles((current) => current.map((item) => item.id === updated.id ? updated : item))
      if (selectedProfile?.id === updated.id) {
        setSelectedProfile((current) => current ? { ...current, ...updated } : current)
        setProfileDraft((current) => ({ ...current, isActive: updated.isActive }))
      }
      setToast({ type: 'success', text: updated.isActive ? 'Profile activated.' : 'Profile archived.' })
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to update the profile status.')
    }
  }

  async function deleteProfile() {
    if (!selectedProfile) return
    if (selectedProfile.levels.length > 0 || selectedProfile.rules.length > 0) {
      setErrorMessage('This profile has configured levels or rules. Archive it instead of deleting its configuration.')
      return
    }
    const typedName = window.prompt(`Permanent deletion cannot be undone. Type the exact profile name to delete: ${selectedProfile.name}`)
    if (typedName !== selectedProfile.name) return

    try {
      await evaluationProfileService.deleteProfile(selectedProfile.id)
      setToast({ type: 'success', text: 'Evaluation profile deleted.' })
      setSelectedProfile(null)
      setSelectedProfileId(null)
      await loadProfiles(true)
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to delete the evaluation profile.')
    }
  }

  function startCreateLevel() {
    setEditingLevelId(null)
    setLevelDraft({
      ...emptyLevelDraft,
      displayOrder: String((selectedProfile?.levels.length || 0) + 1),
    })
    setShowLevelForm(true)
  }

  function startEditLevel(level: EvaluationProfileLevel) {
    setEditingLevelId(level.id)
    setLevelDraft(toLevelDraft(level))
    setShowLevelForm(true)
  }

  function cancelLevelForm() {
    setShowLevelForm(false)
    setEditingLevelId(null)
    setLevelDraft(emptyLevelDraft)
  }

  async function saveLevel() {
    if (!selectedProfile) return
    const minValue = Number(levelDraft.minValue)
    const maxValue = Number(levelDraft.maxValue)
    const displayOrder = Number(levelDraft.displayOrder)

    if (!levelDraft.name.trim()) {
      setErrorMessage('Level name is required.')
      return
    }
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue) || minValue > maxValue) {
      setErrorMessage('Level minimum and maximum must be valid numbers, with minimum ≤ maximum.')
      return
    }
    if (!Number.isInteger(displayOrder) || displayOrder < 0) {
      setErrorMessage('Display order must be a non-negative whole number.')
      return
    }

    setSavingLevel(true)
    setErrorMessage(null)
    try {
      if (editingLevelId) {
        await evaluationProfileService.updateLevel(editingLevelId, {
          name: levelDraft.name,
          code: levelDraft.code,
          description: levelDraft.description,
          minValue,
          maxValue,
          displayOrder,
          isActive: levelDraft.isActive,
        })
        setToast({ type: 'success', text: 'Evaluation level updated.' })
      } else {
        await evaluationProfileService.createLevel(selectedProfile.id, {
          name: levelDraft.name,
          code: levelDraft.code,
          description: levelDraft.description,
          minValue,
          maxValue,
          displayOrder,
          isActive: levelDraft.isActive,
        })
        setToast({ type: 'success', text: 'Evaluation level created.' })
      }
      cancelLevelForm()
      await loadProfile(selectedProfile.id)
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to save the evaluation level.')
    } finally {
      setSavingLevel(false)
    }
  }

  async function deleteLevel(level: EvaluationProfileLevel) {
    if (!window.confirm(`Permanently delete the level "${level.name}"? This cannot be undone. Consider editing or deactivating it instead.`)) return
    try {
      await evaluationProfileService.deleteLevel(level.id)
      setToast({ type: 'success', text: 'Evaluation level deleted.' })
      await loadProfile(level.evaluationProfileId)
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to delete the evaluation level.')
    }
  }

  function startCreateRule() {
    setEditingRuleId(null)
    setRuleDraft(emptyRuleDraft)
    setShowRuleForm(true)
  }

  function startEditRule(rule: EvaluationProfileRule) {
    setEditingRuleId(rule.id)
    setRuleDraft({
      ruleKey: rule.ruleKey,
      ruleValue: formatRuleValue(rule.ruleValue),
      description: rule.description || '',
    })
    setShowRuleForm(true)
  }

  function cancelRuleForm() {
    setShowRuleForm(false)
    setEditingRuleId(null)
    setRuleDraft(emptyRuleDraft)
  }

  async function saveRule() {
    if (!selectedProfile) return
    if (!ruleDraft.ruleKey.trim()) {
      setErrorMessage('Rule key is required.')
      return
    }

    setSavingRule(true)
    setErrorMessage(null)
    const wasEditing = Boolean(editingRuleId)
    try {
      await evaluationProfileService.upsertRule(selectedProfile.id, {
        ruleKey: ruleDraft.ruleKey,
        ruleValue: parseRuleValue(ruleDraft.ruleValue),
        description: ruleDraft.description,
      })
      cancelRuleForm()
      setToast({ type: 'success', text: wasEditing ? 'Evaluation rule updated.' : 'Evaluation rule created.' })
      await loadProfile(selectedProfile.id)
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to save the evaluation rule.')
    } finally {
      setSavingRule(false)
    }
  }

  async function deleteRule(rule: EvaluationProfileRule) {
    if (!window.confirm(`Permanently delete the rule "${rule.ruleKey}"? This cannot be undone.`)) return
    try {
      await evaluationProfileService.deleteRule(rule.id)
      setToast({ type: 'success', text: 'Evaluation rule deleted.' })
      await loadProfile(rule.evaluationProfileId)
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to delete the evaluation rule.')
    }
  }

  function changeWorkspace(view: EvaluationWorkspace) {
    if (view === workspaceView) return
    if (savingLevel || savingRule) {
      setErrorMessage('Wait for the current save to finish before switching sections.')
      return
    }
    if ((showLevelForm || showRuleForm) && !window.confirm('Switch sections? Unsaved form changes will be lost.')) return
    setShowLevelForm(false)
    setShowRuleForm(false)
    setWorkspaceView(view)
  }

  async function refreshAll() {
    await loadProfiles(true)
    if (selectedProfileId) await loadProfile(selectedProfileId)
  }

  return (
    <AdminLayout
      title="Evaluation Profiles"
      subtitle="Organize performance bands for your assessments. Optional technical rules are available only when needed."
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => void refreshAll()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <button
            type="button"
            onClick={startCreateProfile}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 shadow-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            New Evaluation Profile
          </button>
        </div>
      }
    >
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-2xl shadow-xl border flex items-center gap-2 text-xs font-medium ${
          toast.type === 'success'
            ? 'bg-slate-900 text-white border-slate-700'
            : 'bg-rose-600 text-white border-rose-500'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <AlertCircle className="h-4 w-4" />}
          <span>{toast.text}</span>
        </div>
      )}

      {errorMessage && (
        <div className="mb-5 p-3.5 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800 text-xs flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex-1">{errorMessage}</div>
          <button type="button" onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mb-5 space-y-4">
        <EvaluationProfilesHero onCreate={startCreateProfile} />
        <EvaluationProfilesStats items={[
          { label: 'Total profiles', value: profiles.length, hint: 'Saved evaluation profiles' },
          { label: 'Active profiles', value: activeProfiles.length, hint: 'Available for assessment use' },
          { label: 'Selected levels', value: selectedProfile?.levels.length ?? 0, hint: 'Performance bands in this profile' },
          { label: 'Selected rules', value: selectedProfile?.rules.length ?? 0, hint: 'Additional rules' },
        ]} />
      </div>

      {showProfileForm && (
        <section className="mb-6 bg-white rounded-3xl border border-blue-200 shadow-2xs p-5">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-base font-bold text-slate-900">{isCreatingProfile ? 'Create evaluation profile' : 'Edit evaluation profile'}</h2>
              <p className="text-xs text-slate-500 mt-1">Start with performance levels. Optional rules can be left unchanged.</p>
            </div>
            <button type="button" onClick={cancelProfileForm} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-700">Name *</span>
              <input
                value={profileDraft.name}
                onChange={(e) => setProfileDraft((current) => ({ ...current, name: e.target.value }))}
                placeholder="e.g. General Diagnostic Evaluation"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-700">Code</span>
              <input
                value={profileDraft.code}
                onChange={(e) => setProfileDraft((current) => ({ ...current, code: e.target.value }))}
                placeholder="Optional stable code"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-700">Scoring method *</span>
              <select
                value={profileDraft.scoringMethod}
                onChange={(e) => setProfileDraft((current) => ({ ...current, scoringMethod: e.target.value as EvaluationScoringMethod }))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              >
                {Object.entries(scoringMethodLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            {!isCreatingProfile && (
              <label className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 self-end">
                <input
                  type="checkbox"
                  checked={profileDraft.isActive}
                  onChange={(e) => setProfileDraft((current) => ({ ...current, isActive: e.target.checked }))}
                  className="rounded"
                />
                Active profile
              </label>
            )}
            <label className="space-y-1.5 md:col-span-2">
              <span className="text-xs font-semibold text-slate-700">Description</span>
              <textarea
                value={profileDraft.description}
                onChange={(e) => setProfileDraft((current) => ({ ...current, description: e.target.value }))}
                rows={3}
                placeholder="Explain what this evaluation profile is intended to measure."
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100">
            <button type="button" onClick={cancelProfileForm} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button type="button" onClick={() => void saveProfile()} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-5 items-start">
        <aside className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Profiles</h2>
                <p className="text-[11px] text-slate-500 mt-0.5">{activeProfiles.length} active · {profiles.length} total</p>
              </div>
            </div>
          </div>

          <div className="space-y-3 border-b border-slate-100 p-4">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input aria-label="Search evaluation profiles" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search profiles or codes" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
              <input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} /> Include inactive profiles
            </label>
          </div>
          {loading ? (
            <div className="p-6 text-center text-xs text-slate-500">Loading profiles...</div>
          ) : profiles.length === 0 ? (
            <div className="p-6 text-center space-y-3">
              <p className="text-xs text-slate-500">No evaluation profiles exist yet.</p>
              <button type="button" onClick={startCreateProfile} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700">
                <Plus className="h-3.5 w-3.5" />
                Create first profile
              </button>
            </div>
          ) : visibleProfiles.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">No profiles match these filters.</div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[620px] overflow-y-auto">
              {visibleProfiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => selectProfile(profile.id)}
                  className={`w-full text-left p-4 transition ${selectedProfileId === profile.id ? 'bg-blue-50 border-l-4 border-blue-600' : 'hover:bg-slate-50 border-l-4 border-transparent'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{profile.name}</p>
                      <p className="text-[10px] text-slate-500 mt-1">{profile.code || 'No code'} · {scoringMethodLabels[profile.scoringMethod]}</p>
                    </div>
                    <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${profile.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {profile.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>

        <main className="space-y-5 min-w-0">
          {loadingProfile ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center text-xs text-slate-500">Loading profile...</div>
          ) : !selectedProfile ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Plus className="h-5 w-5" />
              </div>
              <h2 className="text-base font-bold text-slate-900">Select or create an evaluation profile</h2>
              <p className="text-xs text-slate-500 max-w-lg mx-auto">Create a profile to define how student performance is evaluated.</p>
            </div>
          ) : (
            <>
              <section className="bg-white rounded-3xl border border-slate-200 shadow-2xs p-5">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-900">{selectedProfile.name}</h2>
                      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${selectedProfile.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {selectedProfile.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{selectedProfile.description || 'No description provided.'}</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <span className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-600">Code: {selectedProfile.code || '—'}</span>
                      <span className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-600">Scoring: {scoringMethodLabels[selectedProfile.scoringMethod]}</span>
                      <span className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-600">{selectedProfile.levels.length} levels</span>
                      <span className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-600">{selectedProfile.rules.length} rules</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" onClick={startEditProfile} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      <Edit2 className="h-3.5 w-3.5" /> Edit
                    </button>
                    <details className="group relative">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        More actions <ChevronDown className="h-3.5 w-3.5" />
                      </summary>
                      <div className="absolute right-0 top-full z-20 mt-2 w-64 space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                        <button type="button" onClick={() => void toggleProfileActive(selectedProfile)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">
                          <Check className="h-4 w-4" /> {selectedProfile.isActive ? 'Archive profile' : 'Activate profile'}
                        </button>
                        <p className="px-2 text-xs leading-5 text-slate-500">Archiving is safer than deleting a profile used by assessments.</p>
                        <button type="button" onClick={() => void deleteProfile()} disabled={selectedProfile.levels.length > 0 || selectedProfile.rules.length > 0} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40">
                          <Trash2 className="h-4 w-4" /> Delete empty profile
                        </button>
                        <p className="px-2 text-xs leading-5 text-slate-500">Only empty profiles can be deleted here. Database links may also prevent deletion.</p>
                      </div>
                    </details>
                  </div>
                </div>
              </section>

              <EvaluationWorkspaceTabs view={workspaceView} onChange={changeWorkspace} levelCount={selectedProfile.levels.length} ruleCount={selectedProfile.rules.length} />

              {workspaceView === 'levels' && overlappingRanges && (
                <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                  Some active performance ranges overlap. Check whether this is intentional for the selected scoring method before using the profile for classification.
                </div>
              )}

              {workspaceView === 'levels' && (
              <section className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Performance Levels</h3>
                    <p className="text-[11px] text-slate-500 mt-1">Choose clear bands such as Strong, Developing and Needs support. Use non-overlapping ranges.</p>
                  </div>
                  <button type="button" onClick={startCreateLevel} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700">
                    <Plus className="h-3.5 w-3.5" /> Add Level
                  </button>
                </div>

                {showLevelForm && (
                  <div className="p-5 bg-slate-50 border-b border-slate-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      <label className="space-y-1">
                        <span className="text-[11px] font-semibold text-slate-700">Name *</span>
                        <input value={levelDraft.name} onChange={(e) => setLevelDraft((current) => ({ ...current, name: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs" placeholder="Performance band name" />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[11px] font-semibold text-slate-700">Code</span>
                        <input value={levelDraft.code} onChange={(e) => setLevelDraft((current) => ({ ...current, code: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs" placeholder="Optional code" />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[11px] font-semibold text-slate-700">Display order</span>
                        <input type="number" value={levelDraft.displayOrder} onChange={(e) => setLevelDraft((current) => ({ ...current, displayOrder: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs" />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[11px] font-semibold text-slate-700">Minimum value *</span>
                        <input type="number" value={levelDraft.minValue} onChange={(e) => setLevelDraft((current) => ({ ...current, minValue: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs" />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[11px] font-semibold text-slate-700">Maximum value *</span>
                        <input type="number" value={levelDraft.maxValue} onChange={(e) => setLevelDraft((current) => ({ ...current, maxValue: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs" />
                      </label>
                      <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 self-end">
                        <input type="checkbox" checked={levelDraft.isActive} onChange={(e) => setLevelDraft((current) => ({ ...current, isActive: e.target.checked }))} className="rounded" />
                        Active level
                      </label>
                      <label className="space-y-1 md:col-span-2 xl:col-span-3">
                        <span className="text-[11px] font-semibold text-slate-700">Description</span>
                        <textarea value={levelDraft.description} onChange={(e) => setLevelDraft((current) => ({ ...current, description: e.target.value }))} rows={2} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs resize-y" placeholder="Optional explanation for this level" />
                      </label>
                    </div>
                    <div className="flex justify-end gap-2 mt-3">
                      <button type="button" onClick={cancelLevelForm} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700">Cancel</button>
                      <button type="button" onClick={() => void saveLevel()} disabled={savingLevel} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold disabled:opacity-50"><Save className="h-3.5 w-3.5" />{savingLevel ? 'Saving...' : editingLevelId ? 'Update Level' : 'Create Level'}</button>
                    </div>
                  </div>
                )}

                {selectedProfile.levels.length === 0 ? (
                  <div className="p-4"><EvaluationEmpty title="No performance levels yet" description="Add a score band to classify results for this evaluation profile." action={<button type="button" onClick={startCreateLevel} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Add first level</button>} /></div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {selectedProfile.levels.map((level) => (
                      <div key={level.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">{level.name}</span>
                            {level.code && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{level.code}</span>}
                            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${level.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{level.isActive ? 'Active' : 'Inactive'}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">Range: {level.minValue} – {level.maxValue} · Order: {level.displayOrder}</p>
                          {level.description && <p className="text-[11px] text-slate-500 mt-1">{level.description}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button type="button" onClick={() => startEditLevel(level)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"><Edit2 className="h-3 w-3" /> Edit</button>
                          <button type="button" onClick={() => void deleteLevel(level)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"><Trash2 className="h-3 w-3" /> Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              )}

              {workspaceView === 'rules' && (
              <section className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Optional advanced settings</h3>
                    <p className="text-[11px] text-slate-500 mt-1">Add optional rules to customize how this profile works.</p>
                  </div>
                  <button type="button" onClick={startCreateRule} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700">
                    <Plus className="h-3.5 w-3.5" /> Add Rule
                  </button>
                </div>

                {showRuleForm && (
                  <div className="p-5 bg-slate-50 border-b border-slate-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <label className="space-y-1">
                        <span className="text-xs font-semibold text-slate-700">Setting name *</span>
                        <input value={ruleDraft.ruleKey} onChange={(e) => setRuleDraft((current) => ({ ...current, ruleKey: e.target.value }))} disabled={Boolean(editingRuleId)} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs disabled:bg-slate-100" placeholder="e.g. minimum_questions_for_classification" />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-semibold text-slate-700">Setting value</span>
                        <input value={ruleDraft.ruleValue} onChange={(e) => setRuleDraft((current) => ({ ...current, ruleValue: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm" placeholder='e.g. 10 or true or {"threshold":75}' />
                        <span className="block text-xs leading-5 text-slate-500">Enter a value for this rule. Leave it blank if no value is needed.</span>
                      </label>
                      <label className="space-y-1 md:col-span-2">
                        <span className="text-[11px] font-semibold text-slate-700">Description</span>
                        <textarea value={ruleDraft.description} onChange={(e) => setRuleDraft((current) => ({ ...current, description: e.target.value }))} rows={2} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs resize-y" placeholder="Describe when this rule should apply." />
                      </label>
                    </div>
                    <div className="flex justify-end gap-2 mt-3">
                      <button type="button" onClick={cancelRuleForm} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700">Cancel</button>
                      <button type="button" onClick={() => void saveRule()} disabled={savingRule} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold disabled:opacity-50"><Save className="h-3.5 w-3.5" />{savingRule ? 'Saving...' : editingRuleId ? 'Update Rule' : 'Create Rule'}</button>
                    </div>
                  </div>
                )}

                {selectedProfile.rules.length === 0 ? (
                  <div className="p-4"><EvaluationEmpty title="No optional rules" description="Rules are optional. Add a key/value setting only when your evaluation workflow requires it." action={<button type="button" onClick={startCreateRule} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Add first rule</button>} /></div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {selectedProfile.rules.map((rule) => (
                      <div key={rule.id} className="p-4 flex flex-col md:flex-row md:items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 font-mono break-all">{rule.ruleKey}</span>
                            <span className="text-[9px] uppercase font-bold tracking-wide px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">Setting value</span>
                          </div>
                          <pre className="mt-2 text-[11px] text-slate-700 bg-slate-50 border border-slate-100 rounded-xl p-2.5 overflow-x-auto whitespace-pre-wrap break-words">{formatRuleValue(rule.ruleValue)}</pre>
                          {rule.description && <p className="text-[11px] text-slate-500 mt-1">{rule.description}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button type="button" onClick={() => startEditRule(rule)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"><Edit2 className="h-3 w-3" /> Edit</button>
                          <button type="button" onClick={() => void deleteRule(rule)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"><Trash2 className="h-3 w-3" /> Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              )}
            </>
          )}
        </main>
      </div>
    </AdminLayout>
  )
}

export default EvaluationProfilesPage
