import React, { useState, useEffect } from 'react';
import { Trophy, HelpCircle, AlertCircle, Smile } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface EmojiQuizProps {
  onGameOver: (score: number) => void;
  onBack: () => void;
}

const QUIZZES = [
  { emojis: '🦇👨', answer: 'BATMAN', options: ['BATMAN', 'SPIDERMAN', 'DRACULA', 'VAMPIRE'] },
  { emojis: '🧊🚢', answer: 'TITANIC', options: ['ICE AGE', 'TITANIC', 'THE MEG', 'AVATAR'] },
  { emojis: '👑🦁', answer: 'LION KING', options: ['TARZAN', 'LION KING', 'JUNGLE BOOK', 'MADAGASCAR'] },
  { emojis: '🕷️👨', answer: 'SPIDERMAN', options: ['ANTMAN', 'SPIDERMAN', 'VENOM', 'IRONMAN'] },
  { emojis: '🧙‍♂️💍🌋', answer: 'LORD OF THE RINGS', options: ['HARRY POTTER', 'THE HOBBIT', 'LORD OF THE RINGS', 'NARNIA'] },
  { emojis: '👽🚲🌕', answer: 'ET', options: ['STAR WARS', 'ET', 'ALIEN', 'MEN IN BLACK'] },
  { emojis: '🤡🎈', answer: 'IT', options: ['JOKER', 'THE CIRCUS', 'IT', 'HALLOWEEN'] },
  { emojis: '🦖🏞️', answer: 'JURASSIC PARK', options: ['GODZILLA', 'JURASSIC PARK', 'KING KONG', 'TARZAN'] }
];

export default function EmojiQuiz({ onGameOver, onBack }: EmojiQuizProps) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [shuffledOptions, setShuffledOptions] = useState<string[]>([]);
  const [gameOver, setGameOver] = useState(false);

  useEffect(() => {
    if (currentQuestion < QUIZZES.length) {
      const options = [...QUIZZES[currentQuestion].options];
      setShuffledOptions(options.sort(() => Math.random() - 0.5));
      setSelectedAnswer(null);
      setIsCorrect(null);
    } else {
      setGameOver(true);
    }
  }, [currentQuestion]);

  const handleAnswer = (answer: string) => {
    if (selectedAnswer !== null) return;
    
    setSelectedAnswer(answer);
    const correct = answer === QUIZZES[currentQuestion].answer;
    setIsCorrect(correct);

    if (correct) {
      setScore(s => s + 150);
    }

    setTimeout(() => {
      if (currentQuestion + 1 >= QUIZZES.length) {
        setGameOver(true);
      } else {
        setCurrentQuestion(q => q + 1);
      }
    }, 1500);
  };

  if (gameOver) {
    return (
      <div className="flex flex-col items-center justify-center p-6 h-full text-white bg-gradient-to-b from-[#2a1717] to-[#121922]">
        <Trophy className="w-24 h-24 text-yellow-400 mb-6 drop-shadow-[0_0_15px_rgba(234,179,8,0.5)]" />
        <h2 className="text-3xl font-black mb-2 text-center text-yellow-400">Quiz Complete!</h2>
        <p className="text-gray-300 mb-10">You scored {score} points</p>
        
        <button 
          onClick={() => onGameOver(score)}
          className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white font-bold py-4 px-12 rounded-full w-full max-w-xs shadow-[0_0_20px_rgba(234,179,8,0.3)] active:scale-95 transition-all text-xl"
        >
          Claim Rewards
        </button>
      </div>
    );
  }

  const currentQ = QUIZZES[currentQuestion];

  return (
    <div className="flex flex-col items-center p-6 h-full text-white bg-[#121922]">
      <div className="flex w-full justify-between items-center mb-8 shrink-0">
        <button onClick={() => onGameOver(score)} className="text-gray-400 hover:text-white transition">Exit Game</button>
        <div className="flex items-center gap-2 bg-[#232e3c] px-4 py-2 rounded-full border border-orange-500/20 shadow-inner">
          <Trophy className="w-4 h-4 text-orange-400" />
          <span className="font-bold text-orange-400">{score}</span>
        </div>
      </div>

      <div className="flex items-center justify-between w-full mb-8">
        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-orange-400 flex items-center gap-2">
          <Smile className="w-6 h-6 text-yellow-400" /> Emoji Quiz
        </h2>
        <span className="bg-orange-500/20 text-orange-400 px-3 py-1 rounded-full text-sm font-bold border border-orange-500/30">
          {currentQuestion + 1} / {QUIZZES.length}
        </span>
      </div>

      <div className="flex-1 flex flex-col justify-center items-center w-full max-w-sm w-full gap-8">
        <p className="text-gray-400 font-bold uppercase tracking-widest text-sm text-center">Guess the Movie</p>
        
        <div className="bg-[#1c2836] p-8 rounded-3xl border border-gray-700/50 shadow-2xl w-full flex justify-center items-center h-48 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl"></div>
          
          <AnimatePresence mode="wait">
            <motion.div 
              key={currentQuestion}
              initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 1.5, opacity: 0, rotate: 10 }}
              transition={{ type: 'spring', damping: 15 }}
              className="text-6xl sm:text-7xl drop-shadow-2xl z-10"
            >
              {currentQ?.emojis}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="grid grid-cols-1 gap-3 w-full">
          {shuffledOptions.map((opt, idx) => {
            let btnClass = "bg-[#232e3c] border-gray-700 hover:bg-[#2a3a50] text-gray-200";
            
            if (selectedAnswer !== null) {
              if (opt === currentQ.answer) {
                btnClass = "bg-green-500/20 border-green-500 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.3)]";
              } else if (opt === selectedAnswer) {
                btnClass = "bg-red-500/20 border-red-500 text-red-400";
              }
            }

            return (
              <button
                key={idx}
                disabled={selectedAnswer !== null}
                onClick={() => handleAnswer(opt)}
                className={`w-full p-5 rounded-2xl border-2 font-bold transition-all text-left flex items-center justify-between group active:scale-[0.98] ${btnClass}`}
              >
                <span>{opt}</span>
                {selectedAnswer !== null && opt === currentQ.answer && (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}><Trophy className="w-5 h-5 text-green-400" /></motion.div>
                )}
                {selectedAnswer === opt && opt !== currentQ.answer && (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}><AlertCircle className="w-5 h-5 text-red-400" /></motion.div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  );
}
