'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Message } from '@/lib/session'

type Status = 'starting' | 'ready' | 'streaming' | 'error'

/**
 * Ephemeral session state.
 *
 * Every field below lives in a React closure for the lifetime of the tab and
 * nowhere else. There is intentionally no `sessionStorage`, no `localStorage`,
 * no IndexedDB, and no cookie in this component — the conversation is
 * unrecoverable once the tab closes, which is the point of the product.
 */
export function useEphemeralSession() {
  const [messages, setMessages] = useState<Message[]>([])
  const [status, setStatus] = useState<Status>('starting')
  const [error, setError] = useState<string | null>(null)

  /**
   * False during SSR and the first client render, true after mount.
   *
   * The session id is minted by the server and fetched over HTTP, so the first
   * client render cannot know it. Rendering the pre-session UI on the server
   * would produce markup the client's first pass immediately contradicts —
   * `disabled` on the textarea, `Starting a private session…` — and React
   * reports a hydration mismatch it cannot patch. Deferring the interactive UI
   * until after mount makes the two renders identical.
   */
  const [mounted, setMounted] = useState(false)

  // Refs, not state: these must be readable inside `fetch` callbacks and
  // unload handlers without triggering a re-render or a stale closure.
  const sessionIdRef = useRef<string | null>(null)
  const inFlightRef = useRef<AbortController | null>(null)
  const endedRef = useRef(false)

  /** Tell the server to drop its copy. Fire-and-forget; never block unload on it. */
  const endOnServer = useCallback((id: string | null) => {
    if (!id) return
    const body = JSON.stringify({ sessionId: id })
    // `keepalive` lets the request outlive the document during unload.
    // sendBeacon is the more reliable signal during pagehide; try both.
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        '/api/session/end',
        new Blob([body], { type: 'application/json' }),
      )
      return
    }
    void fetch('/api/session/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      /* The server evicts stale sessions after an hour regardless. */
    })
  }, [])

  const wipeLocal = useCallback(() => {
    setMessages([])
    setError(null)
    inFlightRef.current?.abort()
    inFlightRef.current = null
    sessionIdRef.current = null
    endedRef.current = true
  }, [])

  // Open a session on mount.
  useEffect(() => {
    // Flip this before the fetch resolves so the very next render is the
    // post-mount UI, not the server-matched placeholder.
    setMounted(true)
    const controller = new AbortController()

    void (async () => {
      try {
        const res = await fetch('/api/session', {
          method: 'POST',
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`Session request failed (${res.status})`)
        const data = (await res.json()) as { sessionId?: unknown }
        if (typeof data.sessionId !== 'string') throw new Error('Malformed session id')
        sessionIdRef.current = data.sessionId
        setStatus('ready')
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Could not start a session.')
        setStatus('error')
      }
    })()

    return () => controller.abort()
  }, [])

  /**
   * Wipe on the way out.
   *
   * `pagehide` fires for tab close, navigation, and bfcache entry — more
   * reliably than `beforeunload`, which browsers skip when discarding a tab.
   * `visibilitychange` catches the mobile case where a tab is backgrounded and
   * later killed without ever firing `pagehide`.
   */
  useEffect(() => {
    const teardown = () => {
      if (endedRef.current) return
      endedRef.current = true
      inFlightRef.current?.abort()
      wipeLocal()
      endOnServer(sessionIdRef.current)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') teardown()
    }

    window.addEventListener('pagehide', teardown)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', teardown)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [endOnServer, wipeLocal])

  const send = useCallback(async (raw: string) => {
    const text = raw.trim()
    const sessionId = sessionIdRef.current
    if (!text || !sessionId || status === 'streaming') return

    setError(null)
    setStatus('streaming')

    // Optimistic append keeps the UI responsive. The server holds the same turn.
    setMessages((prev) => [...prev, { role: 'user', content: text }])

    const controller = new AbortController()
    inFlightRef.current = controller

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(detail.error ?? `Request failed (${res.status})`)
      }

      const data = (await res.json()) as { reply?: string }
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply ?? '' }])
      setStatus('ready')
    } catch (err) {
      if (controller.signal.aborted) return
      // Drop the optimistic turn — it never reached a reply, so leaving it
      // would show a question the assistant ignored.
      setMessages((prev) => prev.slice(0, -1))
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setStatus('error')
    } finally {
      inFlightRef.current = null
    }
  }, [status])

  /** Explicit "End chat" — same teardown, without closing the tab. */
  const endChat = useCallback(() => {
    endOnServer(sessionIdRef.current)
    wipeLocal()
    setStatus('ready')
  }, [endOnServer, wipeLocal])

  return { mounted, messages, status, error, send, endChat }
}