import react from '@vitejs/plugin-react'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

// https://vite.dev/config/
export default {
  plugins: [
    react() as any,
    cssInjectedByJsPlugin() as any
  ],
  build: {
    lib: {
      entry: './src/plugin-entry.ts',
      name: 'DrawioAgentPlugin',
      formats: ['iife'] as any,
      fileName: () => 'drawio-agent-plugin.js'
    },
    rollupOptions: {
      output: {
        extend: true
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts'
  }
}
