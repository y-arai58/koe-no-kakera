import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/koe-no-kakera/' : '/',
  server: { port: 3000 },
  plugins: [
    tanstackStart({
      prerender: {
        enabled: true,
        failOnError: true,
      },
    }),
    viteReact(),
  ],
})
