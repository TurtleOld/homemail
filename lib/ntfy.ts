function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function buildNtfyTopic(accountId: string, topicPattern: string): string {
  return topicPattern.replace('{accountId}', accountId);
}

export async function sendPushNotification({
  accountId,
  subject,
  fromName,
}: {
  accountId: string;
  subject: string;
  fromName: string;
}): Promise<void> {
  const baseUrl = process.env.NTFY_URL?.trim();
  const username = process.env.NTFY_USERNAME?.trim();
  const password = process.env.NTFY_PASSWORD?.trim();
  const topicPattern = process.env.NTFY_TOPIC_PATTERN?.trim() || 'homemail-user-{accountId}';

  if (!baseUrl || !username || !password || !accountId.trim()) {
    return;
  }

  const topic = buildNtfyTopic(accountId.trim(), topicPattern);
  const url = `${trimTrailingSlashes(baseUrl)}/${encodeURIComponent(topic)}`;
  const message = (subject || '(No subject)').trim() || '(No subject)';
  const title = (fromName || 'New message').trim() || 'New message';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      Authorization: `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`,
      Title: title,
      Tags: 'email',
    },
    body: message,
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`ntfy error ${response.status}: ${responseText}`);
  }

  console.log('[ntfy] Push sent:', responseText);
}
