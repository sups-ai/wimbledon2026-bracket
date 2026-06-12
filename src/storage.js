const LS_KEY = 'wimbledon2026_elc_v1';

export function loadSession() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Basic shape validation
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(data) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch (e) {
    // localStorage full or unavailable — fail silently
    console.warn('Session save failed:', e);
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {}
}

/**
 * Partially update the stored session without overwriting the whole object.
 * Useful for updating a single field (e.g. redrawUsed) mid-session.
 */
export function patchSession(patch) {
  const existing = loadSession() || {};
  saveSession({ ...existing, ...patch });
}
