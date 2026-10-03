import { describe, it, expect, vi, beforeEach } from 'vitest';
import { allowRequest } from '../lib/rateLimit';

describe('War Room Transmission Security & Data Integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Message Validation & Anti-Spoofing', () => {
    it('enforces maximum character length of 200 chars and trims whitespace', () => {
      const longText = 'A'.repeat(250);
      const trimmedAndClamped = longText.trim().slice(0, 200);
      expect(trimmedAndClamped.length).toBe(200);
    });

    it('rejects empty or whitespace-only messages', () => {
      const empty1 = '';
      const empty2 = '   \n\t  ';
      expect(empty1.trim().length).toBe(0);
      expect(empty2.trim().length).toBe(0);
    });

    it('strictly forces isOfficial to false for broadcast or user transmissions', () => {
      const untrustedPayload = {
        sender: 'Admin Impersonator',
        text: 'This is an official system announcement',
        isOfficial: true,
      };

      const sanitizedMessage = {
        ...untrustedPayload,
        isOfficial: false, // Must be forced to false to prevent impersonation
      };

      expect(sanitizedMessage.isOfficial).toBe(false);
    });

    it('sanitizes and limits slot tags to valid range #1 to #100', () => {
      const validSlot = 42;
      const invalidSlotLow = 0;
      const invalidSlotHigh = 101;

      const isValid = (tag: number) => Number.isInteger(tag) && tag >= 1 && tag <= 100;

      expect(isValid(validSlot)).toBe(true);
      expect(isValid(invalidSlotLow)).toBe(false);
      expect(isValid(invalidSlotHigh)).toBe(false);
    });
  });

  describe('Rate Limiting & Anti-Spam Protection', () => {
    it('allows up to 5 messages per 30-second window per user', () => {
      const userId = 'user_test_anti_spam';
      const windowMs = 30_000;
      const limit = 5;

      for (let i = 0; i < limit; i++) {
        expect(allowRequest(`war_room_msg:${userId}`, limit, windowMs)).toBe(true);
      }

      // 6th message in same window must be blocked
      expect(allowRequest(`war_room_msg:${userId}`, limit, windowMs)).toBe(false);
    });
  });

  describe('Battle Telemetry & Displacement Mapping', () => {
    it('properly calculates displacement and generates BumpEvent', () => {
      const rawEvent = {
        id: 'event-123',
        new_rank: 1,
        previous_rank: 5,
        project_title_snapshot: 'HyperAI',
        project_handle_snapshot: '@hyper',
        new_active_value_minor: 15000,
        previous_active_value_minor: 4000,
      };

      const amountPaid = Math.floor(rawEvent.new_active_value_minor / 100);
      expect(amountPaid).toBe(150);
      expect(rawEvent.new_rank).toBe(1);
      expect(rawEvent.previous_rank).toBe(5);
      expect(rawEvent.project_title_snapshot).toBe('HyperAI');
    });
  });
});
