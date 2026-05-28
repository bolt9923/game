// Local profile, daily bonus, friends store (localStorage backed)
const KEY = 'gh_profile_v1';
const FRIENDS_KEY = 'gh_friends_v1';
const REQUESTS_KEY = 'gh_friend_requests_v1';
const BONUS_KEY = 'gh_daily_bonus_v1';

export interface Profile {
  name: string;
  userId: string;
  coins: number;
  createdAt: number;
}

export interface Friend {
  userId: string;
  name: string;
  addedAt: number;
}

export interface FriendRequest {
  userId: string;
  name: string;
  status: 'pending' | 'accepted';
  at: number;
}

function randomUserId() {
  // GH-XXXX 4-digit short id
  const n = Math.floor(1000 + Math.random() * 9000);
  return `GH${n}`;
}

export const profileStore = {
  get(): Profile | null {
    try { const r = localStorage.getItem(KEY); return r ? JSON.parse(r) : null; } catch { return null; }
  },
  save(p: Profile) { localStorage.setItem(KEY, JSON.stringify(p)); },
  create(name: string, userId?: string): Profile {
    const p: Profile = {
      name: name.trim() || 'Player',
      userId: (userId?.trim() || randomUserId()).toUpperCase(),
      coins: 100,
      createdAt: Date.now(),
    };
    this.save(p);
    return p;
  },
  addCoins(n: number) {
    const p = this.get(); if (!p) return;
    p.coins += n; this.save(p);
  },
  suggestUserId: randomUserId,
};

export const dailyBonus = {
  // Returns the next reward amount; cycles 25, 50, 75, 100, 150, 200, 300
  rewards: [25, 50, 75, 100, 150, 200, 300],
  state(): { lastClaim: number; streak: number } {
    try { return JSON.parse(localStorage.getItem(BONUS_KEY) || '{"lastClaim":0,"streak":0}'); }
    catch { return { lastClaim: 0, streak: 0 }; }
  },
  canClaim(): boolean {
    const { lastClaim } = this.state();
    if (!lastClaim) return true;
    const last = new Date(lastClaim); const now = new Date();
    // Different calendar day = can claim
    return last.toDateString() !== now.toDateString();
  },
  nextReward(): number {
    const { streak } = this.state();
    return this.rewards[streak % this.rewards.length];
  },
  claim(): number {
    if (!this.canClaim()) return 0;
    const s = this.state();
    const reward = this.rewards[s.streak % this.rewards.length];
    const oneDay = 86400000;
    const continued = s.lastClaim && (Date.now() - s.lastClaim) < oneDay * 2;
    const newStreak = continued ? s.streak + 1 : 1;
    localStorage.setItem(BONUS_KEY, JSON.stringify({ lastClaim: Date.now(), streak: newStreak }));
    profileStore.addCoins(reward);
    return reward;
  },
};

export const friendsStore = {
  list(): Friend[] {
    try { return JSON.parse(localStorage.getItem(FRIENDS_KEY) || '[]'); } catch { return []; }
  },
  requests(): FriendRequest[] {
    try { return JSON.parse(localStorage.getItem(REQUESTS_KEY) || '[]'); } catch { return []; }
  },
  sendRequest(userId: string, name?: string): { ok: boolean; error?: string } {
    const id = userId.trim().toUpperCase();
    const me = profileStore.get();
    if (!id) return { ok: false, error: 'User ID required' };
    if (me && id === me.userId) return { ok: false, error: "You can't add yourself" };
    if (!/^GH\d{3,6}$/.test(id)) return { ok: false, error: 'Invalid User ID (e.g. GH1234)' };
    if (this.list().some(f => f.userId === id)) return { ok: false, error: 'Already your friend' };
    const reqs = this.requests();
    if (reqs.some(r => r.userId === id)) return { ok: false, error: 'Request already sent' };
    reqs.push({ userId: id, name: name || `Player ${id}`, status: 'pending', at: Date.now() });
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(reqs));
    // Simulate auto-accept after delay for demo
    setTimeout(() => this.accept(id), 4000);
    return { ok: true };
  },
  accept(userId: string) {
    const reqs = this.requests().filter(r => r.userId !== userId);
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(reqs));
    const friends = this.list();
    if (!friends.some(f => f.userId === userId)) {
      friends.push({ userId, name: `Player ${userId}`, addedAt: Date.now() });
      localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends));
    }
  },
  remove(userId: string) {
    const friends = this.list().filter(f => f.userId !== userId);
    localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends));
  },
};
