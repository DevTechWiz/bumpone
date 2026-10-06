import { DodoPayments } from 'dodopayments';
import { Webhook } from 'svix';

export function getDodoClient(): DodoPayments | null {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  if (!apiKey || apiKey === 'test_your_dodo_api_key') {
    return null;
  }

  return new DodoPayments({
    bearerToken: apiKey,
    environment: process.env.DODO_PAYMENTS_ENVIRONMENT === 'live_mode' ? 'live_mode' : 'test_mode',
  });
}

export interface CreateCheckoutParams {
  productId?: string;
  amountMinor: number; // e.g. 1000 for $10
  currency?: string;
  returnUrl: string;
  metadata: {
    project_id?: string;
    profile_id?: string;
    user_id?: string;
    quote_id?: string;
    target_rank?: string;
    resulting_value?: string;
    title?: string;
    handle?: string;
    link_url?: string;
    image_url?: string;
    category?: string;
    mode: 'new' | 'top_up';
  };
}

export async function createDodoCheckoutSession(params: CreateCheckoutParams): Promise<{
  sessionId: string;
  checkoutUrl: string;
}> {
  const client = getDodoClient();
  const productId = params.productId || process.env.DODO_PRODUCT_ID || 'p_bumped_top_up';

  if (!client) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Dodo Payments is not configured');
    }
    // Dev Mode Fallback: return mock checkout session redirecting to local returnUrl with payment confirmation
    const mockSessionId = `mock_cks_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const returnUrlObj = new URL(params.returnUrl);
    returnUrlObj.searchParams.set('checkout_session_id', mockSessionId);
    returnUrlObj.searchParams.set('status', 'success');

    return {
      sessionId: mockSessionId,
      checkoutUrl: returnUrlObj.toString(),
    };
  }

  const session = await client.checkoutSessions.create({
    product_cart: [
      {
        product_id: productId,
        quantity: 1,
        amount: params.amountMinor,
      },
    ],
    metadata: params.metadata,
    return_url: params.returnUrl,
  });

  return {
    sessionId: session.session_id,
    checkoutUrl: session.checkout_url || params.returnUrl,
  };
}

export function verifyDodoWebhook(rawBody: string, headers: Record<string, string>): any {
  const webhookKey = process.env.DODO_PAYMENTS_WEBHOOK_KEY || process.env.DODO_PAYMENTS_WEBHOOK_SECRET;
  if (!webhookKey || webhookKey.startsWith('whsec_your_dodo') || webhookKey.startsWith('whsec_placeholder')) {
    // Fail closed everywhere. Unsigned processing is only allowed as an explicit,
    // local-development-only escape hatch: non-production NODE_ENV AND the
    // ALLOW_INSECURE_WEBHOOKS flag set to 'true'. Production can never verify unsigned.
    const allowInsecure =
      process.env.NODE_ENV !== 'production' && process.env.ALLOW_INSECURE_WEBHOOKS === 'true';
    if (!allowInsecure) {
      throw new Error('Dodo webhook secret is not configured');
    }
    console.warn('[dodo] ALLOW_INSECURE_WEBHOOKS is enabled — accepting UNSIGNED webhook payload (development only)');
    return JSON.parse(rawBody);
  }

  const wh = new Webhook(webhookKey);
  wh.verify(rawBody, headers);
  return JSON.parse(rawBody);
}
