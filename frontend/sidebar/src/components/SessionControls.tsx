import React, { useState } from 'react';
import { MESSAGES } from '../i18n';
import { Copy, Check, Users } from 'lucide-react';

interface SessionControlsProps {
  sessionId: string | null;
  shortCode?: string;
  onCreateSession: () => void;
  onJoinSession: (codeOrId: string) => void;
  onLeaveSession: () => void;
}

export const SessionControls: React.FC<SessionControlsProps> = ({
  sessionId,
  shortCode,
  onCreateSession,
  onJoinSession,
  onLeaveSession,
}) => {
  const [copied, setCopied] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [showJoinInput, setShowJoinInput] = useState(false);

  const handleCopy = () => {
    if (!sessionId) return;
    const url = `${window.location.origin}${window.location.pathname}?session=${sessionId}`;
    navigator.clipboard.writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => {
        console.error('Failed to copy session link: ', err);
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
            <button className="btn btn-icon" onClick={handleCopy} title="Copy Session Link">
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
