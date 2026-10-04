import { NextResponse } from 'next/server'
import { wipeSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

/**
 * End a conversation now.
 *
 * Called when the user ends the chat or closes the tab. Wiping server-side
 * matters even though the transcript is only in memory — it stops the next
 * request on that id from inheriting the previous exchange.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let sessionId: unknown
  try {
    const body = (await request.json()) as { sessionId?: unknown }
    sessionId = body.sessionId
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return NextResponse.json({ error: 'A session id is required.' }, { status: 400 })
  }

  wipeSession(sessionId)
  return NextResponse.json({ ok: true })
}