const ONESIGNAL_API_URL = 'https://api.onesignal.com/notifications';

type OneSignalNotificationResponse = {
  id?: string;
  recipients?: number;
  external_id?: string | null;
  errors?: unknown;
};

function parseRecipientAliases(recipientEmail: string): string[] {
  const parts = String(recipientEmail)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set(parts));
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

  const externalIds = parseRecipientAliases(recipientEmail);
  if (externalIds.length === 0) {
    return;
  }

  const body = {
    app_id: appId,
    include_aliases: { external_id: externalIds },
    target_channel: 'push',
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

  // OneSignal can return 200 OK with an `errors` field (e.g. invalid aliases).
  // Treat this as a failure so callers can decide whether to retry.
  if (parsed && parsed.errors) {
    throw new Error(`OneSignal error (200): ${responseText}`);
  }

  console.log('[OneSignal] Push sent:', responseText);
}
