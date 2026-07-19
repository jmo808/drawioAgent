import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatPanel } from './ChatPanel'
import { MESSAGES } from '../i18n'

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

  test('renders PresenceBar and SessionControls when collabEnabled is true', () => {
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
        collabEnabled={true}
        collabSessionId="session-1"
        collabShortCode="123456"
        members={[{ connId: 'c1', displayName: 'Alice' }]}
      />
    );

    // PresenceBar rendered
    expect(screen.getByTestId('presence-badge-c1')).toBeInTheDocument();
    
    // SessionControls rendered (shows leave button since sessionId is active)
    expect(screen.getByText(MESSAGES.btnLeaveSession)).toBeInTheDocument();
  });

  test('shows AI working status and disables input when aiWorkingFor is set', () => {
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
        aiWorkingFor="Alice"
      />
    );

    expect(screen.getByText('AI is working for Alice...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ask archimedes/i)).toBeDisabled();
  });
})
