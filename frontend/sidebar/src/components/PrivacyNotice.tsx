import React from 'react'
import { MESSAGES } from '../i18n'

interface PrivacyNoticeProps {
  onAccept: () => void;
  onDismiss: () => void;
}

export const PrivacyNotice: React.FC<PrivacyNoticeProps> = ({ onAccept, onDismiss }) => {
  return (
    <div className="drawio-agent-privacy-notice" data-testid="privacy-notice">
      <div className="drawio-agent-privacy-content">
        <p>
          <strong>{MESSAGES.privacyWarningTitle}</strong> {MESSAGES.privacyWarningText}
        </p>
      </div>
      <div className="drawio-agent-privacy-actions">
        <button className="drawio-agent-btn primary" onClick={onAccept} data-testid="accept-consent-btn">
          {MESSAGES.btnConsentAccept}
        </button>
        <button className="drawio-agent-btn secondary" onClick={onDismiss} data-testid="dismiss-consent-btn">
          {MESSAGES.btnDismiss}
        </button>
      </div>
    </div>
  )
}
