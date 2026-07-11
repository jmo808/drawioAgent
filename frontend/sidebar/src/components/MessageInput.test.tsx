import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MessageInput } from './MessageInput'

describe('MessageInput', () => {
  test('renders input field and send button', () => {
    render(<MessageInput onSend={vi.fn()} isLoading={false} />)
    expect(screen.getByPlaceholderText(/ask antigravity/i)).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  test('calls onSend when send button is clicked', () => {
    const handleSend = vi.fn()
    render(<MessageInput onSend={handleSend} isLoading={false} />)
    
    const input = screen.getByPlaceholderText(/ask antigravity/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Create AWS architecture' } })
    
    const button = screen.getByRole('button')
    fireEvent.click(button)
    
    expect(handleSend).toHaveBeenCalledWith('Create AWS architecture')
    expect(input.value).toBe('') // cleared
  })

  test('disables input and button when isLoading is true', () => {
    render(<MessageInput onSend={vi.fn()} isLoading={true} />)
    expect(screen.getByPlaceholderText(/ask antigravity/i)).toBeDisabled()
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
