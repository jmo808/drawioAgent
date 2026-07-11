import React from 'react'

export interface ProviderInfo {
  provider: string;
  model: string;
}

interface ProviderSelectorProps {
  providers: ProviderInfo[];
  activeProvider: string;
  onChange: (provider: ProviderInfo) => void;
}

export const ProviderSelector: React.FC<ProviderSelectorProps> = ({
  providers,
  activeProvider,
  onChange
}) => {
  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedProviderName = e.target.value
    const found = providers.find((p) => p.provider === selectedProviderName)
    if (found) {
      onChange(found)
    }
  }

  return (
    <div className="drawio-agent-provider-selector">
      <select
        className="drawio-agent-select"
        value={activeProvider}
        onChange={handleSelectChange}
      >
        {providers.map((p) => (
          <option key={p.provider} value={p.provider}>
            {p.provider} ({p.model})
          </option>
        ))}
      </select>
    </div>
  )
}
