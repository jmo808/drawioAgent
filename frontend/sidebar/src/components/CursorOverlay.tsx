import React, { useEffect, useState } from 'react';
import { canvasToScreenCoordinates } from '../services/drawioBridge';

export interface RemoteCursor {
  connId: string;
  displayName: string;
  canvasX: number;
  canvasY: number;
  color?: string;
  active?: boolean;
  lastSeen: number;
}

interface CursorOverlayProps {
  cursors: Record<string, RemoteCursor>;
  ui?: EditorUi;
}

const PALETTE = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

export function getUserColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % PALETTE.length;
  return PALETTE[index];
}

export const CursorOverlay: React.FC<CursorOverlayProps> = ({ cursors, ui }) => {
  const [, setTick] = useState(0);

  // Force re-render periodically to update auto-fade timers (3s inactivity)
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const activeCursors = Object.values(cursors).filter((cursor) => {
    if (cursor.active === false) return false;
    const elapsed = Date.now() - cursor.lastSeen;
    return elapsed < 3500; // Keep in DOM while fading out
  });

  if (activeCursors.length === 0) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 999999,
        overflow: 'hidden',
      }}
    >
      {activeCursors.map((cursor) => {
        const coords = canvasToScreenCoordinates(ui, cursor.canvasX, cursor.canvasY);
        if (!coords) return null;

        const color = cursor.color || getUserColor(cursor.connId || cursor.displayName);
        const elapsed = Date.now() - cursor.lastSeen;
        const opacity = Math.max(0, Math.min(1, (3000 - elapsed) / 500));

        return (
          <div
            key={cursor.connId}
            style={{
              position: 'absolute',
              left: `${coords.screenX}px`,
              top: `${coords.screenY}px`,
              transform: 'translate(-2px, -2px)',
              transition: 'left 0.05s linear, top 0.05s linear, opacity 0.3s ease-out',
              opacity,
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            {/* SVG Cursor Pointer Arrow */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}
            >
              <path
                d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.17157L17.3916 12.3673H5.65376Z"
                fill={color}
                stroke="#ffffff"
                strokeWidth="1.5"
              />
            </svg>

            {/* Floating Name Badge Pill */}
            <div
              style={{
                marginLeft: 4,
                marginTop: 14,
                backgroundColor: color,
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '12px',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                lineHeight: '1.2',
                letterSpacing: '0.2px',
              }}
            >
              {cursor.displayName}
            </div>
          </div>
        );
      })}
    </div>
  );
};
