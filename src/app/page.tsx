import Chat from './chat'

// The transcript is per-request client state; nothing here is cacheable or
// shareable, so keep every response off any store.
export const dynamic = 'force-dynamic'

export default function Page() {
  return <Chat />
}