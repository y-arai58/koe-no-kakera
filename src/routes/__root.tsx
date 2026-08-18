import type { ReactNode } from 'react'
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: 'こえのかけら' },
      { name: 'description', content: '声とことばで、いまの気持ちを時刻ごとに残す記録帳。' },
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Kiwi+Maru:wght@400;500&family=Zen+Maru+Gothic:wght@400;500;700&display=swap' },
    ],
  }),
  component: RootComponent,
  notFoundComponent: () => <main className="not-found">ページが見つかりません。</main>,
})

function RootComponent() {
  return (
    <Document>
      <Outlet />
    </Document>
  )
}

function Document({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ja">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  )
}
