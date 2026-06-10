import {
  CoopChallenge,
  CoopChallengeType,
  COOP_CHALLENGE_META,
} from '../../../database/models/CoopChallenge.model';
import { Friendship } from '../../../database/models/Friendship.model';
import { Collectible } from '../../../database/models/Collectible.model';
import { Player } from '../../../database/models/User.model';
import { sendPushNotification } from '../../../config/firebase';
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  ConflictError,
} from '../../../utils/errors';
import { CoopChallengeView } from '@trentino-quest/shared-types';
import { CollectibleRarity, CollectibleStatus } from '../../../database/models/Collectible.model';

const NUDGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function serializeChallenge(c: InstanceType<typeof CoopChallenge>): CoopChallengeView {
  const total = c.initiatorProgress + c.partnerProgress;
  return {
    id: String(c._id),
    initiatorId: String(c.initiatorId),
    partnerId: String(c.partnerId),
    type: c.type,
    title: c.title,
    description: c.description,
    targetValue: c.targetValue,
    initiatorProgress: c.initiatorProgress,
    partnerProgress: c.partnerProgress,
    totalPercentage: Math.min(Math.round((total / c.targetValue) * 100), 100),
    status: c.status,
    startedAt: c.startedAt.toISOString(),
    expiresAt: c.expiresAt.toISOString(),
    rewardCollectibleId: c.rewardCollectibleId ? String(c.rewardCollectibleId) : null,
  };
}

async function areFriends(a: string, b: string): Promise<boolean> {
  const f = await Friendship.findOne({
    $or: [
      { requesterId: a, recipientId: b, status: 'accepted' },
      { requesterId: b, recipientId: a, status: 'accepted' },
    ],
  });
  return !!f;
}

export async function createCoopChallenge(
  initiatorId: string,
  partnerId: string,
  type: CoopChallengeType,
): Promise<CoopChallengeView> {
  if (initiatorId === partnerId) {
    throw new BadRequestError('Non puoi sfidare te stesso', 'CANNOT_CHALLENGE_SELF');
  }
  if (!(await areFriends(initiatorId, partnerId))) {
    throw new ForbiddenError('Il partner deve essere un amico', 'NOT_FRIENDS');
  }

  // Una sola sfida attiva per coppia (in qualsiasi direzione): senza
  // questo guard la stessa coppia potrebbe accumulare sfide duplicate.
  const existing = await CoopChallenge.findOne({
    status: 'active',
    $or: [
      { initiatorId, partnerId },
      { initiatorId: partnerId, partnerId: initiatorId },
    ],
  });
  if (existing) {
    throw new ConflictError(
      'Esiste già una sfida attiva con questo partner',
      'CHALLENGE_ALREADY_ACTIVE',
    );
  }

  const meta = COOP_CHALLENGE_META[type];
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const challenge = await CoopChallenge.create({
    initiatorId,
    partnerId,
    type,
    title: meta.title,
    description: meta.description,
    targetValue: meta.targetValue,
    expiresAt,
  });

  const initiator = await Player.findById(initiatorId).select('username');
  const partner = await Player.findById(partnerId).select('fcmToken');
  if (initiator && partner?.fcmToken) {
    await sendPushNotification(
      partner.fcmToken,
      'Sfida cooperativa!',
      `${initiator.username} ti sfida in una quest cooperativa!`,
    );
  }

  return serializeChallenge(challenge);
}

export async function getActiveChallenges(playerId: string): Promise<CoopChallengeView[]> {
  const now = new Date();
  await CoopChallenge.updateMany(
    {
      status: 'active',
      expiresAt: { $lt: now },
      $or: [{ initiatorId: playerId }, { partnerId: playerId }],
    },
    { status: 'expired' },
  );

  const challenges = await CoopChallenge.find({
    status: 'active',
    $or: [{ initiatorId: playerId }, { partnerId: playerId }],
  });

  return challenges.map(serializeChallenge);
}

export async function getChallengeById(
  challengeId: string,
  playerId: string,
): Promise<CoopChallengeView> {
  const c = await CoopChallenge.findById(challengeId);
  if (!c) throw new NotFoundError('Sfida non trovata', 'CHALLENGE_NOT_FOUND');
  if (String(c.initiatorId) !== playerId && String(c.partnerId) !== playerId) {
    throw new ForbiddenError('Non sei parte di questa sfida', 'NOT_PARTICIPANT');
  }
  return serializeChallenge(c);
}

