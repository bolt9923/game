// ─────────────────────────────────────────────────────────────────────────────
// rooms.ts — Real multiplayer rooms via Firebase Realtime Database
// ─────────────────────────────────────────────────────────────────────────────
import { db } from './firebase';
import {
  ref, set, get, update, remove, onValue, off,
  serverTimestamp, DataSnapshot,
} from 'firebase/database';

export interface RoomPlayer {
  id: string;
  name: string;
  avatar?: string;
}

export interface RoomRow {
  id: string;
  code: string;
  game_id: string;
  max_players: number;
  status: 'waiting' | 'playing' | 'ended';
  host_id: string;
  players: RoomPlayer[];
  state: any;
  current_turn: string | null;
  winner_id: string | null;
  created_at: string;
  updated_at: string;
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function roomRef(code: string) {
  return ref(db, `rooms/${code}`);
}

function snapToRow(code: string, val: any): RoomRow {
  return {
    id: code,
    code,
    game_id: val.game_id ?? 'unknown',
    max_players: val.max_players ?? 2,
    status: val.status ?? 'waiting',
    host_id: val.host_id ?? '',
    players: val.players ? Object.values(val.players) : [],
    state: val.state ?? null,
    current_turn: val.current_turn ?? null,
    winner_id: val.winner_id ?? null,
    created_at: val.created_at ?? new Date().toISOString(),
    updated_at: val.updated_at ?? new Date().toISOString(),
  };
}

export const rooms = {
  async create(opts: {
    gameId: string;
    maxPlayers: number;
    host: RoomPlayer;
  }): Promise<RoomRow> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = genCode();
      const r = roomRef(code);
      const snap = await get(r);
      if (snap.exists()) continue; // code taken, retry

      const playersObj: Record<string, RoomPlayer> = { [opts.host.id]: opts.host };
      const row = {
        code,
        game_id: opts.gameId,
        max_players: opts.maxPlayers,
        host_id: opts.host.id,
        players: playersObj,
        status: 'waiting',
        state: null,
        current_turn: null,
        winner_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await set(r, row);
      return snapToRow(code, { ...row, players: playersObj });
    }
    throw new Error('Room code generate nahi ho paya, phir try karo.');
  },

  async getByCode(code: string): Promise<RoomRow | null> {
    const snap = await get(roomRef(code.toUpperCase()));
    if (!snap.exists()) return null;
    return snapToRow(code.toUpperCase(), snap.val());
  },

  async join(code: string, player: RoomPlayer): Promise<RoomRow> {
    const uc = code.toUpperCase();
    const snap = await get(roomRef(uc));
    if (!snap.exists()) throw new Error('Room nahi mila. Code check karo.');
    const val = snap.val();
    if (val.status !== 'waiting') throw new Error('Game already start ho chuka hai.');

    const playersObj: Record<string, RoomPlayer> = val.players ?? {};
    const count = Object.keys(playersObj).length;
    if (!playersObj[player.id]) {
      if (count >= val.max_players) throw new Error('Room full hai.');
      playersObj[player.id] = player;
    }
    await update(roomRef(uc), {
      players: playersObj,
      updated_at: new Date().toISOString(),
    });
    return snapToRow(uc, { ...val, players: playersObj });
  },

  async leave(roomId: string, playerId: string): Promise<void> {
    const snap = await get(roomRef(roomId));
    if (!snap.exists()) return;
    const val = snap.val();
    const playersObj: Record<string, RoomPlayer> = { ...(val.players ?? {}) };
    delete playersObj[playerId];

    if (Object.keys(playersObj).length === 0) {
      await remove(roomRef(roomId));
      return;
    }
    const patch: any = {
      players: playersObj,
      updated_at: new Date().toISOString(),
    };
    if (val.host_id === playerId) {
      patch.host_id = Object.keys(playersObj)[0];
    }
    await update(roomRef(roomId), patch);
  },

  async start(roomId: string, firstTurn?: string): Promise<RoomRow> {
    const patch: any = {
      status: 'playing',
      updated_at: new Date().toISOString(),
    };
    if (firstTurn) patch.current_turn = firstTurn;
    await update(roomRef(roomId), patch);
    const snap = await get(roomRef(roomId));
    return snapToRow(roomId, snap.val());
  },

  /** Subscribe to live updates. Returns unsub fn. */
  watch(roomId: string, cb: (r: RoomRow) => void): () => void {
    const r = roomRef(roomId);
    const handler = (snap: DataSnapshot) => {
      if (!snap.exists()) return;
      cb(snapToRow(roomId, snap.val()));
    };
    onValue(r, handler);
    return () => off(r, 'value', handler);
  },
};
