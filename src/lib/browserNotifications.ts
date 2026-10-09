export interface AlertPreferences {
  emailAlerts: boolean;
  browserAlerts: boolean;
  instantKingAlert: boolean;
}

const STORAGE_KEY = 'bumpone_alert_preferences';

export const DEFAULT_ALERT_PREFERENCES: AlertPreferences = {
  emailAlerts: true,
  browserAlerts: false,
  instantKingAlert: true,
};

export function getStoredAlertPreferences(): AlertPreferences {
  if (typeof window === 'undefined') return DEFAULT_ALERT_PREFERENCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ALERT_PREFERENCES;
    const parsed = JSON.parse(raw);
    return {
      emailAlerts: typeof parsed.emailAlerts === 'boolean' ? parsed.emailAlerts : true,
      browserAlerts: typeof parsed.browserAlerts === 'boolean' ? parsed.browserAlerts : false,
      instantKingAlert: typeof parsed.instantKingAlert === 'boolean' ? parsed.instantKingAlert : true,
    };
  } catch {
    return DEFAULT_ALERT_PREFERENCES;
  }
}

export function saveStoredAlertPreferences(prefs: AlertPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (err) {
    console.warn('Failed to save alert preferences to localStorage:', err);
  }
}

export async function requestBrowserNotificationPermission(): Promise<{
  granted: boolean;
  permission: NotificationPermission | 'unsupported';
}> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { granted: false, permission: 'unsupported' };
  }
  if (Notification.permission === 'granted') {
    return { granted: true, permission: 'granted' };
  }
  if (Notification.permission === 'denied') {
    return { granted: false, permission: 'denied' };
  }
  try {
    const res = await Notification.requestPermission();
    return { granted: res === 'granted', permission: res };
  } catch {
    return { granted: false, permission: Notification.permission };
  }
}

export function showBrowserRankAlert(params: {
  title: string;
  body: string;
  tag?: string;
  onClickUrl?: string;
}): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    const n = new Notification(params.title, {
      body: params.body,
      icon: '/bumpone-icon.png',
      badge: '/favicon.ico',
      tag: params.tag || 'bumpone-rank-alert',
    });

    n.onclick = () => {
      window.focus();
      if (params.onClickUrl) {
        window.location.href = params.onClickUrl;
      }
      n.close();
    };
  } catch (err) {
    console.warn('Failed to trigger desktop notification:', err);
  }
}
