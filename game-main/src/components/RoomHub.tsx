import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft, Users, Copy, Check, Play, Wifi, Plus, KeyRound, Loader2,
  Crown, LogOut, AlertCircle,
} from 'lucide-react';
import { rooms, type RoomRow, type RoomPlayer } from '../lib/rooms';
import { mockBackend } from '../lib/mockBackend';
import { GAMES } from '../data';

interface Props {
  me: RoomPlayer;
  onLaunch: (room: RoomRow, myRole: 'p1' | 'p2' | 'p3' | 'p4') => void;
  onBack: () => void;
  // ✅ Telegram se aaya room code — seedha join karo
  autoJoinCode?: string;
}

type Step = 'home' | 'create' | 'join' | 'waiting' | 'joining';

const MP_READY_GAMES = ['tictactoe', 'rps', 'chess', 'wordchain', 'ludo', 'carrom'];

const PLAYER_OPTIONS_BY_GAME: Record<string, number[]> = {
  ludo: [2, 3, 4],
  carrom: [2, 4],
};

function playerOptionsFor(gameId: string): number[] {
  return PLAYER_OPTIONS_BY_GAME[gameId] ?? [2];
}

export default function RoomHub({ me, onLaunch, onBack, autoJoinCode }: Props) {
  const [step, setStep] = useState<Step>('home');
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>('');

  const mpGames = useMemo(() => GAMES.filter((g) => MP_READY_GAMES.includes(g.id)), []);
  const [pickedGame, setPickedGame] = useState<string>(mpGames[0]?.id ?? GAMES[0].id);
  const playerOpts = useMemo(() => playerOptionsFor(pickedGame), [pickedGame]);
  const [maxPlayers, setMaxPlayers] = useState<number>(playerOpts[0]);
  useEffect(() => { setMaxPlayers(playerOpts[0]); }, [pickedGame]); // eslint-disable-line

  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const launchedRef = useRef(false);

  // ✅ Auto-join: Telegram bot se code aaya to seedha join karo
  useEffect(() => {
    if (!autoJoinCode || autoJoinCode.length !== 6) return;
    setStep('joining');
    setBusy(true);
    setError('');

    rooms.join(autoJoinCode.toUpperCase(), me)
      .then((r) => {
        setRoom(r);
        mockBackend.joinRoom(r.code);
        setStep('waiting');
      })
      .catch((e: any) => {
        setError(e?.message || 'Room join nahi hua. Shayad room expire ho gaya.');
        setStep('home');
      })
      .finally(() => setBusy(false));
  }, [autoJoinCode]); // eslint-disable-line

  // Live room watch
  useEffect(() => {
    if (!room) return;
    const unsub = rooms.watch(room.id, (r) => {
      setRoom(r);
      if (r.status === 'playing' && !launchedRef.current) {
        launchedRef.current = true;
        const idx = (r.players || []).findIndex((p) => p.id === me.id);
        const role = (['p1', 'p2', 'p3', 'p4'][Math.max(0, idx)] || 'p1') as any;
        mockBackend.joinRoom(r.code);
        onLaunch(r, role);
      }
    });
    return () => unsub();
  }, [room?.id]); // eslint-disable-line

  const leaveRoom = async () => {
    if (room && !launchedRef.current) {
      try { await rooms.leave(room.id, me.id); } catch {}
    }
    mockBackend.leaveRoom();
    setRoom(null);
    setStep('home');
  };

  const handleCreate = async () => {
    setBusy(true); setError('');
    try {
      const r = await rooms.create({ gameId: pickedGame, maxPlayers, host: me });
      setRoom(r);
      mockBackend.joinRoom(r.code);
      setStep('waiting');

      // Telegram WebApp: bot ko notify karo room code ke saath
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.sendData) {
        try {
          tg.sendData(JSON.stringify({
            type: 'room_created',
            code: r.code,
            gameId: pickedGame,
            maxPlayers,
            hostName: me.name,
          }));
        } catch (_) {}
      }
    } catch (e: any) {
      setError(e?.message || 'Room nahin ban paya. Phir try karo.');
    } finally { setBusy(false); }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await rooms.join(joinCode.trim().toUpperCase(), me);
      setRoom(r);
      mockBackend.joinRoom(r.code);
      setStep('waiting');
    } catch (e: any) {
      setError(e?.message || 'Join nahin ho paya.');
    } finally { setBusy(false); }
  };

  const handleStart = async () => {
    if (!room) return;
    setBusy(true); setError('');
    try {
      const first = room.players[0]?.id ?? me.id;
      const r = await rooms.start(room.id, first);
      setRoom(r);
    } catch (e: any) {
      setError(e?.message || 'Start nahin ho paya.');
    } finally { setBusy(false); }
  };

  const copy = () => {
    if (!room) return;
    navigator.clipboard?.writeText(room.code).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  // ── Auto-joining loader ──────────────────────────────────────────────
  if (step === 'joining') {
    return (
      <Shell onBack={onBack} title="Room Join Ho Raha Hai...">
        <div className="flex flex-col items-center justify-center h-48 gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-indigo-400" />
          <p className="text-gray-400 text-sm">Room <span className="font-mono font-black text-white">{autoJoinCode}</span> mein ja rahe ho...</p>
          {error && <ErrorBox text={error} />}
        </div>
      </Shell>
    );
  }

  // ── Home ─────────────────────────────────────────────────────────────
  if (step === 'home') {
    return (
      <Shell onBack={onBack} title="Multiplayer" subtitle="Ek room banao ya code daal kar join karo">
        <div className="grid gap-4 w-full max-w-md mx-auto mt-6">
          <button
            onClick={() => setStep('create')}
            className="group bg-gradient-to-br from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 p-5 rounded-2xl text-left shadow-xl border border-white/10 active:scale-[0.98] transition"
          >
            <div className="flex items-center gap-3 mb-1">
              <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center"><Plus className="w-6 h-6 text-white" /></div>
              <div className="font-black text-white text-xl">Create Room</div>
            </div>
            <div className="text-white/80 text-sm">Game choose karo, max players set karo, code share karo.</div>
          </button>

          <button
            onClick={() => setStep('join')}
            className="group bg-[#1c2836] hover:border-indigo-400 p-5 rounded-2xl text-left shadow-xl border border-gray-700 active:scale-[0.98] transition"
          >
            <div className="flex items-center gap-3 mb-1">
              <div className="w-11 h-11 rounded-xl bg-indigo-500/15 flex items-center justify-center"><KeyRound className="w-6 h-6 text-indigo-400" /></div>
              <div className="font-black text-white text-xl">Join Room</div>
            </div>
            <div className="text-gray-400 text-sm">Dost ne jo 6-letter code diya hai, vo daalo.</div>
          </button>
        </div>
      </Shell>
    );
  }

  // ── Create ────────────────────────────────────────────────────────────
  if (step === 'create') {
    return (
      <Shell onBack={() => setStep('home')} title="Create Room" subtitle="Game aur players choose karo">
        <div className="max-w-md mx-auto w-full mt-4 space-y-5">
          <div>
            <Label>Game</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {mpGames.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setPickedGame(g.id)}
                  className={`text-left rounded-xl p-3 border transition active:scale-[0.98] ${
                    pickedGame === g.id
                      ? 'bg-indigo-500/15 border-indigo-400 ring-2 ring-indigo-400/40'
                      : 'bg-[#1c2836] border-gray-700 hover:border-gray-500'
                  }`}
                >
                  <div className={`text-white font-bold text-sm bg-gradient-to-r ${g.color} bg-clip-text text-transparent`}>{g.title}</div>
                  <div className="text-[11px] text-gray-400 line-clamp-2 mt-0.5">{g.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Max Players</Label>
            <div className="flex gap-2 mt-2">
              {playerOpts.map((n) => (
                <button
                  key={n}
                  onClick={() => setMaxPlayers(n)}
                  className={`flex-1 py-3 rounded-xl border font-black transition ${
                    maxPlayers === n
                      ? 'bg-indigo-500/15 border-indigo-400 text-white ring-2 ring-indigo-400/40'
                      : 'bg-[#1c2836] border-gray-700 text-gray-300 hover:border-gray-500'
                  }`}
                >
                  {n}P
                </button>
              ))}
            </div>
          </div>

          {error && <ErrorBox text={error} />}

          <button
            onClick={handleCreate}
            disabled={busy}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black py-4 rounded-2xl disabled:opacity-50 shadow-xl flex items-center justify-center gap-2 active:scale-95 transition"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            {busy ? 'Banaya jaa raha hai...' : 'Room Create Karo'}
          </button>
        </div>
      </Shell>
    );
  }

  // ── Join ──────────────────────────────────────────────────────────────
  if (step === 'join') {
    return (
      <Shell onBack={() => setStep('home')} title="Join Room" subtitle="6-letter room code daalo">
        <form onSubmit={handleJoin} className="max-w-md mx-auto w-full mt-6 space-y-4">
          <input
            value={joinCode}
            onChange={(e) => { setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)); setError(''); }}
            placeholder="ABC123"
            maxLength={6}
            autoFocus
            className="w-full bg-[#121922] border border-gray-700 focus:border-indigo-400 outline-none rounded-2xl px-4 py-5 text-center text-4xl font-black font-mono tracking-[0.5em] text-white"
          />
          {error && <ErrorBox text={error} />}
          <button
            type="submit"
            disabled={busy || joinCode.length < 4}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl disabled:opacity-50 shadow-xl flex items-center justify-center gap-2 active:scale-95 transition"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <KeyRound className="w-5 h-5" />}
            {busy ? 'Join ho rahe ho...' : 'Room Join Karo'}
          </button>
        </form>
      </Shell>
    );
  }

  // ── Waiting room ──────────────────────────────────────────────────────
  if (!room) return null;
  const gameDef = GAMES.find((g) => g.id === room.game_id);
  const isHost = room.host_id === me.id;
  const filled = room.players.length;
  const total = room.max_players;
  const ready = filled >= total;

  return (
    <Shell onBack={leaveRoom} backLabel="Leave" title="Room Lobby" subtitle={gameDef?.title ?? room.game_id}>
      <div className="max-w-md mx-auto w-full mt-4 space-y-4">
        <div className="bg-[#1c2836] rounded-3xl p-5 border border-indigo-500/30 shadow-xl">
          <div className="text-xs text-gray-400 font-bold uppercase tracking-widest text-center">Room Code</div>
          <div className="text-5xl font-black text-white text-center my-3 font-mono tracking-[0.4em]">{room.code}</div>
          <button onClick={copy} className="w-full bg-[#121922] border border-gray-700 hover:border-indigo-400 rounded-xl py-3 text-sm font-bold text-indigo-300 flex items-center justify-center gap-2 transition">
            {copied ? <><Check className="w-4 h-4 text-green-400" /> Copy Ho Gaya</> : <><Copy className="w-4 h-4" /> Code Copy Karo</>}
          </button>
        </div>

        <div className="bg-[#1c2836] rounded-2xl p-4 border border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-bold text-gray-300 flex items-center gap-2"><Users className="w-4 h-4" /> Players {filled}/{total}</div>
            {!ready && <div className="text-xs text-blue-400 flex items-center gap-1"><Wifi className="w-3 h-3 animate-pulse" /> waiting...</div>}
          </div>
          <div className="space-y-2">
            {Array.from({ length: total }).map((_, i) => {
              const p = room.players[i];
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
                          {p.id === room.host_id && <Crown className="w-3.5 h-3.5 text-yellow-400" />}
                          {p.id === me.id && <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-bold">YOU</span>}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-gray-500 text-sm italic">Waiting for player...</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {error && <ErrorBox text={error} />}

        {isHost ? (
          <button
            onClick={handleStart}
            disabled={!ready || busy}
            className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-black py-4 rounded-2xl disabled:opacity-40 shadow-xl flex items-center justify-center gap-2 active:scale-95 transition"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
            {ready ? 'Start Game' : `Wait for ${total - filled} more...`}
          </button>
        ) : (
          <div className="text-center text-gray-400 text-sm py-3">
            Host ke start karne ka wait karo...
          </div>
        )}

        <button onClick={leaveRoom} className="w-full text-gray-400 hover:text-red-400 text-sm py-2 flex items-center justify-center gap-1.5 transition">
          <LogOut className="w-4 h-4" /> Leave Room
        </button>
      </div>
    </Shell>
  );
}

function Shell({ children, onBack, backLabel = 'Back', title, subtitle }: { children: React.ReactNode; onBack: () => void; backLabel?: string; title: string; subtitle?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="p-5 pb-10 h-full overflow-y-auto bg-gradient-to-b from-[#1a2533] to-[#121922] text-white"
    >
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="w-10 h-10 rounded-xl bg-[#1c2836] border border-gray-700 hover:border-indigo-400 flex items-center justify-center transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <div className="text-xs text-indigo-400 font-bold uppercase tracking-widest">{backLabel === 'Leave' ? 'Lobby' : 'Multiplayer'}</div>
          <div className="text-2xl font-black">{title}</div>
          {subtitle && <div className="text-xs text-gray-400 -mt-0.5">{subtitle}</div>}
        </div>
      </div>
      {children}
    </motion.div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">{children}</div>;
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
      <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
      <div className="text-red-300 text-sm">{text}</div>
    </div>
  );
}
