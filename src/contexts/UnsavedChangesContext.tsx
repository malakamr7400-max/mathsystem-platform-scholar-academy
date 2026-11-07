import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react'
import { useBlocker, useBeforeUnload } from 'react-router-dom'

interface UnsavedChangesRegistration {
  id: string
  isDirty: boolean
  onSave?: () => void | Promise<void>
  onDiscard?: () => void | Promise<void>
}

interface UnsavedChangesContextValue {
  register: (registration: UnsavedChangesRegistration) => void
  clear: (id: string) => void
  markClean: (id: string) => void
  suppress: () => void
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue>({
  register: () => {},
  clear: () => {},
  markClean: () => {},
  suppress: () => {},
})

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const [registration, setRegistration] = useState<UnsavedChangesRegistration | null>(null)
  const registrationRef = useRef<UnsavedChangesRegistration | null>(null)
  const [saving, setSaving] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [discardError, setDiscardError] = useState<string | null>(null)
  const [suppressing, setSuppressing] = useState(false)
  const blocker = useBlocker(Boolean(registration?.isDirty && !suppressing))

  // Keep the unload guard in this shared provider so the application has one
  // authoritative navigation-protection mechanism. The ref is updated
  // synchronously by register/clear/markClean/suppress, so a browser refresh
  // cannot observe a stale React render while the document is unloading.
  useBeforeUnload(
    useCallback((event: BeforeUnloadEvent) => {
      if (!registrationRef.current?.isDirty) return
      event.preventDefault()
      event.returnValue = ''
    }, [])
  )

  const register = useCallback((next: UnsavedChangesRegistration) => {
    registrationRef.current = next
    setRegistration((current) => {
      if (
        current?.id === next.id &&
        current.isDirty === next.isDirty &&
        current.onSave === next.onSave &&
        current.onDiscard === next.onDiscard
      ) {
        return current
      }
      return next
    })
  }, [])

  const clear = useCallback((id: string) => {
    setRegistration((current) => {
      if (current?.id !== id) return current
      registrationRef.current = null
      return null
    })
  }, [])

  const markClean = useCallback((id: string) => {
    setRegistration((current) => {
      if (current?.id !== id) return current
      registrationRef.current = null
      return null
    })
  }, [])

  const suppress = useCallback(() => {
    setSuppressing(true)
    registrationRef.current = null
    setRegistration(null)
  }, [])

  useEffect(() => {
    if (!suppressing) return
    blocker.reset?.()
    setSuppressing(false)
  }, [suppressing, blocker])

  const handleDiscard = async () => {
    if (discarding) return
    setDiscarding(true)
    setDiscardError(null)
    try {
      await registration?.onDiscard?.()
      registrationRef.current = null
      setRegistration(null)
      blocker.proceed?.()
    } catch (error) {
      setDiscardError(error instanceof Error ? error.message : 'Could not discard the pending changes.')
    } finally {
      setDiscarding(false)
    }
  }

  const handleContinueEditing = () => {
    setSaveError(null)
    setDiscardError(null)
    blocker.reset?.()
  }

  const handleSaveAndContinue = async () => {
    if (!registration?.onSave || saving) return
    setSaving(true)
    setSaveError(null)
    setDiscardError(null)
    try {
      await registration.onSave()
      markClean(registration.id)
      setRegistration(null)
      blocker.proceed?.()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <UnsavedChangesContext.Provider value={{ register, clear, markClean, suppress }}>
      {children}
      {blocker.state === 'blocked' && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/50 p-4" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-changes-title"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
          >
            <h2 id="unsaved-changes-title" className="text-base font-semibold text-slate-900">
              Unsaved changes
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Save your changes before leaving, discard them, or continue editing.
            </p>
            {(saveError || discardError) && (
              <p className="mt-3 text-sm text-rose-700">{saveError || discardError}</p>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={handleContinueEditing}
                disabled={saving || discarding}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Continue editing
              </button>
              <button
                type="button"
                onClick={handleDiscard}
                disabled={saving || discarding}
                className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                {discarding ? 'Discarding…' : 'Discard changes'}
              </button>
              <button
                type="button"
                onClick={handleSaveAndContinue}
                disabled={saving || discarding || !registration?.onSave}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </section>
        </div>
      )}
    </UnsavedChangesContext.Provider>
  )
}

export function useUnsavedChanges(
  isDirty: boolean,
  onSave?: () => void | Promise<void>,
  onDiscard?: () => void | Promise<void>
) {
  const id = useId()
  const { register, clear, markClean, suppress } = useContext(UnsavedChangesContext)
  const onSaveRef = useRef(onSave)
  const onDiscardRef = useRef(onDiscard)
  onSaveRef.current = onSave
  onDiscardRef.current = onDiscard

  const invokeSave = useCallback(() => onSaveRef.current?.(), [])
  const invokeDiscard = useCallback(() => onDiscardRef.current?.(), [])

  useEffect(() => {
    register({ id, isDirty, onSave: invokeSave, onDiscard: invokeDiscard })
    return () => clear(id)
  }, [id, isDirty, invokeSave, invokeDiscard, register, clear])

  return useCallback(() => {
    suppress()
    markClean(id)
  }, [id, markClean, suppress])
}

export default UnsavedChangesContext
