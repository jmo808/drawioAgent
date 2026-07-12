import React from 'react'
import { MessageList } from './MessageList'
import type { MessageType } from './MessageList'
import { MessageInput } from './MessageInput'
import { Sparkles, MessageSquare, X, Wifi, WifiOff } from 'lucide-react'

interface ChatPanelProps {
  messages: MessageType[];
  isLoading: boolean;
  onSendMessage: (text: string) => void;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onHeaderMouseDown: (e: React.MouseEvent) => void;
  onResizeStart: (e: React.MouseEvent, direction: string) => void;
  children?: React.ReactNode;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  isLoading,
  onSendMessage,
  connectionStatus,
  isOpen,
  setIsOpen,
  onHeaderMouseDown,
  onResizeStart,
  children
}) => {

  if (!isOpen) {
    return (
      <button
        className="drawio-agent-toggle-fab"
        onClick={() => setIsOpen(true)}
        onMouseDown={onHeaderMouseDown}
        title="Open Archimedes Drafting Agent"
        id="drawio-agent-open-fab"
        style={{
          position: 'static',
          width: '100%',
          height: '100%',
          margin: 0,
          cursor: 'move'
        }}
      >
        <MessageSquare size={30} />
      </button>
    )
  }

  return (
    <div className="drawio-agent-sidebar" style={{ position: 'relative' }}>
      {/* Absolute positioned resize handles for all 8 directions */}
      <div
        className="drawio-agent-resize-handle top"
        onMouseDown={(e) => onResizeStart(e, 'n')}
      />
      <div
        className="drawio-agent-resize-handle right"
        onMouseDown={(e) => onResizeStart(e, 'e')}
      />
      <div
        className="drawio-agent-resize-handle bottom"
        onMouseDown={(e) => onResizeStart(e, 's')}
      />
      <div
        className="drawio-agent-resize-handle left"
        onMouseDown={(e) => onResizeStart(e, 'w')}
      />
      <div
        className="drawio-agent-resize-handle top-left"
        onMouseDown={(e) => onResizeStart(e, 'nw')}
      />
      <div
        className="drawio-agent-resize-handle top-right"
        onMouseDown={(e) => onResizeStart(e, 'ne')}
      />
      <div
        className="drawio-agent-resize-handle bottom-left"
        onMouseDown={(e) => onResizeStart(e, 'sw')}
      />
      <div
        className="drawio-agent-resize-handle bottom-right"
        onMouseDown={(e) => onResizeStart(e, 'se')}
      />

      {/* Header (Draggable) */}
      <div
        className="drawio-agent-header"
        onMouseDown={onHeaderMouseDown}
        style={{ cursor: 'move', userSelect: 'none' }}
      >
        <div className="drawio-agent-title-section">
          <Sparkles className="drawio-agent-sparkle-icon" size={16} />
          <span className="drawio-agent-title">Archimedes Drafting Agent</span>
        </div>
        <div className="drawio-agent-header-controls" onMouseDown={(e) => e.stopPropagation()}>
          {connectionStatus === 'connected' ? (
            <span title="Connected" style={{ display: 'flex', alignItems: 'center' }}>
              <Wifi className="drawio-agent-status-icon connected" size={14} />
            </span>
          ) : (
            <span title="Disconnected" style={{ display: 'flex', alignItems: 'center' }}>
              <WifiOff className="drawio-agent-status-icon disconnected" size={14} />
            </span>
          )}
          <button
            className="drawio-agent-close-btn"
            onClick={() => setIsOpen(false)}
            id="drawio-agent-close-btn"
          >
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
        {children}
        <MessageList messages={messages} />
      </div>

      {/* Footer / Input */}
      <div className="drawio-agent-footer">
        <MessageInput onSend={onSendMessage} isLoading={isLoading} />
      </div>
    </div>
  )
}
