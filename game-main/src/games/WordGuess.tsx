import React, { useState, useEffect } from 'react';
import { Trophy, HelpCircle, RefreshCcw, Sparkles, FastForward, Lightbulb, Keyboard } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const WORD_DB = {
  easy: [
    { word: 'APPLE', hint: 'A red or green fruit' },
    { word: 'GHOST', hint: 'Scary spirit' },
    { word: 'TIGER', hint: 'Big striped cat' },
    { word: 'WATER', hint: 'Clear liquid we drink' },
    { word: 'TRAIN', hint: 'Vehicle on tracks' },
    { word: 'HOUSE', hint: 'Where you live' },
    { word: 'CLOCK', hint: 'Tells the time' },
    { word: 'MOUSE', hint: 'Small rodent' },
    { word: 'SNAKE', hint: 'Slithering reptile' },
    { word: 'BREAD', hint: 'Baked food from dough' },
  ],
  medium: [
    { word: 'TELEGRAM', hint: 'A popular messaging app' },
    { word: 'PREMIUM', hint: 'High quality or paid tier' },
    { word: 'PUZZLE', hint: 'A game to test your brain' },
    { word: 'DIAMOND', hint: 'A precious, hard gemstone' },
    { word: 'PYTHON', hint: 'A programming language and a snake' },
    { word: 'GUITAR', hint: 'A stringed musical instrument' },
    { word: 'PLANET', hint: 'A large celestial body' },
    { word: 'DOCTOR', hint: 'Medical professional' },
    { word: 'ROCKET', hint: 'Space vehicle' },
    { word: 'CAMERA', hint: 'Takes photographs' },
  ],
  hard: [
    { word: 'DEVELOPER', hint: 'Someone who writes code' },
    { word: 'LEADERBOARD', hint: 'Table showing top scores' },
    { word: 'MULTIPLAYER', hint: 'Playing with others' },
    { word: 'CHALLENGE', hint: 'A difficult task or game' },
    { word: 'ALGORITHM', hint: 'Step by step instructions for computer' },
    { word: 'ADVENTURE', hint: 'An exciting experience' },
    { word: 'KNOWLEDGE', hint: 'Information and skills acquired' },
    { word: 'PHENOMENON', hint: 'An observable event' },
    { word: 'TECHNOLOGY', hint: 'Application of scientific knowledge' },
    { word: 'UNIVERSITY', hint: 'Higher education institution' },
  ]
};

type Difficulty = 'easy' | 'medium' | 'hard';
type ScreenState = 'menu' | 'playing';

interface WordGuessProps {
  onGameOver: (score: number) => void;
  onBack: () => void;
}

