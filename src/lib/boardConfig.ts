import { supabaseAdmin } from '@/lib/supabase/admin';

export interface DynamicBoardConfig {
  freeClaimsEnabled: boolean;
  freeClaimsLimit: number;
  minBumpUsd: number;
  purchasesPaused: boolean;
}

const DEFAULT_CONFIG: DynamicBoardConfig = {
  freeClaimsEnabled: false,
  freeClaimsLimit: 50,
  minBumpUsd: 10,
  purchasesPaused: false,
};

/**
 * Server-authoritative retrieval of operational board configuration from system_state.
 * Deny-by-default RLS ensures normal users cannot access or tamper with this row.
 */
export async function getDynamicBoardConfig(): Promise<DynamicBoardConfig> {
  // SEC-005: Deploy-level killswitch takes precedence with zero DB dependency
  if (process.env.PURCHASES_PAUSED === 'true') {
    return {
      purchasesPaused: true,
      freeClaimsEnabled: false,
      freeClaimsLimit: 50,
      minBumpUsd: 10,
    };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('system_state')
      .select('purchases_paused, free_claims_enabled, free_claims_limit, min_bump_usd')
      .eq('id', 'global')
      .maybeSingle();

    if (error || !data) {
      if (error) console.error('Failed to read system_state config:', error.message);
      return DEFAULT_CONFIG;
    }

    return {
      purchasesPaused: Boolean(data.purchases_paused),
      freeClaimsEnabled: Boolean(data.free_claims_enabled),
      freeClaimsLimit: typeof data.free_claims_limit === 'number' ? data.free_claims_limit : 50,
      minBumpUsd: typeof data.min_bump_usd === 'number' ? data.min_bump_usd : 10,
    };
  } catch (err) {
    console.error('Error fetching dynamic board config:', err);
    return DEFAULT_CONFIG;
  }
}
