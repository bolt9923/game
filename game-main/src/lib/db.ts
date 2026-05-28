// ─────────────────────────────────────────────────────────────────────────────
// db.ts  –  User data localStorage mein, Rooms Lovable Cloud (Supabase) mein
// ─────────────────────────────────────────────────────────────────────────────


// ── Types (same as before – dusri files nahi badlegi) ────────────────────────
export interface MatchHistoryEntry {
  id: string;
  gameId: string;
  gameName: string;
  result: 'Win' | 'Loss' | 'Draw' | 'Completed';
  points: number;
  timestamp: string;
}

export interface Badge {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface UserProfile {
  id: string;
  name: string;
  username: string;
  avatar: string;
  score: number;
  gems: number;
  clan: string;
  badges: Badge[];
  userId?: string;
}

export interface Tournament {
  id: string;
  title: string;
  gameId: string;
  entryFee: number;
  prizePool: number;
  maxPlayers: number;
  registeredPlayers: string[];
  status: 'upcoming' | 'active' | 'completed';
  startTime: string;
}

function generateUserId(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `GH${n}`;
}

const DEFAULT_TOURNAMENTS: Tournament[] = [
  {
    id: 't_chess_1',
    title: 'Weekly Chess Masters',
    gameId: 'chess',
    entryFee: 50,
    prizePool: 500,
    maxPlayers: 16,
    registeredPlayers: ['bot1', 'bot2'],
    status: 'upcoming',
    startTime: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: 't_ludo_1',
    title: 'Ludo King Cup',
    gameId: 'ludo',
    entryFee: 20,
    prizePool: 200,
    maxPlayers: 32,
    registeredPlayers: [],
    status: 'upcoming',
    startTime: new Date(Date.now() + 172800000).toISOString(),
  },
];

export const db = {
  // ── User (localStorage – device ka apna data) ──────────────────────────────
  isFirstLogin(): boolean {
    return !localStorage.getItem('user_profile');
  },

  getUser(): UserProfile {
    const data = localStorage.getItem('user_profile');
    if (data) {
      const parsed = JSON.parse(data);
      if (parsed && parsed.id) {
        if (!parsed.badges) parsed.badges = [];
        if (!parsed.userId) {
          parsed.userId = generateUserId();
          localStorage.setItem('user_profile', JSON.stringify(parsed));
        }
        return parsed;
      }
    }
    return {
      id: 'temp_' + Math.random().toString(36).substring(2, 9),
      name: 'Player',
      username: 'player',
      avatar: 'https://i.pravatar.cc/150?u=me',
      score: 0,
      gems: 100,
      clan: '',
      badges: [],
      userId: generateUserId(),
    };
  },

  createUser(name: string, userId: string): UserProfile {
    const uid = 'user_' + Math.random().toString(36).substring(2, 9);
    const avatar = `https://i.pravatar.cc/150?u=${uid}`;
    const user: UserProfile = {
      id: uid,
      name: name.trim(),
      username: userId.toLowerCase(),
      avatar,
      score: 500,
      gems: 100,
      clan: '',
      badges: [{ id: 'early_bird', name: 'Early Bird', icon: '🌟', color: 'text-yellow-400' }],
      userId: userId.toUpperCase(),
    };
    localStorage.setItem('user_profile', JSON.stringify(user));
    return user;
  },

  saveUser(user: UserProfile) {
    const existingData = localStorage.getItem('user_profile');
    if (existingData) {
      const parsed = JSON.parse(existingData);
      if (parsed.id && user.id !== parsed.id) {
        user.id = parsed.id;
      }
    }
    localStorage.setItem('user_profile', JSON.stringify(user));
  },

  canClaimDailyBonus(): boolean {
    const data = localStorage.getItem('gh_daily_bonus_v1');
    if (!data) return true;
    const state = JSON.parse(data);
    if (!state.lastClaim) return true;
    const last = new Date(state.lastClaim);
    const now = new Date();
    return last.toDateString() !== now.toDateString();
  },

  getDailyBonusState(): { lastClaim: number; streak: number } {
    try {
      const data = localStorage.getItem('gh_daily_bonus_v1');
      return data ? JSON.parse(data) : { lastClaim: 0, streak: 0 };
    } catch {
      return { lastClaim: 0, streak: 0 };
    }
  },

  claimDailyBonus(): number {
    if (!this.canClaimDailyBonus()) return 0;
    const rewards = [25, 50, 75, 100, 150, 200, 300];
    const s = this.getDailyBonusState();
    const oneDay = 86400000;
    const continued = s.lastClaim && Date.now() - s.lastClaim < oneDay * 2;
    const newStreak = continued ? s.streak + 1 : 1;
    const reward = rewards[newStreak % rewards.length];
    localStorage.setItem(
      'gh_daily_bonus_v1',
      JSON.stringify({ lastClaim: Date.now(), streak: newStreak })
    );
    const user = this.getUser();
    user.score += reward * 10;
    user.gems += Math.floor(reward / 5);
    this.saveUser(user);
    return reward;
  },

  checkBadges(user: UserProfile, history: MatchHistoryEntry[]): UserProfile {
    let updated = { ...user };
    const wins = history.filter((h) => h.result === 'Win').length;
    if (wins >= 1 && !updated.badges.find((b) => b.id === 'first_win')) {
      updated.badges.push({ id: 'first_win', name: 'First Victory', icon: '🏆', color: 'text-yellow-500' });
    }
    if (wins >= 5 && !updated.badges.find((b) => b.id === 'win_5')) {
      updated.badges.push({ id: 'win_5', name: 'Rising Star', icon: '⭐', color: 'text-purple-400' });
    }
    if (history.length >= 10 && !updated.badges.find((b) => b.id === 'veteran')) {
      updated.badges.push({ id: 'veteran', name: 'Veteran', icon: '🛡️', color: 'text-blue-400' });
    }
    return updated;
  },

  getMatchHistory(): MatchHistoryEntry[] {
    const data = localStorage.getItem('match_history');
    return data ? JSON.parse(data) : [];
  },

  addMatch(entry: Omit<MatchHistoryEntry, 'id' | 'timestamp'>) {
    const history = this.getMatchHistory();
    const newEntry: MatchHistoryEntry = {
      ...entry,
      id: 'match_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      timestamp: new Date().toISOString(),
    };
    const updatedHistory = [newEntry, ...history].slice(0, 10);
    localStorage.setItem('match_history', JSON.stringify(updatedHistory));
    const user = this.getUser();
    const userWithBadges = this.checkBadges(user, updatedHistory);
    this.saveUser(userWithBadges);
  },

  getTournaments(): Tournament[] {
    const data = localStorage.getItem('tournaments');
    if (!data) {
      localStorage.setItem('tournaments', JSON.stringify(DEFAULT_TOURNAMENTS));
      return DEFAULT_TOURNAMENTS;
    }
    return JSON.parse(data);
  },

  registerForTournament(tournamentId: string, userId: string): boolean {
    const t = this.getTournaments();
    const idx = t.findIndex((x) => x.id === tournamentId);
    if (idx >= 0) {
      if (!t[idx].registeredPlayers.includes(userId)) {
        t[idx].registeredPlayers.push(userId);
        localStorage.setItem('tournaments', JSON.stringify(t));
        return true;
      }
    }
    return false;
  },

  // Legacy room helpers (now Firebase-backed via rooms.ts)
  async createRoom(_roomId: string): Promise<void> { /* handled by rooms.ts */ },
  async roomExists(_roomId: string): Promise<boolean> { return false; },
  async removeRoom(_roomId: string): Promise<void> { /* handled by rooms.ts */ },
};

