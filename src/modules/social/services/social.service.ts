import { Types } from 'mongoose';
import { Friendship } from '../../../database/models/Friendship.model';
import { Kudos } from '../../../database/models/Kudos.model';
import { Completion } from '../../../database/models/Completion.model';
import { Player } from '../../../database/models/User.model';
import { sendPushNotification } from '../../../config/firebase';
import {
  ConflictError,
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} from '../../../utils/errors';
import { FeedActivityItem, SocialLeaderboardEntry } from '@trentino-quest/shared-types';

const KUDOS_MESSAGES: Record<string, (username: string) => string> = {
  beer: (u) => `${u} ti ha offerto una Birra Virtuale per la tua impresa!`,
  highfive: (u) => `${u} ti ha dato un batti cinque!`,
  star: (u) => `${u} ti ha assegnato una stella alpina!`,
};

/**
 * Verifica che due player abbiano un'amicizia accettata.
 */
async function areFriends(a: string, b: string): Promise<boolean> {
  const friendship = await Friendship.findOne({
    $or: [
      { requesterId: a, recipientId: b, status: 'accepted' },
      { requesterId: b, recipientId: a, status: 'accepted' },
    ],
  });
  return !!friendship;
}

export async function sendKudos(
  fromPlayerId: string,
  toPlayerId: string,
  activityType: string,
  activityId: string,
  emoji: 'beer' | 'highfive' | 'star',
): Promise<void> {
  if (fromPlayerId === toPlayerId)
    throw new BadRequestError('Non puoi mandare kudos a te stesso', 'SELF_KUDOS');

  // Il destinatario deve esistere ed essere un amico: i kudos nascono dal
  // feed sociale, che mostra solo attivita' degli amici.
  const toPlayer = await Player.findById(toPlayerId).select('fcmToken');
  if (!toPlayer) throw new NotFoundError('Giocatore non trovato', 'PLAYER_NOT_FOUND');
  if (!(await areFriends(fromPlayerId, toPlayerId))) {
    throw new ForbiddenError('Puoi mandare kudos solo agli amici', 'NOT_FRIENDS');
  }

  // L'attivita' deve esistere e appartenere al destinatario: senza questo
  // controllo chiunque potrebbe gonfiare i contatori con id arbitrari.
  if (activityType !== 'quest_completion' || !Types.ObjectId.isValid(activityId)) {
    throw new BadRequestError('Attività non valida', 'INVALID_ACTIVITY');
  }
  const completion = await Completion.findOne({ _id: activityId, playerId: toPlayerId });
  if (!completion) {
    throw new NotFoundError('Attività non trovata', 'ACTIVITY_NOT_FOUND');
  }

  const existing = await Kudos.findOne({ fromPlayerId, activityId });
  if (existing)
    throw new ConflictError('Kudos già inviato per questa attività', 'KUDOS_ALREADY_SENT');

  await Kudos.create({ fromPlayerId, toPlayerId, activityType, activityId, emoji });

  const fromPlayer = await Player.findById(fromPlayerId).select('username');
  if (fromPlayer && toPlayer.fcmToken) {
    const msg = KUDOS_MESSAGES[emoji](fromPlayer.username);
    await sendPushNotification(toPlayer.fcmToken, 'Kudos ricevuto!', msg);
  }
}

