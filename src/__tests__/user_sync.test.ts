import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensurePublicUser } from '../lib/userSync';
import { supabaseAdmin } from '../lib/supabase/admin';

vi.mock('../lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe('User Auto-Provisioning on First Auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns existing user if already present in public.users', async () => {
    const existing = {
      id: 'usr-1',
      handle: 'devendra',
      display_name: 'Devendra Dev',
      avatar_url: 'https://example.com/avatar.png',
      created_at: '2026-09-28T18:41:44.446Z',
    };

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
      }),
    });

    vi.mocked(supabaseAdmin.from).mockReturnValue({
      select: mockSelect,
    } as any);

    const result = await ensurePublicUser({
      id: 'usr-1',
      email: 'devendra@example.com',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-09-28T18:41:44.446Z',
    } as any);

    expect(result).toEqual(existing);
    expect(supabaseAdmin.from).toHaveBeenCalledWith('users');
  });

  it('provisions Google OAuth user on first authentication with only required fields', async () => {
    const selectQueryMock = vi.fn();
    selectQueryMock
      .mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      })
      .mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      });

    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'google-usr-1',
            handle: 'alex_rivera',
            display_name: 'Alex Rivera',
            avatar_url: 'https://lh3.googleusercontent.com/avatar.jpg',
            created_at: '2026-10-01T00:00:00.000Z',
          },
          error: null,
        }),
      }),
    });

    vi.mocked(supabaseAdmin.from).mockReturnValue({
      select: selectQueryMock,
      insert: insertMock,
    } as any);

    const result = await ensurePublicUser({
      id: 'google-usr-1',
      email: 'alex@gmail.com',
      app_metadata: {},
      user_metadata: {
        full_name: 'Alex Rivera',
        picture: 'https://lh3.googleusercontent.com/avatar.jpg',
      },
      aud: 'authenticated',
      created_at: '2026-10-01T00:00:00.000Z',
    } as any);

    expect(result).toBeDefined();
    expect(result?.handle).toBe('alex_rivera');
    expect(result?.display_name).toBe('Alex Rivera');
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'google-usr-1',
        handle: 'alex_rivera',
        display_name: 'Alex Rivera',
        avatar_url: 'https://lh3.googleusercontent.com/avatar.jpg',
      })
    );
  });

  it('provisions Twitter/X OAuth user with native twitter handle', async () => {
    const selectQueryMock = vi.fn();
    selectQueryMock
      .mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      })
      .mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      });

    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'twitter-usr-1',
            handle: 'sataboring',
            display_name: 'Sata',
            avatar_url: 'https://pbs.twimg.com/profile.jpg',
            created_at: '2026-10-01T00:00:00.000Z',
          },
          error: null,
        }),
      }),
    });

    vi.mocked(supabaseAdmin.from).mockReturnValue({
      select: selectQueryMock,
      insert: insertMock,
    } as any);

    const result = await ensurePublicUser({
      id: 'twitter-usr-1',
      email: 'sata@x.com',
      app_metadata: {},
      user_metadata: {
        name: 'Sata',
        user_name: 'sataboring',
        avatar_url: 'https://pbs.twimg.com/profile.jpg',
      },
      aud: 'authenticated',
      created_at: '2026-10-01T00:00:00.000Z',
    } as any);

    expect(result).toBeDefined();
    expect(result?.handle).toBe('sataboring');
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'twitter-usr-1',
        handle: 'sataboring',
        display_name: 'Sata',
        avatar_url: 'https://pbs.twimg.com/profile.jpg',
        twitter: 'sataboring',
      })
    );
  });

  it('appends numeric suffix 1 when handle is already taken in database', async () => {
    const selectQueryMock = vi.fn();
    // 1st call: check if user exists -> null
    // 2nd call: check if handle 'devendra' exists -> found { id: 'other-user' }
    // 3rd call: check if handle 'devendra1' exists -> null (free!)
    selectQueryMock
      .mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      })
      .mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'first-devendra' }, error: null }),
        }),
      })
      .mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      });

    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'second-user',
            handle: 'devendra1',
            display_name: 'Devendra Dev',
            avatar_url: null,
            created_at: '2026-10-01T00:00:00.000Z',
          },
          error: null,
        }),
      }),
    });

    vi.mocked(supabaseAdmin.from).mockReturnValue({
      select: selectQueryMock,
      insert: insertMock,
    } as any);

    const result = await ensurePublicUser({
      id: 'second-user',
      email: 'devendra@example.com',
      app_metadata: {},
      user_metadata: {
        user_name: 'devendra',
      },
      aud: 'authenticated',
      created_at: '2026-10-01T00:00:00.000Z',
    } as any);

    expect(result?.handle).toBe('devendra1');
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'second-user',
        handle: 'devendra1',
      })
    );
  });
});
