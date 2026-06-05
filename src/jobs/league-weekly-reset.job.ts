import cron from 'node-cron';
import { logger } from '../config/logger';
import { runLeagueWeeklyReset } from '../modules/leagues/services/league.service';

async function runReset(): Promise<void> {
  try {
    await runLeagueWeeklyReset();
    logger.info('Reset settimanale leghe completato');
  } catch (err) {
    logger.error({ err }, 'Errore durante il reset settimanale leghe');
  }
}

// Ogni lunedì alle 00:01 UTC
export function startLeagueWeeklyResetJob(): () => void {
  const task = cron.schedule(
    '1 0 * * 1',
    () => {
      void runReset();
    },
    { timezone: 'UTC' },
  );

  logger.info('League weekly reset job: avviato');
  return () => {
    void task.stop();
    logger.info('League weekly reset job: fermato');
  };
}
