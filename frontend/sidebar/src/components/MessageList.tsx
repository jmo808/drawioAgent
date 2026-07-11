import React, { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'

export interface MessageType {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  toolProgress?: {
    toolName: string;
    step: number;
    totalSteps: number;
    message: string;
  };
}

interface MessageListProps {
  messages: MessageType[];
}

export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="drawio-agent-msg-list">
      {messages.map((msg) => {
        const isUser = msg.role === 'user'
        const isSystem = msg.role === 'system'
        
        let bubbleClass = 'drawio-agent-msg-assistant'
        if (isUser) {
          bubbleClass = 'drawio-agent-msg-user'
        } else if (isSystem) {
          bubbleClass = 'drawio-agent-msg-system'
        }

        return (
          <div key={msg.id} className={`drawio-agent-msg-row ${isUser ? 'drawio-agent-row-user' : 'drawio-agent-row-assistant'}`}>
            <div className={`drawio-agent-msg-bubble ${bubbleClass}`}>
              {msg.text && <div className="drawio-agent-msg-text">{msg.text}</div>}
              
              {msg.toolProgress && (
                <div className="drawio-agent-tool-progress">
                  <div className="drawio-agent-tool-header">
                    <Loader2 className="drawio-agent-spinner" size={14} />
                    <span className="drawio-agent-tool-title">Running tool: {msg.toolProgress.toolName}</span>
                  </div>
                  <div className="drawio-agent-tool-desc">{msg.toolProgress.message}</div>
                  <div className="drawio-agent-tool-steps">
                    step {msg.toolProgress.step} / {msg.toolProgress.totalSteps}
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
