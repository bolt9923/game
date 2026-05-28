import React, { useState, useEffect, useRef } from 'react';
import { Users, Bot, Globe, ArrowLeft, Crown } from 'lucide-react';
import Matter from 'matter-js';
import { mockBackend } from '../lib/mockBackend';
import MultiplayerLobby from '../components/MultiplayerLobby';

interface LudoProps {
  onGameOver: (score: number, result?: 'Win' | 'Loss' | 'Draw' | 'Completed') => void;
  onBack: () => void;
}

type Mode = 'menu' | 'bot' | 'local4' | 'local2' | 'online_lobby' | 'online_playing';
type PlayerColor = 'green' | 'yellow' | 'red' | 'blue';

// Unified Board Coordinates 0..51 for main track
// Offsets: Green: 0, Yellow: 13, Blue: 26, Red: 39
const TRACK_COORDS = [
  {c:1,r:6}, {c:2,r:6}, {c:3,r:6}, {c:4,r:6}, {c:5,r:6},
  {c:6,r:5}, {c:6,r:4}, {c:6,r:3}, {c:6,r:2}, {c:6,r:1}, {c:6,r:0}, {c:7,r:0},
  {c:8,r:0}, {c:8,r:1}, {c:8,r:2}, {c:8,r:3}, {c:8,r:4}, {c:8,r:5},
  {c:9,r:6}, {c:10,r:6}, {c:11,r:6}, {c:12,r:6}, {c:13,r:6}, {c:14,r:6}, {c:14,r:7},
  {c:14,r:8}, {c:13,r:8}, {c:12,r:8}, {c:11,r:8}, {c:10,r:8}, {c:9,r:8},
  {c:8,r:9}, {c:8,r:10}, {c:8,r:11}, {c:8,r:12}, {c:8,r:13}, {c:8,r:14}, {c:7,r:14},
  {c:6,r:14}, {c:6,r:13}, {c:6,r:12}, {c:6,r:11}, {c:6,r:10}, {c:6,r:9},
  {c:5,r:8}, {c:4,r:8}, {c:3,r:8}, {c:2,r:8}, {c:1,r:8}, {c:0,r:8}, {c:0,r:7}, {c:0,r:6}
];

const SAFE_SPOTS = [0, 8, 13, 21, 26, 34, 39, 47];

const HOMES = {
  green: [{c:1,r:7}, {c:2,r:7}, {c:3,r:7}, {c:4,r:7}, {c:5,r:7}, {c:6,r:7}],
  yellow: [{c:7,r:1}, {c:7,r:2}, {c:7,r:3}, {c:7,r:4}, {c:7,r:5}, {c:7,r:6}],
  blue: [{c:13,r:7}, {c:12,r:7}, {c:11,r:7}, {c:10,r:7}, {c:9,r:7}, {c:8,r:7}],
  red: [{c:7,r:13}, {c:7,r:12}, {c:7,r:11}, {c:7,r:10}, {c:7,r:9}, {c:7,r:8}],
};

const OFFSETS = { green: 0, yellow: 13, blue: 26, red: 39 };
const HEX = { green: '#16a34a', yellow: '#eab308', blue: '#2563eb', red: '#dc2626' };

interface Token { id: number, color: PlayerColor, pos: number, inBase: boolean, finished: boolean }
interface PlayerState { color: PlayerColor, isBot: boolean }

