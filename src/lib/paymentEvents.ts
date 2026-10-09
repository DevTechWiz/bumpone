// Dodo `payment.succeeded` payload parsing + strict shape validation.
// The database (process_dodo_purchase) is the final authority; this layer only
// rejects obviously malformed events before they reach PostgREST (malformed UUIDs
// would otherwise produce retryable transport errors instead of clean rejections).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Platform minimum top-up in USD minor units ($10). Must match CHECK quoted_amount_minor >= 1000. */
export const MIN_TOP_UP_MINOR = 1000;

/**
 * Server-side quote floor: the authoritative minimum price for a top-up.
 * `targetValueMinor` is the active value of the holder of the requested target rank
 * (null when no holder occupies that rank). The client can never lower this number;
 * it can only choose to pay more than the floor (voluntary overpayment, charged by
 * Dodo and credited exactly by the webhook).
 */
export function requiredQuoteAmountMinor(
  currentValueMinor: number,
  targetValueMinor: number | null
): number {
  if (targetValueMinor === null) return MIN_TOP_UP_MINOR;
  const floor = Math.max(MIN_TOP_UP_MINOR, targetValueMinor);
  return Math.max(MIN_TOP_UP_MINOR, floor - currentValueMinor + MIN_TOP_UP_MINOR);
}

export interface ParsedPaymentEvent {
  paymentId: string;
  amountMinor: number;
  currency: string | null;
  quoteId: string | null;
  projectId: string | null;
  userId: string | null;
}

export type ParsePaymentResult =
  | { ok: true; value: ParsedPaymentEvent }
  | { ok: false; reason: string };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

export function parsePaymentSucceeded(payload: unknown): ParsePaymentResult {
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, reason: 'malformed_payload' };
  }
  const p = payload as Record<string, unknown>;

  const paymentId = isNonEmptyString(p.payment_id)
    ? p.payment_id
    : isNonEmptyString(p.id)
      ? p.id
      : '';
  if (!paymentId) return { ok: false, reason: 'missing_payment_id' };

  const settlementCurrency =
    typeof p.settlement_currency === 'string' && p.settlement_currency.length > 0
      ? p.settlement_currency.toLowerCase()
      : null;
  const settlementAmount =
    p.settlement_amount !== undefined && p.settlement_amount !== null
      ? Number(p.settlement_amount)
      : null;
  const settlementTax =
    p.settlement_tax !== undefined && p.settlement_tax !== null
      ? Number(p.settlement_tax)
      : 0;

  let amountMinor: number;
  if (settlementCurrency === 'usd' && settlementAmount !== null && Number.isSafeInteger(settlementAmount)) {
    // When Dodo settles in USD for localized checkouts, the net product amount is settlement_amount - settlement_tax
    amountMinor = settlementAmount - (Number.isSafeInteger(settlementTax) ? settlementTax : 0);
  } else {
    const rawAmount = p.amount ?? p.total_amount;
    if (rawAmount === null || rawAmount === undefined || typeof rawAmount === 'boolean' || typeof rawAmount === 'object') {
      return { ok: false, reason: 'invalid_amount' };
    }
    amountMinor = Number(rawAmount);
  }

  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    return { ok: false, reason: 'invalid_amount' };
  }

  const currency = typeof p.currency === 'string' && p.currency.length > 0 ? p.currency.toLowerCase() : null;
  if (settlementCurrency && settlementCurrency !== 'usd') {
    return { ok: false, reason: 'unsupported_currency' };
  }
  if (!settlementCurrency && currency && currency !== 'usd') {
    return { ok: false, reason: 'unsupported_currency' };
  }

  const meta: Record<string, unknown> =
    typeof p.metadata === 'object' && p.metadata !== null ? (p.metadata as Record<string, unknown>) : {};

  const quoteId = isNonEmptyString(meta.quote_id) ? meta.quote_id : null;
  const projectId = isNonEmptyString(meta.project_id) ? meta.project_id : null;
  const userId = isNonEmptyString(meta.user_id) ? meta.user_id : null;

  if ((quoteId && !UUID_RE.test(quoteId)) || (projectId && !UUID_RE.test(projectId)) || (userId && !UUID_RE.test(userId))) {
    return { ok: false, reason: 'malformed_metadata' };
  }

  return {
    ok: true,
    value: {
      paymentId,
      amountMinor,
      currency: (settlementCurrency || currency)?.toUpperCase() ?? null,
      quoteId,
      projectId,
      userId,
    },
  };
}
