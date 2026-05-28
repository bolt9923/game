import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Chess, Square } from 'chess.js';
import { Bot, Users, Globe, ArrowLeft, Trophy, Flag, Handshake, Clock } from 'lucide-react';
import { mockBackend } from '../lib/mockBackend';
import MultiplayerLobby from '../components/MultiplayerLobby';
import { Chessboard } from 'react-chessboard';

type GameMode = 'menu' | 'bot' | '1v1' | 'online_lobby' | 'online_playing';
type PlayerRole = 'p1' | 'p2' | null; // p1 is white, p2 is black
const MOVE_TIME_LIMIT = 40; // seconds per move
const MAX_MISSES = 3;

interface ChessGameProps {
  onGameOver: (score: number, result?: 'Win' | 'Loss' | 'Draw' | 'Completed') => void;
  onBack: () => void;
}

export default function ChessGame({ onGameOver, onBack }: ChessGameProps) {
  const [mode, setMode] = useState<GameMode>('menu');
  const [role, setRole] = useState<PlayerRole>(null);
  const [roomId, setRoomId] = useState<string>('');
  
  const [game, setGame] = useState(new Chess());
  const [winner, setWinner] = useState<'White' | 'Black' | 'Draw' | null>(null);
  const [winReason, setWinReason] = useState<string>('By Checkmate');
  const [score, setScore] = useState(0);

  const [capturedByWhite, setCapturedByWhite] = useState<string[]>([]);
  const [capturedByBlack, setCapturedByBlack] = useState<string[]>([]);

  // Selection / legal-move highlights
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalTargets, setLegalTargets] = useState<string[]>([]);

  // Per-move timer + miss tracking
  const [timeLeft, setTimeLeft] = useState(MOVE_TIME_LIMIT);
  const [missesWhite, setMissesWhite] = useState(0);
  const [missesBlack, setMissesBlack] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (mode !== '1v1' && mode !== 'online_playing') return;
    
    const unsub = mockBackend.subscribe('chess_sync_state', (data) => {
      const newGame = new Chess(data.fen);
      setGame(newGame);
      checkGameOver(newGame);
    });

    return () => unsub();
  }, [mode]);

  // Handle when a player's move-timer expires
  const handleTimeOut = () => {
    if (winner || mode === 'menu' || mode === 'online_lobby') return;
    const turn = game.turn(); // 'w' or 'b'

    // In bot mode, only the human (white) is penalized
    if (mode === 'bot' && turn === 'b') {
      setTimeLeft(MOVE_TIME_LIMIT);
      return;
    }

    const currentMisses = turn === 'w' ? missesWhite + 1 : missesBlack + 1;

    if (currentMisses >= MAX_MISSES) {
      const loser = turn === 'w' ? 'White' : 'Black';
      const winnerSide = turn === 'w' ? 'Black' : 'White';
      setWinner(winnerSide);
      setWinReason(`${loser} missed ${MAX_MISSES} turns`);
      return;
    }

    if (turn === 'w') setMissesWhite(currentMisses); else setMissesBlack(currentMisses);
    setSelectedSquare(null);
    setLegalTargets([]);
    setTimeLeft(MOVE_TIME_LIMIT);

    // Skip the missed turn by making a null/random move so play continues
    // Use a random legal move to forfeit the turn meaningfully
    if (mode === 'bot' && turn === 'w') {
      // Player skipped: bot moves next; simulate by passing turn via random move on player's behalf? No, just let bot move.
      const cg = new Chess(game.fen());
      makeRandomMove(cg);
    }
  };

  // Per-move countdown
  useEffect(() => {
    if (winner || mode === 'menu' || mode === 'online_lobby') return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          handleTimeOut();
          return MOVE_TIME_LIMIT;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [mode, winner, game]);


  const calculateCaptures = (cg: Chess) => {
    // simplified capture tracking by examining fen
    // Standard starting pieces count
    const startMatches = { p: 8, n: 2, b: 2, r: 2, q: 1, P: 8, N: 2, B: 2, R: 2, Q: 1 };
    
    const fen = cg.fen().split(' ')[0];
    const current = { p: 0, n: 0, b: 0, r: 0, q: 0, P: 0, N: 0, B: 0, R: 0, Q: 0 };
    
    for (let char of fen) {
      if (current[char as keyof typeof current] !== undefined) {
         current[char as keyof typeof current]++;
      }
    }
    
    const capWhite: string[] = [];
    const capBlack: string[] = [];
    
    // Pieces captured BY white (meaning black lost them, so lowercase letters)
    ['q', 'r', 'b', 'n', 'p'].forEach(piece => {
       const lost = startMatches[piece as keyof typeof startMatches] - current[piece as keyof typeof current];
       for(let i=0; i<lost; i++) capWhite.push(piece);
    });
    
    // Pieces captured BY black (meaning white lost them, uppercase letters)
    ['Q', 'R', 'B', 'N', 'P'].forEach(piece => {
       const lost = startMatches[piece as keyof typeof startMatches] - current[piece as keyof typeof current];
       for(let i=0; i<lost; i++) capBlack.push(piece);
    });
    
    setCapturedByWhite(capWhite);
    setCapturedByBlack(capBlack);
  };

  const makeRandomMove = (cg: Chess) => {
    const possibleMoves = cg.moves();
    if (cg.isGameOver() || cg.isDraw() || possibleMoves.length === 0) return;
    const randomIndex = Math.floor(Math.random() * possibleMoves.length);
    cg.move(possibleMoves[randomIndex]);
    setGame(new Chess(cg.fen()));
    checkGameOver(cg);
    calculateCaptures(cg);
  };

  const checkGameOver = (cg: Chess) => {
    if (cg.isCheckmate()) {
      const w = cg.turn() === 'w' ? 'Black' : 'White';
      setWinner(w);
      setWinReason('By Checkmate');
      if (mode === 'bot' && w === 'White') setScore(s => s + 200);
    } else if (cg.isDraw() || cg.isStalemate() || cg.isThreefoldRepetition()) {
      setWinner('Draw');
      setWinReason('Stalemate reached');
    }
  };

  const applyMove = (gameCopy: Chess) => {
    setGame(gameCopy);
    setSelectedSquare(null);
    setLegalTargets([]);
    setTimeLeft(MOVE_TIME_LIMIT);
    setMissesWhite(0);
    setMissesBlack(0);
    checkGameOver(gameCopy);
    calculateCaptures(gameCopy);

    if (mode === '1v1' || mode === 'online_playing') {
      mockBackend.publish('chess_sync_state', { fen: gameCopy.fen() });
    }

    if (mode === 'bot' && !gameCopy.isGameOver()) {
      setTimeout(() => {
        makeRandomMove(gameCopy);
        setTimeLeft(MOVE_TIME_LIMIT);
      }, 600);
    }
  };

  const tryMove = (from: string, to: string, pieceCode?: string): boolean => {
    if (winner) return false;
    const gameCopy = new Chess(game.fen());
    try {
      const moveOpts: any = { from, to };
      const pc = pieceCode || (game.get(from as Square)?.color === 'w' ? 'wP' : 'bP');
      if ((pc === 'wP' && from[1] === '7' && to[1] === '8') ||
          (pc === 'bP' && from[1] === '2' && to[1] === '1')) {
        moveOpts.promotion = 'q';
      }
      const move = gameCopy.move(moveOpts);
      if (!move) return false;
      applyMove(gameCopy);
      return true;
    } catch {
      return false;
    }
  };

  const isMyTurnToInteract = () => {
    if (winner) return false;
    if (mode === 'online_playing') {
      const isWhiteTurn = game.turn() === 'w';
      if (isWhiteTurn && role !== 'p1') return false;
      if (!isWhiteTurn && role !== 'p2') return false;
    } else if (mode === 'bot') {
      if (game.turn() === 'b') return false;
    }
    return true;
  };

  const onPieceDrop = ({ sourceSquare, targetSquare, piece }: { sourceSquare: string; targetSquare: string | null; piece: { pieceType: string } }) => {
    if (!targetSquare || !isMyTurnToInteract()) return false;
    return tryMove(sourceSquare, targetSquare, piece?.pieceType);
  };

  const onSquareClick = ({ square }: { square: string; piece: { pieceType: string } | null }) => {
    if (!isMyTurnToInteract()) return;
    const turnColor = game.turn();
    const pieceOnSquare = game.get(square as Square);

    // If clicking a target highlight, attempt the move
    if (selectedSquare && legalTargets.includes(square)) {
      tryMove(selectedSquare, square);
      return;
    }

    // Select / re-select own piece
    if (pieceOnSquare && pieceOnSquare.color === turnColor) {
      const moves = game.moves({ square: square as Square, verbose: true }) as any[];
      setSelectedSquare(square);
      setLegalTargets(moves.map(m => m.to));
    } else {
      setSelectedSquare(null);
      setLegalTargets([]);
    }
  };

  const resetGame = () => {
    const newGame = new Chess();
    setGame(newGame);
    setWinner(null);
    setWinReason('By Checkmate');
    setCapturedByBlack([]);
    setCapturedByWhite([]);
    setSelectedSquare(null);
    setLegalTargets([]);
    setTimeLeft(MOVE_TIME_LIMIT);
    setMissesWhite(0);
    setMissesBlack(0);
    if (mode === '1v1' || mode === 'online_playing') {
      mockBackend.publish('chess_sync_state', { fen: newGame.fen() });
    }
  };


  const handleExit = () => {
    let result: 'Win' | 'Loss' | 'Draw' | 'Completed' = 'Completed';
    if (winner === 'Draw') result = 'Draw';
    else if (winner === 'White') result = mode === 'bot' ? 'Win' : mode === 'online_playing' ? (role === 'p1' ? 'Win' : 'Loss') : 'Completed';
    else if (winner === 'Black') result = mode === 'bot' ? 'Loss' : mode === 'online_playing' ? (role === 'p2' ? 'Win' : 'Loss') : 'Completed';
    
    onGameOver(score, result);
  };

  if (mode === 'online_lobby') {
    return (
      <MultiplayerLobby
        gameName="Grandmaster Chess"
        gameId="chess"
        maxPlayers={2}
        onStartGame={(assignedRole, id) => {
          setRole(assignedRole);
          setRoomId(id);
          setMode('online_playing');
          resetGame();
        }}
        onBack={() => setMode('menu')}
      />
    );
  }

  if (mode === 'menu') {
    return (
      <div className="flex flex-col items-center justify-center p-6 h-full text-white bg-gradient-to-b from-[#1a2533] to-[#121922]">
        <div className="absolute top-6 left-6">
          <button onClick={() => onGameOver(score, 'Completed')} className="text-gray-400 hover:text-white transition flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Hub
          </button>
        </div>
        
        <div className="w-24 h-24 bg-gradient-to-br from-amber-600 to-yellow-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(245,158,11,0.3)] border-4 border-amber-800">
           <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3 6 4-1-2 5h-10l-2-5 4 1z"/><path d="M16 22H8L6 17h12z"/><path d="M10 17v-4"/><path d="M14 17v-4"/></svg>
        </div>
        <h2 className="text-4xl font-black mb-10 text-center tracking-tight">Chess Plus</h2>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          <button onClick={() => setMode('bot')} className="bg-[#232e3c] border border-gray-700 hover:bg-[#2c394b] text-white font-bold py-5 px-6 rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-transparent w-[200%] -translate-x-[50%] group-hover:translate-x-0 transition-transform duration-500" />
            <Bot className="w-6 h-6 text-blue-400" /> vs AI Machine
          </button>
          <button onClick={() => setMode('1v1')} className="bg-[#232e3c] border border-gray-700 hover:bg-[#2c394b] text-white font-bold py-5 px-6 rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-transparent w-[200%] -translate-x-[50%] group-hover:translate-x-0 transition-transform duration-500" />
            <Users className="w-6 h-6 text-purple-400" /> Local 1v1
          </button>
          <button onClick={() => setMode('online_lobby')} className="bg-[#232e3c] border border-gray-700 hover:bg-[#2c394b] text-white font-bold py-5 px-6 rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-600/20 to-transparent w-[200%] -translate-x-[50%] group-hover:translate-x-0 transition-transform duration-500" />
            <Globe className="w-6 h-6 text-indigo-400" /> Online Arena
          </button>
        </div>
      </div>
    );
  }

  const boardOrientation = role === 'p2' ? 'black' : 'white';
  const isCheck = game.inCheck();
  const myColor = boardOrientation[0]; // 'w' or 'b'
  const isMyTurn = game.turn() === myColor && !winner;

  // Build square highlight styles
  const squareStyles: Record<string, React.CSSProperties> = {};
  if (selectedSquare) {
    squareStyles[selectedSquare] = { background: 'rgba(250, 204, 21, 0.45)', boxShadow: 'inset 0 0 0 3px rgba(250,204,21,0.9)' };
  }
  legalTargets.forEach((sq) => {
    const hasPiece = !!game.get(sq as Square);
    squareStyles[sq] = hasPiece
      ? { background: 'radial-gradient(circle, transparent 55%, rgba(239,68,68,0.55) 60%)' }
      : { background: 'radial-gradient(circle, rgba(34,197,94,0.6) 22%, transparent 25%)' };
  });

  const myMisses = myColor === 'w' ? missesWhite : missesBlack;
  const oppMisses = myColor === 'w' ? missesBlack : missesWhite;

  const renderCaptures = (pieces: string[]) => {
     const codeMap: Record<string, string> = { p:'♟', n:'♞', b:'♝', r:'♜', q:'♛', P:'♙', N:'♘', B:'♗', R:'♖', Q:'♕' };
     return pieces.map((p, i) => <span key={i} className="text-xl -ml-2 drop-shadow-md">{codeMap[p]}</span>);
  };

  const MissDots = ({ count }: { count: number }) => (
    <div className="flex gap-1">
      {[0, 1, 2].map(i => (
        <span key={i} className={`w-2 h-2 rounded-full ${i < count ? 'bg-red-500' : 'bg-gray-600'}`} />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col items-center p-4 h-full text-white bg-gradient-to-b from-[#1a2533] to-[#121922] overflow-auto">
      <div className="flex w-full justify-between items-center mb-4">
        <button onClick={handleExit} className="text-gray-400 hover:text-white transition bg-[#1c2836] px-4 py-2 rounded-xl text-sm font-bold border border-gray-700">Resign</button>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-black tracking-wider ${isMyTurn ? (timeLeft <= 10 ? 'bg-red-500/20 border-red-500/50 text-red-300 animate-pulse' : 'bg-green-500/20 border-green-500/40 text-green-300') : 'bg-[#1c2836] border-gray-700 text-gray-400'}`}>
          <Clock className="w-4 h-4" />
          <span className="tabular-nums">0:{String(timeLeft).padStart(2, '0')}</span>
        </div>
        <span className="text-xs font-medium text-gray-500 bg-[#1c2836] px-3 py-2 rounded-xl border border-gray-700 tracking-wider uppercase">
           {mode === 'bot' ? 'CPU' : mode === 'online_playing' ? 'Online' : '1v1'}
        </span>
      </div>
      
      {/* Opponent Profile area */}
      <div className="w-full max-w-[400px] flex justify-between items-end mb-2 px-1">
         <div className="flex items-center gap-3">
           <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center border border-gray-700 overflow-hidden">
             {mode === 'bot' ? <Bot className="text-gray-400" /> : <div className="w-full h-full bg-gradient-to-tr from-gray-700 to-gray-500" />}
           </div>
           <div>
             <p className="font-bold text-sm">{mode === 'bot' ? 'Stockfish (Level 1)' : boardOrientation === 'white' ? 'Black Player' : 'White Player'}</p>
             <div className="flex text-gray-500 h-6">
               {renderCaptures(boardOrientation === 'white' ? capturedByBlack : capturedByWhite)}
             </div>
           </div>
         </div>
         <div className="flex flex-col items-end gap-1">
           <MissDots count={oppMisses} />
           {game.turn() !== myColor && !winner && <div className="bg-yellow-500/20 text-yellow-400 text-[10px] font-black px-2 py-1 rounded border border-yellow-500/30 uppercase animate-pulse">Thinking</div>}
         </div>
      </div>

      <div className={`w-full max-w-[400px] aspect-[1/1] mb-2 bg-[#2d3748] rounded shadow-2xl relative border-4 transition-colors ${isCheck ? 'border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.3)]' : 'border-[#17212b]'}`}>
        <Chessboard
          options={{
            position: game.fen(),
            onPieceDrop: onPieceDrop,
            onSquareClick: onSquareClick as any,
            squareStyles: squareStyles,
            boardOrientation: boardOrientation,
            darkSquareStyle: { backgroundColor: '#475569' },
            lightSquareStyle: { backgroundColor: '#cbd5e1' },
            dropSquareStyle: { boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)' },
            animationDurationInMs: 300,
            id: 'main-chess-board',
          }}
        />
        {isCheck && !winner && <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-red-600/90 text-white font-black text-3xl px-8 py-3 rounded-xl transform -rotate-12 pointer-events-none drop-shadow-2xl">CHECK!</div>}
      </div>

      {/* Player Profile area */}
      <div className="w-full max-w-[400px] flex justify-between items-start mt-2 px-1">
         <div className="flex items-center gap-3">
           <div className="w-10 h-10 bg-indigo-900 rounded-lg flex items-center justify-center border border-indigo-500 overflow-hidden">
             <div className="w-full h-full bg-gradient-to-tr from-blue-600 to-indigo-400" />
           </div>
           <div>
             <p className="font-bold text-sm">{role ? 'You' : (boardOrientation === 'white' ? 'White Player' : 'Black Player')}</p>
             <div className="flex text-gray-400 h-6">
               {renderCaptures(boardOrientation === 'white' ? capturedByWhite : capturedByBlack)}
             </div>
           </div>
         </div>
         <div className="flex flex-col items-end gap-1">
           <MissDots count={myMisses} />
           {isMyTurn && <div className="bg-green-500/20 text-green-400 text-[10px] font-black px-2 py-1 rounded border border-green-500/30 uppercase animate-pulse">Your Turn</div>}
         </div>
      </div>

      {winner && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50 p-6 backdrop-blur-md">
           {winner === 'Draw' ? <Handshake className="w-24 h-24 text-gray-400 mb-4" /> : <Trophy className="w-24 h-24 text-yellow-400 mb-4 animate-bounce drop-shadow-[0_0_20px_rgba(234,179,8,0.5)]" />}
           
           <h2 className="text-5xl font-black text-white mb-2 tracking-tight">
             {winner === 'Draw' ? 'DRAW' : `${winner} WINS`}
           </h2>
           <p className="text-gray-400 font-medium tracking-widest uppercase text-sm mb-10">
             {winner === 'Draw' ? 'Stalemate reached' : 'By Checkmate'}
           </p>

           <div className="flex gap-4">
             <button
               onClick={resetGame}
               className="bg-[#232e3c] hover:bg-[#2c394b] text-white font-bold py-4 px-8 rounded-xl shadow-lg active:scale-95 transition-transform"
             >
               Rematch
             </button>
             <button
               onClick={handleExit}
               className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 px-8 rounded-xl shadow-lg active:scale-95 transition-transform"
             >
               Exit Arena
             </button>
           </div>
        </div>
      )}
    </div>
  );
}

