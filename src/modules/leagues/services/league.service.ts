import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import {
  LeagueSeason,
  LeagueMembership,
  ILeagueMembership,
  LeagueTier,
  TIER_ORDER,
} from '../../../database/models/League.model';
import { Player } from '../../../database/models/User.model';
import { Friendship } from '../../../database/models/Friendship.model';
import { NotFoundError } from '../../../utils/errors';
import { LeagueCurrentView, LeagueHistoryEntry } from '@trentino-quest/shared-types';

/** Restituisce il lunedì della settimana corrente alle 00:00 UTC. */
function currentWeekStart(): Date {
  const now = new Date();
  const day = now.getUTCDay(); // 0=dom, 1=lun, ...
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff),
  );
  return monday;
}

/** Restituisce la domenica della settimana (weekStart + 6 giorni, 23:59:59 UTC). */
function weekEnd(weekStart: Date): Date {
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function tierUp(tier: LeagueTier): LeagueTier {
  const idx = TIER_ORDER.indexOf(tier);
  return TIER_ORDER[Math.min(idx + 1, TIER_ORDER.length - 1)];
}

function tierDown(tier: LeagueTier): LeagueTier {
  const idx = TIER_ORDER.indexOf(tier);
  return TIER_ORDER[Math.max(idx - 1, 0)];
}

/**
 * Reset settimanale delle leghe.
 *
 * NON usa transazioni MongoDB: richiederebbero un replica set, mentre il
 * deployment di riferimento (docker-compose) usa un mongod standalone su
 * cui ogni withTransaction fallirebbe. L'idempotenza e' garantita dal
 * check sull'esistenza della stagione corrente: in caso di crash a meta'
 * il rerun riparte in modo sicuro (i rank gia' persistiti restano validi
 * e la nuova stagione viene creata come ultimo passo).
 */
export async function runLeagueWeeklyReset(): Promise<void> {
  const weekStart = currentWeekStart();

  // Idempotente: se la stagione di questa settimana esiste già, skip
  const existing = await LeagueSeason.findOne({ weekStart });
  if (existing) return;

  // 1. Chiudi stagione precedente e calcola rank/promozioni/retrocessioni
  const prevSeason = await LeagueSeason.findOneAndUpdate(
    { active: true },
    { active: false },
    { returnDocument: 'after' },
  );

  if (prevSeason) {
    const groups = await LeagueMembership.find({ seasonId: prevSeason._id });
    const groupMap: Record<string, typeof groups> = {};
    for (const m of groups) {
      if (!groupMap[m.groupId]) groupMap[m.groupId] = [];
      groupMap[m.groupId].push(m);
    }

    for (const [, members] of Object.entries(groupMap)) {
      members.sort((a, b) => b.weeklyXp - a.weeklyXp);
      for (let i = 0; i < members.length; i++) {
        const m = members[i];
        const rank = i + 1;
        // I flag riflettono il movimento EFFETTIVO di tier: nei gironi
        // piccoli (< 10 membri) le due fasce si sovrapporrebbero, quindi
        // la promozione ha precedenza; chi e' gia' al tier massimo/minimo
        // non viene marcato promosso/retrocesso (il tier non cambia).
        const promoted = rank <= 5 && m.tier !== LeagueTier.DOLOMITI;
        const relegated =
          !promoted && rank > members.length - 5 && rank > 5 && m.tier !== LeagueTier.PORFIDO;
        const newTier = promoted ? tierUp(m.tier) : relegated ? tierDown(m.tier) : m.tier;

        await LeagueMembership.updateOne({ _id: m._id }, { rank, promoted, relegated });
        await Player.updateOne({ _id: m.playerId }, { currentLeagueTier: newTier });
      }
    }
  }

  // 2. Crea nuova stagione
  const newSeason = await LeagueSeason.create({
    weekStart,
    weekEnd: weekEnd(weekStart),
    active: true,
  });

  // 3. Raggruppa i player per tier e forma gironi da 30
  const allPlayers = await Player.find({}, '_id currentLeagueTier');
  const byTier: Record<string, typeof allPlayers> = {};
  for (const p of allPlayers) {
    const tier = p.currentLeagueTier || LeagueTier.PORFIDO;
    if (!byTier[tier]) byTier[tier] = [];
    byTier[tier].push(p);
  }

  const memberships: object[] = [];
  for (const [tier, players] of Object.entries(byTier)) {
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length; i += 30) {
      const group = shuffled.slice(i, i + 30);
      const groupId = randomUUID();
      for (const p of group) {
        memberships.push({
          playerId: p._id,
          seasonId: newSeason._id,
          groupId,
          tier,
          weeklyXp: 0,
          rank: null,
          promoted: false,
          relegated: false,
        });
      }
    }
  }

  if (memberships.length > 0) {
    await LeagueMembership.insertMany(memberships);
  }
}

