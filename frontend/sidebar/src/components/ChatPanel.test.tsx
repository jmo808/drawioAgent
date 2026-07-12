import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatPanel } from './ChatPanel'

describe('ChatPanel', () => {
  const mockMessages = [
    { id: '1', role: 'user' as const, text: 'Create diagram' }
  ]

  test('renders chat messages and input field', () => {
    render(
      <ChatPanel
        messages={mockMessages}
        isLoading={false}
        onSendMessage={vi.fn()}
        connectionStatus="connected"
        isOpen={true}
        setIsOpen={vi.fn()}
        onHeaderMouseDown={vi.fn()}
        onResizeStart={vi.fn()}
      />
    )
    expect(screen.getByText('Create diagram')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/ask archimedes/i)).toBeInTheDocument()
  })

  test('calls onSendMessage when message is sent', () => {
    const handleSend = vi.fn()
    render(
      <ChatPanel
        messages={mockMessages}
        isLoading={false}
        onSendMessage={handleSend}
        connectionStatus="connected"
        isOpen={true}
        setIsOpen={vi.fn()}
        onHeaderMouseDown={vi.fn()}
        onResizeStart={vi.fn()}
      />
    )
    
    const input = screen.getByPlaceholderText(/ask archimedes/i)
    fireEvent.change(input, { target: { value: 'Draw circle' } })
    
    const sendBtn = screen.getByLabelText('Send')
    fireEvent.click(sendBtn)
    
    expect(handleSend).toHaveBeenCalledWith('Draw circle')
  })

  test('shows connection status banner when disconnected', () => {
    render(
      <ChatPanel
        messages={mockMessages}
        isLoading={false}
        onSendMessage={vi.fn()}
        connectionStatus="disconnected"
        isOpen={true}
        setIsOpen={vi.fn()}
        onHeaderMouseDown={vi.fn()}
        onResizeStart={vi.fn()}
      />
    )
    expect(screen.getByText(/Disconnected/i)).toBeInTheDocument()
  })
})
