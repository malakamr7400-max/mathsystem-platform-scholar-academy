/**
 * Only a definitive rejection of the stored attempt/token pair permits removing
 * its device-local shortcut. Never interpret a timeout, offline request,
 * missing RPC, RLS/configuration failure, or generic 42501 as a deleted attempt.
 *
 * Step 78 RPC explicitly raises ERRCODE 42501 with this exact message for an
 * absent attempt OR a mismatched token. It does not reveal which case occurred.
 */
export function isUnusableResumeBookmarkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; message?: unknown }
  return candidate.code === '42501' &&
    typeof candidate.message === 'string' &&
    candidate.message.trim() === 'Invalid attempt or token'
}
