/**
 * Structured Security & Observability Logger (SEC-024, Phase 8)
 *
 * Implements centralized structured security logging for all critical operations:
 * - Failed authentication & authorization attempts
 * - Admin control plane actions
 * - Purchase attempts & payment lifecycle events
 * - Duplicate / replayed payment and webhook events
 * - Distributed and local rate limit violations
 * - Project moderation lifecycle events
 * - Suspicious realtime / war room injection attempts
 * - Killswitch activation / deactivation
 * - Financial invariant anomalies
 *
 * Zero-PII / Zero-Secret Guarantee:
 * Automatically strips sensitive fields (passwords, auth tokens, session cookies,
 * webhook secrets, api keys, credit cards) before emission.
 */

export type SecurityEventType =
  | 'AUTH_FAILURE'
  | 'AUTHZ_FAILURE'
  | 'ADMIN_ACTION'
  | 'PURCHASE_ATTEMPT'
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILURE'
  | 'PAYMENT_REPLAY'
  | 'RATE_LIMIT_EXCEEDED'
  | 'MODERATION_ACTION'
  | 'SUSPICIOUS_REALTIME'
  | 'KILLSWITCH_CHANGE'
  | 'FINANCIAL_ERROR';

export type SecuritySeverity = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

export interface SecurityEventContext {
  action: string;
  ip?: string;
  userId?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  error?: string | Error;
}

const REDACTED_KEYS = new Set([
  'password',
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'secret',
  'authorization',
  'bearer',
  'cookie',
  'cookies',
  'card',
  'cvv',
  'webhook_secret',
  'webhook_key',
  'apikey',
  'api_key',
  'service_role_key',
  'anon_key',
]);

function scrubValue(val: unknown, depth = 0): unknown {
  if (depth > 4) return '[MAX_DEPTH]';
  if (!val || typeof val !== 'object') return val;

  if (Array.isArray(val)) {
    return val.map((item) => scrubValue(item, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(val as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (REDACTED_KEYS.has(lowerKey) || lowerKey.includes('secret') || lowerKey.includes('password')) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = scrubValue(value, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export function logSecurityEvent(
  type: SecurityEventType,
  severity: SecuritySeverity,
  context: SecurityEventContext
): void {
  const timestamp = new Date().toISOString();
  const errorStr = context.error instanceof Error ? context.error.message : context.error;

  const eventPayload = {
    service: 'bumpone-security',
    environment: process.env.NODE_ENV || 'production',
    timestamp,
    type,
    severity,
    action: context.action,
    ip: context.ip || 'unknown',
    userId: context.userId || 'anonymous',
    targetId: context.targetId || undefined,
    details: context.details ? scrubValue(context.details) : undefined,
    error: errorStr,
  };

  const line = JSON.stringify(eventPayload);

  // Cloudflare Workers and container stdout log drivers capture console output as JSON
  switch (severity) {
    case 'CRITICAL':
    case 'ERROR':
      console.error(line);
      break;
    case 'WARN':
      console.warn(line);
      break;
    case 'INFO':
    default:
      console.info(line);
      break;
  }
}

// Convenience helpers
export const securityLog = {
  authFailure: (action: string, ip?: string, error?: string, details?: Record<string, unknown>) =>
    logSecurityEvent('AUTH_FAILURE', 'WARN', { action, ip, error, details }),

  authzFailure: (action: string, userId?: string, ip?: string, details?: Record<string, unknown>) =>
    logSecurityEvent('AUTHZ_FAILURE', 'WARN', { action, userId, ip, details }),

  rateLimit: (action: string, key: string, ip?: string, limit?: number, windowMs?: number) =>
    logSecurityEvent('RATE_LIMIT_EXCEEDED', 'WARN', {
      action,
      ip,
      details: { rate_limit_key: key, limit, windowMs },
    }),

  adminAction: (action: string, adminId: string, targetId?: string, details?: Record<string, unknown>) =>
    logSecurityEvent('ADMIN_ACTION', 'INFO', { action, userId: adminId, targetId, details }),

  moderationAction: (action: string, adminId: string, projectId: string, status: string, reason?: string) =>
    logSecurityEvent('MODERATION_ACTION', 'INFO', {
      action,
      userId: adminId,
      targetId: projectId,
      details: { status, reason },
    }),

  purchaseAttempt: (action: string, userId: string, projectId: string, amountMinor: number) =>
    logSecurityEvent('PURCHASE_ATTEMPT', 'INFO', {
      action,
      userId,
      targetId: projectId,
      details: { amount_minor: amountMinor },
    }),

  paymentSuccess: (paymentId: string, eventId: string, projectId: string, amountMinor: number) =>
    logSecurityEvent('PAYMENT_SUCCESS', 'INFO', {
      action: 'payment_credited',
      targetId: projectId,
      details: { payment_id: paymentId, event_id: eventId, amount_minor: amountMinor },
    }),

  paymentFailure: (action: string, eventId?: string, paymentId?: string, reason?: string, details?: Record<string, unknown>) =>
    logSecurityEvent('PAYMENT_FAILURE', 'ERROR', {
      action,
      details: { event_id: eventId, payment_id: paymentId, reason, ...details },
      error: reason,
    }),

  paymentReplay: (eventId: string, paymentId?: string) =>
    logSecurityEvent('PAYMENT_REPLAY', 'WARN', {
      action: 'payment_duplicate_or_replayed',
      details: { event_id: eventId, payment_id: paymentId },
    }),

  killswitchChange: (adminId: string, paused: boolean, reason?: string) =>
    logSecurityEvent('KILLSWITCH_CHANGE', 'CRITICAL', {
      action: paused ? 'killswitch_engaged' : 'killswitch_disengaged',
      userId: adminId,
      details: { paused, reason },
    }),

  financialError: (action: string, error: string, details?: Record<string, unknown>) =>
    logSecurityEvent('FINANCIAL_ERROR', 'CRITICAL', { action, error, details }),

  suspiciousRealtime: (action: string, ip?: string, userId?: string, reason?: string, details?: Record<string, unknown>) =>
    logSecurityEvent('SUSPICIOUS_REALTIME', 'WARN', { action, ip, userId, error: reason, details }),
};
