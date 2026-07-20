import React, { useState } from 'react';
import { MESSAGES } from '../i18n';
import { generateRandomName } from '../utils/nameGenerator';

interface DisplayNamePromptProps {
  isOpen: boolean;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export const DisplayNamePrompt: React.FC<DisplayNamePromptProps> = ({
  isOpen,
  onConfirm,
  onCancel
}) => {
  const [name, setName] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = name.trim() || generateRandomName();
    onConfirm(finalName);
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-content glassmorphism animate-fade-in">
        <h3 id="modal-title">{MESSAGES.promptEnterDisplayName}</h3>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            className="input-field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={MESSAGES.placeholderDisplayName}
            autoFocus
          />
          <div className="modal-actions">
            <button type="button" className="drawio-agent-btn secondary" onClick={onCancel}>
              {MESSAGES.btnCancel}
            </button>
            <button type="submit" className="drawio-agent-btn primary">
              {MESSAGES.btnConfirm}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
