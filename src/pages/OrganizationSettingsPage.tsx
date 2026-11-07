import { useEffect, useMemo, useState, type FormEvent } from 'react'
import AdminLayout from '../components/AdminLayout'
import DynamicRegistrationField from '../components/DynamicRegistrationField'
import { useUnsavedChanges } from '../contexts/UnsavedChangesContext'
import { supabase } from '../lib/supabaseClient'
import { defaultAssessmentSettings } from '../lib/assessmentService'
import { getStaffOrganizationContext } from '../lib/organizationConfigService'
import { SettingsNotice, SettingsPanel, SettingsWorkspaceHeader, type SettingsTab } from '../components/settings/SettingsWorkspaceUI'
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, Plus, Search, Trash2, Pencil, RotateCcw, LockKeyhole, Smartphone, Save } from 'lucide-react'

export type FieldType = 'text' | 'email' | 'phone' | 'number' | 'dropdown' | 'radio' | 'checkbox' | 'date' | 'textarea'
export interface RegistrationField {
  id: string
  organization_id?: string
  label: string
  field_key: string
  field_type: FieldType
  is_required: boolean
  options: string[] | null
  display_order: number
  is_active: boolean
}

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Short text', email: 'Email address', phone: 'Phone number', number: 'Number',
  dropdown: 'Dropdown', radio: 'Single choice', checkbox: 'Multiple choice',
  date: 'Date', textarea: 'Long answer',
}

type Branding = { tagline: string; phone: string; whatsapp: string; websiteUrl: string }
const EMPTY_BRANDING: Branding = { tagline: '', phone: '', whatsapp: '', websiteUrl: '' }
const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
const secondaryButton = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'
const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'

function slugify(text: string) {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : 'Something went wrong. Please try again.'
}
function isHttpUrl(value: string) {
  if (!value.trim()) return true
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' } catch { return false }
}

