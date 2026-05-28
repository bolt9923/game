import React, { useState, useEffect, useCallback } from 'react';
import { Gamepad2, Trophy, User as UserIcon, LogOut, Medal, Star, Gift, Crown, Users, MessageSquare, Send, Sparkles, Gem, ArrowRight, Shield, Clock, Dices, CircleDot, Zap, Keyboard, HandMetal, Grid3X3, Link as LinkIcon, Smile, Bot, Globe, UserPlus, Swords, Copy, Check, Flame } from 'lucide-react';

import { motion, AnimatePresence } from 'motion/react';
import { ViewState, User, GameDef } from './types';
import { GAMES, MOCK_LEADERBOARD } from './data';
import { db, MatchHistoryEntry, Tournament } from './lib/db';
import ProfileSetup from './components/ProfileSetup';
import DailyBonus from './components/DailyBonus';
import FriendsPanel from './components/FriendsPanel';
import RoomHub from './components/RoomHub';
import { mpSession } from './lib/mpSession';
import { mockBackend } from './lib/mockBackend';
import type { RoomRow } from './lib/rooms';
import RockPaperScissors from './games/RockPaperScissors';
import TicTacToe from './games/TicTacToe';
import SpeedCatch from './games/SpeedCatch';
import WordGuess from './games/WordGuess';
import WordChain from './games/WordChain';
import EmojiQuiz from './games/EmojiQuiz';
import ChessGame from './games/Chess';
import Ludo from './games/Ludo';
import Carrom from './games/Carrom';

