import React, { useEffect, useRef, useState, useCallback } from 'react';
import Matter from 'matter-js';
import { ArrowLeft, Bot, Users, Globe, Crown, RotateCcw } from 'lucide-react';
import { mockBackend } from '../lib/mockBackend';
import { mpSession } from '../lib/mpSession';
import { rooms as firebaseRooms, type RoomPlayer as FbRoomPlayer } from '../lib/rooms';
import { db as gameDb } from '../lib/db';

// ════════════════════════════════════════════════════════
//  TYPES
// ════════════════════════════════════════════════════════
interface CarromProps {
  onGameOver: (score: number, result?: 'Win' | 'Loss' | 'Draw' | 'Completed') => void;
  onBack: () => void;
}
type GameMode = 'menu' | 'local' | 'bot' | 'online_lobby' | 'online_playing';
type Player   = 'p1' | 'p2';
type CoinColor = 'white' | 'black' | 'queen' | 'striker';

// ════════════════════════════════════════════════════════
//  CONSTANTS
// ════════════════════════════════════════════════════════
// Physics world is 600×600 units
const W = 600, H = 600;
const BORDER  = 52;       // playable area starts here
const INNER   = BORDER + 6;
const POCKET_R = 26;      // pocket hole radius (physics sensor)
const COIN_R   = 13;      // coin radius
const QUEEN_R  = 13;      // queen radius
const STRIKER_R= 17;      // striker radius
const MAX_PULL = 150;     // max drag pixels (in physics units)
const FORCE_K  = 0.085;   // force multiplier
const TIMER_SEC= 30;

// Pocket centres
const POCKETS = [
  { x: BORDER, y: BORDER },
  { x: W - BORDER, y: BORDER },
  { x: BORDER, y: H - BORDER },
  { x: W - BORDER, y: H - BORDER },
];

// Striker lane Y for each player
const LANE_Y: Record<Player, number> = {
  p1: H - BORDER - 35,   // bottom
  p2: BORDER + 35,       // top
};

const P_COLORS: Record<Player, string> = { p1: '#f59e0b', p2: '#6366f1' };
const P_LABELS: Record<Player, string> = { p1: 'Player 1', p2: 'Player 2' };

