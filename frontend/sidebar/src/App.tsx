import { useState, useEffect, useCallback } from 'react'
import { ChatPanel } from './components/ChatPanel'
import { TemplateLibrary } from './components/TemplateLibrary'
import { DisplayNamePrompt } from './components/DisplayNamePrompt'
import type { ToolProgress, DiagramUpdate, ErrorPayload } from '@drawio-agent/shared'
import { MESSAGES } from './i18n'
import { useChatStore } from './hooks/useChatStore'
import { useWebSocket } from './hooks/useWebSocket'
import * as drawioBridge from './services/drawioBridge'
import './index.css'

interface AppProps {
  ui?: EditorUi;
}

function App({ ui }: AppProps) {
  const [sessionId] = useState(() => {
    return 'session-' + Math.random().toString(36).substring(2, 11)
  })

  const [apiKey] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search)
    return urlParams.get('apiKey') || localStorage.getItem('drawio_agent_api_key') || 'default-secret-key'
  })

  const { state, dispatch } = useChatStore()
  const [isOpen, setIsOpen] = useState(true)

  const [collabEnabled, setCollabEnabled] = useState(false)
  const [displayName, setDisplayName] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const paramName = urlParams.get('displayName') || urlParams.get('username')
    if (paramName) {
      localStorage.setItem('drawio_agent_display_name', paramName)
      return paramName
    }
    return localStorage.getItem('drawio_agent_display_name') || ''
  })
  const [showNamePrompt, setShowNamePrompt] = useState(false)
  const [pendingAction, setPendingAction] = useState<{ type: 'create' } | { type: 'join'; codeOrId: string } | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage(prev => prev === msg ? null : prev)
    }, 3000)
  }

  const [providers, setProviders] = useState<{ provider: string; model: string }[]>([])
  const [activeProvider, setActiveProvider] = useState<string>('')
  const [consent, setConsent] = useState(() => {
    return localStorage.getItem('drawio_agent_privacy_consent') === 'true'
  })
  const [showBanner, setShowBanner] = useState(() => {
    return localStorage.getItem('drawio_agent_privacy_consent') !== 'true'
  })

  // Fetch features and providers list
  useEffect(() => {
    const checkFeatures = async () => {
      try {
        const host = window.location.host || 'localhost:3000'
        const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:'
        const res = await fetch(`${protocol}//${host}/api/features`)
        if (res.ok) {
          const data = await res.json()
          setCollabEnabled(!!data.collaboration)
          dispatch({ type: 'SET_COLLABORATION_ENABLED', payload: !!data.collaboration })
        }
      } catch (e) {
        console.error('Failed to fetch features:', e)
      }
    }
    checkFeatures()
  }, [dispatch])

  // Fetch providers list
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const host = window.location.host || 'localhost:3000'
        const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:'
        const res = await fetch(`${protocol}//${host}/api/v1/providers`)
        if (res.ok) {
          const data = await res.json()
          if (data.providers) {
            setProviders(data.providers)
            if (data.providers.length > 0) {
              setActiveProvider(data.providers[0].provider)
            }
          }
        }
      } catch (e) {
        console.error('Failed to fetch providers:', e)
      }
    }
    fetchProviders()
  }, [])

  const handleProviderChange = (providerName: string) => {
    setActiveProvider(providerName)
    // If selecting a cloud provider and consent is not given, show banner
    if (['gemini', 'openai'].includes(providerName) && !consent) {
      setShowBanner(true)
    }
  }

  const handleConsentChange = (consented: boolean) => {
    setConsent(consented)
    localStorage.setItem('drawio_agent_privacy_consent', consented ? 'true' : 'false')
    if (consented) {
      setShowBanner(false)
    }
  }

  const handleBannerDismiss = () => {
    setShowBanner(false)
  }

  // Floating coordinates and dimensions state
  const [position, setPosition] = useState(() => {
    const saved = localStorage.getItem('drawio-agent-pos')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return parsed
        }
      } catch { /* ignore corrupt data */ }
    }
    return { x: window.innerWidth - 412, y: 70 }
  })
  
  const [size, setSize] = useState(() => {
    const saved = localStorage.getItem('drawio-agent-size')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (typeof parsed.width === 'number' && typeof parsed.height === 'number') {
          return parsed
        }
      } catch { /* ignore corrupt data */ }
    }
    return { width: 380, height: window.innerHeight - 90 }
  })

  // Synchronize CSS values directly to the #drawio-agent-sidebar-root wrapper element
  useEffect(() => {
    const el = document.getElementById('drawio-agent-sidebar-root')
    if (el) {
      el.style.left = `${position.x}px`
      el.style.top = `${position.y}px`
      el.style.position = 'fixed'
      el.style.right = 'auto'
      el.style.bottom = 'auto'
      
      if (isOpen) {
        el.style.width = `${size.width}px`
        el.style.height = `${size.height}px`
        el.style.borderRadius = '16px'
      } else {
        el.style.width = '64px'
        el.style.height = '64px'
        el.style.borderRadius = '50%'
      }
    }
  }, [position, size, isOpen])

  // Save layout coordinates to local storage
  useEffect(() => {
    localStorage.setItem('drawio-agent-pos', JSON.stringify(position))
    localStorage.setItem('drawio-agent-size', JSON.stringify(size))
  }, [position, size])

  // Mouse drag handler for the header bar and the minimized FAB bubble
  const handleDragStart = (e: React.MouseEvent) => {
    if (e.button !== 0) return // Left click only
    e.preventDefault()

    const startX = e.clientX - position.x
    const startY = e.clientY - position.y

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const boundWidth = isOpen ? size.width : 64
      const newX = Math.max(0, Math.min(window.innerWidth - boundWidth, moveEvent.clientX - startX))
      const newY = Math.max(0, Math.min(window.innerHeight - 50, moveEvent.clientY - startY))
      setPosition({ x: newX, y: newY })
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // Mouse resize handler for the border handles (supporting all 8 directions)
  const handleResizeStart = (e: React.MouseEvent, direction: string) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    const startX = e.clientX
    const startY = e.clientY
    const startWidth = size.width
    const startHeight = size.height
    const startPosX = position.x
    const startPosY = position.y

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX
      const deltaY = moveEvent.clientY - startY

      let newWidth = startWidth
      let newHeight = startHeight
      let newX = startPosX
      let newY = startPosY

      // Horizontal sizing
      if (direction.includes('w')) {
        const rawWidth = startWidth - deltaX
        newWidth = Math.max(280, Math.min(800, rawWidth))
        newX = startPosX + (startWidth - newWidth)
      } else if (direction.includes('e')) {
        const rawWidth = startWidth + deltaX
        newWidth = Math.max(280, Math.min(800, rawWidth))
      }

      // Vertical sizing
      if (direction.includes('n')) {
        const rawHeight = startHeight - deltaY
        newHeight = Math.max(300, Math.min(window.innerHeight - 50, rawHeight))
        newY = startPosY + (startHeight - newHeight)
      } else if (direction.includes('s')) {
        const rawHeight = startHeight + deltaY
        newHeight = Math.max(300, Math.min(window.innerHeight - 50, rawHeight))
      }

      setSize({ width: newWidth, height: newHeight })
      setPosition({ x: newX, y: newY })
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  interface Member {
    connId: string;
    displayName: string;
    disconnected?: boolean;
  }

  const { sendMessage, broadcastDiagram, createSession, joinSession, leaveSession } = useWebSocket({
    sessionId,
    collabSessionId: state.sessionId,
    displayName: displayName,
    apiKey,
    onStatusChange: (status) => {
      dispatch({ type: 'UPDATE_CONNECTION_STATUS', payload: status });
    },
    onMessageReceived: (message) => {
      if (message.type === 'tool_progress') {
        const payload = message.payload as unknown as ToolProgress;
        dispatch({
          type: 'RECEIVE_TOOL_PROGRESS',
          payload: {
            toolName: payload.toolName,
            step: payload.step,
            totalSteps: payload.totalSteps,
            message: payload.message || ''
          }
        });
      } else if (message.type === 'chat_message') {
        const payload = message.payload as Record<string, unknown>;
        const senderConnId = (message as unknown as Record<string, unknown>).senderConnId as string | undefined;
        const senderName = ((message as unknown as Record<string, unknown>).senderName as string | undefined) || 'Anonymous';
        const isAgent = !senderConnId || senderConnId === 'agent';
        dispatch({
          type: 'RECEIVE_COLLAB_CHAT',
          payload: {
            text: payload.text as string,
            senderName,
            isAgent
          }
        });
      } else if (message.type === 'diagram_update') {
        const payload = message.payload as unknown as DiagramUpdate;
        if (ui && payload.xml) {
          try {
            console.log('[DrawioAgent] Applying diagram update XML...');
            drawioBridge.setGraphXml(ui, payload.xml);
          } catch (e) {
            console.error('[DrawioAgent] Failed to set graph XML:', e);
            dispatch({ type: 'SET_ERROR', payload: MESSAGES.errorFailedToUpdateXml });
          }
        }
      } else if (message.type === 'error') {
        const payload = message.payload as unknown as ErrorPayload;
        dispatch({ type: 'SET_ERROR', payload: payload.message });
      } else if (message.type === 'session_state') {
        const payload = message.payload as Record<string, unknown>;
        dispatch({ type: 'SET_SESSION', payload: { sessionId: payload.sessionId as string, shortCode: payload.shortCode as string } });
        dispatch({ type: 'SET_MEMBERS', payload: payload.members as Member[] });
        if (ui && payload.diagramXml) {
          try {
            drawioBridge.setGraphXmlPreservingViewport(ui, payload.diagramXml as string);
          } catch (e) {
            console.error('[DrawioAgent] Failed to apply sync state XML:', e);
          }
        }
      } else if (message.type === 'member_joined') {
        const payload = message.payload as Record<string, unknown>;
        dispatch({ type: 'ADD_MEMBER', payload: { connId: payload.connId as string, displayName: payload.displayName as string, disconnected: payload.disconnected as boolean | undefined } });
        if (!payload.disconnected) {
          showToast(`${payload.displayName} joined the session`);
        }
      } else if (message.type === 'member_left') {
        const payload = message.payload as Record<string, unknown>;
        dispatch({ type: 'REMOVE_MEMBER', payload: payload.connId as string });
        const member = state.members.find(m => m.connId === payload.connId);
        showToast(`${member?.displayName || 'A member'} left the session`);
      } else if (message.type === 'diagram_broadcast') {
        const payload = message.payload as Record<string, unknown>;
        if (ui && payload.diagramXml) {
          try {
            drawioBridge.setGraphXmlPreservingViewport(ui, payload.diagramXml as string);
            showToast(`Diagram updated by ${(message as unknown as Record<string, unknown>).senderName as string || 'another user'}`);
          } catch (e) {
            console.error('[DrawioAgent] Failed to apply broadcast XML:', e);
          }
        }
      } else if (message.type === 'ai_locked') {
        const payload = message.payload as Record<string, unknown>;
        dispatch({ type: 'SET_AI_WORKING_FOR', payload: payload.displayName as string });
      } else if (message.type === 'ai_unlocked') {
        dispatch({ type: 'SET_AI_WORKING_FOR', payload: null });
      }
    }
  });

  const handleCreateSession = useCallback(() => {
    if (!displayName) {
      setPendingAction({ type: 'create' });
      setShowNamePrompt(true);
    } else {
      createSession(displayName);
    }
  }, [displayName, createSession]);

  const handleJoinSession = useCallback((codeOrId: string) => {
    if (!displayName) {
      setPendingAction({ type: 'join', codeOrId });
      setShowNamePrompt(true);
    } else {
      joinSession(codeOrId, displayName);
    }
  }, [displayName, joinSession]);

  const handleLeaveSession = useCallback(() => {
    if (state.sessionId) {
      leaveSession(state.sessionId);
      dispatch({ type: 'CLEAR_SESSION' });
      showToast('Left collaboration session');
    }
  }, [state.sessionId, leaveSession, dispatch]);

  const handleNameConfirm = (name: string) => {
    setDisplayName(name);
    localStorage.setItem('drawio_agent_display_name', name);
    dispatch({ type: 'SET_DISPLAY_NAME', payload: name });
    setShowNamePrompt(false);

    if (pendingAction) {
      if (pendingAction.type === 'create') {
        createSession(name);
      } else if (pendingAction.type === 'join') {
        joinSession(pendingAction.codeOrId, name);
      }
      setPendingAction(null);
    }
  };

  const handleNameCancel = () => {
    setShowNamePrompt(false);
    setPendingAction(null);
  };

  const handleEditDisplayName = () => {
    setPendingAction(null);
    setShowNamePrompt(true);
  };

  useEffect(() => {
    if (!collabEnabled || state.connectionStatus !== 'connected') return;

    const urlParams = new URLSearchParams(window.location.search);
    const sessionParam = urlParams.get('session');
    if (sessionParam && sessionParam !== state.sessionId) {
      console.log('[DrawioAgent] Auto-joining session from URL parameter:', sessionParam);
      handleJoinSession(sessionParam);
    }
  }, [collabEnabled, state.connectionStatus, state.sessionId, handleJoinSession]);

  useEffect(() => {
    if (!ui || !state.sessionId) return
    const unsubscribe = drawioBridge.subscribeToGraphChanges(ui, (xml) => {
      broadcastDiagram(xml)
    }, 500)
    return () => unsubscribe()
  }, [ui, state.sessionId, broadcastDiagram])

  const handleSendMessage = (text: string) => {
    console.log('[DrawioAgent] handleSendMessage called');
    
    // Block cloud provider requests if consent is not granted
    const isCloud = ['gemini', 'openai'].includes(activeProvider);
    if (isCloud && !consent) {
      dispatch({ type: 'SET_ERROR', payload: MESSAGES.errorCloudRequestsBlocked });
      return;
    }

    let snapshotXml: string | null = null
    if (ui) {
      try {
        const stats = drawioBridge.getDiagramStats(ui)
        if (stats.nodeCount > 0 || stats.edgeCount > 0) {
          snapshotXml = drawioBridge.getGraphXml(ui)
        }
      } catch (e) {
        console.error('[DrawioAgent] Failed to get graph XML snapshot:', e)
      }
    }

    dispatch({ type: 'ADD_USER_MESSAGE', payload: text })
    sendMessage(text, snapshotXml)
  }

  // Expose for testing
  useEffect(() => {
    (window as any).sendCollabMessage = (text: string) => {
      handleSendMessage(text)
    }
    return () => {
      delete (window as any).sendCollabMessage
    }
  }, [handleSendMessage])

  // Prevent browser from auto-scrolling the body when inputs are focused,
  // which shifts the entire Draw.io app layout upward.
  useEffect(() => {
    const preventBodyScroll = () => {
      if (document.body.scrollTop !== 0) {
        document.body.scrollTop = 0
      }
      if (document.documentElement.scrollTop !== 0) {
        document.documentElement.scrollTop = 0
      }
    }

    window.addEventListener('scroll', preventBodyScroll, { passive: true })
    document.body.addEventListener('scroll', preventBodyScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', preventBodyScroll)
      document.body.removeEventListener('scroll', preventBodyScroll)
    }
  }, [])

  useEffect(() => {
    const updateTheme = () => {
      const activeTheme = drawioBridge.getTheme()
      document.body.classList.toggle('dark', activeTheme === 'dark')
    }

    updateTheme()

    const observer = new MutationObserver(updateTheme)
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })

    return () => observer.disconnect()
  }, [ui])

  return (
    <div className="drawio-agent-app-container">
      <ChatPanel
        messages={state.messages}
        isLoading={state.isLoading}
        onSendMessage={handleSendMessage}
        connectionStatus={state.connectionStatus}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        onHeaderMouseDown={handleDragStart}
        onResizeStart={handleResizeStart}
        providers={providers}
        activeProvider={activeProvider}
        onProviderChange={handleProviderChange}
        consent={consent}
        onConsentChange={handleConsentChange}
        showBanner={showBanner}
        onBannerDismiss={handleBannerDismiss}
        collabEnabled={collabEnabled}
        collabSessionId={state.sessionId}
        collabShortCode={state.shortCode}
        displayName={displayName}
        onEditDisplayName={handleEditDisplayName}
        members={state.members}
        aiWorkingFor={state.aiWorkingFor}
        onCreateCollabSession={handleCreateSession}
        onJoinCollabSession={handleJoinSession}
        onLeaveCollabSession={handleLeaveSession}
      >
        {state.connectionStatus === 'connected' && (
          <div className="drawio-agent-sidebar-overlay-content">
            <TemplateLibrary onSelectTemplate={handleSendMessage} />
          </div>
        )}
      </ChatPanel>

      <DisplayNamePrompt
        isOpen={showNamePrompt}
        onConfirm={handleNameConfirm}
        onCancel={handleNameCancel}
      />

      {toastMessage && (
        <div className="toast-notification animate-fade-in" style={{
          position: 'fixed',
          bottom: '80px',
          right: '20px',
          background: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '8px 16px',
          borderRadius: '20px',
          fontSize: '12px',
          zIndex: 10003,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        }}>
          {toastMessage}
        </div>
      )}
    </div>
  )
}

export { App };