// Physics Dice Component
function PhysicsDice({ onRollComplete, disabled, color }: { onRollComplete: (r: number) => void, disabled: boolean, color: string }) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const diceRef = useRef<Matter.Body | null>(null);
  const [currentValue, setCurrentValue] = useState<number | null>(null);
  const isRolling = useRef(false);

  useEffect(() => {
    const Engine = Matter.Engine,
          Render = Matter.Render,
          Runner = Matter.Runner,
          Bodies = Matter.Bodies,
          Composite = Matter.Composite,
          Events = Matter.Events;

    const engine = Engine.create();
    engine.gravity.y = 1.5;
    engineRef.current = engine;

    const width = 120;
    const height = 120;

    const render = Render.create({
      element: sceneRef.current!,
      engine: engine,
      options: {
        width, height,
        wireframes: false,
        background: 'transparent',
        pixelRatio: window.devicePixelRatio
      }
    });
    renderRef.current = render;

    const wallOpts = { isStatic: true, render: { visible: false }, restitution: 0.9 };
    const walls = [
      Bodies.rectangle(width/2, -50, width*2, 100, wallOpts), // top
      Bodies.rectangle(width/2, height + 50, width*2, 100, wallOpts), // bottom
      Bodies.rectangle(-50, height/2, 100, height*2, wallOpts), // left
      Bodies.rectangle(width + 50, height/2, 100, height*2, wallOpts) // right
    ];

    const dice = Bodies.rectangle(width/2, height/2, 40, 40, {
      restitution: 0.6,
      friction: 0.1,
      density: 0.05,
      render: { fillStyle: color, strokeStyle: '#ffffff', lineWidth: 4 }
    });
    diceRef.current = dice;

    Composite.add(engine.world, [...walls, dice]);

    const runner = Runner.create();
    Runner.run(runner, engine);
    Render.run(render);
    runnerRef.current = runner;

    Events.on(engine, 'afterUpdate', () => {
       if (isRolling.current) {
          if (dice.speed < 0.2 && dice.angularVelocity < 0.05) {
             isRolling.current = false;
             const result = Math.floor(Math.random() * 6) + 1;
             setCurrentValue(result);
             onRollComplete(result);
          }
       }
    });

    return () => {
      Render.stop(render);
      Runner.stop(runner);
      Engine.clear(engine);
      if (render.canvas) render.canvas.remove();
    };
  }, [color]);

  const triggerRoll = () => {
    if (disabled || isRolling.current || !diceRef.current || !engineRef.current) return;
    setCurrentValue(null);
    isRolling.current = true;
    
    // reset to top
    Matter.Body.setPosition(diceRef.current, { x: 60, y: 30 });
    Matter.Body.setVelocity(diceRef.current, { 
       x: (Math.random() - 0.5) * 15, 
       y: -10 
    });
    Matter.Body.setAngularVelocity(diceRef.current, (Math.random() - 0.5) * 2);
  };

  return (
    <div 
      className={`relative w-24 h-24 rounded-2xl flex items-center justify-center overflow-hidden cursor-pointer active:scale-95 transition-all ${disabled ? 'opacity-50 pointer-events-none' : 'shadow-[0_0_20px_rgba(255,255,255,0.2)] bg-black/20'}`}
      onClick={triggerRoll}
    >
       <div ref={sceneRef} className="absolute inset-0 pointer-events-none flex items-center justify-center" />
       {currentValue !== null && !isRolling.current && (
         <div className="absolute inset-0 flex items-center justify-center text-4xl font-black text-white mix-blend-difference pointer-events-none drop-shadow-md">
            {currentValue}
         </div>
       )}
    </div>
  );
}