// ════════════════════════════════════════════════════════
//  ONLINE LOBBY
// ════════════════════════════════════════════════════════
interface LobbyProps {
  onStart: (role: Player, roomId: string) => void;
  onBack: () => void;
}
function OnlineLobby({ onStart, onBack }: LobbyProps) {
  const [view, setView]     = useState<'main'|'join'|'wait'>('main');
  const [code, setCode]     = useState('');
  const [inp, setInp]       = useState('');
  const [err, setErr]       = useState('');
  const [busy, setBusy]     = useState(false);
  const [rows, setRows]     = useState<FbRoomPlayer[]>([]);
  const [myRole, setMyRole] = useState<Player>('p1');
  const [rowId, setRowId]   = useState('');
  const [copied, setCopied] = useState(false);
  const unsubRef = useRef<(()=>void)|null>(null);
  const gone     = useRef(false);
  const user     = gameDb.getUser();
  const me: FbRoomPlayer = { id: user.id, name: user.name, avatar: user.avatar };

  useEffect(() => () => { gone.current = true; unsubRef.current?.(); }, []);

  const watch = (rid: string, c: string, r: Player) => {
    unsubRef.current?.();
    unsubRef.current = firebaseRooms.watch(rid, row => {
      if (gone.current) return;
      setRows(row.players || []);
      if (row.status === 'playing') {
        mockBackend.joinRoom(c);
        onStart(r, c);
      }
    });
  };

  const doCreate = async () => {
    setBusy(true); setErr('');
    try {
      const row = await firebaseRooms.create({ gameId:'carrom', maxPlayers:2, host:me });
      mockBackend.joinRoom(row.code);
      setCode(row.code); setRowId(row.id); setMyRole('p1'); setRows(row.players);
      watch(row.id, row.code, 'p1');
      setView('wait');
    } catch(e:any){ setErr(e?.message||'Error'); }
    finally { setBusy(false); }
  };

  const doJoin = async () => {
    const c = inp.trim().toUpperCase();
    if (!c) return;
    setBusy(true); setErr('');
    try {
      const row = await firebaseRooms.join(c, me);
      const idx = (row.players||[]).findIndex((p:FbRoomPlayer)=>p.id===me.id);
      const r: Player = idx <= 0 ? 'p1' : 'p2';
      mockBackend.joinRoom(c);
      setCode(c); setRowId(row.id); setMyRole(r); setRows(row.players);
      watch(row.id, c, r);
      setView('wait');
    } catch(e:any){ setErr(e?.message||'Invalid code'); }
    finally { setBusy(false); }
  };

  const doStart = async () => {
    setBusy(true);
    try { await firebaseRooms.start(rowId, rows[0]?.id); }
    catch(e:any){ setErr(e?.message||''); setBusy(false); }
  };

  if (view==='main') return (
    <div className="flex flex-col items-center justify-center h-full gap-5 p-8 bg-[#0c1118] text-white">
      <button onClick={onBack} className="absolute top-5 left-5 text-gray-500 hover:text-white text-sm">← Back</button>
      <Globe className="w-14 h-14 text-green-400" />
      <h2 className="text-3xl font-black">Online Carrom</h2>
      <button onClick={doCreate} disabled={busy}
        className="w-full max-w-xs py-4 rounded-2xl bg-green-600 font-bold disabled:opacity-50 active:scale-95 transition">
        {busy?'Creating…':'Create Room'}
      </button>
      <button onClick={()=>setView('join')}
        className="w-full max-w-xs py-4 rounded-2xl bg-gray-800 border border-gray-700 font-bold active:scale-95 transition">
        Join Room
      </button>
      {err && <p className="text-red-400 text-sm">{err}</p>}
    </div>
  );

  if (view==='join') return (
    <div className="flex flex-col items-center justify-center h-full gap-5 p-8 bg-[#0c1118] text-white">
      <button onClick={()=>setView('main')} className="absolute top-5 left-5 text-gray-500 hover:text-white text-sm">← Back</button>
      <h2 className="text-2xl font-black">Room Code</h2>
      <input value={inp} onChange={e=>setInp(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6))}
        placeholder="ABC123" autoFocus
        className="w-full max-w-xs bg-gray-900 border border-gray-700 rounded-2xl px-4 py-5 text-center text-4xl font-black tracking-widest" />
      {err && <p className="text-red-400 text-sm">{err}</p>}
      <button onClick={doJoin} disabled={busy||inp.length<4}
        className="w-full max-w-xs bg-indigo-600 font-bold py-4 rounded-xl disabled:opacity-50 active:scale-95 transition">
        {busy?'Joining…':'Join'}
      </button>
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8 bg-[#0c1118] text-white">
      <button onClick={()=>{unsubRef.current?.();setView('main');}} className="absolute top-5 left-5 text-gray-500 hover:text-white text-sm">Cancel</button>
      <div className="bg-gray-900 border border-green-500/30 rounded-3xl p-6 w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Room Code</div>
          <div className="text-5xl font-black tracking-widest bg-gray-800 py-3 rounded-2xl border border-gray-700">{code}</div>
          <button onClick={()=>{navigator.clipboard?.writeText(code).catch(()=>{});setCopied(true);setTimeout(()=>setCopied(false),1500);}}
            className="mt-2 w-full bg-gray-800 border border-gray-700 rounded-xl py-2 text-sm text-indigo-300 font-bold">
            {copied?'✓ Copied!':'📋 Copy Code'}
          </button>
        </div>
        <div className="text-xs text-gray-500 text-center">{rows.length}/2 players</div>
        {[0,1].map(i=>{
          const p = rows[i]; const pk = i===0?'p1':'p2';
          return <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${p?'border-green-500/30 bg-green-500/10':'border-gray-700/50 bg-gray-800/20'}`}>
            <div className="w-3 h-3 rounded-full" style={{background: p?P_COLORS[pk as Player]:'#374151'}}/>
            <span className="text-sm font-semibold" style={{color: p?P_COLORS[pk as Player]:'#6b7280'}}>{p?p.name:`Waiting for P${i+1}…`}</span>
            {p&&<span className="ml-auto text-green-400 text-xs">✓</span>}
          </div>;
        })}
        {err&&<p className="text-red-400 text-xs text-center">{err}</p>}
        {myRole==='p1'
          ? <button onClick={doStart} disabled={rows.length<2||busy}
              className="w-full bg-green-600 font-black py-4 rounded-2xl disabled:opacity-40 active:scale-95 transition">
              {rows.length<2?'Waiting for P2…':busy?'…':'Start Game!'}
            </button>
          : <div className="text-indigo-400 text-sm text-center flex items-center justify-center gap-2">
              <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"/>
              Waiting for host to start…
            </div>
        }
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  COIN SETUP — Real carrom arrangement
//  19 coins: 9 white + 9 black + 1 queen
//  Inner ring (6): W B W B W B  at radius COIN_R*2.5
//  Outer ring (12): B W B W…   at radius COIN_R*4.9
// ════════════════════════════════════════════════════════
function buildCoins(engine: Matter.Engine) {
  const cx = W/2, cy = H/2;
  const coinOpts = (label: CoinColor) => ({
    restitution: 0.78, friction: 0.03, frictionAir: 0.016,
    density: 0.0022, label, isStatic: false,
    collisionFilter: { category: 0x0002, mask: 0x0007 },
  });

  const bodies: Matter.Body[] = [];

  // Queen — dead center
  bodies.push(Matter.Bodies.circle(cx, cy, QUEEN_R, { ...coinOpts('queen') }));

  // Inner ring
  const IR = COIN_R * 2.52;
  const innerSeq = ['white','black','white','black','white','black'] as CoinColor[];
  innerSeq.forEach((lbl, i) => {
    const a = (i/6)*Math.PI*2 - Math.PI/2;
    bodies.push(Matter.Bodies.circle(cx+Math.cos(a)*IR, cy+Math.sin(a)*IR, COIN_R, coinOpts(lbl)));
  });

  // Outer ring
  const OR = COIN_R * 4.85;
  const outerSeq = ['black','white','black','white','black','white','black','white','black','white','black','white'] as CoinColor[];
  outerSeq.forEach((lbl, i) => {
    const a = (i/12)*Math.PI*2 - Math.PI/2 + Math.PI/12;
    bodies.push(Matter.Bodies.circle(cx+Math.cos(a)*OR, cy+Math.sin(a)*OR, COIN_R, coinOpts(lbl)));
  });

  Matter.Composite.add(engine.world, bodies);
  return bodies; // [queen, 6 inner, 12 outer] = 19
}

// ════════════════════════════════════════════════════════
//  DRAW HELPERS
// ════════════════════════════════════════════════════════
function drawBoard(ctx: CanvasRenderingContext2D, scale: number,
  turn: Player, queenPending: boolean, queenCoveredBy: Player|null) {
  const sw = ctx.canvas.width, sh = ctx.canvas.height;
  const s = scale;
  const bp = BORDER*s;

  ctx.clearRect(0,0,sw,sh);

  // ── Wood surface ──
  const bg = ctx.createRadialGradient(sw/2,sh/2,0,sw/2,sh/2,sw*0.72);
  bg.addColorStop(0,'#d4a520'); bg.addColorStop(0.55,'#b8820a'); bg.addColorStop(1,'#7a5606');
  ctx.fillStyle = bg; ctx.fillRect(0,0,sw,sh);

  // Grain
  ctx.save(); ctx.globalAlpha=0.055; ctx.strokeStyle='#000'; ctx.lineWidth=1;
  for(let i=0;i<sw;i+=11){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i+5,sh);ctx.stroke();}
  ctx.restore();

  // ── Frame border ──
  ctx.fillStyle='#5a2806';
  ctx.fillRect(0,0,sw,bp-5); ctx.fillRect(0,sh-bp+5,sw,bp-5);
  ctx.fillRect(0,0,bp-5,sh); ctx.fillRect(sw-bp+5,0,bp-5,sh);

  // Inner border lines
  ctx.strokeStyle='#7c3c0c'; ctx.lineWidth=2.5; ctx.strokeRect(bp,bp,sw-bp*2,sh-bp*2);
  ctx.strokeStyle='#5a2806'; ctx.lineWidth=1.2; ctx.strokeRect(bp+4*s,bp+4*s,sw-bp*2-8*s,sh-bp*2-8*s);

  // ── Pockets ──
  POCKETS.forEach(({x,y}) => {
    const px=x*s, py=y*s;
    const pg = ctx.createRadialGradient(px,py,1,px,py,POCKET_R*s);
    pg.addColorStop(0,'#080808'); pg.addColorStop(1,'#150800');
    ctx.fillStyle=pg; ctx.beginPath(); ctx.arc(px,py,POCKET_R*s,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#3a1600'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(px,py,POCKET_R*s+3,0,Math.PI*2); ctx.stroke();
  });

  // ── Centre markings ──
  const cx=sw/2, cy=sh/2;
  ctx.strokeStyle='rgba(80,38,4,0.45)';
  [5,11,20,36].forEach(r => {
    ctx.lineWidth = r>25?1.8:1; ctx.beginPath(); ctx.arc(cx,cy,r*s,0,Math.PI*2); ctx.stroke();
  });
  ctx.fillStyle='rgba(80,38,4,0.55)'; ctx.beginPath(); ctx.arc(cx,cy,4*s,0,Math.PI*2); ctx.fill();

  // Diagonal lines
  ctx.strokeStyle='rgba(80,38,4,0.22)'; ctx.lineWidth=1;
  const off=bp+26*s;
  [[cx,cy,off,off],[cx,cy,sw-off,off],[cx,cy,off,sh-off],[cx,cy,sw-off,sh-off]].forEach(
    ([x1,y1,x2,y2]) => { ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); }
  );

  // ── Striker lanes ──
  ctx.setLineDash([5,8]);
  (['p1','p2'] as Player[]).forEach(p => {
    const active = turn===p;
    const ly = LANE_Y[p]*s;
    ctx.strokeStyle = active ? P_COLORS[p]+'cc' : 'rgba(255,255,255,0.10)';
    ctx.lineWidth   = active ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(bp+12*s,ly); ctx.lineTo(sw-bp-12*s,ly); ctx.stroke();
  });
  ctx.setLineDash([]);

  // Queen cover hint
  if(queenPending && !queenCoveredBy) {
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.6)';
    ctx.fillRect(bp+8*s, bp+8*s, sw-bp*2-16*s, 22*s);
    ctx.font=`bold ${10*s}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='#fbbf24'; ctx.shadowColor='#000'; ctx.shadowBlur=4;
    ctx.fillText('👑 Queen pocket hua — apna coin pocket karo!', sw/2, bp+19*s);
    ctx.restore();
  }
}

function drawCoins(ctx: CanvasRenderingContext2D, scale: number,
  bodies: Matter.Body[], pocketedSet: Set<number>,
  canShoot: boolean, isMoving: boolean, turn: Player) {
  const s = scale;

  for(const body of bodies) {
    if(pocketedSet.has(body.id)) continue;
    if(body.position.x < 0 || body.position.y < 0) continue;
    const bx=body.position.x*s, by=body.position.y*s;
    const label = body.label as CoinColor;

    ctx.save();

    if(label==='striker') {
      const active = canShoot && !isMoving;
      const pColor = P_COLORS[turn];
      if(active){ ctx.shadowColor=pColor; ctx.shadowBlur=16; }
      const sg = ctx.createRadialGradient(bx-3*s,by-3*s,1,bx,by,STRIKER_R*s);
      sg.addColorStop(0,'#dde'); sg.addColorStop(0.55,'#9090bb'); sg.addColorStop(1,'#404068');
      ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(bx,by,STRIKER_R*s,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
      ctx.strokeStyle=active?pColor:'#55558a'; ctx.lineWidth=active?2.8:1.2;
      ctx.beginPath(); ctx.arc(bx,by,STRIKER_R*s,0,Math.PI*2); ctx.stroke();
      ctx.strokeStyle='rgba(160,160,220,0.5)'; ctx.lineWidth=0.8;
      ctx.beginPath(); ctx.arc(bx,by,STRIKER_R*s*0.54,0,Math.PI*2); ctx.stroke();
      if(active){
        ctx.globalAlpha=0.18; ctx.fillStyle=pColor;
        ctx.beginPath(); ctx.arc(bx,by,(STRIKER_R+9)*s,0,Math.PI*2); ctx.fill();
      }
      ctx.restore(); continue;
    }

    ctx.shadowColor='rgba(0,0,0,0.5)'; ctx.shadowBlur=5; ctx.shadowOffsetY=2*s;

    let fg: CanvasGradient, outline: string, inner: string;
    if(label==='queen'){
      fg=ctx.createRadialGradient(bx-2*s,by-2*s,1,bx,by,QUEEN_R*s);
      fg.addColorStop(0,'#ff8888'); fg.addColorStop(1,'#cc1111');
      outline='#880000'; inner='rgba(255,160,160,0.55)';
    } else if(label==='white'){
      fg=ctx.createRadialGradient(bx-2*s,by-2*s,1,bx,by,COIN_R*s);
      fg.addColorStop(0,'#ffffff'); fg.addColorStop(1,'#c8c8c8');
      outline='#999'; inner='rgba(80,80,80,0.28)';
    } else {
      fg=ctx.createRadialGradient(bx-2*s,by-2*s,1,bx,by,COIN_R*s);
      fg.addColorStop(0,'#3a3a60'); fg.addColorStop(1,'#0c0c1e');
      outline='#111'; inner='rgba(100,100,190,0.4)';
    }
    const r = (label==='queen'?QUEEN_R:COIN_R)*s;
    ctx.fillStyle=fg; ctx.beginPath(); ctx.arc(bx,by,r,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0; ctx.shadowOffsetY=0;
    ctx.strokeStyle=outline; ctx.lineWidth=1.2; ctx.beginPath(); ctx.arc(bx,by,r,0,Math.PI*2); ctx.stroke();
    ctx.strokeStyle=inner; ctx.lineWidth=0.8; ctx.beginPath(); ctx.arc(bx,by,r*0.52,0,Math.PI*2); ctx.stroke();
    if(label==='queen'){
      ctx.fillStyle='#ffcc00'; ctx.shadowColor='#ffcc00'; ctx.shadowBlur=6;
      ctx.beginPath(); ctx.arc(bx,by,3.2*s,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }
}

function drawAim(ctx: CanvasRenderingContext2D, scale: number,
  sx: number, sy: number, tx: number, ty: number,
  bodies: Matter.Body[], pocketedSet: Set<number>) {
  const s=scale;
  ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
  const dx=sx-tx, dy=sy-ty, dist=Math.hypot(dx,dy);
  if(dist<5) return;
  const nx=dx/dist, ny=dy/dist;
  const pwr=Math.min(dist/(MAX_PULL),1);

  // Drag ghost
  ctx.save();
  ctx.globalAlpha=0.15; ctx.strokeStyle='#fff'; ctx.lineWidth=10; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(sx*s,sy*s); ctx.lineTo(tx*s,ty*s); ctx.stroke();

  // Shot line
  const lineLen=(60+pwr*250)*s;
  const ex=sx+nx*(lineLen/s)*s, ey=sy+ny*(lineLen/s)*s;
  // convert to canvas pixels
  const ecx=(sx+nx*(60/s+pwr*250/s))*s, ecy=(sy+ny*(60/s+pwr*250/s))*s;
  const bpx=BORDER*s;
  const cw=ctx.canvas.width, ch=ctx.canvas.height;

  ctx.globalAlpha=0.88; ctx.strokeStyle='#fff'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(sx*s,sy*s); ctx.lineTo(sx*s+nx*(60+pwr*250),sy*s+ny*(60+pwr*250)); ctx.stroke();

  // Trajectory dots
  let px2=sx*s+nx*(60+pwr*250), py2=sy*s+ny*(60+pwr*250);
  let vx2=nx, vy2=ny;
  const steps=Math.floor(pwr*28)+10;
  ctx.globalAlpha=0.42; ctx.setLineDash([5,10]);
  ctx.strokeStyle='rgba(255,215,70,0.75)'; ctx.lineWidth=1.8;
  ctx.beginPath(); ctx.moveTo(px2,py2);
  for(let i=0;i<steps;i++){
    px2+=vx2*10; py2+=vy2*10;
    if(px2<=bpx+3||px2>=cw-bpx-3) vx2=-vx2;
    if(py2<=bpx+3||py2>=ch-bpx-3) vy2=-vy2;
    px2=Math.max(bpx+3,Math.min(cw-bpx-3,px2));
    py2=Math.max(bpx+3,Math.min(ch-bpx-3,py2));
    ctx.lineTo(px2,py2);
  }
  ctx.stroke(); ctx.setLineDash([]);

  // Coin highlight (first coin in path)
  const SR=STRIKER_R, CR=COIN_R;
  let cpx=sx*s+nx*(60+pwr*250), cpy=sy*s+ny*(60+pwr*250);
  let hit=false;
  outer: for(let i=0;i<200;i++){
    cpx+=nx*5; cpy+=ny*5;
    for(const b of bodies){
      if(pocketedSet.has(b.id)||!['white','black','queen'].includes(b.label)) continue;
      if(b.position.x<0||b.position.y<0) continue;
      if(Math.hypot(cpx-b.position.x*s, cpy-b.position.y*s)<(SR+CR)*s){
        ctx.globalAlpha=0.6; ctx.strokeStyle='#f59e0b';
        ctx.lineWidth=2.5; ctx.shadowColor='#f59e0b'; ctx.shadowBlur=10;
        ctx.beginPath(); ctx.arc(b.position.x*s,b.position.y*s,(CR+5)*s,0,Math.PI*2); ctx.stroke();
        hit=true; break outer;
      }
    }
  }

  // Power dot
  const pColor=pwr>0.75?'#ef4444':pwr>0.42?'#f59e0b':'#10b981';
  const dotx=sx*s+nx*(60+pwr*250), doty=sy*s+ny*(60+pwr*250);
  ctx.globalAlpha=1; ctx.fillStyle=pColor; ctx.shadowColor=pColor; ctx.shadowBlur=12;
  ctx.beginPath(); ctx.arc(dotx,doty,6,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

// ════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ════════════════════════════════════════════════════════
export default function Carrom({ onGameOver, onBack }: CarromProps) {

  // ── UI state ──
  const [mode, setMode]     = useState<GameMode>('menu');
  const [role, setRole]     = useState<Player>('p1');
  const [roomId, setRoomId] = useState('');
  const [turn, setTurn]     = useState<Player>('p1');
  const [scores, setScores] = useState({ p1:0, p2:0 });
  const [wLeft, setWLeft]   = useState(9); // white coins on board
  const [bLeft, setBLeft]   = useState(9); // black coins on board
  const [winner, setWinner] = useState<Player|null>(null);
  const [timerVal, setTimerVal] = useState(TIMER_SEC);
  const [power, setPower]   = useState(0);
  const [foulMsg, setFoulMsg] = useState('');
  const [extraAnim, setExtraAnim] = useState(false);
  const [queenMsg, setQueenMsg] = useState('');

  // ── Canvas ──
  const boardRef = useRef<HTMLCanvasElement>(null);
  const aimRef   = useRef<HTMLCanvasElement>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);

  // ── Physics ──
  const engineRef   = useRef<Matter.Engine|null>(null);
  const runnerRef   = useRef<Matter.Runner|null>(null);
  const strikerRef  = useRef<Matter.Body|null>(null);
  const allBodies   = useRef<Matter.Body[]>([]);   // all coins + queen
  const pocketedSet = useRef<Set<number>>(new Set());

  // ── Refs (avoid stale closures) ──
  const turnRef    = useRef<Player>('p1');
  const modeRef    = useRef<GameMode>('menu');
  const roleRef    = useRef<Player>('p1');
  const roomIdRef  = useRef('');
  const scoresRef  = useRef({p1:0,p2:0});
  const winnerRef  = useRef<Player|null>(null);

  // Per-shot state (refs, not state — no re-render needed mid-shot)
  const canShootRef = useRef(true);
  const isMoving    = useRef(false);
  const isRxStrike  = useRef(false); // received opponent shot (online)

  // Shot result flags (set in handlePocket, read in afterShot)
  const shotFlags = useRef({
    strikerPocketed: false,
    ownCoin: false,       // own colour pocketed
    oppCoin: false,       // opponent colour pocketed
    queenPocketed: false, // queen pocketed this shot
  });

  // Cross-shot queen state
  const queenState = useRef<{
    pocketed: boolean;     // queen currently pocketed (waiting cover)
    coveredBy: Player|null;// once covered, set permanently
    graceUsed: boolean;    // extra grace shot given
  }>({ pocketed:false, coveredBy:null, graceUsed:false });

  const consecFouls = useRef({p1:0, p2:0});
  const extraTurn   = useRef(false);

  // Input
  const isDragging  = useRef(false);
  const dragPt      = useRef<{x:number;y:number}|null>(null);
  const strikerSlide= useRef(0.5); // 0–1 along lane

  // Timing / render
  const scaleRef    = useRef(1);
  const timerRef2   = useRef<ReturnType<typeof setInterval>|null>(null);
  const timerValRef = useRef(TIMER_SEC);
  const rafRef      = useRef(0);
  const audioRef    = useRef<AudioContext|null>(null);

  // sync state → refs
  useEffect(()=>{ turnRef.current=turn; },[turn]);
  useEffect(()=>{ modeRef.current=mode; },[mode]);
  useEffect(()=>{ roleRef.current=role; },[role]);
  useEffect(()=>{ roomIdRef.current=roomId; },[roomId]);
  useEffect(()=>{ scoresRef.current=scores; },[scores]);

  // ── Audio ──
  function beep(freq:number,dur:number,type:OscillatorType='sine',vol=0.18){
    try{
      if(!audioRef.current) audioRef.current=new (window.AudioContext||(window as any).webkitAudioContext)();
      const ac=audioRef.current, o=ac.createOscillator(), g=ac.createGain();
      o.type=type; o.frequency.setValueAtTime(freq,ac.currentTime);
      g.gain.setValueAtTime(vol,ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+dur);
      o.connect(g); g.connect(ac.destination); o.start(ac.currentTime); o.stop(ac.currentTime+dur);
    }catch{}
  }
  const playShoot=(pwr:number)=>{ beep(180+pwr*240,0.18,'sawtooth',0.26*pwr); };
  const playPocket=()=>{ beep(880,0.08,'sine',0.2); setTimeout(()=>beep(440,0.15,'sine',0.15),80); };
  const playFoul=()=>{ beep(140,0.32,'sawtooth',0.22); };
  const playWin=()=>{ [440,550,660,880].forEach((f,i)=>setTimeout(()=>beep(f,0.18,'sine',0.22),i*100)); };
  const playBounce=()=>{ beep(200,0.08,'square',0.07); };
  const playTick=()=>{ beep(900,0.05,'square',0.05); };

  // ── Helpers ──
  const myColor  =(p:Player)=> p==='p1'?'white':'black';
  const oppColor =(p:Player)=> p==='p1'?'black':'white';
  const opponent =(p:Player):Player=> p==='p1'?'p2':'p1';
  const pName    =(p:Player)=>{
    if(modeRef.current==='bot'&&p==='p2') return 'AI Bot';
    if(modeRef.current==='online_playing') return p===roleRef.current?'You':'Opponent';
    return P_LABELS[p];
  };

  function strikerPosFor(p: Player, slide=strikerSlide.current){
    const minX=BORDER+STRIKER_R+10, maxX=W-BORDER-STRIKER_R-10;
    return { x: minX+(maxX-minX)*slide, y: LANE_Y[p] };
  }

  function coinsLeft(color:string){
    return allBodies.current.filter(b=>b.label===color&&!pocketedSet.current.has(b.id)&&b.position.x>0).length;
  }

  function pocketBody(b:Matter.Body){
    pocketedSet.current.add(b.id);
    Matter.Body.setPosition(b,{x:-600,y:-600});
    Matter.Body.setVelocity(b,{x:0,y:0});
    Matter.Body.setAngularVelocity(b,0);
  }

  function returnCoin(color:string){
    const b=allBodies.current.find(x=>x.label===color&&pocketedSet.current.has(x.id));
    if(!b) return;
    pocketedSet.current.delete(b.id);
    const j=(Math.random()-0.5)*COIN_R*3;
    Matter.Body.setPosition(b,{x:W/2+j,y:H/2+j});
    Matter.Body.setVelocity(b,{x:0,y:0});
  }

  function returnQueen(){
    const q=allBodies.current.find(x=>x.label==='queen');
    if(!q) return;
    pocketedSet.current.delete(q.id);
    Matter.Body.setPosition(q,{x:W/2,y:H/2});
    Matter.Body.setVelocity(q,{x:0,y:0});
    queenState.current.pocketed=false;
  }

  function showFoul(msg:string){
    setFoulMsg(msg); playFoul();
    setTimeout(()=>setFoulMsg(''),2800);
  }

  function flashExtra(){
    setExtraAnim(true); setTimeout(()=>setExtraAnim(false),1200);
  }

  // ── handlePocket — called when a body enters a pocket sensor ──
  // Rules:
  //   Striker → FOUL: turn passes, penalty (own coin returns from pocket OR coin of own colour returns)
  //   Queen  → grace: player must pocket own coin in SAME shot or NEXT shot
  //              • same shot: covered, +3 bonus
  //              • next shot: covered if own coin pocketed, else queen returns
  //   Own coin → extra turn, +1 point (UNLESS foul already set)
  //   Opp coin → FOUL: opp coin returns, turn passes
  //   Pocketing opponent's last coin when none of own are on board → FOUL (you cannot win for opponent)
  function handlePocket(body: Matter.Body){
    if(pocketedSet.current.has(body.id)) return;
    const label = body.label as CoinColor;
    const cur   = turnRef.current;
    pocketBody(body);
    playPocket();

    if(label==='striker'){
      shotFlags.current.strikerPocketed=true;
      return; // rest handled in afterShot
    }

    if(label==='queen'){
      shotFlags.current.queenPocketed=true;
      queenState.current.pocketed=true;
      setQueenMsg('👑 Queen! Apna coin pocket karo is ya agla shot mein');
      return;
    }

    if(label===myColor(cur)){
      shotFlags.current.ownCoin=true;
      // if queen pending cover → this coin covers it
      if(queenState.current.pocketed&&!queenState.current.coveredBy){
        queenState.current.coveredBy=cur;
        queenState.current.pocketed=false;
        setQueenMsg('👑 Queen Covered! +3 bonus');
        setTimeout(()=>setQueenMsg(''),2500);
        setScores(prev=>{ const n={...prev,[cur]:prev[cur]+3}; scoresRef.current=n; return n; });
      }
      setScores(prev=>{ const n={...prev,[cur]:prev[cur]+1}; scoresRef.current=n; return n; });
      return;
    }

    // opponent colour
    if(label===oppColor(cur)){
      shotFlags.current.oppCoin=true;
      returnCoin(oppColor(cur));
      return;
    }
  }

  // ── afterShot — called ~280ms after all bodies stop ──
  function afterShot(){
    if(winnerRef.current) return;
    const cur = turnRef.current;
    const sf  = shotFlags.current;
    let foul  = false;

    // 1. Striker pocketed → foul
    if(sf.strikerPocketed){
      foul=true;
      // Penalty: if own coin in pocket, return one; else nothing extra
      returnCoin(myColor(cur));
      showFoul('⚠️ FOUL — Striker pocket! Turn jaata hai');
      // Reset striker back on board
      pocketedSet.current.delete(strikerRef.current!.id);
    }

    // 2. Opponent coin pocketed → foul
    if(sf.oppCoin && !foul){
      foul=true;
      showFoul('⚠️ FOUL — Opponent ka coin! Turn jaata hai');
    }

    // 3. Queen grace handling
    if(sf.queenPocketed){
      if(!sf.ownCoin && !foul){
        // same shot no own coin: give grace extra shot
        queenState.current.graceUsed=false;
        extraTurn.current=true;
        setQueenMsg('👑 Agli shot mein apna coin pocket karo!');
        setTimeout(()=>setQueenMsg(''),3500);
      } else if(sf.ownCoin && !foul){
        // covered same shot — already handled in handlePocket
        // nothing extra needed here
      } else {
        // foul + queen pocketed → queen returns
        returnQueen();
        setQueenMsg('');
      }
    }

    // 4. If queen was pending (from previous grace) and still not covered
    if(!sf.queenPocketed && queenState.current.pocketed && !queenState.current.coveredBy){
      if(!queenState.current.graceUsed){
        // This is the grace shot
        queenState.current.graceUsed=true;
        if(sf.ownCoin && !foul){
          // own coin pocketed in grace shot → covered
          queenState.current.coveredBy=cur;
          queenState.current.pocketed=false;
          setQueenMsg('👑 Queen Covered! +3 bonus');
          setTimeout(()=>setQueenMsg(''),2500);
          setScores(prev=>{ const n={...prev,[cur]:prev[cur]+3}; scoresRef.current=n; return n; });
        } else {
          // grace shot wasted → queen returns
          returnQueen();
          showFoul('👑 Queen cover nahi hua — wapas centre!');
          setQueenMsg('');
        }
      }
    }

    // 5. Own coin pocketed without foul → extra turn
    if(sf.ownCoin && !foul && !extraTurn.current){
      extraTurn.current=true;
    }

    // 6. Foul → reset extra turn, consecutive foul count
    if(foul){
      extraTurn.current=false;
      consecFouls.current[cur]++;
      if(consecFouls.current[cur]>=3){
        setScores(prev=>{ const n={...prev,[cur]:Math.max(0,prev[cur]-5)}; scoresRef.current=n; return n; });
        showFoul(`🚫 3 fouls! ${pName(cur)}: -5 points`);
        consecFouls.current[cur]=0;
      }
    } else {
      consecFouls.current[cur]=0;
    }

    // Reset per-shot flags
    shotFlags.current={strikerPocketed:false,ownCoin:false,oppCoin:false,queenPocketed:false};

    // Update counts
    setWLeft(coinsLeft('white')); setBLeft(coinsLeft('black'));

    // Check win
    const won = checkWin();
    if(!won) endTurn(foul);
  }

  // ── checkWin ──
  // P1 wins when all white pocketed + queen covered (by anyone)
  // P2 wins when all black pocketed + queen covered
  // Edge: if all coins of both gone → highest score
  function checkWin():boolean{
    if(winnerRef.current) return true;
    const wl=coinsLeft('white'), bl=coinsLeft('black');
    const qCovered = !!queenState.current.coveredBy;

    if(wl===0 && qCovered){ triggerWin('p1'); return true; }
    if(bl===0 && qCovered){ triggerWin('p2'); return true; }
    if(wl===0 && bl===0){
      const w = scoresRef.current.p1>=scoresRef.current.p2?'p1':'p2';
      triggerWin(w); return true;
    }
    return false;
  }

  function triggerWin(p:Player){
    clearTimer2();
    canShootRef.current=false;
    winnerRef.current=p;
    setWinner(p); playWin();
  }

  // ── endTurn ──
  function endTurn(wasFoul:boolean){
    clearTimer2();
    const next = wasFoul||!extraTurn.current ? opponent(turnRef.current) : turnRef.current;
    extraTurn.current=false;

    turnRef.current=next; setTurn(next);
    resetStriker(next);

    if(modeRef.current==='online_playing'){
      canShootRef.current = roleRef.current===next;
    } else {
      canShootRef.current=true;
    }

    // Online sync
    if(modeRef.current==='online_playing'&&roomIdRef.current){
      mockBackend.publish(('carrom_sync_'+roomIdRef.current) as any,{
        type:'sync_state', turn:next, scores:scoresRef.current,
      });
    }

    if(!winnerRef.current){
      if(modeRef.current==='bot'&&next==='p2') setTimeout(runBot,900+Math.random()*600);
      else startTimer2();
    }
  }

  function resetStriker(p:Player){
    if(!strikerRef.current) return;
    strikerSlide.current=0.5;
    const sp=strikerPosFor(p,0.5);
    Matter.Body.setPosition(strikerRef.current,sp);
    Matter.Body.setVelocity(strikerRef.current,{x:0,y:0});
    Matter.Body.setAngularVelocity(strikerRef.current,0);
    pocketedSet.current.delete(strikerRef.current.id);
    isDragging.current=false; dragPt.current=null;
  }

  // ── Timer ──
  function startTimer2(){
    clearTimer2();
    timerValRef.current=TIMER_SEC; setTimerVal(TIMER_SEC);
    timerRef2.current=setInterval(()=>{
      timerValRef.current--; setTimerVal(timerValRef.current);
      if(timerValRef.current<=5) playTick();
      if(timerValRef.current<=0){
        clearTimer2();
        shotFlags.current={strikerPocketed:false,ownCoin:false,oppCoin:false,queenPocketed:false};
        isMoving.current=false;
        showFoul('⏱️ Time out! FOUL');
        returnCoin(myColor(turnRef.current));
        endTurn(true);
      }
    },1000);
  }
  function clearTimer2(){ if(timerRef2.current){clearInterval(timerRef2.current);timerRef2.current=null;} }

  // ── AI Bot ──
  function runBot(){
    if(!canShootRef.current||isMoving.current||turnRef.current!=='p2'||!strikerRef.current||!engineRef.current) return;
    canShootRef.current=false; isMoving.current=true;
    const sx=strikerRef.current.position.x, sy=strikerRef.current.position.y;
    const targets=allBodies.current.filter(b=>
      !pocketedSet.current.has(b.id)&&b.position.x>0&&
      (b.label==='black'||(b.label==='queen'&&!queenState.current.coveredBy))
    );
    let tx=W/2,ty=H/2-50;
    if(targets.length){
      let best=targets[0],bd=Infinity;
      targets.forEach(t=>{const d=Math.hypot(t.position.x-sx,t.position.y-sy);if(d<bd){bd=d;best=t;}});
      tx=best.position.x+(Math.random()-0.5)*32;
      ty=best.position.y+(Math.random()-0.5)*32;
    }
    const dx=tx-sx,dy=ty-sy,d=Math.hypot(dx,dy);
    const pwr=0.42+Math.random()*0.52;
    const fx=(dx/d)*pwr*FORCE_K, fy=(dy/d)*pwr*FORCE_K;
    shotFlags.current={strikerPocketed:false,ownCoin:false,oppCoin:false,queenPocketed:false};
    Matter.Body.applyForce(strikerRef.current,strikerRef.current.position,{x:fx,y:fy});
    playShoot(pwr);
  }

  // ── Physics ──
  function initPhysics(){
    if(engineRef.current){ Matter.Runner.stop(runnerRef.current!); Matter.Engine.clear(engineRef.current); }
    pocketedSet.current.clear(); allBodies.current=[];

    const engine=Matter.Engine.create({gravity:{x:0,y:0}});
    const runner=Matter.Runner.create();
    engineRef.current=engine; runnerRef.current=runner;

    // Walls
    const wo={isStatic:true,restitution:0.80,friction:0,label:'wall' as CoinColor,
              collisionFilter:{category:0x0001,mask:0x0006}};
    const hp=BORDER/2;
    const walls=[
      Matter.Bodies.rectangle(W/2,hp,W,BORDER,wo),
      Matter.Bodies.rectangle(W/2,H-hp,W,BORDER,wo),
      Matter.Bodies.rectangle(hp,H/2,BORDER,H,wo),
      Matter.Bodies.rectangle(W-hp,H/2,BORDER,H,wo),
    ];

    // Pocket sensors
    const pockets=POCKETS.map(({x,y})=>
      Matter.Bodies.circle(x,y,POCKET_R,{isStatic:true,isSensor:true,label:'pocket' as CoinColor,
        collisionFilter:{category:0x0004,mask:0x0002}})
    );

    // Coins
    const coins=buildCoins(engine);
    allBodies.current=coins;

    // Striker
    const sp=strikerPosFor(turnRef.current);
    const striker=Matter.Bodies.circle(sp.x,sp.y,STRIKER_R,{
      restitution:0.82,friction:0.04,frictionAir:0.018,density:0.005,
      label:'striker' as CoinColor,
      collisionFilter:{category:0x0002,mask:0x0007},
    });
    strikerRef.current=striker;

    Matter.Composite.add(engine.world,[...walls,...pockets,striker]);

    // Collision handler
    Matter.Events.on(engine,'collisionStart',(evt:Matter.IEventCollision<Matter.Engine>)=>{
      for(const {bodyA,bodyB} of evt.pairs){
        if((bodyA.label==='wall'&&bodyB.label==='striker')||(bodyB.label==='wall'&&bodyA.label==='striker'))
          playBounce();
        const isPA=bodyA.label==='pocket', isPB=bodyB.label==='pocket';
        if(isPA||isPB){
          const coin=isPA?bodyB:bodyA;
          if(!['wall','pocket'].includes(coin.label)&&!pocketedSet.current.has(coin.id)
             &&coin.position.x>0&&coin.position.y>0)
            handlePocket(coin);
        }
      }
    });

    // Stop detection
    Matter.Events.on(engine,'afterUpdate',()=>{
      if(!isMoving.current) return;
      const bodies=Matter.Composite.allBodies(engine.world);
      const moving=bodies.some((b:Matter.Body)=>{
        if(b.isStatic||b.position.x<0||b.position.y<0) return false;
        const v=b.velocity,av=b.angularVelocity;
        return v.x*v.x+v.y*v.y>0.007||Math.abs(av)>0.007;
      });
      if(!moving){
        isMoving.current=false;
        if(modeRef.current==='online_playing'&&isRxStrike.current){
          isRxStrike.current=false; return;
        }
        isRxStrike.current=false;
        setTimeout(afterShot,280);
      }
    });

    Matter.Runner.run(runner,engine);
  }

  // ── Online sync ──
  useEffect(()=>{
    if(mode!=='online_playing'||!roomId) return;
    const unsub=mockBackend.subscribe(('carrom_sync_'+roomId) as any,(data:any)=>{
      if(data.type==='strike'){
        if(data.shooter===roleRef.current) return;
        if(turnRef.current!==roleRef.current&&strikerRef.current){
          canShootRef.current=false; isMoving.current=true; isRxStrike.current=true;
          Matter.Body.setPosition(strikerRef.current,data.pos);
          Matter.Body.applyForce(strikerRef.current,data.pos,data.force);
        }
      } else if(data.type==='sync_state'){
        if(data.scores){ setScores(data.scores); scoresRef.current=data.scores; }
        if(data.turn){
          setTurn(data.turn); turnRef.current=data.turn;
          canShootRef.current=roleRef.current===data.turn;
          isMoving.current=false; isRxStrike.current=false;
          if(!winnerRef.current&&roleRef.current===data.turn) startTimer2();
        }
        if(data.winner){ triggerWin(data.winner); }
      }
    });
    return ()=>unsub();
  },[mode,roomId]);

  // ── Game loop ──
  function startLoop(){
    const tick=()=>{
      const board=boardRef.current, aim=aimRef.current, eng=engineRef.current;
      if(!board||!aim||!eng) { rafRef.current=requestAnimationFrame(tick); return; }
      const bctx=board.getContext('2d'), actx=aim.getContext('2d');
      if(!bctx||!actx) { rafRef.current=requestAnimationFrame(tick); return; }
      const s=scaleRef.current;
      const bodies=Matter.Composite.allBodies(eng.world);

      // Board + static elements
      drawBoard(bctx,s,turnRef.current,
        queenState.current.pocketed,queenState.current.coveredBy);

      // All coin bodies (striker included)
      const allDraw=[...allBodies.current];
      if(strikerRef.current) allDraw.push(strikerRef.current);
      drawCoins(bctx,s,allDraw,pocketedSet.current,
        canShootRef.current,isMoving.current,turnRef.current);

      // Aim overlay
      if(isDragging.current&&dragPt.current&&strikerRef.current){
        drawAim(actx,s,
          strikerRef.current.position.x,strikerRef.current.position.y,
          dragPt.current.x,dragPt.current.y,
          allBodies.current,pocketedSet.current);
      } else {
        actx.clearRect(0,0,aim.width,aim.height);
      }

      rafRef.current=requestAnimationFrame(tick);
    };
    rafRef.current=requestAnimationFrame(tick);
  }
  function stopLoop(){ if(rafRef.current) cancelAnimationFrame(rafRef.current); }

  // ── Canvas setup after mode change ──
  useEffect(()=>{
    if(mode==='menu'||mode==='online_lobby') return;
    const t=setTimeout(()=>{
      const canvas=boardRef.current, aimC=aimRef.current, wrap=wrapRef.current;
      if(!canvas||!aimC||!wrap) return;
      const size=Math.min(wrap.clientWidth,wrap.clientHeight,560);
      const dpr=window.devicePixelRatio||1;
      const px=Math.floor(size*dpr);
      scaleRef.current=(size/W)*dpr;
      canvas.width=px; canvas.height=px; canvas.style.width=size+'px'; canvas.style.height=size+'px';
      aimC.width=px; aimC.height=px; aimC.style.width=size+'px'; aimC.style.height=size+'px';
      initPhysics(); startLoop(); startTimer2();
    },60);
    return ()=>clearTimeout(t);
  },[mode]);

  useEffect(()=>()=>{
    stopLoop(); clearTimer2();
    if(engineRef.current){ Matter.Runner.stop(runnerRef.current!); Matter.Engine.clear(engineRef.current); }
  },[]);

  // ── startGame ──
  function startGame(m:GameMode, r?:Player){
    stopLoop(); clearTimer2();
    if(engineRef.current){ Matter.Runner.stop(runnerRef.current!); Matter.Engine.clear(engineRef.current); }
    // reset all state
    setTurn('p1'); turnRef.current='p1';
    setScores({p1:0,p2:0}); scoresRef.current={p1:0,p2:0};
    setWLeft(9); setBLeft(9);
    setWinner(null); winnerRef.current=null;
    setFoulMsg(''); setQueenMsg(''); setExtraAnim(false); setPower(0);
    setTimerVal(TIMER_SEC); timerValRef.current=TIMER_SEC;
    canShootRef.current=true; isMoving.current=false; isRxStrike.current=false;
    extraTurn.current=false;
    shotFlags.current={strikerPocketed:false,ownCoin:false,oppCoin:false,queenPocketed:false};
    queenState.current={pocketed:false,coveredBy:null,graceUsed:false};
    consecFouls.current={p1:0,p2:0};
    isDragging.current=false; dragPt.current=null; strikerSlide.current=0.5;
    if(r){setRole(r);roleRef.current=r;}
    setMode(m); modeRef.current=m;
  }

  // mpSession auto-launch
  if(mode==='menu'&&mpSession.forGame('carrom')){
    const sess=mpSession.forGame('carrom')!;
    setTimeout(()=>{
      setRole(sess.role as Player); roleRef.current=sess.role as Player;
      setRoomId(sess.roomId); roomIdRef.current=sess.roomId;
      mockBackend.joinRoom(sess.roomId);
      startGame('online_playing',sess.role as Player);
    },0);
  }

  // ── Input helpers ──
  function toPhys(e:React.PointerEvent){
    const c=boardRef.current!; const r=c.getBoundingClientRect();
    return {x:(e.clientX-r.left)/scaleRef.current*window.devicePixelRatio,
            y:(e.clientY-r.top)/scaleRef.current*window.devicePixelRatio};
  }

  function onDown(e:React.PointerEvent){
    if(!canShootRef.current||isMoving.current||winnerRef.current) return;
    if(modeRef.current==='bot'&&turnRef.current==='p2') return;
    if(modeRef.current==='online_playing'&&roleRef.current!==turnRef.current) return;
    if(!strikerRef.current) return;
    const pos=toPhys(e);
    const sx=strikerRef.current.position.x, sy=strikerRef.current.position.y;
    // Lane tap → slide striker
    if(Math.hypot(pos.x-sx,pos.y-sy)>STRIKER_R*4){
      const laneY=LANE_Y[turnRef.current];
      if(Math.abs(pos.y-laneY)<STRIKER_R*2.8){
        const minX=BORDER+STRIKER_R+10, maxX=W-BORDER-STRIKER_R-10;
        const nx2=Math.max(minX,Math.min(maxX,pos.x));
        strikerSlide.current=(nx2-minX)/(maxX-minX);
        Matter.Body.setPosition(strikerRef.current,{x:nx2,y:laneY});
        Matter.Body.setVelocity(strikerRef.current,{x:0,y:0});
      }
      return;
    }
    isDragging.current=true; dragPt.current=pos; clearTimer2();
  }

  function onMove(e:React.PointerEvent){
    if(!isDragging.current||!strikerRef.current) return;
    const pos=toPhys(e); dragPt.current=pos;
    const dx=strikerRef.current.position.x-pos.x, dy=strikerRef.current.position.y-pos.y;
    setPower(Math.min(Math.hypot(dx,dy)/MAX_PULL,1));
  }

  function onUp(e:React.PointerEvent){
    if(!isDragging.current||!dragPt.current||!strikerRef.current){ isDragging.current=false;dragPt.current=null;setPower(0);return; }
    const pos=dragPt.current;
    const sx=strikerRef.current.position.x, sy=strikerRef.current.position.y;
    const dx=sx-pos.x, dy=sy-pos.y, dist=Math.hypot(dx,dy);
    isDragging.current=false; dragPt.current=null; setPower(0);
    if(dist<6){startTimer2();return;}
    const pwr=Math.min(dist/MAX_PULL,1);
    const fx=(dx/dist)*pwr*FORCE_K, fy=(dy/dist)*pwr*FORCE_K;
    canShootRef.current=false; isMoving.current=true;
    shotFlags.current={strikerPocketed:false,ownCoin:false,oppCoin:false,queenPocketed:false};
    Matter.Body.applyForce(strikerRef.current,strikerRef.current.position,{x:fx,y:fy});
    playShoot(pwr);
    if(modeRef.current==='online_playing'&&roomIdRef.current){
      mockBackend.publish(('carrom_sync_'+roomIdRef.current) as any,{
        type:'strike',pos:strikerRef.current.position,force:{x:fx,y:fy},shooter:roleRef.current,
      });
    }
  }

  // ════ RENDER ════
  const pwr100=Math.round(power*100);
  const tPct  =timerVal/TIMER_SEC;
  const tColor=timerVal<=5?'#ef4444':timerVal<=10?'#f59e0b':'#10b981';
  const isMyTurn=mode!=='online_playing'||role===turn;

  if(mode==='menu') return (
    <div className="flex flex-col items-center justify-center h-full p-6 bg-gradient-to-b from-[#0c1118] to-[#0a0e14] text-white">
      <button onClick={()=>onGameOver(0)} className="absolute top-5 left-5 text-gray-500 hover:text-white text-sm flex items-center gap-1">
        <ArrowLeft className="w-4 h-4"/> Back
      </button>
      <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center shadow-[0_0_40px_rgba(245,158,11,0.5)] mb-5">
        <span className="text-5xl select-none">🎯</span>
      </div>
      <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent mb-2">CARROM</h1>
      <p className="text-gray-500 text-xs mb-2 tracking-widest uppercase">2 Player Board Game</p>

      {/* Quick rules */}
      <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-4 mb-7 w-full max-w-xs text-xs text-gray-400 space-y-1.5">
        <div className="font-bold text-gray-300 mb-2 text-sm">📋 Rules</div>
        <div>⚪ <span className="text-amber-400 font-bold">P1</span> = White coins &nbsp;|&nbsp; ⚫ <span className="text-indigo-400 font-bold">P2</span> = Black coins</div>
        <div>🔴 Queen: pocket karo + same/agla shot mein apna coin → <span className="text-yellow-400">+3 bonus</span></div>
        <div>✅ Apna coin pocket = <span className="text-green-400">Extra turn + 1 point</span></div>
        <div>❌ Striker pocket = <span className="text-red-400">FOUL, turn jaata hai</span></div>
        <div>❌ Opponent coin = <span className="text-red-400">FOUL, woh coin wapas</span></div>
        <div>⏱️ 30 sec per turn | 3 fouls = −5 pts</div>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button onClick={()=>startGame('bot')}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-600 to-amber-500 font-bold text-lg active:scale-95 transition flex items-center justify-center gap-3">
          <Bot className="w-5 h-5"/> VS AI Bot
        </button>
        <button onClick={()=>startGame('local')}
          className="w-full py-4 rounded-2xl bg-gray-800 border border-gray-600 hover:bg-gray-700 font-bold text-lg active:scale-95 transition flex items-center justify-center gap-3">
          <Users className="w-5 h-5 text-yellow-400"/> Local 2 Player
        </button>
        <button onClick={()=>setMode('online_lobby')}
          className="w-full py-4 rounded-2xl bg-gray-800 border border-gray-600 hover:bg-gray-700 font-bold text-lg active:scale-95 transition flex items-center justify-center gap-3">
          <Globe className="w-5 h-5 text-indigo-400"/> Online
        </button>
      </div>
    </div>
  );

  if(mode==='online_lobby') return (
    <OnlineLobby
      onStart={(r,id)=>{setRole(r);roleRef.current=r;setRoomId(id);roomIdRef.current=id;startGame('online_playing',r);}}
      onBack={()=>setMode('menu')}
    />
  );

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-[#0c1118] to-[#0a0e14] text-white overflow-hidden select-none">

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
        <button onClick={()=>{stopLoop();clearTimer2();onGameOver(Math.max(scores.p1,scores.p2),'Completed');}}
          className="text-xs text-gray-500 hover:text-white border border-gray-700 px-3 py-1.5 rounded-xl font-bold transition">
          Exit
        </button>
        {/* Timer */}
        <div className="flex items-center gap-2">
          <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-1000" style={{width:`${tPct*100}%`,background:tColor}}/>
          </div>
          <span className="text-sm font-black tabular-nums w-8" style={{color:tColor}}>{timerVal}s</span>
        </div>
        <div className="text-xs text-gray-600 font-bold uppercase tracking-widest">
          {mode==='bot'?'VS BOT':mode==='local'?'LOCAL':'ONLINE'}
        </div>
      </div>

      {/* Score cards */}
      <div className="flex gap-2 px-4 pb-2 shrink-0">
        {(['p1','p2'] as Player[]).map(p=>(
          <div key={p} className={`flex-1 flex items-center justify-between px-3 py-2 rounded-xl border transition-all duration-300 ${
            turn===p?'scale-[1.02]':'opacity-55 border-gray-700/40 bg-gray-800/20'
          }`} style={turn===p?{borderColor:P_COLORS[p]+'88',background:P_COLORS[p]+'14'}:{}}>
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1" style={{color:P_COLORS[p]}}>
                {turn===p&&!winner&&<span className="animate-pulse">▶</span>} {pName(p)}
              </div>
              <div className="text-[9px] text-gray-500 mt-0.5">
                {p==='p1'?`⚪ ${wLeft} left`:`⚫ ${bLeft} left`}
                {queenState.current.coveredBy===p?<span className="text-yellow-400 ml-1">+Queen</span>:null}
              </div>
            </div>
            <div className="text-2xl font-black">{scores[p]}</div>
          </div>
        ))}
      </div>

      {/* Foul / queen message */}
      {(foulMsg||queenMsg||extraAnim)&&(
        <div className="px-4 mb-1 shrink-0">
          <div className={`text-xs font-bold text-center py-1.5 rounded-xl border ${
            extraAnim?'bg-green-500/15 border-green-500/30 text-green-300':
            queenMsg?'bg-yellow-500/15 border-yellow-500/30 text-yellow-300':
            'bg-red-500/15 border-red-500/30 text-red-300'
          }`}>
            {extraAnim?'🎉 Extra Turn!':queenMsg||foulMsg}
          </div>
        </div>
      )}

      {/* Board */}
      <div ref={wrapRef} className="relative flex-1 flex items-center justify-center min-h-0 px-2 py-1">
        <div className="relative rounded-[2rem] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
          <canvas ref={boardRef} className="block touch-none" style={{display:'block'}}/>
          <canvas ref={aimRef}   className="block touch-none absolute inset-0 pointer-events-none" style={{zIndex:2}}/>
          {/* input capture */}
          <div className="absolute inset-0" style={{zIndex:3,touchAction:'none'}}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}/>
        </div>
      </div>

      {/* Power + hint */}
      <div className="px-4 pt-2 pb-3 shrink-0 flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-2 w-full max-w-[280px]">
          <span className="text-[9px] text-gray-600 font-bold w-7">PWR</span>
          <div className="flex-1 h-2 bg-gray-700/60 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-75" style={{
              width:`${pwr100}%`,
              background:power>0.75?'#ef4444':power>0.42?'#f59e0b':'#10b981'
            }}/>
          </div>
          <span className="text-[9px] text-gray-500 w-7 text-right tabular-nums">{pwr100}%</span>
        </div>
        <p className="text-[10px] text-gray-500 font-bold tracking-widest uppercase text-center leading-tight">
          {isMoving.current?'⚡ Moving…':
           mode==='bot'&&turn==='p2'?'🤖 AI thinking…':
           !isMyTurn?'⏳ Opponent ki turn…':
           'Lane tap = striker slide  ·  Drag striker = aim & shoot'}
        </p>
      </div>

      {/* Win overlay */}
      {winner&&(
        <div className="absolute inset-0 bg-black/88 flex flex-col items-center justify-center z-50 backdrop-blur-md p-6">
          <Crown className="w-20 h-20 text-yellow-400 animate-bounce mb-4 drop-shadow-[0_0_24px_rgba(234,179,8,0.7)]"/>
          <h2 className="text-5xl font-black mb-1" style={{color:P_COLORS[winner]}}>{pName(winner)}</h2>
          <p className="text-2xl font-bold text-white mb-1">Jeet Gaya! 🎉</p>
          <p className="text-gray-400 text-sm mb-7">{scores.p1} – {scores.p2}</p>
          <div className="flex gap-3">
            <button onClick={()=>startGame(mode==='online_playing'?'menu':mode)}
              className="bg-indigo-600 hover:bg-indigo-500 font-bold py-3 px-8 rounded-2xl active:scale-95 transition">
              Again
            </button>
            <button onClick={()=>{stopLoop();clearTimer2();onGameOver(scores[winner],'Win');}}
              className="bg-gray-700 hover:bg-gray-600 font-bold py-3 px-8 rounded-2xl active:scale-95 transition">
              Hub
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
