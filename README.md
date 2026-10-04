# Private Chatbot

A chat interface over a local LLM, built on Next.js. The conversation is
designed to be **unrecoverable once the tab closes** — there is no history, no
database, and no browser storage anywhere in the project.

## How the privacy guarantee works

The rule this project follows: **never write the transcript anywhere.**

Deleting stored data can fail — a crashed tab, a full disk, a browser restoring
session state on relaunch. Never persisting it is the only guarantee that holds.

| Layer | What it does |
|---|---|
| **Browser** | History lives in React state only. No `localStorage`, `sessionStorage`, IndexedDB, or cookies. |
| **Server** | An in-process `Map` holds the transcript for the active session. No database, no file writes. |
| **Teardown** | `pagehide` + `visibilitychange` clear the client and notify the server; the server overwrites and drops its copy. |
| **Expiry** | Idle sessions are evicted after one hour. |

There is no route that lists past conversations, so there is nothing to revisit.

**Honest limitation:** your prompts still travel to whichever model provider is
behind the proxy. "Private" here means *this application stores nothing* — it
cannot make the upstream inference provider forget a request.

## Requirements

- Node.js 18.18+ (built and verified on 26.7)
- The Hermes proxy running locally:

```bash
hermes proxy start --provider nous --host 127.0.0.1 --port 8645
```

The proxy attaches the credentials Hermes already holds, so no API key is stored
in this project or sent from the browser.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Configuration

Both variables are optional; the defaults match a local Hermes proxy.

```bash
# .env.local
HERMES_PROXY_URL=http://127.0.0.1:8645/v1
HERMES_MODEL=inclusionai/ling-3.0-flash-sante:free
```

`HERMES_PROXY_URL` is server-side only and never reaches the browser.

### Available models

`/v1/models` on the proxy lists what your account can reach. Free models
verified working at the time of writing:

- `inclusionai/ling-3.0-flash-sante:free`
- `stepfun/step-3.7-flash:free`
- `poolside/laguna-xs-2.1:free`

Paid models return `insufficient_credits_for_paid_model` on an account with no
credits. Reasoning-heavy models may consume the whole `max_tokens` budget on
internal reasoning and return an empty reply, which is why the client requests
2000 tokens.

## Layout

```
src/
  app/
    page.tsx              renders <Chat>
    chat.tsx              UI and composer
    globals.css           dark theme, no external fonts
    layout.tsx
    api/
      session/route.ts    mints a session id
      chat/route.ts       relays to the Hermes proxy
      session/end/route.ts wipes the transcript
  lib/
    session.ts            in-process transcript store
    hermes.ts             proxy client (OpenAI-compatible SSE)
    useEphemeralSession.ts  client state + teardown
```

## API

- `POST /api/session` → `{ sessionId }`
- `POST /api/chat` → `{ reply }`, body `{ sessionId, message }`
- `POST /api/session/end` → `{ ok: true }`

An unknown or wiped `sessionId` returns `404`.

## Security notes

- `poweredByHeader: false`
- No external requests — fonts, scripts, and styles are all served locally
- `allowedDevOrigins` is set because Next 16 otherwise blocks dev assets from
  `127.0.0.1`, which silently prevents hydration
- The proxy binds to loopback, so it is reachable only from this machine

## License

MIT