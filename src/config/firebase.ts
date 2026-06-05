import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';
import { env } from './env';
import { logger } from './logger';

let initialized = false;

function initFirebase(): void {
  if (initialized) return;
  initialized = true;

  if (!env.FIREBASE_ENABLED) return;

  try {
    const serviceAccountRaw = readFileSync(env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH, 'utf-8');
    const serviceAccount = JSON.parse(serviceAccountRaw) as admin.ServiceAccount;
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    logger.info('Firebase Admin SDK inizializzato');
  } catch (err) {
    logger.error({ err }, 'Errore inizializzazione Firebase Admin SDK');
  }
}

initFirebase();

export async function sendPushNotification(
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  if (!env.FIREBASE_ENABLED) {
    logger.debug({ fcmToken, title, body }, '[FIREBASE DISABLED] Notifica non inviata');
    return;
  }
  try {
    await admin.messaging().send({ token: fcmToken, notification: { title, body }, data });
  } catch (err) {
    logger.warn({ err, fcmToken }, 'Errore invio notifica push FCM (fire-and-forget)');
  }
}
