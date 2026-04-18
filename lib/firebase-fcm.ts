import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

type FirebaseServiceAccount = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

let warnedMissingConfig = false;

function readServiceAccount(): FirebaseServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true;
      console.warn('[fcm] FIREBASE_SERVICE_ACCOUNT_JSON is missing, wake-up ping is disabled');
    }
    return null;
  }

  try {
    return JSON.parse(raw) as FirebaseServiceAccount;
  } catch (error) {
    throw new Error(
      `[fcm] Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function getFirebaseApp() {
  const existing = getApps().find((app) => app.name === 'mailclient-fcm');
  if (existing) {
    return existing;
  }

  const serviceAccount = readServiceAccount();
  if (!serviceAccount?.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    return null;
  }

  return initializeApp(
    {
      credential: cert({
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        privateKey: serviceAccount.private_key.replace(/\\n/g, '\n'),
      }),
    },
    'mailclient-fcm'
  );
}

export async function sendWakeUpPing({ topic }: { topic: string }): Promise<void> {
  const normalizedTopic = topic.trim();
  if (!normalizedTopic) {
    return;
  }

  const app = getFirebaseApp();
  if (!app) {
    return;
  }

  await getMessaging(app).send({
    topic: normalizedTopic,
    android: {
      priority: 'high',
      ttl: 60 * 1000,
    },
    data: {
      topic: normalizedTopic,
    },
  });
}
