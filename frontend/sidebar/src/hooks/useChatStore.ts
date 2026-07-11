import { useReducer } from 'react'
import { MessageType } from '../components/MessageList'

export interface ChatState {
  messages: MessageType[];
  isLoading: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
}

export type ChatAction =
  | { type: 'ADD_USER_MESSAGE'; payload: string }
  | { type: 'UPDATE_CONNECTION_STATUS'; payload: 'connecting' | 'connected' | 'disconnected' }
  | { type: 'RECEIVE_TOOL_PROGRESS'; payload: { toolName: string; step: number; totalSteps: number; message: string } }
  | { type: 'RECEIVE_CHAT_MESSAGE'; payload: string }
  | { type: 'SET_ERROR'; payload: string };

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
    default:
      return state
  }
}

export const useChatStore = (sessionId: string) => {
  const [state, dispatch] = useReducer(chatReducer, {
    messages: [],
    isLoading: false,
    connectionStatus: 'disconnected'
  })

  return { state, dispatch }
}
