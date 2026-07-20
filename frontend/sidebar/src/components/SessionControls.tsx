import React, { useState } from 'react';
import { MESSAGES } from '../i18n';
import { Copy, Check, Users } from 'lucide-react';

interface SessionControlsProps {
  sessionId: string | null;
  shortCode?: string;
  onCreateSession: () => void;
  onJoinSession: (codeOrId: string) => void;
  onLeaveSession: () => void;
  displayName?: string;
  onEditDisplayName?: () => void;
}

export const SessionControls: React.FC<SessionControlsProps> = ({
  sessionId,
  shortCode,
  onCreateSession,
  onJoinSession,
  onLeaveSession,
  displayName,
  onEditDisplayName,
}) => {
  const [copied, setCopied] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [showJoinInput, setShowJoinInput] = useState(false);

  const handleCopy = () => {
    const textToCopy = shortCode || sessionId;
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => {
        console.error('Failed to copy session ID: ', err);
      });
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.trim()) {
      onJoinSession(joinCode.trim());
      setJoinCode('');
      setShowJoinInput(false);
    }
  };

  return (
    <div className="session-controls glassmorphism">
      {displayName && (
        <div className="session-user-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: '12px', opacity: 0.85 }}>
          <span>Name: <strong>{displayName}</strong></span>
          <button 
            type="button" 
            className="btn-edit-name" 
            onClick={onEditDisplayName}
            style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontSize: '11px' }}
          >
            Change
          </button>
        </div>
      )}
      {!sessionId ? (
        <div className="collab-actions">
          {!showJoinInput ? (
            <>
              <button className="btn btn-primary" onClick={onCreateSession}>
                <Users size={16} style={{ marginRight: 8 }} />
                {MESSAGES.btnCreateSession}
              </button>
              <button className="btn btn-secondary" onClick={() => setShowJoinInput(true)}>
                {MESSAGES.btnJoinSession}
              </button>
            </>
          ) : (
            <form onSubmit={handleJoinSubmit} className="join-form">
              <input
                type="text"
                className="input-field"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder={MESSAGES.placeholderShortCode}
                autoFocus
              />
              <div className="form-actions">
                <button type="submit" className="btn btn-primary btn-sm">
                  {MESSAGES.btnConfirm}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowJoinInput(false)}
                >
                  {MESSAGES.btnCancel}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        <div className="session-info">
          <div className="session-header-row">
            <span className="session-label">Session ID:</span>
            <span className="session-value" title={sessionId}>
              {shortCode || `${sessionId.substring(0, 8)}...`}
            </span>
          </div>
          <div className="session-copy-row">
            <button className="btn btn-icon" onClick={handleCopy} title="Copy Session ID">
              {copied ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
              <span className="btn-text">{copied ? MESSAGES.copied : MESSAGES.btnCopy}</span>
            </button>
            <button className="btn btn-danger btn-sm" onClick={onLeaveSession}>
              {MESSAGES.btnLeaveSession}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
