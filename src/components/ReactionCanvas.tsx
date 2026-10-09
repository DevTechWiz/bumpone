import React, { useEffect, useState } from 'react';
import { FloatingReaction } from '../lib/slotTypes';

export interface ReactionCanvasProps {
  reactions: FloatingReaction[];
  onRemoveReaction: (id: string) => void;
}

const ReactionItemComponent: React.FC<{
  reaction: FloatingReaction;
  onRemove: (id: string) => void;
}> = ({ reaction, onRemove }) => {
  const [style, setStyle] = useState<React.CSSProperties>({
    left: `${reaction.x}px`,
    top: `${reaction.y}px`,
    opacity: 0.95,
    transform: 'translate(-50%, -50%) scale(0.35)',
    willChange: 'transform, opacity, top, left',
  });

  useEffect(() => {
    // Randomize upward drift and horizontal sway
    const driftX = (Math.random() - 0.5) * 60;
    const driftY = 220 + Math.random() * 140;
    const rotation = (Math.random() - 0.5) * 30;

    const frame = requestAnimationFrame(() => {
      setStyle({
        left: `${reaction.x + driftX}px`,
        top: `${Math.max(40, reaction.y - driftY)}px`,
        opacity: 0,
        transform: `translate(-50%, -50%) scale(1.3) rotate(${rotation}deg)`,
        transition:
          'transform 1.9s cubic-bezier(0.16, 0.84, 0.44, 1), opacity 1.9s cubic-bezier(0.4, 0, 0.2, 1), top 1.9s cubic-bezier(0.16, 0.84, 0.44, 1), left 1.9s ease-out',
        willChange: 'transform, opacity, top, left',
      });
    });

    const timer = setTimeout(() => {
      onRemove(reaction.id);
    }, 1900);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [reaction.id, reaction.x, reaction.y, onRemove]);

  return (
    <div
      style={style}
      className="absolute text-3xl sm:text-4xl drop-shadow-[0_4px_16px_rgba(0,0,0,0.85)] select-none pointer-events-none"
    >
      {reaction.emoji}
    </div>
  );
};

const ReactionItem = React.memo(ReactionItemComponent);

export const ReactionCanvas: React.FC<ReactionCanvasProps> = React.memo(({ reactions, onRemoveReaction }) => {
  return (
    <div className="fixed inset-0 pointer-events-none z-[80] overflow-hidden">
      {reactions.map((r) => (
        <ReactionItem key={r.id} reaction={r} onRemove={onRemoveReaction} />
      ))}
    </div>
  );
});
