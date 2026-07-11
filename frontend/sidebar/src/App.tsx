import { useState, useEffect } from 'react'
import { ChatPanel } from './components/ChatPanel'
import { ProviderSelector } from './components/ProviderSelector'
import type { ProviderInfo } from './components/ProviderSelector'
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

  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [activeProvider, setActiveProvider] = useState<string>('')

  useEffect(() => {
    fetch('/api/providers')
      .then((res) => {
        if (!res.ok) throw new Error('API failed')
        return res.json()
      })
      .then((data) => {
        if (data.providers && data.providers.length > 0) {
          setProviders(data.providers)
          setActiveProvider(data.providers[0].provider)
        }
      })
      .catch((err) => {
        console.error('Failed to load active LLM providers:', err)
        setProviders([{ provider: 'ollama', model: 'llama3' }])
        setActiveProvider('ollama')
      })
  }, [])

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
    let snapshotXml: string | null = null
    if (ui) {
      try {
        snapshotXml = drawioBridge.getGraphXml(ui)
      } catch (e) {
        console.error('[DrawioAgent] Failed to get graph XML snapshot:', e)
      }
    }

    dispatch({ type: 'ADD_USER_MESSAGE', payload: text })
    sendMessage(text, snapshotXml)
  }

  const handleProviderChange = (info: ProviderInfo) => {
    setActiveProvider(info.provider)
    console.log(`[DrawioAgent] Switched provider to ${info.provider}`)
  }

  useEffect(() => {
    const activeTheme = drawioBridge.getTheme()
    document.body.classList.toggle('dark', activeTheme === 'dark')
  }, [ui])

  return (
    <div className="drawio-agent-app-container">
      <ChatPanel
        messages={state.messages}
        isLoading={state.isLoading}
        onSendMessage={handleSendMessage}
        connectionStatus={state.connectionStatus}
      />
      
      {state.connectionStatus === 'connected' && (
        <div className="drawio-agent-sidebar-overlay-content">
          <ProviderSelector
            providers={providers}
            activeProvider={activeProvider}
            onChange={handleProviderChange}
          />
          <TemplateLibrary onSelectTemplate={handleSendMessage} />
        </div>
      )}
    </div>
  )
}

export default App
export { App }
