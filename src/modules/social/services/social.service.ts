import { Friendship } from '../../../database/models/Friendship.model';
import { Kudos } from '../../../database/models/Kudos.model';
import { Completion } from '../../../database/models/Completion.model';
import { Player } from '../../../database/models/User.model';
import { sendPushNotification } from '../../../config/firebase';
import { ConflictError, NotFoundError, BadRequestError } from '../../../utils/errors';
import { FeedActivityItem } from '@trentino-quest/shared-types';
import mongoose from 'mongoose';

const KUDOS_MESSAGES: Record<string, (username: string) => string> = {
  beer: (u) => `${u} ti ha offerto una Birra Virtuale per la tua impresa!`,
  highfive: (u) => `${u} ti ha dato un batti cinque!`,
  star: (u) => `${u} ti ha assegnato una stella alpina!`,
};

export async function sendKudos(
  fromPlayerId: string,
  toPlayerId: string,
  activityType: string,
  activityId: string,
  emoji: 'beer' | 'highfive' | 'star',
): Promise<void> {
  if (fromPlayerId === toPlayerId)
    throw new BadRequestError('Non puoi mandare kudos a te stesso', 'SELF_KUDOS');

  const existing = await Kudos.findOne({ fromPlayerId, activityId });
  if (existing)
    throw new ConflictError('Kudos già inviato per questa attività', 'KUDOS_ALREADY_SENT');

  await Kudos.create({ fromPlayerId, toPlayerId, activityType, activityId, emoji });

  const fromPlayer = await Player.findById(fromPlayerId).select('username');
  const toPlayer = await Player.findById(toPlayerId).select('fcmToken');
  if (fromPlayer && toPlayer?.fcmToken) {
    const msg = KUDOS_MESSAGES[emoji](fromPlayer.username);
    await sendPushNotification(toPlayer.fcmToken, 'Kudos ricevuto!', msg);
  }
}

export async function getFeed(
  playerId: string,
  limit: number,
  offset: number,
): Promise<FeedActivityItem[]> {
  // Trova amici con status accepted
  const friendships = await Friendship.find({
    $or: [
      { requesterId: playerId, status: 'accepted' },
      { recipientId: playerId, status: 'accepted' },
    ],
  });
  const friendIds = friendships.map((f) =>
    String(f.requesterId) === playerId ? f.recipientId : f.requesterId,
  );

  if (friendIds.length === 0) return [];

  // Ultimi completamenti degli amici
  const completions = await Completion.find({ playerId: { $in: friendIds } })
    .populate('playerId', 'username')
    .populate('questId', 'name')
    .sort({ completedAt: -1 })
    .limit(limit * 2);

  const items: FeedActivityItem[] = [];

  for (const c of completions) {
    const player = c.playerId as unknown as { _id: unknown; username: string };
    const quest = c.questId as unknown as { _id: unknown; name: string } | null;
    const activityId = String(c._id);
    const kudosCount = await Kudos.countDocuments({ activityId, activityType: 'quest_completion' });
    const myKudos = await Kudos.exists({ fromPlayerId: playerId, activityId });

    items.push({
      type: 'quest_completion',
      playerId: String(player._id),
      username: player.username,
      questName: quest?.name,
      timestamp: c.completedAt.toISOString(),
      activityId,
      kudosCount,
      myKudos: !!myKudos,
    });
  }

  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return items.slice(offset, offset + limit);
}

export async function getFriendSuggestions(
  playerId: string,
  limit: number,
): Promise<{ playerId: string; username: string; commonCollectibles: number }[]> {
  const existingRelations = await Friendship.find({
    $or: [{ requesterId: playerId }, { recipientId: playerId }],
  });
  const excludeIds = new Set<string>([playerId]);
  for (const f of existingRelations) {
    excludeIds.add(String(f.requesterId));
    excludeIds.add(String(f.recipientId));
  }

  // Collezionabili propri (dalla collection completions + collectibleId)
  const myCompletions = await Completion.find({ playerId }).select('questId');
  const myQuestIds = myCompletions.map((c) => c.questId);

  const allPlayers = await Player.find({
    _id: { $nin: Array.from(excludeIds).map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .select('_id username')
    .limit(50);

  const results: { playerId: string; username: string; commonCollectibles: number }[] = [];

  for (const p of allPlayers) {
    const theirCompletions = await Completion.find({ playerId: p._id }).select('questId');
    const theirQuestIds = new Set(theirCompletions.map((c) => String(c.questId)));
    const common = myQuestIds.filter((id) => theirQuestIds.has(String(id))).length;
    results.push({ playerId: String(p._id), username: p.username, commonCollectibles: common });
  }

  return results.sort((a, b) => b.commonCollectibles - a.commonCollectibles).slice(0, limit);
}

export async function sendFriendRequest(requesterId: string, recipientId: string): Promise<void> {
  if (requesterId === recipientId)
    throw new BadRequestError('Non puoi aggiungerti da solo', 'SELF_FRIEND');
  const existing = await Friendship.findOne({
    $or: [
      { requesterId, recipientId },
      { requesterId: recipientId, recipientId: requesterId },
    ],
  });
  if (existing) throw new ConflictError('Relazione già esistente', 'FRIENDSHIP_EXISTS');

  await Friendship.create({ requesterId, recipientId });

  const requester = await Player.findById(requesterId).select('username');
  const recipient = await Player.findById(recipientId).select('fcmToken');
  if (requester && recipient?.fcmToken) {
    await sendPushNotification(
      recipient.fcmToken,
      'Nuova richiesta di amicizia',
      `${requester.username} vuole essere tuo amico!`,
    );
  }
}

export async function respondFriendRequest(
  recipientId: string,
  requesterId: string,
  accept: boolean,
): Promise<void> {
  const friendship = await Friendship.findOne({ requesterId, recipientId, status: 'pending' });
  if (!friendship) throw new NotFoundError('Richiesta non trovata', 'FRIENDSHIP_NOT_FOUND');

  friendship.status = accept ? 'accepted' : 'rejected';
  await friendship.save();

  if (accept) {
    const recipient = await Player.findById(recipientId).select('username');
    const requester = await Player.findById(requesterId).select('fcmToken');
    if (recipient && requester?.fcmToken) {
      await sendPushNotification(
        requester.fcmToken,
        'Amicizia accettata',
        `${recipient.username} ha accettato la tua amicizia!`,
      );
    }
  }
}
