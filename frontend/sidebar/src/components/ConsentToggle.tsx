import React from 'react'
import { MESSAGES } from '../i18n'

interface ConsentToggleProps {
  consented: boolean;
  onChange: (consented: boolean) => void;
}

export const ConsentToggle: React.FC<ConsentToggleProps> = ({ consented, onChange }) => {
  return (
    <div className="drawio-agent-consent-toggle" data-testid="consent-toggle-container">
      <label className="drawio-agent-checkbox-label">
        <input
          type="checkbox"
          checked={consented}
          onChange={(e) => onChange(e.target.checked)}
          data-testid="consent-checkbox"
        />
        <span>{MESSAGES.consentCheckboxLabel}</span>
      </label>
    </div>
  )
}