export default function OrganizationSettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('fields')
  const [fields, setFields] = useState<RegistrationField[]>([])
  const [orgId, setOrgId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [visibility, setVisibility] = useState<'all' | 'active' | 'hidden'>('all')
  const [branding, setBranding] = useState<Branding>(EMPTY_BRANDING)
  const [savedBranding, setSavedBranding] = useState<Branding>(EMPTY_BRANDING)
  const [savingBranding, setSavingBranding] = useState(false)
  const [brandingError, setBrandingError] = useState<string | null>(null)
  const [fieldModal, setFieldModal] = useState<'create' | 'edit' | null>(null)
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [fieldLabel, setFieldLabel] = useState('')
  const [fieldKey, setFieldKey] = useState('')
  const [fieldType, setFieldType] = useState<FieldType>('text')
  const [fieldRequired, setFieldRequired] = useState(true)
  const [fieldOptions, setFieldOptions] = useState('')
  const [fieldDirty, setFieldDirty] = useState(false)
  const [savingField, setSavingField] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<RegistrationField | null>(null)
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({})

  const brandingDirty = useMemo(() => JSON.stringify(branding) !== JSON.stringify(savedBranding), [branding, savedBranding])
  const activeFields = useMemo(() => fields.filter(field => field.is_active), [fields])
  const filteredFields = useMemo(() => fields.filter(field => {
    const matchVisibility = visibility === 'all' || (visibility === 'active' ? field.is_active : !field.is_active)
    const term = search.trim().toLowerCase()
    return matchVisibility && (!term || `${field.label} ${FIELD_TYPE_LABELS[field.field_type]}`.toLowerCase().includes(term))
  }), [fields, search, visibility])
  const canReorder = search.trim() === '' && visibility === 'all'

  useEffect(() => { void loadSettings() }, [])

  async function loadSettings() {
    setLoading(true)
    setPageError(null)
    try {
      const { organizationId } = await getStaffOrganizationContext()
      setOrgId(organizationId)
      const [fieldResult, settingsResult] = await Promise.all([
        supabase.from('registration_fields').select('*').eq('organization_id', organizationId).order('display_order'),
        supabase.from('organization_settings').select('*').eq('organization_id', organizationId).maybeSingle(),
      ])
      if (fieldResult.error) throw fieldResult.error
      if (settingsResult.error) throw settingsResult.error
      setFields((fieldResult.data ?? []) as RegistrationField[])
      const settings = settingsResult.data
      const loaded = {
        tagline: settings?.marketing_tagline ?? '',
        phone: settings?.contact_phone ?? '',
        whatsapp: settings?.whatsapp_url ?? '',
        websiteUrl: settings?.website_url ?? '',
      }
      setBranding(loaded)
      setSavedBranding(loaded)
    } catch (error) {
      setPageError(`Could not load organization settings: ${errorMessage(error)}`)
    } finally {
      setLoading(false)
    }
  }

  async function initializeRegistrationFields() {
    if (!orgId || fields.length) return
    setBusyId('initializing')
    setPageError(null)
    try {
      const initial = defaultAssessmentSettings.studentFields.map((field, index) => ({
        organization_id: orgId,
        label: field.label,
        field_key: field.id,
        field_type: field.type === 'select' ? 'dropdown' : field.type,
        is_required: field.required,
        is_active: field.enabled,
        display_order: index,
        options: field.options ?? null,
      }))
      const { error } = await supabase.from('registration_fields').insert(initial)
      if (error) throw error
      await loadSettings()
      setNotice('Default registration fields added. You can now customize them.')
    } catch (error) {
      setPageError(`Could not add registration fields: ${errorMessage(error)}`)
    } finally {
      setBusyId(null)
    }
  }

  async function saveBranding() {
    if (!orgId) throw new Error('No organization is linked to this account.')
    if (!isHttpUrl(branding.whatsapp) || !isHttpUrl(branding.websiteUrl)) throw new Error('Enter valid http:// or https:// links for WhatsApp and website.')
    setSavingBranding(true)
    setBrandingError(null)
    try {
      const values = {
        organization_id: orgId,
        marketing_tagline: branding.tagline.trim() || null,
        contact_phone: branding.phone.trim() || null,
        whatsapp_url: branding.whatsapp.trim() || null,
        website_url: branding.websiteUrl.trim() || null,
        updated_at: new Date().toISOString(),
      }
      const { data: existing, error: lookupError } = await supabase.from('organization_settings')
        .select('id').eq('organization_id', orgId).maybeSingle()
      if (lookupError) throw lookupError
      const { error } = existing?.id
        ? await supabase.from('organization_settings').update(values).eq('id', existing.id).eq('organization_id', orgId)
        : await supabase.from('organization_settings').insert(values)
      if (error) throw error
      setSavedBranding({ ...branding })
      setNotice('Organization details saved.')
    } catch (error) {
      const message = errorMessage(error)
      setBrandingError(message)
      throw error
    } finally { setSavingBranding(false) }
  }

  function openFieldModal(mode: 'create' | 'edit', field?: RegistrationField) {
    setFieldModal(mode)
    setEditingFieldId(field?.id ?? null)
    setFieldLabel(field?.label ?? '')
    setFieldKey(field?.field_key ?? '')
    setFieldType(field?.field_type ?? 'text')
    setFieldRequired(field?.is_required ?? true)
    setFieldOptions(field?.options?.join('\n') ?? '')
    setFieldDirty(false)
    setFieldError(null)
    setConfirmDiscard(false)
  }
  function requestCloseFieldModal() {
    if (savingField) return
    if (fieldDirty) setConfirmDiscard(true)
    else closeFieldModal()
  }
  function closeFieldModal() {
    setFieldModal(null)
    setEditingFieldId(null)
    setFieldDirty(false)
    setConfirmDiscard(false)
    setFieldError(null)
  }
  async function saveField() {
    setFieldError(null)
    if (!orgId) { setFieldError('No organization is linked to this account.'); return false }
    if (!fieldLabel.trim()) { setFieldError('Field label is required.'); return false }
    const cleanKey = fieldModal === 'edit' ? fieldKey : slugify(fieldLabel)
    if (!cleanKey) { setFieldError('Enter a field label using letters or numbers.'); return false }
    const needsOptions = ['dropdown', 'radio', 'checkbox'].includes(fieldType)
    const options = needsOptions ? [...new Set(fieldOptions.split(/[\n,]+/).map(item => item.trim()).filter(Boolean))] : null
    if (needsOptions && (!options || options.length === 0)) { setFieldError('Add at least one option for this field type.'); return false }
    if (fields.some(f => f.field_key === cleanKey && f.id !== editingFieldId)) { setFieldError('A registration field with this name already exists. Please choose another label.'); return false }
    setSavingField(true)
    try {
      if (fieldModal === 'create') {
        const { data, error } = await supabase.from('registration_fields').insert({
          organization_id: orgId, label: fieldLabel.trim(), field_key: cleanKey, field_type: fieldType,
          is_required: fieldRequired, options, display_order: fields.reduce((max, field) => Math.max(max, field.display_order), -1) + 1, is_active: true,
        }).select('*').single()
        if (error) throw error
        if (!data) throw new Error('No field was returned after saving.')
        setFields(prev => [...prev, data as RegistrationField])
        setNotice('Registration field created.')
      } else if (fieldModal === 'edit' && editingFieldId) {
        const { data, error } = await supabase.from('registration_fields').update({
          label: fieldLabel.trim(), field_type: fieldType, is_required: fieldRequired,
          options, updated_at: new Date().toISOString(),
        }).eq('id', editingFieldId).eq('organization_id', orgId).select('*').single()
        if (error) throw error
        if (!data) throw new Error('The field could not be found.')
        setFields(prev => prev.map(f => f.id === editingFieldId ? data as RegistrationField : f))
        setNotice('Registration field updated.')
      } else throw new Error('No field is selected.')
      closeFieldModal()
      return true
    } catch (error) {
      setFieldError(errorMessage(error))
      return false
    } finally { setSavingField(false) }
  }

  async function toggleVisibility(field: RegistrationField) {
    if (!orgId || busyId) return
    setBusyId(field.id)
    setPageError(null)
    try {
      const { data, error } = await supabase.from('registration_fields').update({ is_active: !field.is_active })
        .eq('id', field.id).eq('organization_id', orgId).select('*').single()
      if (error) throw error
      if (!data) throw new Error('Field not found.')
      setFields(prev => prev.map(f => f.id === field.id ? data as RegistrationField : f))
    } catch (error) { setPageError(`Could not change field visibility: ${errorMessage(error)}`) }
    finally { setBusyId(null) }
  }

  async function moveField(index: number, direction: -1 | 1) {
    const targetIndex = index + direction
    if (!orgId || busyId || !canReorder || targetIndex < 0 || targetIndex >= fields.length) return
    const first = fields[index], second = fields[targetIndex]
    if (!first || !second) return
    setBusyId(first.id)
    setPageError(null)
    try {
      const [firstResult, secondResult] = await Promise.all([
        supabase.from('registration_fields').update({ display_order: second.display_order }).eq('id', first.id).eq('organization_id', orgId),
        supabase.from('registration_fields').update({ display_order: first.display_order }).eq('id', second.id).eq('organization_id', orgId),
      ])
      if (firstResult.error) throw firstResult.error
      if (secondResult.error) throw secondResult.error
      setFields(prev => {
        const next = [...prev]
        const a = next[index], b = next[targetIndex]
        next[index] = { ...b, display_order: a.display_order }
        next[targetIndex] = { ...a, display_order: b.display_order }
        return next
      })
    } catch (error) {
      setPageError(`Could not reorder fields: ${errorMessage(error)}. Reload settings before trying again.`)
    } finally { setBusyId(null) }
  }

  async function deleteField() {
    if (!deleteTarget || !orgId || busyId) return
    const target = deleteTarget
    setBusyId(target.id)
    setPageError(null)
    try {
      const { error } = await supabase.from('registration_fields').delete().eq('id', target.id).eq('organization_id', orgId)
      if (error) throw error
      setFields(prev => prev.filter(f => f.id !== target.id))
      setDeleteTarget(null)
      setNotice(`Deleted "${target.label}".`)
    } catch (error) { setPageError(`Could not delete field: ${errorMessage(error)}`) }
    finally { setBusyId(null) }
  }

  const savePendingChanges = async () => {
    if (fieldModal && fieldDirty) {
      if (!(await saveField())) throw new Error('Fix the field errors before leaving the page.')
    }
    if (brandingDirty) await saveBranding()
  }
  const markClean = useUnsavedChanges(brandingDirty || Boolean(fieldModal && fieldDirty), savePendingChanges)

  const renderPreview = () => (
    <SettingsPanel title="Student registration preview" description="See what students will see when they register."
      action={<span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"><Eye className="h-3.5 w-3.5" /> Preview only</span>}>
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <Smartphone className="h-5 w-5 text-blue-600" />
          <div><p className="text-sm font-bold text-slate-900">Before the assessment begins</p><p className="text-xs text-slate-500">{activeFields.length} visible fields · {activeFields.filter(f => f.is_required).length} required</p></div>
        </div>
        {activeFields.length === 0 ? <SettingsNotice kind="info">There are no visible registration fields. Enable a field in the Registration fields tab to preview it.</SettingsNotice> :
          activeFields.map(field => <div key={field.id} className="rounded-xl border border-slate-100 bg-white p-2">
            <DynamicRegistrationField field={field} value={previewValues[field.field_key] ?? ''} onChange={value => setPreviewValues(prev => ({ ...prev, [field.field_key]: value }))} />
          </div>)}
        <button type="button" disabled className="w-full cursor-not-allowed rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white opacity-65">Start Assessment (preview only)</button>
      </div>
    </SettingsPanel>
  )

  return <AdminLayout title="System Settings & Administration" subtitle="Student registration, organization identity, and intake preview">
    <div className="mx-auto max-w-7xl space-y-5 pb-10">
      <SettingsWorkspaceHeader active={tab} onChange={setTab} total={fields.length} activeCount={activeFields.length} required={activeFields.filter(f => f.is_required).length} hidden={fields.length - activeFields.length} />
      {pageError && <SettingsNotice kind="error" onDismiss={() => setPageError(null)}>{pageError} <button type="button" onClick={() => void loadSettings()} className="ml-2 font-semibold underline">Reload</button></SettingsNotice>}
      {notice && <SettingsNotice kind="success" onDismiss={() => setNotice(null)}>{notice}</SettingsNotice>}
      {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500" role="status">Loading organization settings…</div> : <>
        {tab === 'fields' && <SettingsPanel title="Student registration fields" description="Search, edit, reorder, or hide the fields students complete before taking an assessment."
          action={<button type="button" onClick={() => openFieldModal('create')} className={primaryButton}><Plus className="h-4 w-4" /> Add field</button>}>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row">
            <label className="relative block flex-1"><span className="sr-only">Search registration fields</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input className={`${inputClass} pl-9`} placeholder="Search fields by name or type…" value={search} onChange={e => setSearch(e.target.value)} /></label>
            <label className="sr-only" htmlFor="field-visibility">Filter visibility</label>
            <select id="field-visibility" className={`${inputClass} sm:w-44`} value={visibility} onChange={e => setVisibility(e.target.value as 'all' | 'active' | 'hidden')}><option value="all">All fields</option><option value="active">Visible fields</option><option value="hidden">Hidden fields</option></select>
          </div>
          {!canReorder && <p className="mb-3 text-xs text-slate-500">Clear search and choose All fields to reorder the full form.</p>}
          {fields.length === 0 ? <div className="rounded-xl border-2 border-dashed border-slate-200 p-10 text-center"><p className="font-semibold text-slate-800">No registration fields yet</p><p className="mt-1 text-sm text-slate-500">Add your own fields or start with the four standard student fields.</p><button type="button" disabled={busyId !== null} onClick={() => void initializeRegistrationFields()} className={`${primaryButton} mt-4`}>Add four standard fields</button></div> : filteredFields.length === 0 ? <div className="rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">No fields match these filters.</div> :
            <div className="space-y-3">{filteredFields.map(field => {
              const index = fields.findIndex(f => f.id === field.id)
              return <div key={field.id} className={`flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${field.is_active ? 'border-slate-200 bg-slate-50/60' : 'border-slate-200 bg-slate-100/70'}`}>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold text-slate-900">{field.label}</span><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${field.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{field.is_active ? 'Visible' : 'Hidden'}</span>{field.is_required && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">Required</span>}</div>
                  <div className="flex flex-wrap gap-2 text-xs text-slate-500"><span className="rounded-md border border-slate-200 bg-white px-2 py-1">{FIELD_TYPE_LABELS[field.field_type] ?? field.field_type}</span>{field.options && field.options.length > 0 && <span className="rounded-md border border-slate-200 bg-white px-2 py-1">{field.options.length} choices</span>}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" title="Move up" aria-label={`Move ${field.label} up`} disabled={!canReorder || index === 0 || busyId !== null} onClick={() => void moveField(index, -1)} className={secondaryButton}><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" title="Move down" aria-label={`Move ${field.label} down`} disabled={!canReorder || index === fields.length - 1 || busyId !== null} onClick={() => void moveField(index, 1)} className={secondaryButton}><ArrowDown className="h-4 w-4" /></button>
                  <button type="button" onClick={() => openFieldModal('edit', field)} className={secondaryButton}><Pencil className="h-4 w-4" /> Edit</button>
                  <button type="button" disabled={busyId !== null} onClick={() => void toggleVisibility(field)} className={secondaryButton}>{field.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{field.is_active ? 'Hide' : 'Show'}</button>
                  <button type="button" disabled={busyId !== null} onClick={() => setDeleteTarget(field)} aria-label={`Delete ${field.label}`} title="Delete field" className="rounded-xl p-2.5 text-rose-600 hover:bg-rose-50 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            })}</div>}
          <div className="mt-5 flex items-start gap-2 rounded-xl bg-blue-50 p-3 text-xs text-blue-800"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /> Hiding a field removes it from new student registrations without deleting it.</div>
        </SettingsPanel>}
        {tab === 'branding' && <SettingsPanel title="Organization & report branding" description="Edit the contact details and footer information shown in your student-facing materials." action={brandingDirty ? <span className="text-xs font-semibold text-amber-700">Unsaved changes</span> : <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><Check className="h-4 w-4" /> Saved</span>}>
          <form className="max-w-3xl space-y-5" onSubmit={async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); try { await saveBranding(); markClean() } catch {} }}>
            {brandingError && <SettingsNotice kind="error" onDismiss={() => setBrandingError(null)}>{brandingError}</SettingsNotice>}
            <div><label htmlFor="org-tagline" className="mb-1.5 block text-sm font-semibold text-slate-700">Marketing tagline / report footer</label><input id="org-tagline" className={inputClass} value={branding.tagline} onChange={e => setBranding(prev => ({ ...prev, tagline: e.target.value }))} placeholder="Your organization tagline" /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label htmlFor="org-phone" className="mb-1.5 block text-sm font-semibold text-slate-700">Contact phone</label><input id="org-phone" className={inputClass} value={branding.phone} onChange={e => setBranding(prev => ({ ...prev, phone: e.target.value }))} placeholder="+20 …" /></div>
              <div><label htmlFor="org-whatsapp" className="mb-1.5 block text-sm font-semibold text-slate-700">WhatsApp URL</label><input id="org-whatsapp" className={inputClass} type="url" value={branding.whatsapp} onChange={e => setBranding(prev => ({ ...prev, whatsapp: e.target.value }))} placeholder="https://wa.me/…" /></div>
            </div>
            <div><label htmlFor="org-website" className="mb-1.5 block text-sm font-semibold text-slate-700">Website URL</label><input id="org-website" className={inputClass} type="url" value={branding.websiteUrl} onChange={e => setBranding(prev => ({ ...prev, websiteUrl: e.target.value }))} placeholder="https://example.com" /></div>
            <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-5"><button type="submit" disabled={savingBranding || !brandingDirty} className={primaryButton}><Save className="h-4 w-4" /> {savingBranding ? 'Saving…' : 'Save changes'}</button><button type="button" disabled={savingBranding || !brandingDirty} className={secondaryButton} onClick={() => { setBranding({ ...savedBranding }); setBrandingError(null); markClean() }}><RotateCcw className="h-4 w-4" /> Discard changes</button></div>
          </form>
        </SettingsPanel>}
        {tab === 'preview' && renderPreview()}
      </>}
    </div>

    {fieldModal && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) requestCloseFieldModal() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="field-modal-title" className="my-auto w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3"><div><h2 id="field-modal-title" className="text-lg font-bold text-slate-900">{fieldModal === 'create' ? 'Add registration field' : 'Edit registration field'}</h2><p className="mt-1 text-sm text-slate-500">Configure how this question appears in student registration.</p></div><button type="button" aria-label="Close field editor" className={secondaryButton} onClick={requestCloseFieldModal}>×</button></div>
        {fieldError && <div className="mb-4"><SettingsNotice kind="error">{fieldError}</SettingsNotice></div>}
        {confirmDiscard ? <div className="space-y-4"><SettingsNotice kind="info">Discard the unsaved changes to this field?</SettingsNotice><div className="flex justify-end gap-2"><button type="button" className={secondaryButton} onClick={() => setConfirmDiscard(false)}>Keep editing</button><button type="button" className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700" onClick={closeFieldModal}>Discard changes</button></div></div> :
          <form className="space-y-4" onChangeCapture={() => setFieldDirty(true)} onSubmit={async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); if (await saveField()) markClean() }}>
            <div><label htmlFor="field-label" className="mb-1.5 block text-sm font-semibold text-slate-700">Field label *</label><input id="field-label" className={inputClass} required value={fieldLabel} onChange={e => setFieldLabel(e.target.value)} placeholder="e.g. Current grade" /></div>
            <div><label htmlFor="field-type" className="mb-1.5 block text-sm font-semibold text-slate-700">Field type</label><select id="field-type" className={inputClass} value={fieldType} onChange={e => setFieldType(e.target.value as FieldType)}>{Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            {['dropdown', 'radio', 'checkbox'].includes(fieldType) && <div><label htmlFor="field-options" className="mb-1.5 block text-sm font-semibold text-slate-700">Choices (one per line) *</label><textarea id="field-options" className={inputClass} rows={4} value={fieldOptions} onChange={e => setFieldOptions(e.target.value)} placeholder={'Option 1\nOption 2'} /></div>}
            <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><input type="checkbox" className="mt-1" checked={fieldRequired} onChange={e => setFieldRequired(e.target.checked)} /><span><strong className="block text-slate-900">Required field</strong>Students must complete this before beginning an assessment.</span></label>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" className={secondaryButton} onClick={requestCloseFieldModal}>Cancel</button><button type="submit" disabled={savingField} className={primaryButton}>{savingField ? 'Saving…' : 'Save field'}</button></div>
          </form>}
      </div>
    </div>}

    {deleteTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"><div role="alertdialog" aria-modal="true" aria-labelledby="delete-field-title" className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-2xl"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600"><Trash2 className="h-6 w-6" /></div><h2 id="delete-field-title" className="text-lg font-bold text-slate-900">Delete registration field?</h2><p className="text-sm leading-6 text-slate-600">This will delete <strong>{deleteTarget.label}</strong> from the current registration form. Hiding is safer if you might need the field again. This action does not intentionally alter existing student attempts.</p><div className="flex justify-end gap-2"><button type="button" disabled={busyId !== null} className={secondaryButton} onClick={() => setDeleteTarget(null)}>Cancel</button><button type="button" disabled={busyId !== null} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50" onClick={() => void deleteField()}>{busyId === deleteTarget.id ? 'Deleting…' : 'Delete field'}</button></div></div></div>}
  </AdminLayout>
}
