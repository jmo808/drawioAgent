import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import App from './App'

const mockProviders = {
  providers: [
    { provider: 'ollama', model: 'llama3' }
  ]
}

describe('App', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockProviders)
      })
    ) as any
  })

  test('renders ChatPanel container initially', () => {
    render(<App />)
    expect(screen.getByPlaceholderText(/ask antigravity/i)).toBeInTheDocument()
  })
})
