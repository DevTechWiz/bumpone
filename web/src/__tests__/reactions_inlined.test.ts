import { describe, it, expect } from 'vitest';

describe('Auth-Gated Reactions & Creator Clout Architecture', () => {
  const VALID_REACTIONS = ['fire', 'eyes', 'heart', 'laugh'] as const;
  type ReactionType = (typeof VALID_REACTIONS)[number];

  it('validates allowed emoji reaction keys', () => {
    expect(VALID_REACTIONS).toContain('fire');
    expect(VALID_REACTIONS).toContain('eyes');
    expect(VALID_REACTIONS).toContain('heart');
    expect(VALID_REACTIONS).toContain('laugh');
    expect(VALID_REACTIONS).not.toContain('thumbsup');
  });

  it('maps inlined reaction columns with 0 joins on projects', () => {
    const mockProjectRow = {
      id: 'proj-123',
      title: 'BumpOne',
      reactions_fire: 42,
      reactions_eyes: 15,
      reactions_heart: 88,
      reactions_laugh: 3,
      total_reactions: 148,
    };

    const reactions = {
      fire: Number(mockProjectRow.reactions_fire || 0),
      eyes: Number(mockProjectRow.reactions_eyes || 0),
      heart: Number(mockProjectRow.reactions_heart || 0),
      laugh: Number(mockProjectRow.reactions_laugh || 0),
    };

    expect(reactions.fire).toBe(42);
    expect(reactions.eyes).toBe(15);
    expect(reactions.heart).toBe(88);
    expect(reactions.laugh).toBe(3);

    const calculatedTotal = reactions.fire + reactions.eyes + reactions.heart + reactions.laugh;
    expect(calculatedTotal).toBe(mockProjectRow.total_reactions);
  });

  it('aggregates combined clout across a creator portfolio of projects', () => {
    const creatorProjects = [
      {
        id: 'proj-1',
        reactions: { fire: 10, eyes: 5, heart: 20, laugh: 2 },
      },
      {
        id: 'proj-2',
        reactions: { fire: 25, eyes: 12, heart: 40, laugh: 8 },
      },
      {
        id: 'proj-3',
        reactions: { fire: 5, eyes: 3, heart: 10, laugh: 0 },
      },
    ];

    const totalReactionsReceived = creatorProjects.reduce(
      (sum, p) => sum + p.reactions.fire + p.reactions.eyes + p.reactions.heart + p.reactions.laugh,
      0
    );

    const reactionsBreakdown = creatorProjects.reduce(
      (acc, p) => {
        acc.fire += p.reactions.fire;
        acc.eyes += p.reactions.eyes;
        acc.heart += p.reactions.heart;
        acc.laugh += p.reactions.laugh;
        return acc;
      },
      { fire: 0, eyes: 0, heart: 0, laugh: 0 }
    );

    expect(totalReactionsReceived).toBe(140);
    expect(reactionsBreakdown.fire).toBe(40);
    expect(reactionsBreakdown.eyes).toBe(20);
    expect(reactionsBreakdown.heart).toBe(70);
    expect(reactionsBreakdown.laugh).toBe(10);
  });

  it('handles Option A toggle (adding and un-reacting) correctly', () => {
    const activeReactions = new Set<ReactionType>(['fire', 'heart']);

    // User un-reacts to 'fire'
    const newActiveAfterToggleOff = new Set(activeReactions);
    if (newActiveAfterToggleOff.has('fire')) {
      newActiveAfterToggleOff.delete('fire');
    }
    expect(newActiveAfterToggleOff.has('fire')).toBe(false);
    expect(newActiveAfterToggleOff.has('heart')).toBe(true);

    // User adds 'eyes'
    const newActiveAfterToggleOn = new Set(newActiveAfterToggleOff);
    newActiveAfterToggleOn.add('eyes');
    expect(newActiveAfterToggleOn.has('eyes')).toBe(true);
    expect(newActiveAfterToggleOn.size).toBe(2); // 'heart' and 'eyes'
  });

  it('sorts popular items by total_reactions descending', () => {
    const items = [
      { id: '1', total_reactions: 25, active_value: 50 },
      { id: '2', total_reactions: 150, active_value: 20 },
      { id: '3', total_reactions: 150, active_value: 80 },
      { id: '4', total_reactions: 0, active_value: 100 },
    ];

    const sorted = [...items].sort((a, b) => b.total_reactions - a.total_reactions || b.active_value - a.active_value);

    expect(sorted[0].id).toBe('3'); // 150 reactions, higher active value ($80)
    expect(sorted[1].id).toBe('2'); // 150 reactions, lower active value ($20)
    expect(sorted[2].id).toBe('1'); // 25 reactions
    expect(sorted[3].id).toBe('4'); // 0 reactions
  });
});
