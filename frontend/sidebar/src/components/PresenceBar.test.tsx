import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PresenceBar } from './PresenceBar';

describe('PresenceBar', () => {
  const members = [
    { connId: 'conn-1', displayName: 'Alice' },
    { connId: 'conn-2', displayName: 'Bob Smith', disconnected: true },
  ];

  test('renders presence badges for members', () => {
    render(<PresenceBar members={members} aiWorkingFor={null} />);
    
    const aliceBadge = screen.getByTestId('presence-badge-conn-1');
    expect(aliceBadge).toBeInTheDocument();
    expect(aliceBadge.textContent).toBe('A');
    expect(aliceBadge.title).toBe('Alice');

    const bobBadge = screen.getByTestId('presence-badge-conn-2');
    expect(bobBadge).toBeInTheDocument();
    expect(bobBadge.textContent).toBe('BS');
    expect(bobBadge.title).toBe('Bob Smith (Disconnected)');
    expect(bobBadge.className).toContain('disconnected');
  });

  test('applies pulse-active class to member with AI lock', () => {
    render(<PresenceBar members={members} aiWorkingFor="Alice" />);
    
    const aliceBadge = screen.getByTestId('presence-badge-conn-1');
    expect(aliceBadge.className).toContain('pulse-active');

    const bobBadge = screen.getByTestId('presence-badge-conn-2');
    expect(bobBadge.className).not.toContain('pulse-active');
  });
});
