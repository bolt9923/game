import React, { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import { CircleDot, ArrowLeft, Users, Bot, Globe, Crown, Trophy, Zap, Star, User } from 'lucide-react';
import { mockBackend } from '../lib/mockBackend';
import { mpSession } from '../lib/mpSession';
import { rooms as firebaseRooms, type RoomPlayer as FbRoomPlayer } from '../lib/rooms';
import { db as gameDb } from '../lib/db';

// ─────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────
interface CarromProps {
  onGameOver: (score: number, result?: 'Win' | 'Loss' | 'Draw' | 'Completed') => void;
  onBack: () => void;
}
type Mode   = 'menu' | 'bot' | 'local2' | 'local4' | 'online_lobby' | 'online_playing';
type Player = 'p1' | 'p2' | 'p3' | 'p4';
interface GameScores { p1: number; p2: number; p3: number; p4: number; }
interface FoulInfo   { active: boolean; message: string; }

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────
const BW = 420; const BH = 420;
const BOARD_PAD = 40;
const POCKET_R  = 22;
const COIN_R    = 11;
const STRIKER_R = 15;
const MAX_DRAG  = 130;
const MAX_FORCE = 0.09;
const TURN_TIME = 25;
const MAX_CONSEC_FOULS = 3;
const QUEEN_COVER_BONUS = 3;

// Striker baseline Y positions (2P)
const STRIKER_Y: Record<string, number> = {
  p1: BH - BOARD_PAD - 32,
  p2: BOARD_PAD + 32,
};
// 4P striker config
const STRIKER_CFG_4P: Record<string, { x: number; y: number; axis: 'h' | 'v' }> = {
  p1: { x: BW/2, y: BH - BOARD_PAD - 32, axis: 'h' },
  p2: { x: BW/2, y: BOARD_PAD + 32,      axis: 'h' },
  p3: { x: BOARD_PAD + 32,      y: BH/2, axis: 'v' },
  p4: { x: BW - BOARD_PAD - 32, y: BH/2, axis: 'v' },
};

function coinColorOf(player: Player, numP: number): 'white' | 'black' {
  if (numP === 4) return (player === 'p1' || player === 'p3') ? 'white' : 'black';
  return player === 'p1' ? 'white' : 'black';
}
function teamOf(player: Player): Player[] {
  return (player === 'p1' || player === 'p3') ? ['p1', 'p3'] : ['p2', 'p4'];
}

const PLAYER_COLORS: Record<string, string> = {
  p1: '#f59e0b', p2: '#3b82f6', p3: '#10b981', p4: '#a855f7',
};
const PLAYER_NAMES: Record<string, string> = {
  p1: 'Player 1', p2: 'Player 2', p3: 'Player 3', p4: 'Player 4',
};

// ─────────────────────────────────────────────
//  ONLINE LOBBY
// ─────────────────────────────────────────────
interface LobbyProps {
  onStartGame: (role: Player, roomId: string, numPlayers: number) => void;
  onBack: () => void;
}
function CarromOnlineLobby({ onStartGame, onBack }: LobbyProps) {
  const [step, setStep] = useState<'menu' | 'select_size' | 'join_form' | 'waiting'>('menu');
  const [roomCode, setRoomCode]   = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [error, setError]         = useState('');
  const [busy, setBusy]           = useState(false);
  const [numPlayers, setNumPlayers] = useState<2|4>(2);
  const [players, setPlayers]     = useState<FbRoomPlayer[]>([]);
  const [myRole, setMyRole]       = useState<Player>('p1');
  const [roomRowId, setRoomRowId] = useState('');
  const [copied, setCopied]       = useState(false);
  const unsubRef    = useRef<(()=>void)|null>(null);
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

  const handleCreate = async (size: 2|4) => {
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
      const np  = row.max_players as 2|4;
      const idx = row.players.findIndex(p => p.id === me.id);
      const role = (['p1','p2','p3','p4'] as Player[])[Math.max(0,idx)] || 'p2';
      setRoomCode(code); setRoomRowId(row.id);
      setNumPlayers(np); setMyRole(role); setPlayers(row.players);
      mockBackend.joinRoom(code);
      startWatch(row.id, code, role, np);
      setStep('waiting');
    } catch (e: any) { setError(e?.message || 'Join nahin hua.'); }
    finally { setBusy(false); }
  };

  const handleHostStart = async () => {
    if (!roomRowId) return; setBusy(true);
    try { await firebaseRooms.start(roomRowId, players[0]?.id); }
    catch (e: any) { setError(e?.message || 'Start nahin hua.'); setBusy(false); }
  };

  const copy = () => {
    navigator.clipboard?.writeText(roomCode).catch(()=>{});
    setCopied(true); setTimeout(()=>setCopied(false),1500);
  };

  if (step === 'menu') return (
    <div className="flex flex-col items-center justify-center p-6 h-full text-white bg-gradient-to-b from-[#12181f] to-[#0a0e14]">
      <button onClick={onBack} className="absolute top-6 left-6 text-gray-400 hover:text-white transition text-sm">← Back</button>
      <Globe className="w-16 h-16 text-green-400 mb-4"/>
      <h2 className="text-3xl font-black mb-8">Online Carrom</h2>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button onClick={() => setStep('select_size')} className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-green-600 to-emerald-500 text-white font-bold active:scale-95 transition-all flex items-center justify-between">
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
      <button onClick={() => setStep('menu')} className="absolute top-6 left-6 text-gray-400 hover:text-white transition text-sm">← Back</button>
      <Crown className="w-12 h-12 text-yellow-400 mb-4"/>
      <h2 className="text-2xl font-black mb-8">Game Size Chuno</h2>
      <div className="flex gap-4 w-full max-w-xs">
        <button onClick={() => handleCreate(2)} disabled={busy} className="flex-1 py-6 rounded-2xl bg-gradient-to-b from-blue-600 to-blue-700 text-white font-bold text-center active:scale-95 transition-all disabled:opacity-50">
          <div className="text-3xl font-black mb-1">2P</div><div className="text-xs opacity-70">2 Players</div>
        </button>
        <button onClick={() => handleCreate(4)} disabled={busy} className="flex-1 py-6 rounded-2xl bg-gradient-to-b from-purple-600 to-purple-700 text-white font-bold text-center active:scale-95 transition-all disabled:opacity-50">
          <div className="text-3xl font-black mb-1">4P</div><div className="text-xs opacity-70">4 Players</div>
        </button>
      </div>
      {busy && <div className="mt-4 text-blue-400 text-sm">Room ban raha hai...</div>}
      {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
    </div>
  );

  if (step === 'join_form') return (
    <div className="flex flex-col items-center justify-center p-6 h-full text-white bg-gradient-to-b from-[#12181f] to-[#0a0e14]">
      <button onClick={() => setStep('menu')} className="absolute top-6 left-6 text-gray-400 hover:text-white transition text-sm">← Back</button>
      <h2 className="text-2xl font-black mb-6">Room Code Daalo</h2>
      <div className="w-full max-w-xs space-y-4">
        <input value={joinInput}
          onChange={e => { setJoinInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6)); setError(''); }}
          placeholder="ABC123" maxLength={6} autoFocus
          className="w-full bg-[#0f1923] border border-gray-700 focus:border-indigo-400 outline-none rounded-2xl px-4 py-5 text-center text-4xl font-black font-mono tracking-[0.5em] text-white"/>
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <button onClick={handleJoin} disabled={busy || joinInput.length < 4}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl disabled:opacity-50 active:scale-95 transition">
          {busy ? 'Joining...' : 'Join Game'}
        </button>
      </div>
    </div>
  );

  const isHost = myRole === 'p1';
  const filled = players.length;
  const ready  = filled >= Math.min(numPlayers, 2);
  return (
    <div className="flex flex-col items-center justify-center p-6 h-full text-white bg-gradient-to-b from-[#12181f] to-[#0a0e14]">
      <button onClick={() => { stopWatch(); setStep('menu'); setRoomCode(''); setPlayers([]); }} className="absolute top-6 left-6 text-gray-400 hover:text-white text-sm">Cancel</button>
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
          {Array.from({ length: numPlayers }, (_,i) => {
            const p = players[i];
            const pKey = (['p1','p2','p3','p4'] as Player[])[i];
            return (
              <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${p ? 'border-green-500/40 bg-green-500/10' : 'border-gray-700/50 bg-gray-800/30'}`}>
                <div className="w-3 h-3 rounded-full" style={{ background: p ? PLAYER_COLORS[pKey] : '#374151' }}/>
                <span className="text-sm font-semibold" style={{ color: p ? PLAYER_COLORS[pKey] : '#6b7280' }}>
                  {p ? p.name : `Waiting for ${PLAYER_NAMES[pKey]}...`}
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
            {ready ? '🎮 Start Game!' : `${numPlayers - filled} aur player ka wait...`}
          </button>
        ) : (
          <div className="text-blue-400 text-sm text-center">
            Host ke start karne ka intezaar...
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  MAIN GAME COMPONENT
// ─────────────────────────────────────────────
export default function Carrom({ onGameOver, onBack }: CarromProps) {

  // ── React State ───────────────────────────
  const [mode,   setMode]   = useState<Mode>('menu');
  const [role,   setRole]   = useState<Player | null>(null);
  const [roomId, setRoomId] = useState('');
  const [turn,   setTurn]   = useState<Player>('p1');
  const [scores, setScores] = useState<GameScores>({ p1:0, p2:0, p3:0, p4:0 });
  const [whiteLeft, setWhiteLeft] = useState(9); // white coins on board
  const [blackLeft, setBlackLeft] = useState(9); // black coins on board
  const [winner,    setWinner]    = useState<Player | null>(null);
  const [timerVal,  setTimerVal]  = useState(TURN_TIME);
  const [power,     setPower]     = useState(0);
  const [foulMsg,   setFoulMsg]   = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [queenMsg,  setQueenMsg]  = useState('');
  const [extraTurnMsg, setExtraTurnMsg] = useState(false);
  const [consecFouls,  setConsecFouls]  = useState<Record<Player,number>>({ p1:0,p2:0,p3:0,p4:0 });
  const [disqualified, setDisqualified] = useState<Set<Player>>(new Set());
  const [queenStatus,  setQueenStatus]  = useState<'on_board'|'pocketed_uncovered'|'covered'>('on_board');

  // ── Canvas / DOM Refs ─────────────────────
  const boardCanvasRef = useRef<HTMLCanvasElement>(null);
  const aimCanvasRef   = useRef<HTMLCanvasElement>(null);
  const wrapRef        = useRef<HTMLDivElement>(null);

  // ── Physics Refs ──────────────────────────
  const engineRef    = useRef<Matter.Engine | null>(null);
  const runnerRef    = useRef<Matter.Runner  | null>(null);
  const strikerRef   = useRef<Matter.Body    | null>(null);
  const allCoinsRef  = useRef<Matter.Body[]>([]);      // all 19 coin bodies (never destroyed)
  const pocketedIds  = useRef<Set<number>>(new Set()); // ids currently off-board

  // ── Game Logic Refs ───────────────────────
  const turnRef            = useRef<Player>('p1');
  const numPlayersRef      = useRef(2);
  const modeRef            = useRef<Mode>('menu');
  const roleRef            = useRef<Player|null>(null);
  const roomIdRef          = useRef('');
  const scoresRef          = useRef<GameScores>({ p1:0,p2:0,p3:0,p4:0 });
  const disqRef            = useRef<Set<Player>>(new Set());
  const consecFoulsRef     = useRef<Record<Player,number>>({ p1:0,p2:0,p3:0,p4:0 });

  // Per-shot tracking
  const canShootRef        = useRef(true);
  const isMovingRef        = useRef(false);
  const extraTurnRef       = useRef(false);
  const foulThisTurnRef    = useRef(false);
  const strikerPocketedRef = useRef(false);  // striker went in this shot
  const ownCoinPocketedRef = useRef(false);  // at least one own coin pocketed this shot
  const oppCoinPocketedRef = useRef(false);  // opponent coin pocketed this shot
  const queenPocketedRef   = useRef(false);  // queen is pocketed (uncovered state)
  const queenCoveredRef    = useRef(false);  // queen is covered (permanent)
  const queenOwnerRef      = useRef<Player|null>(null);
  // Grace: 0=no queen pending, 1=queen pocketed this shot (get one more shot), -1=grace used
  const queenGraceRef      = useRef(0);

  // Online: true while physics is running for an OPPONENT's received strike.
  // Prevents afterShot from running on the receiver side — only the shooter resolves turn logic.
  const isReceivedStrikeRef = useRef(false);

  // Input refs
  const strikerSlideRef  = useRef(0.5);
  const isDraggingRef    = useRef(false);
  const dragCurrentRef   = useRef<{x:number;y:number}|null>(null);

  // Timer & misc refs
  const timerRef      = useRef<ReturnType<typeof setInterval>|null>(null);
  const timerValRef   = useRef(TURN_TIME);
  const audioCtxRef   = useRef<AudioContext|null>(null);
  const scaleRef      = useRef(1);
  const rafRef        = useRef<number>(0);

  // keep refs in sync with state
  useEffect(() => { turnRef.current = turn; },         [turn]);
  useEffect(() => { modeRef.current = mode; },         [mode]);
  useEffect(() => { roleRef.current = role; },         [role]);
  useEffect(() => { roomIdRef.current = roomId; },     [roomId]);
  useEffect(() => { scoresRef.current = scores; },     [scores]);
  useEffect(() => { disqRef.current = disqualified; }, [disqualified]);
  useEffect(() => { consecFoulsRef.current = consecFouls; }, [consecFouls]);

  // ─────────────────────────────────────────
  //  AUDIO
  // ─────────────────────────────────────────
  function getAudio() {
    if (!audioCtxRef.current)
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return audioCtxRef.current;
  }
  function playSound(type: 'shoot'|'pocket'|'foul'|'win'|'tick'|'border', pwr = 0.5) {
    try {
      const ctx = getAudio();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      const now = ctx.currentTime;
      if (type==='shoot') {
        osc.type='triangle'; osc.frequency.setValueAtTime(180+pwr*400,now); osc.frequency.exponentialRampToValueAtTime(70,now+0.18);
        gain.gain.setValueAtTime(0.35*pwr,now); gain.gain.exponentialRampToValueAtTime(0.001,now+0.22);
        osc.start(now); osc.stop(now+0.25);
      } else if (type==='pocket') {
        osc.type='sine'; osc.frequency.setValueAtTime(700,now); osc.frequency.exponentialRampToValueAtTime(200,now+0.35);
        gain.gain.setValueAtTime(0.4,now); gain.gain.exponentialRampToValueAtTime(0.001,now+0.4);
        osc.start(now); osc.stop(now+0.42);
      } else if (type==='border') {
        osc.type='square'; osc.frequency.setValueAtTime(200,now); osc.frequency.exponentialRampToValueAtTime(80,now+0.2);
        gain.gain.setValueAtTime(0.3,now); gain.gain.exponentialRampToValueAtTime(0.001,now+0.25);
        osc.start(now); osc.stop(now+0.28);
      } else if (type==='foul') {
        osc.type='sawtooth'; osc.frequency.setValueAtTime(200,now); osc.frequency.exponentialRampToValueAtTime(100,now+0.3);
        gain.gain.setValueAtTime(0.3,now); gain.gain.exponentialRampToValueAtTime(0.001,now+0.35);
        osc.start(now); osc.stop(now+0.38);
      } else if (type==='win') {
        [0,0.15,0.3,0.5].forEach((d,i) => {
          const o2=ctx.createOscillator(), g2=ctx.createGain();
          o2.connect(g2); g2.connect(ctx.destination);
          o2.type='sine'; o2.frequency.value=[523,659,784,1047][i];
          g2.gain.setValueAtTime(0.3,now+d); g2.gain.exponentialRampToValueAtTime(0.001,now+d+0.4);
          o2.start(now+d); o2.stop(now+d+0.45);
        }); return;
      } else if (type==='tick') {
        osc.type='square'; osc.frequency.value=440;
        gain.gain.setValueAtTime(0.08,now); gain.gain.exponentialRampToValueAtTime(0.001,now+0.06);
        osc.start(now); osc.stop(now+0.08);
      }
    } catch(_) {}
  }

  // ─────────────────────────────────────────
  //  HELPERS
  // ─────────────────────────────────────────
  function activePlayers(): Player[] {
    const all: Player[] = numPlayersRef.current===4 ? ['p1','p2','p3','p4'] : ['p1','p2'];
    return all.filter(p => !disqRef.current.has(p));
  }

  // Clockwise: bottom→right→top→left (4P) or p1→p2 (2P)
  function nextPlayer(cur: Player): Player {
    const order: Player[] = numPlayersRef.current===4 ? ['p1','p4','p2','p3'] : ['p1','p2'];
    const active = order.filter(p => !disqRef.current.has(p));
    if (!active.length) return cur;
    const idx = active.indexOf(cur);
    return active[(idx+1) % active.length];
  }

  function getStrikerPos(player: Player): {x:number;y:number} {
    const slide = strikerSlideRef.current;
    const numP  = numPlayersRef.current;
    const minX  = BOARD_PAD + STRIKER_R + 10;
    const maxX  = BW - BOARD_PAD - STRIKER_R - 10;
    const minY  = BOARD_PAD + STRIKER_R + 10;
    const maxY  = BH - BOARD_PAD - STRIKER_R - 10;
    if (numP===2) {
      return { x: minX+(maxX-minX)*slide, y: STRIKER_Y[player] };
    }
    const cfg = STRIKER_CFG_4P[player];
    if (cfg.axis==='h') return { x: minX+(maxX-minX)*slide, y: cfg.y };
    return { x: cfg.x, y: minY+(maxY-minY)*slide };
  }

  // Count coins of a color currently on board (position > 0 = on board)
  function coinsOnBoard(color: string): number {
    return allCoinsRef.current.filter(
      b => b.label===color && !pocketedIds.current.has(b.id) && b.position.x > 0
    ).length;
  }

  // ─────────────────────────────────────────
  //  COIN MANAGEMENT — reuse bodies, never destroy
  // ─────────────────────────────────────────

  // Move a coin off-screen (pocket it visually)
  function pocketBody(body: Matter.Body) {
    pocketedIds.current.add(body.id);
    Matter.Body.setPosition(body, { x: -500 - Math.random()*200, y: -500 - Math.random()*200 });
    Matter.Body.setVelocity(body, { x:0, y:0 });
    Matter.Body.setAngularVelocity(body, 0);
  }

  // Return one pocketed coin of given color back to center
  function returnCoin(color: string): boolean {
    const coin = allCoinsRef.current.find(
      b => b.label===color && pocketedIds.current.has(b.id)
    );
    if (!coin) return false;
    pocketedIds.current.delete(coin.id);
    Matter.Body.setPosition(coin, {
      x: BW/2 + (Math.random()-0.5)*COIN_R*4,
      y: BH/2 + (Math.random()-0.5)*COIN_R*4,
    });
    Matter.Body.setVelocity(coin, { x:0, y:0 });
    Matter.Body.setAngularVelocity(coin, 0);
    return true;
  }

  // Return queen to center
  function returnQueen() {
    const q = allCoinsRef.current.find(b => b.label==='queen');
    if (!q) return;
    pocketedIds.current.delete(q.id);
    Matter.Body.setPosition(q, { x: BW/2, y: BH/2 });
    Matter.Body.setVelocity(q, { x:0, y:0 });
    Matter.Body.setAngularVelocity(q, 0);
    queenPocketedRef.current = false;
    queenOwnerRef.current    = null;
    queenGraceRef.current    = 0;
    setQueenStatus('on_board');
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
    const grad = ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,W*0.72);
    grad.addColorStop(0,'#d4a820'); grad.addColorStop(0.55,'#b8860b'); grad.addColorStop(1,'#7c5a08');
    ctx.fillStyle = grad; ctx.fillRect(0,0,W,H);

    // Wood grain
    ctx.save(); ctx.globalAlpha=0.07; ctx.strokeStyle='#000'; ctx.lineWidth=1;
    for (let i=0;i<W;i+=10) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i+5,H); ctx.stroke(); }
    ctx.restore();

    // Border
    ctx.strokeStyle='#7c3e0c'; ctx.lineWidth=3; ctx.strokeRect(bp,bp,W-bp*2,H-bp*2);
    ctx.strokeStyle='#5c2a07'; ctx.lineWidth=1; ctx.strokeRect(bp+5,bp+5,W-bp*2-10,H-bp*2-10);

    // Pockets
    [[bp,bp],[W-bp,bp],[bp,H-bp],[W-bp,H-bp]].forEach(([cx2,cy2]) => {
      const pg = ctx.createRadialGradient(cx2,cy2,2,cx2,cy2,POCKET_R*s);
      pg.addColorStop(0,'#111'); pg.addColorStop(1,'#000');
      ctx.fillStyle=pg; ctx.beginPath(); ctx.arc(cx2,cy2,POCKET_R*s,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#3d1a00'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(cx2,cy2,POCKET_R*s+4,0,Math.PI*2); ctx.stroke();
    });

    // Center circles
    const cx=W/2, cy=H/2;
    ctx.strokeStyle='rgba(90,45,5,0.5)'; ctx.lineWidth=1.5;
    [5,11,20,34].forEach(r => { ctx.beginPath(); ctx.arc(cx,cy,r*s,0,Math.PI*2); ctx.stroke(); });
    ctx.fillStyle='rgba(90,45,5,0.55)'; ctx.beginPath(); ctx.arc(cx,cy,4*s,0,Math.PI*2); ctx.fill();

    // Diagonals
    ctx.strokeStyle='rgba(90,45,5,0.28)'; ctx.lineWidth=1;
    [[cx,cy,bp+28,bp+28],[cx,cy,W-bp-28,bp+28],[cx,cy,bp+28,H-bp-28],[cx,cy,W-bp-28,H-bp-28]].forEach(([x1,y1,x2,y2])=>{
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    });

    // Striker lane lines
    const numP = numPlayersRef.current;
    ctx.setLineDash([5,7]); ctx.lineWidth=1.5;
    if (numP===2) {
      ['p1','p2'].forEach(p => {
        ctx.strokeStyle = turnRef.current===p ? PLAYER_COLORS[p]+'bb' : 'rgba(255,255,255,0.12)';
        const ly = STRIKER_Y[p]*s;
        ctx.beginPath(); ctx.moveTo(bp+15,ly); ctx.lineTo(W-bp-15,ly); ctx.stroke();
      });
    } else {
      (['p1','p2','p3','p4'] as Player[]).forEach(p => {
        const cfg = STRIKER_CFG_4P[p];
        ctx.strokeStyle = turnRef.current===p ? PLAYER_COLORS[p]+'bb' : 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        if (cfg.axis==='h') { ctx.moveTo(bp+15,cfg.y*s); ctx.lineTo(W-bp-15,cfg.y*s); }
        else                { ctx.moveTo(cfg.x*s,bp+15); ctx.lineTo(cfg.x*s,H-bp-15); }
        ctx.stroke();
      });
    }
    ctx.setLineDash([]);

    // Draw bodies
    if (!engineRef.current) return;
    const bodies = Matter.Composite.allBodies(engineRef.current.world);
    for (const body of bodies) {
      if (pocketedIds.current.has(body.id)) continue;
      const { label } = body;
      if (label==='wall' || label==='pocket') continue;
      const bx = body.position.x*s, by = body.position.y*s;
      if (bx < 0 || by < 0) continue; // off-screen

      if (label==='striker') {
        const active = canShootRef.current && !isMovingRef.current;
        ctx.save();
        ctx.shadowColor='rgba(0,0,0,0.5)'; ctx.shadowBlur=6; ctx.shadowOffsetY=3;
        const sg = ctx.createRadialGradient(bx-3*s,by-3*s,1,bx,by,STRIKER_R*s);
        sg.addColorStop(0,'#d0d0ff'); sg.addColorStop(0.5,'#9090c0'); sg.addColorStop(1,'#505080');
        ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(bx,by,STRIKER_R*s,0,Math.PI*2); ctx.fill();
        ctx.shadowBlur=0; ctx.shadowOffsetY=0;
        ctx.strokeStyle=active?'#c0c0ff':'#666688'; ctx.lineWidth=active?2.5:1;
        ctx.beginPath(); ctx.arc(bx,by,STRIKER_R*s,0,Math.PI*2); ctx.stroke();
        ctx.strokeStyle='rgba(160,160,220,0.5)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.arc(bx,by,STRIKER_R*s*0.55,0,Math.PI*2); ctx.stroke();
        if (active) {
          ctx.globalAlpha=0.22; ctx.fillStyle=PLAYER_COLORS[turnRef.current]||'#8080ff';
          ctx.beginPath(); ctx.arc(bx,by,STRIKER_R*s+7,0,Math.PI*2); ctx.fill();
          ctx.globalAlpha=1;
        }
        ctx.restore(); continue;
      }

      ctx.save();
      let fg: CanvasGradient, outline: string, inner: string;
      if (label==='queen') {
        fg=ctx.createRadialGradient(bx-2*s,by-2*s,1,bx,by,COIN_R*s);
        fg.addColorStop(0,'#ff6666'); fg.addColorStop(1,'#cc2020');
        outline='#8b0000'; inner='rgba(255,180,180,0.55)';
      } else if (label==='white') {
        fg=ctx.createRadialGradient(bx-2*s,by-2*s,1,bx,by,COIN_R*s);
        fg.addColorStop(0,'#ffffff'); fg.addColorStop(1,'#d0d0d0');
        outline='#999'; inner='rgba(100,100,100,0.35)';
      } else {
        fg=ctx.createRadialGradient(bx-2*s,by-2*s,1,bx,by,COIN_R*s);
        fg.addColorStop(0,'#3a3a5e'); fg.addColorStop(1,'#0e0e20');
        outline='#000'; inner='rgba(100,100,160,0.4)';
      }
      ctx.shadowColor='rgba(0,0,0,0.45)'; ctx.shadowBlur=5; ctx.shadowOffsetY=2;
      ctx.fillStyle=fg; ctx.beginPath(); ctx.arc(bx,by,COIN_R*s,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0; ctx.shadowOffsetY=0;
      ctx.strokeStyle=outline; ctx.lineWidth=1; ctx.stroke();
      ctx.strokeStyle=inner; ctx.lineWidth=0.8;
      ctx.beginPath(); ctx.arc(bx,by,COIN_R*s*0.52,0,Math.PI*2); ctx.stroke();
      if (label==='queen') {
        ctx.fillStyle='#ffcc00';
        ctx.beginPath(); ctx.arc(bx,by,3*s,0,Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }

    // Queen cover reminder
    if (queenPocketedRef.current && !queenCoveredRef.current) {
      ctx.save(); ctx.globalAlpha=0.9;
      ctx.font=`bold ${14*s}px sans-serif`; ctx.textAlign='center';
      ctx.fillStyle='#fbbf24'; ctx.shadowColor='#000'; ctx.shadowBlur=6;
      ctx.fillText('👑 Queen cover karo!', W/2, bp+22*s);
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
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if (!isDraggingRef.current || !dragCurrentRef.current || !strikerRef.current) return;

    const s  = scaleRef.current;
    const sx = strikerRef.current.position.x*s;
    const sy = strikerRef.current.position.y*s;
    const tx = dragCurrentRef.current.x*s;
    const ty = dragCurrentRef.current.y*s;
    const dx = sx-tx, dy = sy-ty;
    const dist = Math.hypot(dx,dy);
    if (dist<4) return;

    const nx=dx/dist, ny=dy/dist;
    const pwr = Math.min(dist/(MAX_DRAG*s),1);

    ctx.save();
    ctx.globalAlpha=0.22; ctx.strokeStyle='#ffffff';
    ctx.lineWidth=10; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(tx,ty); ctx.stroke();

    const lineLen=(60+pwr*220)*s;
    const ex=sx+nx*lineLen, ey=sy+ny*lineLen;
    ctx.globalAlpha=0.92; ctx.strokeStyle='#ffffff'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.stroke();

    // Trajectory dots
    const bp=BOARD_PAD*s;
    const W=canvas.width, H=canvas.height;
    let px=ex,py=ey,vx=nx,vy=ny;
    const step=9, dots=Math.floor(pwr*28)+8;
    ctx.globalAlpha=0.5; ctx.setLineDash([5,9]);
    ctx.strokeStyle='rgba(255,215,80,0.7)'; ctx.lineWidth=1.8;
    ctx.beginPath(); ctx.moveTo(px,py);
    for (let i=0;i<dots;i++) {
      px+=vx*step; py+=vy*step;
      if (px<=bp||px>=W-bp) { vx=-vx; px=Math.max(bp+1,Math.min(W-bp-1,px)); }
      if (py<=bp||py>=H-bp) { vy=-vy; py=Math.max(bp+1,Math.min(H-bp-1,py)); }
      ctx.lineTo(px,py);
    }
    ctx.stroke(); ctx.setLineDash([]);

    // Collision highlight
    if (engineRef.current) {
      const sr=STRIKER_R*s, cr=COIN_R*s, stepC=4;
      let cpx=ex,cpy=ey;
      for (let i=0;i<200;i++) {
        cpx+=nx*stepC; cpy+=ny*stepC;
        const bodies=Matter.Composite.allBodies(engineRef.current.world);
        for (const coin of bodies) {
          if (pocketedIds.current.has(coin.id)) continue;
          if (!['white','black','queen'].includes(coin.label)) continue;
          if (coin.position.x<0||coin.position.y<0) continue;
          const cx2=coin.position.x*s, cy2=coin.position.y*s;
          if (Math.hypot(cpx-cx2,cpy-cy2)<sr+cr) {
            ctx.globalAlpha=0.55; ctx.strokeStyle='#f59e0b';
            ctx.lineWidth=2; ctx.shadowColor='#f59e0b'; ctx.shadowBlur=6;
            ctx.beginPath(); ctx.arc(cx2,cy2,cr+4,0,Math.PI*2); ctx.stroke();
            i=9999; break;
          }
        }
      }
    }

    const pColor=pwr>0.75?'#ef4444':pwr>0.42?'#f59e0b':'#10b981';
    ctx.globalAlpha=1; ctx.fillStyle=pColor;
    ctx.shadowColor=pColor; ctx.shadowBlur=8;
    ctx.beginPath(); ctx.arc(ex,ey,5.5,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // ─────────────────────────────────────────
  //  PHYSICS INIT
  // ─────────────────────────────────────────
  function initPhysics() {
    if (engineRef.current) {
      Matter.Runner.stop(runnerRef.current!);
      Matter.Engine.clear(engineRef.current);
    }
    pocketedIds.current.clear();
    allCoinsRef.current = [];

    const engine = Matter.Engine.create({ gravity: { x:0, y:0 } });
    const runner  = Matter.Runner.create();
    engineRef.current = engine;
    runnerRef.current = runner;

    // Walls
    const wOpts = { isStatic:true, restitution:0.76, friction:0, label:'wall' };
    const hp = BOARD_PAD/2;
    const walls = [
      Matter.Bodies.rectangle(BW/2, hp,      BW, BOARD_PAD, wOpts),
      Matter.Bodies.rectangle(BW/2, BH-hp,   BW, BOARD_PAD, wOpts),
      Matter.Bodies.rectangle(hp,   BH/2,    BOARD_PAD, BH, wOpts),
      Matter.Bodies.rectangle(BW-hp,BH/2,    BOARD_PAD, BH, wOpts),
    ];

    // Pocket sensors
    const pocketCorners = [
      {x:BOARD_PAD,y:BOARD_PAD},{x:BW-BOARD_PAD,y:BOARD_PAD},
      {x:BOARD_PAD,y:BH-BOARD_PAD},{x:BW-BOARD_PAD,y:BH-BOARD_PAD},
    ];
    const pockets = pocketCorners.map(c =>
      Matter.Bodies.circle(c.x,c.y,POCKET_R,{ isStatic:true, isSensor:true, label:'pocket' })
    );

    // ── Coins: 9 white + 9 black + 1 queen = 19 total ──
    // Real carrom setup:
    //   Center: queen
    //   Inner ring (6): alternating white/black starting with white
    //     positions at 0°,60°,120°,180°,240°,300°
    //   Outer ring (12): alternating black/white starting with black
    //     positions at 0°,30°,60°,...,330°
    // Inner: 3 white + 3 black  |  Outer: 6 black + 6 white
    // Total: 3+6=9 white, 3+6=9 black ✓
    const cOpts = (lbl:string) => ({
      restitution:0.72, friction:0.04, frictionAir:0.016, density:0.002, label:lbl,
    });
    const cx=BW/2, cy=BH/2;
    const coins: Matter.Body[] = [];

    // Queen at center
    coins.push(Matter.Bodies.circle(cx, cy, COIN_R, cOpts('queen')));

    // Inner ring: 6 coins, radius = COIN_R*2.4
    for (let i=0;i<6;i++) {
      const a = (i/6)*Math.PI*2;
      const lbl = i%2===0 ? 'white' : 'black';
      coins.push(Matter.Bodies.circle(
        cx+Math.cos(a)*COIN_R*2.4,
        cy+Math.sin(a)*COIN_R*2.4,
        COIN_R, cOpts(lbl)
      ));
    }

    // Outer ring: 12 coins, radius = COIN_R*4.6
    for (let i=0;i<12;i++) {
      const a = (i/12)*Math.PI*2 + Math.PI/12;
      const lbl = i%2===0 ? 'black' : 'white';
      coins.push(Matter.Bodies.circle(
        cx+Math.cos(a)*COIN_R*4.6,
        cy+Math.sin(a)*COIN_R*4.6,
        COIN_R, cOpts(lbl)
      ));
    }

    allCoinsRef.current = coins;

    // Striker
    const sPos = getStrikerPos(turnRef.current);
    const striker = Matter.Bodies.circle(sPos.x, sPos.y, STRIKER_R, {
      restitution:0.78, friction:0.05, frictionAir:0.022, density:0.005, label:'striker',
    });
    strikerRef.current = striker;

    Matter.Composite.add(engine.world, [...walls, ...pockets, ...coins, striker]);

    // Collision events
    Matter.Events.on(engine, 'collisionStart', (evt: Matter.IEventCollision<Matter.Engine>) => {
      for (const pair of evt.pairs) {
        const { bodyA, bodyB } = pair;
        // Wall bounce sound
        if ((bodyA.label==='wall'&&bodyB.label==='striker')||(bodyB.label==='wall'&&bodyA.label==='striker')) {
          playSound('border');
        }
        // Pocket detection
        const isPocketA = bodyA.label==='pocket';
        const isPocketB = bodyB.label==='pocket';
        if (isPocketA || isPocketB) {
          const coin = isPocketA ? bodyB : bodyA;
          if (coin && coin.label!=='wall' && coin.label!=='pocket') {
            if (!pocketedIds.current.has(coin.id) && coin.position.x>0 && coin.position.y>0) {
              handlePocket(coin);
            }
          }
        }
      }
    });

    // Stop detection
    Matter.Events.on(engine, 'afterUpdate', () => {
      if (!isMovingRef.current) return;
      const bodies = Matter.Composite.allBodies(engine.world);
      const moving = bodies.some((b:Matter.Body) => {
        if (b.isStatic) return false;
        if (b.position.x<0||b.position.y<0) return false;
        const v=b.velocity, av=b.angularVelocity;
        return (v.x*v.x+v.y*v.y)>0.008 || Math.abs(av)>0.008;
      });
      if (!moving) {
        isMovingRef.current = false;
        // In online mode: if this physics was triggered by opponent's strike,
        // skip afterShot locally — shooter already resolved and will sync turn via sync_state.
        if (modeRef.current === 'online_playing' && isReceivedStrikeRef.current) {
          isReceivedStrikeRef.current = false;
          return; // canShootRef stays false until sync_state arrives with our turn
        }
        isReceivedStrikeRef.current = false;
        setTimeout(afterShot, 250);
      }
    });

    Matter.Runner.run(runner, engine);
  }

  // ─────────────────────────────────────────
  //  POCKET HANDLER
  //
  //  Real carrom rules:
  //  1. STRIKER pocketed → foul, turn passes
  //     Penalty: return one own coin to board (if any pocketed)
  //     No extra turn even if own coin was also pocketed same shot
  //
  //  2. OWN coin pocketed → extra turn
  //     If queen was pending cover → this covers it (queen stays pocketed)
  //
  //  3. OPPONENT coin pocketed → foul, opponent's coin returns to board
  //     Turn passes, no points to anyone for that coin
  //
  //  4. QUEEN pocketed → start grace period
  //     Same shot: if own coin also pocketed → covered immediately
  //     Next shot: if own coin pocketed → covered
  //     If not covered → queen returns to center
  // ─────────────────────────────────────────
  function handlePocket(body: Matter.Body) {
    if (pocketedIds.current.has(body.id)) return;
    playSound('pocket');
    spawnParticles(body.position.x, body.position.y, body.label);

    // Move off-screen immediately (reuse body, never destroy)
    pocketBody(body);

    const label = body.label;
    const cur   = turnRef.current;
    const numP  = numPlayersRef.current;
    const myColor = coinColorOf(cur, numP);

    // ── 1. STRIKER ──
    if (label==='striker') {
      strikerPocketedRef.current = true;
      foulThisTurnRef.current    = true;
      extraTurnRef.current       = false;
      return;
    }

    // ── 2. QUEEN ──
    if (label==='queen') {
      queenPocketedRef.current = true;
      queenOwnerRef.current    = cur;
      queenGraceRef.current    = 1; // grace: cover same shot or next shot
      setQueenStatus('pocketed_uncovered');
      setQueenMsg('👑 Queen! Apna coin pocket karo cover ke liye');
      setTimeout(()=>setQueenMsg(''),3000);
      return;
    }

    // ── 3. OWN COIN ──
    if (label===myColor) {
      ownCoinPocketedRef.current = true;

      // Does this cover the queen?
      if (queenPocketedRef.current && !queenCoveredRef.current && queenOwnerRef.current===cur) {
        queenCoveredRef.current = true;
        queenGraceRef.current   = 0;
        setQueenStatus('covered');
        setQueenMsg(`👑 Queen cover! +${QUEEN_COVER_BONUS} bonus!`);
        setTimeout(()=>setQueenMsg(''),2500);
        // Add queen cover bonus points
        setScores(prev => {
          const next={...prev};
          next[cur] += QUEEN_COVER_BONUS;
          scoresRef.current = next;
          return next;
        });
      }

      // Score point
      setScores(prev => {
        const next={...prev};
        next[cur] += 1;
        scoresRef.current = next;
        return next;
      });

      if (!foulThisTurnRef.current) extraTurnRef.current = true;
      resetConsecFouls(cur);
      setExtraTurnMsg(true);
      setTimeout(()=>setExtraTurnMsg(false),1200);
      return;
    }

    // ── 4. OPPONENT COIN ──
    // Foul: opponent's coin goes back, turn passes
    oppCoinPocketedRef.current = true;
    foulThisTurnRef.current    = true;
    extraTurnRef.current       = false;
    // Return opponent's coin to board immediately
    setTimeout(() => returnCoin(label), 400);
    playSound('foul');
    showFoul(`⚠️ FOUL — ${label==='white'?'⚪':'⚫'} opponent ka coin! Wapas aayega.`);
  }

  // ─────────────────────────────────────────
  //  AFTER SHOT — resolve all end-of-shot logic
  // ─────────────────────────────────────────
  function afterShot() {
    const cur  = turnRef.current;
    const numP = numPlayersRef.current;

    // ── Resolve striker foul ──
    if (strikerPocketedRef.current) {
      playSound('foul');
      const myColor = coinColorOf(cur, numP);
      // Penalty: one own pocketed coin returns (if available)
      if (!returnCoin(myColor)) {
        // No own coin pocketed — no penalty coin, but still a foul
      }
      showFoul('⚠️ FOUL — Striker pocket hua! Turn jaata hai.');
      // Restore striker
      strikerPocketedRef.current = false;
      pocketedIds.current.delete(strikerRef.current!.id);
      // striker will be repositioned by resetStriker()
    }

    // ── Queen grace resolution ──
    if (queenPocketedRef.current && !queenCoveredRef.current) {
      if (queenGraceRef.current===1) {
        // Queen pocketed this shot but NOT covered same shot
        // → consume grace: player gets next shot to cover (only if no foul)
        queenGraceRef.current = -1; // grace consumed
        if (!foulThisTurnRef.current && ownCoinPocketedRef.current===false) {
          // Give extra shot to cover (only if didn't already get extra turn for own coin)
          extraTurnRef.current = true;
          setQueenMsg('👑 Agli shot mein apna coin pocket karo — queen cover karo!');
          setTimeout(()=>setQueenMsg(''),3000);
        }
      } else if (queenGraceRef.current===-1) {
        // Grace was used last shot, this shot didn't cover → queen returns
        returnQueen();
        showFoul('👑 Queen cover nahi hua — center mein wapas!');
      }
    }

    // ── Air shot / due check ──
    // If no coin was pocketed at all (not own, not opponent, no striker foul)
    // AND queen wasn't pocketed → no-score, turn just passes (not a foul per se,
    // but we pass turn naturally in endTurn)

    // ── Reset per-shot flags ──
    strikerPocketedRef.current = false;
    ownCoinPocketedRef.current = false;
    oppCoinPocketedRef.current = false;

    syncCoinCounts();
    checkWin();
    endTurn(foulThisTurnRef.current);
    foulThisTurnRef.current = false;
  }

  // ─────────────────────────────────────────
  //  SYNC COIN COUNTS TO STATE
  // ─────────────────────────────────────────
  function syncCoinCounts() {
    setWhiteLeft(coinsOnBoard('white'));
    setBlackLeft(coinsOnBoard('black'));
  }

  // ─────────────────────────────────────────
  //  END TURN
  // ─────────────────────────────────────────
  function endTurn(wasFoul: boolean) {
    clearTimer();

    if (wasFoul) {
      addConsecFoul(turnRef.current);
      extraTurnRef.current = false;
    }

    if (!extraTurnRef.current) {
      const nxt = nextPlayer(turnRef.current);
      setTurn(nxt); turnRef.current = nxt;
    }
    extraTurnRef.current = false;

    resetStriker();
    // Online: only allow shooting if it's now THIS client's turn.
    // In local/bot modes always allow (turn visual handles it).
    if (modeRef.current === 'online_playing') {
      canShootRef.current = roleRef.current === turnRef.current;
    } else {
      canShootRef.current = true;
    }

    // Online sync
    if (modeRef.current==='online_playing' && roomIdRef.current) {
      const bodies = Matter.Composite.allBodies(engineRef.current!.world);
      const coinState = bodies
        .filter((b:Matter.Body) => ['white','black','queen'].includes(b.label))
        .map((b:Matter.Body) => ({ id:b.id, pos:b.position, angle:b.angle }));
      mockBackend.publish(('carrom_sync_'+roomIdRef.current) as any, {
        type:'sync_state', turn:turnRef.current, scores:scoresRef.current, coins:coinState,
      });
    }

    updateStatus();
    const isBotTurn = modeRef.current==='bot' && turnRef.current==='p2';
    if (isBotTurn) setTimeout(runBot, 900+Math.random()*700);
    else startTimer();
  }

  function resetStriker() {
    if (!strikerRef.current) return;
    strikerSlideRef.current = 0.5;
    const pos = getStrikerPos(turnRef.current);
    Matter.Body.setPosition(strikerRef.current, pos);
    Matter.Body.setVelocity(strikerRef.current, { x:0, y:0 });
    Matter.Body.setAngularVelocity(strikerRef.current, 0);
    pocketedIds.current.delete(strikerRef.current.id);
    isDraggingRef.current  = false;
    dragCurrentRef.current = null;
  }

  // ─────────────────────────────────────────
  //  FOUL TRACKING
  // ─────────────────────────────────────────
  function addConsecFoul(player: Player) {
    const next = { ...consecFoulsRef.current, [player]: consecFoulsRef.current[player]+1 };
    consecFoulsRef.current = next; setConsecFouls({...next});
    if (next[player] >= MAX_CONSEC_FOULS) {
      // 3 consecutive fouls: 5 point penalty, reset foul counter
      setScores(prev => {
        const s2={...prev}; s2[player]=Math.max(0,s2[player]-5);
        scoresRef.current=s2; return s2;
      });
      consecFoulsRef.current = { ...next, [player]:0 };
      setConsecFouls({ ...next, [player]:0 });
      showFoul(`🚫 ${PLAYER_NAMES[player]}: 3 fouls! -5 points!`);
    }
  }

  function resetConsecFouls(player: Player) {
    const next = { ...consecFoulsRef.current, [player]:0 };
    consecFoulsRef.current = next; setConsecFouls({...next});
  }

  // ─────────────────────────────────────────
  //  WIN CHECK
  // ─────────────────────────────────────────
  function checkWin() {
    const active = activePlayers();
    const numP   = numPlayersRef.current;

    for (const p of active) {
      const myColor = coinColorOf(p, numP);
      if (coinsOnBoard(myColor)===0 && queenCoveredRef.current) {
        // All my coins pocketed and queen covered → win
        // (In 4P, teammate's coins count too)
        if (numP===4) {
          const team = teamOf(p);
          const teamCoins = team.reduce((sum,t)=>sum+coinsOnBoard(coinColorOf(t,numP)),0);
          if (teamCoins===0) { triggerWin(p); return; }
        } else {
          triggerWin(p); return;
        }
      }
    }

    // All coins gone
    const totalLeft = coinsOnBoard('white') + coinsOnBoard('black');
    if (totalLeft===0 && queenCoveredRef.current) {
      let best = active[0];
      for (const p of active) if (scoresRef.current[p]>scoresRef.current[best]) best=p;
      triggerWin(best);
    }
  }

  function triggerWin(player: Player) {
    clearTimer(); canShootRef.current=false;
    playSound('win'); setWinner(player);
  }

  // ─────────────────────────────────────────
  //  TIMER
  // ─────────────────────────────────────────
  function startTimer() {
    clearTimer();
    timerValRef.current = TURN_TIME; setTimerVal(TURN_TIME);
    timerRef.current = setInterval(() => {
      timerValRef.current -= 1; setTimerVal(timerValRef.current);
      if (timerValRef.current<=5) playSound('tick');
      if (timerValRef.current<=0) {
        clearTimer();
        // Timeout = foul
        showFoul('⏱️ Time out! FOUL');
        const myColor = coinColorOf(turnRef.current, numPlayersRef.current);
        returnCoin(myColor); // penalty: own coin returns
        foulThisTurnRef.current = true;
        endTurn(true); foulThisTurnRef.current = false;
      }
    },1000);
  }
  function clearTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current=null; }
  }

  // ─────────────────────────────────────────
  //  AI BOT
  // ─────────────────────────────────────────
  function runBot() {
    if (!canShootRef.current||isMovingRef.current||turnRef.current!=='p2') return;
    canShootRef.current=false; isMovingRef.current=true;
    if (!strikerRef.current||!engineRef.current) return;

    const sx=strikerRef.current.position.x, sy=strikerRef.current.position.y;
    const myColor=coinColorOf('p2',numPlayersRef.current);
    // Prefer queen if uncovered
    const targets = allCoinsRef.current.filter(
      b => !pocketedIds.current.has(b.id) && b.position.x>0 &&
           (b.label===myColor || (b.label==='queen'&&!queenCoveredRef.current))
    );

    let tx=BW/2, ty=BH/2;
    if (targets.length>0) {
      let best: Matter.Body|null=null, bestD=Infinity;
      for (const t of targets) {
        const d=Math.hypot(t.position.x-sx,t.position.y-sy);
        if (d<bestD) { bestD=d; best=t; }
      }
      if (best) { tx=best.position.x; ty=best.position.y; }
    }
    tx+=(Math.random()-0.5)*24; ty+=(Math.random()-0.5)*24;

    const dx=tx-sx, dy=ty-sy, dist=Math.hypot(dx,dy);
    const pwr=0.45+Math.random()*0.5;
    foulThisTurnRef.current=false; strikerPocketedRef.current=false;
    ownCoinPocketedRef.current=false; oppCoinPocketedRef.current=false;
    Matter.Body.applyForce(strikerRef.current, strikerRef.current.position, {
      x:(dx/dist)*pwr*MAX_FORCE, y:(dy/dist)*pwr*MAX_FORCE,
    });
    playSound('shoot',pwr); setPower(0);
  }

  // ─────────────────────────────────────────
  //  ONLINE SYNC
  // ─────────────────────────────────────────
  useEffect(() => {
    if (mode!=='online_playing'||!roomId) return;
    const unsub = mockBackend.subscribe(('carrom_sync_'+roomId) as any, (data:any) => {
      if (data.type==='strike') {
        // Ignore echo of our own shot
        if (data.shooter===roleRef.current) return;
        // Only apply if it's currently the opponent's turn (not ours)
        if (turnRef.current!==roleRef.current&&strikerRef.current&&canShootRef.current) {
          canShootRef.current=false; isMovingRef.current=true;
          isReceivedStrikeRef.current=true; // mark: physics from opponent, skip afterShot
          Matter.Body.setPosition(strikerRef.current,data.position);
          Matter.Body.applyForce(strikerRef.current,data.position,data.force);
        }
      } else if (data.type==='sync_state') {
        if (data.scores) { setScores(data.scores); scoresRef.current=data.scores; }
        if (data.turn) {
          setTurn(data.turn); turnRef.current=data.turn;
          // Now that authoritative turn is received, allow shooting only if it's our turn
          canShootRef.current = roleRef.current === data.turn;
          isMovingRef.current = false;
          isReceivedStrikeRef.current = false;
        }
        if (data.winner) setWinner(data.winner);
      }
    });
    return ()=>unsub();
  },[mode,roomId]);

  // ─────────────────────────────────────────
  //  INPUT
  // ─────────────────────────────────────────
  function physicsPos(e: React.PointerEvent): {x:number;y:number} {
    const canvas=boardCanvasRef.current!;
    const rect=canvas.getBoundingClientRect();
    return { x:(e.clientX-rect.left)/scaleRef.current, y:(e.clientY-rect.top)/scaleRef.current };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!canShootRef.current||isMovingRef.current) return;
    if (modeRef.current==='bot'&&turnRef.current==='p2') return;
    if (modeRef.current==='online_playing'&&roleRef.current!==turnRef.current) return;
    if (!strikerRef.current) return;

    const pos=physicsPos(e);
    const sx=strikerRef.current.position.x, sy=strikerRef.current.position.y;

    // Lane tap: slide striker
    if (Math.hypot(pos.x-sx,pos.y-sy)>STRIKER_R*4.5) {
      const cur=turnRef.current, numP=numPlayersRef.current;
      const minX=BOARD_PAD+STRIKER_R+10, maxX=BW-BOARD_PAD-STRIKER_R-10;
      const minY=BOARD_PAD+STRIKER_R+10, maxY=BH-BOARD_PAD-STRIKER_R-10;
      if (numP===2) {
        const laneY=STRIKER_Y[cur];
        if (Math.abs(pos.y-laneY)<STRIKER_R*2) {
          const cx2=Math.max(minX,Math.min(maxX,pos.x));
          strikerSlideRef.current=(cx2-minX)/(maxX-minX);
          Matter.Body.setPosition(strikerRef.current,{x:cx2,y:laneY});
          Matter.Body.setVelocity(strikerRef.current,{x:0,y:0});
        }
      } else {
        const cfg=STRIKER_CFG_4P[cur];
        if (cfg.axis==='h'&&Math.abs(pos.y-cfg.y)<STRIKER_R*2) {
          const cx2=Math.max(minX,Math.min(maxX,pos.x));
          strikerSlideRef.current=(cx2-minX)/(maxX-minX);
          Matter.Body.setPosition(strikerRef.current,{x:cx2,y:cfg.y});
          Matter.Body.setVelocity(strikerRef.current,{x:0,y:0});
        } else if (cfg.axis==='v'&&Math.abs(pos.x-cfg.x)<STRIKER_R*2) {
          const cy2=Math.max(minY,Math.min(maxY,pos.y));
          strikerSlideRef.current=(cy2-minY)/(maxY-minY);
          Matter.Body.setPosition(strikerRef.current,{x:cfg.x,y:cy2});
          Matter.Body.setVelocity(strikerRef.current,{x:0,y:0});
        }
      }
      return;
    }

    isDraggingRef.current=true; dragCurrentRef.current=pos;
    clearTimer();
  }

  function onPointerMove(e: React.PointerEvent) {
    const pos=physicsPos(e);
    if (isDraggingRef.current&&strikerRef.current) {
      dragCurrentRef.current=pos;
      const dx=strikerRef.current.position.x-pos.x, dy=strikerRef.current.position.y-pos.y;
      setPower(Math.min(Math.hypot(dx,dy)/MAX_DRAG,1));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!isDraggingRef.current||!dragCurrentRef.current||!strikerRef.current) {
      isDraggingRef.current=false; dragCurrentRef.current=null; setPower(0); return;
    }
    const pos=dragCurrentRef.current;
    const sx=strikerRef.current.position.x, sy=strikerRef.current.position.y;
    const dx=sx-pos.x, dy=sy-pos.y, dist=Math.hypot(dx,dy);
    isDraggingRef.current=false; dragCurrentRef.current=null; setPower(0);
    if (dist<6) { startTimer(); return; }

    const clamped=Math.min(dist,MAX_DRAG);
    const pwr=clamped/MAX_DRAG;
    const fx=(dx/dist)*pwr*MAX_FORCE, fy=(dy/dist)*pwr*MAX_FORCE;

    canShootRef.current=false; isMovingRef.current=true;
    foulThisTurnRef.current=false; strikerPocketedRef.current=false;
    ownCoinPocketedRef.current=false; oppCoinPocketedRef.current=false;

    Matter.Body.applyForce(strikerRef.current,strikerRef.current.position,{x:fx,y:fy});
    playSound('shoot',pwr);

    if (modeRef.current==='online_playing'&&roomIdRef.current) {
      mockBackend.publish(('carrom_sync_'+roomIdRef.current) as any, {
        type:'strike', force:{x:fx,y:fy}, position:strikerRef.current.position,
        shooter:roleRef.current,
      });
    }
  }

  // ─────────────────────────────────────────
  //  GAME LOOP
  // ─────────────────────────────────────────
  function startLoop() {
    const loop=()=>{ renderBoard(); renderAim(); rafRef.current=requestAnimationFrame(loop); };
    rafRef.current=requestAnimationFrame(loop);
  }
  function stopLoop() { if (rafRef.current) cancelAnimationFrame(rafRef.current); }

  // ─────────────────────────────────────────
  //  UI HELPERS
  // ─────────────────────────────────────────
  function showFoul(msg: string) {
    setFoulMsg(msg); setTimeout(()=>setFoulMsg(''),2800);
  }
  function updateStatus() {
    const cur=turnRef.current, m=modeRef.current;
    if (m==='bot'&&cur==='p2') setStatusMsg('🤖 AI aim kar raha hai…');
    else setStatusMsg('Lane tap → position · Drag → aim & shoot!');
  }

  function spawnParticles(physX: number, physY: number, coinLabel: string) {
    const wrap=wrapRef.current, canvas=boardCanvasRef.current;
    if (!wrap||!canvas) return;
    const s=scaleRef.current;
    const cRect=canvas.getBoundingClientRect(), wRect=wrap.getBoundingClientRect();
    const cx2=cRect.left-wRect.left+physX*s, cy2=cRect.top-wRect.top+physY*s;
    const colorSets: Record<string,string[]> = {
      queen:['#f59e0b','#ef4444','#fbbf24','#ff8800'],
      white:['#e0e0e0','#ffffff','#c8c8c8'],
      black:['#4444aa','#1e293b','#6666cc','#333366'],
      striker:['#9090c0','#c0c0e0'],
    };
    const cols=colorSets[coinLabel]||['#fff'];
    for (let i=0;i<14;i++) {
      const p=document.createElement('div');
      const angle=Math.random()*Math.PI*2, d=28+Math.random()*55, sz=4+Math.random()*6;
      p.style.cssText=[
        `position:absolute`,`left:${cx2}px`,`top:${cy2}px`,
        `width:${sz}px`,`height:${sz}px`,`border-radius:50%`,
        `background:${cols[Math.floor(Math.random()*cols.length)]}`,
        `pointer-events:none`,`z-index:99`,
        `--dx:${Math.cos(angle)*d}px`,`--dy:${Math.sin(angle)*d}px`,
        `animation:particle-fly ${0.5+Math.random()*0.45}s ease-out forwards`,
      ].join(';');
      wrap.appendChild(p);
      setTimeout(()=>p.remove(),1100);
    }
  }

  // ─────────────────────────────────────────
  //  GAME START
  // ─────────────────────────────────────────
  function startGame(gameMode: Mode, numPlayers=2) {
    numPlayersRef.current=numPlayers;
    setMode(gameMode); modeRef.current=gameMode;
    setTurn('p1'); turnRef.current='p1';
    setScores({p1:0,p2:0,p3:0,p4:0}); scoresRef.current={p1:0,p2:0,p3:0,p4:0};
    setWhiteLeft(9); setBlackLeft(9);
    setWinner(null); setTimerVal(TURN_TIME); setPower(0);
    setFoulMsg(''); setQueenMsg(''); setExtraTurnMsg(false);
    setQueenStatus('on_board');
    setConsecFouls({p1:0,p2:0,p3:0,p4:0}); consecFoulsRef.current={p1:0,p2:0,p3:0,p4:0};
    setDisqualified(new Set()); disqRef.current=new Set();
    canShootRef.current=true; isMovingRef.current=false;
    isReceivedStrikeRef.current=false;
    extraTurnRef.current=false; foulThisTurnRef.current=false;
    strikerPocketedRef.current=false; ownCoinPocketedRef.current=false;
    oppCoinPocketedRef.current=false;
    queenPocketedRef.current=false; queenCoveredRef.current=false;
    queenOwnerRef.current=null; queenGraceRef.current=0;
    isDraggingRef.current=false; dragCurrentRef.current=null;
    strikerSlideRef.current=0.5;
    setStatusMsg('Lane tap → position · Drag → aim & shoot!');
  }

  // Canvas + physics setup after mode change
  useEffect(() => {
    if (mode==='menu'||mode==='online_lobby') return;
    const timer=setTimeout(()=>{
      const canvas=boardCanvasRef.current, aim=aimCanvasRef.current, wrap=wrapRef.current;
      if (!canvas||!aim||!wrap) return;
      const sz=Math.min(wrap.clientWidth,wrap.clientHeight,440)-4;
      canvas.width=sz; canvas.height=sz; aim.width=sz; aim.height=sz;
      scaleRef.current=sz/BW;
      initPhysics(); stopLoop(); startLoop(); startTimer();
      syncCoinCounts();
      if (mode==='bot'&&turnRef.current==='p2') setTimeout(runBot,900);
    },60);
    return ()=>{
      clearTimeout(timer); stopLoop(); clearTimer();
      if (engineRef.current) {
        Matter.Runner.stop(runnerRef.current!);
        Matter.Engine.clear(engineRef.current);
        engineRef.current=null;
      }
    };
  },[mode]);

  // ─────────────────────────────────────────
  //  AUTO-LAUNCH from RoomHub
  // ─────────────────────────────────────────
  if (mode==='menu'&&mpSession.forGame('carrom')) {
    const sess=mpSession.forGame('carrom')!;
    setTimeout(()=>{
      setRole(sess.role as Player); roleRef.current=sess.role as Player;
      setRoomId(sess.roomId); roomIdRef.current=sess.roomId;
      mockBackend.joinRoom(sess.roomId);
      startGame('online_playing',sess.maxPlayers);
    },0);
  }

  if (mode==='online_lobby') return (
    <CarromOnlineLobby
      onStartGame={(r,id,np)=>{
        setRole(r); roleRef.current=r;
        setRoomId(id); roomIdRef.current=id;
        startGame('online_playing',np);
      }}
      onBack={()=>setMode('menu')}
    />
  );

  // ─────────────────────────────────────────
  //  RENDER — MENU
  // ─────────────────────────────────────────
  if (mode==='menu') return (
    <div className="flex flex-col items-center justify-center p-6 h-full text-white bg-gradient-to-b from-[#12181f] to-[#0a0e14]">
      <div className="absolute top-5 left-5">
        <button onClick={()=>onGameOver(0)} className="text-gray-500 hover:text-white transition flex items-center gap-2 text-sm">
          <ArrowLeft className="w-4 h-4"/> Hub
        </button>
      </div>
      <div className="flex flex-col items-center mb-7">
        <div className="relative mb-4">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center shadow-[0_0_40px_rgba(245,158,11,0.5)]">
            <CircleDot className="w-12 h-12 text-white"/>
          </div>
          <div className="absolute -top-1 -right-1 w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center">
            <Star className="w-3.5 h-3.5 text-yellow-800"/>
          </div>
        </div>
        <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-amber-400 to-red-500 bg-clip-text text-transparent">CARROM POOL</h1>
        <p className="text-gray-500 text-sm mt-1 tracking-widest uppercase">Real Rules</p>
      </div>

      <div className="flex gap-4 mb-6 bg-gray-800/50 rounded-2xl px-5 py-3 border border-gray-700/50">
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded-full bg-white border border-gray-400"/><span className="text-xs text-gray-300 font-bold">9 White</span></div>
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded-full bg-[#1a1a2e] border border-blue-400"/><span className="text-xs text-gray-300 font-bold">9 Black</span></div>
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded-full bg-red-600 border border-red-300"/><span className="text-xs text-yellow-400 font-bold">👑 Queen</span></div>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button onClick={()=>startGame('bot',2)} className="group w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-amber-600 to-amber-500 text-white font-bold shadow-[0_4px_20px_rgba(245,158,11,0.4)] active:scale-[0.97] transition-all flex items-center gap-3">
          <Bot className="w-5 h-5 group-hover:rotate-12 transition-transform"/>
          <span className="flex-1 text-left">VS AI Bot</span>
          <Zap className="w-4 h-4 opacity-70"/>
        </button>
        <button onClick={()=>startGame('local2',2)} className="group w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-bold shadow-[0_4px_20px_rgba(59,130,246,0.4)] active:scale-[0.97] transition-all flex items-center gap-3">
          <Users className="w-5 h-5"/>
          <span className="flex-1 text-left">2 Player Local</span>
          <span className="text-xs opacity-70 font-normal">Opposite sides</span>
        </button>
        <button onClick={()=>startGame('local4',4)} className="group w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 text-white font-bold shadow-[0_4px_20px_rgba(168,85,247,0.4)] active:scale-[0.97] transition-all flex items-center gap-3">
          <User className="w-5 h-5"/>
          <span className="flex-1 text-left">4 Player Local</span>
          <span className="text-xs opacity-70 font-normal">Clockwise teams</span>
        </button>
        <button onClick={()=>setMode('online_lobby')} className="group w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-green-600 to-emerald-500 text-white font-bold shadow-[0_4px_20px_rgba(16,185,129,0.4)] active:scale-[0.97] transition-all flex items-center gap-3">
          <Globe className="w-5 h-5 group-hover:animate-spin"/>
          <span className="flex-1 text-left">Online Play</span>
          <span className="text-xs opacity-70 font-normal">2P or 4P</span>
        </button>
      </div>

      <div className="mt-6 text-[11px] text-gray-600 text-center max-w-xs leading-relaxed">
        9 white + 9 black + 1 queen · Apna coin pocket → extra turn<br/>
        Opponent ka coin → FOUL (wapas aayega) · Queen cover karo<br/>
        Striker pocket → FOUL · 3 fouls = -5 points
      </div>
    </div>
  );

  // ─────────────────────────────────────────
  //  RENDER — GAME
  // ─────────────────────────────────────────
  const timerPct   = timerVal/TURN_TIME;
  const timerColor = timerVal<=5?'#ef4444':timerVal<=10?'#f59e0b':'#10b981';
  const pwrColor   = power>0.75?'#ef4444':power>0.42?'#f59e0b':'#10b981';
  const isMyTurn   = mode!=='online_playing'||role===turn;
  const canInteract = canShootRef.current&&!isMovingRef.current&&isMyTurn&&(mode!=='bot'||turn==='p1');
  const numP = numPlayersRef.current;

  function pName(p: Player) { return p==='p2'&&mode==='bot' ? 'AI Bot' : PLAYER_NAMES[p]; }

  const p1Color = coinColorOf('p1', numP);
  const p2Color = coinColorOf('p2', numP);

  return (
    <div className="flex flex-col items-center h-full text-white bg-gradient-to-b from-[#12181f] to-[#0a0e14] overflow-hidden select-none">

      {/* ── Top HUD ── */}
      <div className="flex items-center justify-between w-full max-w-[440px] px-3 pt-3 pb-1">
        <button onClick={()=>{stopLoop();clearTimer();onGameOver(Math.max(scores.p1,scores.p2,scores.p3,scores.p4),'Completed');}}
          className="text-gray-500 hover:text-white transition flex items-center gap-1.5 text-xs">
          <ArrowLeft className="w-3.5 h-3.5"/> Exit
        </button>
        <div className={`px-4 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all ${
          extraTurnMsg ? 'bg-gradient-to-r from-green-500 to-emerald-400 text-white shadow-[0_0_12px_rgba(16,185,129,0.6)]' : 'text-white'
        }`} style={{background:extraTurnMsg?undefined:PLAYER_COLORS[turn]+'dd'}}>
          {extraTurnMsg ? '🎯 Extra Turn!' : `${pName(turn)} ki Baari`}
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="26" height="26" viewBox="0 0 26 26" style={{transform:'rotate(-90deg)'}}>
            <circle cx="13" cy="13" r="10" fill="none" stroke="#1f2937" strokeWidth="3"/>
            <circle cx="13" cy="13" r="10" fill="none" stroke={timerColor} strokeWidth="3"
              strokeLinecap="round" strokeDasharray="62.8" strokeDashoffset={62.8*(1-timerPct)}
              style={{transition:'stroke-dashoffset 0.5s linear,stroke 0.3s'}}/>
          </svg>
          <span className="text-sm font-bold w-5 text-center" style={{color:timerColor}}>{timerVal}</span>
        </div>
      </div>

      {/* ── Score Bar ── */}
      {numP===2 ? (
        <div className="flex items-center gap-2 w-full max-w-[440px] px-3 pb-2">
          {(['p1','p2'] as Player[]).map(p => (
            <div key={p} className={`flex-1 flex items-center justify-between px-3 py-2 rounded-xl border transition-all duration-300 ${
              turn===p?'border-opacity-60 shadow-lg':'border-gray-700/50 bg-gray-800/40'
            }`} style={turn===p?{borderColor:PLAYER_COLORS[p]+'99',background:PLAYER_COLORS[p]+'15'}:{}}>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{color:PLAYER_COLORS[p]}}>
                  {pName(p)}
                  {consecFouls[p]>0 && <span className="text-red-400 ml-1">{'⚠️'.repeat(consecFouls[p])}</span>}
                </div>
                <div className="text-[9px] text-gray-500">
                  {p==='p1'?`⚪ White · ${whiteLeft} left`:`⚫ Black · ${blackLeft} left`}
                </div>
              </div>
              <div className="text-2xl font-black text-white">{scores[p]}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 w-full max-w-[440px] px-3 pb-2">
          {(['p1','p2','p3','p4'] as Player[]).map(p => {
            const cc = coinColorOf(p,4);
            const left = cc==='white' ? whiteLeft : blackLeft;
            return (
              <div key={p} className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl border transition-all ${
                turn===p?'border-opacity-60':'border-gray-700/40 bg-gray-800/30'
              }`} style={turn===p?{borderColor:PLAYER_COLORS[p]+'99',background:PLAYER_COLORS[p]+'15'}:{}}>
                <div>
                  <div className="text-[9px] font-bold uppercase" style={{color:PLAYER_COLORS[p]}}>
                    {pName(p)} <span className="opacity-60">{(p==='p1'||p==='p3')?'(A)':'(B)'}</span>
                    {consecFouls[p]>0&&<span className="text-red-400 ml-0.5">{'⚠'.repeat(consecFouls[p])}</span>}
                  </div>
                  <div className="text-[8px] text-gray-500">{cc==='white'?'⚪':'⚫'} {left} left</div>
                </div>
                <div className="text-lg font-black text-white">{scores[p]}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Queen banner ── */}
      {queenMsg && (
        <div className="w-full max-w-[440px] px-3 mb-1">
          <div className={`text-xs font-bold text-center py-1.5 rounded-xl border ${
            queenStatus==='covered'?'bg-yellow-500/20 border-yellow-500/40 text-yellow-300':
            'bg-orange-500/20 border-orange-500/40 text-orange-300 animate-pulse'
          }`}>{queenMsg}</div>
        </div>
      )}

      {/* ── Board ── */}
      <div ref={wrapRef} className="relative flex-1 flex items-center justify-center w-full max-w-[440px] px-2" style={{minHeight:0}}>
        <div className="relative p-2.5 rounded-[2rem] bg-[#3d1a00] shadow-[0_20px_60px_rgba(0,0,0,0.8),inset_0_0_30px_rgba(0,0,0,0.5)] outline outline-1 outline-amber-900/30">
          <canvas ref={boardCanvasRef} className="block rounded-[1.2rem] touch-none"
            onPointerDown={onPointerDown} onPointerMove={onPointerMove}
            onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
            style={{cursor:canInteract?'crosshair':'default'}}/>
          <canvas ref={aimCanvasRef} className="absolute top-[10px] left-[10px] rounded-[1.2rem] pointer-events-none" style={{zIndex:10}}/>
        </div>
        {/* Foul popup */}
        {foulMsg && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-gray-900/95 border border-red-500/50 text-red-400 font-bold text-sm px-5 py-2.5 rounded-2xl shadow-xl whitespace-nowrap pointer-events-none animate-bounce">
            {foulMsg}
          </div>
        )}
      </div>

      {/* ── Power bar ── */}
      <div className="flex items-center gap-2 w-full max-w-[440px] px-4 pt-2">
        <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider w-10 text-right">Power</span>
        <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-50" style={{
            width:`${Math.round(power*100)}%`,
            background:power>0.75?'linear-gradient(90deg,#f59e0b,#ef4444)':power>0.42?'linear-gradient(90deg,#10b981,#f59e0b)':'#10b981',
          }}/>
        </div>
        <span className="text-[10px] font-bold w-8" style={{color:pwrColor}}>{Math.round(power*100)}%</span>
      </div>

      {/* ── Status ── */}
      <div className="w-full max-w-[440px] px-4 pb-3 pt-1 flex items-center justify-between">
        <p className={`text-xs transition-colors ${canInteract?'text-amber-400 font-semibold':'text-gray-600'}`}>{statusMsg}</p>
        {consecFouls[turn]>0 && (
          <span className="text-[10px] text-red-400 font-bold">Fouls: {consecFouls[turn]}/{MAX_CONSEC_FOULS}</span>
        )}
      </div>

      {/* ── Winner Overlay ── */}
      {winner && (
        <div className="absolute inset-0 bg-black/88 flex flex-col items-center justify-center z-50 backdrop-blur-sm px-6">
          <Crown className="w-20 h-20 text-yellow-400 mb-3 drop-shadow-[0_0_20px_rgba(250,204,21,0.8)] animate-bounce"/>
          <Trophy className="w-8 h-8 text-amber-500 mb-2"/>
          <h2 className="text-4xl font-black bg-gradient-to-r from-amber-400 to-red-500 bg-clip-text text-transparent mb-1">
            {pName(winner)} Jeeta!
          </h2>
          <p className="text-gray-400 text-base mb-3">Score: <span className="text-white font-bold">{scores[winner]}</span></p>
          <div className="flex gap-3 mb-6">
            {activePlayers().map(p => (
              <div key={p} className="text-center">
                <div className="text-[10px] font-bold" style={{color:PLAYER_COLORS[p]}}>{pName(p)}</div>
                <div className="text-lg font-black text-white">{scores[p]}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={()=>{stopLoop();clearTimer();startGame(mode,numP);}}
              className="py-3 px-7 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-2xl shadow-lg active:scale-95 transition-transform">
              Dobara Khelo
            </button>
            <button onClick={()=>{stopLoop();clearTimer();onGameOver(scores[winner],'Win');}}
              className="py-3 px-7 bg-gray-800 border border-gray-700 text-white font-bold rounded-2xl active:scale-95 transition-transform">
              Exit
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes particle-fly {
          0%   { transform:translate(0,0) scale(1); opacity:1; }
          100% { transform:translate(var(--dx),var(--dy)) scale(0); opacity:0; }
        }
      `}</style>
    </div>
  );
}