export async function getFeed(
  playerId: string,
  limit: number,
  offset: number,
): Promise<FeedActivityItem[]> {
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

  // Paginazione a livello di query: skip/limit sul DB. Il vecchio
  // approccio (fetch di limit*2 e slice in memoria) restituiva pagine
  // vuote per offset >= limit*2 anche quando esistevano altri elementi.
  const completions = await Completion.find({ playerId: { $in: friendIds } })
    .populate('playerId', 'username')
    .populate('questId', 'name')
    .sort({ completedAt: -1 })
    .skip(offset)
    .limit(limit);

  const activityIds = completions.map((c) => String(c._id));

  // Conteggi kudos in batch (una aggregate invece di N query per pagina)
  const kudosCounts = await Kudos.aggregate<{ _id: string; count: number }>([
    { $match: { activityId: { $in: activityIds }, activityType: 'quest_completion' } },
    { $group: { _id: '$activityId', count: { $sum: 1 } } },
  ]);
  const countByActivity = new Map(kudosCounts.map((k) => [k._id, k.count]));

  const myKudosDocs = await Kudos.find({
    fromPlayerId: playerId,
    activityId: { $in: activityIds },
  }).select('activityId');
  const myKudosSet = new Set(myKudosDocs.map((k) => k.activityId));

  return completions.map((c) => {
    const player = c.playerId as unknown as { _id: unknown; username: string };
    const quest = c.questId as unknown as { _id: unknown; name: string } | null;
    const activityId = String(c._id);
    return {
      type: 'quest_completion' as const,
      playerId: String(player._id),
      username: player.username,
      questName: quest?.name,
      timestamp: c.completedAt.toISOString(),
      activityId,
      kudosCount: countByActivity.get(activityId) ?? 0,
      myKudos: myKudosSet.has(activityId),
    };
  });
}

export async function getSocialLeaderboard(playerId: string): Promise<SocialLeaderboardEntry[]> {
  const friendships = await Friendship.find({
    $or: [
      { requesterId: playerId, status: 'accepted' },
      { recipientId: playerId, status: 'accepted' },
    ],
  });

  const friendIds = friendships.map((f) =>
    String(f.requesterId) === playerId ? f.recipientId : f.requesterId,
  );

  const allIds = [
    new Types.ObjectId(playerId),
    ...friendIds.map((id) => new Types.ObjectId(String(id))),
  ];

  const scores = await Completion.aggregate<{
    _id: Types.ObjectId;
    primary: number;
    secondary: number;
    total: number;
  }>([
    { $match: { playerId: { $in: allIds } } },
    {
      $lookup: {
        from: 'quests',
        localField: 'questId',
        foreignField: '_id',
        as: 'quest',
      },
    },
    { $unwind: '$quest' },
    {
      $group: {
        _id: '$playerId',
        primary: { $sum: { $cond: [{ $eq: ['$quest.type', 'primary'] }, 1, 0] } },
        secondary: { $sum: { $cond: [{ $eq: ['$quest.type', 'secondary'] }, 1, 0] } },
        total: { $sum: 1 },
      },
    },
  ]);

  const scoreMap = new Map(scores.map((s) => [String(s._id), s]));

  const players = await Player.find({ _id: { $in: allIds } }).select('_id username');

  const entries = players.map((p) => {
    const pid = String(p._id);
    const s = scoreMap.get(pid);
    const primary = s?.primary ?? 0;
    const secondary = s?.secondary ?? 0;
    return {
      playerId: pid,
      username: p.username,
      socialScore: primary * 2 + secondary,
      questCompletions: s?.total ?? 0,
      isCurrentPlayer: pid === playerId,
    };
  });

  entries.sort((a, b) => b.socialScore - a.socialScore);

  return entries.map((e, i) => ({ rank: i + 1, ...e }));
}

export async function sendFriendRequest(
  requesterId: string,
  target: { recipientId?: string; username?: string },
): Promise<void> {
  // Il destinatario puo' essere indicato per id (contratto API) o per
  // username (ricerca dal client). Almeno uno dei due e' garantito dal
  // validator del controller.
  const recipient = target.recipientId
    ? await Player.findById(target.recipientId).select('_id fcmToken')
    : await Player.findOne({ username: target.username }).select('_id fcmToken');
  if (!recipient) throw new NotFoundError('Giocatore non trovato', 'PLAYER_NOT_FOUND');

  const recipientId = String(recipient._id);
  if (requesterId === recipientId)
    throw new BadRequestError('Non puoi aggiungerti da solo', 'CANNOT_FRIEND_SELF');

  const existing = await Friendship.findOne({
    $or: [
      { requesterId, recipientId },
      { requesterId: recipientId, recipientId: requesterId },
    ],
  });
  if (existing) {
    // Una richiesta rifiutata non blocca per sempre la coppia: viene
    // rimossa e sostituita dalla nuova richiesta.
    if (existing.status === 'rejected') {
      await existing.deleteOne();
    } else {
      throw new ConflictError('Relazione già esistente', 'FRIENDSHIP_ALREADY_EXISTS');
    }
  }

  await Friendship.create({ requesterId, recipientId });

  const requester = await Player.findById(requesterId).select('username');
  if (requester && recipient.fcmToken) {
    await sendPushNotification(
      recipient.fcmToken,
      'Nuova richiesta di amicizia',
      `${requester.username} vuole essere tuo amico!`,
    );
  }
}

