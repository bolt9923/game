// ─────────────────────────────────────────────────────────────────────────────
// mockBackend.ts — Real-time game event bus via Firebase Realtime Database
// API: joinRoom(code), publish(event, payload), subscribe(event, cb) -> unsub
// ─────────────────────────────────────────────────────────────────────────────
import { db } from './firebase';
import { ref, onValue, set, off, remove, DataSnapshot } from 'firebase/database';

export type GameEventType =
  | 'tictactoe_move'
  | 'tictactoe_reset'
  | 'rps_sync_state'
  | 'wordchain_sync_state'
  | 'emojiquiz_sync_state'
  | 'wordguess_sync_state'
  | 'speedcatch_sync_state'
  | 'room_join'
  | 'room_start'
  | 'chess_sync_state'
  | 'ludo_sync_state'
  | 'carrom_sync_state'
  | string;

type Handler = (data: any) => void;

// Sanitize event name for Firebase path (no . # $ / [ ])
function safeName(e: string) {
  return e.replace(/[.#$/\[\]]/g, '_');
}

class FirebaseBackend {
  public roomId: string = 'global';
  private listeners: Map<string, { fbRef: any; fbHandler: (s: DataSnapshot) => void; handlers: Set<Handler> }> = new Map();
  private lastPayload: Map<string, any> = new Map();

  private evtPath(event: string) {
    return `gamestate/${this.roomId}/${safeName(event)}`;
  }

  joinRoom(roomId: string) {
    if (this.roomId === roomId) return;
    this.teardown();
    this.roomId = roomId || 'global';
  }

  leaveRoom() {
    this.teardown();
    this.roomId = 'global';
  }

  publish(type: GameEventType, payload: any) {
    this.lastPayload.set(type, payload);
    const path = this.evtPath(type);
    const r = ref(db, path);
    // Write payload with a sequence counter so repeated identical payloads still trigger listeners
    set(r, { payload, seq: Date.now() }).catch((e) =>
      console.warn('publish failed', e)
    );
  }

  subscribe(type: GameEventType, callback: Handler) {
    const key = `${this.roomId}::${type}`;
    let entry = this.listeners.get(key);
    if (!entry) {
      const r = ref(db, this.evtPath(type));
      const handlers: Set<Handler> = new Set();
      const fbHandler = (snap: DataSnapshot) => {
        if (!snap.exists()) return;
        const val = snap.val();
        const p = val?.payload ?? val;
        this.lastPayload.set(type, p);
        handlers.forEach((h) => {
          try { h(p); } catch (e) { console.error('handler err', e); }
        });
      };
      onValue(r, fbHandler);
      entry = { fbRef: r, fbHandler, handlers };
      this.listeners.set(key, entry);
    }

    entry.handlers.add(callback);

    // Replay last known payload
    const last = this.lastPayload.get(type);
    if (last !== undefined) {
      try { callback(last); } catch {}
    }

    return () => {
      const e = this.listeners.get(key);
      if (e) {
        e.handlers.delete(callback);
        if (e.handlers.size === 0) {
          off(e.fbRef, 'value', e.fbHandler);
          this.listeners.delete(key);
        }
      }
    };
  }

  /** Clear all game state for this room (call when game ends) */
  async clearRoom() {
    try {
      await remove(ref(db, `gamestate/${this.roomId}`));
    } catch {}
  }

  private teardown() {
    this.listeners.forEach(({ fbRef, fbHandler }) => {
      try { off(fbRef, 'value', fbHandler); } catch {}
    });
    this.listeners.clear();
    this.lastPayload.clear();
  }
}

export const mockBackend = new FirebaseBackend();
