import React from 'react'

interface PrivacyNoticeProps {
  onAccept: () => void;
  onDismiss: () => void;
}

export const PrivacyNotice: React.FC<PrivacyNoticeProps> = ({ onAccept, onDismiss }) => {
  return (
    <div className="drawio-agent-privacy-notice" data-testid="privacy-notice">
      <div className="drawio-agent-privacy-content">
        <p>
          <strong>Privacy Warning:</strong> Using cloud LLM providers (Gemini or OpenAI) will send your diagram data to external third-party servers.
        </p>
      </div>
      <div className="drawio-agent-privacy-actions">
        <button className="drawio-agent-btn primary" onClick={onAccept} data-testid="accept-consent-btn">
          Consent & Accept
        </button>
        <button className="drawio-agent-btn secondary" onClick={onDismiss} data-testid="dismiss-consent-btn">
          Dismiss
        </button>
      </div>
    </div>
  )
}
