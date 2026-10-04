import { NextResponse } from 'next/server'
import { createSessionId, ensureSession, pruneStaleSessions } from '@/lib/session'

export const dynamic = 'force-dynamic'

/**
 * Mint a session when the page opens.
 *
 * The id is generated server-side so the browser never authors it, and it is
 * kept in a closure variable in the client rather than any storage API — see
 * `Chat.tsx`. There is no list endpoint anywhere in this app, so there is no
 * way to enumerate or revisit past conversations.
 */
export async function POST(): Promise<NextResponse> {
  pruneStaleSessions()
  const id = createSessionId()
  ensureSession(id)
  return NextResponse.json({ sessionId: id })
}