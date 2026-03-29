const ONESIGNAL_API_URL = 'https://api.onesignal.com/notifications';

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

  const body = {
    app_id: appId,
    filters: [{ field: 'external_user_id', relation: '=', value: recipientEmail }],
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
  if (!response.ok) {
    throw new Error(`OneSignal error ${response.status}: ${responseText}`);
  }
  console.log('[OneSignal] Push sent:', responseText);
}
