import React, { useEffect, useState } from 'react';
import { FloatingReaction } from '../lib/slotTypes';

export interface ReactionCanvasProps {
  reactions: FloatingReaction[];
  onRemoveReaction: (id: string) => void;
}

export const ReactionCanvas: React.FC<ReactionCanvasProps> = ({ reactions, onRemoveReaction }) => {
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {reactions.map((r) => (
        <ReactionItem key={r.id} reaction={r} onComplete={() => onRemoveReaction(r.id)} />
      ))}
    </div>
  );
};

interface ReactionItemProps {
  reaction: FloatingReaction;
  onComplete: () => void;
}

const ReactionItem: React.FC<ReactionItemProps> = ({ reaction, onComplete }) => {
  const [style, setStyle] = useState<React.CSSProperties>({
    left: `${reaction.x}px`,
    top: `${reaction.y}px`,
    opacity: 1,
    transform: 'translate(-50%, -50%) scale(0.6)',
    transition: 'all 1.6s cubic-bezier(0.2, 0.8, 0.2, 1)',
  });

  useEffect(() => {
    // Randomize drift
    const driftX = (Math.random() - 0.5) * 80;
    const driftY = 120 + Math.random() * 140;

    const frame = requestAnimationFrame(() => {
      setStyle({
        left: `${reaction.x + driftX}px`,
        top: `${reaction.y - driftY}px`,
        opacity: 0,
        transform: `translate(-50%, -50%) scale(1.4) rotate(${driftX * 0.3}deg)`,
        transition: 'all 1.6s cubic-bezier(0.1, 0.9, 0.2, 1)',
      });
    });

    const timer = setTimeout(() => {
      onComplete();
    }, 1600);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [reaction, onComplete]);

  return (
    <div
      style={style}
      className="absolute text-3xl sm:text-4xl drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] select-none pointer-events-none"
    >
      {reaction.emoji}
    </div>
  );
};