export async function getFriends(
  playerId: string,
): Promise<{ friendshipId: string; playerId: string; username: string }[]> {
  const friendships = await Friendship.find({
    $or: [
      { requesterId: playerId, status: 'accepted' },
      { recipientId: playerId, status: 'accepted' },
    ],
  });

  const results: { friendshipId: string; playerId: string; username: string }[] = [];
  for (const f of friendships) {
    const friendId = String(f.requesterId) === playerId ? f.recipientId : f.requesterId;
    const friend = await Player.findById(friendId).select('username');
    if (friend) {
      results.push({
        friendshipId: String(f._id),
        playerId: String(friend._id),
        username: friend.username,
      });
    }
  }
  return results;
}

export async function getPendingRequests(
  playerId: string,
): Promise<{ friendshipId: string; requesterId: string; username: string; createdAt: string }[]> {
  const requests = await Friendship.find({ recipientId: playerId, status: 'pending' });

  const results = [];
  for (const r of requests) {
    const requester = await Player.findById(r.requesterId).select('username');
    if (requester) {
      results.push({
        friendshipId: String(r._id),
        requesterId: String(r.requesterId),
        username: requester.username,
        createdAt: r.createdAt.toISOString(),
      });
    }
  }
  return results;
}

export async function acceptFriendRequest(
  friendshipId: string,
  currentPlayerId: string,
): Promise<void> {
  const friendship = await Friendship.findById(friendshipId);
  if (!friendship || friendship.status !== 'pending') {
    throw new NotFoundError('Richiesta non trovata', 'FRIENDSHIP_NOT_FOUND');
  }
  if (String(friendship.recipientId) !== currentPlayerId) {
    throw new ForbiddenError('Solo il destinatario può accettare', 'NOT_THE_RECIPIENT');
  }

  friendship.status = 'accepted';
  await friendship.save();

  const recipient = await Player.findById(currentPlayerId).select('username');
  const requester = await Player.findById(friendship.requesterId).select('fcmToken');
  if (recipient && requester?.fcmToken) {
    await sendPushNotification(
      requester.fcmToken,
      'Amicizia accettata',
      `${recipient.username} ha accettato la tua amicizia!`,
    );
  }
}

export async function rejectFriendRequest(
  friendshipId: string,
  currentPlayerId: string,
): Promise<void> {
  const friendship = await Friendship.findById(friendshipId);
  if (!friendship || friendship.status !== 'pending') {
    throw new NotFoundError('Richiesta non trovata', 'FRIENDSHIP_NOT_FOUND');
  }
  if (String(friendship.recipientId) !== currentPlayerId) {
    throw new ForbiddenError('Solo il destinatario può rifiutare', 'NOT_THE_RECIPIENT');
  }

  friendship.status = 'rejected';
  await friendship.save();
}

export async function removeFriend(friendshipId: string, currentPlayerId: string): Promise<void> {
  const friendship = await Friendship.findById(friendshipId);
  if (
    !friendship ||
    friendship.status !== 'accepted' ||
    (String(friendship.requesterId) !== currentPlayerId &&
      String(friendship.recipientId) !== currentPlayerId)
  ) {
    throw new NotFoundError('Amicizia non trovata', 'FRIENDSHIP_NOT_FOUND');
  }

  await friendship.deleteOne();
}