export default function App() {
  // ── First-login check ──────────────────────────────────
  const [isFirstLogin, setIsFirstLogin] = useState(() => db.isFirstLogin());

  // ── Core state ────────────────────────────────────────
  const [view, setView] = useState<ViewState>('home');
  const [currentUser, setCurrentUser] = useState<User>(() => db.getUser());
  const [matchHistory, setMatchHistory] = useState<MatchHistoryEntry[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);

  // ── Daily Bonus ────────────────────────────────────────
  // Show daily bonus only if: not first login AND can claim today
  const [showDaily, setShowDaily] = useState(false);
  const [showFriends, setShowFriends] = useState(false);

  const [showEmotePicker, setShowEmotePicker] = useState(false);
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [chatMessage, setChatMessage] = useState('');
  const [chatMessages, setChatMessages] = useState<{user: string, text: string, time: string}[]>([
    { user: 'vortex_boss', text: 'Anyone for a 1v1 Tic Tac Toe?', time: '10:41' },
    { user: 'alexh_gaming', text: 'Just hit 12k score!! 🚀', time: '10:43' },
    { user: 'ninja_pro', text: 'Word Seek level 10 is impossible lol', time: '10:45' }
  ]);
  const [copiedId, setCopiedId] = useState(false);

  useEffect(() => {
    setMatchHistory(db.getMatchHistory());
    setTournaments(db.getTournaments());
  }, [view]);

  // After profile setup done, check daily bonus
  const handleProfileDone = useCallback(() => {
    setIsFirstLogin(false);
    const fresh = db.getUser();
    setCurrentUser(fresh);
    // New users get starter bonus, not daily bonus (daily bonus shows next day)
    // Mark today so daily bonus won't show on first day
  }, []);

  // Check daily bonus on app load (after profile exists)
  useEffect(() => {
    if (!isFirstLogin) {
      // Show daily bonus if can claim today
      const canClaim = db.canClaimDailyBonus();
      if (canClaim) {
        // Small delay so app loads first
        const t = setTimeout(() => setShowDaily(true), 800);
        return () => clearTimeout(t);
      }
    }
  }, [isFirstLogin]);

  // ── Multiplayer launch ─────────────────────────────────────────────
  const handleRoomLaunch = useCallback((room: RoomRow, myRole: 'p1' | 'p2' | 'p3' | 'p4') => {
    mpSession.set({
      roomId: room.code,
      roomRowId: room.id,
      gameId: room.game_id,
      role: myRole,
      players: room.players,
      maxPlayers: room.max_players,
    });
    mockBackend.joinRoom(room.code);
    setActiveGame(room.game_id);
    setView('game');
  }, []);

  const startGame = (gameId: string) => {
    mpSession.clear();
    setActiveGame(gameId);
    setView('game');
  };

  const handleGameOver = (pointsEarned: number, result: 'Win' | 'Loss' | 'Draw' | 'Completed' = 'Completed') => {
    let updatedUser = { ...currentUser };
    if (pointsEarned > 0) {
      updatedUser = { ...updatedUser, score: updatedUser.score + pointsEarned };
      setCurrentUser(updatedUser);
    }
    db.saveUser(updatedUser);
    if (activeGame) {
      const gamedef = GAMES.find(g => g.id === activeGame);
      db.addMatch({ gameId: activeGame, gameName: gamedef?.title || activeGame, points: pointsEarned, result });
      setMatchHistory(db.getMatchHistory());
    }
    mockBackend.clearRoom().catch(() => {});
    mpSession.clear();
    setActiveGame(null);
    setView('home');
    // Refresh user (might have badges)
    setCurrentUser(db.getUser());
  };

  const handleDailyClose = () => {
    setShowDaily(false);
    // Refresh user coins/gems
    setCurrentUser(db.getUser());
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    setChatMessages([...chatMessages, {
      user: currentUser.username,
      text: chatMessage,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]);
    setChatMessage('');
    setShowEmotePicker(false);
  };

  const handleEmoteSelect = (emote: string) => {
    setChatMessages([...chatMessages, {
      user: currentUser.username,
      text: emote,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]);
    setShowEmotePicker(false);
  };

  const copyUserId = () => {
    if (currentUser.userId) {
      navigator.clipboard?.writeText(currentUser.userId).catch(() => {});
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const renderGame = () => {
    switch (activeGame) {
      case 'wordchain': return <WordChain onGameOver={handleGameOver} onBack={() => { setActiveGame(null); setView('home'); }} />;
      case 'emojiquiz': return <EmojiQuiz onGameOver={handleGameOver} onBack={() => { setActiveGame(null); setView('home'); }} />;
      case 'word': return <WordGuess onGameOver={handleGameOver} onBack={() => { setActiveGame(null); setView('home'); }} />;
      case 'rps': return <RockPaperScissors onGameOver={handleGameOver} onBack={() => { setActiveGame(null); setView('home'); }} />;
      case 'tictactoe': return <TicTacToe onGameOver={handleGameOver} onBack={() => { setActiveGame(null); setView('home'); }} />;
      case 'reaction': return <SpeedCatch onGameOver={handleGameOver} onBack={() => { setActiveGame(null); setView('home'); }} />;
      case 'ludo': return <Ludo onGameOver={handleGameOver} onBack={() => { setActiveGame(null); setView('home'); }} />;
      case 'chess': return <ChessGame onGameOver={handleGameOver} onBack={() => { setActiveGame(null); setView('home'); }} />;
      case 'carrom': return <Carrom onGameOver={handleGameOver} onBack={() => { setActiveGame(null); setView('home'); }} />;
      default: return null;
    }
  };

  const renderHome = () => (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
      className="p-4 pb-24 h-full overflow-y-auto"
    >
      {/* Header */}
      <header className="mb-6 flex justify-between items-center bg-[#1c2836] p-4 rounded-3xl border border-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.1)]">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg border border-purple-400/30">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white leading-tight">GameSphere</h1>
            <p className="text-blue-400 text-[10px] font-bold uppercase tracking-wider">Premium Hub</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-1.5 items-end">
            <div className="flex items-center gap-1.5 bg-[#17212b] px-2.5 py-1 rounded-full border border-yellow-500/20">
              <Trophy className="w-3 h-3 text-yellow-400" />
              <span className="text-xs font-bold text-yellow-400">{currentUser.score.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-[#17212b] px-2.5 py-1 rounded-full border border-pink-500/20">
              <Gem className="w-3 h-3 text-pink-400" />
              <span className="text-xs font-bold text-pink-400">{currentUser.gems}</span>
            </div>
          </div>
          {/* Daily bonus bell */}
          {db.canClaimDailyBonus() && (
            <button
              onClick={() => setShowDaily(true)}
              className="w-10 h-10 bg-amber-500/20 border border-amber-500/30 rounded-xl flex items-center justify-center hover:bg-amber-500/30 transition relative"
              title="Daily Bonus"
            >
              <Gift className="w-5 h-5 text-amber-400" />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border border-[#1c2836]" />
            </button>
          )}
        </div>
      </header>

      {/* User ID strip */}
      <div className="mb-4 bg-[#1c2836] rounded-2xl px-4 py-3 flex items-center justify-between border border-indigo-500/20">
        <div className="flex items-center gap-3">
          <img src={currentUser.avatar} className="w-8 h-8 rounded-full" alt="" />
          <div>
            <div className="text-sm font-bold text-white">{currentUser.name}</div>
            <div className="text-xs text-indigo-400 font-mono">@{currentUser.userId || 'GH????'}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={copyUserId} className="bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 p-2 rounded-lg transition">
            {copiedId ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setShowFriends(true)}
            className="bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 px-3 py-2 rounded-lg transition flex items-center gap-1 text-xs font-bold"
          >
            <UserPlus className="w-3.5 h-3.5" /> Friends
          </button>
        </div>
      </div>

      {/* Games list */}
      <h2 className="text-base font-semibold mb-3 text-gray-200 flex items-center gap-2">
        <Star className="w-4 h-4 text-blue-400" /> Games
      </h2>
      <div className="grid grid-cols-1 gap-3">
        {GAMES.map((game) => (
          <button
            key={game.id}
            onClick={() => startGame(game.id)}
            className="bg-[#232e3c] rounded-2xl p-4 hover:bg-[#2c394b] transition-all text-left flex items-start gap-4 group active:scale-[0.98] border border-gray-700/30 shadow-lg relative overflow-hidden"
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br ${game.color} shadow-inner`}>
              {game.icon === 'Link' && <LinkIcon className="w-6 h-6 text-white" />}
              {game.icon === 'Smile' && <Smile className="w-6 h-6 text-white" />}
              {game.icon === 'Keyboard' && <Keyboard className="w-6 h-6 text-white" />}
              {game.icon === 'HandMetal' && <HandMetal className="w-6 h-6 text-white" />}
              {game.icon === 'Grid3X3' && <Grid3X3 className="w-6 h-6 text-white" />}
              {game.icon === 'Zap' && <Zap className="w-6 h-6 text-white" />}
              {game.icon === 'Dices' && <Dices className="w-6 h-6 text-white" />}
              {game.icon === 'Crown' && <Crown className="w-6 h-6 text-white" />}
              {game.icon === 'CircleDot' && <CircleDot className="w-6 h-6 text-white" />}
              {!['Link','Smile','Keyboard','HandMetal','Grid3X3','Zap','Dices','Crown','CircleDot'].includes(game.icon) && <Gamepad2 className="w-6 h-6 text-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-base mb-0.5 group-hover:text-blue-400 transition-colors">{game.title}</h3>
              <p className="text-xs text-gray-400 leading-relaxed">{game.description}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-blue-400 transition-colors mt-1 shrink-0" />
          </button>
        ))}
      </div>
    </motion.div>
  );

  const renderLeaderboard = () => {
    // Use real user's actual name+id in leaderboard
    const realUser = db.getUser();
    const me: any = {
      ...realUser,
      id: realUser.id,
      name: realUser.name,
      username: realUser.userId || realUser.username,
      isCurrentUser: true,
    };
    const combined = [...MOCK_LEADERBOARD, me].sort((a, b) => b.score - a.score);

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="p-6 pb-24 h-full overflow-y-auto"
      >
        <header className="mb-8 text-center flex flex-col items-center">
          <div className="w-20 h-20 bg-gradient-to-br from-yellow-500/20 to-orange-500/20 rounded-full flex items-center justify-center mb-4 border border-yellow-500/30 shadow-[0_0_30px_rgba(234,179,8,0.15)] relative">
            <Crown className="w-10 h-10 text-yellow-400" />
            <Sparkles className="absolute top-2 right-2 w-4 h-4 text-orange-300 animate-pulse" />
          </div>
          <h1 className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-orange-400">Global Ranks</h1>
          <p className="text-gray-400 text-sm mt-1">Real-time Top Players</p>
        </header>

        <div className="bg-[#1c2836] rounded-3xl overflow-hidden shadow-2xl border border-gray-700/50">
          {combined.map((user: any, index: number) => (
            <div
              key={user.id}
              className={`flex items-center gap-3 p-4 border-b border-gray-800/80 last:border-0 hover:bg-[#232e3c] transition-colors ${
                user.isCurrentUser ? 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'
              }`}
            >
              <div className="w-7 text-center font-black text-gray-500 text-sm">
                {index === 0 ? <Medal className="w-5 h-5 mx-auto text-yellow-400 drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]" /> :
                 index === 1 ? <Medal className="w-5 h-5 mx-auto text-gray-300 drop-shadow-[0_0_8px_rgba(209,213,219,0.5)]" /> :
                 index === 2 ? <Medal className="w-5 h-5 mx-auto text-amber-700 drop-shadow-[0_0_8px_rgba(180,83,9,0.5)]" /> :
                 `#${index + 1}`}
              </div>
              <img src={user.avatar} className={`w-10 h-10 rounded-full bg-[#17212b] object-cover ${index < 3 ? 'ring-2 ring-offset-1 ring-offset-[#1c2836] ring-yellow-500' : ''}`} alt="" />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm flex items-center gap-1.5 text-gray-100">
                  {user.name}
                  {user.isCurrentUser && <span className="text-[9px] bg-blue-500 px-1.5 py-0.5 rounded uppercase tracking-wider font-bold">You</span>}
                </div>
                <div className="text-xs text-gray-500 font-mono flex items-center gap-1.5">
                  <span className="text-indigo-400">{user.isCurrentUser ? (user.userId || user.username) : user.username}</span>
                  {user.clan && <span className="text-emerald-400 flex items-center gap-0.5 bg-emerald-500/10 px-1 rounded-sm"><Shield className="w-2.5 h-2.5"/>{user.clan}</span>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <div className="font-mono font-black text-yellow-400 text-sm">{user.score.toLocaleString()}</div>
                <div className="flex items-center gap-0.5 text-xs text-pink-400"><Gem className="w-2.5 h-2.5" />{user.gems || 0}</div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    );
  };

  const renderSocial = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
      className="h-full flex flex-col bg-[#121922]"
    >
      <header className="p-4 bg-[#1c2836] border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="font-bold text-lg leading-tight">Global Chat</h2>
            <p className="text-xs text-gray-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> 1,240 online</p>
          </div>
        </div>
        <button onClick={() => setShowFriends(true)} className="bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition">
          <UserPlus className="w-3.5 h-3.5" /> Friends
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
        <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-2xl p-4 mb-4 shadow-lg">
          <h3 className="font-black text-emerald-400 mb-1 flex items-center gap-2"><Shield className="w-4 h-4"/> Clan Wars Active!</h3>
          <p className="text-sm text-gray-300">Join a clan and compete for the weekly prize pool of 50,000 Gems!</p>
          <button className="mt-3 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold py-2 px-4 rounded-lg active:scale-95 transition-all">Join Clan</button>
        </div>

        {chatMessages.map((msg, i) => {
          const isMe = msg.user === currentUser.username || msg.user === (currentUser as any).userId;
          return (
            <div key={i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-xs font-medium text-gray-400">@{msg.user}</span>
                <span className="text-[10px] text-gray-600">{msg.time}</span>
              </div>
              <div className={`px-4 py-2.5 rounded-2xl max-w-[85%] text-sm shadow-md ${
                isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-[#1c2836] text-gray-200 border border-gray-700/50 rounded-bl-none'
              }`}>
                {msg.text}
              </div>
            </div>
          );
        })}
      </div>

      <div className="absolute bottom-20 left-0 w-full p-4 bg-[#121922]/90 backdrop-blur-md border-t border-gray-800">
        {showEmotePicker && (
          <div className="absolute bottom-20 left-4 bg-[#232e3c] border border-gray-700 p-2 rounded-2xl shadow-xl flex gap-2">
            {['🔥','😂','😎','GG','WP','🎯','🏆','💀'].map(emote => (
              <button key={emote} onClick={() => handleEmoteSelect(emote)} className="hover:bg-[#2c394b] p-2 rounded-xl text-xl hover:scale-110 transition-transform active:scale-95">
                {emote}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={handleSendChat} className="flex gap-2">
          <button type="button" onClick={() => setShowEmotePicker(!showEmotePicker)} className="bg-[#1c2836] border border-gray-700 text-white w-10 h-10 rounded-full flex items-center justify-center shrink-0">
            <Smile className="w-5 h-5 text-yellow-400" />
          </button>
          <input
            type="text"
            value={chatMessage}
            onChange={(e) => setChatMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-[#1c2836] border border-gray-700 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors text-white"
          />
          <button type="submit" disabled={!chatMessage.trim()} className="bg-blue-600 text-white w-10 h-10 rounded-full flex items-center justify-center shrink-0 disabled:opacity-50 active:scale-95 transition-all">
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </motion.div>
  );

  const renderProfile = () => {
    const user = db.getUser();
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="p-6 pb-24 h-full overflow-y-auto flex flex-col items-center bg-gradient-to-b from-[#1a2533] to-[#121922]"
      >
        <div className="relative mb-4 mt-4">
          <div className="absolute inset-0 bg-blue-500 rounded-full blur-xl opacity-20" />
          <img src={user.avatar} className="w-28 h-28 rounded-full border-4 border-blue-500/50 shadow-2xl relative z-10" alt="Profile" />
          <div className="absolute bottom-0 right-0 bg-gradient-to-r from-yellow-400 to-amber-500 p-2 rounded-full border-4 border-[#17212b] z-20 shadow-lg">
            <Crown className="w-4 h-4 text-white" />
          </div>
        </div>

        <h2 className="text-2xl font-black text-white">{user.name}</h2>
        <div className="flex items-center gap-2 mt-1 mb-1">
          <span className="text-indigo-400 font-mono font-bold text-lg tracking-widest">{user.userId}</span>
          <button onClick={copyUserId} className="text-gray-500 hover:text-indigo-300 transition">
            {copiedId ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-gray-500 text-sm mb-4">@{user.username}</p>

        {user.clan && (
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-4 py-1.5 rounded-full mb-6">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-bold text-emerald-400">{user.clan}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 w-full max-w-sm mb-4">
          <div className="bg-[#232e3c] p-4 rounded-3xl flex flex-col items-center border border-gray-700/50 shadow-lg">
            <Trophy className="w-7 h-7 text-yellow-400 mb-1.5" />
            <span className="text-gray-400 text-xs uppercase tracking-wider mb-1">Score</span>
            <span className="text-xl font-black text-white">{user.score.toLocaleString()}</span>
          </div>
          <div className="bg-[#232e3c] p-4 rounded-3xl flex flex-col items-center border border-gray-700/50 shadow-lg">
            <Gem className="w-7 h-7 text-pink-400 mb-1.5" />
            <span className="text-gray-400 text-xs uppercase tracking-wider mb-1">Gems</span>
            <span className="text-xl font-black text-white">{user.gems.toLocaleString()}</span>
          </div>
        </div>

        {/* Daily bonus streak */}
        {(() => {
          const state = db.getDailyBonusState();
          if (state.streak > 0) return (
            <div className="w-full max-w-sm bg-[#1c2836] rounded-2xl p-4 mb-4 border border-amber-500/20 flex items-center gap-3">
              <Flame className="w-8 h-8 text-orange-400" />
              <div>
                <div className="font-black text-white">{state.streak} Day Streak! 🔥</div>
                <div className="text-xs text-gray-400">Kal aao aur streak maintain karo</div>
              </div>
              {db.canClaimDailyBonus() && (
                <button onClick={() => setShowDaily(true)} className="ml-auto bg-amber-500/20 text-amber-300 text-xs font-bold px-3 py-1.5 rounded-lg border border-amber-500/30 hover:bg-amber-500/30 transition">
                  Claim!
                </button>
              )}
            </div>
          );
          return null;
        })()}

        {/* Friends shortcut */}
        <div className="w-full max-w-sm mb-4">
          <button
            onClick={() => setShowFriends(true)}
            className="w-full bg-[#1c2836] rounded-2xl p-4 flex items-center gap-3 border border-indigo-500/20 hover:border-indigo-500/40 transition"
          >
            <div className="bg-indigo-500/20 p-2.5 rounded-xl"><Users className="w-5 h-5 text-indigo-400" /></div>
            <div className="text-left flex-1">
              <p className="font-bold text-gray-200">Friends</p>
              <p className="text-xs text-gray-500">User ID se dosto ko add karo</p>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Badges */}
        {user.badges && user.badges.length > 0 && (
          <div className="w-full max-w-sm bg-[#1c2836] rounded-3xl p-5 mb-4 border border-gray-800 shadow-xl">
            <h3 className="font-bold text-gray-300 mb-3 flex items-center gap-2"><Medal className="w-4 h-4 text-yellow-400"/> Badges</h3>
            <div className="flex flex-wrap gap-2">
              {user.badges.map(badge => (
                <div key={badge.id} className="bg-[#121922] border border-gray-700 p-2 rounded-xl flex items-center gap-2">
                  <span className="text-xl">{badge.icon}</span>
                  <span className={`text-xs font-bold ${badge.color}`}>{badge.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Match history */}
        <div className="w-full max-w-sm bg-[#1c2836] rounded-3xl p-5 mb-6 border border-gray-800 shadow-xl">
          <h3 className="font-bold text-gray-300 mb-4 flex items-center gap-2"><Clock className="w-4 h-4 text-indigo-400"/> Match History</h3>
          {matchHistory.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">Abhi tak koi match nahi khela.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {matchHistory.map((match) => (
                <div key={match.id} className="bg-[#121922] p-4 rounded-2xl flex items-center justify-between border border-gray-700/50">
                  <div>
                    <p className="font-bold text-gray-200 text-sm">{match.gameName}</p>
                    <p className="text-xs text-gray-500">{new Date(match.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={`text-sm font-black ${match.result === 'Win' ? 'text-green-400' : match.result === 'Loss' ? 'text-red-400' : match.result === 'Draw' ? 'text-gray-400' : 'text-blue-400'}`}>
                      {match.result}
                    </span>
                    {match.points > 0 && <span className="text-xs text-yellow-500 font-bold">+{match.points} pts</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <button className="w-full max-w-sm bg-red-500/10 text-red-400 p-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-red-500/20 transition-colors border border-red-500/20">
          <LogOut className="w-5 h-5" /> Disconnect WebApp
        </button>
      </motion.div>
    );
  };

  const renderTournaments = () => (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
      className="p-6 pb-24 h-full overflow-y-auto"
    >
      <header className="mb-8 text-center flex flex-col items-center">
        <div className="w-20 h-20 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-full flex items-center justify-center mb-4 border border-indigo-500/30 shadow-[0_0_30px_rgba(99,102,241,0.15)] relative">
          <Swords className="w-10 h-10 text-indigo-400" />
        </div>
        <h1 className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">Tournaments</h1>
        <p className="text-gray-400 text-sm mt-1">Compete for Massive Rewards</p>
      </header>

      <div className="grid gap-4">
        {tournaments.map((t) => {
          const registered = t.registeredPlayers.includes(currentUser.id);
          const isFull = t.registeredPlayers.length >= t.maxPlayers;
          return (
            <div key={t.id} className="bg-[#1c2836] border border-gray-700/50 p-5 rounded-3xl shadow-xl relative overflow-hidden">
              {registered && <div className="absolute top-0 right-0 bg-green-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl z-20">REGISTERED</div>}
              <h3 className="text-xl font-bold text-white mb-2">{t.title}</h3>
              <div className="flex gap-4 text-sm font-medium text-gray-400 mb-4">
                <div className="flex items-center gap-1"><Trophy className="w-4 h-4 text-yellow-400"/> Prize: {t.prizePool} pts</div>
                <div className="flex items-center gap-1"><Users className="w-4 h-4"/> {t.registeredPlayers.length}/{t.maxPlayers}</div>
              </div>
              <p className="text-xs text-gray-500 mb-4">Starts: {new Date(t.startTime).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
              <button
                disabled={registered || isFull}
                onClick={() => { if (db.registerForTournament(t.id, currentUser.id)) setTournaments(db.getTournaments()); }}
                className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                  registered ? 'bg-gray-800 text-green-400 border border-green-500/30' :
                  isFull ? 'bg-gray-800 text-gray-500 border border-gray-700' :
                  'bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_15px_rgba(79,70,229,0.3)] active:scale-95'
                }`}
              >
                {registered ? 'Registered ✓' : isFull ? 'Tournament Full' : `Enter - ${t.entryFee} pts`}
              </button>
            </div>
          );
        })}
      </div>
    </motion.div>
  );

  return (
    <div className="w-full min-h-screen bg-[#17212b] text-gray-100 font-sans selection:bg-blue-500/30">
      <div className="max-w-md mx-auto bg-[#17212b] h-screen shadow-2xl relative shadow-black/50 overflow-hidden flex flex-col sm:border-x sm:border-gray-800">

        {/* ── First Login Screen ── */}
        {isFirstLogin && <ProfileSetup onDone={handleProfileDone} />}

        {/* ── Daily Bonus Modal ── */}
        <AnimatePresence>
          {showDaily && !isFirstLogin && (
            <DailyBonus onClose={handleDailyClose} />
          )}
        </AnimatePresence>

        {/* ── Friends Panel ── */}
        <AnimatePresence>
          {showFriends && (
            <FriendsPanel onClose={() => { setShowFriends(false); setCurrentUser(db.getUser()); }} />
          )}
        </AnimatePresence>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="wait">
            {view === 'game' ? (
              <motion.div key="game" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                {renderGame()}
              </motion.div>
            ) : view === 'multiplayer' ? (
              <motion.div key="multiplayer" className="h-full">
                <RoomHub
                  me={{ id: db.getUser().id, name: db.getUser().name, avatar: db.getUser().avatar }}
                  onLaunch={handleRoomLaunch}
                  onBack={() => setView('home')}
                />
              </motion.div>
            ) : view === 'leaderboard' ? (
              <motion.div key="leaderboard" className="h-full">{renderLeaderboard()}</motion.div>
            ) : view === 'social' ? (
              <motion.div key="social" className="h-full">{renderSocial()}</motion.div>
            ) : view === 'tournaments' ? (
              <motion.div key="tournaments" className="h-full">{renderTournaments()}</motion.div>
            ) : view === 'profile' ? (
              <motion.div key="profile" className="h-full">{renderProfile()}</motion.div>
            ) : (
              <motion.div key="home" className="h-full">{renderHome()}</motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Nav */}
        {view !== 'game' && (
          <nav className="h-20 bg-[#232e3c] border-t border-gray-800 flex justify-around items-center px-2 pb-safe absolute bottom-0 w-full z-50">
            {[
              { id: 'home', icon: <Gamepad2 className="w-6 h-6" />, label: 'Games' },
              { id: 'leaderboard', icon: <Trophy className="w-6 h-6" />, label: 'Rankings' },
              { id: 'multiplayer', icon: <Globe className="w-6 h-6" />, label: 'Online' },
              { id: 'social', icon: <Users className="w-6 h-6" />, label: 'Social' },
              { id: 'tournaments', icon: <Swords className="w-6 h-6" />, label: 'Tourneys' },
              { id: 'profile', icon: <UserIcon className="w-6 h-6" />, label: 'Profile' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setView(tab.id as ViewState)}
                className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${view === tab.id ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
              >
                {tab.icon}
                <span className="text-[10px] font-medium tracking-wide">{tab.label}</span>
              </button>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
