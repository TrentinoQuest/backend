import cron from 'node-cron';
import { logger } from '../config/logger';
import { DailyQuestAssignment } from '../database/models/DailyQuest.model';

async function runCleanup(): Promise<void> {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dateStr = sevenDaysAgo.toISOString().slice(0, 10);

    const result = await DailyQuestAssignment.deleteMany({ date: { $lt: dateStr } });
    if (result.deletedCount > 0) {
      logger.info(
        { deletedCount: result.deletedCount },
        'Cleanup daily quest assignments completato',
      );
    }
  } catch (err) {
    logger.error({ err }, 'Errore durante il cleanup delle daily quest assignments');
  }
}

// Ogni giorno alle 00:00 UTC
export function startDailyQuestCleanupJob(): () => void {
  const task = cron.schedule(
    '0 0 * * *',
    () => {
      void runCleanup();
    },
    { timezone: 'UTC' },
  );

  logger.info('Daily quest cleanup job: avviato');
  return () => {
    void task.stop();
    logger.info('Daily quest cleanup job: fermato');
  };
}
