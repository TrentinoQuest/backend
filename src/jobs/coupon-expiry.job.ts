import cron from 'node-cron';
import { logger } from '../config/logger';
import { Coupon } from '../database/models/Coupon.model';

async function runExpiry(): Promise<void> {
  try {
    const result = await Coupon.updateMany(
      { status: 'active', expiresAt: { $lt: new Date() } },
      { status: 'expired' },
    );
    if (result.modifiedCount > 0) {
      logger.info({ modifiedCount: result.modifiedCount }, 'Coupon scaduti aggiornati');
    }
  } catch (err) {
    logger.error({ err }, 'Errore durante la scadenza automatica dei coupon');
  }
}

// Ogni ora
export function startCouponExpiryJob(): () => void {
  const task = cron.schedule(
    '0 * * * *',
    () => {
      void runExpiry();
    },
    { timezone: 'UTC' },
  );

  logger.info('Coupon expiry job: avviato');
  return () => {
    void task.stop();
    logger.info('Coupon expiry job: fermato');
  };
}
