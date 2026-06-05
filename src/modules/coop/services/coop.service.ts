import {
  CoopChallenge,
  CoopChallengeType,
  COOP_CHALLENGE_META,
} from '../../../database/models/CoopChallenge.model';
import { Friendship } from '../../../database/models/Friendship.model';
import { Collectible } from '../../../database/models/Collectible.model';
import { Player } from '../../../database/models/User.model';
import { sendPushNotification } from '../../../config/firebase';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../../utils/errors';
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
  if (!(await areFriends(initiatorId, partnerId))) {
    throw new ForbiddenError('Il partner deve essere un amico', 'NOT_FRIENDS');
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

  if (isInitiator) {
    c.initiatorProgress += value;
  } else {
    c.partnerProgress += value;
  }

  const total = c.initiatorProgress + c.partnerProgress;
  if (total >= c.targetValue && c.status === 'active') {
    c.status = 'completed';

    // Assegna collezionabile esclusivo se disponibile
    const rareColl = await Collectible.findOne({
      rarity: { $in: [CollectibleRarity.RARE, CollectibleRarity.LEGENDARY] },
      status: CollectibleStatus.ACTIVE,
    });
    if (rareColl) c.rewardCollectibleId = rareColl._id;

    for (const pid of [String(c.initiatorId), String(c.partnerId)]) {
      const player = await Player.findById(pid).select('fcmToken');
      if (player?.fcmToken) {
        await sendPushNotification(
          player.fcmToken,
          'Missione Completata!',
          'Avete sbloccato un collezionabile esclusivo.',
        );
      }
    }
  }

  await c.save();
  return serializeChallenge(c);
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