export async function addProgress(
  challengeId: string,
  playerId: string,
  value: number,
): Promise<CoopChallengeView> {
  const c = await CoopChallenge.findById(challengeId);
  if (!c) throw new NotFoundError('Sfida non trovata', 'CHALLENGE_NOT_FOUND');
  if (c.status !== 'active') throw new BadRequestError('Sfida non attiva', 'CHALLENGE_NOT_ACTIVE');

  const isInitiator = String(c.initiatorId) === playerId;
  if (!isInitiator && String(c.partnerId) !== playerId) {
    throw new ForbiddenError('Non sei parte di questa sfida', 'NOT_PARTICIPANT');
  }

  // $inc atomico sul campo del partecipante: due richieste concorrenti
  // non si sovrascrivono a vicenda (il vecchio load-modify-save perdeva
  // aggiornamenti). Il filtro su status active evita progressi su sfide
  // chiuse nel frattempo.
  const progressField = isInitiator ? 'initiatorProgress' : 'partnerProgress';
  const updated = await CoopChallenge.findOneAndUpdate(
    { _id: challengeId, status: 'active' },
    { $inc: { [progressField]: value } },
    { returnDocument: 'after' },
  );
  if (!updated) throw new BadRequestError('Sfida non attiva', 'CHALLENGE_NOT_ACTIVE');

  const total = updated.initiatorProgress + updated.partnerProgress;
  if (total >= updated.targetValue) {
    await completeChallenge(updated);
  }

  const fresh = await CoopChallenge.findById(challengeId);
  return serializeChallenge(fresh ?? updated);
}

/**
 * Transizione atomica a 'completed' con assegnazione del premio.
 *
 * Il filtro su status active garantisce che, anche con due richieste
 * concorrenti che superano il target, una sola esegua gli effetti
 * collaterali (scelta premio + notifiche).
 */
async function completeChallenge(challenge: InstanceType<typeof CoopChallenge>): Promise<void> {
  // Premio scelto casualmente tra i collezionabili rari/leggendari attivi
  // ($sample, invece del primo trovato che era sempre lo stesso).
  const [rareColl] = await Collectible.aggregate<{ _id: unknown }>([
    {
      $match: {
        rarity: { $in: [CollectibleRarity.RARE, CollectibleRarity.LEGENDARY] },
        status: CollectibleStatus.ACTIVE,
      },
    },
    { $sample: { size: 1 } },
  ]);

  const completed = await CoopChallenge.findOneAndUpdate(
    { _id: challenge._id, status: 'active' },
    {
      status: 'completed',
      completedAt: new Date(),
      rewardCollectibleId: rareColl ? rareColl._id : null,
    },
    { returnDocument: 'after' },
  );
  if (!completed) return; // un'altra richiesta ha già completato

  for (const pid of [String(completed.initiatorId), String(completed.partnerId)]) {
    const player = await Player.findById(pid).select('fcmToken');
    if (player?.fcmToken) {
      await sendPushNotification(
        player.fcmToken,
        'Missione Completata!',
        completed.rewardCollectibleId
          ? 'Avete sbloccato un collezionabile esclusivo.'
          : 'Avete completato la sfida cooperativa!',
      );
    }
  }
}

export async function nudgePartner(fromPlayerId: string, partnerId: string): Promise<void> {
  const friendship = await Friendship.findOne({
    $or: [
      { requesterId: fromPlayerId, recipientId: partnerId, status: 'accepted' },
      { requesterId: partnerId, recipientId: fromPlayerId, status: 'accepted' },
    ],
  });

  if (!friendship) throw new ForbiddenError('Il partner deve essere un amico', 'NOT_FRIENDS');

  const lastNudge = friendship.lastNudgeAt;
  if (lastNudge && Date.now() - lastNudge.getTime() < NUDGE_COOLDOWN_MS) {
    throw new BadRequestError('Nudge già inviato nelle ultime 24 ore', 'NUDGE_RATE_LIMITED');
  }

  friendship.lastNudgeAt = new Date();
  await friendship.save();

  const partner = await Player.findById(partnerId).select('fcmToken');
  if (partner?.fcmToken) {
    await sendPushNotification(
      partner.fcmToken,
      'Sveglia!',
      'Il tuo compagno di avventure sta scalando i monti da solo! Sveglia, indossa gli scarponi!',
    );
  }
}
