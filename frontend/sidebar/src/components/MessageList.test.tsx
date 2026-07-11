import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { MessageList } from './MessageList'

describe('MessageList', () => {
  const mockMessages = [
    { id: '1', role: 'user' as const, text: 'Hello AI' },
    { id: '2', role: 'assistant' as const, text: 'Hello User' },
    {
      id: '3',
      role: 'assistant' as const,
      text: '',
      toolProgress: {
        toolName: 'add_node',
        step: 1,
        totalSteps: 2,
        message: 'Adding a rectangle node'
      }
    }
  ]

  test('renders user messages with right alignment class/style indicator', () => {
    const { container } = render(<MessageList messages={mockMessages} />)
    const userMsg = container.querySelector('.drawio-agent-msg-user')
    expect(userMsg).not.toBeNull()
    expect(userMsg?.textContent).toContain('Hello AI')
  })

  test('renders AI messages with left alignment class/style indicator', () => {
    const { container } = render(<MessageList messages={mockMessages} />)
    const aiMsg = container.querySelector('.drawio-agent-msg-assistant')
    expect(aiMsg).not.toBeNull()
    expect(aiMsg?.textContent).toContain('Hello User')
  })

  test('renders tool progress indicator when present', () => {
    render(<MessageList messages={mockMessages} />)
    expect(screen.getByText(/Adding a rectangle node/i)).toBeInTheDocument()
    expect(screen.getByText(/step 1 \/ 2/i)).toBeInTheDocument()
  })
})