export default function WordGuess({ onGameOver, onBack }: WordGuessProps) {
  const [screen, setScreen] = useState<ScreenState>('menu');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [level, setLevel] = useState(0);
  const [score, setScore] = useState(0);
  const [currentWord, setCurrentWord] = useState('');
  const [hint, setHint] = useState('');
  const [scrambled, setScrambled] = useState<string[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [gameState, setGameState] = useState<'playing' | 'won' | 'lost'>('playing');

  const shuffle = (word: string) => {
    let arr = word.split('');
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const loadRandomWord = (diff: Difficulty) => {
    const list = WORD_DB[diff];
    const randomIndex = Math.floor(Math.random() * list.length);
    const { word, hint } = list[randomIndex];
    setCurrentWord(word);
    setHint(hint);
    
    let shuf = shuffle(word);
    while (shuf.join('') === word && word.length > 2) {
      shuf = shuffle(word);
    }
    setScrambled(shuf);
    setSelectedIndices([]);
    setGameState('playing');
  };

  const startGame = (diff: Difficulty) => {
    setDifficulty(diff);
    setLevel(1);
    setScore(0);
    setScreen('playing');
    loadRandomWord(diff);
  };

  const handleSkip = () => {
    if (gameState !== 'playing') return;
    setLevel(l => l + 1);
    loadRandomWord(difficulty);
  };

  const handleHint = () => {
    if (gameState !== 'playing') return;
    // Reveal first missing letter
    const targetLetter = currentWord[selectedIndices.length];
    if (!targetLetter) return;
    
    // Find index in scrambled that matches target and is not selected
    const scambledIndex = scrambled.findIndex((char, idx) => char === targetLetter && !selectedIndices.includes(idx));
    
    if (scambledIndex !== -1) {
      const newSelected = [...selectedIndices, scambledIndex];
      setSelectedIndices(newSelected);
      setScore(s => Math.max(0, s - 10)); // Cost 10 points
      
      checkWin(newSelected);
    }
  };

  const checkWin = (newSelected: number[]) => {
    if (newSelected.length === currentWord.length) {
      const attempt = newSelected.map(i => scrambled[i]).join('');
      if (attempt === currentWord) {
        setGameState('won');
        
        let multiplier = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3;
        setScore(s => s + (200 + (currentWord.length * 10)) * multiplier);
        
        setTimeout(() => {
          setLevel(l => l + 1);
          loadRandomWord(difficulty);
        }, 1500);
      } else {
        setGameState('lost');
        setTimeout(() => {
          setSelectedIndices([]);
          setGameState('playing');
        }, 1000);
      }
    }
  };

  const handleLetterClick = (index: number) => {
    if (gameState !== 'playing') return;
    if (selectedIndices.includes(index)) {
      setSelectedIndices(selectedIndices.filter(i => i !== index));
    } else {
      const newSelected = [...selectedIndices, index];
      setSelectedIndices(newSelected);
      checkWin(newSelected);
    }
  };

  if (screen === 'menu') {
    return (
      <div className="flex flex-col items-center justify-center p-6 h-full text-white bg-gradient-to-b from-[#1a2533] to-[#121922]">
        <div className="absolute top-6 left-6">
          <button onClick={() => onGameOver(score)} className="text-gray-400 hover:text-white transition font-medium">Back</button>
        </div>
        
        <Keyboard className="w-24 h-24 text-emerald-400 mb-6 drop-shadow-[0_0_15px_rgba(52,211,153,0.5)]" />
        <h2 className="text-3xl font-black mb-2 text-center tracking-tight text-white">Word Seek</h2>
        <p className="text-gray-400 mb-10 text-center text-sm">Select puzzle difficulty</p>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          <button 
            onClick={() => startGame('easy')}
            className="bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold py-5 px-6 rounded-2xl shadow-[0_0_20px_rgba(52,211,153,0.3)] active:scale-95 transition-all text-lg"
          >
            Easy (1x Rewards)
          </button>
          <button 
            onClick={() => startGame('medium')}
            className="bg-gradient-to-r from-blue-600 to-indigo-500 hover:from-blue-500 hover:to-indigo-400 text-white font-bold py-5 px-6 rounded-2xl shadow-[0_0_20px_rgba(59,130,246,0.3)] active:scale-95 transition-all text-lg"
          >
            Medium (2x Rewards)
          </button>
          <button 
            onClick={() => startGame('hard')}
            className="bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-500 hover:to-pink-400 text-white font-bold py-5 px-6 rounded-2xl shadow-[0_0_20px_rgba(168,85,247,0.3)] active:scale-95 transition-all text-lg"
          >
            Hard (3x Rewards)
          </button>
        </div>
      </div>
    );
  }

  const currentGuess = Array.from({ length: currentWord.length })
    .map((_, i) => (selectedIndices[i] !== undefined ? scrambled[selectedIndices[i]] : ''));

  return (
    <div className="flex flex-col items-center p-6 h-full text-white bg-gradient-to-b from-[#1a2533] to-[#121922]">
      <div className="flex w-full justify-between items-center mb-8">
        <button onClick={() => onGameOver(score)} className="text-gray-400 hover:text-white transition">Exit</button>
        <div className="flex items-center gap-2 bg-[#232e3c] px-4 py-2 rounded-full shadow border border-emerald-500/20">
          <Trophy className="w-4 h-4 text-emerald-400" />
          <span className="font-bold text-emerald-400">{score}</span>
        </div>
      </div>

      <div className="flex items-center justify-between w-full mb-8">
        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-300 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-emerald-400" /> Seek
        </h2>
        <span className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-sm font-bold border border-emerald-500/30">
          Lv {level} • {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
        </span>
      </div>

      <div className="bg-[#232e3c] p-4 rounded-xl w-full mb-8 flex items-start gap-3 border border-gray-700/50">
        <HelpCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <p className="text-gray-300 text-sm leading-relaxed font-medium">{hint}</p>
      </div>

      <div className="flex gap-2 mb-12 flex-wrap justify-center min-h-[60px]">
        {currentGuess.map((letter, idx) => (
          <motion.div 
            key={idx}
            animate={{ 
              y: gameState === 'lost' ? [0, -5, 5, -5, 5, 0] : gameState === 'won' ? [0, -10, 0] : 0,
              backgroundColor: gameState === 'lost' ? '#ef4444' : gameState === 'won' ? '#10b981' : '#17212b'
            }}
            transition={{ duration: gameState === 'won' ? 0.5 : 0.3, delay: gameState === 'won' ? idx * 0.1 : 0 }}
            className={`w-10 h-10 sm:w-12 sm:h-12 border-b-4 flex items-center justify-center text-xl sm:text-2xl font-black rounded
              ${letter ? 'border-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'border-gray-700 text-transparent'}`}
          >
            {letter}
          </motion.div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 justify-center max-w-sm">
        {scrambled.map((letter, idx) => {
          const isSelected = selectedIndices.includes(idx);
          return (
            <motion.button
              key={`${idx}-${level}-${currentWord}`}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: isSelected ? 0.8 : 1, opacity: isSelected ? 0.5 : 1 }}
              disabled={isSelected || gameState !== 'playing'}
              onClick={() => handleLetterClick(idx)}
              className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-b from-[#2b5278] to-[#203d59] rounded-xl flex items-center justify-center text-xl sm:text-2xl font-black shadow-[0_4px_0_rgba(18,34,51,1)] active:shadow-none active:translate-y-1 transition-all border border-[#3a6a9b]"
            >
              {letter}
            </motion.button>
          )
        })}
      </div>
      
      <div className="mt-auto mb-10 w-full flex justify-between gap-4 max-w-xs pt-8">
        <button 
          onClick={handleSkip}
          disabled={gameState !== 'playing'}
          className="flex-1 bg-[#232e3c] border border-gray-700 hover:border-gray-500 rounded-xl py-3 flex items-center justify-center gap-2 text-gray-300 font-bold active:scale-95 transition-all text-sm disabled:opacity-50"
        >
          <FastForward className="w-4 h-4" /> Skip
        </button>
        <button 
          onClick={handleHint}
          disabled={gameState !== 'playing'}
          className="flex-1 bg-[#10b981]/20 border border-emerald-500/50 hover:bg-[#10b981]/30 rounded-xl py-3 flex items-center justify-center gap-2 text-emerald-400 font-bold active:scale-95 transition-all text-sm disabled:opacity-50"
        >
          <Lightbulb className="w-4 h-4" /> Hint (-10)
        </button>
      </div>
      
      {gameState === 'playing' && selectedIndices.length > 0 && (
        <button 
          onClick={() => setSelectedIndices([])}
          className="absolute bottom-6 flex items-center gap-2 text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-4 py-2 rounded-full text-sm font-bold border border-emerald-500/20"
        >
          <RefreshCcw className="w-4 h-4" /> Clear Board
        </button>
      )}
    </div>
  );
}
