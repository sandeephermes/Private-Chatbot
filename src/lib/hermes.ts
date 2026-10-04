/**
 * Hermes proxy client.
 *
 * The app talks to a local Hermes proxy (`hermes proxy start`) rather than a
 * hosted provider directly. The proxy attaches the credentials Hermes already
 * holds, so no API key is ever stored in this project or sent from the browser.
 * It binds to 127.0.0.1, so this path is reachable only from this machine.
 */

const DEFAULT_BASE_URL = 'http://127.0.0.1:8645/v1'

/** Any non-empty bearer satisfies the local proxy; it ignores the value. */
const LOCAL_PLACEHOLDER_KEY = 'local'

export const DEFAULT_MODEL = 'inclusionai/ling-3.0-flash-sante:free'

export function proxyBaseUrl(): string {
  return process.env.HERMES_PROXY_URL ?? DEFAULT_BASE_URL
}

export function activeModel(): string {
  return process.env.HERMES_MODEL ?? DEFAULT_MODEL
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface StreamResult {
  /** Accumulates the assistant reply. */
  content: string
  /** Why the stream ended, when the upstream reported an error mid-flight. */
  error?: string
}

/**
 * Relay an OpenAI-compatible streaming completion from the Hermes proxy.
 *
 * The proxy returns SSE (`data: {...}` lines). Each chunk's `choices[0].delta`
 * may hold a content string; `[DONE]` closes the stream. Reasoning-only models
 * can emit tokens with no content, which is why this accumulates defensively
 * rather than assuming every delta carries text.
 *
 * `upstream` is passed so an abort on the client tears down the upstream fetch
 * instead of leaving the request hanging.
 */
export async function streamChat(
  turns: ChatTurn[],
  model: string,
  signal: AbortSignal,
): Promise<StreamResult> {
  const response = await fetch(`${proxyBaseUrl()}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LOCAL_PLACEHOLDER_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: turns,
      stream: true,
      // Reasoning models can spend the entire budget thinking and return an
      // empty reply, so leave room well above what a short answer needs.
      max_tokens: 2000,
    }),
    signal,
  })

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '')
    return { content: '', error: detail || `Hermes proxy returned ${response.status}` }
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // SSE frames are separated by a blank line; keep the trailing partial
      // frame in the buffer for the next read.
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''

      for (const frame of frames) {
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (payload === '[DONE]') return { content }

          try {
            const parsed = JSON.parse(payload) as {
              choices?: { delta?: { content?: string | null } }[]
              error?: { message?: string }
            }
            if (parsed.error?.message) return { content, error: parsed.error.message }
            const delta = parsed.choices?.[0]?.delta?.content
            if (typeof delta === 'string') content += delta
          } catch {
            // A frame that is not JSON is not a message; skip it.
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  return { content }
}