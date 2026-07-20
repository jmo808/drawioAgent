import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatStore } from './useChatStore';

describe('useChatStore', () => {
  test('should initialize with empty messages and disconnected status', () => {
    const { result } = renderHook(() => useChatStore());
    expect(result.current.state.messages).toEqual([]);
    expect(result.current.state.connectionStatus).toBe('disconnected');
    expect(result.current.state.isLoading).toBe(false);
  });

  test('should handle ADD_USER_MESSAGE', () => {
    const { result } = renderHook(() => useChatStore());
    act(() => {
      result.current.dispatch({ type: 'ADD_USER_MESSAGE', payload: 'draw node' });
    });
    expect(result.current.state.messages.length).toBe(1);
    expect(result.current.state.messages[0].role).toBe('user');
    expect(result.current.state.messages[0].text).toBe('draw node');
    expect(result.current.state.isLoading).toBe(true);
  });

  test('should handle UPDATE_CONNECTION_STATUS', () => {
    const { result } = renderHook(() => useChatStore());
    act(() => {
      result.current.dispatch({ type: 'UPDATE_CONNECTION_STATUS', payload: 'connected' });
    });
    expect(result.current.state.connectionStatus).toBe('connected');
  });

  test('should handle RECEIVE_TOOL_PROGRESS', () => {
    const { result } = renderHook(() => useChatStore());
    
    // Add user message first to start loading
    act(() => {
      result.current.dispatch({ type: 'ADD_USER_MESSAGE', payload: 'draw node' });
    });
    
    // Tool progress
    act(() => {
      result.current.dispatch({
        type: 'RECEIVE_TOOL_PROGRESS',
        payload: { toolName: 'add_node', step: 1, totalSteps: 2, message: 'Creating' }
      });
    });

    expect(result.current.state.messages.length).toBe(2);
    const assistantMsg = result.current.state.messages[1];
    expect(assistantMsg.role).toBe('assistant');
    expect(assistantMsg.toolProgress).toEqual({
      toolName: 'add_node',
      step: 1,
      totalSteps: 2,
      message: 'Creating'
    });
  });

  test('should handle RECEIVE_CHAT_MESSAGE', () => {
    const { result } = renderHook(() => useChatStore());
    
    // Add user message
    act(() => {
      result.current.dispatch({ type: 'ADD_USER_MESSAGE', payload: 'draw node' });
    });
    
    // Final text response
    act(() => {
      result.current.dispatch({ type: 'RECEIVE_CHAT_MESSAGE', payload: 'Done!' });
    });

    expect(result.current.state.messages.length).toBe(2);
    const assistantMsg = result.current.state.messages[1];
    expect(assistantMsg.role).toBe('assistant');
    expect(assistantMsg.text).toBe('Done!');
    expect(assistantMsg.toolProgress).toBeUndefined();
    expect(result.current.state.isLoading).toBe(false);
  });

  test('should handle SET_COLLABORATION_ENABLED', () => {
    const { result } = renderHook(() => useChatStore());
    act(() => {
      result.current.dispatch({ type: 'SET_COLLABORATION_ENABLED', payload: true });
    });
    expect(result.current.state.collaborationEnabled).toBe(true);
  });

  test('should handle SET_SESSION', () => {
    const { result } = renderHook(() => useChatStore());
    act(() => {
      result.current.dispatch({ type: 'SET_SESSION', payload: { sessionId: 'my-session', shortCode: '123456' } });
    });
    expect(result.current.state.sessionId).toBe('my-session');
    expect(result.current.state.shortCode).toBe('123456');
  });

  test('should handle CLEAR_SESSION', () => {
    const { result } = renderHook(() => useChatStore());
    act(() => {
      result.current.dispatch({ type: 'SET_SESSION', payload: { sessionId: 'my-session', shortCode: '123456' } });
    });
    act(() => {
      result.current.dispatch({ type: 'CLEAR_SESSION' });
    });
    expect(result.current.state.sessionId).toBeNull();
    expect(result.current.state.shortCode).toBeUndefined();
    expect(result.current.state.members).toEqual([]);
  });

  test('should handle SET_DISPLAY_NAME', () => {
    const { result } = renderHook(() => useChatStore());
    act(() => {
      result.current.dispatch({ type: 'SET_DISPLAY_NAME', payload: 'Alice' });
    });
    expect(result.current.state.displayName).toBe('Alice');
  });

  test('should handle SET_MEMBERS', () => {
    const { result } = renderHook(() => useChatStore());
    act(() => {
      result.current.dispatch({ type: 'SET_MEMBERS', payload: [{ connId: '1', displayName: 'Alice' }] });
    });
    expect(result.current.state.members).toEqual([{ connId: '1', displayName: 'Alice' }]);
  });

  test('should handle ADD_MEMBER and REMOVE_MEMBER', () => {
    const { result } = renderHook(() => useChatStore());
    act(() => {
      result.current.dispatch({ type: 'ADD_MEMBER', payload: { connId: '1', displayName: 'Alice' } });
    });
    expect(result.current.state.members).toEqual([{ connId: '1', displayName: 'Alice' }]);

    act(() => {
      result.current.dispatch({ type: 'REMOVE_MEMBER', payload: '1' });
    });
    expect(result.current.state.members).toEqual([]);
  });

  test('should handle SET_AI_WORKING_FOR', () => {
    const { result } = renderHook(() => useChatStore());
    act(() => {
      result.current.dispatch({ type: 'SET_AI_WORKING_FOR', payload: 'Bob' });
    });
    expect(result.current.state.aiWorkingFor).toBe('Bob');
  });
});
