import { NextRequest, NextResponse } from 'next/server';
import { verifyDodoWebhook } from '@/lib/dodo';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { invalidateBoardCache } from '@/lib/boardCache';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    const headersList: Record<string, string> = {
      'webhook-id': request.headers.get('webhook-id') || '',
      'webhook-timestamp': request.headers.get('webhook-timestamp') || '',
      'webhook-signature': request.headers.get('webhook-signature') || '',
    };

    let event: any;
    try {
      event = verifyDodoWebhook(rawBody, headersList);
    } catch (err: any) {
      console.error('Dodo Webhook Signature Verification Failed:', err);
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }

    const eventId = headersList['webhook-id'] || event.id || `evt_${Date.now()}`;
    const eventType = event.type || event.event_type || 'payment.succeeded';
    const payloadData = event.data || event;

    if (eventType === 'payment.succeeded') {
      const paymentId = payloadData.payment_id || payloadData.id;
      const amountMinor = payloadData.amount || payloadData.total_amount || 0;
      const metadata = payloadData.metadata || {};

      let projectId = metadata.project_id || metadata.profile_id;

      // If new project mode, create the project record first
      if (!projectId || metadata.mode === 'new') {
        // Resolve category
        let categoryId: string | null = null;
        if (metadata.category) {
          const { data: cat } = await supabaseAdmin
            .from('categories')
            .select('id')
            .ilike('name', metadata.category)
            .single();
          categoryId = cat?.id;
        }

        if (!categoryId) {
          const { data: defaultCat } = await supabaseAdmin
            .from('categories')
            .select('id')
            .limit(1)
            .single();
          categoryId = defaultCat?.id;
        }

        // 1. Try inserting into 'projects' (clean schema)
        const { data: newProject, error: projectErr } = await supabaseAdmin
          .from('projects')
          .insert({
            user_id: metadata.user_id || null,
            title: metadata.title || 'Anonymous Challenger',
            handle: metadata.handle || '@challenger',
            destination_url: metadata.link_url || 'https://bumpone.lol',
            image_path: metadata.image_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=700&auto=format&fit=crop&q=80',
            category_id: categoryId,
            current_active_value_minor: 0,
            is_active: true,
            moderation_status: 'approved',
          })
          .select('id')
          .single();

        if (!projectErr && newProject) {
          projectId = newProject.id;
        } else {
          // Fallback: try inserting without category restriction or with legacy fields
          const { data: fallbackProject, error: fallbackErr } = await supabaseAdmin
            .from('projects')
            .insert({
              user_id: metadata.user_id || null,
              title: metadata.title || 'Anonymous Challenger',
              handle: metadata.handle || '@challenger',
              destination_url: metadata.link_url || 'https://bumpone.lol',
              image_path: metadata.image_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=700&auto=format&fit=crop&q=80',
              category_id: categoryId,
              is_active: true,
              moderation_status: 'approved',
            })
            .select('id')
            .single();

          if (fallbackErr || !fallbackProject) {
            console.error('Failed to create new project on webhook:', projectErr || fallbackErr);
            return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
          }
          projectId = fallbackProject.id;
        }
      } else if (metadata.user_id && projectId) {
        // Link project to authenticated user if previously unassigned
        await supabaseAdmin
          .from('projects')
          .update({ user_id: metadata.user_id })
          .eq('id', projectId)
          .is('user_id', null);
      }

      // Execute atomic ranking transaction
      let rpcResult: any = null;
      let rpcErr: any = null;

      const rpcTry1 = await supabaseAdmin.rpc('process_dodo_purchase', {
        p_event_id: eventId,
        p_payment_id: paymentId,
        p_project_id: projectId,
        p_amount_minor: amountMinor,
        p_payload: payloadData,
      });

      if (rpcTry1.error) {
        // Fallback with p_profile_id parameter if legacy RPC exists
        const rpcTry2 = await supabaseAdmin.rpc('process_dodo_purchase', {
          p_event_id: eventId,
          p_payment_id: paymentId,
          p_profile_id: projectId,
          p_amount_minor: amountMinor,
          p_payload: payloadData,
        });
        rpcResult = rpcTry2.data;
        rpcErr = rpcTry2.error;
      } else {
        rpcResult = rpcTry1.data;
      }

      if (rpcErr) {
        console.error('RPC process_dodo_purchase error:', rpcErr);
        return NextResponse.json({ error: 'Failed to process ranking mutation' }, { status: 500 });
      }

      invalidateBoardCache();

      return NextResponse.json({
        success: true,
        result: rpcResult,
      });
    }

    if (eventType === 'refund.succeeded') {
      const paymentId = payloadData.payment_id || payloadData.id;

      // 1. Fetch original payment record to restore previous active value
      let paymentRes = await supabaseAdmin
        .from('payments')
        .select('id, project_id, amount_minor, previous_active_value_minor, status')
        .eq('provider_payment_id', paymentId)
        .single();

      if (paymentRes.error || !paymentRes.data) {
        // Fallback to legacy purchases table
        paymentRes = await supabaseAdmin
          .from('purchases')
          .select('id, project_id, amount_minor, previous_active_value_minor, status')
          .eq('dodo_payment_id', paymentId)
          .single();
      }

      const payment = paymentRes.data;

      if (payment && payment.status !== 'refunded') {
        const targetId = payment.project_id;
        const prevValueMinor = payment.previous_active_value_minor;

        // 2. Fetch current project record and restore value
        const { data: currentProject } = await supabaseAdmin
          .from('projects')
          .select('total_paid_minor')
          .eq('id', targetId)
          .single();

        if (currentProject) {
          const newTotalPaidMinor = Math.max(0, (currentProject?.total_paid_minor || 0) - (payment.amount_minor || 0));
          await supabaseAdmin
            .from('projects')
            .update({
              current_active_value_minor: prevValueMinor,
              total_paid_minor: newTotalPaidMinor,
              updated_at: new Date().toISOString(),
            })
            .eq('id', targetId);
        }

        // 3. Mark payment record as refunded
        await supabaseAdmin
          .from('payments')
          .update({ status: 'refunded', updated_at: new Date().toISOString() })
          .eq('id', payment.id);

        await supabaseAdmin
          .from('purchases')
          .update({ status: 'refunded', updated_at: new Date().toISOString() })
          .eq('id', payment.id);

        // 4. Recalculate and re-compact board ranks across all active slots
        await supabaseAdmin.rpc('recalculate_board_ranks');

        // 5. Invalidate server microcache
        invalidateBoardCache();
      }

      return NextResponse.json({ success: true, refunded: true });
    }

    return NextResponse.json({ success: true, ignored: true });
  } catch (err: any) {
    console.error('Webhook execution failure:', err);
    return NextResponse.json({ error: 'Internal webhook error' }, { status: 500 });
  }
}
