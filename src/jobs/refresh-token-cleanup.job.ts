import { logger } from '../config/logger';
import { deleteStaleRefreshTokens } from '../modules/auth/repositories/refresh-token.repository';

/**
 * Intervallo di esecuzione del cleanup job: 24 ore.
 *
 * Per il contesto applicativo attuale (sviluppo + deployment singolo) un
 * job interno al processo Node.js basato su setInterval e' sufficiente.
 * In ambienti di produzione distribuiti (multi-istanza, container) la
 * stessa funzione andrebbe schedulata da un orchestrator esterno (cron,
 * BullMQ, agenda, AWS EventBridge) per evitare esecuzioni duplicate.
 */
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Esegue una singola passata di cleanup sui refresh token.
 *
 * Eventuali errori vengono loggati ma non propagati: il fallimento di
 * una singola esecuzione non deve compromettere il lifecycle del server
 * o impedire le esecuzioni successive.
 */
async function runRefreshTokenCleanup(): Promise<void> {
  try {
    const deletedCount = await deleteStaleRefreshTokens();
    if (deletedCount > 0) {
      logger.info({ deletedCount }, 'Cleanup refresh token completato');
    }
  } catch (err) {
    logger.error({ err }, 'Errore durante il cleanup dei refresh token');
  }
}

/**
 * Avvia il cleanup job periodico dei refresh token.
 *
 * Esegue una prima passata dopo il primo intervallo per non rallentare
 * l'avvio del server, e poi ad ogni intervallo successivo. Il timer e'
 * unref() cosi' da non impedire la terminazione del processo durante
 * il graceful shutdown.
 *
 * Ritorna una funzione di cleanup da chiamare durante lo shutdown
 * dell'applicazione per fermare il timer in modo ordinato.
 */
export function startRefreshTokenCleanupJob(): () => void {
  logger.info({ intervalMs: CLEANUP_INTERVAL_MS }, 'Cleanup refresh token: avvio job periodico');

  const timer = setInterval(() => {
    void runRefreshTokenCleanup();
  }, CLEANUP_INTERVAL_MS);

  timer.unref();

  return () => {
    clearInterval(timer);
    logger.info('Cleanup refresh token: job interrotto');
  };
}
