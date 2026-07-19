import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { App } from '../App'

const mockProviders = {
  providers: [
    { provider: 'ollama', model: 'llama3' },
    { provider: 'openai', model: 'gpt-4' }
  ]
}

describe('Privacy Notice and Consent Flow', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockProviders)
      })
    )
  })

  test('privacy banner renders when cloud provider is active and consent not given', async () => {
    render(<App />)
    
    // Select OpenAI provider
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })
    
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'openai' } })
    
    // Privacy banner should render
    expect(screen.getByTestId('privacy-notice')).toBeInTheDocument()
    expect(screen.getByText(/Privacy Warning:/i)).toBeInTheDocument()
  })

  test('consent toggle state persists in localStorage', async () => {
    render(<App />)
    
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })
    
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'openai' } })
    
    // Click Accept
    const acceptBtn = screen.getByTestId('accept-consent-btn')
    fireEvent.click(acceptBtn)
    
    // Privacy banner should disappear
    expect(screen.queryByTestId('privacy-notice')).not.toBeInTheDocument()
    
    // localStorage state should be true
    expect(localStorage.getItem('drawio_agent_privacy_consent')).toBe('true')
  })

  test('cloud LLM requests are blocked when consent not given', async () => {
    render(<App />)
    
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })
    
    // Select OpenAI (cloud)
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'openai' } })
    
    // Try to send a message without consenting
    const input = screen.getByPlaceholderText(/ask archimedes/i)
    fireEvent.change(input, { target: { value: 'draw a server node' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
    
    // Message should be blocked and show error message
    expect(screen.getByText(/blocked because privacy consent/i)).toBeInTheDocument()
  })
})
