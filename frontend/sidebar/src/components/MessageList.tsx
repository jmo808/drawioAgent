import React, { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export interface MessageType {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  toolProgress?: {
    toolName: string;
    step: number;
    totalSteps: number;
    message: string;
  };
}

interface MessageListProps {
  messages: MessageType[];
}

export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Safely parse Markdown to HTML and sanitize it
  const renderMarkdown = (text: string) => {
    try {
      const html = marked.parse(text, { gfm: true, breaks: true }) as string;
      const cleanHtml = DOMPurify.sanitize(html);
      return { __html: cleanHtml };
    } catch (e) {
      console.error('Failed to parse markdown:', e);
      return { __html: DOMPurify.sanitize(text) };
    }
  };


  return (
    <div
      className="drawio-agent-msg-list"
      role="log"
      aria-live="polite"
      aria-label="Chat messages"
    >
      {messages.map((msg) => {
        const isUser = msg.role === 'user';
        const isSystem = msg.role === 'system';
        
        let bubbleClass = 'drawio-agent-msg-assistant';
        if (isUser) {
          bubbleClass = 'drawio-agent-msg-user';
        } else if (isSystem) {
          bubbleClass = 'drawio-agent-msg-system';
        }

        return (
          <div key={msg.id} className={`drawio-agent-msg-row ${isUser ? 'drawio-agent-row-user' : 'drawio-agent-row-assistant'}`}>
            <div className={`drawio-agent-msg-bubble ${bubbleClass}`}>
              {msg.text && (
                <div
                  className="drawio-agent-msg-text"
                  dangerouslySetInnerHTML={renderMarkdown(msg.text)}
                />
              )}
              
              {msg.toolProgress && (() => {
                const name = msg.toolProgress.toolName;
                const isThinking = name === 'Archimedes AI' || name === 'gemini_thinking';
                const title = isThinking
                  ? 'Thinking...'
                  : name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                
                return (
                  <div className="drawio-agent-tool-progress">
                    <div className="drawio-agent-tool-header">
                      <Loader2 className="drawio-agent-spinner" size={14} />
                      <span className="drawio-agent-tool-title">
                        {isThinking ? title : `Running: ${title}`}
                      </span>
                    </div>
                    <div className="drawio-agent-tool-desc">{msg.toolProgress.message}</div>
                    {!isThinking && (
                      <div className="drawio-agent-tool-steps">
                        step {msg.toolProgress.step} / {msg.toolProgress.totalSteps}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
