import type { Metadata } from 'next'
import './globals.css'
import Chat from './chat'

export const metadata: Metadata = {
  title: 'Private Chat — Hermes',
  description:
    'A chat interface over a local LLM. No history, no database, no browser storage.',
  robots: { index: false, follow: false },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}