export default function Ludo({ onGameOver, onBack }: LudoProps) {
  const [mode, setMode] = useState<Mode>('menu');
  const [tokens, setTokens] = useState<Token[]>([]);
  const [turn, setTurn] = useState<PlayerColor>('red');
  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [diceRoll, setDiceRoll] = useState<number | null>(null);
  const [winner, setWinner] = useState<PlayerColor | null>(null);
  const [movingLogic, setMovingLogic] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [roomId, setRoomId] = useState('');
  const [message, setMessage] = useState<string>('');
  const sixesInRowRef = useRef(0);

  // Helper: can the given player move ANY token with this dice value?
  const hasAnyValidMove = (toks: Token[], color: PlayerColor, r: number) => {
    const mine = toks.filter(t => t.color === color && !t.finished);
    if (mine.some(t => t.inBase) && r === 6) return true;
    return mine.some(t => !t.inBase && t.pos + r <= 56);
  };

  // Online sync
  useEffect(() => {
    if (mode !== 'online_playing' || !roomId) return;
    
    // Using simple mock broadcast for all Ludo rooms
    const unsub = mockBackend.subscribe(('ludo_sync_' + roomId) as import('../lib/mockBackend').GameEventType, (data) => {
       if (data.tokens) setTokens(data.tokens);
       if (data.turn) setTurn(data.turn);
       if (data.diceRoll !== undefined) setDiceRoll(data.diceRoll);
       if (data.winner) setWinner(data.winner);
    });

    return () => unsub();
  }, [mode, roomId]);

  const syncState = (newState: any) => {
     if (mode !== 'online_playing' || !roomId) return;
     mockBackend.publish(('ludo_sync_' + roomId) as import('../lib/mockBackend').GameEventType, newState);
  };

  const initGame = (modeInit: Mode) => {
    let pList: PlayerState[] = [];
    if (modeInit === 'bot') {
       pList = [{color:'red', isBot:false}, {color:'yellow', isBot:true}];
    } else if (modeInit === 'local2' || modeInit === 'online_playing') {
       pList = [{color:'red', isBot:false}, {color:'yellow', isBot:false}];
    } else {
       pList = [
         {color:'red', isBot:false}, {color:'green', isBot:false}, 
         {color:'yellow', isBot:false}, {color:'blue', isBot:false}
       ];
    }
    setPlayers(pList);
    
    let temp: Token[] = [];
    pList.forEach(p => {
       for(let i=0; i<4; i++) {
         temp.push({ id: temp.length, color: p.color, pos: -1, inBase: true, finished: false });
       }
    });
    setTokens(temp);
    setTurn(pList[0].color);
    setDiceRoll(null);
    setWinner(null);
  };

  const handleRollComplete = (r: number) => {
    // Online: only the player whose turn it is should process dice roll
    if (mode === 'online_playing' && role !== turn) return;
    setDiceRoll(r);
    syncState({ diceRoll: r });

    // Real rule: 3 consecutive 6s = turn forfeited
    if (r === 6) {
      sixesInRowRef.current += 1;
      if (sixesInRowRef.current >= 3) {
        setMessage('Three 6s in a row — turn forfeited!');
        sixesInRowRef.current = 0;
        setTimeout(() => { setDiceRoll(null); advanceTurn(); setMessage(''); }, 1100);
        return;
      }
    } else {
      sixesInRowRef.current = 0;
    }

    // Real rule: if no valid move with this roll, auto-skip turn
    if (!hasAnyValidMove(tokens, turn, r)) {
      setMessage(r === 6 ? 'No piece can move — turn skipped' : 'No valid move — turn skipped');
      setTimeout(() => { setDiceRoll(null); advanceTurn(); setMessage(''); }, 900);
      return;
    }

    // Auto-bot play logic
    const currPlayer = players.find(p => p.color === turn);
    if (currPlayer?.isBot) {
      setTimeout(() => handleBotMove(r, turn), 800);
    }
  };

  const advanceTurn = () => {
    const curIdx = players.findIndex(p => p.color === turn);
    const nextIdx = (curIdx + 1) % players.length;
    const nextTurn = players[nextIdx].color;
    sixesInRowRef.current = 0;
    setTurn(nextTurn);
    syncState({ turn: nextTurn, diceRoll: null });
  };

  const moveTokenStepByStep = async (tid: number, startPos: number, targetPos: number, currentTokens: Token[], r: number) => {
     setMovingLogic(true);
     let tks = [...currentTokens];
     const tkIdx = tks.findIndex(t => t.id === tid);
     let tk = tks[tkIdx];
     
     // Step by step animation
     for (let pos = startPos + 1; pos <= targetPos; pos++) {
        tk.pos = pos;
        if (pos === 56) tk.finished = true;
        setTokens([...tks]);
        syncState({ tokens: tks });
        // await delay
        await new Promise(res => setTimeout(res, 200));
     }

     finalizeMovement(tks, tkIdx, r);
  };

  const finalizeMovement = (currentTokens: Token[], tkIdx: number, r: number) => {
    const tk = currentTokens[tkIdx];
    // Real rule: extra turn on rolling 6, capturing, OR getting a token home
    let getsAnotherTurn = r === 6 || tk.finished;
    
    // Check capturing logic
    if (!tk.inBase && tk.pos < 51) {
       const absPos = (tk.pos + OFFSETS[tk.color]) % 52;
       if (!SAFE_SPOTS.includes(absPos)) {
         currentTokens.forEach(otherTk => {
           if (!otherTk.inBase && !otherTk.finished && otherTk.color !== tk.color && otherTk.pos < 51) {
              const otherAbsPos = (otherTk.pos + OFFSETS[otherTk.color]) % 52;
              if (absPos === otherAbsPos) {
                 otherTk.inBase = true;
                 otherTk.pos = -1;
                 getsAnotherTurn = true; // captured piece!
              }
           }
         });
       }
    }
    
    setTokens([...currentTokens]);
    syncState({ tokens: currentTokens });
    
    // Check win condition
    const isWin = currentTokens.filter(t => t.color === turn && t.finished).length === 4;
    if (isWin) {
       setWinner(turn);
       setDiceRoll(null);
       setMovingLogic(false);
       syncState({ winner: turn, diceRoll: null });
       return;
    }

    setDiceRoll(null);
    setMovingLogic(false);
    
    if (!getsAnotherTurn) {
       advanceTurn();
    } else {
       syncState({ diceRoll: null });
       // if it's bot, roll again
       if (players.find(p=>p.color === turn)?.isBot) {
         // It will auto roll when our physical dice is triggered if we expose a ref
       }
    }
  };

  const moveToken = (tid: number, forceR?: number) => {
    const r = forceR ?? diceRoll;
    if (movingLogic || r === null) return;
    
    let currentTokens = [...tokens];
    const tkIdx = currentTokens.findIndex(t => t.id === tid);
    const tk = currentTokens[tkIdx];
    
    if (tk.color !== turn || tk.finished) return;

    if (tk.inBase) {
      if (r === 6) {
        tk.inBase = false;
        tk.pos = 0; 
        setTokens([...currentTokens]);
        finalizeMovement(currentTokens, tkIdx, r);
      } else {
        return; 
      }
    } else {
      const newPos = tk.pos + r;
      if (newPos > 56) return; // Must reach exactly 56 
      moveTokenStepByStep(tid, tk.pos, newPos, currentTokens, r);
    }
  };

  const handleBotMove = (r: number, color: PlayerColor) => {
     if (movingLogic) return;
     const myTokens = tokens.filter(t => t.color === color && !t.finished);
     const canMoveOut = myTokens.find(t => t.inBase && r === 6);
     if (canMoveOut) { moveToken(canMoveOut.id, r); return; }
     
     const canMoveOnBoard = myTokens.filter(t => !t.inBase && t.pos + r <= 56);
     if (canMoveOnBoard.length > 0) {
        moveToken(canMoveOnBoard[0].id, r);
        return;
     }
     
     setDiceRoll(null);
     advanceTurn();
  };

  const getGridCoords = (tk: Token) => {
    if (tk.inBase) {
      const baseCenters = {
        green: {c: 2, r: 2}, yellow: {c: 11, r: 2},
        blue: {c: 11, r: 11}, red: {c: 2, r: 11}
      };
      const center = baseCenters[tk.color];
      const offsets = [{dc:-1,dr:-1}, {dc:1,dr:-1}, {dc:-1,dr:1}, {dc:1,dr:1}];
      const idx = tokens.filter(t => t.color === tk.color).indexOf(tk);
      return { c: center.c + offsets[idx].dc, r: center.r + offsets[idx].dr };
    }
    
    if (tk.pos < 51) {
       const absPos = (tk.pos + OFFSETS[tk.color]) % 52;
       return TRACK_COORDS[absPos];
    } else {
       const hIdx = tk.pos - 51;
       return HOMES[tk.color][hIdx];
    }
  };

  // Bot auto-roll effect since we use physical dice component
  // Normally the player taps the dice. For Bot, we force a roll.
  // Actually, we can just randomly set dice roll. Let's do that cleanly.
  useEffect(() => {
     if (mode !== 'menu' && !winner && players.length > 0) {
        const currPlayer = players.find(p => p.color === turn);
        if (currPlayer?.isBot && !movingLogic && diceRoll === null) {
           const t = setTimeout(() => {
              const r = Math.floor(Math.random() * 6) + 1;
              handleRollComplete(r);
           }, 1500);
           return () => clearTimeout(t);
        }
     }
  }, [turn, movingLogic, diceRoll, mode, winner]);


  if (mode === 'online_lobby') {
    return <MultiplayerLobby gameName="Ludo Plus" gameId="ludo" maxPlayers={4} onStartGame={(r, id) => { 
      // r is 'p1' or 'p2'. Let's map 'p1' -> red, 'p2' -> yellow.
      const colorMap: Record<string,string> = { p1:'red', p2:'yellow', p3:'blue', p4:'green' };
      setRole(colorMap[r] ?? 'red');
      setRoomId(id);
      setMode('online_playing');
      initGame('online_playing');
    }} onBack={() => setMode('menu')} />;
  }

  if (mode === 'menu') {
    return (
      <div className="flex flex-col items-center justify-center p-6 h-full text-white bg-gradient-to-b from-[#1a2533] to-[#121922]">
        <div className="absolute top-6 left-6">
          <button onClick={() => onGameOver(0)} className="text-gray-400 hover:text-white transition flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> Hub</button>
        </div>
        <div className="w-24 h-24 bg-gradient-to-br from-red-600 to-rose-500 rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(239,68,68,0.4)] border-4 border-red-800 rotate-12">
           <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><circle cx="15.5" cy="8.5" r="1.5"/><circle cx="15.5" cy="15.5" r="1.5"/><circle cx="8.5" cy="15.5" r="1.5"/><circle cx="12" cy="12" r="1.5"/></svg>
        </div>
        <h2 className="text-4xl font-black mb-10 tracking-tight">Ludo Plus</h2>
        <div className="flex flex-col gap-4 w-full max-w-xs">
          <button onClick={() => { setMode('bot'); initGame('bot'); }} className="bg-[#232e3c] border border-gray-700 hover:bg-[#2c394b] text-white font-bold py-5 px-6 rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-red-600/20 to-transparent w-[200%] -translate-x-[50%] group-hover:translate-x-0 transition-transform duration-500" />
            <Bot className="w-6 h-6 text-red-500" /> vs AI Bot
          </button>
          <button onClick={() => { setMode('local2'); initGame('local2'); }} className="bg-[#232e3c] border border-gray-700 hover:bg-[#2c394b] text-white font-bold py-5 px-6 rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-yellow-600/20 to-transparent w-[200%] -translate-x-[50%] group-hover:translate-x-0 transition-transform duration-500" />
            <Users className="w-6 h-6 text-yellow-500" /> Local 2P
          </button>
          <button onClick={() => { setMode('local4'); initGame('local4'); }} className="bg-[#232e3c] border border-gray-700 hover:bg-[#2c394b] text-white font-bold py-5 px-6 rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-green-600/20 to-transparent w-[200%] -translate-x-[50%] group-hover:translate-x-0 transition-transform duration-500" />
            <Users className="w-6 h-6 text-green-500" /> Local 4P
          </button>
          <button onClick={() => { setMode('online_lobby'); }} className="bg-[#232e3c] border border-gray-700 hover:bg-[#2c394b] text-white font-bold py-5 px-6 rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-600/20 to-transparent w-[200%] -translate-x-[50%] group-hover:translate-x-0 transition-transform duration-500" />
            <Globe className="w-6 h-6 text-indigo-400" /> Online Arena
          </button>
        </div>
      </div>
    );
  }

  const cells = [];
  for(let r=0; r<15; r++) {
    for(let c=0; c<15; c++) {
      let bg = 'bg-[#f8fafc] border-[#cbd5e1]';
      if (c<6 && r<6) bg = 'bg-green-500 border-green-600 shadow-inner';
      else if (c>8 && r<6) bg = 'bg-yellow-500 border-yellow-600 shadow-inner';
      else if (c<6 && r>8) bg = 'bg-red-500 border-red-600 shadow-inner';
      else if (c>8 && r>8) bg = 'bg-blue-500 border-blue-600 shadow-inner';
      else if (c>5 && c<9 && r>5 && r<9) bg = 'bg-gray-800 border-gray-900';
      else {
         const hGreen = HOMES.green.find(h=>h.c===c && h.r===r);
         const hYellow = HOMES.yellow.find(h=>h.c===c && h.r===r);
         const hBlue = HOMES.blue.find(h=>h.c===c && h.r===r);
         const hRed = HOMES.red.find(h=>h.c===c && h.r===r);
         
         if (hGreen) bg = 'bg-green-100 border-green-300';
         else if (hYellow) bg = 'bg-yellow-100 border-yellow-300';
         else if (hBlue) bg = 'bg-blue-100 border-blue-300';
         else if (hRed) bg = 'bg-red-100 border-red-300';
         else {
           const tIdx = TRACK_COORDS.findIndex(t=>t.c===c && t.r===r);
           if (tIdx >= 0 && SAFE_SPOTS.includes(tIdx)) bg = 'bg-gray-200 border-gray-400 font-black text-[8px] flex items-center justify-center text-gray-500';
         }
      }
      cells.push({c,r,bg});
    }
  }

  const isCurrentPlayerBot = players.find(p=>p.color === turn)?.isBot;

  return (
    <div className="flex flex-col items-center p-4 h-full text-white bg-gradient-to-b from-[#1a2533] to-[#121922] overflow-auto">
      <div className="flex w-full justify-between items-center mb-6">
        <button onClick={() => onGameOver(0, winner ? 'Win' : 'Completed')} className="text-gray-400 hover:text-white transition bg-[#1c2836] px-4 py-2 rounded-xl text-sm font-bold border border-gray-700">Exit Match</button>
      </div>

      <div className="flex w-full max-w-[400px] justify-between items-center mb-6 px-1">
         {players.map(p => (
            <div key={p.color} className={`px-4 py-2 rounded-xl border-2 transition-all duration-300 ${turn === p.color ? 'scale-110 shadow-[0_0_15px_rgba(255,255,255,0.1)]' : 'opacity-40 border-transparent'} flex flex-col items-center min-w-[70px]`} style={{ borderColor: turn === p.color ? HEX[p.color] : undefined, backgroundColor: HEX[p.color] + '20' }}>
               <div className="w-3 h-3 rounded-full mb-1" style={{ backgroundColor: HEX[p.color] }} />
               <span className="font-bold text-xs uppercase tracking-wider text-gray-300">{p.isBot ? 'BOT' : 'P1'}</span>
            </div>
         ))}
      </div>

      {winner && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50 p-6 backdrop-blur-md">
           <Crown className="w-24 h-24 text-yellow-400 mb-4 animate-bounce drop-shadow-[0_0_20px_rgba(234,179,8,0.5)]" />
           <h2 className="text-5xl font-black mb-6 uppercase tracking-tight" style={{ color: HEX[winner] }}>{winner} WINS</h2>
           <button 
             onClick={() => onGameOver(100, 'Win')}
             className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 px-10 rounded-2xl shadow-lg transition-transform active:scale-95"
           >
             Continue to Hub
           </button>
        </div>
      )}

      {/* Ludo Board */}
      <div className="w-full max-w-[400px] aspect-square relative bg-[#e2e8f0] p-2 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] border-4 border-gray-400 overflow-hidden">
         <div className="w-full h-full grid grid-cols-15 grid-rows-15 gap-[1px] bg-gray-400 border border-gray-400 rounded-lg overflow-hidden">
            {cells.map((cell, i) => (
              <div key={i} className={`w-full h-full ${cell.bg} box-border relative`}>
                 {cell.bg.includes('text-[8px]') && <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-50">★</span>}
              </div>
            ))}
         </div>
         
          {/* Draw Tokens over board */}
         {tokens.map(tk => {
            const {c, r} = getGridCoords(tk);
            if (tk.finished) return null; 
            
            const isSelectableLocal = turn === tk.color && diceRoll !== null && !isCurrentPlayerBot && !movingLogic;
            const isSelectable = isSelectableLocal && (mode !== 'online_playing' || role === turn);
            let canMove = false;
            if (isSelectable) {
               if (tk.inBase && diceRoll === 6) canMove = true;
               else if (!tk.inBase && tk.pos + diceRoll <= 56) canMove = true;
            }

            return (
              <div 
                key={tk.id}
                onClick={() => { if(isSelectable && canMove) moveToken(tk.id); }}
                className={`absolute w-[4.5%] h-[4.5%] rounded-full shadow-[0_4px_8px_rgba(0,0,0,0.6)] border-2 border-white/90 transition-all duration-200 ${canMove ? 'cursor-pointer hover:scale-125 z-20 animate-pulse' : 'z-10'}`}
                style={{ 
                  left: `calc(0.5rem + ${c * (100-20*0)/15}% + 1.2%)`, 
                  top: `calc(0.5rem + ${r * (100-20*0)/15}% + 1.2%)`,
                  backgroundColor: HEX[tk.color],
                  transform: movingLogic && tk.color === turn ? 'scale(1.1)' : 'scale(1)'
                }}
              >
                 <div className="absolute inset-1 rounded-full border border-white/30" />
                 <div className="absolute inset-[3px] rounded-full bg-white/20" />
              </div>
            )
         })}
      </div>

         <div className="mt-8 flex flex-col items-center h-40">
         {!isCurrentPlayerBot ? (
           <PhysicsDice 
             onRollComplete={handleRollComplete} 
             disabled={diceRoll !== null || movingLogic || winner !== null || (mode === 'online_playing' && role !== turn)} 
             color={HEX[turn]} 
           />
         ) : (
            <div className="w-24 h-24 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.1)] bg-black/20 opacity-50 border-2 border-dashed border-gray-600">
               <span className="text-3xl font-black text-gray-500">{diceRoll !== null ? diceRoll : '?'}</span>
            </div>
         )}
         
         <p className="mt-6 text-gray-400 font-bold uppercase tracking-widest text-sm bg-[#1c2836] px-6 py-2 rounded-full border border-gray-700">
           {message || (isCurrentPlayerBot ? "Machine is playing" : diceRoll !== null ? "Tap your piece to move" : movingLogic ? "Moving..." : (mode === 'online_playing' && role !== turn) ? `${turn.toUpperCase()} ka turn hai...` : "Tap dice to roll")}
         </p>
      </div>
    </div>
  );
}

