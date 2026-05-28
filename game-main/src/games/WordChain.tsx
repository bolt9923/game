import React, { useState, useEffect, useRef } from 'react';
import { Trophy, Link as LinkIcon, Send, AlertCircle, Bot, User, Clock, Users, Gamepad2, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { mockBackend } from '../lib/mockBackend';
import MultiplayerLobby from '../components/MultiplayerLobby';

interface WordChainProps {
  onGameOver: (score: number, result?: 'Win' | 'Loss' | 'Draw' | 'Completed') => void;
  onBack: () => void;
}

type Message = {
  id: string;
  word: string;
  sender: 'player' | 'bot' | 'p2';
  isValid: boolean;
};

type GameMode = 'menu' | 'bot' | 'friend' | 'online_lobby' | 'online_playing';

const BOT_VOCABULARY: Record<string, string[]> = {
  a: ['APPLE', 'ANIMAL', 'AIRPLANE', 'AVOCADO', 'ALIEN'],
  b: ['BANANA', 'BOTTLE', 'BEAR', 'BRAIN', 'BASEBALL'],
  c: ['CAT', 'CLOUD', 'CANDY', 'CAKE', 'CARROT'],
  d: ['DOG', 'DRAGON', 'DOOR', 'DIAMOND', 'DANCE'],
  e: ['ELEPHANT', 'EAGLE', 'ENERGY', 'ENGINE', 'EARTH'],
  f: ['FIRE', 'FROG', 'FLOWER', 'FARM', 'FOREST'],
  g: ['GRAPE', 'GHOST', 'GIRAFFE', 'GAME', 'GOLD'],
  h: ['HAT', 'HOUSE', 'HEART', 'HORSE', 'HAPPY'],
  i: ['ICE', 'IGLOO', 'ISLAND', 'IDEA', 'IRON'],
  j: ['JUICE', 'JUMP', 'JUNGLE', 'JEWEL', 'JOKE'],
  k: ['KITE', 'KING', 'KANGAROO', 'KEY', 'KNIGHT'],
  l: ['LION', 'LEMON', 'LAKE', 'LIGHT', 'LOVE'],
  m: ['MONKEY', 'MOON', 'MAGIC', 'MOUNTAIN', 'MUSIC'],
  n: ['NIGHT', 'NATURE', 'NINJA', 'NOODLE', 'NOSE'],
  o: ['OCEAN', 'ORANGE', 'OWL', 'ONION', 'OASIS'],
  p: ['PIZZA', 'PENGUIN', 'PIRATE', 'PANDA', 'PIANO'],
  q: ['QUEEN', 'QUIZ', 'QUARTZ', 'QUILT', 'QUICK'],
  r: ['RABBIT', 'RIVER', 'ROBOT', 'ROCKET', 'RAIN'],
  s: ['SNAKE', 'SUN', 'STAR', 'SNOW', 'SPACE'],
  t: ['TIGER', 'TREE', 'TRAIN', 'TIME', 'TOY'],
  u: ['UMBRELLA', 'UNICORN', 'UNIVERSE', 'URBAN', 'UNIT'],
  v: ['VOLCANO', 'VAMPIRE', 'VALLEY', 'VICTORY', 'VOICE'],
  w: ['WATER', 'WIND', 'WOLF', 'WINTER', 'WORLD'],
  x: ['XYLOPHONE', 'XENON'],
  y: ['YACHT', 'YELLOW', 'YOUNG', 'YOGURT', 'YAWN'],
  z: ['ZEBRA', 'ZOMBIE', 'ZERO', 'ZONE', 'ZOO']
};

export default function WordChain({ onGameOver, onBack }: WordChainProps) {
  const [mode, setMode] = useState<GameMode>('menu');
  const [role, setRole] = useState<'p1' | 'p2' | null>(null);
  const [roomId, setRoomId] = useState('');
  const [turn, setTurn] = useState<'p1' | 'p2'>('p1');
  const [isChecking, setIsChecking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', word: 'TELEGRAM', sender: 'bot', isValid: true }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [score, setScore] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(15);
  const [isBotTurn, setIsBotTurn] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isBotTurn, turn]);

  useEffect(() => {
    if (mode !== 'friend' && mode !== 'online_playing') return;
    const unsub = mockBackend.subscribe('wordchain_sync_state', (data) => {
      setMessages(data.messages);
      setTurn(data.turn);
      setTimeLeft(15);
      if (data.gameOver) setGameOver(true);
      if (data.error) setError(data.error);
    });
    return () => unsub();
  }, [mode]);

  useEffect(() => {
    if (mode === 'menu' || gameOver || isChecking || (mode === 'bot' && isBotTurn)) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleTimeOut();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isBotTurn, gameOver, mode, isChecking, turn]);

  const handleTimeOut = () => {
    setGameOver(true);
    if (mode === 'bot') {
      setError('Time is up! You lose.');
    } else {
      const winner = turn === 'p1' ? 'Player 2' : 'Player 1';
      setError(`Time is up! ${winner} Wins!`);
      mockBackend.publish('wordchain_sync_state', { gameOver: true, error: `Time is up! ${winner} Wins!` });
    }
  };

  const getExpectedLetter = () => {
    const lastValidMsg = [...messages].reverse().find(m => m.isValid);
    if (!lastValidMsg) return 'T';
    return lastValidMsg.word.slice(-1).toUpperCase();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (gameOver || isChecking || !inputValue.trim()) return;
    if (mode === 'bot' && isBotTurn) return;
    if (mode === 'online_playing' && turn !== role) return;

    const word = inputValue.trim().toUpperCase();
    const expected = getExpectedLetter();

    // Validation
    if (word[0] !== expected) {
      setError(`Word must start with '${expected}'`);
      return;
    }
    if (word.length < 3) {
      setError('Word must be at least 3 letters long');
      return;
    }
    if (messages.some(m => m.word === word)) {
      setError('Word already used!');
      return;
    }
    if (!/^[A-Z]+$/.test(word)) {
      setError('Only letters allowed');
      return;
    }

    // Dictionary API check
    setIsChecking(true);
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
      if (!res.ok) {
        const data = await res.json();
        if (data.title === "No Definitions Found") {
          setError(`'${word}' is not a real dictionary word!`);
          setIsChecking(false);
          return;
        }
      }
    } catch (err) {
      console.warn("Dictionary API failed, allowing word:", word);
    }
    setIsChecking(false);
    setError(null);

    const newMessage: Message = { 
      id: Date.now().toString(), 
      word, 
      sender: mode === 'friend' && turn === 'p2' ? 'p2' : 'player', 
      isValid: true 
    };
    
    const newMessages = [...messages, newMessage];
    setMessages(newMessages);
    setInputValue('');
    
    if (mode === 'bot') {
      setScore(s => s + word.length * 10);
      setIsBotTurn(true);

      // Bot move
      setTimeout(async () => {
        const botResponseLetter = word.slice(-1).toUpperCase();
        let possibleWords = BOT_VOCABULARY[botResponseLetter.toLowerCase()] || ['BOT'];
        
        let unusedWords = possibleWords.filter(w => !newMessages.some(m => m.word === w) && w !== word);
        
        if (unusedWords.length === 0) {
          setGameOver(true);
          setError('Bot ran out of words! YOU WIN!');
          setScore(s => s + 500); // Bonus win
          setIsBotTurn(false);
          return;
        }

        const botWord = unusedWords[Math.floor(Math.random() * unusedWords.length)];
        setMessages(prev => [...prev, { id: Date.now().toString(), word: botWord, sender: 'bot', isValid: true }]);
        setIsBotTurn(false);
        setTimeLeft(15);
      }, 1000 + Math.random() * 1000);
    } else {
      // Multiplayer Update
      const nextTurn = turn === 'p1' ? 'p2' : 'p1';
      setTurn(nextTurn);
      setTimeLeft(15);
      
      mockBackend.publish('wordchain_sync_state', {
        messages: newMessages,
        turn: nextTurn,
      });
    }
  };

  if (mode === 'online_lobby') {
    return (
      <MultiplayerLobby
        gameName="Word Chain"
        gameId="wordchain"
        maxPlayers={2}
        onStartGame={(assignedRole, id) => {
          setRole(assignedRole);
          setRoomId(id);
          setMode('online_playing');
          setMessages([{ id: '1', word: 'GAME', sender: 'bot', isValid: true }]);
          setTurn('p1');
          setTimeLeft(15);
        }}
        onBack={() => setMode('menu')}
      />
    );
  }

  if (mode === 'menu') {
    return (
      <div className="flex flex-col items-center justify-center p-6 h-full text-white bg-gradient-to-b from-[#1a2533] to-[#121922]">
        <div className="absolute top-6 left-6">
          <button onClick={() => onGameOver(score, 'Completed')} className="text-gray-400 hover:text-white transition font-medium">Back</button>
        </div>
        
        <LinkIcon className="w-24 h-24 text-indigo-400 mb-6 drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
        <h2 className="text-3xl font-black mb-10 text-center tracking-tight">Word Chain</h2>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          <button 
            onClick={() => { setMode('bot'); setMessages([{ id: '1', word: 'TELEGRAM', sender: 'bot', isValid: true }]); }}
            className="bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold py-5 px-6 rounded-2xl shadow-[0_0_20px_rgba(99,102,241,0.3)] active:scale-95 transition-all flex items-center justify-center gap-3"
          >
            <Bot className="w-6 h-6" /> Play vs AI Bot
          </button>
          <button 
            onClick={() => { setMode('friend'); setMessages([{ id: '1', word: 'GAME', sender: 'bot', isValid: true }]); }}
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
    <div className="flex flex-col h-full bg-[#121922] text-white overflow-hidden relative">
      {/* Header */}
      <div className="flex w-full justify-between items-center p-4 bg-[#1c2836] border-b border-gray-800 z-10 shrink-0">
        <button onClick={() => onGameOver(score, 'Completed')} className="text-gray-400 hover:text-white transition font-medium">Quit</button>
        <div className="flex flex-col items-center">
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <LinkIcon className="w-5 h-5 text-indigo-400" /> Word Chain
          </h2>
          <span className="text-xs text-indigo-400 font-bold">
            {mode === 'bot' ? 'vs AI Master' : '1v1 Battle'}
          </span>
        </div>
        {mode === 'bot' && (
          <div className="flex items-center gap-1.5 bg-[#17212b] px-3 py-1 rounded-full border border-yellow-500/20 shadow-inner">
            <Trophy className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-sm font-bold text-yellow-400">{score}</span>
          </div>
        )}
      </div>

      {/* Main chat area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-32 flex flex-col relative w-full">
        {messages.map((msg, idx) => {
          const isPlayer = msg.sender === 'player' || (mode === 'friend' && msg.sender === 'p2');
          const isP1 = msg.sender === 'player';
          return (
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              key={msg.id} 
              className={`flex w-full ${isP1 ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex flex-col gap-1 max-w-[80%] ${isP1 ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-1.5 px-1">
                  {msg.sender === 'player' ? (
                     <><span className="text-[10px] text-gray-500 font-bold uppercase">{mode === 'friend' ? 'Player 1' : 'You'}</span><User className="w-3 h-3 text-blue-400"/></>
                  ) : msg.sender === 'p2' ? (
                     <><User className="w-3 h-3 text-pink-400"/><span className="text-[10px] text-gray-500 font-bold uppercase">Player 2</span></>
                  ) : (
                     <><Bot className="w-3 h-3 text-indigo-400"/><span className="text-[10px] text-indigo-400 font-bold uppercase">Bot</span></>
                  )}
                </div>
                <div className={`px-5 py-3 rounded-2xl shadow-md font-black tracking-wider text-lg ${
                  msg.sender === 'player' 
                    ? 'bg-blue-600/90 text-white rounded-br-sm border border-blue-500 shadow-[0_0_15px_rgba(37,99,235,0.2)]'
                    : msg.sender === 'p2'
                    ? 'bg-pink-600/90 text-white rounded-bl-sm border border-pink-500 shadow-[0_0_15px_rgba(219,39,119,0.2)]'
                    : 'bg-[#232e3c] text-indigo-100 rounded-bl-sm border border-indigo-500/30'
                }`}>
                  {msg.word.split('').map((letter, i, arr) => (
                    <span key={i} className={
                      i === arr.length - 1 && msg.sender === 'player' ? 'text-yellow-300' :
                      i === 0 && msg.sender !== 'player' ? 'text-indigo-400' : 
                      i === arr.length - 1 && msg.sender !== 'player' ? 'text-yellow-300' : ''
                    }>
                      {letter}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          );
        })}
        
        {isBotTurn && !gameOver && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex w-full justify-start mt-2">
            <div className="bg-[#232e3c] px-4 py-3 rounded-2xl rounded-bl-sm border border-indigo-500/30 flex items-center gap-2">
              <div className="flex gap-1">
                <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, delay: 0, duration: 0.6 }} className="w-2 h-2 rounded-full bg-indigo-400"></motion.div>
                <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, delay: 0.2, duration: 0.6 }} className="w-2 h-2 rounded-full bg-indigo-400"></motion.div>
                <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, delay: 0.4, duration: 0.6 }} className="w-2 h-2 rounded-full bg-indigo-400"></motion.div>
              </div>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="absolute bottom-0 left-0 w-full bg-[#1c2836]/90 backdrop-blur-md border-t border-gray-800 p-4 shrink-0 z-20">
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              className={`mb-3 py-1.5 px-3 rounded-lg text-sm text-center font-bold flex items-center justify-center gap-2 ${
                gameOver && error.includes('WIN') ? 'bg-green-500/20 text-green-400 border border-green-500/50' : 'bg-red-500/20 text-red-400 border border-red-500/50'
              }`}
            >
              <AlertCircle className="w-4 h-4" /> {error}
            </motion.div>
          )}
        </AnimatePresence>

        {gameOver ? (
          <button 
            onClick={() => {
              let res: 'Win' | 'Loss' | 'Completed' = 'Completed';
              if (error && error.includes('WIN')) res = 'Win';
              else if (error && error.includes('lose')) res = 'Loss';
              onGameOver(score, res);
            }}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-[0_0_15px_rgba(79,70,229,0.4)] active:scale-95 transition-all"
          >
            Claim Rewards & Exit
          </button>
        ) : (
          <div className="flex flex-col gap-2 relative">
             <div className="flex justify-between items-end px-1 pb-1">
               <span className="text-xs text-gray-400 font-bold flex items-center gap-1">
                 Start with: <span className="text-yellow-400 text-base bg-yellow-400/10 px-2 rounded-md">{getExpectedLetter()}</span>
               </span>
               <span className={`text-xs font-bold flex items-center gap-1 ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-gray-400'}`}>
                 <Clock className="w-3 h-3"/> {timeLeft}s
               </span>
             </div>
             
             <form onSubmit={handleSubmit} className="flex gap-2 relative">
              {isChecking && (
                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#1c2836]/90 p-2 rounded-xl text-xs font-bold text-indigo-400 flex items-center gap-2 z-10 whitespace-nowrap border border-indigo-500/30">
                   <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                   Checking Dictionary...
                 </div>
              )}
              <input 
                type="text" 
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value.toUpperCase())}
                disabled={isChecking || (mode === 'bot' && isBotTurn) || (mode === 'online_playing' && turn !== role)}
                placeholder={mode === 'online_playing' ? (turn === role ? "Your turn..." : "Waiting for opponent...") : mode === 'friend' ? `Type your word (Player ${turn === 'p1' ? '1' : '2'})...` : "Type your word..."}
                className="flex-1 bg-[#17212b] border border-gray-700 rounded-xl px-4 py-3 font-black tracking-wider focus:outline-none focus:border-indigo-500 transition-colors text-white disabled:opacity-50 uppercase"
                autoFocus
              />
              <button 
                type="submit" 
                disabled={isChecking || (mode === 'bot' && isBotTurn) || !inputValue.trim() || (mode === 'online_playing' && turn !== role)} 
                className="bg-indigo-600 text-white w-14 rounded-xl flex items-center justify-center shrink-0 disabled:opacity-50 disabled:bg-gray-700 active:scale-95 transition-all shadow-[0_0_15px_rgba(79,70,229,0.3)]"
              >
                <Send className="w-5 h-5 ml-1" />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
