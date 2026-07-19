import React from 'react';

interface Member {
  connId: string;
  displayName: string;
  disconnected?: boolean;
}

interface PresenceBarProps {
  members: Member[];
  aiWorkingFor: string | null; // displayName of the user who holds the AI lock
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function getInitials(name: string): string {
  const parts = name.split(/[\s\-_]+/);
  return parts.map(p => p[0] || '').join('').toUpperCase().slice(0, 2);
}

export const PresenceBar: React.FC<PresenceBarProps> = ({ members, aiWorkingFor }) => {
  return (
    <div className="presence-bar" role="complementary" aria-label="Active session members">
      {members.map((member) => {
        const initials = getInitials(member.displayName);
        const hue = hashCode(member.connId) % 360;
        const style: React.CSSProperties = {
          backgroundColor: `hsl(${hue}, 70%, 45%)`,
        };
        
        const isAiWorking = aiWorkingFor === member.displayName;
        const classes = [
          'presence-badge',
          member.disconnected ? 'disconnected' : '',
          isAiWorking ? 'pulse-active' : ''
        ].filter(Boolean).join(' ');

        return (
          <div
            key={member.connId}
            className={classes}
            style={style}
            title={`${member.displayName}${member.disconnected ? ' (Disconnected)' : ''}`}
            data-testid={`presence-badge-${member.connId}`}
          >
            {initials}
          </div>
        );
      })}
    </div>
  );
};
