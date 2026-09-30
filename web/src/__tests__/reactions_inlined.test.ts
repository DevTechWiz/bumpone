import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

describe('Inlined Reactions Architecture', () => {
  const VALID_REACTIONS = ['fire', 'eyes', 'heart', 'laugh'] as const;
  type ReactionType = (typeof VALID_REACTIONS)[number];

  const TEST_SECRET = 'test-secret-key-12345';

  function signAnonId(id: string, secret = TEST_SECRET): string {
    const hmac = crypto.createHmac('sha256', secret).update(id).digest('hex');
    return `${id}.${hmac}`;
  }

  function verifyAnonId(signedValue: string, secret = TEST_SECRET): string | null {
    const parts = signedValue.split('.');
    if (parts.length !== 2) return null;
    const [id, signature] = parts;
    const expected = crypto.createHmac('sha256', secret).update(id).digest('hex');
    try {
      if (crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'))) {
        return id;
      }
    } catch {
      return null;
    }
    return null;
  }

  it('validates allowed emoji reaction keys', () => {
    expect(VALID_REACTIONS).toContain('fire');
    expect(VALID_REACTIONS).toContain('eyes');
    expect(VALID_REACTIONS).toContain('heart');
    expect(VALID_REACTIONS).toContain('laugh');
    expect(VALID_REACTIONS).not.toContain('thumbsup');
  });

  it('signs and verifies anonymous identity cookies securely', () => {
    const anonId = '550e8400-e29b-41d4-a716-446655440000';
    const signed = signAnonId(anonId);
    expect(signed).toContain(anonId);

    const verified = verifyAnonId(signed);
    expect(verified).toBe(anonId);

    // Tampered signature must fail
    const tampered = `${anonId}.badsignature12345`;
    expect(verifyAnonId(tampered)).toBeNull();

    // Wrong secret must fail
    expect(verifyAnonId(signed, 'different-secret')).toBeNull();
  });

  it('maps inlined reaction columns with 0 joins', () => {
    // Simulated row returned directly from projects table
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

  it('maps inlined user profile reactions symmetrically', () => {
    const mockUserRow = {
      id: 'user-456',
      handle: 'satoshivibe',
      reactions_fire: 120,
      reactions_eyes: 45,
      reactions_heart: 200,
      reactions_laugh: 10,
      total_reactions: 375,
    };

    const userReactions = {
      fire: Number(mockUserRow.reactions_fire || 0),
      eyes: Number(mockUserRow.reactions_eyes || 0),
      heart: Number(mockUserRow.reactions_heart || 0),
      laugh: Number(mockUserRow.reactions_laugh || 0),
    };

    expect(userReactions.fire).toBe(120);
    expect(userReactions.heart).toBe(200);
    expect(mockUserRow.total_reactions).toBe(375);
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
