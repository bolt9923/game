import React, { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import { ArrowLeft, Bot, Users, Globe, Crown } from 'lucide-react';
import { mockBackend } from '../lib/mockBackend';
import { mpSession } from '../lib/mpSession';
import { rooms as firebaseRooms, type RoomPlayer as FbRoomPlayer } from '../lib/rooms';
import { db as gameDb } from '../lib/db';

// ─────────────────────────────────────────────
//  TYPES & CONSTANTS
// ─────────────────────────────────────────────
interface CarromProps {
  onGameOver: (score: number, result?: 'Win' | 'Loss' | 'Draw' | 'Completed') => void;
  onBack: () => void;
}
type Mode   = 'menu' | 'bot' | 'local2' | 'online_lobby' | 'online_playing';
type Player = 'p1' | 'p2';

// Board dimensions (physics units)
const BW = 500, BH = 500;
const PAD = 48;          // border/wall thickness area
const POCKET_R = 24;     // pocket hole radius
const COIN_R   = 12;     // coin radius
const STRIKER_R= 16;     // striker radius
const MAX_DRAG = 140;    // max pull distance
const MAX_FORCE= 0.10;   // max impulse
const TURN_TIME= 30;     // seconds per turn

const STRIKER_Y: Record<Player, number> = {
  p1: BH - PAD - 30,   // bottom
  p2: PAD + 30,        // top
};

const PLAYER_COLORS: Record<Player, string> = {
  p1: '#f59e0b',
  p2: '#3b82f6',
};
const PLAYER_NAMES_DEFAULT: Record<Player, string> = {
  p1: 'Player 1',
  p2: 'Player 2',
};

// Coin layout helpers
function makeCoins() {
  const cx = BW / 2, cy = BH / 2;
  const opt = (label: string) => ({
    restitution: 0.75, friction: 0.035, frictionAir: 0.018,
    density: 0.002, label,
  });
  const coins: Matter.Body[] = [];
  // Queen at center
  coins.push(Matter.Bodies.circle(cx, cy, COIN_R, opt('queen')));
  // Inner ring (6): alternating white/black, radius ≈ COIN_R*2.5
  const IR = COIN_R * 2.5;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const lbl = i % 2 === 0 ? 'white' : 'black';
    coins.push(Matter.Bodies.circle(cx + Math.cos(a) * IR, cy + Math.sin(a) * IR, COIN_R, opt(lbl)));
  }
  // Outer ring (12): alternating black/white, radius ≈ COIN_R*4.8
  const OR = COIN_R * 4.8;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2 + Math.PI / 12;
    const lbl = i % 2 === 0 ? 'black' : 'white';
    coins.push(Matter.Bodies.circle(cx + Math.cos(a) * OR, cy + Math.sin(a) * OR, COIN_R, opt(lbl)));
  }
  return coins; // 1 queen + 6 inner + 12 outer = 19 total (9 white, 9 black, 1 queen)
}

