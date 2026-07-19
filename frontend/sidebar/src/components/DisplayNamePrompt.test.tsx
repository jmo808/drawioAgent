import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DisplayNamePrompt } from './DisplayNamePrompt';
import { MESSAGES } from '../i18n';

describe('DisplayNamePrompt', () => {
  test('does not render when isOpen is false', () => {
    const { container } = render(
      <DisplayNamePrompt isOpen={false} onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  test('renders prompt and inputs when isOpen is true', () => {
    render(
      <DisplayNamePrompt isOpen={true} onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByText(MESSAGES.promptEnterDisplayName)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(MESSAGES.placeholderDisplayName)).toBeInTheDocument();
  });

  test('calls onConfirm with input name when submitted', () => {
    const handleConfirm = vi.fn();
    render(
      <DisplayNamePrompt isOpen={true} onConfirm={handleConfirm} onCancel={vi.fn()} />
    );

    const input = screen.getByPlaceholderText(MESSAGES.placeholderDisplayName);
    fireEvent.change(input, { target: { value: 'Bob' } });

    const form = screen.getByRole('dialog').querySelector('form')!;
    fireEvent.submit(form);

    expect(handleConfirm).toHaveBeenCalledWith('Bob');
  });

  test('calls onConfirm with random name when submitted empty', () => {
    const handleConfirm = vi.fn();
    render(
      <DisplayNamePrompt isOpen={true} onConfirm={handleConfirm} onCancel={vi.fn()} />
    );

    const form = screen.getByRole('dialog').querySelector('form')!;
    fireEvent.submit(form);

    expect(handleConfirm).toHaveBeenCalled();
    const confirmedName = handleConfirm.mock.calls[0][0];
    expect(confirmedName).toMatch(/^[A-Z][a-z]+-[A-Z][a-z]+-[0-9a-f]{4}$/);
  });

  test('calls onCancel when cancel button clicked', () => {
    const handleCancel = vi.fn();
    render(
      <DisplayNamePrompt isOpen={true} onConfirm={vi.fn()} onCancel={handleCancel} />
    );

    fireEvent.click(screen.getByText(MESSAGES.btnCancel));
    expect(handleCancel).toHaveBeenCalled();
  });
});
