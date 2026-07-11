import { describe, test, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChatStore } from './useChatStore'

describe('useChatStore', () => {
  test('should initialize with empty messages and disconnected status', () => {
    const { result } = renderHook(() => useChatStore('session-1'))
    expect(result.current.state.messages).toEqual([])
    expect(result.current.state.connectionStatus).toBe('disconnected')
    expect(result.current.state.isLoading).toBe(false)
  })

  test('should handle ADD_USER_MESSAGE', () => {
    const { result } = renderHook(() => useChatStore('session-1'))
    act(() => {
      result.current.dispatch({ type: 'ADD_USER_MESSAGE', payload: 'draw node' })
    })
    expect(result.current.state.messages.length).toBe(1)
    expect(result.current.state.messages[0].role).toBe('user')
    expect(result.current.state.messages[0].text).toBe('draw node')
    expect(result.current.state.isLoading).toBe(true)
  })

  test('should handle UPDATE_CONNECTION_STATUS', () => {
    const { result } = renderHook(() => useChatStore('session-1'))
    act(() => {
      result.current.dispatch({ type: 'UPDATE_CONNECTION_STATUS', payload: 'connected' })
    })
    expect(result.current.state.connectionStatus).toBe('connected')
  })

  test('should handle RECEIVE_TOOL_PROGRESS', () => {
    const { result } = renderHook(() => useChatStore('session-1'))
    
    // Add user message first to start loading
    act(() => {
      result.current.dispatch({ type: 'ADD_USER_MESSAGE', payload: 'draw node' })
    })
    
    // Tool progress
    act(() => {
      result.current.dispatch({
        type: 'RECEIVE_TOOL_PROGRESS',
        payload: { toolName: 'add_node', step: 1, totalSteps: 2, message: 'Creating' }
      })
    })

    expect(result.current.state.messages.length).toBe(2)
    const assistantMsg = result.current.state.messages[1]
    expect(assistantMsg.role).toBe('assistant')
    expect(assistantMsg.toolProgress).toEqual({
      toolName: 'add_node',
      step: 1,
      totalSteps: 2,
      message: 'Creating'
    })
  })

  test('should handle RECEIVE_CHAT_MESSAGE', () => {
    const { result } = renderHook(() => useChatStore('session-1'))
    
    // Add user message
    act(() => {
      result.current.dispatch({ type: 'ADD_USER_MESSAGE', payload: 'draw node' })
    })
    
    // Final text response
    act(() => {
      result.current.dispatch({ type: 'RECEIVE_CHAT_MESSAGE', payload: 'Done!' })
    })

    expect(result.current.state.messages.length).toBe(2)
    const assistantMsg = result.current.state.messages[1]
    expect(assistantMsg.role).toBe('assistant')
    expect(assistantMsg.text).toBe('Done!')
    expect(assistantMsg.toolProgress).toBeUndefined()
    expect(result.current.state.isLoading).toBe(false)
  })
})
