import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWebSocket } from './useWebSocket'

describe('useWebSocket', () => {
  let mockWsInstance: any
  let mockWebSocketClass: any

  beforeEach(() => {
    mockWsInstance = {
      send: vi.fn(),
      close: vi.fn(),
      readyState: 0 // CONNECTING
    }
    
    mockWebSocketClass = vi.fn().mockImplementation(function() {
      return mockWsInstance
    })
    
    ;(global as any).WebSocket = mockWebSocketClass
    vi.useFakeTimers()
  })

  test('should establish WebSocket connection with apiKey query parameter', () => {
    const onMessage = vi.fn()
    const onStatus = vi.fn()
    
    renderHook(() => useWebSocket({
      sessionId: 'session-ws',
      apiKey: 'secret-key',
      onMessageReceived: onMessage,
      onStatusChange: onStatus
    }))

    expect(mockWebSocketClass).toHaveBeenCalledWith(
      expect.stringContaining('/ws/chat?apiKey=secret-key')
    )
  })

  test('should queue message when disconnected and flush when connected', () => {
    const { result } = renderHook(() => useWebSocket({
      sessionId: 'session-ws',
      apiKey: 'secret-key',
      onMessageReceived: vi.fn(),
      onStatusChange: vi.fn()
    }))

    // Send while disconnected
    result.current.sendMessage('hello agent')
    expect(mockWsInstance.send).not.toHaveBeenCalled()

    // Simulate connection opening
    mockWsInstance.readyState = 1 // OPEN
    act(() => {
      mockWsInstance.onopen()
    })

    expect(mockWsInstance.send).toHaveBeenCalledWith(
      expect.stringContaining('"text":"hello agent"')
    )
  })

  test('should trigger reconnection with exponential backoff when closed', () => {
    const onStatus = vi.fn()
    
    renderHook(() => useWebSocket({
      sessionId: 'session-ws',
      apiKey: 'secret-key',
      onMessageReceived: vi.fn(),
      onStatusChange: onStatus
    }))

    // Connection closes
    act(() => {
      mockWsInstance.onclose({ reason: 'crashed' })
    })

    expect(onStatus).toHaveBeenCalledWith('disconnected')
    
    // Check reconnect delay (100ms)
    mockWebSocketClass.mockClear()
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(mockWebSocketClass).toHaveBeenCalled()

    // Next close should be 200ms
    act(() => {
      mockWsInstance.onclose({ reason: 'crashed' })
    })
    mockWebSocketClass.mockClear()
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(mockWebSocketClass).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(mockWebSocketClass).toHaveBeenCalled()
  })
})
