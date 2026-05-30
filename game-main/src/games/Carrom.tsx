// ╔══════════════════════════════════════════════════════════════════╗
// ║  CARROM.TSX  —  Official Rules Implementation                    ║
// ║                                                                  ║
// ║  SETUP:  9 White + 9 Black + 1 Queen = 19 coins                 ║
// ║          Inner ring 6 (W-B-W-B-W-B), Outer ring 12 (B-W-…)     ║
// ║                                                                  ║
// ║  TURN:   Own coin → +1pt, extra turn                            ║
// ║          Queen → grace period (cover same or next shot)         ║
// ║          Opponent coin → FOUL, that coin returns                ║
// ║          Miss → turn passes (no foul)                           ║
// ║          Striker in pocket → FOUL, 1 own coin returns           ║
// ║          3 consecutive fouls → -5 pts, reset counter            ║
// ║          Timeout (25s) → FOUL, 1 own coin returns               ║
// ║                                                                  ║
// ║  QUEEN:  Pocket queen → must cover with own coin                ║
// ║          Same shot OR next shot covers it                        ║
// ║          Cover fails → queen returns to centre                  ║
// ║          Cover = +3 bonus pts                                    ║
// ║                                                                  ║
// ║  WIN:    All own coins pocketed + queen covered                  ║
// ║          4P: team colour all gone + queen covered               ║
// ╚══════════════════════════════════════════════════════════════════╝

