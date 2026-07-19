import React from 'react'

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
        <span>I consent to sending diagram data to cloud LLM providers</span>
      </label>
    </div>
  )
}
