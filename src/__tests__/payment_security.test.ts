import { describe, it, expect } from 'vitest';
import { parsePaymentSucceeded, requiredQuoteAmountMinor, MIN_TOP_UP_MINOR } from '../lib/paymentEvents';

const VALID_UUID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const OTHER_UUID = '11111111-2222-4333-8444-555555555555';

describe('parsePaymentSucceeded (webhook payload validation)', () => {
  it('accepts a well-formed USD payment.succeeded payload', () => {
    const result = parsePaymentSucceeded({
      payment_id: 'pay_123',
      amount: 5000,
      currency: 'USD',
      metadata: { quote_id: VALID_UUID, project_id: OTHER_UUID, user_id: VALID_UUID },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.paymentId).toBe('pay_123');
      expect(result.value.amountMinor).toBe(5000);
      expect(result.value.currency).toBe('USD');
      expect(result.value.quoteId).toBe(VALID_UUID);
      expect(result.value.projectId).toBe(OTHER_UUID);
      expect(result.value.userId).toBe(VALID_UUID);
    }
  });

  it('accepts a payload without currency or metadata (DB remains the authority)', () => {
    const result = parsePaymentSucceeded({ payment_id: 'pay_1', total_amount: 1000 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.amountMinor).toBe(1000);
      expect(result.value.quoteId).toBeNull();
      expect(result.value.currency).toBeNull();
    }
  });

  it('falls back to id when payment_id is absent', () => {
    const result = parsePaymentSucceeded({ id: 'pay_x', amount: 1000 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.paymentId).toBe('pay_x');
  });

  it('rejects a payload without a payment id', () => {
    expect(parsePaymentSucceeded({ amount: 1000 })).toEqual({ ok: false, reason: 'missing_payment_id' });
    expect(parsePaymentSucceeded({ payment_id: '', amount: 1000 })).toEqual({ ok: false, reason: 'missing_payment_id' });
  });

  it.each([
    ['zero', 0],
    ['negative', -1000],
    ['fractional', 10.5],
    ['unsafe integer', Number.MAX_SAFE_INTEGER + 2],
  ])('rejects an %s amount', (_label, amount) => {
    const result = parsePaymentSucceeded({ payment_id: 'pay_1', amount });
    expect(result).toEqual({ ok: false, reason: 'invalid_amount' });
  });

  it('rejects non-numeric amount shapes', () => {
    expect(parsePaymentSucceeded({ payment_id: 'pay_1', amount: 'abc' }).ok).toBe(false);
    expect(parsePaymentSucceeded({ payment_id: 'pay_1', amount: null, total_amount: null }).ok).toBe(false);
    expect(parsePaymentSucceeded({ payment_id: 'pay_1', amount: {} }).ok).toBe(false);
    expect(parsePaymentSucceeded({ payment_id: 'pay_1', amount: true }).ok).toBe(false);
  });

  it('accepts a numeric string amount (provider shape variance)', () => {
    const result = parsePaymentSucceeded({ payment_id: 'pay_1', amount: '2500' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.amountMinor).toBe(2500);
  });

  it('rejects explicitly non-USD currencies', () => {
    expect(parsePaymentSucceeded({ payment_id: 'pay_1', amount: 1000, currency: 'eur' })).toEqual({
      ok: false,
      reason: 'unsupported_currency',
    });
    expect(parsePaymentSucceeded({ payment_id: 'pay_1', amount: 1000, currency: 'GBP' })).toEqual({
      ok: false,
      reason: 'unsupported_currency',
    });
  });

  it('rejects malformed UUIDs in metadata (would otherwise crash PostgREST)', () => {
    expect(parsePaymentSucceeded({ payment_id: 'p', amount: 1000, metadata: { quote_id: 'not-a-uuid' } })).toEqual({
      ok: false,
      reason: 'malformed_metadata',
    });
    expect(parsePaymentSucceeded({ payment_id: 'p', amount: 1000, metadata: { project_id: '999' } })).toEqual({
      ok: false,
      reason: 'malformed_metadata',
    });
    expect(parsePaymentSucceeded({ payment_id: 'p', amount: 1000, metadata: { user_id: '../../etc' } })).toEqual({
      ok: false,
      reason: 'malformed_metadata',
    });
  });

  it('rejects a non-object payload', () => {
    expect(parsePaymentSucceeded(null)).toEqual({ ok: false, reason: 'malformed_payload' });
    expect(parsePaymentSucceeded('payment')).toEqual({ ok: false, reason: 'malformed_payload' });
  });
});

describe('requiredQuoteAmountMinor (server-side price floor)', () => {
  it('returns the platform minimum when no holder occupies the target rank', () => {
    expect(requiredQuoteAmountMinor(0, null)).toBe(MIN_TOP_UP_MINOR);
  });

  it('prices a target as target_value - current_value + $10 increment', () => {
    // Board holder at #100 has $10 (=1000), buyer has 0 -> 1000 - 0 + 1000 = 2000 ($20)
    expect(requiredQuoteAmountMinor(0, 1000)).toBe(2000);
    expect(requiredQuoteAmountMinor(5000, 8000)).toBe(4000);
  });

  it('never goes below the $10 floor even when the buyer already exceeds the target', () => {
    expect(requiredQuoteAmountMinor(9000, 5000)).toBe(MIN_TOP_UP_MINOR);
  });

  it('raises a sub-floor target holder to the platform floor before pricing', () => {
    // Holder below $10 (legacy row): floor becomes 1000 -> 1000 - 0 + 1000 = 2000
    expect(requiredQuoteAmountMinor(0, 100)).toBe(2000);
  });

  it('client input cannot lower the floor below the server-computed minimum', () => {
    const current = 0;
    const targetHolder = 50000; // #1 holder at $500
    const floor = requiredQuoteAmountMinor(current, targetHolder);
    expect(floor).toBe(50000 - 0 + 1000);
    expect(1000).toBeLessThan(floor); // supplying the bare minimum must be rejected by the route
  });
});