import React, { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import { CircleDot, ArrowLeft, Users, Bot, Globe, Crown, Trophy, Zap, Star, User } from 'lucide-react';
import { mockBackend } from '../lib/mockBackend';
import { mpSession }    from '../lib/mpSession';
import { rooms as firebaseRooms, type RoomPlayer as FbRoomPlayer } from '../lib/rooms';
import { db as gameDb } from '../lib/db';

// ─── Types ──────────────────────────────────────────────────────────────────
interface CarromProps {
  onGameOver: (score: number, result?: 'Win' | 'Loss' | 'Draw' | 'Completed') => void;
  onBack: () => void;
}
type Mode   = 'menu' | 'bot' | 'local2' | 'local4' | 'online_lobby' | 'online_playing';
type Player = 'p1' | 'p2' | 'p3' | 'p4';
interface SC { p1: number; p2: number; p3: number; p4: number; }

// ─── Constants ───────────────────────────────────────────────────────────────
const BW = 420, BH = 420;
const PAD = 40;           // board border width
const POCKET_R  = 22;     // pocket radius
const COIN_R    = 11;     // coin radius
const STRIKER_R = 15;     // striker radius
const MAX_DRAG  = 130;    // max drag pixels (physics units)
const MAX_FORCE = 0.09;   // max force applied
const TURN_SECS = 25;     // seconds per turn
const MAX_CF    = 3;      // consecutive fouls before penalty
const QUEEN_BONUS = 3;    // +3 pts for covering queen

// Striker lane Y (2P, physics coords)
const LANE_Y: Record<string, number> = {
  p1: BH - PAD - 28,
  p2: PAD + 28,
};
// Striker lane config (4P)
const LANE4: Record<string, { x: number; y: number; axis: 'h' | 'v' }> = {
  p1: { x: BW / 2,      y: BH - PAD - 28, axis: 'h' },
  p2: { x: BW / 2,      y: PAD + 28,      axis: 'h' },
  p3: { x: PAD + 28,    y: BH / 2,        axis: 'v' },
  p4: { x: BW - PAD-28, y: BH / 2,        axis: 'v' },
};
// Clockwise 4P order: bottom → right → top → left
const ORDER4: Player[] = ['p1', 'p4', 'p2', 'p3'];
const ORDER2: Player[] = ['p1', 'p2'];
const PC: Record<string, string> = {
  p1: '#f59e0b', p2: '#3b82f6', p3: '#10b981', p4: '#a855f7',
};
const PN: Record<string, string> = {
  p1: 'Player 1', p2: 'Player 2', p3: 'Player 3', p4: 'Player 4',
};

function coinColor(p: Player, n: number): 'white' | 'black' {
  if (n === 4) return (p === 'p1' || p === 'p3') ? 'white' : 'black';
  return p === 'p1' ? 'white' : 'black';
}
function nextPlayer(cur: Player, n: number): Player {
  const o = n === 4 ? ORDER4 : ORDER2;
  return o[(o.indexOf(cur) + 1) % o.length];
}
function teamOf(p: Player): Player[] {
  return (p === 'p1' || p === 'p3') ? ['p1', 'p3'] : ['p2', 'p4'];
}

// ─────────────────────────────────────────────────────────────────────────────
//  ONLINE LOBBY
// ─────────────────────────────────────────────────────────────────────────────
function OnlineLobby({
  onStart, onBack,
}: {
  onStart: (role: Player, roomId: string, n: number) => void;
  onBack:  () => void;
}) {
  const [step, setStep]       = useState<'menu' | 'size' | 'join' | 'wait'>('menu');
  const [code, setCode]       = useState('');
  const [inp,  setInp]        = useState('');
  const [err,  setErr]        = useState('');
  const [busy, setBusy]       = useState(false);
  const [np,   setNp]         = useState<2 | 4>(2);
  const [pls,  setPls]        = useState<FbRoomPlayer[]>([]);
  const [role, setRole]       = useState<Player>('p1');
  const [rowId,setRowId]      = useState('');
  const [copied, setCopied]   = useState(false);
  const unsub  = useRef<(() => void) | null>(null);
  const gone   = useRef(false);
  const user   = gameDb.getUser();
  const me: FbRoomPlayer = { id: user.id, name: user.name, avatar: user.avatar };

  const stopW = () => { unsub.current?.(); unsub.current = null; };
  useEffect(() => () => stopW(), []);

  function watch(id: string, c: string, r: Player, n: number) {
    stopW();
    unsub.current = firebaseRooms.watch(id, row => {
      setPls(row.players || []);
      if (row.status === 'playing' && !gone.current) {
        gone.current = true; mockBackend.joinRoom(c); onStart(r, c, n);
      }
    });
  }

  async function create(size: 2 | 4) {
    setBusy(true); setErr('');
    try {
      const row = await firebaseRooms.create({ gameId: 'carrom', maxPlayers: size, host: me });
      setCode(row.code); setRowId(row.id); setNp(size); setRole('p1'); setPls(row.players);
      mockBackend.joinRoom(row.code); watch(row.id, row.code, 'p1', size); setStep('wait');
    } catch (e: any) { setErr(e?.message || 'Room create nahi hua.'); }
    finally { setBusy(false); }
  }

  async function join() {
    const c = inp.trim().toUpperCase(); if (!c) return;
    setBusy(true); setErr('');
    try {
      const row  = await firebaseRooms.join(c, me);
      const n    = row.max_players as 2 | 4;
      const idx  = row.players.findIndex(p => p.id === me.id);
      const r    = (['p1','p2','p3','p4'] as Player[])[Math.max(0, idx)] || 'p2';
      setCode(c); setRowId(row.id); setNp(n); setRole(r); setPls(row.players);
      mockBackend.joinRoom(c); watch(row.id, c, r, n); setStep('wait');
    } catch (e: any) { setErr(e?.message || 'Join nahi hua.'); }
    finally { setBusy(false); }
  }

  async function hostStart() {
    setBusy(true);
    try { await firebaseRooms.start(rowId, pls[0]?.id); }
    catch (e: any) { setErr(e?.message || 'Start nahi hua.'); setBusy(false); }
  }

  if (step === 'menu') return (
    <div className="flex flex-col items-center justify-center p-6 h-full text-white bg-[#0a0e14]">
      <button onClick={onBack} className="absolute top-5 left-5 text-gray-500 hover:text-white text-sm">← Back</button>
      <Globe className="w-14 h-14 text-green-400 mb-4" />
      <h2 className="text-3xl font-black mb-8">Online Carrom</h2>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button onClick={() => setStep('size')} className="w-full py-4 rounded-2xl bg-gradient-to-r from-green-600 to-emerald-500 font-bold active:scale-95 transition">Create Room</button>
        <button onClick={() => setStep('join')} className="w-full py-4 rounded-2xl bg-gray-800 border border-gray-700 font-bold active:scale-95 transition">Join Room</button>
      </div>
    </div>
  );

  if (step === 'size') return (
    <div className="flex flex-col items-center justify-center p-6 h-full text-white bg-[#0a0e14]">
      <button onClick={() => setStep('menu')} className="absolute top-5 left-5 text-gray-500 hover:text-white text-sm">← Back</button>
      <h2 className="text-2xl font-black mb-8">Players Chuno</h2>
      <div className="flex gap-4 w-full max-w-xs">
        {([2, 4] as const).map(s => (
          <button key={s} onClick={() => create(s)} disabled={busy}
            className="flex-1 py-8 rounded-2xl bg-gradient-to-b from-blue-600 to-blue-700 font-black active:scale-95 transition disabled:opacity-50">
            <div className="text-4xl">{s}P</div>
          </button>
        ))}
      </div>
      {busy && <p className="text-blue-400 text-sm mt-4">Ban raha hai…</p>}
      {err  && <p className="text-red-400 text-sm mt-4">{err}</p>}
    </div>
  );

  if (step === 'join') return (
    <div className="flex flex-col items-center justify-center p-6 h-full text-white bg-[#0a0e14]">
      <button onClick={() => setStep('menu')} className="absolute top-5 left-5 text-gray-500 hover:text-white text-sm">← Back</button>
      <h2 className="text-2xl font-black mb-6">Room Code Daalo</h2>
      <div className="w-full max-w-xs space-y-4">
        <input value={inp}
          onChange={e => { setInp(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6)); setErr(''); }}
          placeholder="ABC123" maxLength={6} autoFocus
          className="w-full bg-[#0f1923] border border-gray-700 focus:border-indigo-400 outline-none rounded-2xl px-4 py-5 text-center text-4xl font-black font-mono tracking-[0.5em]" />
        {err && <p className="text-red-400 text-sm text-center">{err}</p>}
        <button onClick={join} disabled={busy || inp.length < 4}
          className="w-full bg-indigo-600 font-bold py-4 rounded-xl disabled:opacity-50 active:scale-95 transition">
          {busy ? 'Joining…' : 'Join Game'}
        </button>
      </div>
    </div>
  );

  // Waiting room
  return (
    <div className="flex flex-col items-center justify-center p-6 h-full text-white bg-[#0a0e14]">
      <button onClick={() => { stopW(); setStep('menu'); }} className="absolute top-5 left-5 text-gray-500 hover:text-white text-sm">Cancel</button>
      <div className="bg-[#1c2836] p-6 rounded-3xl border border-green-500/30 w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Room Code</div>
          <div className="text-5xl font-black tracking-widest bg-[#0f1923] py-3 px-6 rounded-2xl border border-gray-700">{code}</div>
          <button onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="mt-2 w-full bg-[#0f1923] border border-gray-700 hover:border-indigo-400 rounded-xl py-2 text-sm font-bold text-indigo-300 transition">
            {copied ? '✓ Copied!' : '📋 Copy Code'}
          </button>
        </div>
        <div className="text-xs text-gray-500 text-center">{np}P · {pls.length}/{np} joined</div>
        {Array.from({ length: np }, (_, i) => {
          const p = pls[i]; const pk = (['p1','p2','p3','p4'] as Player[])[i];
          return (
            <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${p ? 'border-green-500/40 bg-green-500/10' : 'border-gray-700/50 bg-gray-800/30'}`}>
              <div className="w-3 h-3 rounded-full" style={{ background: p ? PC[pk] : '#374151' }} />
              <span className="text-sm font-semibold" style={{ color: p ? PC[pk] : '#6b7280' }}>
                {p ? p.name : `Waiting for ${PN[pk]}…`}
              </span>
              {p && <span className="ml-auto text-green-400 text-xs">✓</span>}
            </div>
          );
        })}
        {err && <p className="text-red-400 text-xs text-center">{err}</p>}
        {role === 'p1'
          ? <button onClick={hostStart} disabled={pls.length < 2 || busy}
              className="w-full bg-gradient-to-r from-green-600 to-emerald-600 font-black py-4 rounded-2xl disabled:opacity-40 active:scale-95 transition">
              {pls.length >= 2 ? '🎮 Start!' : `${np - pls.length} aur chahiye…`}
            </button>
          : <div className="text-blue-400 text-sm text-center">Host ke start ka intezaar…</div>
        }
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN CARROM COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function Carrom({ onGameOver }: CarromProps) {

  // ── React state ───────────────────────────────────────────────────────────
  const [mode,      setMode]      = useState<Mode>('menu');
  const [turn,      setTurn]      = useState<Player>('p1');
  const [scores,    setScores]    = useState<SC>({ p1:0, p2:0, p3:0, p4:0 });
  const [wLeft,     setWLeft]     = useState(9);   // white coins still on board
  const [bLeft,     setBLeft]     = useState(9);   // black coins still on board
  const [winner,    setWinner]    = useState<Player | null>(null);
  const [timerV,    setTimerV]    = useState(TURN_SECS);
  const [power,     setPower]     = useState(0);
  const [foulBanner,setFoulBanner]= useState('');
  const [queenBanner,setQueenBanner]=useState('');
  const [extraAnim, setExtraAnim] = useState(false);
  const [cf,        setCf]        = useState<SC>({ p1:0, p2:0, p3:0, p4:0 }); // consec fouls
  const [role,      setRole]      = useState<Player | null>(null);
  const [roomId,    setRoomId]    = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  // ── Canvas / DOM refs ─────────────────────────────────────────────────────
  const boardCv  = useRef<HTMLCanvasElement>(null);
  const aimCv    = useRef<HTMLCanvasElement>(null);
  const wrapDiv  = useRef<HTMLDivElement>(null);

  // ── Physics refs ──────────────────────────────────────────────────────────
  const ENG     = useRef<Matter.Engine | null>(null);
  const RUN     = useRef<Matter.Runner | null>(null);
  const STRIKER = useRef<Matter.Body   | null>(null);
  // All 19 coin bodies — NEVER removed from world, just teleported off-screen
  const COINS   = useRef<Matter.Body[]>([]);
  const POCKETED= useRef<Set<number>>(new Set()); // IDs off-board right now

  // ── Game-logic refs ───────────────────────────────────────────────────────
  const turnR   = useRef<Player>('p1');
  const numPR   = useRef(2);
  const modeR   = useRef<Mode>('menu');
  const roleR   = useRef<Player | null>(null);
  const roomR   = useRef('');
  const scR     = useRef<SC>({ p1:0, p2:0, p3:0, p4:0 });
  const cfR     = useRef<SC>({ p1:0, p2:0, p3:0, p4:0 });

  // ── Per-shot flags (reset every shot) ────────────────────────────────────
  const canShoot   = useRef(true);
  const inMotion   = useRef(false);
  const extraTurn  = useRef(false);   // player shoots again
  const isFoul     = useRef(false);   // foul occurred this turn
  const strikerIn  = useRef(false);   // striker went into pocket
  const ownIn      = useRef(false);   // own coin pocketed this shot
  const oppIn      = useRef(false);   // opp coin pocketed this shot

  // ── Queen state (persists until resolved) ─────────────────────────────────
  // queenGrace:  0 = queen on board / already covered
  //              1 = queen just pocketed this shot (try to cover same shot or next)
  //             -1 = grace shot granted (MUST cover this shot or queen returns)
  const qGrace    = useRef(0);
  const qOwner    = useRef<Player | null>(null);
  const qCovered  = useRef(false);

  // ── Input refs ────────────────────────────────────────────────────────────
  const slideR    = useRef(0.5);
  const dragging  = useRef(false);
  const dragPos   = useRef<{ x: number; y: number } | null>(null);

  // ── Timer / render refs ───────────────────────────────────────────────────
  const tmrI      = useRef<ReturnType<typeof setInterval> | null>(null);
  const tmrV      = useRef(TURN_SECS);
  const audioCtx  = useRef<AudioContext | null>(null);
  const SCALE     = useRef(1);
  const rafId     = useRef(0);

  // sync refs → state
  useEffect(() => { turnR.current  = turn; },   [turn]);
  useEffect(() => { modeR.current  = mode; },   [mode]);
  useEffect(() => { roleR.current  = role; },   [role]);
  useEffect(() => { roomR.current  = roomId; }, [roomId]);
  useEffect(() => { scR.current    = scores; }, [scores]);
  useEffect(() => { cfR.current    = cf; },     [cf]);

  // ─────────────────────────────────────────────────────────────────────────
  //  AUDIO
  // ─────────────────────────────────────────────────────────────────────────
  function getAC() {
    if (!audioCtx.current)
      audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return audioCtx.current;
  }
  function beep(type: 'shoot'|'pocket'|'foul'|'win'|'tick'|'wall', p=0.5) {
    try {
      const ac=getAC(), o=ac.createOscillator(), g=ac.createGain();
      o.connect(g); g.connect(ac.destination);
      const t=ac.currentTime;
      if (type==='shoot') {
        o.type='triangle'; o.frequency.setValueAtTime(200+p*350,t); o.frequency.exponentialRampToValueAtTime(60,t+.2);
        g.gain.setValueAtTime(.35*p,t); g.gain.exponentialRampToValueAtTime(.001,t+.25);
        o.start(t); o.stop(t+.28);
      } else if (type==='pocket') {
        o.type='sine'; o.frequency.setValueAtTime(900,t); o.frequency.exponentialRampToValueAtTime(200,t+.4);
        g.gain.setValueAtTime(.4,t); g.gain.exponentialRampToValueAtTime(.001,t+.45);
        o.start(t); o.stop(t+.5);
      } else if (type==='wall') {
        o.type='square'; o.frequency.setValueAtTime(180,t); o.frequency.exponentialRampToValueAtTime(80,t+.15);
        g.gain.setValueAtTime(.2,t); g.gain.exponentialRampToValueAtTime(.001,t+.2);
        o.start(t); o.stop(t+.22);
      } else if (type==='foul') {
        o.type='sawtooth'; o.frequency.setValueAtTime(200,t); o.frequency.exponentialRampToValueAtTime(80,t+.35);
        g.gain.setValueAtTime(.3,t); g.gain.exponentialRampToValueAtTime(.001,t+.4);
        o.start(t); o.stop(t+.42);
      } else if (type==='win') {
        [0,.15,.3,.5].forEach((d,i)=>{
          const o2=ac.createOscillator(), g2=ac.createGain();
          o2.connect(g2); g2.connect(ac.destination);
          o2.type='sine'; o2.frequency.value=[523,659,784,1047][i];
          g2.gain.setValueAtTime(.3,t+d); g2.gain.exponentialRampToValueAtTime(.001,t+d+.4);
          o2.start(t+d); o2.stop(t+d+.45);
        }); return;
      } else if (type==='tick') {
        o.type='square'; o.frequency.value=440;
        g.gain.setValueAtTime(.07,t); g.gain.exponentialRampToValueAtTime(.001,t+.06);
        o.start(t); o.stop(t+.08);
      }
    } catch(_) {}
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  COIN HELPERS  — bodies NEVER destroyed, just teleported
  // ─────────────────────────────────────────────────────────────────────────

  // Count a coin label currently on the board (position.x > 0)
  function onBoard(label: string): number {
    return COINS.current.filter(
      b => b.label===label && !POCKETED.current.has(b.id) && b.position.x > 0
    ).length;
  }

  // Move coin off-screen → "pocket" it
  function pocketBody(b: Matter.Body) {
    POCKETED.current.add(b.id);
    Matter.Body.setPosition(b, { x: -700 - Math.random()*200, y: -700 - Math.random()*200 });
    Matter.Body.setVelocity(b, { x:0, y:0 });
    Matter.Body.setAngularVelocity(b, 0);
  }

  // Return ONE pocketed coin of given label → near centre
  function returnCoin(label: string): boolean {
    const b = COINS.current.find(c => c.label===label && POCKETED.current.has(c.id));
    if (!b) return false;
    POCKETED.current.delete(b.id);
    Matter.Body.setPosition(b, {
      x: BW/2 + (Math.random()-.5)*COIN_R*5,
      y: BH/2 + (Math.random()-.5)*COIN_R*5,
    });
    Matter.Body.setVelocity(b, { x:0, y:0 });
    Matter.Body.setAngularVelocity(b, 0);
    return true;
  }

  // Return queen to exact centre
  function returnQueen() {
    const q = COINS.current.find(b => b.label==='queen');
    if (!q) return;
    POCKETED.current.delete(q.id);
    Matter.Body.setPosition(q, { x: BW/2, y: BH/2 });
    Matter.Body.setVelocity(q, { x:0, y:0 });
    Matter.Body.setAngularVelocity(q, 0);
    qGrace.current = 0;
    qOwner.current = null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  STRIKER POSITION
  // ─────────────────────────────────────────────────────────────────────────
  function strikerPos(p: Player): { x: number; y: number } {
    const sl = slideR.current;
    const minX = PAD + STRIKER_R + 8, maxX = BW - PAD - STRIKER_R - 8;
    const minY = PAD + STRIKER_R + 8, maxY = BH - PAD - STRIKER_R - 8;
    if (numPR.current === 2) return { x: minX + (maxX-minX)*sl, y: LANE_Y[p] };
    const c = LANE4[p];
    if (c.axis==='h') return { x: minX + (maxX-minX)*sl, y: c.y };
    return { x: c.x, y: minY + (maxY-minY)*sl };
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  BOARD DRAW
  // ─────────────────────────────────────────────────────────────────────────
  function drawBoard() {
    const cv = boardCv.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const W=cv.width, H=cv.height, s=SCALE.current, bp=PAD*s;

    ctx.clearRect(0,0,W,H);

    // Wood surface
    const gr = ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,W*.72);
    gr.addColorStop(0,'#d4a820'); gr.addColorStop(.55,'#b8860b'); gr.addColorStop(1,'#7c5a08');
    ctx.fillStyle=gr; ctx.fillRect(0,0,W,H);

    // Wood grain
    ctx.save(); ctx.globalAlpha=.06; ctx.strokeStyle='#000'; ctx.lineWidth=1;
    for (let i=0;i<W;i+=12) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i+5,H); ctx.stroke(); }
    ctx.restore();

    // Outer border
    ctx.strokeStyle='#7c3e0c'; ctx.lineWidth=3*s; ctx.strokeRect(bp,bp,W-bp*2,H-bp*2);
    ctx.strokeStyle='#5c2a07'; ctx.lineWidth=s;   ctx.strokeRect(bp+4*s,bp+4*s,W-bp*2-8*s,H-bp*2-8*s);

    // Pockets (4 corners)
    [[bp,bp],[W-bp,bp],[bp,H-bp],[W-bp,H-bp]].forEach(([px,py]) => {
      const pg=ctx.createRadialGradient(px,py,1,px,py,POCKET_R*s);
      pg.addColorStop(0,'#222'); pg.addColorStop(1,'#000');
      ctx.fillStyle=pg; ctx.beginPath(); ctx.arc(px,py,POCKET_R*s,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#3d1a00'; ctx.lineWidth=2*s;
      ctx.beginPath(); ctx.arc(px,py,(POCKET_R+3)*s,0,Math.PI*2); ctx.stroke();
    });

    // Centre circles (4 rings per infographic)
    const cx=W/2, cy=H/2;
    ctx.strokeStyle='rgba(90,45,5,.45)'; ctx.lineWidth=1.2*s;
    [5,14,23,37].forEach(r => { ctx.beginPath(); ctx.arc(cx,cy,r*s,0,Math.PI*2); ctx.stroke(); });
    ctx.fillStyle='rgba(90,45,5,.55)'; ctx.beginPath(); ctx.arc(cx,cy,3*s,0,Math.PI*2); ctx.fill();

    // Diagonals (centre → near each pocket)
    ctx.strokeStyle='rgba(90,45,5,.22)'; ctx.lineWidth=s;
    [[cx,cy,bp+22*s,bp+22*s],[cx,cy,W-bp-22*s,bp+22*s],
     [cx,cy,bp+22*s,H-bp-22*s],[cx,cy,W-bp-22*s,H-bp-22*s]].forEach(([x1,y1,x2,y2]) => {
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    });

    // Baseline lanes
    const n=numPR.current;
    ctx.setLineDash([4*s,6*s]); ctx.lineWidth=1.5*s;
    if (n===2) {
      (['p1','p2'] as Player[]).forEach(p => {
        const active=turnR.current===p;
        ctx.strokeStyle=active?PC[p]+'cc':'rgba(255,255,255,.1)';
        const ly=LANE_Y[p]*s;
        ctx.beginPath(); ctx.moveTo(bp+12*s,ly); ctx.lineTo(W-bp-12*s,ly); ctx.stroke();
      });
    } else {
      (['p1','p2','p3','p4'] as Player[]).forEach(p => {
        const active=turnR.current===p, c=LANE4[p];
        ctx.strokeStyle=active?PC[p]+'cc':'rgba(255,255,255,.08)';
        ctx.beginPath();
        if (c.axis==='h') { ctx.moveTo(bp+12*s,c.y*s); ctx.lineTo(W-bp-12*s,c.y*s); }
        else               { ctx.moveTo(c.x*s,bp+12*s); ctx.lineTo(c.x*s,H-bp-12*s); }
        ctx.stroke();
      });
    }
    ctx.setLineDash([]);

    if (!ENG.current) return;

    // Draw physics bodies
    for (const b of Matter.Composite.allBodies(ENG.current.world)) {
      if (b.isStatic || POCKETED.current.has(b.id)) continue;
      if (b.position.x < 0 || b.position.y < 0) continue;
      const bx=b.position.x*s, by=b.position.y*s;

      if (b.label==='striker') {
        const shootable=canShoot.current && !inMotion.current;
        ctx.save();
        ctx.shadowColor='rgba(0,0,0,.5)'; ctx.shadowBlur=7; ctx.shadowOffsetY=3;
        const sg=ctx.createRadialGradient(bx-3,by-3,1,bx,by,STRIKER_R*s);
        sg.addColorStop(0,'#d0d0ff'); sg.addColorStop(.5,'#9090c0'); sg.addColorStop(1,'#505080');
        ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(bx,by,STRIKER_R*s,0,Math.PI*2); ctx.fill();
        ctx.shadowBlur=0; ctx.shadowOffsetY=0;
        ctx.strokeStyle=shootable?PC[turnR.current]+'cc':'#555577';
        ctx.lineWidth=shootable?2.5*s:s;
        ctx.beginPath(); ctx.arc(bx,by,STRIKER_R*s,0,Math.PI*2); ctx.stroke();
        // Inner ring
        ctx.strokeStyle='rgba(180,180,240,.4)'; ctx.lineWidth=.8*s;
        ctx.beginPath(); ctx.arc(bx,by,STRIKER_R*s*.5,0,Math.PI*2); ctx.stroke();
        // Active glow
        if (shootable) {
          ctx.globalAlpha=.17; ctx.fillStyle=PC[turnR.current];
          ctx.beginPath(); ctx.arc(bx,by,(STRIKER_R+7)*s,0,Math.PI*2); ctx.fill();
          ctx.globalAlpha=1;
        }
        ctx.restore(); continue;
      }

      // Coins
      ctx.save();
      let fill: CanvasGradient, stroke: string;
      if (b.label==='queen') {
        fill=ctx.createRadialGradient(bx-2,by-2,1,bx,by,COIN_R*s);
        fill.addColorStop(0,'#ff7070'); fill.addColorStop(1,'#aa1a1a'); stroke='#8b0000';
      } else if (b.label==='white') {
        fill=ctx.createRadialGradient(bx-2,by-2,1,bx,by,COIN_R*s);
        fill.addColorStop(0,'#ffffff'); fill.addColorStop(1,'#d0d0d0'); stroke='#999';
      } else {
        fill=ctx.createRadialGradient(bx-2,by-2,1,bx,by,COIN_R*s);
        fill.addColorStop(0,'#3a3a5e'); fill.addColorStop(1,'#0e0e1a'); stroke='#000';
      }
      ctx.shadowColor='rgba(0,0,0,.45)'; ctx.shadowBlur=5; ctx.shadowOffsetY=2;
      ctx.fillStyle=fill; ctx.beginPath(); ctx.arc(bx,by,COIN_R*s,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0; ctx.shadowOffsetY=0;
      ctx.strokeStyle=stroke; ctx.lineWidth=s; ctx.stroke();
      // Inner circle
      const ic=b.label==='queen'?'rgba(255,140,140,.5)':b.label==='white'?'rgba(0,0,0,.2)':'rgba(100,100,200,.4)';
      ctx.strokeStyle=ic; ctx.lineWidth=.8*s;
      ctx.beginPath(); ctx.arc(bx,by,COIN_R*s*.5,0,Math.PI*2); ctx.stroke();
      // Queen gold centre dot
      if (b.label==='queen') {
        ctx.fillStyle='#ffcc00';
        ctx.beginPath(); ctx.arc(bx,by,3.5*s,0,Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }

    // Queen cover reminder
    if (qGrace.current!==0 && !qCovered.current) {
      ctx.save(); ctx.globalAlpha=.9;
      ctx.fillStyle='rgba(0,0,0,.6)';
      ctx.fillRect(bp,bp+2*s,W-bp*2,19*s);
      ctx.fillStyle='#fbbf24'; ctx.font=`bold ${11*s}px sans-serif`;
      ctx.textAlign='center';
      ctx.fillText('👑 Apna coin pocket karo — queen cover karo!',W/2,bp+14*s);
      ctx.restore();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  AIM LINE DRAW
  // ─────────────────────────────────────────────────────────────────────────
  function drawAim() {
    const cv=aimCv.current; if (!cv) return;
    const ctx=cv.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0,0,cv.width,cv.height);
    if (!dragging.current||!dragPos.current||!STRIKER.current) return;

    const s=SCALE.current;
    const sx=STRIKER.current.position.x*s, sy=STRIKER.current.position.y*s;
    const tx=dragPos.current.x*s, ty=dragPos.current.y*s;
    const dx=sx-tx, dy=sy-ty, dist=Math.hypot(dx,dy);
    if (dist<5) return;
    const nx=dx/dist, ny=dy/dist;
    const pwr=Math.min(dist/(MAX_DRAG*s),1);

    // Drag handle
    ctx.save(); ctx.globalAlpha=.16; ctx.strokeStyle='#fff'; ctx.lineWidth=10; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(tx,ty); ctx.stroke();

    // Direction arrow
    const len=(55+pwr*215)*s;
    const ex=sx+nx*len, ey=sy+ny*len;
    ctx.globalAlpha=.92; ctx.strokeStyle='#fff'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.stroke();

    // Bouncing trajectory
    const W=cv.width, H=cv.height, bp=PAD*s;
    let px=ex,py=ey,vx=nx,vy=ny;
    const step=8, dots=Math.floor(pwr*28)+8;
    ctx.globalAlpha=.45; ctx.setLineDash([4*s,8*s]);
    ctx.strokeStyle='rgba(255,210,60,.7)'; ctx.lineWidth=1.8;
    ctx.beginPath(); ctx.moveTo(px,py);
    for (let i=0;i<dots;i++) {
      px+=vx*step; py+=vy*step;
      if (px<=bp||px>=W-bp) { vx=-vx; px=Math.max(bp+1,Math.min(W-bp-1,px)); }
      if (py<=bp||py>=H-bp) { vy=-vy; py=Math.max(bp+1,Math.min(H-bp-1,py)); }
      ctx.lineTo(px,py);
    }
    ctx.stroke(); ctx.setLineDash([]);

    // Target coin highlight
    if (ENG.current) {
      let cpx=ex, cpy=ey;
      outer: for (let i=0;i<200;i++) {
        cpx+=nx*4; cpy+=ny*4;
        for (const b of Matter.Composite.allBodies(ENG.current.world)) {
          if (!['white','black','queen'].includes(b.label)) continue;
          if (POCKETED.current.has(b.id)||b.position.x<0) continue;
          const cx2=b.position.x*s, cy2=b.position.y*s;
          if (Math.hypot(cpx-cx2,cpy-cy2)<(STRIKER_R+COIN_R)*s) {
            ctx.globalAlpha=.6; ctx.strokeStyle='#f59e0b'; ctx.lineWidth=2;
            ctx.shadowColor='#f59e0b'; ctx.shadowBlur=8;
            ctx.beginPath(); ctx.arc(cx2,cy2,(COIN_R+4)*s,0,Math.PI*2); ctx.stroke();
            break outer;
          }
        }
      }
    }

    // Power tip dot
    const pc=pwr>.75?'#ef4444':pwr>.42?'#f59e0b':'#10b981';
    ctx.globalAlpha=1; ctx.fillStyle=pc; ctx.shadowColor=pc; ctx.shadowBlur=8;
    ctx.beginPath(); ctx.arc(ex,ey,5.5,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  PHYSICS INIT
  // ─────────────────────────────────────────────────────────────────────────
  function initPhysics() {
    if (ENG.current) { Matter.Runner.stop(RUN.current!); Matter.Engine.clear(ENG.current); }
    POCKETED.current.clear(); COINS.current = [];

    const eng = Matter.Engine.create({ gravity:{x:0,y:0} });
    const run = Matter.Runner.create();
    ENG.current = eng; RUN.current = run;

    // Walls (4 borders)
    const wO = { isStatic:true, restitution:.76, friction:0, label:'wall' };
    const hp = PAD/2;
    const walls = [
      Matter.Bodies.rectangle(BW/2, hp,      BW, PAD, wO),
      Matter.Bodies.rectangle(BW/2, BH-hp,   BW, PAD, wO),
      Matter.Bodies.rectangle(hp,   BH/2,    PAD, BH, wO),
      Matter.Bodies.rectangle(BW-hp,BH/2,    PAD, BH, wO),
    ];

    // Pocket sensors (4 corners)
    const pO = { isStatic:true, isSensor:true, label:'pocket' };
    const pockets = [
      Matter.Bodies.circle(PAD,      PAD,      POCKET_R, pO),
      Matter.Bodies.circle(BW-PAD,   PAD,      POCKET_R, pO),
      Matter.Bodies.circle(PAD,      BH-PAD,   POCKET_R, pO),
      Matter.Bodies.circle(BW-PAD,   BH-PAD,   POCKET_R, pO),
    ];

    // ── 19 Coins ─────────────────────────────────────────────────
    // Infographic layout:
    //   Centre:     1 Queen
    //   Inner ring: 6 coins  alternating W-B-W-B-W-B  (3W + 3B)
    //   Outer ring: 12 coins alternating B-W-B-W-…    (6B + 6W)
    //   Total: 9W + 9B + 1Q = 19 ✓
    const cO = (lbl: string) => ({
      restitution:.72, friction:.04, frictionAir:.018, density:.002, label: lbl,
    });
    const cx=BW/2, cy=BH/2;
    const coins: Matter.Body[] = [];

    // Queen at exact centre
    coins.push(Matter.Bodies.circle(cx, cy, COIN_R, cO('queen')));

    // Inner ring: radius = COIN_R * 2.4, 6 positions evenly spaced, offset 0°
    for (let i=0;i<6;i++) {
      const a = (i/6)*Math.PI*2;
      coins.push(Matter.Bodies.circle(
        cx + Math.cos(a)*COIN_R*2.4,
        cy + Math.sin(a)*COIN_R*2.4,
        COIN_R, cO(i%2===0 ? 'white' : 'black')
      ));
    }

    // Outer ring: radius = COIN_R * 4.6, 12 positions, offset 15°
    for (let i=0;i<12;i++) {
      const a = (i/12)*Math.PI*2 + Math.PI/12;
      coins.push(Matter.Bodies.circle(
        cx + Math.cos(a)*COIN_R*4.6,
        cy + Math.sin(a)*COIN_R*4.6,
        COIN_R, cO(i%2===0 ? 'black' : 'white')
      ));
    }

    COINS.current = coins;

    // Striker
    const sp = strikerPos(turnR.current);
    const striker = Matter.Bodies.circle(sp.x, sp.y, STRIKER_R, {
      restitution:.78, friction:.05, frictionAir:.024, density:.005, label:'striker',
    });
    STRIKER.current = striker;

    Matter.Composite.add(eng.world, [...walls, ...pockets, ...coins, striker]);

    // ── Collision events ──────────────────────────────────────────
    Matter.Events.on(eng, 'collisionStart', (evt: Matter.IEventCollision<Matter.Engine>) => {
      for (const { bodyA, bodyB } of evt.pairs) {
        // Striker wall bounce
        if ((bodyA.label==='wall'&&bodyB.label==='striker') ||
            (bodyB.label==='wall'&&bodyA.label==='striker'))
          beep('wall');

        // Pocket sensor
        const isPA=bodyA.label==='pocket', isPB=bodyB.label==='pocket';
        if (isPA||isPB) {
          const obj = isPA ? bodyB : bodyA;
          if (obj && obj.label!=='wall' && obj.label!=='pocket')
            if (!POCKETED.current.has(obj.id) && obj.position.x>0 && obj.position.y>0)
              handlePocket(obj);
        }
      }
    });

    // Motion stop detection
    Matter.Events.on(eng, 'afterUpdate', () => {
      if (!inMotion.current) return;
      const moving = Matter.Composite.allBodies(eng.world).some((b: Matter.Body) => {
        if (b.isStatic || b.position.x<0) return false;
        const v=b.velocity, av=b.angularVelocity;
        return v.x*v.x+v.y*v.y>.01 || Math.abs(av)>.01;
      });
      if (!moving) { inMotion.current=false; setTimeout(afterShot, 220); }
    });

    Matter.Runner.run(run, eng);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  POCKET HANDLER — fires during physics simulation
  //
  //  Rules (from infographic):
  //    STRIKER  → foul flag. Penalty coin returns in afterShot.
  //    QUEEN    → start grace (cover same shot or next shot)
  //    OWN COIN → +1pt, extra turn, covers queen if grace active
  //    OPP COIN → foul, that coin returns immediately, extra turn cancelled
  // ─────────────────────────────────────────────────────────────────────────
  function handlePocket(b: Matter.Body) {
    if (POCKETED.current.has(b.id)) return;
    beep('pocket');
    particles(b.position.x, b.position.y, b.label);
    pocketBody(b);   // teleport off-screen

    const lbl = b.label;
    const cur = turnR.current;
    const n   = numPR.current;
    const mc  = coinColor(cur, n);  // my colour

    // ── STRIKER ──────────────────────────────────────────────────
    if (lbl==='striker') {
      strikerIn.current = true;
      isFoul.current    = true;
      extraTurn.current = false;
      // Don't remove from world; resetStriker will reposition it
      POCKETED.current.delete(b.id);
      Matter.Body.setPosition(b, { x:-900, y:-900 });
      Matter.Body.setVelocity(b, { x:0, y:0 });
      return;
    }

    // ── QUEEN ─────────────────────────────────────────────────────
    if (lbl==='queen') {
      if (!qCovered.current) {
        qGrace.current = 1;  // grace: cover same shot or next
        qOwner.current = cur;
        showQueen('👑 Queen pocketed! Apna coin pocket karo — cover karo!');
      }
      return;
    }

    // ── OWN COIN ─────────────────────────────────────────────────
    if (lbl===mc) {
      ownIn.current = true;

      // Does this cover the queen?
      if (qGrace.current!==0 && !qCovered.current && qOwner.current===cur) {
        qCovered.current = true;
        qGrace.current   = 0;
        showQueen(`👑 Queen cover! +${QUEEN_BONUS} bonus!`);
        addScore(cur, QUEEN_BONUS);
      }

      // +1 point for own coin
      addScore(cur, 1);

      // Extra turn — only if no foul happened
      if (!isFoul.current && !strikerIn.current)
        extraTurn.current = true;

      // Reset consecutive fouls on successful shot
      resetCF(cur);
      return;
    }

    // ── OPPONENT COIN (or wrong colour in 4P) ────────────────────
    // In 4P: same-team colour is also "own", enemy colour is foul
    // (coinColor already returns 'white'/'black' correctly per team)
    if (lbl!==mc) {
      oppIn.current     = true;
      isFoul.current    = true;
      extraTurn.current = false;
      // Return opponent coin immediately
      setTimeout(() => returnCoin(lbl), 350);
      beep('foul');
      showFoul(`⚠️ FOUL — ${lbl==='white'?'⚪':'⚫'} opponent ka coin wapas aayega!`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  AFTER SHOT — resolve all rules once everything stops
  //
  //  Order:
  //    1. Striker foul → penalty coin returns, turn passes
  //    2. Queen grace resolution
  //    3. Extra turn OR turn passes
  // ─────────────────────────────────────────────────────────────────────────
  function afterShot() {
    const cur=turnR.current, n=numPR.current, mc=coinColor(cur,n);

    // ── 1. Striker foul ──────────────────────────────────────────
    if (strikerIn.current) {
      beep('foul');
      showFoul('⚠️ FOUL — Striker pocket hua! Ek apna coin wapas.');
      returnCoin(mc);          // penalty: own pocketed coin returns
      isFoul.current    = true;
      extraTurn.current = false;
    }

    // ── 2. Queen grace resolution ────────────────────────────────
    if (!qCovered.current && qGrace.current!==0) {
      if (qGrace.current===1) {
        // Queen pocketed THIS shot
        if (ownIn.current && !isFoul.current) {
          // Covered same shot ✓ (handled in handlePocket already)
        } else if (!isFoul.current) {
          // Not covered, no foul → grant ONE grace shot (player keeps turn)
          qGrace.current = -1;
          extraTurn.current = true;
          showQueen('👑 Agli shot mein apna coin pocket karo — cover karo!');
        } else {
          // Foul same shot → queen returns immediately
          returnQueen();
          showQueen('👑 Foul ke saath queen — centre mein wapas!');
        }
      } else if (qGrace.current===-1) {
        // This WAS the grace shot
        if (ownIn.current && !isFoul.current) {
          // Covered on grace shot ✓ (handled in handlePocket)
        } else {
          // Failed cover → queen returns
          returnQueen();
          extraTurn.current = false;
          showQueen('👑 Cover nahi hua — queen centre mein wapas!');
        }
      }
    }

    // Show extra-turn animation
    if (extraTurn.current && !isFoul.current) {
      setExtraAnim(true); setTimeout(()=>setExtraAnim(false), 1100);
    }

    // Reset per-shot flags
    strikerIn.current = false;
    ownIn.current     = false;
    oppIn.current     = false;

    syncCounts();
    checkWin();

    const wasFoul = isFoul.current;
    isFoul.current = false;
    endTurn(wasFoul);
  }

  function syncCounts() {
    setWLeft(onBoard('white'));
    setBLeft(onBoard('black'));
  }

  function addScore(p: Player, pts: number) {
    setScores(prev => {
      const nx = { ...prev, [p]: prev[p]+pts };
      scR.current = nx; return nx;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  END TURN
  // ─────────────────────────────────────────────────────────────────────────
  function endTurn(wasFoul: boolean) {
    clearTmr();
    if (wasFoul) {
      addCF(turnR.current);
      extraTurn.current = false;
    }

    if (extraTurn.current) {
      // Same player shoots again
      extraTurn.current = false;
    } else {
      // Pass to next player
      const nxt = nextPlayer(turnR.current, numPR.current);
      setTurn(nxt); turnR.current = nxt;
    }

    resetStriker();
    canShoot.current = true;

    // Online sync
    if (modeR.current==='online_playing' && roomR.current) {
      mockBackend.publish(('carrom_sync_'+roomR.current) as any, {
        type:'sync', turn:turnR.current, scores:scR.current,
      });
    }

    const isBot = modeR.current==='bot' && turnR.current==='p2';
    setStatusMsg(isBot ? '🤖 AI soch raha hai…' : 'Lane tap → position · Drag → aim & shoot');
    if (isBot) setTimeout(runBot, 900+Math.random()*600);
    else        startTmr();
  }

  function resetStriker() {
    if (!STRIKER.current) return;
    slideR.current = 0.5;
    const pos = strikerPos(turnR.current);
    Matter.Body.setPosition(STRIKER.current, pos);
    Matter.Body.setVelocity(STRIKER.current, {x:0,y:0});
    Matter.Body.setAngularVelocity(STRIKER.current, 0);
    POCKETED.current.delete(STRIKER.current.id);
    dragging.current = false; dragPos.current = null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  CONSECUTIVE FOULS
  //  3 consecutive fouls = -5 pts, reset counter
  // ─────────────────────────────────────────────────────────────────────────
  function addCF(p: Player) {
    const n = cfR.current[p]+1;
    const nx = { ...cfR.current, [p]:n };
    cfR.current = nx; setCf({...nx});
    if (n >= MAX_CF) {
      // -5 penalty
      setScores(prev => {
        const s2 = {...prev, [p]: Math.max(0, prev[p]-5)};
        scR.current=s2; return s2;
      });
      const r = {...nx, [p]:0}; cfR.current=r; setCf({...r});
      showFoul(`🚫 ${PN[p]}: ${MAX_CF} fouls! −5 points!`);
    }
  }
  function resetCF(p: Player) {
    const nx = {...cfR.current, [p]:0}; cfR.current=nx; setCf({...nx});
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  WIN CHECK
  //  Condition: ALL own coins pocketed  AND  queen covered
  //  4P: TEAM's colour all gone + queen covered
  // ─────────────────────────────────────────────────────────────────────────
  function checkWin() {
    if (!qCovered.current) return;  // queen must be covered to win
    const n = numPR.current;

    if (n===2) {
      (['p1','p2'] as Player[]).forEach(p => {
        if (onBoard(coinColor(p,n))===0) doWin(p);
      });
    } else {
      // 4P teams: check by colour
      if (onBoard('white')===0) doWin('p1'); // Team A wins
      if (onBoard('black')===0) doWin('p2'); // Team B wins
    }
  }

  function doWin(p: Player) {
    clearTmr(); canShoot.current=false;
    beep('win'); setWinner(p);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  TIMER  (25 seconds per turn)
  //  Timeout = foul: own coin returns + turn passes
  // ─────────────────────────────────────────────────────────────────────────
  function startTmr() {
    clearTmr();
    tmrV.current=TURN_SECS; setTimerV(TURN_SECS);
    tmrI.current = setInterval(() => {
      tmrV.current--; setTimerV(tmrV.current);
      if (tmrV.current<=5) beep('tick');
      if (tmrV.current<=0) {
        clearTmr();
        showFoul('⏱️ Time out! FOUL');
        returnCoin(coinColor(turnR.current, numPR.current));
        isFoul.current=true; endTurn(true); isFoul.current=false;
      }
    }, 1000);
  }
  function clearTmr() { if (tmrI.current) { clearInterval(tmrI.current); tmrI.current=null; } }

  // ─────────────────────────────────────────────────────────────────────────
  //  AI BOT
  // ─────────────────────────────────────────────────────────────────────────
  function runBot() {
    if (!canShoot.current||inMotion.current||turnR.current!=='p2') return;
    canShoot.current=false; inMotion.current=true;
    if (!STRIKER.current||!ENG.current) return;

    const sx=STRIKER.current.position.x, sy=STRIKER.current.position.y;
    const mc=coinColor('p2', numPR.current);
    // Target: queen (if uncovered, no pending grace) or own coins
    const targets = COINS.current.filter(b =>
      !POCKETED.current.has(b.id) && b.position.x>0 &&
      (b.label===mc || (b.label==='queen' && !qCovered.current && qGrace.current===0))
    );
    let tx=BW/2, ty=BH/2;
    if (targets.length) {
      let best=targets[0], bd=Infinity;
      for (const t of targets) {
        const d=Math.hypot(t.position.x-sx,t.position.y-sy);
        if (d<bd) { bd=d; best=t; }
      }
      tx=best.position.x+(Math.random()-.5)*24;
      ty=best.position.y+(Math.random()-.5)*24;
    }
    const dx=tx-sx, dy=ty-sy, dist=Math.hypot(dx,dy);
    const pwr=0.38+Math.random()*0.55;
    strikerIn.current=false; ownIn.current=false; oppIn.current=false; isFoul.current=false;
    Matter.Body.applyForce(STRIKER.current, STRIKER.current.position, {
      x:(dx/dist)*pwr*MAX_FORCE, y:(dy/dist)*pwr*MAX_FORCE,
    });
    beep('shoot', pwr); setPower(0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  ONLINE SYNC
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode!=='online_playing'||!roomId) return;
    const unsub = mockBackend.subscribe(('carrom_sync_'+roomId) as any, (data: any) => {
      if (data.type==='strike') {
        if (data.shooter===roleR.current) return;
        if (STRIKER.current && canShoot.current) {
          canShoot.current=false; inMotion.current=true;
          Matter.Body.setPosition(STRIKER.current, data.pos);
          Matter.Body.applyForce(STRIKER.current, data.pos, data.force);
        }
      } else if (data.type==='sync') {
        if (data.scores) { setScores(data.scores); scR.current=data.scores; }
        if (data.turn)   { setTurn(data.turn); turnR.current=data.turn; }
      }
    });
    return () => unsub();
  }, [mode, roomId]);

  // ─────────────────────────────────────────────────────────────────────────
  //  INPUT HANDLING
  // ─────────────────────────────────────────────────────────────────────────
  function toPhys(e: React.PointerEvent): { x: number; y: number } {
    const r = boardCv.current!.getBoundingClientRect();
    return { x:(e.clientX-r.left)/SCALE.current, y:(e.clientY-r.top)/SCALE.current };
  }

  function onDown(e: React.PointerEvent) {
    if (!canShoot.current||inMotion.current) return;
    if (modeR.current==='bot'&&turnR.current==='p2') return;
    if (modeR.current==='online_playing'&&roleR.current!==turnR.current) return;
    if (!STRIKER.current) return;

    const pos=toPhys(e);
    const sx=STRIKER.current.position.x, sy=STRIKER.current.position.y;
    const dist=Math.hypot(pos.x-sx, pos.y-sy);

    // Tap far from striker → slide striker along baseline
    if (dist > STRIKER_R*4.5) {
      const p=turnR.current, n=numPR.current;
      const minX=PAD+STRIKER_R+6, maxX=BW-PAD-STRIKER_R-6;
      const minY=PAD+STRIKER_R+6, maxY=BH-PAD-STRIKER_R-6;
      if (n===2) {
        const ly=LANE_Y[p];
        if (Math.abs(pos.y-ly) < STRIKER_R*2.8) {
          const nx=Math.max(minX, Math.min(maxX, pos.x));
          slideR.current=(nx-minX)/(maxX-minX);
          Matter.Body.setPosition(STRIKER.current, {x:nx, y:ly});
          Matter.Body.setVelocity(STRIKER.current, {x:0,y:0});
        }
      } else {
        const c=LANE4[p];
        if (c.axis==='h' && Math.abs(pos.y-c.y)<STRIKER_R*2.8) {
          const nx=Math.max(minX,Math.min(maxX,pos.x));
          slideR.current=(nx-minX)/(maxX-minX);
          Matter.Body.setPosition(STRIKER.current,{x:nx,y:c.y});
          Matter.Body.setVelocity(STRIKER.current,{x:0,y:0});
        } else if (c.axis==='v' && Math.abs(pos.x-c.x)<STRIKER_R*2.8) {
          const ny=Math.max(minY,Math.min(maxY,pos.y));
          slideR.current=(ny-minY)/(maxY-minY);
          Matter.Body.setPosition(STRIKER.current,{x:c.x,y:ny});
          Matter.Body.setVelocity(STRIKER.current,{x:0,y:0});
        }
      }
      return;
    }

    // Close to striker → start drag for shooting
    dragging.current=true; dragPos.current=pos; clearTmr();
  }

  function onMove(e: React.PointerEvent) {
    const pos=toPhys(e);
    if (dragging.current && STRIKER.current) {
      dragPos.current=pos;
      const dx=STRIKER.current.position.x-pos.x, dy=STRIKER.current.position.y-pos.y;
      setPower(Math.min(Math.hypot(dx,dy)/MAX_DRAG, 1));
    }
  }

  function onUp(e: React.PointerEvent) {
    if (!dragging.current||!dragPos.current||!STRIKER.current) {
      dragging.current=false; dragPos.current=null; setPower(0); return;
    }
    const pos=dragPos.current;
    const sx=STRIKER.current.position.x, sy=STRIKER.current.position.y;
    const dx=sx-pos.x, dy=sy-pos.y, dist=Math.hypot(dx,dy);
    dragging.current=false; dragPos.current=null; setPower(0);
    if (dist<6) { startTmr(); return; }  // tap → no shot

    const pwr=Math.min(dist/MAX_DRAG, 1);
    const fx=(dx/dist)*pwr*MAX_FORCE, fy=(dy/dist)*pwr*MAX_FORCE;

    canShoot.current=false; inMotion.current=true;
    strikerIn.current=false; ownIn.current=false; oppIn.current=false; isFoul.current=false;

    Matter.Body.applyForce(STRIKER.current, STRIKER.current.position, {x:fx,y:fy});
    beep('shoot', pwr);

    if (modeR.current==='online_playing' && roomR.current)
      mockBackend.publish(('carrom_sync_'+roomR.current) as any, {
        type:'strike', force:{x:fx,y:fy}, pos:STRIKER.current.position,
        shooter:roleR.current,
      });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER LOOP
  // ─────────────────────────────────────────────────────────────────────────
  function startLoop() {
    const loop=()=>{ drawBoard(); drawAim(); rafId.current=requestAnimationFrame(loop); };
    rafId.current=requestAnimationFrame(loop);
  }
  function stopLoop() { if (rafId.current) cancelAnimationFrame(rafId.current); }

  // ─────────────────────────────────────────────────────────────────────────
  //  PARTICLES
  // ─────────────────────────────────────────────────────────────────────────
  function particles(physX: number, physY: number, lbl: string) {
    const wrap=wrapDiv.current, cv=boardCv.current; if (!wrap||!cv) return;
    const s=SCALE.current, cr=cv.getBoundingClientRect(), wr=wrap.getBoundingClientRect();
    const cx=cr.left-wr.left+physX*s, cy=cr.top-wr.top+physY*s;
    const cols: Record<string,string[]>={
      queen:['#f59e0b','#ef4444','#fbbf24'],
      white:['#e8e8e8','#fff','#d0d0d0'],
      black:['#4444aa','#1e293b','#6666cc'],
      striker:['#9090c0','#c0c0e0'],
    };
    const c=cols[lbl]||['#fff'];
    for (let i=0;i<14;i++) {
      const el=document.createElement('div');
      const a=Math.random()*Math.PI*2, d=30+Math.random()*55, sz=4+Math.random()*6;
      el.style.cssText=`position:absolute;left:${cx}px;top:${cy}px;width:${sz}px;height:${sz}px;border-radius:50%;background:${c[i%c.length]};pointer-events:none;z-index:99;--dx:${Math.cos(a)*d}px;--dy:${Math.sin(a)*d}px;animation:pfx ${.45+Math.random()*.4}s ease-out forwards`;
      wrap.appendChild(el); setTimeout(()=>el.remove(), 950);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  UI HELPERS
  // ─────────────────────────────────────────────────────────────────────────
  function showFoul(msg: string) { setFoulBanner(msg); setTimeout(()=>setFoulBanner(''), 2800); }
  function showQueen(msg: string){ setQueenBanner(msg); setTimeout(()=>setQueenBanner(''), 3000); }

  // ─────────────────────────────────────────────────────────────────────────
  //  GAME START
  // ─────────────────────────────────────────────────────────────────────────
  function startGame(m: Mode, n=2) {
    numPR.current=n; modeR.current=m; setMode(m);
    setTurn('p1'); turnR.current='p1';
    setScores({p1:0,p2:0,p3:0,p4:0}); scR.current={p1:0,p2:0,p3:0,p4:0};
    setWLeft(9); setBLeft(9); setWinner(null); setTimerV(TURN_SECS);
    setPower(0); setFoulBanner(''); setQueenBanner(''); setExtraAnim(false);
    setCf({p1:0,p2:0,p3:0,p4:0}); cfR.current={p1:0,p2:0,p3:0,p4:0};
    canShoot.current=true; inMotion.current=false;
    extraTurn.current=false; isFoul.current=false;
    strikerIn.current=false; ownIn.current=false; oppIn.current=false;
    qGrace.current=0; qOwner.current=null; qCovered.current=false;
    dragging.current=false; dragPos.current=null; slideR.current=0.5;
    setStatusMsg('Lane tap → position · Drag → aim & shoot');
  }

  // Canvas setup after mode change
  useEffect(() => {
    if (mode==='menu'||mode==='online_lobby') return;
    const t=setTimeout(() => {
      const cv=boardCv.current, aim=aimCv.current, wrap=wrapDiv.current;
      if (!cv||!aim||!wrap) return;
      const sz=Math.min(wrap.clientWidth,wrap.clientHeight,440)-4;
      cv.width=sz; cv.height=sz; aim.width=sz; aim.height=sz;
      SCALE.current=sz/BW;
      initPhysics(); stopLoop(); startLoop(); startTmr(); syncCounts();
      if (mode==='bot'&&turnR.current==='p2') setTimeout(runBot,900);
    }, 60);
    return () => {
      clearTimeout(t); stopLoop(); clearTmr();
      if (ENG.current) { Matter.Runner.stop(RUN.current!); Matter.Engine.clear(ENG.current); ENG.current=null; }
    };
  }, [mode]);

  // Auto-launch from RoomHub
  if (mode==='menu' && mpSession.forGame('carrom')) {
    const sess=mpSession.forGame('carrom')!;
    setTimeout(() => {
      setRole(sess.role as Player); roleR.current=sess.role as Player;
      setRoomId(sess.roomId); roomR.current=sess.roomId;
      mockBackend.joinRoom(sess.roomId);
      startGame('online_playing', sess.maxPlayers);
    }, 0);
  }

  if (mode==='online_lobby') return (
    <OnlineLobby
      onStart={(r,id,n)=>{ setRole(r); roleR.current=r; setRoomId(id); roomR.current=id; startGame('online_playing',n); }}
      onBack={()=>setMode('menu')}
    />
  );

  // ─────────────────────────────────────────────────────────────────────────
  //  MENU
  // ─────────────────────────────────────────────────────────────────────────
  if (mode==='menu') return (
    <div className="flex flex-col items-center justify-center p-6 h-full text-white bg-gradient-to-b from-[#12181f] to-[#0a0e14]">
      <button onClick={()=>onGameOver(0)} className="absolute top-5 left-5 text-gray-500 hover:text-white text-sm flex items-center gap-1.5">
        <ArrowLeft className="w-4 h-4"/> Hub
      </button>

      <div className="flex flex-col items-center mb-6">
        <div className="relative mb-3">
          <div className="w-[88px] h-[88px] rounded-full bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center shadow-[0_0_40px_rgba(245,158,11,0.55)]">
            <CircleDot className="w-11 h-11 text-white"/>
          </div>
          <div className="absolute -top-1 -right-1 w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center">
            <Star className="w-3.5 h-3.5 text-yellow-800"/>
          </div>
        </div>
        <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-amber-400 to-red-500 bg-clip-text text-transparent">CARROM</h1>
        <p className="text-gray-500 text-xs mt-1 tracking-widest uppercase">Official Rules</p>
      </div>

      {/* Coin legend */}
      <div className="flex gap-3 mb-6 bg-gray-800/50 rounded-2xl px-5 py-2.5 border border-gray-700/50">
        <div className="flex items-center gap-1.5"><div className="w-3.5 h-3.5 rounded-full bg-white border border-gray-300"/><span className="text-xs text-gray-300 font-bold">9 White</span></div>
        <div className="w-px bg-gray-700"/>
        <div className="flex items-center gap-1.5"><div className="w-3.5 h-3.5 rounded-full bg-[#1e1a2e] border border-blue-800"/><span className="text-xs text-gray-300 font-bold">9 Black</span></div>
        <div className="w-px bg-gray-700"/>
        <div className="flex items-center gap-1.5"><div className="w-3.5 h-3.5 rounded-full bg-red-600 border border-red-400"/><span className="text-xs text-yellow-400 font-bold">1 Queen</span></div>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button onClick={()=>startGame('bot',2)} className="group w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-amber-600 to-amber-500 font-bold shadow-[0_4px_20px_rgba(245,158,11,0.35)] active:scale-[.97] transition-all flex items-center gap-3">
          <Bot className="w-5 h-5 group-hover:rotate-12 transition-transform"/>
          <span className="flex-1 text-left">VS AI Bot</span><Zap className="w-4 h-4 opacity-60"/>
        </button>
        <button onClick={()=>startGame('local2',2)} className="group w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 font-bold shadow-[0_4px_20px_rgba(59,130,246,0.3)] active:scale-[.97] transition-all flex items-center gap-3">
          <Users className="w-5 h-5"/>
          <span className="flex-1 text-left">2 Player Local</span><span className="text-xs opacity-60">Same device</span>
        </button>
        <button onClick={()=>startGame('local4',4)} className="group w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 font-bold shadow-[0_4px_20px_rgba(168,85,247,0.3)] active:scale-[.97] transition-all flex items-center gap-3">
          <User className="w-5 h-5"/>
          <span className="flex-1 text-left">4 Player Local</span><span className="text-xs opacity-60">Teams A & B</span>
        </button>
        <button onClick={()=>setMode('online_lobby')} className="group w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-green-600 to-emerald-500 font-bold shadow-[0_4px_20px_rgba(16,185,129,0.3)] active:scale-[.97] transition-all flex items-center gap-3">
          <Globe className="w-5 h-5 group-hover:animate-spin"/>
          <span className="flex-1 text-left">Online Play</span><span className="text-xs opacity-60">2P or 4P</span>
        </button>
      </div>

      <div className="mt-5 text-[10.5px] text-gray-600 text-center max-w-xs leading-relaxed">
        Own coin pocket → +1pt · Extra turn<br/>
        Queen → cover same or next shot (+3 bonus)<br/>
        Striker in pocket → FOUL · Opp coin → FOUL<br/>
        3 consecutive fouls → −5 pts
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  //  GAME HUD
  // ─────────────────────────────────────────────────────────────────────────
  const n      = numPR.current;
  const pname  = (p: Player) => p==='p2'&&mode==='bot'?'AI Bot':PN[p];
  const tmrPct = timerV/TURN_SECS;
  const tmrCol = timerV<=5?'#ef4444':timerV<=10?'#f59e0b':'#10b981';
  const pwrCol = power>.75?'#ef4444':power>.42?'#f59e0b':'#10b981';
  const canI   = canShoot.current&&!inMotion.current&&
                 !(mode==='bot'&&turn==='p2')&&
                 !(mode==='online_playing'&&role!==turn);

  return (
    <div className="flex flex-col items-center h-full text-white bg-gradient-to-b from-[#12181f] to-[#0a0e14] overflow-hidden select-none">

      {/* Top bar */}
      <div className="flex items-center justify-between w-full max-w-[440px] px-3 pt-3 pb-1">
        <button onClick={()=>{stopLoop();clearTmr();onGameOver(Math.max(scores.p1,scores.p2,scores.p3,scores.p4),'Completed');}}
          className="text-gray-500 hover:text-white text-xs flex items-center gap-1.5">
          <ArrowLeft className="w-3.5 h-3.5"/>Exit
        </button>
        <div className={`px-4 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all ${
          extraAnim?'bg-gradient-to-r from-green-500 to-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.7)]':''
        }`} style={{background:extraAnim?undefined:PC[turn]+'dd'}}>
          {extraAnim ? '🎯 Extra Turn!' : `${pname(turn)} ki Baari`}
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="26" height="26" viewBox="0 0 26 26" style={{transform:'rotate(-90deg)'}}>
            <circle cx="13" cy="13" r="10" fill="none" stroke="#1f2937" strokeWidth="3"/>
            <circle cx="13" cy="13" r="10" fill="none" stroke={tmrCol} strokeWidth="3"
              strokeLinecap="round" strokeDasharray="62.8"
              strokeDashoffset={62.8*(1-tmrPct)}
              style={{transition:'stroke-dashoffset .9s linear,stroke .3s'}}/>
          </svg>
          <span className="text-sm font-bold w-5 text-center" style={{color:tmrCol}}>{timerV}</span>
        </div>
      </div>

      {/* Score bar */}
      {n===2 ? (
        <div className="flex gap-2 w-full max-w-[440px] px-3 pb-2">
          {(['p1','p2'] as Player[]).map(p=>(
            <div key={p} className={`flex-1 flex items-center justify-between px-3 py-2 rounded-xl border transition-all ${
              turn===p?'border-opacity-70':'border-gray-700/40 bg-gray-800/40'
            }`} style={turn===p?{borderColor:PC[p]+'88',background:PC[p]+'18'}:{}}>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide" style={{color:PC[p]}}>
                  {pname(p)}
                  {(cf[p]||0)>0&&<span className="text-red-400 ml-1">{'⚠'.repeat(cf[p])}</span>}
                </div>
                <div className="text-[9px] text-gray-500">{p==='p1'?`⚪ ${wLeft} left`:`⚫ ${bLeft} left`}</div>
              </div>
              <div className="text-2xl font-black">{scores[p]}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 w-full max-w-[440px] px-3 pb-2">
          {(['p1','p2','p3','p4'] as Player[]).map(p=>{
            const cc=coinColor(p,4);
            return (
              <div key={p} className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl border transition-all ${
                turn===p?'border-opacity-70':'border-gray-700/40 bg-gray-800/30'
              }`} style={turn===p?{borderColor:PC[p]+'88',background:PC[p]+'18'}:{}}>
                <div>
                  <div className="text-[9px] font-bold uppercase" style={{color:PC[p]}}>
                    {pname(p)} <span className="opacity-50">{(p==='p1'||p==='p3')?'[A]':'[B]'}</span>
                    {(cf[p]||0)>0&&<span className="text-red-400 ml-0.5">{'⚠'.repeat(cf[p])}</span>}
                  </div>
                  <div className="text-[8px] text-gray-500">{cc==='white'?`⚪${wLeft}`:`⚫${bLeft}`} left</div>
                </div>
                <div className="text-lg font-black">{scores[p]}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Queen banner */}
      {queenBanner && (
        <div className="w-full max-w-[440px] px-3 mb-1">
          <div className={`text-xs font-bold text-center py-1.5 rounded-xl border animate-pulse ${
            qCovered.current
              ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300'
              : 'bg-orange-500/20 border-orange-500/40 text-orange-300'
          }`}>{queenBanner}</div>
        </div>
      )}

      {/* Board */}
      <div ref={wrapDiv} className="relative flex-1 flex items-center justify-center w-full max-w-[440px] px-2" style={{minHeight:0}}>
        <div className="relative p-2.5 rounded-[2rem] bg-[#3d1a00] shadow-[0_20px_60px_rgba(0,0,0,0.85),inset_0_0_30px_rgba(0,0,0,0.5)]">
          <canvas ref={boardCv} className="block rounded-[1.2rem] touch-none"
            onPointerDown={onDown} onPointerMove={onMove}
            onPointerUp={onUp}   onPointerLeave={onUp}
            style={{cursor:canI?'crosshair':'default'}}/>
          <canvas ref={aimCv} className="absolute top-[10px] left-[10px] rounded-[1.2rem] pointer-events-none" style={{zIndex:10}}/>
        </div>
        {foulBanner && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-gray-900/96 border border-red-500/60 text-red-400 font-bold text-sm px-5 py-2.5 rounded-2xl shadow-xl pointer-events-none animate-bounce whitespace-nowrap">
            {foulBanner}
          </div>
        )}
      </div>

      {/* Power bar */}
      <div className="flex items-center gap-2 w-full max-w-[440px] px-4 pt-2">
        <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest w-10 text-right">PWR</span>
        <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-50" style={{
            width:`${Math.round(power*100)}%`,
            background:power>.75?'linear-gradient(90deg,#f59e0b,#ef4444)':power>.42?'linear-gradient(90deg,#10b981,#f59e0b)':'#10b981',
          }}/>
        </div>
        <span className="text-[9px] font-bold w-8" style={{color:pwrCol}}>{Math.round(power*100)}%</span>
      </div>

      {/* Status */}
      <div className="w-full max-w-[440px] px-4 pb-3 pt-1 flex items-center justify-between">
        <p className={`text-xs ${canI?'text-amber-400 font-semibold':'text-gray-600'}`}>{statusMsg}</p>
        {(cf[turn]||0)>0&&<span className="text-[10px] text-red-400 font-bold">Fouls:{cf[turn]}/{MAX_CF}</span>}
      </div>

      {/* Queen covered indicator (always visible when covered) */}
      {qCovered.current && !winner && (
        <div className="w-full max-w-[440px] px-4 pb-1">
          <div className="text-[10px] text-center text-yellow-400/70 font-semibold">👑 Queen covered ✓</div>
        </div>
      )}

      {/* Winner overlay */}
      {winner && (
        <div className="absolute inset-0 bg-black/88 flex flex-col items-center justify-center z-50 backdrop-blur-sm px-6">
          <Crown className="w-20 h-20 text-yellow-400 mb-3 drop-shadow-[0_0_20px_rgba(250,204,21,0.8)] animate-bounce"/>
          <Trophy className="w-8 h-8 text-amber-500 mb-2"/>
          <h2 className="text-4xl font-black bg-gradient-to-r from-amber-400 to-red-500 bg-clip-text text-transparent mb-1">
            {pname(winner)} Jeeta!
          </h2>
          <p className="text-gray-400 text-sm mb-3">
            Score: <span className="text-white font-black">{scores[winner]}</span>
          </p>
          <div className="flex gap-4 mb-6">
            {(n===2?['p1','p2']:['p1','p2','p3','p4'] as Player[]).map(p=>(
              <div key={p} className="text-center">
                <div className="text-[10px] font-bold" style={{color:PC[p]}}>{pname(p)}</div>
                <div className="text-xl font-black">{scores[p]}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={()=>{stopLoop();clearTmr();startGame(mode,n);}}
              className="py-3 px-7 bg-gradient-to-r from-amber-500 to-orange-500 font-bold rounded-2xl active:scale-95 transition">
              Dobara
            </button>
            <button onClick={()=>{stopLoop();clearTmr();onGameOver(scores[winner],'Win');}}
              className="py-3 px-7 bg-gray-800 border border-gray-700 font-bold rounded-2xl active:scale-95 transition">
              Exit
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pfx {
          0%   { transform:translate(0,0) scale(1); opacity:1; }
          100% { transform:translate(var(--dx),var(--dy)) scale(0); opacity:0; }
        }
      `}</style>
    </div>
  );
}
