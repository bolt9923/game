import React, { useState } from 'react';
import { Gift, X, Trophy, Gem, Check, Flame } from 'lucide-react';
import { db } from '../lib/db';

const REWARDS = [25, 50, 75, 100, 150, 200, 300];

export default function DailyBonus({ onClose }: { onClose: () => void }) {
  const [claimed, setClaimed] = useState(false);
  const [earnedReward, setEarnedReward] = useState(0);
  const state = db.getDailyBonusState();
  const streakDay = state.streak % REWARDS.length;
  const nextReward = REWARDS[streakDay];

  const claim = () => {
    const got = db.claimDailyBonus();
    if (got > 0) {
      setEarnedReward(got);
      setClaimed(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-gradient-to-b from-[#2a3a50] to-[#1c2836] rounded-3xl p-8 max-w-sm w-full border border-yellow-500/30 shadow-[0_0_50px_rgba(234,179,8,0.2)] text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500" />

        {/* Close button */}
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white transition">
          <X className="w-5 h-5" />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className={`w-20 h-20 rounded-full border-2 flex items-center justify-center ${claimed ? 'bg-green-500/20 border-green-400' : 'bg-amber-500/20 border-amber-400 animate-bounce'}`}>
            {claimed
              ? <Check className="w-10 h-10 text-green-400" />
              : <Gift className="w-10 h-10 text-amber-400" />
            }
          </div>
        </div>

        <h2 className="text-2xl font-black text-white mb-1">
          {claimed ? 'Bonus Mil Gaya! 🎉' : 'Daily Bonus!'}
        </h2>
        <p className="text-gray-400 text-sm mb-5">
          {claimed
            ? 'Kal wapas aao aur zyada bonus lo!'
            : `Streak Day ${streakDay + 1} ka reward`}
        </p>

        {/* Streak calendar */}
        <div className="grid grid-cols-7 gap-1 mb-5">
          {REWARDS.map((r, i) => {
            const done = i < streakDay || (claimed && i === streakDay);
            const current = !claimed && i === streakDay;
            return (
              <div key={i} className={`rounded-lg py-2 text-center text-xs font-bold border transition-all ${
                done
                  ? 'bg-green-500/20 border-green-500/40 text-green-300'
                  : current
                  ? 'bg-amber-500/20 border-amber-400 text-amber-300 scale-110 shadow-[0_0_8px_rgba(251,191,36,0.4)]'
                  : 'bg-[#0a0e14] border-gray-700 text-gray-500'
              }`}>
                <div>{done ? '✓' : `D${i+1}`}</div>
                <div className="text-[10px]">{r}</div>
              </div>
            );
          })}
        </div>

        {/* Reward preview */}
        <div className="bg-[#17212b] rounded-2xl py-4 px-6 mb-5 flex justify-around items-center border border-gray-800">
          <div className="flex flex-col items-center gap-1">
            <Trophy className="w-5 h-5 text-yellow-400" />
            <span className="text-2xl font-black text-yellow-400">+{claimed ? earnedReward * 10 : nextReward * 10}</span>
            <span className="text-xs text-gray-500">Points</span>
          </div>
          <div className="w-px h-10 bg-gray-700" />
          <div className="flex flex-col items-center gap-1">
            <Gem className="w-5 h-5 text-pink-400" />
            <span className="text-2xl font-black text-pink-400">+{claimed ? Math.floor(earnedReward / 5) : Math.floor(nextReward / 5)}</span>
            <span className="text-xs text-gray-500">Gems</span>
          </div>
          {state.streak > 0 && (
            <>
              <div className="w-px h-10 bg-gray-700" />
              <div className="flex flex-col items-center gap-1">
                <Flame className="w-5 h-5 text-orange-400" />
                <span className="text-2xl font-black text-orange-400">{state.streak}</span>
                <span className="text-xs text-gray-500">Streak</span>
              </div>
            </>
          )}
        </div>

        {claimed ? (
          <button
            onClick={onClose}
            className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3.5 rounded-2xl active:scale-95 transition text-lg"
          >
            Shukriya! 🙌
          </button>
        ) : (
          <button
            onClick={claim}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:brightness-110 text-white font-bold py-3.5 rounded-2xl active:scale-95 transition shadow-[0_0_20px_rgba(251,191,36,0.3)] text-lg"
          >
            Reward Claim Karo! 🎁
          </button>
        )}
      </div>
    </div>
  );
}
