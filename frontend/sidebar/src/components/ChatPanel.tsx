import React from 'react'
import { MessageList } from './MessageList'
import type { MessageType } from './MessageList'
import { MessageInput } from './MessageInput'
import { Sparkles, MessageSquare, X, Wifi, WifiOff } from 'lucide-react'
import { ProviderSelector } from './ProviderSelector'
import type { ProviderInfo } from './ProviderSelector'
import { ConsentToggle } from './ConsentToggle'
import { PrivacyNotice } from './PrivacyNotice'
import { PresenceBar } from './PresenceBar'
import { SessionControls } from './SessionControls'
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
  collabEnabled?: boolean;
  collabSessionId?: string | null;
  collabShortCode?: string;
  members?: { connId: string; displayName: string; disconnected?: boolean }[];
  aiWorkingFor?: string | null;
  onCreateCollabSession?: () => void;
  onJoinCollabSession?: (codeOrId: string) => void;
  onLeaveCollabSession?: () => void;
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
  onBannerDismiss = () => {},
  collabEnabled = false,
  collabSessionId = null,
  collabShortCode = '',
  members = [],
  aiWorkingFor = null,
  onCreateCollabSession = () => {},
  onJoinCollabSession = () => {},
  onLeaveCollabSession = () => {}
}) => {

  if (!isOpen) {
    return (
      <button
        className="drawio-agent-toggle-fab drawio-agent-fab-inner"
        onClick={() => setIsOpen(true)}
        onMouseDown={onHeaderMouseDown}
        title={MESSAGES.openSidebarFabTitle}
        id="drawio-agent-open-fab"
      >
        <MessageSquare size={30} />
      </button>
    )
  }

  return (
    <div className="drawio-agent-sidebar drawio-agent-sidebar-inner">
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
        className="drawio-agent-header drawio-agent-header-inner"
        onMouseDown={onHeaderMouseDown}
      >
        <div className="drawio-agent-title-section">
          <Sparkles className="drawio-agent-sparkle-icon" size={16} />
          <span className="drawio-agent-title">{MESSAGES.titleArchimedesDraftingAgent}</span>
        </div>
        <div className="drawio-agent-header-controls" onMouseDown={(e) => e.stopPropagation()}>
          {collabEnabled && members.length > 0 && (
            <PresenceBar members={members} aiWorkingFor={aiWorkingFor} />
          )}
          {connectionStatus === 'connected' ? (
            <span title="Connected" className="drawio-agent-status-indicator">
              <Wifi className="drawio-agent-status-icon connected" size={14} />
            </span>
          ) : (
            <span title="Disconnected" className="drawio-agent-status-indicator">
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
        {collabEnabled && (
          <SessionControls
            sessionId={collabSessionId}
            shortCode={collabShortCode}
            onCreateSession={onCreateCollabSession}
            onJoinSession={onJoinCollabSession}
            onLeaveSession={onLeaveCollabSession}
          />
        )}
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
        {aiWorkingFor && (
          <div className="drawio-agent-ai-status ai-working-status drawio-agent-ai-status-active">
            {`AI is working for ${aiWorkingFor}...`}
          </div>
        )}
        <MessageInput onSend={onSendMessage} isLoading={isLoading || !!aiWorkingFor} />
      </div>
    </div>
  )
}
