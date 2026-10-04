/**
 * Session memory — the only place chat history exists, and it is deliberately
 * not a database.
 *
 * Design rule for this project: a conversation must be impossible to retrieve
 * after the tab closes. That rules out anything durable, so history lives in
 * process memory only and dies with the server or the explicit wipe below.
 *
 * There is no `localStorage`, `sessionStorage`, IndexedDB, cookie, or database
 * write anywhere in this codebase. Deleting stored data can fail silently —
 * a crashed tab, a full disk, a browser that restores session data on relaunch.
 * Never writing it is the only guarantee that actually holds.
 */

export type Role = 'user' | 'assistant'

export interface Message {
  role: Role
  content: string
}

/** Per-session transcript. Opaque to the client — the browser only knows its id. */
interface Session {
  messages: Message[]
  createdAt: number
  lastSeen: number
}

const SESSION_TTL_MS = 1000 * 60 * 60 // 1 hour

/**
 * In-process store. A `Map` keyed by session id, holding the transcript.
 *
 * Deliberately a module-level variable rather than a global: it is scoped to
 * this server process, is not shared between replicas, and evaporates on restart.
 * If this app were ever run on more than one instance, the buffer would have to
 * become per-instance routing — another reason not to reach for a database here.
 */
const sessions = new Map<string, Session>()

/** Generate a session id without pulling in a uuid dependency. */
export function createSessionId(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function getSession(id: string): Session | undefined {
  const session = sessions.get(id)
  if (!session) return undefined
  session.lastSeen = Date.now()
  return session
}

export function ensureSession(id: string): Session {
  const existing = getSession(id)
  if (existing) return existing
  const fresh: Session = { messages: [], createdAt: Date.now(), lastSeen: Date.now() }
  sessions.set(id, fresh)
  return fresh
}

export function appendMessage(id: string, message: Message): void {
  ensureSession(id).messages.push(message)
}

/**
 * Drop a session's transcript and overwrite the array slots before clearing the
 * map entry, so a lingering reference to the array does not keep the message
 * strings reachable through the JS heap. This is defence in depth for a process
 * that is about to be discarded anyway, not a guarantee against a memory dump.
 */
export function wipeSession(id: string): void {
  const session = sessions.get(id)
  if (!session) return
  for (let i = 0; i < session.messages.length; i += 1) {
    session.messages[i] = { role: 'user', content: '' }
  }
  session.messages.length = 0
  sessions.delete(id)
}

/** Evict sessions nobody has touched in an hour. Called on each request. */
export function pruneStaleSessions(): void {
  const cutoff = Date.now() - SESSION_TTL_MS
  for (const [id, session] of sessions) {
    if (session.lastSeen < cutoff) wipeSession(id)
  }
}

/**
 * A request body can carry an absurd number of messages; cap the transcript so a
 * runaway loop cannot grow the heap without bound. 100 turns is well past any
 * real conversation and keeps the upstream context window sane.
 */
export const MAX_MESSAGES = 100

export function recentHistory(id: string): Message[] {
  return ensureSession(id).messages.slice(-MAX_MESSAGES)
}