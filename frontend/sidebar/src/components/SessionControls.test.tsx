import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionControls } from './SessionControls';
import { MESSAGES } from '../i18n';

describe('SessionControls', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockImplementation(() => Promise.resolve()),
      },
    });
  });

  test('renders Create and Join buttons when sessionId is null', () => {
    render(
      <SessionControls
        sessionId={null}
        onCreateSession={vi.fn()}
        onJoinSession={vi.fn()}
        onLeaveSession={vi.fn()}
      />
    );

    expect(screen.getByText(MESSAGES.btnCreateSession)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.btnJoinSession)).toBeInTheDocument();
  });

  test('triggers onCreateSession when Create button is clicked', () => {
    const handleCreate = vi.fn();
    render(
      <SessionControls
        sessionId={null}
        onCreateSession={handleCreate}
        onJoinSession={vi.fn()}
        onLeaveSession={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText(MESSAGES.btnCreateSession));
    expect(handleCreate).toHaveBeenCalled();
  });

  test('shows join form and triggers onJoinSession on submit', () => {
    const handleJoin = vi.fn();
    render(
      <SessionControls
        sessionId={null}
        onCreateSession={vi.fn()}
        onJoinSession={handleJoin}
        onLeaveSession={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText(MESSAGES.btnJoinSession));
    
    const input = screen.getByPlaceholderText(MESSAGES.placeholderShortCode);
    fireEvent.change(input, { target: { value: '123456' } });

    const submitBtn = screen.getByText(MESSAGES.btnConfirm);
    fireEvent.click(submitBtn);

    expect(handleJoin).toHaveBeenCalledWith('123456');
  });

  test('renders session details and copy/leave buttons when sessionId is provided', async () => {
    const handleLeave = vi.fn();
    render(
      <SessionControls
        sessionId="uuid-session-12345"
        shortCode="654321"
        onCreateSession={vi.fn()}
        onJoinSession={vi.fn()}
        onLeaveSession={handleLeave}
      />
    );

    expect(screen.getByText('654321')).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.btnCopy)).toBeInTheDocument();
    
    // Test Copy
    fireEvent.click(screen.getByText(MESSAGES.btnCopy));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('?session=uuid-session-12345')
    );

    await waitFor(() => {
      expect(screen.getByText(MESSAGES.copied)).toBeInTheDocument();
    });

    // Test Leave
    fireEvent.click(screen.getByText(MESSAGES.btnLeaveSession));
    expect(handleLeave).toHaveBeenCalled();
  });
});
