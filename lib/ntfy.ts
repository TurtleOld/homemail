import { sendWakeUpPing } from '@/lib/firebase-fcm';

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function buildNtfyTopic(accountId: string, topicPattern: string): string {
  return topicPattern.replace('{accountId}', accountId);
}

function buildAuthorizationHeader(): string | null {
  const token = process.env.NTFY_TOKEN?.trim();
  if (token) {
    return `Bearer ${token}`;
  }

  return null;
}

function encodeHeaderValue(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) {
    return value;
  }

  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

export async function sendPushNotification({
  accountId,
  messageId,
  subject,
  fromName,
}: {
  accountId: string;
  messageId: string;
  subject: string;
  fromName: string;
}): Promise<void> {
  const baseUrl = process.env.NTFY_URL?.trim();
  const topicPattern = process.env.NTFY_TOPIC_PATTERN?.trim() || 'homemail-user-{accountId}';
  const authorization = buildAuthorizationHeader();

  if (!baseUrl || !authorization || !accountId.trim() || !messageId.trim()) {
    return;
  }

  const topic = buildNtfyTopic(accountId.trim(), topicPattern);
  const url = `${trimTrailingSlashes(baseUrl)}/${encodeURIComponent(topic)}`;
  const normalizedSubject = (subject || '(No subject)').trim() || '(No subject)';
  const title = (fromName || 'New message').trim() || 'New message';
  const payload = JSON.stringify({
    messageId: messageId.trim(),
    accountId: accountId.trim(),
    subject: normalizedSubject,
    fromName: title,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: authorization,
      Title: encodeHeaderValue(title),
      Tags: 'email',
    },
    body: payload,
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`ntfy error ${response.status}: ${responseText}`);
  }

  await sendWakeUpPing({ topic });
  console.log('[ntfy] Push sent:', responseText);
}
