import { useState } from 'react'
import type { KeyboardEvent } from 'react'
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

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter, unless Shift is held (for typing multiline text)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="drawio-agent-input-container">
      <textarea
        className="drawio-agent-input"
        placeholder="Ask Archimedes..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isLoading}
        rows={2}
        style={{ resize: 'none' }}
      />
      <button
        className="drawio-agent-send-btn"
        onClick={handleSend}
        disabled={isLoading || !text.trim()}
        aria-label="Send"
      >
        <Send size={18} />
      </button>
    </div>
  )
}
