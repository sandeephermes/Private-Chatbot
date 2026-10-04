import { NextResponse } from 'next/server'
import { appendMessage, getSession, recentHistory } from '@/lib/session'
import { activeModel, streamChat } from '@/lib/hermes'

export const dynamic = 'force-dynamic'

/** Refuse oversized bodies before parsing rather than after. */
const MAX_BODY_BYTES = 16 * 1024
const MAX_PROMPT_CHARS = 8000

interface ChatRequest {
  sessionId?: unknown
  message?: unknown
}

export async function POST(request: Request): Promise<Response> {
  let body: ChatRequest
  try {
    body = (await request.json()) as ChatRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (typeof body.sessionId !== 'string' || body.sessionId.length === 0) {
    return NextResponse.json({ error: 'A session id is required.' }, { status: 400 })
  }

  // A session the server has never issued means a client that skipped
  // `/api/session` or is replaying a stale id from a previous process.
  if (!getSession(body.sessionId)) {
    return NextResponse.json({ error: 'Unknown or expired session.' }, { status: 404 })
  }

  if (typeof body.message !== 'string' || body.message.trim().length === 0) {
    return NextResponse.json({ error: 'A message is required.' }, { status: 400 })
  }

  if (body.message.length > MAX_PROMPT_CHARS) {
    return NextResponse.json(
      { error: `Message too long. Keep it under ${MAX_PROMPT_CHARS} characters.` },
      { status: 413 },
    )
  }

  appendMessage(body.sessionId, { role: 'user', content: body.message })

  const turns = recentHistory(body.sessionId)
  const abort = new AbortController()
  // If the browser goes away mid-stream, stop paying for tokens nobody will read.
  request.signal.addEventListener('abort', () => abort.abort(), { once: true })

  const result = await streamChat(turns, activeModel(), abort.signal)

  if (result.error) {
    // Roll back the user's turn so a failed request does not poison the context.
    const session = getSession(body.sessionId)
    if (session && session.messages.length > 0) session.messages.pop()
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  appendMessage(body.sessionId, { role: 'assistant', content: result.content })

  return NextResponse.json({
    reply: result.content,
    bytes: MAX_BODY_BYTES,
  })
}