// ─────────────────────────────────────────────
//  ONLINE LOBBY
// ─────────────────────────────────────────────
interface LobbyProps {
  onStartGame: (role: Player, roomId: string) => void;
  onBack: () => void;
}
function OnlineLobby({ onStartGame, onBack }: LobbyProps) {
  const [step, setStep] = useState<'menu' | 'join' | 'waiting'>('menu');
  const [code, setCode]   = useState('');
  const [input, setInput] = useState('');
  const [err, setErr]     = useState('');
  const [busy, setBusy]   = useState(false);
  const [players, setPlayers] = useState<FbRoomPlayer[]>([]);
  const [role, setRole]   = useState<Player>('p1');
  const [rowId, setRowId] = useState('');
  const [copied, setCopied] = useState(false);
  const unsubRef   = useRef<(() => void) | null>(null);
  const launched   = useRef(false);
  const user       = gameDb.getUser();
  const me: FbRoomPlayer = { id: user.id, name: user.name, avatar: user.avatar };
  const stop = () => { unsubRef.current?.(); unsubRef.current = null; };
  useEffect(() => () => stop(), []);

  const watch = (rid: string, c: string, r: Player) => {
    stop();
    unsubRef.current = firebaseRooms.watch(rid, row => {
      setPlayers(row.players || []);
      if (row.status === 'playing' && !launched.current) {
        launched.current = true;
        mockBackend.joinRoom(c);
        onStartGame(r, c);
      }
    });
  };

  const create = async () => {
    setBusy(true); setErr('');
    try {
      const row = await firebaseRooms.create({ gameId: 'carrom', maxPlayers: 2, host: me });
      setCode(row.code); setRowId(row.id); setRole('p1'); setPlayers(row.players);
      mockBackend.joinRoom(row.code);
      watch(row.id, row.code, 'p1');
      setStep('waiting');
    } catch (e: any) { setErr(e?.message || 'Error'); }
    finally { setBusy(false); }
  };

  const join = async () => {
    const c = input.trim().toUpperCase();
    if (!c) return;
    setBusy(true); setErr('');
    try {
      const row = await firebaseRooms.join(c, me);
      const idx = row.players.findIndex((p: FbRoomPlayer) => p.id === me.id);
      const r = idx <= 0 ? 'p1' : 'p2';
      setCode(c); setRowId(row.id); setRole(r as Player); setPlayers(row.players);
      mockBackend.joinRoom(c);
      watch(row.id, c, r as Player);
      setStep('waiting');
    } catch (e: any) { setErr(e?.message || 'Code sahi nahi.'); }
    finally { setBusy(false); }
  };

  const startHost = async () => {
    if (!rowId) return;
    setBusy(true);
    try { await firebaseRooms.start(rowId, players[0]?.id); }
    catch (e: any) { setErr(e?.message || 'Error'); setBusy(false); }
  };

  const copyCode = () => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  if (step === 'menu') return (
    <div className="flex flex-col items-center justify-center h-full p-6 bg-gradient-to-b from-[#12181f] to-[#0a0e14] text-white">
      <button onClick={onBack} className="absolute top-6 left-6 text-gray-400 hover:text-white text-sm">← Back</button>
      <Globe className="w-14 h-14 text-green-400 mb-4" />
      <h2 className="text-3xl font-black mb-8">Online Carrom</h2>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button onClick={create} disabled={busy}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-green-600 to-emerald-500 font-bold active:scale-95 transition disabled:opacity-50">
          {busy ? 'Creating…' : 'Create Room'}
        </button>
        <button onClick={() => setStep('join')}
          className="w-full py-4 rounded-2xl bg-gray-800 border border-gray-700 font-bold active:scale-95 transition">
          Join Room
        </button>
      </div>
      {err && <p className="text-red-400 text-sm mt-4">{err}</p>}
    </div>
  );

  if (step === 'join') return (
    <div className="flex flex-col items-center justify-center h-full p-6 bg-gradient-to-b from-[#12181f] to-[#0a0e14] text-white">
      <button onClick={() => setStep('menu')} className="absolute top-6 left-6 text-gray-400 hover:text-white text-sm">← Back</button>
      <h2 className="text-2xl font-black mb-6">Room Code Daalo</h2>
      <input value={input} onChange={e => setInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
        placeholder="ABC123" maxLength={6} autoFocus
        className="w-full max-w-xs bg-[#0f1923] border border-gray-700 outline-none rounded-2xl px-4 py-5 text-center text-4xl font-black tracking-widest font-mono" />
      {err && <p className="text-red-400 text-sm mt-3">{err}</p>}
      <button onClick={join} disabled={busy || input.length < 4}
        className="mt-4 w-full max-w-xs bg-indigo-600 hover:bg-indigo-500 font-bold py-4 rounded-xl disabled:opacity-50 active:scale-95 transition">
        {busy ? 'Joining…' : 'Join Game'}
      </button>
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 bg-gradient-to-b from-[#12181f] to-[#0a0e14] text-white">
      <button onClick={() => { stop(); setStep('menu'); }} className="absolute top-6 left-6 text-gray-400 hover:text-white text-sm">Cancel</button>
      <div className="bg-[#1c2836] p-6 rounded-3xl border border-green-500/30 w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Room Code</div>
          <div className="text-5xl font-black tracking-widest bg-[#0f1923] py-3 px-6 rounded-2xl border border-gray-700">{code}</div>
          <button onClick={copyCode} className="mt-2 w-full bg-[#0f1923] border border-gray-700 rounded-xl py-2 text-sm font-bold text-indigo-300">
            {copied ? '✓ Copied!' : '📋 Copy Code'}
          </button>
        </div>
        <div className="text-xs text-gray-500 text-center">{players.length}/2 joined</div>
        {[0, 1].map(i => {
          const p = players[i];
          const pKey = i === 0 ? 'p1' : 'p2';
          return (
            <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${p ? 'border-green-500/40 bg-green-500/10' : 'border-gray-700/50 bg-gray-800/30'}`}>
              <div className="w-3 h-3 rounded-full" style={{ background: p ? PLAYER_COLORS[pKey as Player] : '#374151' }} />
              <span className="text-sm font-semibold" style={{ color: p ? PLAYER_COLORS[pKey as Player] : '#6b7280' }}>
                {p ? p.name : `Player ${i + 1} ka wait…`}
              </span>
              {p && <span className="ml-auto text-green-400 text-xs">✓</span>}
            </div>
          );
        })}
        {err && <p className="text-red-400 text-xs text-center">{err}</p>}
        {role === 'p1' ? (
          <button onClick={startHost} disabled={players.length < 2 || busy}
            className="w-full bg-gradient-to-r from-green-600 to-emerald-600 font-black py-4 rounded-2xl disabled:opacity-40 active:scale-95 transition">
            {players.length < 2 ? 'P2 ka wait…' : busy ? '…' : '🎮 Start Game!'}
          </button>
        ) : (
          <div className="text-blue-400 text-sm text-center flex items-center justify-center gap-2">
            <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            Host ke start karne ka wait…
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
  // ── State ──
  const [mode, setMode]     = useState<Mode>('menu');
  const [role, setRole]     = useState<Player>('p1');
  const [roomId, setRoomId] = useState('');
  const [turn, setTurn]     = useState<Player>('p1');
  const [scores, setScores] = useState({ p1: 0, p2: 0 });
  const [whiteLeft, setWhiteLeft] = useState(9);
  const [blackLeft, setBlackLeft] = useState(9);
  const [winner, setWinner] = useState<Player | null>(null);
  const [timerVal, setTimerVal] = useState(TURN_TIME);
  const [power, setPower]   = useState(0);
  const [msg, setMsg]       = useState('');
  const [queenMsg, setQueenMsg] = useState('');
  const [extraTurnAnim, setExtraTurnAnim] = useState(false);
  const [pocketedCoins, setPocketedCoins] = useState<{color: string, player: Player}[]>([]);

  // ── Canvas & wrapper refs ──
  const boardRef = useRef<HTMLCanvasElement>(null);
  const aimRef   = useRef<HTMLCanvasElement>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);

  // ── Physics refs ──
  const engineRef  = useRef<Matter.Engine | null>(null);
  const runnerRef  = useRef<Matter.Runner | null>(null);
  const strikerRef = useRef<Matter.Body | null>(null);
  const allCoinsRef= useRef<Matter.Body[]>([]);
  const pocketedIds= useRef<Set<number>>(new Set());

  // ── Game logic refs (avoid stale closures) ──
  const turnRef    = useRef<Player>('p1');
  const modeRef    = useRef<Mode>('menu');
  const roleRef    = useRef<Player>('p1');
  const roomIdRef  = useRef('');
  const scoresRef  = useRef({ p1: 0, p2: 0 });

  // Per-shot flags
  const canShootRef        = useRef(true);
  const isMovingRef        = useRef(false);
  const isReceivedStrike   = useRef(false);
  const extraTurnRef       = useRef(false);
  const foulRef            = useRef(false);
  const strikerPocketedRef = useRef(false);
  const ownCoinRef         = useRef(false);   // own coin pocketed this shot
  const oppCoinRef         = useRef(false);   // opp coin pocketed
  const queenPocketedRef   = useRef(false);   // queen pocketed, waiting cover
  const queenCoveredRef    = useRef(false);   // queen covered (permanent)
  const queenOwnerRef      = useRef<Player | null>(null);
  const queenGraceRef      = useRef(0);       // 0=none, 1=queen just pocketed, -1=grace used

  // Input refs
  const isDragging = useRef(false);
  const dragPos    = useRef<{x:number;y:number} | null>(null);
  const strikerSlide = useRef(0.5);

  // Misc refs
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerValRef= useRef(TURN_TIME);
  const scaleRef   = useRef(1);
  const rafRef     = useRef(0);
  const audioCtx   = useRef<AudioContext | null>(null);
  const consecFouls= useRef({ p1: 0, p2: 0 });

  // Sync state → refs
  useEffect(() => { turnRef.current = turn; }, [turn]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { roleRef.current = role; }, [role]);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);
  useEffect(() => { scoresRef.current = scores; }, [scores]);

  // ─────────────────────────────────────────
  //  AUDIO
  // ─────────────────────────────────────────
  function getAudio() {
    if (!audioCtx.current) audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return audioCtx.current;
  }
  function playSound(type: 'shoot'|'pocket'|'foul'|'win'|'tick'|'bounce', pwr = 0.5) {
    try {
      const ac = getAudio();
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      const now = ac.currentTime;
      if (type === 'shoot') {
        o.type='sawtooth'; o.frequency.setValueAtTime(220+pwr*280,now); o.frequency.exponentialRampToValueAtTime(80,now+0.18);
        g.gain.setValueAtTime(0.28*pwr,now); g.gain.exponentialRampToValueAtTime(0.001,now+0.18);
        o.start(now); o.stop(now+0.18);
      } else if (type === 'pocket') {
        o.type='sine'; o.frequency.setValueAtTime(900,now); o.frequency.exponentialRampToValueAtTime(200,now+0.22);
        g.gain.setValueAtTime(0.22,now); g.gain.exponentialRampToValueAtTime(0.001,now+0.22);
        o.start(now); o.stop(now+0.22);
      } else if (type === 'foul') {
        o.type='sawtooth'; o.frequency.setValueAtTime(150,now);
        g.gain.setValueAtTime(0.2,now); g.gain.exponentialRampToValueAtTime(0.001,now+0.3);
        o.start(now); o.stop(now+0.3);
      } else if (type === 'win') {
        o.type='sine'; o.frequency.setValueAtTime(440,now); o.frequency.setValueAtTime(660,now+0.1); o.frequency.setValueAtTime(880,now+0.2);
        g.gain.setValueAtTime(0.25,now); g.gain.exponentialRampToValueAtTime(0.001,now+0.5);
        o.start(now); o.stop(now+0.5);
      } else if (type === 'tick') {
        o.type='square'; o.frequency.setValueAtTime(800,now);
        g.gain.setValueAtTime(0.05,now); g.gain.exponentialRampToValueAtTime(0.001,now+0.06);
        o.start(now); o.stop(now+0.06);
      } else if (type === 'bounce') {
        o.type='square'; o.frequency.setValueAtTime(180+pwr*100,now);
        g.gain.setValueAtTime(0.08,now); g.gain.exponentialRampToValueAtTime(0.001,now+0.08);
        o.start(now); o.stop(now+0.08);
      }
    } catch {}
  }

  // ─────────────────────────────────────────
  //  HELPERS
  // ─────────────────────────────────────────
  function myColor(p: Player) { return p === 'p1' ? 'white' : 'black'; }
  function oppColor(p: Player) { return p === 'p1' ? 'black' : 'white'; }
  function opponent(p: Player): Player { return p === 'p1' ? 'p2' : 'p1'; }
  function pName(p: Player) {
    if (modeRef.current === 'bot' && p === 'p2') return 'AI Bot';
    if (modeRef.current === 'online_playing') return p === roleRef.current ? 'You' : 'Opponent';
    return PLAYER_NAMES_DEFAULT[p];
  }

  function strikerPos(p: Player) {
    const minX = PAD + STRIKER_R + 10, maxX = BW - PAD - STRIKER_R - 10;
    return { x: minX + (maxX - minX) * strikerSlide.current, y: STRIKER_Y[p] };
  }

  function coinsOnBoard(color: string) {
    return allCoinsRef.current.filter(
      b => b.label === color && !pocketedIds.current.has(b.id) && b.position.x > 0
    ).length;
  }

  // Pocket body off-screen (reuse body, never destroy)
  function pocketBody(b: Matter.Body) {
    pocketedIds.current.add(b.id);
    Matter.Body.setPosition(b, { x: -500, y: -500 });
    Matter.Body.setVelocity(b, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(b, 0);
  }

  // Return one pocketed coin of color to center area
  function returnCoin(color: string): boolean {
    const coin = allCoinsRef.current.find(b => b.label === color && pocketedIds.current.has(b.id));
    if (!coin) return false;
    pocketedIds.current.delete(coin.id);
    const jitter = (Math.random() - 0.5) * COIN_R * 3;
    Matter.Body.setPosition(coin, { x: BW/2 + jitter, y: BH/2 + jitter });
    Matter.Body.setVelocity(coin, { x: 0, y: 0 });
    return true;
  }

  // Return queen to center
  function returnQueen() {
    const q = allCoinsRef.current.find(b => b.label === 'queen');
    if (!q) return;
    pocketedIds.current.delete(q.id);
    Matter.Body.setPosition(q, { x: BW/2, y: BH/2 });
    Matter.Body.setVelocity(q, { x: 0, y: 0 });
    queenPocketedRef.current = false;
    queenOwnerRef.current = null;
    queenGraceRef.current = 0;
  }

  function showMsg(text: string, dur = 2500) {
    setMsg(text);
    setTimeout(() => setMsg(''), dur);
  }

  // ─────────────────────────────────────────
  //  BOARD RENDERING
  // ─────────────────────────────────────────
  function renderBoard() {
    const canvas = boardRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const s = scaleRef.current;
    const bp = PAD * s;

    ctx.clearRect(0, 0, W, H);

    // ── Board surface ──
    const grad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W * 0.75);
    grad.addColorStop(0,   '#d4a820');
    grad.addColorStop(0.5, '#b8860b');
    grad.addColorStop(1,   '#7c5a08');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Wood grain lines
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    for (let i = 0; i < W; i += 12) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 6, H); ctx.stroke();
    }
    ctx.restore();

    // ── Outer border (thick frame) ──
    ctx.fillStyle = '#5c2a07';
    ctx.fillRect(0, 0, W, bp - 4);
    ctx.fillRect(0, H - bp + 4, W, bp - 4);
    ctx.fillRect(0, 0, bp - 4, H);
    ctx.fillRect(W - bp + 4, 0, bp - 4, H);

    // Inner border lines
    ctx.strokeStyle = '#7c3e0c';
    ctx.lineWidth = 3;
    ctx.strokeRect(bp, bp, W - bp * 2, H - bp * 2);
    ctx.strokeStyle = '#5c2a07';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bp + 5*s, bp + 5*s, W - bp*2 - 10*s, H - bp*2 - 10*s);

    // ── Pockets ──
    const corners = [[bp, bp], [W-bp, bp], [bp, H-bp], [W-bp, H-bp]];
    corners.forEach(([cx2, cy2]) => {
      // Pocket hole
      const pg = ctx.createRadialGradient(cx2, cy2, 2, cx2, cy2, POCKET_R * s);
      pg.addColorStop(0, '#0a0a0a'); pg.addColorStop(1, '#1a0800');
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(cx2, cy2, POCKET_R * s, 0, Math.PI*2); ctx.fill();
      // Pocket rim
      ctx.strokeStyle = '#3d1a00'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx2, cy2, POCKET_R * s + 3, 0, Math.PI*2); ctx.stroke();
    });

    // ── Center markings ──
    const cx = W/2, cy = H/2;
    ctx.strokeStyle = 'rgba(90,45,5,0.45)';
    [5*s, 11*s, 20*s, 36*s].forEach(r => {
      ctx.lineWidth = r > 25*s ? 1.5 : 1;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
    });
    ctx.fillStyle = 'rgba(90,45,5,0.5)';
    ctx.beginPath(); ctx.arc(cx, cy, 4*s, 0, Math.PI*2); ctx.fill();

    // Diagonal lines
    ctx.strokeStyle = 'rgba(90,45,5,0.25)'; ctx.lineWidth = 1;
    const off = bp + 28*s;
    [[cx, cy, off, off], [cx, cy, W-off, off], [cx, cy, off, H-off], [cx, cy, W-off, H-off]].forEach(
      ([x1,y1,x2,y2]) => { ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); }
    );

    // ── Striker lane lines ──
    ctx.setLineDash([5, 8]);
    (['p1', 'p2'] as Player[]).forEach(p => {
      const isActive = turnRef.current === p;
      const ly = STRIKER_Y[p] * s;
      ctx.strokeStyle = isActive ? PLAYER_COLORS[p] + 'cc' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = isActive ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(bp + 14*s, ly);
      ctx.lineTo(W - bp - 14*s, ly);
      ctx.stroke();
      // Lane label
      ctx.setLineDash([]);
      ctx.fillStyle = isActive ? PLAYER_COLORS[p] : 'rgba(255,255,255,0.25)';
      ctx.font = `bold ${9*s}px sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(pName(p), W - bp - 18*s, ly - 5*s);
      ctx.setLineDash([5, 8]);
    });
    ctx.setLineDash([]);

    // ── Draw all physics bodies ──
    if (!engineRef.current) return;
    const bodies = Matter.Composite.allBodies(engineRef.current.world);

    for (const body of bodies) {
      if (pocketedIds.current.has(body.id)) continue;
      const { label } = body;
      if (label === 'wall' || label === 'pocket') continue;
      const bx = body.position.x * s;
      const by = body.position.y * s;
      if (bx < -50 || by < -50) continue; // off-screen

      ctx.save();

      if (label === 'striker') {
        // ── Striker ──
        const active = canShootRef.current && !isMovingRef.current;
        const pColor = PLAYER_COLORS[turnRef.current];
        // Glow when active
        if (active) {
          ctx.shadowColor = pColor;
          ctx.shadowBlur  = 14;
        }
        const sg = ctx.createRadialGradient(bx - 3*s, by - 3*s, 1, bx, by, STRIKER_R*s);
        sg.addColorStop(0, '#e0e0ff');
        sg.addColorStop(0.5, '#9090c0');
        sg.addColorStop(1, '#404070');
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(bx, by, STRIKER_R*s, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
        // Rim
        ctx.strokeStyle = active ? pColor : '#555588';
        ctx.lineWidth   = active ? 2.5 : 1;
        ctx.beginPath(); ctx.arc(bx, by, STRIKER_R*s, 0, Math.PI*2); ctx.stroke();
        // Inner ring
        ctx.strokeStyle = 'rgba(160,160,220,0.5)';
        ctx.lineWidth   = 0.8;
        ctx.beginPath(); ctx.arc(bx, by, STRIKER_R*s*0.55, 0, Math.PI*2); ctx.stroke();
        // Player color pulse ring
        if (active) {
          ctx.globalAlpha = 0.2;
          ctx.fillStyle = pColor;
          ctx.beginPath(); ctx.arc(bx, by, (STRIKER_R+8)*s, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore(); continue;
      }

      // ── Coins ──
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur  = 5;
      ctx.shadowOffsetY = 2;

      let fg: CanvasGradient, outline: string, inner: string;
      if (label === 'queen') {
        fg = ctx.createRadialGradient(bx-2*s, by-2*s, 1, bx, by, COIN_R*s);
        fg.addColorStop(0, '#ff7777'); fg.addColorStop(1, '#cc1111');
        outline = '#880000'; inner = 'rgba(255,180,180,0.6)';
      } else if (label === 'white') {
        fg = ctx.createRadialGradient(bx-2*s, by-2*s, 1, bx, by, COIN_R*s);
        fg.addColorStop(0, '#ffffff'); fg.addColorStop(1, '#c8c8c8');
        outline = '#999'; inner = 'rgba(80,80,80,0.3)';
      } else {
        fg = ctx.createRadialGradient(bx-2*s, by-2*s, 1, bx, by, COIN_R*s);
        fg.addColorStop(0, '#3a3a60'); fg.addColorStop(1, '#0c0c1e');
        outline = '#000'; inner = 'rgba(100,100,180,0.4)';
      }

      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(bx, by, COIN_R*s, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.strokeStyle = outline; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(bx, by, COIN_R*s, 0, Math.PI*2); ctx.stroke();
      // Inner highlight ring
      ctx.strokeStyle = inner; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(bx, by, COIN_R*s*0.52, 0, Math.PI*2); ctx.stroke();
      // Queen dot
      if (label === 'queen') {
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath(); ctx.arc(bx, by, 3*s, 0, Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }

    // ── Queen cover reminder overlay ──
    if (queenPocketedRef.current && !queenCoveredRef.current) {
      const rem = queenGraceRef.current === -1 ? 'Abhi cover karo!' : 'Queen! Apna coin pocket karo';
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(bp + 10*s, bp + 10*s, W - bp*2 - 20*s, 22*s);
      ctx.font = `bold ${10*s}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fbbf24';
      ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
      ctx.fillText(`👑 ${rem}`, W/2, bp + 23*s);
      ctx.restore();
    }
  }

  // ─────────────────────────────────────────
  //  AIM RENDERING
  // ─────────────────────────────────────────
  function renderAim() {
    const canvas = aimRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!isDragging.current || !dragPos.current || !strikerRef.current) return;

    const s  = scaleRef.current;
    const sx = strikerRef.current.position.x * s;
    const sy = strikerRef.current.position.y * s;
    const tx = dragPos.current.x * s;
    const ty = dragPos.current.y * s;
    const dx = sx - tx, dy = sy - ty;
    const dist = Math.hypot(dx, dy);
    if (dist < 4) return;

    const nx = dx/dist, ny = dy/dist;
    const pwr = Math.min(dist / (MAX_DRAG * s), 1);

    // Drag shadow line
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 10;
    ctx.lineCap     = 'round';
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke();

    // Shot direction line
    const lineLen = (55 + pwr * 230) * s;
    const ex = sx + nx * lineLen, ey = sy + ny * lineLen;
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();

    // Trajectory bounce dots
    const bp2 = PAD * s;
    const W = canvas.width, H = canvas.height;
    let px = ex, py = ey, vx = nx, vy = ny;
    const dotStep = 10, dotCount = Math.floor(pwr * 26) + 8;
    ctx.globalAlpha = 0.45;
    ctx.setLineDash([5, 10]);
    ctx.strokeStyle = 'rgba(255, 215, 80, 0.75)';
    ctx.lineWidth   = 1.8;
    ctx.beginPath(); ctx.moveTo(px, py);
    for (let i = 0; i < dotCount; i++) {
      px += vx * dotStep; py += vy * dotStep;
      if (px <= bp2 + 4 || px >= W - bp2 - 4) vx = -vx;
      if (py <= bp2 + 4 || py >= H - bp2 - 4) vy = -vy;
      px = Math.max(bp2+4, Math.min(W-bp2-4, px));
      py = Math.max(bp2+4, Math.min(H-bp2-4, py));
      ctx.lineTo(px, py);
    }
    ctx.stroke(); ctx.setLineDash([]);

    // Coin collision highlight
    if (engineRef.current) {
      const sr = STRIKER_R*s, cr = COIN_R*s;
      let cpx = ex, cpy = ey;
      outer: for (let i = 0; i < 220; i++) {
        cpx += nx * 4; cpy += ny * 4;
        for (const coin of Matter.Composite.allBodies(engineRef.current.world)) {
          if (pocketedIds.current.has(coin.id)) continue;
          if (!['white','black','queen'].includes(coin.label)) continue;
          if (coin.position.x < 0) continue;
          const cbx = coin.position.x*s, cby = coin.position.y*s;
          if (Math.hypot(cpx-cbx, cpy-cby) < sr + cr) {
            ctx.globalAlpha = 0.55;
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth   = 2;
            ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 8;
            ctx.beginPath(); ctx.arc(cbx, cby, cr + 5, 0, Math.PI*2); ctx.stroke();
            ctx.shadowBlur  = 0;
            break outer;
          }
        }
      }
    }

    // Power dot at tip
    const pColor = pwr > 0.75 ? '#ef4444' : pwr > 0.42 ? '#f59e0b' : '#10b981';
    ctx.globalAlpha = 1;
    ctx.fillStyle   = pColor;
    ctx.shadowColor = pColor; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(ex, ey, 5.5, 0, Math.PI*2); ctx.fill();
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

    // Walls (4 sides, with thin collision walls at board edges)
    const wOpts = { isStatic:true, restitution:0.78, friction:0, label:'wall' };
    const hp = PAD / 2;
    const walls = [
      Matter.Bodies.rectangle(BW/2, hp,      BW, PAD, wOpts),
      Matter.Bodies.rectangle(BW/2, BH-hp,   BW, PAD, wOpts),
      Matter.Bodies.rectangle(hp,   BH/2,    PAD, BH, wOpts),
      Matter.Bodies.rectangle(BW-hp, BH/2,   PAD, BH, wOpts),
    ];

    // Pocket sensors
    const pocketPos = [
      {x:PAD, y:PAD}, {x:BW-PAD, y:PAD},
      {x:PAD, y:BH-PAD}, {x:BW-PAD, y:BH-PAD},
    ];
    const pockets = pocketPos.map(c =>
      Matter.Bodies.circle(c.x, c.y, POCKET_R, { isStatic:true, isSensor:true, label:'pocket' })
    );

    // Coins
    const coins = makeCoins();
    allCoinsRef.current = coins;

    // Striker
    const sp = strikerPos(turnRef.current);
    const striker = Matter.Bodies.circle(sp.x, sp.y, STRIKER_R, {
      restitution: 0.80, friction: 0.05, frictionAir: 0.020, density: 0.005, label: 'striker',
    });
    strikerRef.current = striker;

    Matter.Composite.add(engine.world, [...walls, ...pockets, ...coins, striker]);

    // Collision events
    Matter.Events.on(engine, 'collisionStart', (evt: Matter.IEventCollision<Matter.Engine>) => {
      for (const pair of evt.pairs) {
        const { bodyA, bodyB } = pair;
        // Wall bounce sound
        if (
          (bodyA.label === 'wall' && bodyB.label === 'striker') ||
          (bodyB.label === 'wall' && bodyA.label === 'striker')
        ) { playSound('bounce'); }
        // Pocket detection
        const isPA = bodyA.label === 'pocket', isPB = bodyB.label === 'pocket';
        if (isPA || isPB) {
          const coin = isPA ? bodyB : bodyA;
          if (coin.label !== 'wall' && coin.label !== 'pocket') {
            if (!pocketedIds.current.has(coin.id) && coin.position.x > 0 && coin.position.y > 0) {
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
      const moving = bodies.some((b: Matter.Body) => {
        if (b.isStatic || b.position.x < 0 || b.position.y < 0) return false;
        const v = b.velocity, av = b.angularVelocity;
        return (v.x*v.x + v.y*v.y) > 0.008 || Math.abs(av) > 0.008;
      });
      if (!moving) {
        isMovingRef.current = false;
        // Online: skip afterShot on receiver — only shooter resolves turn
        if (modeRef.current === 'online_playing' && isReceivedStrike.current) {
          isReceivedStrike.current = false;
          return; // wait for sync_state
        }
        isReceivedStrike.current = false;
        setTimeout(afterShot, 280);
      }
    });

    Matter.Runner.run(runner, engine);
  }

  // ─────────────────────────────────────────
  //  POCKET HANDLER
  //  Rules:
  //  1. Striker pocketed → FOUL, turn passes, penalty own coin returns
  //  2. Own coin → extra turn, +1 score
  //     If queen pending cover → queen covered (+3 bonus)
  //  3. Opponent coin → FOUL, opponent coin returns to center
  //  4. Queen → grace period (cover same shot or next shot)
  //     If not covered next shot → queen returns to center
  // ─────────────────────────────────────────
  function handlePocket(body: Matter.Body) {
    if (pocketedIds.current.has(body.id)) return;
    playSound('pocket');
    pocketBody(body);

    const label = body.label;
    const cur   = turnRef.current;

    // 1. Striker
    if (label === 'striker') {
      strikerPocketedRef.current = true;
      foulRef.current = true;
      extraTurnRef.current = false;
      return;
    }

    // 2. Queen
    if (label === 'queen') {
      queenPocketedRef.current = true;
      queenOwnerRef.current    = cur;
      queenGraceRef.current    = 1; // grace: cover this or next shot
      setTimeout(() => setQueenMsg(''), 3000);
      return;
    }

    // 3. Own coin
    if (label === myColor(cur)) {
      ownCoinRef.current = true;
      // Does this cover the queen?
      if (queenPocketedRef.current && !queenCoveredRef.current && queenOwnerRef.current === cur) {
        queenCoveredRef.current = true;
        queenGraceRef.current   = 0;
        setQueenMsg('👑 Queen Covered! +3 bonus');
        setTimeout(() => setQueenMsg(''), 2500);
        // Queen cover bonus
        setScores(prev => {
          const n = { ...prev, [cur]: prev[cur] + 3 };
          scoresRef.current = n; return n;
        });
      }
      // Score point
      setScores(prev => {
        const n = { ...prev, [cur]: prev[cur] + 1 };
        scoresRef.current = n; return n;
      });
      if (!foulRef.current) extraTurnRef.current = true;
      consecFouls.current[cur] = 0;
      setExtraTurnAnim(true);
      setTimeout(() => setExtraTurnAnim(false), 1100);
      return;
    }

    // 4. Opponent coin → foul
    oppCoinRef.current  = true;
    foulRef.current     = true;
    extraTurnRef.current= false;
    setTimeout(() => returnCoin(oppColor(cur)), 400);
    playSound('foul');
    showMsg(`⚠️ FOUL — Opponent ka coin! Wapas aayega.`);
  }

  // ─────────────────────────────────────────
  //  AFTER SHOT
  // ─────────────────────────────────────────
  function afterShot() {
    const cur = turnRef.current;

    // Striker foul resolution
    if (strikerPocketedRef.current) {
      playSound('foul');
      returnCoin(myColor(cur)); // penalty
      showMsg('⚠️ FOUL — Striker pocket hua! Turn jaata hai.');
      strikerPocketedRef.current = false;
      pocketedIds.current.delete(strikerRef.current!.id);
    }

    // Queen grace resolution
    if (queenPocketedRef.current && !queenCoveredRef.current) {
      if (queenGraceRef.current === 1) {
        // Queen pocketed this shot — consume grace
        queenGraceRef.current = -1;
        if (!foulRef.current && !ownCoinRef.current) {
          // No own coin pocketed same shot → give extra shot to cover
          extraTurnRef.current = true;
          setQueenMsg('👑 Agli shot mein apna coin pocket karo!');
          setTimeout(() => setQueenMsg(''), 3500);
        }
      } else if (queenGraceRef.current === -1) {
        // Grace shot used, still not covered → queen returns
        returnQueen();
        showMsg('👑 Queen cover nahi hua — center mein wapas!');
        setQueenMsg('');
      }
    }

    // Reset per-shot flags
    strikerPocketedRef.current = false;
    ownCoinRef.current  = false;
    oppCoinRef.current  = false;

    syncCoinCounts();
    checkWin();
    endTurn(foulRef.current);
    foulRef.current = false;
  }

  function syncCoinCounts() {
    setWhiteLeft(coinsOnBoard('white'));
    setBlackLeft(coinsOnBoard('black'));
  }

  // ─────────────────────────────────────────
  //  WIN CHECK
  // ─────────────────────────────────────────
  function checkWin() {
    if (winner) return;
    // P1 wins if all white pocketed + queen covered
    if (coinsOnBoard('white') === 0 && queenCoveredRef.current) {
      triggerWin('p1'); return;
    }
    // P2 wins if all black pocketed + queen covered
    if (coinsOnBoard('black') === 0 && queenCoveredRef.current) {
      triggerWin('p2'); return;
    }
    // All coins pocketed without queen covered — highest score wins
    if (coinsOnBoard('white') + coinsOnBoard('black') === 0) {
      const best = scoresRef.current.p1 >= scoresRef.current.p2 ? 'p1' : 'p2';
      triggerWin(best);
    }
  }

  function triggerWin(p: Player) {
    clearTimer();
    canShootRef.current = false;
    playSound('win');
    setWinner(p);
  }

  // ─────────────────────────────────────────
  //  END TURN
  // ─────────────────────────────────────────
  function endTurn(wasFoul: boolean) {
    clearTimer();

    if (wasFoul) {
      consecFouls.current[turnRef.current]++;
      extraTurnRef.current = false;
      // 3 consecutive fouls → -5 points penalty
      if (consecFouls.current[turnRef.current] >= 3) {
        const p = turnRef.current;
        setScores(prev => {
          const n = { ...prev, [p]: Math.max(0, prev[p] - 5) };
          scoresRef.current = n; return n;
        });
        consecFouls.current[p] = 0;
        showMsg(`🚫 3 fouls! -5 points! Turn: ${pName(p)}`);
      }
    }

    if (!extraTurnRef.current) {
      const nxt = opponent(turnRef.current);
      turnRef.current = nxt;
      setTurn(nxt);
    }
    extraTurnRef.current = false;

    resetStriker();

    // Online: canShoot only when it's your turn
    if (modeRef.current === 'online_playing') {
      canShootRef.current = roleRef.current === turnRef.current;
    } else {
      canShootRef.current = true;
    }

    // Online sync
    if (modeRef.current === 'online_playing' && roomIdRef.current) {
      const bodies = Matter.Composite.allBodies(engineRef.current!.world);
      const coinState = bodies
        .filter((b: Matter.Body) => ['white','black','queen'].includes(b.label))
        .map((b: Matter.Body) => ({ id: b.id, pos: b.position, angle: b.angle }));
      mockBackend.publish(('carrom_sync_' + roomIdRef.current) as any, {
        type: 'sync_state',
        turn: turnRef.current,
        scores: scoresRef.current,
        coins: coinState,
      });
    }

    // Bot turn
    const isBotTurn = modeRef.current === 'bot' && turnRef.current === 'p2';
    if (isBotTurn) setTimeout(runBot, 900 + Math.random() * 600);
    else startTimer();
  }

  function resetStriker() {
    if (!strikerRef.current) return;
    strikerSlide.current = 0.5;
    const sp = strikerPos(turnRef.current);
    Matter.Body.setPosition(strikerRef.current, sp);
    Matter.Body.setVelocity(strikerRef.current, { x:0, y:0 });
    Matter.Body.setAngularVelocity(strikerRef.current, 0);
    pocketedIds.current.delete(strikerRef.current.id);
    isDragging.current = false;
    dragPos.current = null;
  }

  // ─────────────────────────────────────────
  //  TIMER
  // ─────────────────────────────────────────
  function startTimer() {
    clearTimer();
    timerValRef.current = TURN_TIME; setTimerVal(TURN_TIME);
    timerRef.current = setInterval(() => {
      timerValRef.current--;
      setTimerVal(timerValRef.current);
      if (timerValRef.current <= 5) playSound('tick');
      if (timerValRef.current <= 0) {
        clearTimer();
        showMsg('⏱️ Time out! FOUL');
        returnCoin(myColor(turnRef.current)); // penalty
        foulRef.current = true;
        endTurn(true);
        foulRef.current = false;
      }
    }, 1000);
  }
  function clearTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  // ─────────────────────────────────────────
  //  AI BOT
  // ─────────────────────────────────────────
  function runBot() {
    if (!canShootRef.current || isMovingRef.current || turnRef.current !== 'p2') return;
    if (!strikerRef.current || !engineRef.current) return;
    canShootRef.current = false; isMovingRef.current = true;

    const sx = strikerRef.current.position.x;
    const sy = strikerRef.current.position.y;
    const targetColor = myColor('p2'); // black

    const targets = allCoinsRef.current.filter(b =>
      !pocketedIds.current.has(b.id) && b.position.x > 0 &&
      (b.label === targetColor || (b.label === 'queen' && !queenCoveredRef.current))
    );

    let tx = BW/2, ty = BH/2;
    if (targets.length > 0) {
      let best: Matter.Body | null = null, bestD = Infinity;
      for (const t of targets) {
        const d = Math.hypot(t.position.x - sx, t.position.y - sy);
        if (d < bestD) { bestD = d; best = t; }
      }
      if (best) { tx = best.position.x; ty = best.position.y; }
    }
    tx += (Math.random() - 0.5) * 28;
    ty += (Math.random() - 0.5) * 28;

    const dx = tx - sx, dy = ty - sy, dist = Math.hypot(dx, dy);
    const pwr = 0.42 + Math.random() * 0.52;
    const fx = (dx/dist)*pwr*MAX_FORCE, fy = (dy/dist)*pwr*MAX_FORCE;

    foulRef.current = false; strikerPocketedRef.current = false;
    ownCoinRef.current = false; oppCoinRef.current = false;

    Matter.Body.applyForce(strikerRef.current, strikerRef.current.position, { x: fx, y: fy });
    playSound('shoot', pwr);
  }

  // ─────────────────────────────────────────
  //  ONLINE SYNC
  // ─────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'online_playing' || !roomId) return;
    const unsub = mockBackend.subscribe(('carrom_sync_' + roomId) as any, (data: any) => {
      if (data.type === 'strike') {
        if (data.shooter === roleRef.current) return; // echo
        if (turnRef.current !== roleRef.current && strikerRef.current) {
          canShootRef.current = false; isMovingRef.current = true;
          isReceivedStrike.current = true;
          Matter.Body.setPosition(strikerRef.current, data.position);
          Matter.Body.applyForce(strikerRef.current, data.position, data.force);
        }
      } else if (data.type === 'sync_state') {
        if (data.scores) { setScores(data.scores); scoresRef.current = data.scores; }
        if (data.turn) {
          setTurn(data.turn); turnRef.current = data.turn;
          canShootRef.current = roleRef.current === data.turn;
          isMovingRef.current = false;
          isReceivedStrike.current = false;
        }
        if (data.coins && engineRef.current) {
          const bodies = Matter.Composite.allBodies(engineRef.current.world);
          (data.coins as any[]).forEach((cd: any) => {
            const b = bodies.find((x: Matter.Body) => x.id === cd.id);
            if (b) {
              Matter.Body.setPosition(b, cd.pos);
              Matter.Body.setAngle(b, cd.angle);
              Matter.Body.setVelocity(b, { x:0, y:0 });
              Matter.Body.setAngularVelocity(b, 0);
            }
          });
        }
        if (data.winner) setWinner(data.winner);
        syncCoinCounts();
      }
    });
    return () => unsub();
  }, [mode, roomId]);

  // ─────────────────────────────────────────
  //  INPUT
  // ─────────────────────────────────────────
  function physPos(e: React.PointerEvent): {x:number;y:number} {
    const canvas = boardRef.current!;
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
    if (!strikerRef.current) return;

    const pos = physPos(e);
    const sx  = strikerRef.current.position.x;
    const sy  = strikerRef.current.position.y;

    // Lane tap: slide striker along lane
    if (Math.hypot(pos.x - sx, pos.y - sy) > STRIKER_R * 4.5) {
      const cur  = turnRef.current;
      const laneY = STRIKER_Y[cur];
      if (Math.abs(pos.y - laneY) < STRIKER_R * 2.5) {
        const minX = PAD + STRIKER_R + 10, maxX = BW - PAD - STRIKER_R - 10;
        const cx2  = Math.max(minX, Math.min(maxX, pos.x));
        strikerSlide.current = (cx2 - minX) / (maxX - minX);
        Matter.Body.setPosition(strikerRef.current, { x: cx2, y: laneY });
        Matter.Body.setVelocity(strikerRef.current, { x:0, y:0 });
      }
      return;
    }

    isDragging.current = true;
    dragPos.current    = pos;
    clearTimer();
  }

  function onPointerMove(e: React.PointerEvent) {
    const pos = physPos(e);
    if (isDragging.current && strikerRef.current) {
      dragPos.current = pos;
      const dx = strikerRef.current.position.x - pos.x;
      const dy = strikerRef.current.position.y - pos.y;
      setPower(Math.min(Math.hypot(dx, dy) / MAX_DRAG, 1));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!isDragging.current || !dragPos.current || !strikerRef.current) {
      isDragging.current = false; dragPos.current = null; setPower(0); return;
    }
    const pos  = dragPos.current;
    const sx   = strikerRef.current.position.x;
    const sy   = strikerRef.current.position.y;
    const dx   = sx - pos.x, dy = sy - pos.y;
    const dist = Math.hypot(dx, dy);
    isDragging.current = false; dragPos.current = null; setPower(0);

    if (dist < 6) { startTimer(); return; } // tiny drag = cancel

    const clamped = Math.min(dist, MAX_DRAG);
    const pwr     = clamped / MAX_DRAG;
    const fx = (dx/dist)*pwr*MAX_FORCE;
    const fy = (dy/dist)*pwr*MAX_FORCE;

    canShootRef.current = false; isMovingRef.current = true;
    foulRef.current = false; strikerPocketedRef.current = false;
    ownCoinRef.current = false; oppCoinRef.current = false;

    Matter.Body.applyForce(strikerRef.current, strikerRef.current.position, { x: fx, y: fy });
    playSound('shoot', pwr);

    // Online publish
    if (modeRef.current === 'online_playing' && roomIdRef.current) {
      mockBackend.publish(('carrom_sync_' + roomIdRef.current) as any, {
        type: 'strike',
        force: { x: fx, y: fy },
        position: strikerRef.current.position,
        shooter: roleRef.current,
      });
    }
  }

  // ─────────────────────────────────────────
  //  GAME LOOP
  // ─────────────────────────────────────────
  function startLoop() {
    const loop = () => { renderBoard(); renderAim(); rafRef.current = requestAnimationFrame(loop); };
    rafRef.current = requestAnimationFrame(loop);
  }
  function stopLoop() { if (rafRef.current) cancelAnimationFrame(rafRef.current); }

  // ─────────────────────────────────────────
  //  CANVAS SETUP (after mode change)
  // ─────────────────────────────────────────
  useEffect(() => {
    if (mode === 'menu' || mode === 'online_lobby') return;
    const timer = setTimeout(() => {
      const canvas = boardRef.current;
      const aimC   = aimRef.current;
      const wrap   = wrapRef.current;
      if (!canvas || !aimC || !wrap) return;

      const size = Math.min(wrap.clientWidth, wrap.clientHeight, 520);
      const dpr  = window.devicePixelRatio || 1;
      const px   = Math.floor(size * dpr);
      scaleRef.current = size / BW;

      canvas.width = px; canvas.height = px;
      canvas.style.width  = size + 'px'; canvas.style.height = size + 'px';
      aimC.width = px; aimC.height = px;
      aimC.style.width  = size + 'px'; aimC.style.height = size + 'px';
      // Adjust scale for dpr
      scaleRef.current = size / BW * dpr;

      initPhysics();
      startLoop();
      startTimer();
    }, 50);
    return () => clearTimeout(timer);
  }, [mode]);

  // Cleanup
  useEffect(() => () => {
    stopLoop();
    clearTimer();
    if (engineRef.current) {
      Matter.Runner.stop(runnerRef.current!);
      Matter.Engine.clear(engineRef.current);
    }
  }, []);

  // ─────────────────────────────────────────
  //  START GAME
  // ─────────────────────────────────────────
  function startGame(m: Mode, r?: Player) {
    setTurn('p1'); turnRef.current = 'p1';
    setScores({ p1: 0, p2: 0 }); scoresRef.current = { p1: 0, p2: 0 };
    setWhiteLeft(9); setBlackLeft(9);
    setWinner(null); setMsg(''); setQueenMsg('');
    setTimerVal(TURN_TIME); setPower(0);
    setExtraTurnAnim(false); setPocketedCoins([]);
    consecFouls.current = { p1: 0, p2: 0 };
    canShootRef.current = true; isMovingRef.current = false;
    isReceivedStrike.current = false;
    extraTurnRef.current = false; foulRef.current = false;
    strikerPocketedRef.current = false; ownCoinRef.current = false; oppCoinRef.current = false;
    queenPocketedRef.current = false; queenCoveredRef.current = false;
    queenOwnerRef.current = null; queenGraceRef.current = 0;
    isDragging.current = false; dragPos.current = null;
    strikerSlide.current = 0.5;
    if (r) { setRole(r); roleRef.current = r; }
    setMode(m); modeRef.current = m;
  }

  // Auto-launch from RoomHub mpSession
  if (mode === 'menu' && mpSession.forGame('carrom')) {
    const sess = mpSession.forGame('carrom')!;
    setTimeout(() => {
      setRole(sess.role as Player); roleRef.current = sess.role as Player;
      setRoomId(sess.roomId); roomIdRef.current = sess.roomId;
      mockBackend.joinRoom(sess.roomId);
      startGame('online_playing', sess.role as Player);
    }, 0);
  }

  // ─────────────────────────────────────────
  //  RENDER — MENU
  // ─────────────────────────────────────────
  if (mode === 'menu') return (
    <div className="flex flex-col items-center justify-center h-full p-6 bg-gradient-to-b from-[#12181f] to-[#0a0e14] text-white">
      <button onClick={() => onGameOver(0)}
        className="absolute top-5 left-5 text-gray-500 hover:text-white transition flex items-center gap-2 text-sm">
        <ArrowLeft className="w-4 h-4" /> Hub
      </button>

      <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center shadow-[0_0_40px_rgba(245,158,11,0.5)] mb-5">
        <span className="text-5xl">🎯</span>
      </div>
      <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-amber-400 to-red-500 bg-clip-text text-transparent mb-1">
        CARROM
      </h1>
      <p className="text-gray-500 text-sm mb-8 tracking-widest uppercase">2 Player</p>

      {/* Rules quick guide */}
      <div className="flex gap-3 mb-7 text-xs text-gray-400 bg-gray-800/40 rounded-xl px-4 py-2.5 border border-gray-700/50">
        <span>⚪ P1 = White</span>
        <span className="text-gray-600">|</span>
        <span>⚫ P2 = Black</span>
        <span className="text-gray-600">|</span>
        <span>🔴 Queen = +3</span>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button onClick={() => startGame('bot')}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-600 to-amber-500 font-bold active:scale-95 transition flex items-center justify-center gap-3">
          <Bot className="w-5 h-5" /> VS AI Bot
        </button>
        <button onClick={() => startGame('local2')}
          className="w-full py-4 rounded-2xl bg-gray-800 border border-gray-700 hover:bg-gray-700 font-bold active:scale-95 transition flex items-center justify-center gap-3">
          <Users className="w-5 h-5 text-yellow-400" /> Local 2 Player
        </button>
        <button onClick={() => setMode('online_lobby')}
          className="w-full py-4 rounded-2xl bg-gray-800 border border-gray-700 hover:bg-gray-700 font-bold active:scale-95 transition flex items-center justify-center gap-3">
          <Globe className="w-5 h-5 text-indigo-400" /> Online
        </button>
      </div>
    </div>
  );

  if (mode === 'online_lobby') return (
    <OnlineLobby
      onStartGame={(r, id) => {
        setRole(r); roleRef.current = r;
        setRoomId(id); roomIdRef.current = id;
        startGame('online_playing', r);
      }}
      onBack={() => setMode('menu')}
    />
  );

  // ─────────────────────────────────────────
  //  RENDER — GAME
  // ─────────────────────────────────────────
  const isMyTurn = mode !== 'online_playing' || role === turn;
  const pwr100   = Math.round(power * 100);
  const timerPct = timerVal / TURN_TIME;
  const timerColor = timerVal <= 5 ? '#ef4444' : timerVal <= 10 ? '#f59e0b' : '#10b981';

  return (
    <div className="flex flex-col items-center h-full bg-gradient-to-b from-[#12181f] to-[#0a0e14] text-white overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex w-full items-center justify-between px-4 pt-3 pb-2 shrink-0">
        <button onClick={() => { stopLoop(); clearTimer(); onGameOver(Math.max(scores.p1, scores.p2), 'Completed'); }}
          className="text-gray-500 hover:text-white text-xs font-bold border border-gray-700 px-3 py-1.5 rounded-xl transition">
          Exit
        </button>
        {/* Timer */}
        <div className="flex items-center gap-2">
          <div className="w-24 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-1000"
              style={{ width: `${timerPct * 100}%`, background: timerColor }} />
          </div>
          <span className="text-sm font-black tabular-nums" style={{ color: timerColor }}>{timerVal}s</span>
        </div>
        <div className="text-xs text-gray-500 font-bold">
          {mode === 'bot' ? 'VS BOT' : mode === 'local2' ? '2P LOCAL' : 'ONLINE'}
        </div>
      </div>

      {/* ── Score cards ── */}
      <div className="flex gap-2 w-full px-4 pb-2 shrink-0">
        {(['p1','p2'] as Player[]).map(p => (
          <div key={p} className={`flex-1 flex items-center justify-between px-3 py-2 rounded-xl border transition-all duration-300 ${
            turn === p ? 'scale-[1.02]' : 'opacity-60 border-gray-700/50 bg-gray-800/30'
          }`} style={turn === p ? { borderColor: PLAYER_COLORS[p]+'99', background: PLAYER_COLORS[p]+'18' } : {}}>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: PLAYER_COLORS[p] }}>
                {pName(p)} {turn === p && !winner ? <span className="animate-pulse">▶</span> : ''}
              </div>
              <div className="text-[9px] text-gray-500 mt-0.5">
                {p === 'p1' ? `⚪ ${whiteLeft} left` : `⚫ ${blackLeft} left`}
              </div>
            </div>
            <div className="text-2xl font-black">{scores[p]}</div>
          </div>
        ))}
      </div>

      {/* Queen / foul message */}
      {(queenMsg || msg) && (
        <div className="w-full px-4 mb-1 shrink-0">
          <div className={`text-xs font-bold text-center py-1.5 rounded-xl border ${
            queenMsg
              ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-300'
              : 'bg-red-500/15 border-red-500/30 text-red-300'
          }`}>
            {queenMsg || msg}
          </div>
        </div>
      )}

      {/* ── Board ── */}
      <div ref={wrapRef} className="relative flex-1 flex items-center justify-center w-full min-h-0 px-2">
        <div className="relative rounded-[2rem] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.8)] outline outline-2 outline-amber-900/30">
          <canvas ref={boardRef} className="block touch-none" />
          <canvas ref={aimRef}   className="block absolute inset-0 touch-none pointer-events-none" style={{ zIndex: 2 }} />
          {/* Pointer capture layer */}
          <div
            className="absolute inset-0 touch-none"
            style={{ zIndex: 3 }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          />
        </div>
      </div>

      {/* ── Power bar + status ── */}
      <div className="w-full px-4 pt-2 pb-3 shrink-0 flex flex-col items-center gap-2">
        {/* Power bar */}
        <div className="flex items-center gap-2 w-full max-w-xs">
          <span className="text-[10px] text-gray-500 font-bold w-8">PWR</span>
          <div className="flex-1 h-2 bg-gray-700/60 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-75"
              style={{
                width: `${pwr100}%`,
                background: power > 0.75 ? '#ef4444' : power > 0.42 ? '#f59e0b' : '#10b981'
              }} />
          </div>
          <span className="text-[10px] text-gray-400 tabular-nums w-7 text-right">{pwr100}%</span>
        </div>

        {/* Status */}
        <p className="text-xs text-gray-400 font-bold tracking-widest uppercase text-center">
          {winner
            ? ''
            : isMovingRef.current
            ? '⚡ Moving…'
            : mode === 'bot' && turn === 'p2'
            ? '🤖 AI soch raha hai…'
            : !isMyTurn
            ? '⏳ Opponent ki turn…'
            : extraTurnAnim
            ? '🎉 Extra Turn!'
            : 'Lane tap → Striker slide · Drag → Aim & Shoot'}
        </p>
      </div>

      {/* ── Win overlay ── */}
      {winner && (
        <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center z-50 backdrop-blur-sm p-6">
          <Crown className="w-20 h-20 text-yellow-400 animate-bounce mb-4 drop-shadow-[0_0_20px_rgba(234,179,8,0.6)]" />
          <h2 className="text-5xl font-black mb-2" style={{ color: PLAYER_COLORS[winner] }}>
            {pName(winner)}
          </h2>
          <p className="text-2xl font-bold text-white mb-2">Jeet gaya! 🎉</p>
          <p className="text-gray-400 mb-8 text-sm">
            {scores.p1} – {scores.p2}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => startGame(mode === 'online_playing' ? 'menu' : mode)}
              className="bg-indigo-600 hover:bg-indigo-500 font-bold py-3 px-8 rounded-2xl active:scale-95 transition">
              Play Again
            </button>
            <button
              onClick={() => { stopLoop(); clearTimer(); onGameOver(scores[winner], 'Win'); }}
              className="bg-gray-700 hover:bg-gray-600 font-bold py-3 px-8 rounded-2xl active:scale-95 transition">
              Hub
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
