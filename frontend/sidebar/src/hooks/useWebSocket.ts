import { useEffect, useRef, useCallback } from 'react'
import type { WebSocketMessage } from '@drawio-agent/shared'

interface UseWebSocketProps {
  sessionId: string;
  collabSessionId?: string | null;
  displayName?: string;
  apiKey: string | null;
  onMessageReceived: (message: WebSocketMessage) => void;
  onStatusChange: (status: 'connecting' | 'connected' | 'disconnected') => void;
}

export const useWebSocket = ({
  sessionId,
  collabSessionId = null,
  displayName = '',
  apiKey,
  onMessageReceived,
  onStatusChange
}: UseWebSocketProps) => {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectDelayRef = useRef(100) // Start at 100ms per spec requirement
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messageQueueRef = useRef<string[]>([])

  // Store callbacks in refs to prevent stale closure risk inside useEffect
  const onMessageReceivedRef = useRef(onMessageReceived)
  const onStatusChangeRef = useRef(onStatusChange)
  const displayNameRef = useRef(displayName)

  // Keep refs up-to-date on every render
  onMessageReceivedRef.current = onMessageReceived
  onStatusChangeRef.current = onStatusChange
  displayNameRef.current = displayName

  const collabSessionIdRef = useRef(collabSessionId)
  useEffect(() => {
    collabSessionIdRef.current = collabSessionId
  }, [collabSessionId])

  useEffect(() => {
    let active = true

    const connect = () => {
      if (!active) return

      onStatusChangeRef.current('connecting')

      const host = window.location.host || 'localhost:3000'
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const url = `${protocol}//${host}/api/v1/ws/chat?apiKey=${encodeURIComponent(apiKey || '')}`;

      console.log(`[DrawioAgentWS] Connecting to ${protocol}//${host}/api/v1/ws/chat`)
      
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (!active) {
          ws.close()
          return
        }
        console.log('[DrawioAgentWS] Connected!')
        onStatusChangeRef.current('connected')
        reconnectDelayRef.current = 100 // Reset backoff

        // Flush queued messages
        const queue = messageQueueRef.current
        messageQueueRef.current = []
        queue.forEach((msg) => {
          ws.send(msg)
        })

        // Auto-rejoin session on reconnect
        if (collabSessionIdRef.current && displayNameRef.current) {
          console.log('[DrawioAgentWS] Auto-rejoining session:', collabSessionIdRef.current)
          ws.send(JSON.stringify({
            type: 'session_join',
            payload: {
              sessionId: collabSessionIdRef.current,
              displayName: displayNameRef.current
            },
            timestamp: new Date().toISOString()
          }))
        }
      }

      ws.onmessage = (event) => {
        if (!active) return
        try {
          const data = JSON.parse(event.data) as WebSocketMessage
          onMessageReceivedRef.current(data)
        } catch (e) {
          console.error('[DrawioAgentWS] Failed to parse message:', e)
        }
      }

      ws.onclose = (event) => {
        if (!active) return
        console.log('[DrawioAgentWS] Closed:', event.reason)
        onStatusChangeRef.current('disconnected')
        
        // Retry connection with exponential backoff (e.g. 100ms, 200ms, 400ms...)
        const delay = reconnectDelayRef.current
        reconnectDelayRef.current = Math.min(delay * 2, 30000)
        
        reconnectTimeoutRef.current = setTimeout(() => {
          connect()
        }, delay)
      }

      ws.onerror = (err) => {
        console.error('[DrawioAgentWS] Error:', err)
      }
    }

    connect()

    return () => {
      active = false
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [sessionId, apiKey])

  const sendMessage = (text: string, diagramXml?: string | null) => {
    console.log('[DrawioAgentWS] sendMessage called', { hasXml: !!diagramXml })
    const activeSessionId = collabSessionIdRef.current || sessionId
    const envelope = {
      type: 'chat_message',
      payload: {
        text,
        diagramXml: diagramXml || null,
        sessionId: activeSessionId
      },
      id: 'msg-' + Math.random().toString(36).substring(2, 11),
      timestamp: new Date().toISOString()
    }

    const payloadStr = JSON.stringify(envelope)
    const ws = wsRef.current

    if (ws && ws.readyState === 1) { // 1 is WebSocket.OPEN
      ws.send(payloadStr)
    } else {
      console.warn('[DrawioAgentWS] WebSocket not open. Queueing message.')
      messageQueueRef.current.push(payloadStr)
    }
  }

  const broadcastDiagram = useCallback((diagramXml: string) => {
    console.log('[DrawioAgentWS] broadcastDiagram called')
    const activeSessionId = collabSessionIdRef.current || sessionId
    const envelope = {
      type: 'diagram_broadcast',
      payload: {
        diagramXml,
        sessionId: activeSessionId
      },
      id: 'msg-' + Math.random().toString(36).substring(2, 11),
      timestamp: new Date().toISOString()
    }

    const payloadStr = JSON.stringify(envelope)
    const ws = wsRef.current

    if (ws && ws.readyState === 1) {
      ws.send(payloadStr)
    }
  }, [sessionId])

  const createSession = useCallback((displayName: string) => {
    const envelope = {
      type: 'session_create',
      payload: {
        displayName
      },
      timestamp: new Date().toISOString()
    }
    const ws = wsRef.current
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(envelope))
    }
  }, [])

  const joinSession = useCallback((sessionIdToJoin: string, displayName: string) => {
    const envelope = {
      type: 'session_join',
      payload: {
        sessionId: sessionIdToJoin,
        displayName
      },
      timestamp: new Date().toISOString()
    }
    const ws = wsRef.current
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(envelope))
    }
  }, [])

  const leaveSession = useCallback((sessionIdToLeave: string) => {
    const envelope = {
      type: 'session_leave',
      payload: {
        sessionId: sessionIdToLeave
      },
      timestamp: new Date().toISOString()
    }
    const ws = wsRef.current
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(envelope))
    }
  }, [])

  return {
    sendMessage,
    broadcastDiagram,
    createSession,
    joinSession,
    leaveSession
  }
}
