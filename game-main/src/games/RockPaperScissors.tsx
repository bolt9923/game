import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Hand, HandMetal, FileBadge2, Trophy, Users, Bot, Globe } from 'lucide-react';
import { mockBackend } from '../lib/mockBackend';
import MultiplayerLobby from '../components/MultiplayerLobby';

type Choice = 'rock' | 'paper' | 'scissors';
type GameMode = 'menu' | 'bot' | 'friend' | 'online_lobby' | 'online_playing';
type PlayerRole = 'p1' | 'p2' | null;

interface RPSProps {
  onGameOver: (score: number, result?: 'Win' | 'Loss' | 'Draw' | 'Completed') => void;
  onBack: () => void;
}

export default function RockPaperScissors({ onGameOver, onBack }: RPSProps) {
  const [mode, setMode] = useState<GameMode>('menu');
  const [role, setRole] = useState<PlayerRole>(null);
  const [roomId, setRoomId] = useState('');
  const [player1Choice, setPlayer1Choice] = useState<Choice | null>(null);
  const [player2Choice, setPlayer2Choice] = useState<Choice | null>(null);
  const [result, setResult] = useState<'p1_win' | 'p2_win' | 'draw' | null>(null);
  const [score, setScore] = useState(0);
  const [turnState, setTurnState] = useState<'p1' | 'p2_ready'>('p1');
  const [lastCompletedResult, setLastCompletedResult] = useState<'Win' | 'Loss' | 'Draw' | 'Completed'>('Completed');

  useEffect(() => {
    if (mode !== 'friend' && mode !== 'online_playing') return;
    const unsub = mockBackend.subscribe('rps_sync_state', (data) => {
      setPlayer1Choice(data.p1Choice);
      setPlayer2Choice(data.p2Choice);
      setResult(data.result);
      setTurnState(data.turnState);
      if (data.result) {
        if (data.result === 'draw') setLastCompletedResult('Draw');
        else if (data.result === 'p1_win') setLastCompletedResult('Win');
        else if (data.result === 'p2_win') setLastCompletedResult('Loss'); // simplistic logic
      }
    });
    return () => unsub();
  }, [mode]);

  const choices: Choice[] = ['rock', 'paper', 'scissors'];

  const evaluateWinner = (p1: Choice, p2: Choice) => {
    if (p1 === p2) return 'draw';
    if ((p1 === 'rock' && p2 === 'scissors') || (p1 === 'paper' && p2 === 'rock') || (p1 === 'scissors' && p2 === 'paper')) return 'p1_win';
    return 'p2_win';
  };

  const playBot = (choice: Choice) => {
    setPlayer1Choice(choice);
    const botPick = choices[Math.floor(Math.random() * choices.length)];
    setPlayer2Choice(botPick);
    
    const res = evaluateWinner(choice, botPick);
    setResult(res);
    if (res === 'draw') setLastCompletedResult('Draw');
    else if (res === 'p1_win') setLastCompletedResult('Win');
    else if (res === 'p2_win') setLastCompletedResult('Loss');
    if (res === 'p1_win') setScore(s => s + 50);
  };

  const playFriend = (choice: Choice) => {
    if (mode === 'online_playing') {
      if (role === 'p1' && turnState === 'p1') {
        setPlayer1Choice(choice);
        setTurnState('p2_ready');
        mockBackend.publish('rps_sync_state', {
          p1Choice: choice,
          p2Choice: player2Choice,
          result,
          turnState: 'p2_ready'
        });
      } else if (role === 'p2' && turnState === 'p2_ready') {
        setPlayer2Choice(choice);
        const res = evaluateWinner(player1Choice!, choice);
        setResult(res);
        
        let finalResult: 'Win' | 'Loss' | 'Draw' | 'Completed' = 'Completed';
        if (res === 'draw') finalResult = 'Draw';
        else if (res === 'p2_win') finalResult = 'Win';
        else finalResult = 'Loss';
        setLastCompletedResult(finalResult);

        if (res === 'p2_win') setScore(s => s + 50);
        mockBackend.publish('rps_sync_state', {
          p1Choice: player1Choice,
          p2Choice: choice,
          result: res,
          turnState: 'p2_ready'
        });
      }
      return;
    }

    if (turnState === 'p1') {
      setPlayer1Choice(choice);
      setTurnState('p2_ready');
      mockBackend.publish('rps_sync_state', {
        p1Choice: choice,
        p2Choice: player2Choice,
        result,
        turnState: 'p2_ready'
      });
    } else {
      setPlayer2Choice(choice);
      const res = evaluateWinner(player1Choice!, choice);
      setResult(res);
      if (res === 'p1_win') setScore(s => s + 50);
      setLastCompletedResult(res === 'p1_win' ? 'Win' : res === 'p2_win' ? 'Loss' : 'Draw');
      mockBackend.publish('rps_sync_state', {
        p1Choice: player1Choice,
        p2Choice: choice,
        result: res,
        turnState: 'p2_ready' // Doesn't matter since result is set
      });
    }
  };

  const handleExit = () => {
    onGameOver(score, lastCompletedResult);
  };

  const reset = () => {
    setPlayer1Choice(null);
    setPlayer2Choice(null);
    setResult(null);
    setTurnState('p1');
    if (mode === 'friend' || mode === 'online_playing') {
      mockBackend.publish('rps_sync_state', {
        p1Choice: null,
        p2Choice: null,
        result: null,
        turnState: 'p1'
      });
    }
  };

  const getIcon = (c: Choice) => {
    if (c === 'rock') return <Hand className="w-12 h-12" />;
    if (c === 'paper') return <FileBadge2 className="w-12 h-12" />;
    return <HandMetal className="w-12 h-12" />;
  };

  if (mode === 'online_lobby') {
    return (
      <MultiplayerLobby
        gameName="Rock Paper Scissors"
        gameId="rps"
        maxPlayers={2}
        onStartGame={(assignedRole, id) => {
          setRole(assignedRole);
          setRoomId(id);
          setMode('online_playing');
          reset();
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
        
        <HandMetal className="w-20 h-20 text-blue-400 mb-6 drop-shadow-[0_0_15px_rgba(96,165,250,0.5)]" />
        <h2 className="text-3xl font-black mb-10 text-center tracking-tight">RPS Battle</h2>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          <button 
            onClick={() => setMode('bot')}
            className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold py-5 px-6 rounded-2xl shadow-[0_0_20px_rgba(59,130,246,0.3)] active:scale-95 transition-all flex items-center justify-center gap-3"
          >
            <Bot className="w-6 h-6" /> vs AI Bot
          </button>
          <button 
            onClick={() => setMode('friend')}
            className="bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-500 hover:to-pink-400 text-white font-bold py-5 px-6 rounded-2xl shadow-[0_0_20px_rgba(168,85,247,0.3)] active:scale-95 transition-all flex items-center justify-center gap-3"
          >
            <Users className="w-6 h-6" /> Local 1v1
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
    <div className="flex flex-col items-center justify-center p-6 h-full text-white bg-gradient-to-b from-[#1a2533] to-[#121922]">
      <div className="flex w-full justify-between items-center mb-8">
        <button onClick={handleExit} className="text-gray-400 hover:text-white transition">Exit Game</button>
        <div className="flex items-center gap-2 bg-[#232e3c] px-4 py-2 rounded-full border border-blue-500/20">
          <Trophy className="w-4 h-4 text-yellow-400" />
          <span className="font-bold text-yellow-400">{score}</span>
        </div>
      </div>

      <h2 className="text-2xl font-bold mb-10 text-center flex items-center gap-2">
        {mode === 'bot' ? <Bot className="w-6 h-6 text-blue-400"/> : <Users className="w-6 h-6 text-purple-400"/>} 
        {mode === 'bot' ? 'vs Bot' : 'vs Friend'}
      </h2>

      {!result && mode === 'online_playing' ? (
        <div className="flex flex-col items-center space-y-6 w-full max-w-sm">
          {((role === 'p1' && turnState === 'p1') || (role === 'p2' && turnState === 'p2_ready')) ? (
            <>
              <p className="text-blue-400 font-bold mb-4 bg-blue-500/10 px-6 py-2 rounded-full border border-blue-500/30">
                It's your turn! Make a choice.
              </p>
              <div className="grid grid-cols-3 gap-4 w-full">
                {choices.map(c => (
                  <button 
                    key={c}
                    onClick={() => playFriend(c)}
                    className="bg-[#2b5278] hover:bg-[#34608b] p-6 rounded-2xl flex flex-col items-center justify-center gap-3 transition-colors shadow-lg active:scale-95 border border-[#3a6a9b]"
                  >
                    {c === 'rock' && <Hand className="w-10 h-10 text-blue-300" />}
                    {c === 'paper' && <FileBadge2 className="w-10 h-10 text-blue-300" />}
                    {c === 'scissors' && <HandMetal className="w-10 h-10 text-blue-300" />}
                    <span className="text-sm font-medium capitalize">{c}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-purple-400 font-bold mb-4 bg-purple-500/10 px-6 py-2 rounded-full border border-purple-500/30">
              Waiting for opponent...
            </p>
          )}
        </div>
      ) : !result && mode === 'friend' && turnState === 'p2_ready' ? (
        <div className="flex flex-col items-center space-y-6 w-full max-w-sm">
           <p className="text-purple-400 font-bold mb-4 bg-purple-500/10 px-6 py-2 rounded-full border border-purple-500/30">Player 2 is choosing hidden...</p>
           <div className="grid grid-cols-3 gap-4 w-full">
            {choices.map(c => (
               <button 
                key={`p2-${c}`}
                onClick={() => playFriend(c)}
                className="bg-[#2b5278] p-6 rounded-2xl flex flex-col items-center justify-center gap-3 transition-colors shadow-lg active:scale-95 border border-[#3a6a9b]"
              >
                <div className="w-10 h-10 text-gray-500 flex items-center justify-center text-3xl">?</div>
                <span className="text-sm font-medium">Select</span>
              </button>
            ))}
           </div>
        </div>
      ) : !player1Choice || (mode === 'friend' && !player2Choice) ? (
        <div className="flex flex-col items-center space-y-6 w-full max-w-sm">
          <p className="text-blue-400 font-bold mb-4 bg-blue-500/10 px-6 py-2 rounded-full border border-blue-500/30">
            {mode === 'friend' ? 'Player 1 Turn' : 'Make your choice!'}
          </p>
          <div className="grid grid-cols-3 gap-4 w-full">
            {choices.map(c => (
              <button 
                key={c}
                onClick={() => mode === 'bot' ? playBot(c) : playFriend(c)}
                className="bg-[#2b5278] hover:bg-[#34608b] p-6 rounded-2xl flex flex-col items-center justify-center gap-3 transition-colors shadow-lg active:scale-95 border border-[#3a6a9b]"
              >
                {c === 'rock' && <Hand className="w-10 h-10 text-blue-300" />}
                {c === 'paper' && <FileBadge2 className="w-10 h-10 text-blue-300" />}
                {c === 'scissors' && <HandMetal className="w-10 h-10 text-blue-300" />}
                <span className="text-sm font-medium capitalize">{c}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center w-full"
        >
          <div className="flex justify-between w-full max-w-xs mb-8">
            <div className="flex flex-col items-center gap-2">
              <span className="text-blue-400 font-bold text-sm">{mode === 'friend' ? 'Player 1' : 'You'}</span>
              <div className="w-24 h-24 bg-[#2b5278] rounded-2xl flex items-center justify-center text-blue-300 shadow-inner border border-blue-500/30">
                {getIcon(player1Choice)}
              </div>
            </div>
            
            <div className="flex items-center justify-center">
              <span className="text-2xl font-black text-gray-600 block px-4 italic">VS</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <span className="text-red-400 font-bold text-sm">{mode === 'friend' ? 'Player 2' : 'Bot'}</span>
              <div className="w-24 h-24 bg-[#232e3c] rounded-2xl flex items-center justify-center text-red-300 shadow-inner border border-red-500/20">
                {player2Choice && getIcon(player2Choice)}
              </div>
            </div>
          </div>

          <div className="text-center my-8">
            <h3 className={`text-5xl font-black uppercase tracking-wider mb-2 drop-shadow-lg ${
              result === 'p1_win' ? 'text-green-400' : 
              result === 'p2_win' ? 'text-red-400' : 
              'text-gray-400'
            }`}>
              {result === 'p1_win' ? (mode === 'bot' ? 'You Win!' : 'P1 Wins!') : 
               result === 'p2_win' ? (mode === 'bot' ? 'You Lose!' : 'P2 Wins!') : 'Draw!'}
            </h3>
            {result === 'p1_win' && mode === 'bot' && <p className="text-green-300 font-bold">+50 Points</p>}
          </div>

          <button 
            onClick={reset}
            className="bg-gray-100 text-gray-900 font-bold py-4 px-12 rounded-full w-full max-w-xs shadow-lg active:scale-95 transition-all"
          >
            Play Next Round
          </button>
        </motion.div>
      )}
    </div>
  );
}
