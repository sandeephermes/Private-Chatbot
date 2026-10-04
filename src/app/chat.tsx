'use client'

import { useEffect, useRef, useState } from 'react'
import { useEphemeralSession } from '@/lib/useEphemeralSession'

export default function Chat() {
  const { messages, status, error, send, endChat } = useEphemeralSession()
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Keep the newest message in view without yanking the page if the user
  // has deliberately scrolled up to re-read something.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 220
    if (nearBottom) el.scrollTop = el.scrollHeight
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [status])

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const text = draft
    setDraft('')
    void send(text)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter is a newline.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send(draft)
      setDraft('')
    }
  }

  const busy = status === 'streaming'
  const empty = messages.length === 0

  return (
    <main className="shell">
      <header className="bar">
        <div className="brand">
          <span className="mark" aria-hidden="true">H</span>
          <div>
            <h1>Private Chat</h1>
            <p className="sub">
              Runs on your machine through the Hermes proxy. Nothing is stored.
            </p>
          </div>
        </div>

        <button type="button" onClick={endChat} className="end" disabled={messages.length === 0}>
          End chat
        </button>
      </header>

      <div className="privacy" role="note">
        <span className="dot" aria-hidden="true" />
        No history, no database, no browser storage. Close the tab and this
        conversation is gone.
      </div>

      <div className="scroll" ref={scrollRef}>
        {status === 'starting' && <p className="hint">Starting a private session…</p>}

        {empty && status !== 'starting' && (
          <div className="welcome">
            <h2>Say anything.</h2>
            <p>
              This conversation exists only in memory. It is never written to
              disk, and there is no list of past chats to return to.
            </p>
          </div>
        )}

        {messages.map((message, index) => (
          <article key={index} className={`msg ${message.role}`}>
            <span className="who">{message.role === 'user' ? 'You' : 'Hermes'}</span>
            <p>{message.content}</p>
          </article>
        ))}

        {busy && (
          <article className="msg assistant">
            <span className="who">Hermes</span>
            <p className="typing" aria-label="Hermes is replying">
              <span /><span /><span />
            </p>
          </article>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
            <button type="button" onClick={endChat}>End and reset</button>
          </p>
        )}
      </div>

      <form className="composer" onSubmit={submit}>
        <label htmlFor="prompt" className="sr-only">Your message</label>
        <textarea
          id="prompt"
          ref={inputRef}
          rows={1}
          value={draft}
          placeholder="Ask something…"
          disabled={status === 'starting' || busy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="submit" disabled={status === 'starting' || busy || draft.trim() === ''}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </form>

      <p className="hint foot">
        Enter to send · Shift+Enter for a new line
      </p>
    </main>
  )
}