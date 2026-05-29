import React, { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import { CircleDot, ArrowLeft, Users, Bot, Globe, Crown, Trophy, Zap, Star, User } from 'lucide-react';
import { mockBackend } from '../lib/mockBackend';
import { mpSession } from '../lib/mpSession';

// ─────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────
interface CarromProps {
  onGameOver: (score: number, result?: 'Win' | 'Loss' | 'Draw' | 'Completed') => void;
  onBack: () => void;
}

type Mode = 'menu' | 'bot' | 'local2' | 'local4' | 'online_lobby' | 'online_playing';
type Player = 'p1' | 'p2' | 'p3' | 'p4';

interface GameScores { p1: number; p2: number; p3: number; p4: number; }
interface CoinsLeft  { p1: number; p2: number; p3: number; p4: number; }
interface FoulInfo   { active: boolean; message: string; }

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────
const BW        = 420;
const BH        = 420;
const BOARD_PAD = 40;
const POCKET_R  = 22;
const COIN_R    = 11;
const STRIKER_R = 15;
const MAX_DRAG  = 130;
const MAX_FORCE = 0.09;
const TURN_TIME = 25;
const MAX_CONSEC_FOULS = 3;

const POINTS_COIN   = 10;
const POINTS_QUEEN  = 50;
const POINTS_QUEEN_COVER_BONUS = 2;

// 2-Player: p1 = bottom (white coins), p2 = top (black coins)
// Standard carrom: player sitting at bottom plays white, top plays black
// 4-Player: p1(bottom)+p3(left) = Team A (white), p2(top)+p4(right) = Team B (black)
const STRIKER_Y_2P: Record<string, number> = {
  p1: BH - BOARD_PAD - 32,
  p2: BOARD_PAD + 32,
};
const STRIKER_CONFIG_4P: Record<string, { x: number; y: number; axis: 'h' | 'v' }> = {
  p1: { x: BW / 2, y: BH - BOARD_PAD - 32, axis: 'h' },
  p2: { x: BW / 2, y: BOARD_PAD + 32,      axis: 'h' },
  p3: { x: BOARD_PAD + 32,      y: BH / 2, axis: 'v' },
  p4: { x: BW - BOARD_PAD - 32, y: BH / 2, axis: 'v' },
};

// 2P: p1=white, p2=black
// 4P: p1,p3=white (team), p2,p4=black (team)
function getPlayerCoinColor(player: Player, numPlayers: number): 'white' | 'black' {
  if (numPlayers === 4) {
    return (player === 'p1' || player === 'p3') ? 'white' : 'black';
  }
  return player === 'p1' ? 'white' : 'black';
}

function getTeamPlayers(player: Player, numPlayers: number): Player[] {
  if (numPlayers !== 4) return [player];
  return (player === 'p1' || player === 'p3') ? ['p1', 'p3'] : ['p2', 'p4'];
}

const COLORS = {
  board:   '#c8961c',
  border:  '#7c3e0c',
  pocket:  '#050505',
  white:   '#f0f0ee',
  black:   '#1a1a2e',
  queen:   '#dc2626',
  striker: '#9090c0',
};

const PLAYER_COLORS: Record<string, string> = {
  p1: '#f59e0b',
  p2: '#3b82f6',
  p3: '#10b981',
  p4: '#a855f7',
};

const PLAYER_NAMES_DEFAULT: Record<string, string> = {
  p1: 'Player 1', p2: 'Player 2', p3: 'Player 3', p4: 'Player 4',
};

// ─────────────────────────────────────────────
//  ONLINE LOBBY COMPONENT
// ─────────────────────────────────────────────
import { rooms as firebaseRooms, type RoomPlayer as FbRoomPlayer } from '../lib/rooms';
import { db as gameDb } from '../lib/db';

interface LobbyProps {
  onStartGame: (role: Player, roomId: string, numPlayers: number) => void;
  onBack: () => void;
}

function CarromOnlineLobby({ onStartGame, onBack }: LobbyProps) {
  const [step, setStep] = useState<'menu' | 'select_size' | 'create' | 'join_form' | 'waiting'>('menu');
  const [roomCode, setRoomCode] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [numPlayers, setNumPlayers] = useState<2 | 4>(2);
  const [players, setPlayers] = useState<FbRoomPlayer[]>([]);
  const [myRole, setMyRole] = useState<Player>('p1');
  const [roomRowId, setRoomRowId] = useState('');
  const [copied, setCopied] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);
  const launchedRef = useRef(false);

  const currentUser = gameDb.getUser();
  const me: FbRoomPlayer = { id: currentUser.id, name: currentUser.name, avatar: currentUser.avatar };

  const stopWatch = () => { if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; } };
  useEffect(() => () => stopWatch(), []);

  const startWatch = (rowId: string, code: string, role: Player, np: number) => {
    stopWatch();
    unsubRef.current = firebaseRooms.watch(rowId, (row) => {
      setPlayers(row.players || []);
      if (row.status === 'playing' && !launchedRef.current) {
        launchedRef.current = true;
        mockBackend.joinRoom(code);
        onStartGame(role, code, np);
      }
    });
  };

  const handleCreate = async (size: 2 | 4) => {
    setBusy(true); setError('');
    try {
      const row = await firebaseRooms.create({ gameId: 'carrom', maxPlayers: size, host: me });
      setRoomCode(row.code); setRoomRowId(row.id);
      setNumPlayers(size); setMyRole('p1'); setPlayers(row.players);
      mockBackend.joinRoom(row.code);
      startWatch(row.id, row.code, 'p1', size);
      setStep('waiting');
    } catch (e: any) { setError(e?.message || 'Room create nahin hua.'); }
    finally { setBusy(false); }
  };

  const handleJoin = async () => {
    const code = joinInput.trim().toUpperCase();
    if (!code) return;
    setBusy(true); setError('');
    try {
      const row = await firebaseRooms.join(code, me);
      const np = row.max_players as 2 | 4;
      const idx = row.players.findIndex(p => p.id === me.id);
      const role = (['p1','p2','p3','p4'] as Player[])[Math.max(0, idx)] || 'p2';
      setRoomCode(code); setRoomRowId(row.id);
      setNumPlayers(np); setMyRole(role); setPlayers(row.players);
      mockBackend.joinRoom(code);
      startWatch(row.id, code, role, np);
      setStep('waiting');
    } catch (e: any) { setError(e?.message || 'Join nahin hua. Code check karo.'); }
    finally { setBusy(false); }
  };

  const handleHostStart = async () => {
    if (!roomRowId) return;
    setBusy(true);
    try { await firebaseRooms.start(roomRowId, players[0]?.id); }
    catch (e: any) { setError(e?.message || 'Start nahin hua.'); setBusy(false); }
  };

  const copy = () => { navigator.clipboard?.writeText(roomCode).catch(()=>{}); setCopied(true); setTimeout(()=>setCopied(false),1500); };

  if (step === 'menu') return (
    <div className="flex flex-col items-center justify-center p-6 h-full text-white bg-gradient-to-b from-[#12181f] to-[#0a0e14]">
      <button onClick={onBack} className="absolute top-6 left-6 text-gray-400 hover:text-white transition font-medium text-sm">← Back</button>
      <Globe className="w-16 h-16 text-green-400 mb-4 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
      <h2 className="text-3xl font-black mb-1 text-white">Online Carrom</h2>
      <p className="text-gray-500 mb-8 text-xs tracking-widest uppercase">Multiplayer</p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button onClick={() => setStep('select_size')} className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-green-600 to-emerald-500 text-white font-bold shadow-lg active:scale-95 transition-all flex items-center justify-between">
          <span>Create Room</span><span className="text-xs opacity-70">Host a game</span>
        </button>
        <button onClick={() => setStep('join_form')} className="w-full py-4 px-5 rounded-2xl bg-gray-800 border border-gray-700 text-white font-bold active:scale-95 transition-all flex items-center justify-between">
          <span>Join Room</span><span className="text-xs opacity-70">Enter code</span>
        </button>
      </div>
    </div>
  );

  if (step === 'select_size') return (
    <div className="flex flex-col items-center justify-center p-6 h-full text-white bg-gradient-to-b from-[#12181f] to-[#0a0e14]">
      <button onClick={() => setStep('menu')} className="absolute top-6 left-6 text-gray-400 hover:text-white transition font-medium text-sm">← Back</button>
      <Crown className="w-12 h-12 text-yellow-400 mb-4" />
      <h2 className="text-2xl font-black mb-2 text-white">Game Size Chuno</h2>
      <p className="text-gray-500 mb-8 text-xs">Kitne players?</p>
      <div className="flex gap-4 w-full max-w-xs">
        <button onClick={() => handleCreate(2)} disabled={busy} className="flex-1 py-6 rounded-2xl bg-gradient-to-b from-blue-600 to-blue-700 text-white font-bold text-center active:scale-95 transition-all shadow-lg border border-blue-500/50 disabled:opacity-50">
          <div className="text-3xl font-black mb-1">2P</div><div className="text-xs opacity-70">2 Players</div>
        </button>
        <button onClick={() => handleCreate(4)} disabled={busy} className="flex-1 py-6 rounded-2xl bg-gradient-to-b from-purple-600 to-purple-700 text-white font-bold text-center active:scale-95 transition-all shadow-lg border border-purple-500/50 disabled:opacity-50">
          <div className="text-3xl font-black mb-1">4P</div><div className="text-xs opacity-70">4 Players</div>
        </button>
      </div>
      {busy && <div className="mt-4 text-blue-400 text-sm flex items-center gap-2"><div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>Room ban raha hai...</div>}
      {error && <p className="text-red-400 text-sm mt-4 text-center">{error}</p>}
    </div>
  );

  if (step === 'join_form') return (
    <div className="flex flex-col items-center justify-center p-6 h-full text-white bg-gradient-to-b from-[#12181f] to-[#0a0e14]">
      <button onClick={() => setStep('menu')} className="absolute top-6 left-6 text-gray-400 hover:text-white transition font-medium text-sm">← Back</button>
      <h2 className="text-2xl font-black mb-6 text-white">Room Code Daalo</h2>
      <div className="w-full max-w-xs space-y-4">
        <input value={joinInput} onChange={e => { setJoinInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6)); setError(''); }}
          placeholder="ABC123" maxLength={6} autoFocus
          className="w-full bg-[#0f1923] border border-gray-700 focus:border-indigo-400 outline-none rounded-2xl px-4 py-5 text-center text-4xl font-black font-mono tracking-[0.5em] text-white" />
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <button onClick={handleJoin} disabled={busy || joinInput.length < 4}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl disabled:opacity-50 active:scale-95 transition flex items-center justify-center gap-2">
          {busy ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Joining...</> : 'Join Game'}
        </button>
      </div>
    </div>
  );

  const isHost = myRole === 'p1';
  const filled = players.length;
  const ready = filled >= Math.min(numPlayers, 2);
  return (
    <div className="flex flex-col items-center justify-center p-6 h-full text-white bg-gradient-to-b from-[#12181f] to-[#0a0e14]">
      <button onClick={() => { stopWatch(); setStep('menu'); setRoomCode(''); setPlayers([]); }} className="absolute top-6 left-6 text-gray-400 hover:text-white text-sm transition">Cancel</button>
      <div className="bg-[#1c2836] p-6 rounded-3xl border border-green-500/30 shadow-2xl w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="text-xs text-gray-500 uppercase tracking-widest mb-1 font-bold">Room Code</div>
          <div className="text-5xl font-black text-white tracking-widest bg-[#0f1923] py-3 px-6 rounded-2xl border border-gray-700">{roomCode}</div>
          <button onClick={copy} className="mt-2 w-full bg-[#0f1923] border border-gray-700 hover:border-indigo-400 rounded-xl py-2 text-sm font-bold text-indigo-300 flex items-center justify-center gap-2 transition">
            {copied ? '✓ Copied!' : '📋 Copy Code'}
          </button>
        </div>
        <div className="text-xs text-gray-500 text-center">{numPlayers}P game · {filled}/{numPlayers} joined</div>
        <div className="space-y-2">
          {Array.from({ length: numPlayers }, (_, i) => {
            const p = players[i];
            const pKey = (['p1','p2','p3','p4'] as Player[])[i];
            return (
              <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${p ? 'border-green-500/40 bg-green-500/10' : 'border-gray-700/50 bg-gray-800/30'}`}>
                <div className="w-3 h-3 rounded-full" style={{ background: p ? PLAYER_COLORS[pKey] : '#374151' }}/>
                <span className="text-sm font-semibold" style={{ color: p ? PLAYER_COLORS[pKey] : '#6b7280' }}>
                  {p ? p.name : `Waiting for ${PLAYER_NAMES_DEFAULT[pKey]}...`}
                </span>
                {p && <span className="ml-auto text-green-400 text-xs">✓</span>}
              </div>
            );
          })}
        </div>
        {error && <p className="text-red-400 text-xs text-center">{error}</p>}
        {isHost ? (
          <button onClick={handleHostStart} disabled={!ready || busy}
            className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white font-black py-4 rounded-2xl disabled:opacity-40 flex items-center justify-center gap-2 active:scale-95 transition">
            {busy ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"/> : '🎮'}
            {ready ? 'Start Game!' : `${numPlayers - filled} aur player ka wait...`}
          </button>
        ) : (
          <div className="text-blue-400 text-sm text-center flex items-center justify-center gap-2">
            <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>
            Host ke start karne ka intezaar...
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  MAIN CARROM COMPONENT
// ─────────────────────────────────────────────
export default function Carrom({ onGameOver, onBack }: CarromProps) {

  // ── React State ───────────────────────────
  const [mode,   setMode]   = useState<Mode>('menu');
  const [role,   setRole]   = useState<Player | null>(null);
  const [roomId, setRoomId] = useState('');

  const [turn,   setTurn]   = useState<Player>('p1');
  const [scores, setScores] = useState<GameScores>({ p1: 0, p2: 0, p3: 0, p4: 0 });
  const [coinsLeft, setCoinsLeft] = useState<CoinsLeft>({ p1: 9, p2: 9, p3: 0, p4: 0 });
  const [disqualified, setDisqualified] = useState<Set<Player>>(new Set());
  const [winner, setWinner] = useState<Player | null>(null);
  const [timerVal, setTimerVal] = useState(TURN_TIME);
  const [power,  setPower]  = useState(0);
  const [foul,   setFoul]   = useState<FoulInfo>({ active: false, message: '' });
  const [statusMsg, setStatusMsg] = useState('Drag the striker to aim & shoot!');
  const [queenMsg,  setQueenMsg]  = useState('');
  const [extraTurnMsg, setExtraTurnMsg] = useState(false);
  const [consecutiveFouls, setConsecutiveFouls] = useState<Record<Player, number>>({ p1: 0, p2: 0, p3: 0, p4: 0 });
  const [queenStatus, setQueenStatus] = useState<'on_board' | 'pocketed' | 'covered'>('on_board');

  // ── Canvas Refs ───────────────────────────
  const boardCanvasRef = useRef<HTMLCanvasElement>(null);
  const aimCanvasRef   = useRef<HTMLCanvasElement>(null);
  const wrapRef        = useRef<HTMLDivElement>(null);

  // ── Physics Refs ──────────────────────────
  const engineRef  = useRef<Matter.Engine | null>(null);
  const runnerRef  = useRef<Matter.Runner | null>(null);

  const strikerRef    = useRef<Matter.Body | null>(null);
  const coinBodiesRef = useRef<Matter.Body[]>([]);
  const pocketedSet   = useRef<Set<number>>(new Set());

  // ── Game State Refs ────────────────────────
  const turnRef              = useRef<Player>('p1');
  const canShootRef          = useRef(true);
  const isMovingRef          = useRef(false);
  // extraTurnRef: true = current player gets another turn
  const extraTurnRef         = useRef(false);
  // foulThisTurnRef: if ANY foul happened this turn, extra turn is cancelled and turn passes
  const foulThisTurnRef      = useRef(false);
  const queenPocketed        = useRef(false);
  const queenCovered         = useRef(false);
  const queenOwner           = useRef<Player | null>(null);
  // queenCoverGraceRef: 1 = queen pocketed this shot (cover can happen same shot or next shot)
  //                     0 = grace used, if not covered → queen returns
  const queenCoverGraceRef   = useRef(0);
  const modeRef              = useRef<Mode>('menu');
  const roleRef              = useRef<Player | null>(null);
  const roomIdRef            = useRef('');
  const scoresRef            = useRef<GameScores>({ p1: 0, p2: 0, p3: 0, p4: 0 });
  const coinsLeftRef         = useRef<CoinsLeft>({ p1: 9, p2: 9, p3: 0, p4: 0 });
  const disqualifiedRef      = useRef<Set<Player>>(new Set());
  const consecutiveFoulsRef  = useRef<Record<Player, number>>({ p1: 0, p2: 0, p3: 0, p4: 0 });
  const numPlayersRef        = useRef(2);
  // strikerPocketed this turn?
  const strikerFoulRef       = useRef(false);
  // opponent coin pocketed this turn?
  const oppCoinFoulRef       = useRef(false);
  // Did we pocket any own coin this turn?
  const ownCoinPocketedRef   = useRef(false);

  const strikerSlideRef = useRef(0.5);
  const isDraggingRef  = useRef(false);
  const dragCurrentRef = useRef<{ x: number; y: number } | null>(null);

  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerValRef = useRef(TURN_TIME);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const scaleRef = useRef(1);

  // keep refs in sync
  useEffect(() => { turnRef.current = turn; }, [turn]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { roleRef.current = role; }, [role]);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);
  useEffect(() => { scoresRef.current = scores; }, [scores]);
  useEffect(() => { coinsLeftRef.current = coinsLeft; }, [coinsLeft]);
  useEffect(() => { disqualifiedRef.current = disqualified; }, [disqualified]);
  useEffect(() => { consecutiveFoulsRef.current = consecutiveFouls; }, [consecutiveFouls]);

  // ─────────────────────────────────────────
  //  AUDIO
  // ─────────────────────────────────────────
  function getAudio() {
    if (!audioCtxRef.current)
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return audioCtxRef.current;
  }

  function playSound(type: 'shoot' | 'pocket' | 'foul' | 'win' | 'tick' | 'disq' | 'border', powerVal = 0.5) {
    try {
      const ctx = getAudio();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      const now = ctx.currentTime;
      if (type === 'shoot') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180 + powerVal * 400, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.18);
        gain.gain.setValueAtTime(0.35 * powerVal, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now); osc.stop(now + 0.25);
      } else if (type === 'pocket') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(700, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.35);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now); osc.stop(now + 0.42);
      } else if (type === 'border') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.2);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now); osc.stop(now + 0.28);
      } else if (type === 'foul') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now); osc.stop(now + 0.38);
      } else if (type === 'disq') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.6);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        osc.start(now); osc.stop(now + 0.75);
      } else if (type === 'win') {
        [0, 0.15, 0.3, 0.5].forEach((delay, i) => {
          const o2 = ctx.createOscillator(), g2 = ctx.createGain();
          o2.connect(g2); g2.connect(ctx.destination);
          o2.type = 'sine'; o2.frequency.value = [523, 659, 784, 1047][i];
          g2.gain.setValueAtTime(0.3, now + delay);
          g2.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.4);
          o2.start(now + delay); o2.stop(now + delay + 0.45);
        }); return;
      } else if (type === 'tick') {
        osc.type = 'square'; osc.frequency.value = 440;
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.start(now); osc.stop(now + 0.08);
      }
    } catch (_) {}
  }

  // ─────────────────────────────────────────
  //  HELPERS
  // ─────────────────────────────────────────
  function getActivePlayers(): Player[] {
    const all: Player[] = numPlayersRef.current === 4
      ? ['p1', 'p2', 'p3', 'p4']
      : ['p1', 'p2'];
    return all.filter(p => !disqualifiedRef.current.has(p));
  }

  // 4P: clockwise order p1→p2→p3→p4→p1 (but p1&p3 opposite, p2&p4 opposite)
  // Actual clockwise seating: bottom=p1, right=p4, top=p2, left=p3
  function getNextPlayer(cur: Player): Player {
    const clockwise: Player[] = numPlayersRef.current === 4
      ? ['p1', 'p4', 'p2', 'p3']  // clockwise: bottom→right→top→left
      : ['p1', 'p2'];
    const active = clockwise.filter(p => !disqualifiedRef.current.has(p));
    if (active.length === 0) return cur;
    const idx = active.indexOf(cur);
    return active[(idx + 1) % active.length];
  }

  function getStrikerPosition(player: Player): { x: number; y: number } {
    const slide = strikerSlideRef.current;
    const numP  = numPlayersRef.current;

    if (numP === 2) {
      const sy = STRIKER_Y_2P[player] ?? BH / 2;
      const minX = BOARD_PAD + STRIKER_R + 10;
      const maxX = BW - BOARD_PAD - STRIKER_R - 10;
      return { x: minX + (maxX - minX) * slide, y: sy };
    } else {
      const cfg = STRIKER_CONFIG_4P[player];
      if (!cfg) return { x: BW / 2, y: BH / 2 };
      if (cfg.axis === 'h') {
        const minX = BOARD_PAD + STRIKER_R + 10;
        const maxX = BW - BOARD_PAD - STRIKER_R - 10;
        return { x: minX + (maxX - minX) * slide, y: cfg.y };
      } else {
        const minY = BOARD_PAD + STRIKER_R + 10;
        const maxY = BH - BOARD_PAD - STRIKER_R - 10;
        return { x: cfg.x, y: minY + (maxY - minY) * slide };
      }
    }
  }

  // ─────────────────────────────────────────
  //  BOARD RENDERING
  // ─────────────────────────────────────────
  function renderBoard() {
    const canvas = boardCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const s = scaleRef.current;
    const bp = BOARD_PAD * s;

    ctx.clearRect(0, 0, W, H);

    // Board surface
    const grad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W * 0.72);
    grad.addColorStop(0, '#d4a820');
    grad.addColorStop(0.55, '#b8860b');
    grad.addColorStop(1, '#7c5a08');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Wood grain
    ctx.save(); ctx.globalAlpha = 0.07; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    for (let i = 0; i < W; i += 10) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 5, H); ctx.stroke();
    }
    ctx.restore();

    // Border
    ctx.strokeStyle = '#7c3e0c'; ctx.lineWidth = 3;
    ctx.strokeRect(bp, bp, W - bp*2, H - bp*2);
    ctx.strokeStyle = '#5c2a07'; ctx.lineWidth = 1;
    ctx.strokeRect(bp+5, bp+5, W - bp*2 - 10, H - bp*2 - 10);

    // Pockets
    const corners: [number, number][] = [
      [bp, bp], [W-bp, bp], [bp, H-bp], [W-bp, H-bp]
    ];
    corners.forEach(([cx2, cy2]) => {
      const pg = ctx.createRadialGradient(cx2, cy2, 2, cx2, cy2, POCKET_R * s);
      pg.addColorStop(0, '#111'); pg.addColorStop(1, '#000');
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(cx2, cy2, POCKET_R * s, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#3d1a00'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx2, cy2, POCKET_R * s + 4, 0, Math.PI*2); ctx.stroke();
    });

    // Center markings
    const cx = W/2, cy = H/2;
    ctx.strokeStyle = 'rgba(90,45,5,0.5)'; ctx.lineWidth = 1.5;
    [5, 11, 20, 34].forEach(r => {
      ctx.beginPath(); ctx.arc(cx, cy, r*s, 0, Math.PI*2); ctx.stroke();
    });
    ctx.fillStyle = 'rgba(90,45,5,0.55)';
    ctx.beginPath(); ctx.arc(cx, cy, 4*s, 0, Math.PI*2); ctx.fill();

    // Diagonals
    ctx.strokeStyle = 'rgba(90,45,5,0.28)'; ctx.lineWidth = 1;
    [[cx,cy,bp+28,bp+28],[cx,cy,W-bp-28,bp+28],[cx,cy,bp+28,H-bp-28],[cx,cy,W-bp-28,H-bp-28]].forEach(([x1,y1,x2,y2]) => {
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    });

    // Striker lane indicators
    const activeTurn = turnRef.current;
    const numP = numPlayersRef.current;
    ctx.setLineDash([5, 7]); ctx.lineWidth = 1.5;

    if (numP === 2) {
      const lp1 = STRIKER_Y_2P.p1 * s;
      const lp2 = STRIKER_Y_2P.p2 * s;
      ctx.strokeStyle = activeTurn === 'p1' ? `rgba(245,158,11,0.7)` : 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.moveTo(bp+15, lp1); ctx.lineTo(W-bp-15, lp1); ctx.stroke();
      ctx.strokeStyle = activeTurn === 'p2' ? `rgba(59,130,246,0.7)` : 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.moveTo(bp+15, lp2); ctx.lineTo(W-bp-15, lp2); ctx.stroke();
    } else {
      (['p1','p2','p3','p4'] as Player[]).forEach(p => {
        const cfg = STRIKER_CONFIG_4P[p];
        ctx.strokeStyle = activeTurn === p ? PLAYER_COLORS[p] + 'bb' : 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        if (cfg.axis === 'h') {
          ctx.moveTo(bp+15, cfg.y*s); ctx.lineTo(W-bp-15, cfg.y*s);
        } else {
          ctx.moveTo(cfg.x*s, bp+15); ctx.lineTo(cfg.x*s, H-bp-15);
        }
        ctx.stroke();
      });
    }
    ctx.setLineDash([]);

    // Draw bodies
    if (!engineRef.current) return;
    const bodies = Matter.Composite.allBodies(engineRef.current.world);

    for (const body of bodies) {
      if (pocketedSet.current.has(body.id)) continue;
      const { label } = body;
      if (label === 'wall' || label === 'pocket' || label === 'border_sensor') continue;
      const bx = body.position.x * s;
      const by = body.position.y * s;

      if (label === 'striker') {
        const isActive = canShootRef.current && !isMovingRef.current;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
        const sg = ctx.createRadialGradient(bx-3*s, by-3*s, 1, bx, by, STRIKER_R*s);
        sg.addColorStop(0, '#d0d0ff'); sg.addColorStop(0.5, '#9090c0'); sg.addColorStop(1, '#505080');
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(bx, by, STRIKER_R*s, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.strokeStyle = isActive ? '#c0c0ff' : '#666688';
        ctx.lineWidth = isActive ? 2.5 : 1;
        ctx.beginPath(); ctx.arc(bx, by, STRIKER_R*s, 0, Math.PI*2); ctx.stroke();
        ctx.strokeStyle = 'rgba(160,160,220,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(bx, by, STRIKER_R*s*0.55, 0, Math.PI*2); ctx.stroke();
        if (isActive) {
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = PLAYER_COLORS[turnRef.current] || '#8080ff';
          ctx.beginPath(); ctx.arc(bx, by, STRIKER_R*s+7, 0, Math.PI*2); ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.restore();
        continue;
      }

      ctx.save();
      let fillGrad: CanvasGradient;
      let outlineCol: string, innerCol: string;
      if (label === 'queen') {
        fillGrad = ctx.createRadialGradient(bx-2*s, by-2*s, 1, bx, by, COIN_R*s);
        fillGrad.addColorStop(0, '#ff6666'); fillGrad.addColorStop(1, '#cc2020');
        outlineCol = '#8b0000'; innerCol = 'rgba(255,180,180,0.55)';
      } else if (label === 'white') {
        fillGrad = ctx.createRadialGradient(bx-2*s, by-2*s, 1, bx, by, COIN_R*s);
        fillGrad.addColorStop(0, '#ffffff'); fillGrad.addColorStop(1, '#d0d0d0');
        outlineCol = '#999'; innerCol = 'rgba(100,100,100,0.35)';
      } else {
        fillGrad = ctx.createRadialGradient(bx-2*s, by-2*s, 1, bx, by, COIN_R*s);
        fillGrad.addColorStop(0, '#3a3a5e'); fillGrad.addColorStop(1, '#0e0e20');
        outlineCol = '#000'; innerCol = 'rgba(100,100,160,0.4)';
      }
      ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
      ctx.fillStyle = fillGrad;
      ctx.beginPath(); ctx.arc(bx, by, COIN_R*s, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.strokeStyle = outlineCol; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = innerCol; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(bx, by, COIN_R*s*0.52, 0, Math.PI*2); ctx.stroke();
      if (label === 'queen') {
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath(); ctx.arc(bx, by, 3*s, 0, Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }

    // Queen cover reminder
    if (queenPocketed.current && !queenCovered.current) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.font = `bold ${14*s}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fbbf24';
      ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
      ctx.fillText('Queen Cover Karo!', W/2, bp + 22*s);
      ctx.restore();
    }
  }

  // ─────────────────────────────────────────
  //  AIM RENDERING
  // ─────────────────────────────────────────
  function renderAim() {
    const canvas = aimCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!isDraggingRef.current || !dragCurrentRef.current || !strikerRef.current) return;

    const s  = scaleRef.current;
    const sx = strikerRef.current.position.x * s;
    const sy = strikerRef.current.position.y * s;
    const tx = dragCurrentRef.current.x * s;
    const ty = dragCurrentRef.current.y * s;
    const dx = sx - tx, dy = sy - ty;
    const dist = Math.hypot(dx, dy);
    if (dist < 4) return;

    const nx = dx / dist, ny = dy / dist;
    const powerVal = Math.min(dist / (MAX_DRAG * s), 1);

    ctx.save();
    ctx.globalAlpha = 0.22; ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 10; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke();

    const lineLen = (60 + powerVal * 220) * s;
    const ex = sx + nx * lineLen, ey = sy + ny * lineLen;
    ctx.globalAlpha = 0.92; ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();

    drawPrediction(ctx, ex, ey, nx, ny, powerVal, s, canvas.width, canvas.height);
    drawCollisionPreview(ctx, sx, sy, nx, ny, s);

    const pColor = powerVal > 0.75 ? '#ef4444' : powerVal > 0.42 ? '#f59e0b' : '#10b981';
    ctx.globalAlpha = 1; ctx.fillStyle = pColor;
    ctx.shadowColor = pColor; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(ex, ey, 5.5, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function drawPrediction(ctx: CanvasRenderingContext2D, startX: number, startY: number, nx: number, ny: number, powerVal: number, s: number, W: number, H: number) {
    const bp = BOARD_PAD * s;
    const minX = bp, maxX = W - bp, minY = bp, maxY = H - bp;
    let px = startX, py = startY, vx = nx, vy = ny;
    const step = 9;
    const dotCount = Math.floor(powerVal * 28) + 8;
    ctx.save();
    ctx.globalAlpha = 0.5; ctx.setLineDash([5, 9]);
    ctx.strokeStyle = 'rgba(255,215,80,0.7)'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px, py);
    for (let i = 0; i < dotCount; i++) {
      px += vx * step; py += vy * step;
      if (px <= minX || px >= maxX) { vx = -vx; px = Math.max(minX+1, Math.min(maxX-1, px)); }
      if (py <= minY || py >= maxY) { vy = -vy; py = Math.max(minY+1, Math.min(maxY-1, py)); }
      ctx.lineTo(px, py);
    }
    ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  }

  function drawCollisionPreview(ctx: CanvasRenderingContext2D, startX: number, startY: number, nx: number, ny: number, s: number) {
    if (!engineRef.current) return;
    const sr = STRIKER_R * s;
    const step = 4; const maxSteps = 200;
    let px = startX, py = startY;
    for (let i = 0; i < maxSteps; i++) {
      px += nx * step; py += ny * step;
      const bodies = Matter.Composite.allBodies(engineRef.current.world);
      for (const coin of bodies) {
        if (pocketedSet.current.has(coin.id)) continue;
        if (!['white','black','queen'].includes(coin.label)) continue;
        const cx2 = coin.position.x * s, cy2 = coin.position.y * s;
        const cr  = COIN_R * s;
        if (Math.hypot(px-cx2, py-cy2) < sr+cr) {
          ctx.save();
          ctx.globalAlpha = 0.55; ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2; ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 6;
          ctx.beginPath(); ctx.arc(cx2, cy2, cr+4, 0, Math.PI*2); ctx.stroke();
          ctx.restore(); return;
        }
      }
    }
  }

  // ─────────────────────────────────────────
  //  PHYSICS INIT
  // ─────────────────────────────────────────
  function initPhysics() {
    if (engineRef.current) {
      Matter.Runner.stop(runnerRef.current!);
      Matter.Engine.clear(engineRef.current);
    }
    pocketedSet.current.clear();
    coinBodiesRef.current = [];
    strikerFoulRef.current = false;
    oppCoinFoulRef.current = false;
    ownCoinPocketedRef.current = false;

    const engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
    const runner = Matter.Runner.create();
    engineRef.current = engine;
    runnerRef.current = runner;

    // Walls
    const wOpts = { isStatic: true, restitution: 0.76, friction: 0, label: 'wall' };
    const hp = BOARD_PAD / 2;
    const walls = [
      Matter.Bodies.rectangle(BW/2, hp,       BW, BOARD_PAD, wOpts),
      Matter.Bodies.rectangle(BW/2, BH-hp,    BW, BOARD_PAD, wOpts),
      Matter.Bodies.rectangle(hp,      BH/2,  BOARD_PAD, BH, wOpts),
      Matter.Bodies.rectangle(BW-hp,   BH/2,  BOARD_PAD, BH, wOpts),
    ];

    // Pockets
    const pocketCorners = [
      { x: BOARD_PAD, y: BOARD_PAD },
      { x: BW-BOARD_PAD, y: BOARD_PAD },
      { x: BOARD_PAD, y: BH-BOARD_PAD },
      { x: BW-BOARD_PAD, y: BH-BOARD_PAD },
    ];
    const pockets = pocketCorners.map(c =>
      Matter.Bodies.circle(c.x, c.y, POCKET_R, { isStatic: true, isSensor: true, label: 'pocket' })
    );

    // Coins — standard carrom setup: queen center, 6 inner ring alternating, 12 outer ring alternating
    const coinOpts = (label: string) => ({
      restitution: 0.72, friction: 0.04, frictionAir: 0.016, density: 0.002, label,
    });
    const cx = BW/2, cy = BH/2;
    const coins: Matter.Body[] = [];
    coins.push(Matter.Bodies.circle(cx, cy, COIN_R, coinOpts('queen')));
    // Inner ring: 6 coins alternating white/black
    for (let i = 0; i < 6; i++) {
      const a = (i/6) * Math.PI * 2;
      coins.push(Matter.Bodies.circle(
        cx + Math.cos(a)*COIN_R*2.4, cy + Math.sin(a)*COIN_R*2.4,
        COIN_R, coinOpts(i%2===0 ? 'white' : 'black')
      ));
    }
    // Outer ring: 12 coins alternating black/white
    for (let i = 0; i < 12; i++) {
      const a = (i/12)*Math.PI*2 + Math.PI/12;
      coins.push(Matter.Bodies.circle(
        cx + Math.cos(a)*COIN_R*4.6, cy + Math.sin(a)*COIN_R*4.6,
        COIN_R, coinOpts(i%2===0 ? 'black' : 'white')
      ));
    }
    coinBodiesRef.current = coins;

    // Striker
    const sPos = getStrikerPosition(turnRef.current);
    const striker = Matter.Bodies.circle(sPos.x, sPos.y, STRIKER_R, {
      restitution: 0.78, friction: 0.05, frictionAir: 0.022, density: 0.005, label: 'striker',
    });
    strikerRef.current = striker;

    Matter.Composite.add(engine.world, [...walls, ...pockets, ...coins, striker]);

    // Collision events
    Matter.Events.on(engine, 'collisionStart', (evt: Matter.IEventCollision<Matter.Engine>) => {
      for (const pair of evt.pairs) {
        const { bodyA, bodyB } = pair;
        // Wall bounce sound
        if ((bodyA.label === 'wall' && bodyB.label === 'striker') ||
            (bodyB.label === 'wall' && bodyA.label === 'striker')) {
          playSound('border');
        }
        const pocket = bodyA.label === 'pocket' ? bodyA : bodyB.label === 'pocket' ? bodyB : null;
        const coin   = pocket === bodyA ? bodyB : pocket === bodyB ? bodyA : null;
        if (pocket && coin) handlePocket(coin);
      }
    });

    // Movement stop detection
    Matter.Events.on(engine, 'afterUpdate', () => {
      if (!isMovingRef.current) return;
      const allBodies = Matter.Composite.allBodies(engine.world);
      const moving = allBodies.some((b: Matter.Body) => {
        if (b.isStatic) return false;
        const v = b.velocity, av = b.angularVelocity;
        return (v.x*v.x + v.y*v.y) > 0.008 || Math.abs(av) > 0.008;
      });
      if (!moving) {
        isMovingRef.current = false;
        setTimeout(afterShot, 250);
      }
    });

    Matter.Runner.run(runner, engine);
  }

  // ─────────────────────────────────────────
  //  PENALTY — return a coin to center
  // ─────────────────────────────────────────
  function returnCoinToBoard(label: string) {
    if (!engineRef.current) return;

    // Safety check: don't return if no coin of this type is pocketed
    const pocketedOfType = coinBodiesRef.current.filter(
      b => pocketedSet.current.has(b.id) && b.label === label
    );
    if (pocketedOfType.length === 0) return;

    // Count coins currently on board of this type
    const MAX_OF_TYPE = label === 'queen' ? 1 : 9;
    const onBoard = coinBodiesRef.current.filter(
      b => !pocketedSet.current.has(b.id) && b.label === label && b.id !== (strikerRef.current?.id ?? -1)
    ).length;
    if (onBoard >= MAX_OF_TYPE) return; // already at max, no need to return

    // Un-pocket one coin of this type (reuse existing body to avoid ID issues)
    const toReturn = pocketedOfType[0];
    pocketedSet.current.delete(toReturn.id);

    const offsetX = (Math.random() - 0.5) * COIN_R * 3;
    const offsetY = (Math.random() - 0.5) * COIN_R * 3;
    // Place near center
    Matter.Body.setPosition(toReturn, { x: BW/2 + offsetX, y: BH/2 + offsetY });
    Matter.Body.setVelocity(toReturn, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(toReturn, 0);
    // Re-add to world (it was removed earlier)
    try { Matter.Composite.add(engineRef.current.world, toReturn); } catch (_) {}
  }

  // ─────────────────────────────────────────
  //  POCKET HANDLING
  //  KEY RULES:
  //  1. Striker pocketed → FOUL (striker foul), penalty coin returns, turn passes
  //  2. Own coin pocketed → extra turn, points scored
  //  3. Opponent coin pocketed → FOUL, they get the points, turn passes
  //  4. Queen pocketed → must cover same shot or next shot
  //     - If covered same shot (own coin also pocketed this shot) → queen covered, extra turn
  //     - If not covered same shot → get one more shot to cover
  //     - If cover shot fails → queen returns to center
  //  5. Moving coins ke time second shot = NOT applicable here (single striker model)
  //  6. Bina coin touch kiye (air shot) = foul → handled in afterShot
  // ─────────────────────────────────────────
  function handlePocket(body: Matter.Body) {
    if (pocketedSet.current.has(body.id)) return;
    pocketedSet.current.add(body.id);
    playSound('pocket');

    Matter.Body.setPosition(body, { x: -800, y: -800 });
    Matter.Body.setVelocity(body, { x: 0, y: 0 });
    spawnParticles(body.position.x, body.position.y, body.label);

    const label = body.label;
    const cur   = turnRef.current;
    const numP  = numPlayersRef.current;

    // ── STRIKER POCKETED → Foul ──
    if (label === 'striker') {
      strikerFoulRef.current = true;
      foulThisTurnRef.current = true;
      extraTurnRef.current = false; // foul cancels extra turn
      playSound('foul');
      showFoul('⚠️ FOUL — Striker pocket hua! Ek coin wapas aayega.');
      // Move striker off-screen but DO NOT remove from world
      // resetStriker() will bring it back to the lane
      Matter.Body.setPosition(body, { x: -800, y: -800 });
      Matter.Body.setVelocity(body, { x: 0, y: 0 });
      // Penalty: one previously pocketed own coin returns (only if any pocketed)
      const myColorForPenalty = getPlayerCoinColor(cur, numP);
      const anyPocketed = coinBodiesRef.current.some(
        b => pocketedSet.current.has(b.id) && b.label === myColorForPenalty
      );
      if (anyPocketed) {
        setTimeout(() => returnCoinToBoard(myColorForPenalty), 400);
      }
      return;
    }

    const myColor  = getPlayerCoinColor(cur, numP);

    // ── QUEEN POCKETED ──
    if (label === 'queen') {
      // ANY player can pocket queen
      queenPocketed.current = true;
      queenCovered.current  = false;
      queenOwner.current    = cur;
      queenCoverGraceRef.current = 1; // will get one more shot to cover if not same shot
      // Don't set extraTurn yet — we need to see if own coin is also pocketed this shot
      // extraTurn will be set in afterShot if queen was pocketed
      setQueenStatus('pocketed');
      setQueenMsg('👑 Queen pocket hua! Usi shot ya agli shot mein apna coin pocket karo.');
      setTimeout(() => setQueenMsg(''), 3500);
      setTimeout(() => {
        Matter.Body.setPosition(body, { x: -900, y: -900 });
        Matter.Body.setVelocity(body, { x: 0, y: 0 });
      }, 80);
      return;
    }

    // ── OWN COIN POCKETED ──
    if (label === myColor) {
      ownCoinPocketedRef.current = true;
      const pts = POINTS_COIN;

      // Check if this covers the queen
      let queenCoverBonus = 0;
      if (queenPocketed.current && !queenCovered.current && queenOwner.current === cur) {
        queenCovered.current = true;
        queenCoverGraceRef.current = 0;
        queenCoverBonus = POINTS_QUEEN + POINTS_QUEEN_COVER_BONUS;
        setQueenStatus('covered');
        setQueenMsg(`👑 Queen cover! +${POINTS_QUEEN} + ${POINTS_QUEEN_COVER_BONUS} bonus pts!`);
        setTimeout(() => setQueenMsg(''), 3000);
      }

      setScores(prev => {
        const next = { ...prev };
        next[cur] += pts + queenCoverBonus;
        scoresRef.current = next;
        return next;
      });

      // In 4P mode, update team coin count: coins are shared between teammates
      // We track per-player coin count, but winning condition checks the team
      // Own coin pocketed → extra turn (unless foul also happened)
      if (!foulThisTurnRef.current) {
        extraTurnRef.current = true;
      }
      resetConsecutiveFouls(cur);
      setExtraTurnMsg(true);
      setTimeout(() => setExtraTurnMsg(false), 1200);

    } else {
      // ── OPPONENT COIN POCKETED → FOUL ──
      // Foul rule: pocketing opponent's coin = foul, turn passes
      // But opponent gets the points for their coin
      oppCoinFoulRef.current = true;
      foulThisTurnRef.current = true;
      extraTurnRef.current = false; // cancel extra turn

      // Determine which player owns this coin
      let coinOwner: Player = cur === 'p1' ? 'p2' : 'p1';
      if (numP === 4) {
        const allPlayers: Player[] = ['p1', 'p2', 'p3', 'p4'];
        coinOwner = allPlayers.find(p => getPlayerCoinColor(p, numP) === label) ?? coinOwner;
      }

      const pts = POINTS_COIN;
      setScores(prev => {
        const next = { ...prev };
        next[coinOwner] += pts;
        scoresRef.current = next;
        return next;
      });
      playSound('foul');
      showFoul(`⚠️ FOUL — ${label === 'white' ? '⚪' : '⚫'} Opponent ka coin pocket hua! Turn jaata hai.`);
    }

    // Move coin off-screen (keep in world so returnCoinToBoard can reuse it)
    setTimeout(() => {
      Matter.Body.setPosition(body, { x: -800 - Math.random()*100, y: -800 - Math.random()*100 });
      Matter.Body.setVelocity(body, { x: 0, y: 0 });
      Matter.Body.setAngularVelocity(body, 0);
    }, 80);
  }

  // ─────────────────────────────────────────
  //  FOUL TRACKING
  // ─────────────────────────────────────────
  function addConsecutiveFoul(player: Player) {
    consecutiveFoulsRef.current = {
      ...consecutiveFoulsRef.current,
      [player]: consecutiveFoulsRef.current[player] + 1,
    };
    setConsecutiveFouls({ ...consecutiveFoulsRef.current });

    const fouls = consecutiveFoulsRef.current[player];
    if (fouls >= MAX_CONSEC_FOULS) {
      disqualifyPlayer(player);
    }
  }

  function resetConsecutiveFouls(player: Player) {
    consecutiveFoulsRef.current = { ...consecutiveFoulsRef.current, [player]: 0 };
    setConsecutiveFouls({ ...consecutiveFoulsRef.current });
  }

  function disqualifyPlayer(player: Player) {
    playSound('disq');
    const newDisq = new Set(disqualifiedRef.current);
    newDisq.add(player);
    disqualifiedRef.current = newDisq;
    setDisqualified(new Set(newDisq));
    showFoul(`🚫 ${PLAYER_NAMES_DEFAULT[player]} DISQUALIFIED! 3 fouls!`);

    const remaining = getActivePlayers().filter(p => p !== player);
    if (remaining.length === 1) {
      setTimeout(() => triggerWin(remaining[0]), 1000);
    } else if (remaining.length === 0) {
      setTimeout(() => onGameOver(0, 'Completed'), 1000);
    }
  }

  // ─────────────────────────────────────────
  //  AFTER SHOT — resolve queen grace, check fouls, decide turn
  // ─────────────────────────────────────────
  function afterShot() {
    const cur = turnRef.current;

    // Queen cover logic
    if (queenPocketed.current && !queenCovered.current && !strikerFoulRef.current) {
      if (queenCoverGraceRef.current > 0) {
        // Queen was pocketed this shot but NOT covered same shot
        // → consume grace: player gets one more shot to cover
        queenCoverGraceRef.current = 0;
        // Give extra turn to cover (unless foul happened)
        if (!foulThisTurnRef.current) {
          extraTurnRef.current = true;
          setQueenMsg('👑 Queen cover karne ka mauka! Apna coin pocket karo.');
          setTimeout(() => setQueenMsg(''), 2500);
        }
      } else {
        // Cover grace expired — queen returns to center
        // Return queen: reuse existing pocketed queen body
        const queenBody = coinBodiesRef.current.find(b => b.label === 'queen');
        if (queenBody && pocketedSet.current.has(queenBody.id)) {
          pocketedSet.current.delete(queenBody.id);
          Matter.Body.setPosition(queenBody, { x: BW/2, y: BH/2 });
          Matter.Body.setVelocity(queenBody, { x: 0, y: 0 });
          Matter.Body.setAngularVelocity(queenBody, 0);
          try { Matter.Composite.add(engineRef.current!.world, queenBody); } catch (_) {}
        } else if (!queenBody) {
          // Fallback: create new queen body only if none exists at all
          const q = Matter.Bodies.circle(BW/2, BH/2, COIN_R, {
            restitution: 0.72, friction: 0.04, frictionAir: 0.016, density: 0.002, label: 'queen',
          });
          coinBodiesRef.current.push(q);
          Matter.Composite.add(engineRef.current!.world, q);
        }
        queenPocketed.current = false;
        queenOwner.current    = null;
        extraTurnRef.current  = false;
        setQueenStatus('on_board');
        setQueenMsg('👑 Queen cover nahin hua — center mein wapas!');
        setTimeout(() => setQueenMsg(''), 3000);
      }
    }

    // Reset per-shot flags
    strikerFoulRef.current = false;
    oppCoinFoulRef.current = false;
    ownCoinPocketedRef.current = false;

    checkWin();
    endTurn(foulThisTurnRef.current);
    foulThisTurnRef.current = false;
  }

  // ─────────────────────────────────────────
  //  END TURN
  //  Rules:
  //  - If foul happened → add consecutive foul, extra turn cancelled, turn passes
  //  - If own coin pocketed (no foul) → extra turn (same player again)
  //  - Otherwise → turn passes to next player (clockwise in 4P)
  // ─────────────────────────────────────────
  function endTurn(wasFoul: boolean) {
    clearTimer();

    if (wasFoul) {
      addConsecutiveFoul(turnRef.current);
      extraTurnRef.current = false;
    }

    if (!extraTurnRef.current) {
      // Pass turn to next player
      const next = getNextPlayer(turnRef.current);
      if (!disqualifiedRef.current.has(next)) {
        setTurn(next);
        turnRef.current = next;
      }
    }
    extraTurnRef.current = false;

    resetStriker();
    canShootRef.current = true;

    // Online sync
    if (modeRef.current === 'online_playing' && roomIdRef.current) {
      const bodies = Matter.Composite.allBodies(engineRef.current!.world);
      const coinState = bodies
        .filter((b: Matter.Body) => ['white','black','queen'].includes(b.label))
        .map((b: Matter.Body) => ({ id: b.id, pos: b.position, angle: b.angle }));
      mockBackend.publish(('carrom_sync_' + roomIdRef.current) as any, {
        type: 'sync_state', turn: turnRef.current,
        scores: scoresRef.current, coins: coinState,
      });
    }

    updateStatusMsg();

    const isBotTurn = modeRef.current === 'bot' && turnRef.current === 'p2';
    if (isBotTurn) scheduleAI();
    else startTimer();
  }

  function resetStriker() {
    if (!strikerRef.current) return;
    strikerSlideRef.current = 0.5;
    const pos = getStrikerPosition(turnRef.current);
    Matter.Body.setPosition(strikerRef.current, pos);
    Matter.Body.setVelocity(strikerRef.current, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(strikerRef.current, 0);
    isDraggingRef.current  = false;
    dragCurrentRef.current = null;
    pocketedSet.current.delete(strikerRef.current.id);
  }

  // Count coins of a color currently on board (not pocketed, not striker, not off-screen)
  function countOnBoard(color: string): number {
    return coinBodiesRef.current.filter(b =>
      b.label === color &&
      !pocketedSet.current.has(b.id) &&
      b.position.x > 0 && b.position.y > 0
    ).length;
  }

  function checkWin() {
    const active = getActivePlayers();
    const numP = numPlayersRef.current;

    // Sync coinsLeft with actual board state
    const whiteOnBoard = countOnBoard('white');
    const blackOnBoard = countOnBoard('black');
    const newCoinsLeft: CoinsLeft = numP === 4
      ? { p1: whiteOnBoard, p2: blackOnBoard, p3: whiteOnBoard, p4: blackOnBoard }
      : { p1: whiteOnBoard, p2: blackOnBoard, p3: 0, p4: 0 };
    coinsLeftRef.current = newCoinsLeft;
    setCoinsLeft(newCoinsLeft);

    for (const p of active) {
      const myColor = getPlayerCoinColor(p, numP);
      const myCoinsOnBoard = countOnBoard(myColor);
      if (myCoinsOnBoard <= 0 && queenCovered.current) {
        triggerWin(p); return;
      }
      if (scoresRef.current[p] >= 200) {
        triggerWin(p); return;
      }
    }

    const nonQueenCoins = coinBodiesRef.current.filter(
      b => !pocketedSet.current.has(b.id) && b.label !== 'queen'
        && b.label !== 'striker' && b.position.x > 0
    );
    if (nonQueenCoins.length === 0 && queenCovered.current) {
      let best = active[0];
      for (const p of active) {
        if (scoresRef.current[p] > scoresRef.current[best]) best = p;
      }
      triggerWin(best);
    }
  }

  function triggerWin(player: Player) {
    clearTimer();
    canShootRef.current = false;
    playSound('win');
    setWinner(player);
  }

  // ─────────────────────────────────────────
  //  TIMER
  // ─────────────────────────────────────────
  function startTimer() {
    clearTimer();
    timerValRef.current = TURN_TIME;
    setTimerVal(TURN_TIME);
    timerRef.current = setInterval(() => {
      timerValRef.current -= 1;
      setTimerVal(timerValRef.current);
      if (timerValRef.current <= 5) playSound('tick');
      if (timerValRef.current <= 0) {
        clearTimer();
        // Time out = foul: return one previously pocketed coin
        showFoul('⏱️ Time out! FOUL — ek coin wapas aayega.');
        returnCoinToBoard(getPlayerCoinColor(turnRef.current, numPlayersRef.current));
        foulThisTurnRef.current = true;
        endTurn(true);
        foulThisTurnRef.current = false;
      }
    }, 1000);
  }

  function clearTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  // ─────────────────────────────────────────
  //  AI
  // ─────────────────────────────────────────
  function scheduleAI() {
    setStatusMsg('🤖 AI soch raha hai…');
    setTimeout(runAI, 900 + Math.random() * 700);
  }

  function runAI() {
    if (!canShootRef.current || isMovingRef.current || turnRef.current !== 'p2') return;
    canShootRef.current = false;
    isMovingRef.current = true;
    if (!strikerRef.current || !engineRef.current) return;

    const sx = strikerRef.current.position.x;
    const sy = strikerRef.current.position.y;
    const myColor = getPlayerCoinColor('p2', numPlayersRef.current);
    const targets = coinBodiesRef.current.filter(
      b => !pocketedSet.current.has(b.id) && (b.label === myColor || b.label === 'queen')
    );

    let targetX = BW/2, targetY = BH/2;
    if (targets.length > 0) {
      let best: Matter.Body | null = null, bestD = Infinity;
      for (const t of targets) {
        const d = Math.hypot(t.position.x - sx, t.position.y - sy);
        if (d < bestD) { bestD = d; best = t; }
      }
      if (best) { targetX = best.position.x; targetY = best.position.y; }
    }

    targetX += (Math.random() - 0.5) * 22;
    targetY += (Math.random() - 0.5) * 22;

    const dx = targetX - sx, dy = targetY - sy;
    const dist = Math.hypot(dx, dy);
    const powerVal = 0.45 + Math.random() * 0.5;
    Matter.Body.applyForce(strikerRef.current, strikerRef.current.position, {
      x: (dx/dist) * powerVal * MAX_FORCE,
      y: (dy/dist) * powerVal * MAX_FORCE,
    });
    playSound('shoot', powerVal);
    setPower(0);
  }

  // ─────────────────────────────────────────
  //  ONLINE SYNC
  // ─────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'online_playing' || !roomId) return;
    const unsub = mockBackend.subscribe(('carrom_sync_' + roomId) as any, (data: any) => {
      if (data.type === 'strike') {
        if (data.shooter && data.shooter === roleRef.current) return;
        if (turnRef.current !== roleRef.current && strikerRef.current && canShootRef.current) {
          canShootRef.current = false; isMovingRef.current = true;
          Matter.Body.setPosition(strikerRef.current, data.position);
          Matter.Body.applyForce(strikerRef.current, data.position, data.force);
        }
      } else if (data.type === 'sync_state') {
        if (data.scores) { setScores(data.scores); scoresRef.current = data.scores; }
        if (data.turn)   { setTurn(data.turn); turnRef.current = data.turn; }
        if (data.winner) setWinner(data.winner);
        if (data.coins && engineRef.current) {
          const bodies = Matter.Composite.allBodies(engineRef.current.world);
          (data.coins as any[]).forEach((cData: any) => {
            const b = bodies.find((x: Matter.Body) => x.id === cData.id);
            if (b) {
              Matter.Body.setPosition(b, cData.pos); Matter.Body.setAngle(b, cData.angle);
              Matter.Body.setVelocity(b, { x: 0, y: 0 }); Matter.Body.setAngularVelocity(b, 0);
            }
          });
        }
      }
    });
    return () => unsub();
  }, [mode, roomId]);

  // ─────────────────────────────────────────
  //  INPUT — POINTER
  // ─────────────────────────────────────────
  function getPhysicsPos(e: React.PointerEvent | PointerEvent): { x: number; y: number } {
    const canvas = boardCanvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scaleRef.current,
      y: (e.clientY - rect.top)  / scaleRef.current,
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!canShootRef.current || isMovingRef.current) return;
    if (modeRef.current === 'bot' && turnRef.current === 'p2') return;
    if (modeRef.current === 'online_playing' && roleRef.current !== turnRef.current) return;
    if (disqualifiedRef.current.has(turnRef.current)) return;
    if (!strikerRef.current) return;

    const pos = getPhysicsPos(e);
    const sx  = strikerRef.current.position.x;
    const sy  = strikerRef.current.position.y;

    // Lane positioning — tap on the lane to slide striker
    if (Math.hypot(pos.x - sx, pos.y - sy) > STRIKER_R * 4.5) {
      const cur = turnRef.current;
      const numP = numPlayersRef.current;
      if (numP === 2) {
        const laneY = STRIKER_Y_2P[cur];
        if (Math.abs(pos.y - laneY) < STRIKER_R * 2) {
          const minX = BOARD_PAD + STRIKER_R + 10;
          const maxX = BW - BOARD_PAD - STRIKER_R - 10;
          const clampedX = Math.max(minX, Math.min(maxX, pos.x));
          strikerSlideRef.current = (clampedX - minX) / (maxX - minX);
          Matter.Body.setPosition(strikerRef.current, { x: clampedX, y: laneY });
          Matter.Body.setVelocity(strikerRef.current, { x: 0, y: 0 });
          return;
        }
      } else {
        const cfg = STRIKER_CONFIG_4P[cur];
        if (cfg.axis === 'h' && Math.abs(pos.y - cfg.y) < STRIKER_R * 2) {
          const minX = BOARD_PAD + STRIKER_R + 10;
          const maxX = BW - BOARD_PAD - STRIKER_R - 10;
          const clampedX = Math.max(minX, Math.min(maxX, pos.x));
          strikerSlideRef.current = (clampedX - minX) / (maxX - minX);
          Matter.Body.setPosition(strikerRef.current, { x: clampedX, y: cfg.y });
          Matter.Body.setVelocity(strikerRef.current, { x: 0, y: 0 });
          return;
        }
        if (cfg.axis === 'v' && Math.abs(pos.x - cfg.x) < STRIKER_R * 2) {
          const minY = BOARD_PAD + STRIKER_R + 10;
          const maxY = BH - BOARD_PAD - STRIKER_R - 10;
          const clampedY = Math.max(minY, Math.min(maxY, pos.y));
          strikerSlideRef.current = (clampedY - minY) / (maxY - minY);
          Matter.Body.setPosition(strikerRef.current, { x: cfg.x, y: clampedY });
          Matter.Body.setVelocity(strikerRef.current, { x: 0, y: 0 });
          return;
        }
      }
      return;
    }

    isDraggingRef.current  = true;
    dragCurrentRef.current = pos;
    clearTimer();
  }

  function onPointerMove(e: React.PointerEvent) {
    const pos = getPhysicsPos(e);
    if (isDraggingRef.current && strikerRef.current) {
      const sx = strikerRef.current.position.x;
      const sy = strikerRef.current.position.y;
      dragCurrentRef.current = pos;
      const dx = sx - pos.x, dy = sy - pos.y;
      const dist = Math.hypot(dx, dy);
      setPower(Math.min(dist / MAX_DRAG, 1));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!isDraggingRef.current || !dragCurrentRef.current || !strikerRef.current) {
      isDraggingRef.current  = false;
      dragCurrentRef.current = null;
      setPower(0);
      return;
    }

    const pos = dragCurrentRef.current;
    const sx  = strikerRef.current.position.x;
    const sy  = strikerRef.current.position.y;
    const dx  = sx - pos.x, dy = sy - pos.y;
    const dist = Math.hypot(dx, dy);

    isDraggingRef.current  = false;
    dragCurrentRef.current = null;
    setPower(0);

    if (dist < 6) { startTimer(); return; }

    const clampedDist = Math.min(dist, MAX_DRAG);
    const powerVal    = clampedDist / MAX_DRAG;
    const fx = (dx/dist) * powerVal * MAX_FORCE;
    const fy = (dy/dist) * powerVal * MAX_FORCE;

    canShootRef.current = false;
    isMovingRef.current = true;
    // Reset per-shot foul tracking
    foulThisTurnRef.current = false;
    strikerFoulRef.current = false;
    oppCoinFoulRef.current = false;
    ownCoinPocketedRef.current = false;

    Matter.Body.applyForce(strikerRef.current, strikerRef.current.position, { x: fx, y: fy });
    playSound('shoot', powerVal);

    if (modeRef.current === 'online_playing' && roomIdRef.current) {
      mockBackend.publish(('carrom_sync_' + roomIdRef.current) as any, {
        type: 'strike', force: { x: fx, y: fy }, position: strikerRef.current.position,
        shooter: roleRef.current,
      });
    }
  }

  // ─────────────────────────────────────────
  //  GAME LOOP
  // ─────────────────────────────────────────
  const rafRef = useRef<number>(0);

  function startGameLoop() {
    const loop = () => {
      renderBoard(); renderAim();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }

  function stopGameLoop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }

  // ─────────────────────────────────────────
  //  UI HELPERS
  // ─────────────────────────────────────────
  function showFoul(msg: string) {
    setFoul({ active: true, message: msg });
    setTimeout(() => setFoul({ active: false, message: '' }), 2500);
  }

  function updateStatusMsg() {
    const cur = turnRef.current;
    const curMode = modeRef.current;
    if (curMode === 'bot' && cur === 'p2') setStatusMsg('🤖 AI aim kar raha hai…');
    else setStatusMsg('Lane tap karo position ke liye · Drag karo aim & shoot!');
  }

  // ─────────────────────────────────────────
  //  PARTICLES
  // ─────────────────────────────────────────
  function spawnParticles(physX: number, physY: number, coinLabel: string) {
    const wrap = wrapRef.current, canvas = boardCanvasRef.current;
    if (!wrap || !canvas) return;
    const s = scaleRef.current;
    const cRect = canvas.getBoundingClientRect();
    const wRect = wrap.getBoundingClientRect();
    const cx2 = cRect.left - wRect.left + physX * s;
    const cy2 = cRect.top  - wRect.top  + physY * s;
    const colorSets: Record<string, string[]> = {
      queen: ['#f59e0b','#ef4444','#fbbf24','#ff8800'],
      white: ['#e0e0e0','#ffffff','#c8c8c8'],
      black: ['#4444aa','#1e293b','#6666cc','#333366'],
      striker: ['#9090c0','#c0c0e0'],
    };
    const cols = colorSets[coinLabel] || ['#fff'];
    for (let i = 0; i < 14; i++) {
      const p = document.createElement('div');
      const angle = Math.random() * Math.PI * 2;
      const d = 28 + Math.random() * 55, sz = 4 + Math.random() * 6;
      p.style.cssText = [
        `position:absolute`,`left:${cx2}px`,`top:${cy2}px`,
        `width:${sz}px`,`height:${sz}px`,`border-radius:50%`,
        `background:${cols[Math.floor(Math.random()*cols.length)]}`,
        `pointer-events:none`,`z-index:99`,
        `--dx:${Math.cos(angle)*d}px`,`--dy:${Math.sin(angle)*d}px`,
        `animation:particle-fly ${0.5+Math.random()*0.45}s ease-out forwards`,
      ].join(';');
      wrap.appendChild(p);
      setTimeout(() => p.remove(), 1100);
    }
  }

  // ─────────────────────────────────────────
  //  GAME START
  // ─────────────────────────────────────────
  function startGame(gameMode: Mode, numPlayers = 2) {
    numPlayersRef.current = numPlayers;
    // In 4P: each player has 9 coins initially, but they alternate colors per team
    // For simplicity tracking: each player tracks their own color coins (9 each in 4P)
    const initCoins: CoinsLeft = numPlayers === 4
      ? { p1: 9, p2: 9, p3: 9, p4: 9 }
      : { p1: 9, p2: 9, p3: 0, p4: 0 };

    setMode(gameMode); modeRef.current = gameMode;
    setTurn('p1'); turnRef.current = 'p1';
    setScores({ p1: 0, p2: 0, p3: 0, p4: 0 });
    scoresRef.current = { p1: 0, p2: 0, p3: 0, p4: 0 };
    setCoinsLeft(initCoins); coinsLeftRef.current = initCoins;
    setDisqualified(new Set()); disqualifiedRef.current = new Set();
    setWinner(null);
    setTimerVal(TURN_TIME);
    setPower(0);
    setFoul({ active: false, message: '' });
    setQueenMsg('');
    setExtraTurnMsg(false);
    setQueenStatus('on_board');
    setConsecutiveFouls({ p1: 0, p2: 0, p3: 0, p4: 0 });
    consecutiveFoulsRef.current = { p1: 0, p2: 0, p3: 0, p4: 0 };
    canShootRef.current   = true;
    isMovingRef.current   = false;
    extraTurnRef.current  = false;
    foulThisTurnRef.current = false;
    queenPocketed.current = false;
    queenCovered.current  = false;
    queenOwner.current    = null;
    queenCoverGraceRef.current = 0;
    isDraggingRef.current = false;
    dragCurrentRef.current = null;
    strikerSlideRef.current = 0.5;
    strikerFoulRef.current = false;
    oppCoinFoulRef.current = false;
    ownCoinPocketedRef.current = false;
  }

  // Canvas setup after mode change
  useEffect(() => {
    if (mode === 'menu' || mode === 'online_lobby') return;
    const timer = setTimeout(() => {
      const canvas = boardCanvasRef.current;
      const aimCanvas = aimCanvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !aimCanvas || !wrap) return;

      const sz = Math.min(wrap.clientWidth, wrap.clientHeight, 440) - 4;
      canvas.width = sz; canvas.height = sz;
      aimCanvas.width = sz; aimCanvas.height = sz;
      scaleRef.current = sz / BW;

      initPhysics(); stopGameLoop(); startGameLoop(); startTimer();
      if (mode === 'bot' && turnRef.current === 'p2') scheduleAI();
    }, 60);

    return () => {
      clearTimeout(timer); stopGameLoop(); clearTimer();
      if (engineRef.current) {
        Matter.Runner.stop(runnerRef.current!);
        Matter.Engine.clear(engineRef.current);
        engineRef.current = null;
      }
    };
  }, [mode]);

  // ─────────────────────────────────────────
  //  DERIVED VALUES
  // ─────────────────────────────────────────
  const timerPct   = timerVal / TURN_TIME;
  const timerColor = timerVal <= 5 ? '#ef4444' : timerVal <= 10 ? '#f59e0b' : '#10b981';
  const powerColor = power > 0.75 ? '#ef4444' : power > 0.42 ? '#f59e0b' : '#10b981';
  const powerWidth = `${Math.round(power * 100)}%`;
  const isMyTurn   = mode !== 'online_playing' || role === turn;
  const canInteract = canShootRef.current && !isMovingRef.current && isMyTurn
    && (mode !== 'bot' || turn === 'p1') && !disqualified.has(turn);
  const numP = numPlayersRef.current;

  function getPlayerName(p: Player) {
    if (p === 'p2' && mode === 'bot') return 'AI Bot';
    return PLAYER_NAMES_DEFAULT[p];
  }

  // ─────────────────────────────────────────
  //  RENDER — Auto-launch from RoomHub
  // ─────────────────────────────────────────
  if (mode === 'menu' && mpSession.forGame('carrom')) {
    const sess = mpSession.forGame('carrom')!;
    const r = sess.role as Player;
    const np = sess.maxPlayers as 2 | 4;
    setTimeout(() => {
      setRole(r); roleRef.current = r;
      setRoomId(sess.roomId); roomIdRef.current = sess.roomId;
      mockBackend.joinRoom(sess.roomId);
      startGame('online_playing', np);
    }, 0);
  }

  if (mode === 'online_lobby') {
    return (
      <CarromOnlineLobby
        onStartGame={(r, id, np) => {
          setRole(r); roleRef.current = r;
          setRoomId(id); roomIdRef.current = id;
          startGame('online_playing', np);
        }}
        onBack={() => setMode('menu')}
      />
    );
  }

  // ─────────────────────────────────────────
  //  RENDER — MENU
  // ─────────────────────────────────────────
  if (mode === 'menu') {
    return (
      <div className="flex flex-col items-center justify-center p-6 h-full text-white bg-gradient-to-b from-[#12181f] to-[#0a0e14]">
        <div className="absolute top-5 left-5">
          <button onClick={() => onGameOver(0)}
            className="text-gray-500 hover:text-white transition flex items-center gap-2 text-sm">
            <ArrowLeft className="w-4 h-4" /> Hub
          </button>
        </div>

        {/* Logo */}
        <div className="flex flex-col items-center mb-7">
          <div className="relative mb-4">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center shadow-[0_0_40px_rgba(245,158,11,0.5)]">
              <CircleDot className="w-12 h-12 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center">
              <Star className="w-3.5 h-3.5 text-yellow-800" />
            </div>
          </div>
          <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-amber-400 to-red-500 bg-clip-text text-transparent">
            CARROM POOL
          </h1>
          <p className="text-gray-500 text-sm mt-1 tracking-widest uppercase">Real Rules</p>
        </div>

        {/* Points legend */}
        <div className="flex gap-4 mb-6 bg-gray-800/50 rounded-2xl px-5 py-3 border border-gray-700/50">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded-full bg-white border border-gray-400"/>
            <span className="text-xs text-gray-300 font-bold">{POINTS_COIN} pts</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded-full bg-[#1a1a2e] border border-blue-400"/>
            <span className="text-xs text-gray-300 font-bold">{POINTS_COIN} pts</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded-full bg-red-600 border border-red-300"/>
            <span className="text-xs text-yellow-400 font-bold">👑 {POINTS_QUEEN}+{POINTS_QUEEN_COVER_BONUS} pts</span>
          </div>
        </div>

        {/* Mode buttons */}
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button onClick={() => startGame('bot', 2)}
            className="group w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-amber-600 to-amber-500 text-white font-bold shadow-[0_4px_20px_rgba(245,158,11,0.4)] active:scale-[0.97] transition-all flex items-center gap-3">
            <Bot className="w-5 h-5 group-hover:rotate-12 transition-transform" />
            <span className="flex-1 text-left">VS AI Bot</span>
            <Zap className="w-4 h-4 opacity-70" />
          </button>

          <button onClick={() => startGame('local2', 2)}
            className="group w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-bold shadow-[0_4px_20px_rgba(59,130,246,0.4)] active:scale-[0.97] transition-all flex items-center gap-3">
            <Users className="w-5 h-5" />
            <span className="flex-1 text-left">2 Player Local</span>
            <span className="text-xs opacity-70 font-normal">Opposite sides</span>
          </button>

          <button onClick={() => startGame('local4', 4)}
            className="group w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 text-white font-bold shadow-[0_4px_20px_rgba(168,85,247,0.4)] active:scale-[0.97] transition-all flex items-center gap-3">
            <User className="w-5 h-5" />
            <span className="flex-1 text-left">4 Player Local</span>
            <span className="text-xs opacity-70 font-normal">Clockwise teams</span>
          </button>

          <button onClick={() => setMode('online_lobby')}
            className="group w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-green-600 to-emerald-500 text-white font-bold shadow-[0_4px_20px_rgba(16,185,129,0.4)] active:scale-[0.97] transition-all flex items-center gap-3">
            <Globe className="w-5 h-5 group-hover:animate-spin" />
            <span className="flex-1 text-left">Online Play</span>
            <span className="text-xs opacity-70 font-normal">2P or 4P</span>
          </button>
        </div>

        {/* Rules hint */}
        <div className="mt-6 text-[11px] text-gray-600 text-center max-w-xs leading-relaxed">
          2P: Opposite side baithenge · Toss se first turn decide<br/>
          Apna coin pocket → extra turn · Opponent ka coin → FOUL<br/>
          Queen cover same/next shot · 3 fouls = disqualified
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────
  //  RENDER — GAME
  // ─────────────────────────────────────────
  const activePlayers = getActivePlayers();

  return (
    <div className="flex flex-col items-center h-full text-white bg-gradient-to-b from-[#12181f] to-[#0a0e14] overflow-hidden select-none">

      {/* ── Top HUD ── */}
      <div className="flex items-center justify-between w-full max-w-[440px] px-3 pt-3 pb-1">
        <button
          onClick={() => { stopGameLoop(); clearTimer(); onGameOver(Math.max(scores.p1, scores.p2, scores.p3, scores.p4), 'Completed'); }}
          className="text-gray-500 hover:text-white transition flex items-center gap-1.5 text-xs">
          <ArrowLeft className="w-3.5 h-3.5" /> Exit
        </button>

        {/* Turn badge */}
        <div className={`px-4 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all ${
          extraTurnMsg
            ? 'bg-gradient-to-r from-green-500 to-emerald-400 text-white shadow-[0_0_12px_rgba(16,185,129,0.6)]'
            : 'text-white'
          }`}
          style={{ background: extraTurnMsg ? undefined : PLAYER_COLORS[turn] + 'dd' }}>
          {extraTurnMsg ? '🎯 Extra Turn!' : `${getPlayerName(turn)} ki Baari`}
        </div>

        {/* Timer */}
        <div className="flex items-center gap-1.5">
          <svg width="26" height="26" viewBox="0 0 26 26" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="13" cy="13" r="10" fill="none" stroke="#1f2937" strokeWidth="3"/>
            <circle cx="13" cy="13" r="10" fill="none" stroke={timerColor} strokeWidth="3"
              strokeLinecap="round" strokeDasharray="62.8"
              strokeDashoffset={62.8*(1-timerPct)}
              style={{ transition: 'stroke-dashoffset 0.5s linear, stroke 0.3s' }}/>
          </svg>
          <span className="text-sm font-bold w-5 text-center" style={{ color: timerColor }}>
            {timerVal}
          </span>
        </div>
      </div>

      {/* ── Score Bar ── */}
      {numP === 2 ? (
        <div className="flex items-center gap-2 w-full max-w-[440px] px-3 pb-2">
          {(['p1','p2'] as Player[]).map(p => (
            <div key={p} className={`flex-1 flex items-center justify-between px-3 py-2 rounded-xl border transition-all duration-300 ${
              turn === p ? 'border-opacity-60 shadow-lg' : 'border-gray-700/50 bg-gray-800/40'
            }`}
              style={turn===p ? {borderColor: PLAYER_COLORS[p]+'99', background: PLAYER_COLORS[p]+'15'} : {}}>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: PLAYER_COLORS[p] }}>
                  {getPlayerName(p)}
                  {disqualified.has(p) && <span className="text-red-400 ml-1">✗</span>}
                  {consecutiveFouls[p] > 0 && !disqualified.has(p) &&
                    <span className="text-red-400 ml-1">{Array(consecutiveFouls[p]).fill('⚠️').join('')}</span>}
                </div>
                <div className="text-[9px] text-gray-500">
                  {p==='p1'?'⚪ White':'⚫ Black'} · {coinsLeft[p]} baaki
                </div>
              </div>
              <div className="text-2xl font-black text-white">{scores[p]}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 w-full max-w-[440px] px-3 pb-2">
          {(['p1','p2','p3','p4'] as Player[]).map(p => {
            const coinColor = getPlayerCoinColor(p, 4);
            const teamLabel = (p === 'p1' || p === 'p3') ? 'Team A' : 'Team B';
            return (
              <div key={p} className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl border transition-all ${
                turn===p ? 'border-opacity-60' : 'border-gray-700/40 bg-gray-800/30'
              } ${disqualified.has(p) ? 'opacity-40' : ''}`}
                style={turn===p ? {borderColor: PLAYER_COLORS[p]+'99', background: PLAYER_COLORS[p]+'15'} : {}}>
                <div>
                  <div className="text-[9px] font-bold uppercase" style={{ color: PLAYER_COLORS[p] }}>
                    {getPlayerName(p)} <span className="opacity-60">({teamLabel})</span>
                    {consecutiveFouls[p] > 0 && !disqualified.has(p) &&
                      <span className="text-red-400 ml-0.5">{Array(consecutiveFouls[p]).fill('⚠').join('')}</span>}
                  </div>
                  <div className="text-[8px] text-gray-500">{coinColor === 'white' ? '⚪' : '⚫'} {coinsLeft[p]} baaki</div>
                </div>
                <div className="text-lg font-black text-white">{scores[p]}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Queen status banner ── */}
      {queenMsg && (
        <div className="w-full max-w-[440px] px-3 mb-1">
          <div className={`text-xs font-bold text-center py-1.5 rounded-xl border ${
            queenStatus === 'covered'
              ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300'
              : queenStatus === 'pocketed'
              ? 'bg-orange-500/20 border-orange-500/40 text-orange-300 animate-pulse'
              : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
          }`}>
            {queenMsg}
          </div>
        </div>
      )}

      {/* ── Board ── */}
      <div ref={wrapRef}
        className="relative flex-1 flex items-center justify-center w-full max-w-[440px] px-2"
        style={{ minHeight: 0 }}>
        <div className="relative p-2.5 rounded-[2rem] bg-[#3d1a00] shadow-[0_20px_60px_rgba(0,0,0,0.8),inset_0_0_30px_rgba(0,0,0,0.5)] outline outline-1 outline-amber-900/30">
          <canvas ref={boardCanvasRef} id="board-canvas"
            className="block rounded-[1.2rem] touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            style={{ cursor: canInteract ? 'crosshair' : 'default' }}/>
          <canvas ref={aimCanvasRef}
            className="absolute top-[10px] left-[10px] rounded-[1.2rem] pointer-events-none"
            style={{ zIndex: 10 }}/>
        </div>

        {/* Foul popup */}
        {foul.active && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-gray-900/95 border border-red-500/50 text-red-400 font-bold text-sm px-5 py-2.5 rounded-2xl shadow-xl whitespace-nowrap pointer-events-none animate-bounce">
            {foul.message}
          </div>
        )}
      </div>

      {/* ── Power bar ── */}
      <div className="flex items-center gap-2 w-full max-w-[440px] px-4 pt-2">
        <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider w-10 text-right">Power</span>
        <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-50"
            style={{
              width: powerWidth,
              background: power > 0.75 ? 'linear-gradient(90deg,#f59e0b,#ef4444)'
                : power > 0.42 ? 'linear-gradient(90deg,#10b981,#f59e0b)' : '#10b981',
            }}/>
        </div>
        <span className="text-[10px] font-bold w-8" style={{ color: powerColor }}>
          {Math.round(power*100)}%
        </span>
      </div>

      {/* ── Status / Foul counter ── */}
      <div className="w-full max-w-[440px] px-4 pb-3 pt-1 flex items-center justify-between">
        <p className={`text-xs transition-colors ${canInteract ? 'text-amber-400 font-semibold' : 'text-gray-600'}`}>
          {statusMsg}
        </p>
        {consecutiveFouls[turn] > 0 && (
          <span className="text-[10px] text-red-400 font-bold">
            Fouls: {consecutiveFouls[turn]}/{MAX_CONSEC_FOULS}
          </span>
        )}
      </div>

      {/* ── Winner Overlay ── */}
      {winner && (
        <div className="absolute inset-0 bg-black/88 flex flex-col items-center justify-center z-50 backdrop-blur-sm px-6">
          <Crown className="w-20 h-20 text-yellow-400 mb-3 drop-shadow-[0_0_20px_rgba(250,204,21,0.8)] animate-bounce" />
          <Trophy className="w-8 h-8 text-amber-500 mb-2" />
          <h2 className="text-4xl font-black bg-gradient-to-r from-amber-400 to-red-500 bg-clip-text text-transparent mb-1">
            {getPlayerName(winner)} Jeeta!
          </h2>
          <p className="text-gray-400 text-base mb-3">
            Score: <span className="text-white font-bold">{scores[winner]}</span> pts
          </p>

          <div className="flex gap-3 mb-6">
            {activePlayers.map(p => (
              <div key={p} className="text-center">
                <div className="text-[10px] font-bold" style={{ color: PLAYER_COLORS[p] }}>
                  {getPlayerName(p)}
                </div>
                <div className="text-lg font-black text-white">{scores[p]}</div>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={() => { stopGameLoop(); clearTimer(); startGame(mode, numP); }}
              className="py-3 px-7 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-2xl shadow-lg active:scale-95 transition-transform">
              Dobara Khelo
            </button>
            <button onClick={() => { stopGameLoop(); clearTimer(); onGameOver(scores[winner], 'Win'); }}
              className="py-3 px-7 bg-gray-800 border border-gray-700 text-white font-bold rounded-2xl active:scale-95 transition-transform">
              Exit
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes particle-fly {
          0%   { transform: translate(0,0) scale(1); opacity: 1; }
          100% { transform: translate(var(--dx), var(--dy)) scale(0); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
