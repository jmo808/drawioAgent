import { describe, it, expect } from 'vitest';
import { 
  validateWebSocketMessage, 
  isChatMessage, 
  isToolProgress, 
  isDiagramUpdate, 
  isErrorPayload 
} from './index.js';

describe('Shared types and schemas', () => {
  describe('validateWebSocketMessage', () => {
    it('should validate valid chat_message envelope', () => {
      const msg = {
        type: 'chat_message',
        payload: {
          text: 'hello',
          diagramXml: '<mxfile></mxfile>'
        },
        id: '123',
        timestamp: new Date().toISOString()
      };
      expect(validateWebSocketMessage(msg)).toBe(true);
    });

    it('should reject envelope with missing type', () => {
      const msg = {
        payload: { text: 'hello' },
        timestamp: new Date().toISOString()
      };
      // @ts-ignore
      expect(validateWebSocketMessage(msg)).toBe(false);
    });

    it('should reject envelope with invalid timestamp', () => {
      const msg = {
        type: 'chat_message',
        payload: { text: 'hello' },
        timestamp: 'invalid-date'
      };
      expect(validateWebSocketMessage(msg)).toBe(false);
    });
  });

  describe('type guards', () => {
    it('should check ChatMessage payload', () => {
      const payload = { text: 'hello', diagramXml: '<mxfile></mxfile>' };
      expect(isChatMessage(payload)).toBe(true);
      expect(isChatMessage({ text: 123 })).toBe(false);
    });

    it('should check ToolProgress payload', () => {
      const payload = { toolName: 'init_diagram', step: 1, totalSteps: 5, message: 'initializing' };
      expect(isToolProgress(payload)).toBe(true);
      expect(isToolProgress({ toolName: 'init_diagram' })).toBe(false);
    });

    it('should check DiagramUpdate payload', () => {
      const payload = { xml: '<mxfile></mxfile>' };
      expect(isDiagramUpdate(payload)).toBe(true);
      expect(isDiagramUpdate({ xml: 123 })).toBe(false);
    });

    it('should check ErrorPayload', () => {
      const payload = { code: 'ERR_TIMEOUT', message: 'operation timed out' };
      expect(isErrorPayload(payload)).toBe(true);
      expect(isErrorPayload({ message: 'just message' })).toBe(false);
    });
  });
});
