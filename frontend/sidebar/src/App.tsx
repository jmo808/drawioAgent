import { useState, useEffect } from 'react'
import { ChatPanel } from './components/ChatPanel'
import { TemplateLibrary } from './components/TemplateLibrary'
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

  const { state, dispatch } = useChatStore(sessionId)
  const [isOpen, setIsOpen] = useState(true)

  // Floating coordinates and dimensions state
  const [position, setPosition] = useState(() => {
    const saved = localStorage.getItem('drawio-agent-pos')
    return saved ? JSON.parse(saved) : { x: window.innerWidth - 412, y: 70 }
  })
  
  const [size, setSize] = useState(() => {
    const saved = localStorage.getItem('drawio-agent-size')
    return saved ? JSON.parse(saved) : { width: 380, height: window.innerHeight - 90 }
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

  const { sendMessage } = useWebSocket({
    sessionId,
    apiKey,
    onStatusChange: (status) => {
      dispatch({ type: 'UPDATE_CONNECTION_STATUS', payload: status })
    },
    onMessageReceived: (message) => {
      if (message.type === 'tool_progress') {
        dispatch({
          type: 'RECEIVE_TOOL_PROGRESS',
          payload: {
            toolName: message.payload.toolName,
            step: message.payload.step,
            totalSteps: message.payload.totalSteps,
            message: message.payload.message
          }
        })
      } else if (message.type === 'chat_message') {
        dispatch({
          type: 'RECEIVE_CHAT_MESSAGE',
          payload: message.payload.text
        })
      } else if (message.type === 'diagram_update') {
        if (ui && message.payload.xml) {
          try {
            console.log('[DrawioAgent] Applying diagram update XML...')
            drawioBridge.setGraphXml(ui, message.payload.xml)
          } catch (e) {
            console.error('[DrawioAgent] Failed to set graph XML:', e)
            dispatch({ type: 'SET_ERROR', payload: 'Failed to update canvas XML' })
          }
        }
      } else if (message.type === 'error') {
        dispatch({ type: 'SET_ERROR', payload: message.payload.message })
      }
    }
  })

  const handleSendMessage = (text: string) => {
    console.log('[DrawioAgent] handleSendMessage called with text:', text)
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
      >
        {state.connectionStatus === 'connected' && (
          <div className="drawio-agent-sidebar-overlay-content">
            <TemplateLibrary onSelectTemplate={handleSendMessage} />
          </div>
        )}
      </ChatPanel>
    </div>
  )
}

export { App };
