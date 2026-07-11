import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { ProviderSelector } from './ProviderSelector'

describe('ProviderSelector', () => {
  const providers = [
    { provider: 'ollama', model: 'llama3' },
    { provider: 'openai', model: 'gpt-4' }
  ]

  test('renders list of providers in dropdown', () => {
    render(<ProviderSelector providers={providers} activeProvider="ollama" onChange={vi.fn()} />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByText('ollama (llama3)')).toBeInTheDocument()
    expect(screen.getByText('openai (gpt-4)')).toBeInTheDocument()
  })

  test('triggers onChange callback when selection changes', () => {
    const handleChange = vi.fn()
    render(<ProviderSelector providers={providers} activeProvider="ollama" onChange={handleChange} />)
    
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'openai' } })
    
    expect(handleChange).toHaveBeenCalledWith({ provider: 'openai', model: 'gpt-4' })
  })
})
