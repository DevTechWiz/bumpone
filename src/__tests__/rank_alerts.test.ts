import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendOutbidAlert } from '../lib/resend';
import { dispatchOutbidAlerts } from '../lib/rankAlerts';
import { supabaseAdmin } from '../lib/supabase/admin';

vi.mock('../lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
    auth: {
      admin: {
        getUserById: vi.fn(),
      },
    },
  },
}));

vi.mock('../lib/resend', () => ({
  sendOutbidAlert: vi.fn(async () => ({ success: true, id: 'msg_123' })),
  getResendClient: vi.fn(() => null),
}));

describe('Rank & Outbid Alerts System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches outbid alert when a displaced board event is found', async () => {
    const fromMock = vi.mocked(supabaseAdmin.from);
    fromMock.mockImplementation((table: string) => {
      if (table === 'projects') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockImplementation((col: string, val: string) => {
            if (val === 'proj_promoted') {
              return { maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'proj_promoted', title: 'Winner Proj', handle: 'winner', user_id: 'usr_winner' } }) };
            }
            if (val === 'proj_casualty') {
              return { maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'proj_casualty', title: 'Casualty Proj', user_id: 'usr_casualty' } }) };
            }
            return { maybeSingle: vi.fn().mockResolvedValue({ data: null }) };
          }),
        } as any;
      }
      if (table === 'board_events') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [
              {
                project_id: 'proj_casualty',
                previous_rank: 2,
                new_rank: 3,
                event_type: 'bumped',
              },
            ],
            error: null,
          }),
        } as any;
      }
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'usr_casualty', alert_preferences: { emailAlerts: true } },
              error: null,
            }),
          }),
        } as any;
      }
      return { select: vi.fn().mockReturnThis() } as any;
    });

    vi.mocked(supabaseAdmin.auth.admin.getUserById).mockResolvedValue({
      data: { user: { id: 'usr_casualty', email: 'owner@example.com' } as any },
      error: null,
    });

    await dispatchOutbidAlerts({
      paymentId: 'pay_1',
      promotedProjectId: 'proj_promoted',
      newRank: 2,
      amountMinor: 2500,
    });

    expect(sendOutbidAlert).toHaveBeenCalledTimes(1);
    expect(sendOutbidAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@example.com',
        projectTitle: 'Casualty Proj',
        previousRank: 2,
        newRank: 3,
        promotedTitle: 'Winner Proj',
        promotedAmountFormatted: '$25',
      })
    );
  });

  it('respects emailAlerts=false preference and skips sending', async () => {
    const fromMock = vi.mocked(supabaseAdmin.from);
    fromMock.mockImplementation((table: string) => {
      if (table === 'projects') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockImplementation((col: string, val: string) => {
            if (val === 'proj_promoted') {
              return { maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'proj_promoted', title: 'Winner', handle: 'win', user_id: 'usr_1' } }) };
            }
            return { maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'proj_casualty', title: 'Opted Out', user_id: 'usr_opted_out' } }) };
          }),
        } as any;
      }
      if (table === 'board_events') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [
              {
                project_id: 'proj_casualty',
                previous_rank: 5,
                new_rank: 6,
                event_type: 'bumped',
              },
            ],
            error: null,
          }),
        } as any;
      }
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'usr_opted_out', alert_preferences: { emailAlerts: false } },
              error: null,
            }),
          }),
        } as any;
      }
      return { select: vi.fn().mockReturnThis() } as any;
    });

    await dispatchOutbidAlerts({
      paymentId: 'pay_2',
      promotedProjectId: 'proj_promoted',
      newRank: 5,
      amountMinor: 1000,
    });

    expect(sendOutbidAlert).not.toHaveBeenCalled();
  });
});
