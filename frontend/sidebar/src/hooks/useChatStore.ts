import { useReducer } from 'react'
import type { MessageType } from '../components/MessageList'

export interface ChatState {
  messages: MessageType[];
  isLoading: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  collaborationEnabled: boolean;
  sessionId: string | null;
  shortCode?: string;
  displayName?: string;
  members: { connId: string; displayName: string; disconnected?: boolean }[];
  aiWorkingFor: string | null;
}

export type ChatAction =
  | { type: 'ADD_USER_MESSAGE'; payload: string }
  | { type: 'UPDATE_CONNECTION_STATUS'; payload: 'connecting' | 'connected' | 'disconnected' }
  | { type: 'RECEIVE_TOOL_PROGRESS'; payload: { toolName: string; step: number; totalSteps: number; message: string } }
  | { type: 'RECEIVE_CHAT_MESSAGE'; payload: string }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'SET_COLLABORATION_ENABLED'; payload: boolean }
  | { type: 'SET_SESSION'; payload: { sessionId: string; shortCode?: string } }
  | { type: 'CLEAR_SESSION' }
  | { type: 'SET_DISPLAY_NAME'; payload: string }
  | { type: 'SET_MEMBERS'; payload: { connId: string; displayName: string; disconnected?: boolean }[] }
  | { type: 'ADD_MEMBER'; payload: { connId: string; displayName: string } }
  | { type: 'REMOVE_MEMBER'; payload: string }
  | { type: 'SET_AI_WORKING_FOR'; payload: string | null };

const chatReducer = (state: ChatState, action: ChatAction): ChatState => {
  switch (action.type) {
    case 'ADD_USER_MESSAGE': {
      const userMsg: MessageType = {
        id: Math.random().toString(36).substring(2, 9),
        role: 'user',
        text: action.payload
      }
      return {
        ...state,
        messages: [...state.messages, userMsg],
        isLoading: true
      }
    }
    case 'UPDATE_CONNECTION_STATUS':
      return {
        ...state,
        connectionStatus: action.payload
      }
    case 'RECEIVE_TOOL_PROGRESS': {
      const lastMsg = state.messages[state.messages.length - 1]
      if (lastMsg && lastMsg.role === 'assistant') {
        const updatedMessages = [...state.messages]
        updatedMessages[updatedMessages.length - 1] = {
          ...lastMsg,
          toolProgress: action.payload
        }
        return {
          ...state,
          messages: updatedMessages
        }
      } else {
        const assistantMsg: MessageType = {
          id: Math.random().toString(36).substring(2, 9),
          role: 'assistant',
          text: '',
          toolProgress: action.payload
        }
        return {
          ...state,
          messages: [...state.messages, assistantMsg]
        }
      }
    }
    case 'RECEIVE_CHAT_MESSAGE': {
      const lastMsg = state.messages[state.messages.length - 1]
      if (lastMsg && lastMsg.role === 'assistant') {
        const updatedMessages = [...state.messages]
        updatedMessages[updatedMessages.length - 1] = {
          ...lastMsg,
          text: action.payload,
          toolProgress: undefined
        }
        return {
          ...state,
          messages: updatedMessages,
          isLoading: false
        }
      } else {
        const assistantMsg: MessageType = {
          id: Math.random().toString(36).substring(2, 9),
          role: 'assistant',
          text: action.payload
        }
        return {
          ...state,
          messages: [...state.messages, assistantMsg],
          isLoading: false
        }
      }
    }
    case 'SET_ERROR': {
      const errorMsg: MessageType = {
        id: Math.random().toString(36).substring(2, 9),
        role: 'system',
        text: `Error: ${action.payload}`
      }
      return {
        ...state,
        messages: [...state.messages, errorMsg],
        isLoading: false
      }
    }
    case 'SET_COLLABORATION_ENABLED':
      return {
        ...state,
        collaborationEnabled: action.payload
      }
    case 'SET_SESSION':
      return {
        ...state,
        sessionId: action.payload.sessionId,
        shortCode: action.payload.shortCode
      }
    case 'CLEAR_SESSION':
      return {
        ...state,
        sessionId: null,
        shortCode: undefined,
        members: []
      }
    case 'SET_DISPLAY_NAME':
      return {
        ...state,
        displayName: action.payload
      }
    case 'SET_MEMBERS':
      return {
        ...state,
        members: action.payload
      }
    case 'ADD_MEMBER':
      if (state.members.some(m => m.connId === action.payload.connId)) {
        return state;
      }
      return {
        ...state,
        members: [...state.members, action.payload]
      }
    case 'REMOVE_MEMBER':
      return {
        ...state,
        members: state.members.filter(m => m.connId !== action.payload)
      }
    case 'SET_AI_WORKING_FOR':
      return {
        ...state,
        aiWorkingFor: action.payload
      }
    default:
      return state
  }
}

export const useChatStore = (_sessionId: string) => {
  const [state, dispatch] = useReducer(chatReducer, {
    messages: [],
    isLoading: false,
    connectionStatus: 'disconnected',
    collaborationEnabled: false,
    sessionId: null,
    members: [],
    aiWorkingFor: null
  })

  return { state, dispatch }
}
