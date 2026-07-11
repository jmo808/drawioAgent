import React, { useState, KeyboardEvent } from 'react'
import { Send } from 'lucide-react'

interface MessageInputProps {
  onSend: (text: string) => void;
  isLoading: boolean;
}

export const MessageInput: React.FC<MessageInputProps> = ({ onSend, isLoading }) => {
  const [text, setText] = useState('')

  const handleSend = () => {
    const trimmed = text.trim()
    if (trimmed && !isLoading) {
      onSend(trimmed)
      setText('')
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend()
    }
  }

  return (
    <div className="drawio-agent-input-container">
      <input
        type="text"
        className="drawio-agent-input"
        placeholder="Ask Antigravity..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isLoading}
      />
      <button
        className="drawio-agent-send-btn"
        onClick={handleSend}
        disabled={isLoading || !text.trim()}
        aria-label="Send"
      >
        <Send size={16} />
      </button>
    </div>
  )
}
