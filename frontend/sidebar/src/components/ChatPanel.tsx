import React from 'react'
import { MessageList } from './MessageList'
import type { MessageType } from './MessageList'
import { MessageInput } from './MessageInput'
import { Sparkles, MessageSquare, X, Wifi, WifiOff } from 'lucide-react'
import { ProviderSelector } from './ProviderSelector'
import type { ProviderInfo } from './ProviderSelector'
import { ConsentToggle } from './ConsentToggle'
import { PrivacyNotice } from './PrivacyNotice'
import { MESSAGES } from '../i18n'

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
  providers?: ProviderInfo[];
  activeProvider?: string;
  onProviderChange?: (providerName: string) => void;
  consent?: boolean;
  onConsentChange?: (consented: boolean) => void;
  showBanner?: boolean;
  onBannerDismiss?: () => void;
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
  children,
  providers = [],
  activeProvider = '',
  onProviderChange = () => {},
  consent = false,
  onConsentChange = () => {},
  showBanner = false,
  onBannerDismiss = () => {}
}) => {

  if (!isOpen) {
    return (
      <button
        className="drawio-agent-toggle-fab"
        onClick={() => setIsOpen(true)}
        onMouseDown={onHeaderMouseDown}
        title={MESSAGES.openSidebarFabTitle}
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
        role="separator"
        aria-label={MESSAGES.ariaResizeTop}
      />
      <div
        className="drawio-agent-resize-handle right"
        onMouseDown={(e) => onResizeStart(e, 'e')}
        role="separator"
        aria-label={MESSAGES.ariaResizeRight}
      />
      <div
        className="drawio-agent-resize-handle bottom"
        onMouseDown={(e) => onResizeStart(e, 's')}
        role="separator"
        aria-label={MESSAGES.ariaResizeBottom}
      />
      <div
        className="drawio-agent-resize-handle left"
        onMouseDown={(e) => onResizeStart(e, 'w')}
        role="separator"
        aria-label={MESSAGES.ariaResizeLeft}
      />
      <div
        className="drawio-agent-resize-handle top-left"
        onMouseDown={(e) => onResizeStart(e, 'nw')}
        role="separator"
        aria-label={MESSAGES.ariaResizeTopLeft}
      />
      <div
        className="drawio-agent-resize-handle top-right"
        onMouseDown={(e) => onResizeStart(e, 'ne')}
        role="separator"
        aria-label={MESSAGES.ariaResizeTopRight}
      />
      <div
        className="drawio-agent-resize-handle bottom-left"
        onMouseDown={(e) => onResizeStart(e, 'sw')}
        role="separator"
        aria-label={MESSAGES.ariaResizeBottomLeft}
      />
      <div
        className="drawio-agent-resize-handle bottom-right"
        onMouseDown={(e) => onResizeStart(e, 'se')}
        role="separator"
        aria-label={MESSAGES.ariaResizeBottomRight}
      />

      {/* Header (Draggable) */}
      <div
        className="drawio-agent-header"
        onMouseDown={onHeaderMouseDown}
        style={{ cursor: 'move', userSelect: 'none' }}
      >
        <div className="drawio-agent-title-section">
          <Sparkles className="drawio-agent-sparkle-icon" size={16} />
          <span className="drawio-agent-title">{MESSAGES.titleArchimedesDraftingAgent}</span>
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
            aria-label={MESSAGES.ariaCloseSidebar}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Connection Banner */}
      {connectionStatus !== 'connected' && (
        <div className={`drawio-agent-connection-banner ${connectionStatus}`}>
          {connectionStatus === 'connecting' ? MESSAGES.statusConnecting : MESSAGES.statusDisconnected}
        </div>
      )}

      {/* Message List */}
      <div className="drawio-agent-body">
        {showBanner && ['gemini', 'openai'].includes(activeProvider) && (
          <PrivacyNotice
            onAccept={() => onConsentChange(true)}
            onDismiss={onBannerDismiss}
          />
        )}
        {providers.length > 0 && (
          <div className="drawio-agent-settings-bar">
            <ProviderSelector
              providers={providers}
              activeProvider={activeProvider}
              onChange={(p) => onProviderChange(p.provider)}
            />
            <ConsentToggle
              consented={consent}
              onChange={onConsentChange}
            />
          </div>
        )}
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
