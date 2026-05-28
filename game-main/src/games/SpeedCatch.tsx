import React, { useState, useEffect, useRef } from 'react';
import { Trophy, Zap, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface SpeedCatchProps {
  onGameOver: (score: number) => void;
  onBack: () => void;
}

type GameState = 'waiting' | 'ready' | 'clicked' | 'tooEarly';

export default function SpeedCatch({ onGameOver, onBack }: SpeedCatchProps) {
  const [gameState, setGameState] = useState<GameState>('waiting');
  const [reactionTime, setReactionTime] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  const startGame = () => {
    setGameState('waiting');
    setReactionTime(null);
    
    // Random delay between 1.5s and 5s
    const delay = Math.floor(Math.random() * 3500) + 1500;
    
    timeoutRef.current = setTimeout(() => {
      setGameState('ready');
      startTimeRef.current = Date.now();
    }, delay);
  };

  useEffect(() => {
    startGame();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleClick = () => {
    if (gameState === 'waiting') {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setGameState('tooEarly');
    } else if (gameState === 'ready') {
      const time = Date.now() - startTimeRef.current;
      setReactionTime(time);
      setGameState('clicked');
      
      // Calculate score based on speed. Faster = more points. Max 100 for < 200ms.
      let points = 0;
      if (time < 200) points = 100;
      else if (time < 300) points = 75;
      else if (time < 400) points = 50;
      else if (time < 600) points = 25;
      else points = 10;
      
      setScore(s => s + points);
    } else if (gameState === 'clicked' || gameState === 'tooEarly') {
      startGame();
    }
  };

  const finishGame = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    onGameOver(score);
  };

  return (
    <div className="flex flex-col h-full text-white bg-[#17212b]">
      <div className="flex w-full justify-between items-center p-6 pb-0">
        <button onClick={finishGame} className="text-gray-400 hover:text-white z-10 relative">Exit Game</button>
        <div className="flex items-center gap-2 bg-[#232e3c] px-4 py-2 rounded-full z-10 relative shadow-sm">
          <Trophy className="w-4 h-4 text-yellow-400" />
          <span className="font-bold text-yellow-400">{score}</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col p-6 items-center justify-center -mt-16">
        <h2 className="text-2xl font-bold mb-2">Speed Catch</h2>
        <p className="text-gray-400 mb-8 text-center max-w-[280px]">Wait for the screen to turn GREEN, then tap as fast as you can!</p>

        <button 
          onClick={handleClick}
          className={`w-full max-w-[320px] aspect-square rounded-[40px] flex flex-col items-center justify-center gap-4 transition-colors shadow-2xl active:scale-95 ${
            gameState === 'waiting' ? 'bg-[#2b5278] active:bg-[#34608b]' :
            gameState === 'ready' ? 'bg-green-500 active:bg-green-600 shadow-[0_0_50px_rgba(34,197,94,0.4)]' :
            gameState === 'tooEarly' ? 'bg-red-500 active:bg-red-600' :
            'bg-[#232e3c]'
          }`}
        >
          {gameState === 'waiting' && (
            <>
              <motion.div animate={{ opacity: [1, 0.5, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                <div className="w-16 h-16 rounded-full border-4 border-blue-300 border-t-transparent animate-spin mb-4" />
              </motion.div>
              <span className="text-2xl font-bold text-blue-200">Wait...</span>
            </>
          )}

          {gameState === 'ready' && (
            <>
              <Zap className="w-16 h-16 text-white mb-2" />
              <span className="text-4xl font-black text-white uppercase tracking-widest">Tap!</span>
            </>
          )}

          {gameState === 'tooEarly' && (
            <>
              <AlertCircle className="w-16 h-16 text-white mb-2" />
              <span className="text-2xl font-bold text-white">Too Early!</span>
              <span className="text-white/80">Tap to try again</span>
            </>
          )}

          {gameState === 'clicked' && (
            <>
              <Trophy className="w-12 h-12 text-yellow-400 mb-2" />
              <span className="text-4xl font-black text-white">{reactionTime}ms</span>
              <span className="text-blue-300 font-medium">Tap to play next round</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
