/**
 * Small wrappers around localStorage. Storage can be unavailable (private mode,
 * blocked site data), so every access is guarded and the app works without it.
 */

export interface Session {
  code: string;
  token: string;
}

const SESSION_KEY = 'legespiel.session';
const NAME_KEY = 'legespiel.name';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Not fatal: the player just can't resume after a reload.
  }
}

export function loadSession(): Session | null {
  const raw = read(SESSION_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<Session>;
    return typeof s.code === 'string' && typeof s.token === 'string' ? { code: s.code, token: s.token } : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null): void {
  write(SESSION_KEY, session ? JSON.stringify(session) : null);
}

export function loadName(): string {
  return read(NAME_KEY) ?? '';
}

export function saveName(name: string): void {
  write(NAME_KEY, name);
}

/** Room code from an invite link like /?raum=ABCDE. */
export function roomFromUrl(): string | null {
  const code = new URLSearchParams(window.location.search).get('raum');
  return code ? code.trim().toUpperCase() : null;
}

export function setRoomInUrl(code: string | null): void {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set('raum', code);
  else url.searchParams.delete('raum');
  window.history.replaceState(null, '', url);
}

export function inviteLink(code: string): string {
  const url = new URL(window.location.origin);
  url.searchParams.set('raum', code);
  return url.toString();
}
