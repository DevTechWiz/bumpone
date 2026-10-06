import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Purchase killswitch — two layers, ORed:
 *   1. PURCHASES_PAUSED env var: deploy-level, survives DB outages and
 *      DB compromise (checked first, can never be unpaused from the DB).
 *   2. system_state.purchases_paused: runtime toggle written only by the
 *      admin emergency endpoint (service role; RLS deny-by-default).
 *
 * Fail-open on DB read errors: if the state row is unreadable, checkout
 * creation would fail anyway on its first write, and pre-019 behavior
 * (env-only) is preserved for ordinary visitors.
 */
let cachedPauseState: { paused: boolean; timestamp: number } | null = null;
const PAUSE_STATE_CACHE_TTL_MS = 10_000; // 10 seconds microcache

export function invalidatePauseStateCache(): void {
  cachedPauseState = null;
}

export async function isPurchasesPaused(): Promise<boolean> {
  if (process.env.PURCHASES_PAUSED === 'true') return true;

  const now = Date.now();
  if (cachedPauseState && now - cachedPauseState.timestamp < PAUSE_STATE_CACHE_TTL_MS) {
    return cachedPauseState.paused;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('system_state')
      .select('purchases_paused')
      .eq('id', 'global')
      .maybeSingle();
    if (error) {
      console.error('pause state read failed:', error.message);
      return false;
    }
    const paused = Boolean(data?.purchases_paused);
    cachedPauseState = { paused, timestamp: now };
    return paused;
  } catch (err) {
    console.error('pause state read threw:', err);
    return false;
  }
}
