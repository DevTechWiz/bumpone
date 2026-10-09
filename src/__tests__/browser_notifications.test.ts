import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getStoredAlertPreferences,
  saveStoredAlertPreferences,
  requestBrowserNotificationPermission,
  DEFAULT_ALERT_PREFERENCES,
} from '../lib/browserNotifications';

describe('Browser Notifications and Alert Preferences', () => {
  const store = new Map<string, string>();

  const localStorageMock = {
    getItem: vi.fn((key: string) => store.get(key) || null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
  };

  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', localStorageMock);
    vi.stubGlobal('window', {
      localStorage: localStorageMock,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns default preferences when nothing is stored', () => {
    const prefs = getStoredAlertPreferences();
    expect(prefs).toEqual(DEFAULT_ALERT_PREFERENCES);
    expect(prefs.emailAlerts).toBe(true);
    expect(prefs.browserAlerts).toBe(false);
    expect(prefs.instantKingAlert).toBe(true);
  });

  it('persists and retrieves updated preferences', () => {
    saveStoredAlertPreferences({
      emailAlerts: false,
      browserAlerts: true,
      instantKingAlert: false,
    });

    const stored = getStoredAlertPreferences();
    expect(stored).toEqual({
      emailAlerts: false,
      browserAlerts: true,
      instantKingAlert: false,
    });
    expect(localStorageMock.setItem).toHaveBeenCalled();
  });

  it('handles permission request when Notification API is unsupported in window', async () => {
    vi.stubGlobal('window', {
      localStorage: localStorageMock,
    });

    const res = await requestBrowserNotificationPermission();
    expect(res.granted).toBe(false);
    expect(res.permission).toBe('unsupported');
  });

  it('returns granted immediately if permission is already granted', async () => {
    vi.stubGlobal('window', {
      localStorage: localStorageMock,
      Notification: {
        permission: 'granted',
        requestPermission: vi.fn(),
      },
    });
    vi.stubGlobal('Notification', {
      permission: 'granted',
      requestPermission: vi.fn(),
    });

    const res = await requestBrowserNotificationPermission();
    expect(res.granted).toBe(true);
    expect(res.permission).toBe('granted');
  });
});