/** Dimensione massima di un girone. */
const GROUP_SIZE = 30;

/**
 * Garantisce che il player abbia una membership nella stagione attiva.
 *
 * I player registrati a meta' settimana non sono inclusi nei gironi
 * creati al reset del lunedi': senza questo on-demand join vedrebbero
 * 404 fino alla settimana successiva. Il player viene inserito in un
 * girone non pieno del suo tier, o in un girone nuovo.
 */
async function ensureMembership(
  playerId: string,
  seasonId: Types.ObjectId,
): Promise<ILeagueMembership | null> {
  const existing = await LeagueMembership.findOne({ playerId, seasonId });
  if (existing) return existing;

  const player = await Player.findById(playerId).select('currentLeagueTier');
  if (!player) return null;
  const tier = (player.currentLeagueTier || LeagueTier.PORFIDO) as LeagueTier;

  // Cerca un girone del tier con posti liberi
  const groupCounts = await LeagueMembership.aggregate<{ _id: string; count: number }>([
    { $match: { seasonId, tier } },
    { $group: { _id: '$groupId', count: { $sum: 1 } } },
    { $match: { count: { $lt: GROUP_SIZE } } },
    { $limit: 1 },
  ]);
  const groupId = groupCounts.length > 0 ? groupCounts[0]._id : randomUUID();

  return LeagueMembership.create({
    playerId,
    seasonId,
    groupId,
    tier,
    weeklyXp: 0,
    rank: null,
    promoted: false,
    relegated: false,
  });
}

export async function getLeagueCurrent(playerId: string): Promise<LeagueCurrentView> {
  const activeSeason = await LeagueSeason.findOne({ active: true });
  if (!activeSeason) throw new NotFoundError('Nessuna stagione lega attiva', 'NO_ACTIVE_SEASON');

  const myMembership = await ensureMembership(playerId, activeSeason._id);
  if (!myMembership) throw new NotFoundError('Giocatore non in lega', 'NOT_IN_LEAGUE');

  const groupMembers = await LeagueMembership.find({
    seasonId: activeSeason._id,
    groupId: myMembership.groupId,
  });

  groupMembers.sort((a, b) => b.weeklyXp - a.weeklyXp);

  // Risolvi gli username interrogando direttamente il discriminator Player.
  // Una populate('playerId', 'username') sul ref 'User' (modello base) NON
  // restituirebbe lo username: senza la chiave discriminator 'role' nella
  // proiezione, Mongoose idrata con lo schema base User (privo di username)
  // e scarta il campo. Stesso approccio di getSocialLeaderboard.
  const memberIds = groupMembers.map((m) => m.playerId);
  const players = await Player.find({ _id: { $in: memberIds } }).select('_id username');
  const usernameById = new Map(players.map((p) => [String(p._id), p.username]));

  const friendships = await Friendship.find({
    $or: [
      { requesterId: playerId, status: 'accepted' },
      { recipientId: playerId, status: 'accepted' },
    ],
  });
  const friendIds = new Set(
    friendships.map((f) =>
      String(f.requesterId) === playerId ? String(f.recipientId) : String(f.requesterId),
    ),
  );

  const leaderboard = groupMembers.map((m, i) => {
    const pid = String(m.playerId);
    return {
      rank: i + 1,
      playerId: pid,
      username: usernameById.get(pid) ?? '',
      weeklyXp: m.weeklyXp,
      isCurrentPlayer: pid === playerId,
      isFriend: friendIds.has(pid),
    };
  });

  const myRank = leaderboard.find((e) => e.isCurrentPlayer)?.rank ?? 0;

  return {
    season: {
      weekStart: activeSeason.weekStart.toISOString(),
      weekEnd: activeSeason.weekEnd.toISOString(),
    },
    tier: myMembership.tier,
    groupId: myMembership.groupId,
    rank: myRank,
    weeklyXp: myMembership.weeklyXp,
    leaderboard,
  };
}

export async function getLeagueHistory(playerId: string): Promise<LeagueHistoryEntry[]> {
  const memberships = await LeagueMembership.find({ playerId })
    .populate('seasonId')
    .sort({ _id: -1 })
    .limit(10);

  return memberships
    .filter((m) => m.seasonId != null)
    .map((m) => {
      const season = m.seasonId as unknown as { _id: unknown; weekStart: Date; weekEnd: Date };
      return {
        seasonId: String(season._id),
        weekStart: season.weekStart.toISOString(),
        weekEnd: season.weekEnd.toISOString(),
        tier: m.tier,
        rank: m.rank,
        promoted: m.promoted,
        relegated: m.relegated,
      };
    });
}
