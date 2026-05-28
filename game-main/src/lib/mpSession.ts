// Multiplayer session: held by App when a game is launched from RoomHub.
// Games and MultiplayerLobby read this at mount to skip per-game lobbies
// and jump straight to online play.
import type { RoomPlayer } from './rooms';

export interface MpSession {
  roomId: string;          // room code (mockBackend channel key)
  roomRowId: string;       // db id (for cleanup if needed)
  gameId: string;
  role: 'p1' | 'p2' | 'p3' | 'p4';
  players: RoomPlayer[];
  maxPlayers: number;
}

let current: MpSession | null = null;

export const mpSession = {
  set(s: MpSession) { current = s; },
  peek(): MpSession | null { return current; },
  /** Get session if it matches this game's id; otherwise null. */
  forGame(gameId: string): MpSession | null {
    return current && current.gameId === gameId ? current : null;
  },
  clear() { current = null; },
};
