const ONESIGNAL_API_URL = 'https://api.onesignal.com/notifications';

type OneSignalNotificationResponse = {
  id?: string;
  recipients?: number;
  external_id?: string | null;
  errors?: unknown;
};

type OneSignalSubscription = {
  id: string;
  type: string;
  token: string;
  enabled: boolean;
  notification_types: number;
};

type OneSignalUserResponse = {
  identity?: { external_id?: string };
  subscriptions?: OneSignalSubscription[];
};

function hasOneSignalErrors(errors: unknown): boolean {
  if (errors == null) return false;
  if (Array.isArray(errors)) return errors.length > 0;
  if (typeof errors === 'object') return Object.keys(errors as Record<string, unknown>).length > 0;
  return true;
}

/**
 * Resolve an external_id (email) to active push subscription IDs.
 * OneSignal alias targeting can be unreliable, so we look up the user
 * and send directly to their enabled subscriptions.
 */
async function resolveSubscriptionIds(
  externalId: string,
  appId: string,
  apiKey: string,
): Promise<string[]> {
  const url = `https://api.onesignal.com/apps/${appId}/users/by/external_id/${encodeURIComponent(externalId)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Key ${apiKey}` },
  });

  if (!response.ok) {
    console.warn(`[OneSignal] User lookup failed (${response.status}) for:`, externalId);
    return [];
  }

  const data = (await response.json()) as OneSignalUserResponse;
  const subscriptions = data.subscriptions || [];

  return subscriptions
    .filter((s) => s.enabled && s.token && s.type === 'AndroidPush')
    .map((s) => s.id);
}

export async function sendPushNotification({
  recipientEmail,
  subject,
  fromName,
}: {
  recipientEmail: string;
  subject: string;
  fromName: string;
}): Promise<void> {
  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;

  if (!appId || !apiKey) {
    return;
  }

  const email = recipientEmail.trim();
  if (!email) {
    return;
  }

  // Resolve email → active subscription IDs (more reliable than alias targeting)
  const subscriptionIds = await resolveSubscriptionIds(email, appId, apiKey);
  if (subscriptionIds.length === 0) {
    console.warn('[OneSignal] No active subscriptions for:', email);
    return;
  }

  const body = {
    app_id: appId,
    include_subscription_ids: subscriptionIds,
    headings: { en: fromName || 'New message' },
    contents: { en: subject || '(No subject)' },
  };

  const response = await fetch(ONESIGNAL_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  let parsed: OneSignalNotificationResponse | null = null;
  try {
    parsed = JSON.parse(responseText) as OneSignalNotificationResponse;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    throw new Error(`OneSignal error ${response.status}: ${responseText}`);
  }

  if (parsed && hasOneSignalErrors(parsed.errors)) {
    throw new Error(`OneSignal error (200): ${responseText}`);
  }

  console.log('[OneSignal] Push sent:', responseText);
}
