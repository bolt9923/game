import React, { useState, useEffect } from 'react';
import { Trophy, RefreshCw, Users, Bot, Grid3X3, Globe } from 'lucide-react';
import { motion } from 'motion/react';
import { mockBackend } from '../lib/mockBackend';
import MultiplayerLobby from '../components/MultiplayerLobby';

type Player = 'X' | 'O' | null;
type GameMode = 'menu' | 'bot' | 'friend' | 'online_lobby' | 'online_playing';
type PlayerRole = 'p1' | 'p2' | null;

interface TicTacToeProps {
  onGameOver: (score: number, result?: 'Win' | 'Loss' | 'Draw' | 'Completed') => void;
  onBack: () => void;
}

export default function TicTacToe({ onGameOver, onBack }: TicTacToeProps) {
  const [mode, setMode] = useState<GameMode>('menu');
  const [role, setRole] = useState<PlayerRole>(null);
  const [roomId, setRoomId] = useState<string>('');
  const [board, setBoard] = useState<Player[]>(Array(9).fill(null));
  const [isXNext, setIsXNext] = useState<boolean>(true); // X always goes first
  const [winner, setWinner] = useState<Player | 'Draw'>(null);
  const [score, setScore] = useState(0);

  useEffect(() => {
    if (mode !== 'friend' && mode !== 'online_playing') return;
    
    const unsubMove = mockBackend.subscribe('tictactoe_move', (data) => {
      setBoard(data.board);
      setIsXNext(data.isXNext);
      if (data.winner) setWinner(data.winner);
    });
    
    const unsubReset = mockBackend.subscribe('tictactoe_reset', () => {
      setBoard(Array(9).fill(null));
      setWinner(null);
      setIsXNext(true);
    });
    
    return () => {
      unsubMove();
      unsubReset();
    };
  }, [mode]);

  const checkWinner = (squares: Player[]) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
      [0, 4, 8], [2, 4, 6]             // diagonals
    ];
    for (let i = 0; i < lines.length; i++) {
      const [a, b, c] = lines[i];
      if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
        return squares[a];
      }
    }
    if (!squares.includes(null)) return 'Draw';
    return null;
  };

  const handleMove = (index: number) => {
    if (board[index] || winner) return;
    
    // If bot mode and not player's turn (X is player, O is bot)
    if (mode === 'bot' && !isXNext) return;
    
    // If online mode, check role
    if (mode === 'online_playing') {
      const isMyTurn = (role === 'p1' && isXNext) || (role === 'p2' && !isXNext);
      if (!isMyTurn) return;
    }

    const newBoard = [...board];
    newBoard[index] = isXNext ? 'X' : 'O';
    setBoard(newBoard);
    setIsXNext(!isXNext);

    const winStatus = checkWinner(newBoard);
    if (winStatus) {
      handleWin(winStatus);
    } else if (mode === 'bot') {
      setTimeout(() => botMove(newBoard), 600);
    }

    if (mode === 'friend' || mode === 'online_playing') {
      mockBackend.publish('tictactoe_move', {
        board: newBoard,
        isXNext: !isXNext,
        winner: winStatus
      });
    }
  };

  const botMove = (currentBoard: Player[]) => {
    const available = currentBoard.map((val, idx) => val === null ? idx : null).filter(val => val !== null) as number[];
    if (available.length === 0) return;

    // Simple random bot
    const randomIdx = available[Math.floor(Math.random() * available.length)];
    const newBoard = [...currentBoard];
    newBoard[randomIdx] = 'O';
    setBoard(newBoard);
    
    const winStatus = checkWinner(newBoard);
    if (winStatus) {
      handleWin(winStatus);
    } else {
      setIsXNext(true);
    }
  };

  const handleWin = (winStatus: Player | 'Draw') => {
    setWinner(winStatus);
    if (winStatus === 'X' && mode === 'bot') {
      setScore(s => s + 100);
    }
  };

  const resetGame = () => {
    setBoard(Array(9).fill(null));
    setWinner(null);
    setIsXNext(true);
    if (mode === 'friend' || mode === 'online_playing') {
      mockBackend.publish('tictactoe_reset', {});
    }
  };

  const handleExit = () => {
    let result: 'Win' | 'Loss' | 'Draw' | 'Completed' = 'Completed';
    if (winner === 'Draw') result = 'Draw';
    else if (winner === 'X') result = mode === 'bot' ? 'Win' : mode === 'online_playing' ? (role === 'p1' ? 'Win' : 'Loss') : 'Completed';
    else if (winner === 'O') result = mode === 'bot' ? 'Loss' : mode === 'online_playing' ? (role === 'p2' ? 'Win' : 'Loss') : 'Completed';
    
    onGameOver(score, result);
  };

  if (mode === 'online_lobby') {
    return (
      <MultiplayerLobby
        gameName="Tic Tac Toe"
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
          <button onClick={handleExit} className="text-gray-400 hover:text-white transition">Back</button>
        </div>
        
        <Grid3X3 className="w-24 h-24 text-purple-400 mb-6 drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]" />
        <h2 className="text-3xl font-black mb-10 text-center tracking-tight">Tic Tac Toe</h2>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          <button 
            onClick={() => setMode('bot')}
            className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold py-5 px-6 rounded-2xl shadow-[0_0_20px_rgba(59,130,246,0.3)] active:scale-95 transition-all flex items-center justify-center gap-3"
          >
            <Bot className="w-6 h-6" /> Play vs AI Bot
          </button>
          <button 
            onClick={() => setMode('friend')}
            className="bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-500 hover:to-pink-400 text-white font-bold py-5 px-6 rounded-2xl shadow-[0_0_20px_rgba(168,85,247,0.3)] active:scale-95 transition-all flex items-center justify-center gap-3"
          >
            <Users className="w-6 h-6" /> Local 1v1 Battle
          </button>
          <button 
            onClick={() => setMode('online_lobby')}
            className="bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold py-5 px-6 rounded-2xl shadow-[0_0_20px_rgba(79,70,229,0.3)] active:scale-95 transition-all flex items-center justify-center gap-3"
          >
            <Globe className="w-6 h-6" /> Online Multiplayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center p-6 h-full text-white bg-gradient-to-b from-[#1a2533] to-[#121922]">
      <div className="flex w-full justify-between items-center mb-8">
        <button onClick={handleExit} className="text-gray-400 hover:text-white transition">Exit Game</button>
        {mode === 'bot' && (
          <div className="flex items-center gap-2 bg-[#232e3c] px-4 py-2 rounded-full border border-purple-500/20">
            <Trophy className="w-4 h-4 text-yellow-400" />
            <span className="font-bold text-yellow-400">{score}</span>
          </div>
        )}
      </div>

      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
        {mode === 'bot' ? <Bot className="w-5 h-5 text-blue-400"/> : mode === 'online_playing' ? <Globe className="w-5 h-5 text-indigo-400" /> : <Users className="w-5 h-5 text-purple-400"/>} 
        {mode === 'bot' ? 'vs AI Bot' : mode === 'online_playing' ? `Online (You: ${role === 'p1' ? 'X' : 'O'})` : 'Local 1v1'}
      </h2>
      
      <div className="mb-6 h-8 text-center w-full">
        {winner ? (
           <span className={`text-2xl font-black block drop-shadow-md ${winner === 'X' ? 'text-blue-400' : winner === 'O' ? 'text-red-400' : 'text-gray-400'}`}>
            {winner === 'X' ? (mode === 'bot' ? 'You Win! (+100)' : mode === 'online_playing' ? (role === 'p1' ? 'You Win!' : 'Opponent Wins!') : 'Player X Wins!') : winner === 'O' ? (mode === 'bot' ? 'Bot Wins!' : mode === 'online_playing' ? (role === 'p2' ? 'You Win!' : 'Opponent Wins!') : 'Player O Wins!') : 'Draw!'}
          </span>
        ) : (
          <div className="flex justify-center items-center gap-2">
            <span className={`px-4 py-1 rounded-full text-sm font-bold ${isXNext ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
              {mode === 'bot' ? (isXNext ? 'Your Turn (X)' : 'Bot Thinking (O)') : mode === 'online_playing' ? ((role === 'p1' && isXNext) || (role === 'p2' && !isXNext) ? 'Your Turn' : 'Opponent Turn') : (isXNext ? 'Player 1 Turn (X)' : 'Player 2 Turn (O)')}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 bg-[#232e3c] p-4 rounded-3xl w-full max-w-[320px] shadow-2xl border border-gray-700/50">
        {board.map((cell, idx) => {
          const isMyTurnOnline = mode === 'online_playing' && ((role === 'p1' && isXNext) || (role === 'p2' && !isXNext));
          const canClick = !cell && !winner && (mode === 'friend' || (mode === 'bot' && isXNext) || isMyTurnOnline);
          
          return (
          <button
            key={idx}
            onClick={() => handleMove(idx)}
            disabled={!canClick}
            className={`w-full aspect-square bg-[#17212b] rounded-2xl flex items-center justify-center text-6xl font-black transition-all border-b-4 border-gray-800
              ${canClick ? 'hover:bg-[#1c2836] cursor-pointer hover:border-gray-700 active:border-b-0 active:translate-y-1' : 'cursor-default border-b-0 translate-y-1'}
              ${cell === 'X' ? 'text-blue-400 drop-shadow-[0_0_10px_rgba(96,165,250,0.5)]' : 'text-red-400 drop-shadow-[0_0_10px_rgba(248,113,113,0.5)]'}`}
          >
            {cell && (
              <motion.span initial={{ scale: 0, rotate: cell === 'X' ? -45 : 45 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
                {cell}
              </motion.span>
            )}
          </button>
        )})}
      </div>

      {winner && (
        <motion.button
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          onClick={resetGame}
          className="mt-12 bg-gray-100 text-gray-900 font-bold py-4 px-12 rounded-full w-full max-w-[300px] shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          <RefreshCw className="w-5 h-5" /> Play Next Round
        </motion.button>
      )}
    </div>
  );
}
