import { z } from 'zod';

// Zod Schemas
export const ChatMessageSchema = z.object({
  text: z.string(),
  diagramXml: z.string().optional(),
  sessionId: z.string().optional()
});

export const ToolProgressSchema = z.object({
  toolName: z.string(),
  step: z.number(),
  totalSteps: z.number(),
  message: z.string().optional()
});

export const DiagramUpdateSchema = z.object({
  xml: z.string()
});

export const ErrorPayloadSchema = z.object({
  code: z.string(),
  message: z.string()
});

export const LLMProviderConfigSchema = z.object({
  provider: z.string(),
  model: z.string(),
  apiKey: z.string().optional()
});

export const MCPToolCallSchema = z.object({
  name: z.string(),
  arguments: z.record(z.unknown())
});

export const MCPToolResultSchema = z.object({
  content: z.array(z.object({
    type: z.string(),
    text: z.string()
  })),
  isError: z.boolean().optional()
});

export const CollaborationJoinPayloadSchema = z.object({
  sessionId: z.string(),
  displayName: z.string(),
  identityLink: z.string().optional() // Optional identity linking field
});

export const CollaborationSyncPayloadSchema = z.object({
  sessionId: z.string(),
  diagramXml: z.string(),
  version: z.number() // Version field to prevent race conditions
});

// WebSocket Message Types List
export type WebSocketMessageType = 
  | 'chat_message'
  | 'tool_progress'
  | 'diagram_update'
  | 'error'
  | 'provider_change'
  | 'template_select'
  | 'diagram_state_sync'
  | 'provider_warning'
  | 'collaboration_join'
  | 'collaboration_sync'
  | 'diagram_broadcast'
  | 'session_create'
  | 'session_join'
  | 'session_leave'
  | 'session_state'
  | 'member_joined'
  | 'member_left'
  | 'ai_locked'
  | 'ai_unlocked';

export const WebSocketMessageSchema = z.object({
  type: z.enum([
    'chat_message',
    'tool_progress',
    'diagram_update',
    'error',
    'provider_change',
    'template_select',
    'diagram_state_sync',
    'provider_warning',
    'collaboration_join',
    'collaboration_sync',
    'diagram_broadcast',
    'session_create',
    'session_join',
    'session_leave',
    'session_state',
    'member_joined',
    'member_left',
    'ai_locked',
    'ai_unlocked'
  ]),
  payload: z.record(z.unknown()),
  id: z.string().optional(),
  timestamp: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid ISO 8601 date string"
  })
});

// TypeScript interfaces
export interface WebSocketMessage {
  type: WebSocketMessageType;
  payload: Record<string, unknown>;
  id?: string;
  timestamp: string;
}

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ToolProgress = z.infer<typeof ToolProgressSchema>;
export type DiagramUpdate = z.infer<typeof DiagramUpdateSchema>;
export type ErrorPayload = z.infer<typeof ErrorPayloadSchema>;
export type LLMProviderConfig = z.infer<typeof LLMProviderConfigSchema>;
export type MCPToolCall = z.infer<typeof MCPToolCallSchema>;
export type MCPToolResult = z.infer<typeof MCPToolResultSchema>;

/**
 * Validates if the given message conforms to the WebSocketMessage schema.
 * @param msg The raw message to validate.
 * @returns True if the message is a valid WebSocketMessage, false otherwise.
 */
export function validateWebSocketMessage(msg: unknown): msg is WebSocketMessage {
  return WebSocketMessageSchema.safeParse(msg).success;
}

/**
 * Validates if the given payload conforms to the ChatMessage schema.
 * @param payload The raw payload to validate.
 * @returns True if the payload is a valid ChatMessage, false otherwise.
 */
export function isChatMessage(payload: unknown): payload is ChatMessage {
  return ChatMessageSchema.safeParse(payload).success;
}

/**
 * Validates if the given payload conforms to the ToolProgress schema.
 * @param payload The raw payload to validate.
 * @returns True if the payload is a valid ToolProgress, false otherwise.
 */
export function isToolProgress(payload: unknown): payload is ToolProgress {
  return ToolProgressSchema.safeParse(payload).success;
}

/**
 * Validates if the given payload conforms to the DiagramUpdate schema.
 * @param payload The raw payload to validate.
 * @returns True if the payload is a valid DiagramUpdate, false otherwise.
 */
export function isDiagramUpdate(payload: unknown): payload is DiagramUpdate {
  return DiagramUpdateSchema.safeParse(payload).success;
}

/**
 * Validates if the given payload conforms to the ErrorPayload schema.
 * @param payload The raw payload to validate.
 * @returns True if the payload is a valid ErrorPayload, false otherwise.
 */
export function isErrorPayload(payload: unknown): payload is ErrorPayload {
  return ErrorPayloadSchema.safeParse(payload).success;
}

export type CollaborationJoinPayload = z.infer<typeof CollaborationJoinPayloadSchema>;
export type CollaborationSyncPayload = z.infer<typeof CollaborationSyncPayloadSchema>;

export function isCollaborationJoinPayload(payload: unknown): payload is CollaborationJoinPayload {
  return CollaborationJoinPayloadSchema.safeParse(payload).success;
}

export function isCollaborationSyncPayload(payload: unknown): payload is CollaborationSyncPayload {
  return CollaborationSyncPayloadSchema.safeParse(payload).success;
}
