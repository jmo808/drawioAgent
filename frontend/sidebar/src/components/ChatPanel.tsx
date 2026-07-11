import React, { useState } from 'react'
import { MessageList, MessageType } from './MessageList'
import { MessageInput } from './MessageInput'
import { Sparkles, MessageSquare, X, Wifi, WifiOff } from 'lucide-react'

interface ChatPanelProps {
  messages: MessageType[];
  isLoading: boolean;
  onSendMessage: (text: string) => void;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  isLoading,
  onSendMessage,
  connectionStatus
}) => {
  const [isOpen, setIsOpen] = useState(true)

  if (!isOpen) {
    return (
      <button
        className="drawio-agent-toggle-fab"
        onClick={() => setIsOpen(true)}
        title="Open Antigravity Chat"
        id="drawio-agent-open-fab"
      >
        <MessageSquare size={20} />
      </button>
    )
  }

  return (
    <div className="drawio-agent-sidebar">
      {/* Header */}
      <div className="drawio-agent-header">
        <div className="drawio-agent-title-section">
          <Sparkles className="drawio-agent-sparkle-icon" size={16} />
          <span className="drawio-agent-title">Antigravity AI</span>
        </div>
        <div className="drawio-agent-header-actions">
          {connectionStatus === 'connected' ? (
            <Wifi className="drawio-agent-status-icon connected" size={14} title="Connected" />
          ) : (
            <WifiOff className="drawio-agent-status-icon disconnected" size={14} title="Disconnected" />
          )}
          <button className="drawio-agent-close-btn" onClick={() => setIsOpen(false)} id="drawio-agent-close-btn">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Connection Banner */}
      {connectionStatus !== 'connected' && (
        <div className={`drawio-agent-connection-banner ${connectionStatus}`}>
          {connectionStatus === 'connecting' ? 'Connecting to backend...' : 'Disconnected from backend'}
        </div>
      )}

      {/* Message List */}
      <div className="drawio-agent-body">
        <MessageList messages={messages} />
      </div>

      {/* Footer / Input */}
      <div className="drawio-agent-footer">
        <MessageInput onSend={onSendMessage} isLoading={isLoading} />
      </div>
    </div>
  )
}
