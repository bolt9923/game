// ─────────────────────────────────────────────────────────────────────────────
// MultiplayerLobby.tsx — Firebase-backed per-game online lobby
// Works in two modes:
//   1. Auto-mode: RoomHub already set mpSession → immediately starts game
//   2. Manual-mode: Create/Join room directly from inside the game
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Users, KeyRound, Copy, Check, Wifi, Loader2, ArrowLeft, Plus, Crown } from 'lucide-react';
import { mockBackend } from '../lib/mockBackend';
import { db } from '../lib/db';
import { mpSession } from '../lib/mpSession';
import { rooms, type RoomPlayer } from '../lib/rooms';

interface MultiplayerLobbyProps {
  gameName: string;
  gameId?: string;
  maxPlayers?: number;          // default 2
  onStartGame: (role: 'p1' | 'p2' | 'p3' | 'p4', roomId: string) => void;
  onBack: () => void;
}

const ROLES = ['p1', 'p2', 'p3', 'p4'] as const;

export default function MultiplayerLobby({
  gameName, gameId, maxPlayers = 2, onStartGame, onBack,
}: MultiplayerLobbyProps) {

  // ── Auto-start if RoomHub already set a session ──────────────────────────
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    const sess = gameId ? mpSession.forGame(gameId) : mpSession.peek();
    if (sess) {
      autoStartedRef.current = true;
      mockBackend.joinRoom(sess.roomId);
      Promise.resolve().then(() => onStartGame(sess.role, sess.roomId));
    }
  }, []); // eslint-disable-line

  // ── Manual flow state ────────────────────────────────────────────────────
  const [step, setStep]           = useState<'menu' | 'create' | 'join'>('menu');
  const [roomCode, setRoomCode]   = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [players, setPlayers]     = useState<RoomPlayer[]>([]);
  const [myRole, setMyRole]       = useState<typeof ROLES[number]>('p1');
  const [error, setError]         = useState('');
  const [busy, setBusy]           = useState(false);
  const [copied, setCopied]       = useState(false);
  const [roomRowId, setRoomRowId] = useState('');
  const unsubRef = useRef<(() => void) | null>(null);
  const launchedRef = useRef(false);

  const currentUser = db.getUser();
  const me: RoomPlayer = { id: currentUser.id, name: currentUser.name, avatar: currentUser.avatar };

  const stopWatch = () => { if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; } };

  const startWatch = useCallback((rowId: string, code: string, role: typeof ROLES[number]) => {
    stopWatch();
    unsubRef.current = rooms.watch(rowId, (row) => {
      setPlayers(row.players || []);
      if (row.status === 'playing' && !launchedRef.current) {
        launchedRef.current = true;
        mockBackend.joinRoom(code);
        onStartGame(role, code);
      }
    });
  }, [onStartGame]);

  useEffect(() => () => stopWatch(), []);

  const handleCreate = async () => {
    setBusy(true); setError('');
    try {
      const row = await rooms.create({ gameId: gameId || 'unknown', maxPlayers, host: me });
      setRoomCode(row.code);
      setRoomRowId(row.id);
      setMyRole('p1');
      setPlayers(row.players);
      mockBackend.joinRoom(row.code);
      startWatch(row.id, row.code, 'p1');
      setStep('create');
    } catch (e: any) {
      setError(e?.message || 'Room create nahin hua. Phir try karo.');
    } finally { setBusy(false); }
  };

  const handleJoin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const code = joinInput.trim().toUpperCase();
    if (!code) return;
    setBusy(true); setError('');
    try {
      const row = await rooms.join(code, me);
      const idx = row.players.findIndex(p => p.id === me.id);
      const role = (ROLES[Math.max(0, idx)] || 'p2') as typeof ROLES[number];
      setRoomCode(code);
      setRoomRowId(row.id);
      setMyRole(role);
      setPlayers(row.players);
      mockBackend.joinRoom(code);
      startWatch(row.id, code, role);
      setStep('join');
    } catch (e: any) {
      setError(e?.message || 'Join nahin ho paya. Code check karo.');
    } finally { setBusy(false); }
  };

  const handleHostStart = async () => {
    if (!roomRowId || players.length < 2) return;
    setBusy(true);
    try {
      await rooms.start(roomRowId, players[0]?.id);
      // watch() will trigger onStartGame for everyone including host
    } catch (e: any) {
      setError(e?.message || 'Start nahin hua.');
      setBusy(false);
    }
  };

  const copy = () => {
    navigator.clipboard?.writeText(roomCode).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  // ── Show loader if auto-starting ─────────────────────────────────────────
  const autoStart = gameId ? mpSession.forGame(gameId) : mpSession.peek();
  if (autoStart) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white bg-[#121922] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
        <div className="text-sm text-gray-300 font-bold">Game start ho raha hai...</div>
        <div className="text-xs text-indigo-400 font-mono">{autoStart.roomId} · {autoStart.role.toUpperCase()}</div>
      </div>
    );
  }

  // ── MENU ─────────────────────────────────────────────────────────────────
  if (step === 'menu') {
    return (
      <div className="flex flex-col items-center justify-center p-6 h-full text-white bg-gradient-to-b from-[#1a2533] to-[#121922]">
        <button onClick={onBack} className="absolute top-5 left-5 flex items-center gap-2 text-gray-400 hover:text-white text-sm transition">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <Users className="w-16 h-16 text-indigo-400 mb-4 drop-shadow-[0_0_20px_rgba(99,102,241,0.5)]" />
        <h2 className="text-3xl font-black mb-1">{gameName}</h2>
        <p className="text-gray-500 text-sm mb-8 uppercase tracking-widest">Online Multiplayer</p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={handleCreate} disabled={busy}
            className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold shadow-lg active:scale-95 transition flex items-center justify-between disabled:opacity-50"
          >
            <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Room Banao</span>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="text-xs opacity-70">Host a game</span>}
          </button>
          <button
            onClick={() => setStep('join')}
            className="w-full py-4 px-5 rounded-2xl bg-[#1c2836] border border-gray-700 hover:border-indigo-400 text-white font-bold active:scale-95 transition flex items-center justify-between"
          >
            <span className="flex items-center gap-2"><KeyRound className="w-4 h-4 text-indigo-400" /> Room Join Karo</span>
            <span className="text-xs text-gray-500">Code daalo</span>
          </button>
        </div>
        {error && <p className="text-red-400 text-sm mt-4 text-center">{error}</p>}
      </div>
    );
  }

  // ── JOIN form ─────────────────────────────────────────────────────────────
  if (step === 'join' && !roomCode) {
    return (
      <div className="flex flex-col items-center justify-center p-6 h-full text-white bg-gradient-to-b from-[#1a2533] to-[#121922]">
        <button onClick={() => setStep('menu')} className="absolute top-5 left-5 flex items-center gap-2 text-gray-400 hover:text-white text-sm transition">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <h2 className="text-2xl font-black mb-6">Room Code Daalo</h2>
        <form onSubmit={handleJoin} className="w-full max-w-xs space-y-4">
          <input
            value={joinInput}
            onChange={e => { setJoinInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)); setError(''); }}
            placeholder="ABC123"
            maxLength={6}
            autoFocus
            className="w-full bg-[#121922] border border-gray-700 focus:border-indigo-400 outline-none rounded-2xl px-4 py-5 text-center text-4xl font-black font-mono tracking-[0.5em] text-white"
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={busy || joinInput.length < 4}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 transition"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <KeyRound className="w-5 h-5" />}
            {busy ? 'Join ho raha hai...' : 'Join Karo'}
          </button>
        </form>
      </div>
    );
  }

  // ── WAITING ROOM (create or join) ─────────────────────────────────────────
  const isHost = myRole === 'p1';
  const filled = players.length;
  const ready  = filled >= Math.min(maxPlayers, 2);

  return (
    <div className="flex flex-col items-center justify-center p-6 h-full text-white bg-gradient-to-b from-[#1a2533] to-[#121922]">
      <button onClick={() => { stopWatch(); setStep('menu'); setRoomCode(''); setPlayers([]); }} className="absolute top-5 left-5 flex items-center gap-2 text-gray-400 hover:text-white text-sm transition">
        <ArrowLeft className="w-4 h-4" /> Leave
      </button>
      <div className="w-full max-w-sm space-y-4">
        {/* Room code card */}
        <div className="bg-[#1c2836] rounded-3xl p-5 border border-indigo-500/30 shadow-xl text-center">
          <div className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-2">Room Code</div>
          <div className="text-5xl font-black font-mono tracking-[0.4em] text-white my-2">{roomCode}</div>
          <button onClick={copy} className="mt-2 w-full bg-[#121922] border border-gray-700 hover:border-indigo-400 rounded-xl py-2.5 text-sm font-bold text-indigo-300 flex items-center justify-center gap-2 transition">
            {copied ? <><Check className="w-4 h-4 text-green-400" /> Copied!</> : <><Copy className="w-4 h-4" /> Code Copy Karo</>}
          </button>
        </div>

        {/* Players */}
        <div className="bg-[#1c2836] rounded-2xl p-4 border border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-bold text-gray-300 flex items-center gap-2">
              <Users className="w-4 h-4" /> Players {filled}/{maxPlayers}
            </div>
            {!ready && <div className="text-xs text-blue-400 flex items-center gap-1"><Wifi className="w-3 h-3 animate-pulse" /> waiting...</div>}
          </div>
          <div className="space-y-2">
            {Array.from({ length: maxPlayers }).map((_, i) => {
              const p = players[i];
              const roleLabel = ROLES[i];
              return (
                <div key={i} className={`flex items-center gap-3 rounded-xl p-3 border ${p ? 'bg-[#121922] border-gray-700' : 'bg-[#121922]/40 border-dashed border-gray-800'}`}>
                  {p ? (
                    <>
                      <div className="w-9 h-9 rounded-full bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center font-black text-indigo-300">
                        {p.name?.[0]?.toUpperCase() ?? 'P'}
                      </div>
                      <div className="flex-1">
                        <div className="text-white font-bold text-sm flex items-center gap-1.5">
                          {p.name}
                          {roleLabel === 'p1' && <Crown className="w-3.5 h-3.5 text-yellow-400" />}
                          {p.id === me.id && <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-bold">YOU</span>}
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono">{roleLabel.toUpperCase()}</div>
                      </div>
                    </>
                  ) : (
                    <div className="text-gray-500 text-sm italic">Waiting for player {i + 1}...</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {error && <p className="text-red-400 text-sm text-center bg-red-500/10 border border-red-500/30 rounded-xl p-3">{error}</p>}

        {isHost ? (
          <button
            onClick={handleHostStart}
            disabled={!ready || busy}
            className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-black py-4 rounded-2xl disabled:opacity-40 shadow-xl flex items-center justify-center gap-2 active:scale-95 transition"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : '🎮'}
            {ready ? 'Game Start Karo!' : `${maxPlayers - filled} aur player ka wait...`}
          </button>
        ) : (
          <div className="text-center text-gray-400 text-sm py-3 flex items-center justify-center gap-2">
            <Wifi className="w-4 h-4 animate-pulse text-blue-400" />
            Host ke start karne ka intezaar karo...
          </div>
        )}
      </div>
    </div>
  );
}
