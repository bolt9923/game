import React, { useState } from 'react';
import { User, Hash, Sparkles, RefreshCw } from 'lucide-react';
import { db } from '../lib/db';

function randomUserId(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `GH${n}`;
}

interface Props {
  onDone: () => void;
}

export default function ProfileSetup({ onDone }: Props) {
  const [name, setName] = useState('');
  const [userId, setUserId] = useState(randomUserId());
  const [error, setError] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) { setError('Name kam se kam 2 characters ka hona chahiye'); return; }
    const id = userId.trim().toUpperCase();
    if (!/^GH\d{4,6}$/.test(id)) { setError('User ID format: GH1234 hona chahiye'); return; }
    db.createUser(name.trim(), id);
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#0a0e14] flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{animationDelay:'1s'}} />
      </div>

      <form onSubmit={submit} className="bg-[#1c2836] border border-indigo-500/30 rounded-3xl p-8 w-full max-w-sm shadow-2xl relative z-10">
        <div className="flex items-center justify-center mb-5">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500/30 to-purple-500/30 border-2 border-indigo-400/60 flex items-center justify-center shadow-[0_0_30px_rgba(99,102,241,0.3)]">
            <Sparkles className="w-9 h-9 text-indigo-300" />
          </div>
        </div>

        <h2 className="text-2xl font-black text-white text-center mb-1">Welcome to GameSphere!</h2>
        <p className="text-gray-400 text-center text-sm mb-6">Apna naam aur User ID set karo (sirf ek baar)</p>

        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Tumhara Naam</label>
        <div className="relative mb-4 mt-1">
          <User className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
            placeholder="Apna naam likho"
            maxLength={20}
            autoFocus
            className="w-full bg-[#121922] border border-gray-700 rounded-xl pl-10 pr-3 py-3 text-white focus:outline-none focus:border-indigo-500 transition"
          />
        </div>

        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">User ID (Friends ke liye)</label>
        <div className="relative mb-1 mt-1">
          <Hash className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={userId}
            onChange={e => { setUserId(e.target.value.toUpperCase()); setError(''); }}
            maxLength={8}
            className="w-full bg-[#121922] border border-gray-700 rounded-xl pl-10 pr-24 py-3 text-white font-mono tracking-widest focus:outline-none focus:border-indigo-500 transition"
          />
          <button
            type="button"
            onClick={() => setUserId(randomUserId())}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-indigo-600/30 text-indigo-300 px-2 py-1.5 rounded-lg hover:bg-indigo-600/50 flex items-center gap-1 transition"
          >
            <RefreshCw className="w-3 h-3" /> Random
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-5">Friends is ID se tumhe add karenge. Baad mein change nahi hoga.</p>

        {error && <p className="text-red-400 text-sm text-center font-bold mb-3 bg-red-500/10 rounded-lg py-2 px-3">{error}</p>}

        <button
          type="submit"
          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:brightness-110 text-white font-bold py-3.5 rounded-xl active:scale-95 transition shadow-[0_0_20px_rgba(99,102,241,0.3)] text-lg"
        >
          Game Shuru Karo! 🎮
        </button>

        <p className="text-center text-xs text-gray-600 mt-4">Starter Bonus: +500 Points & +100 Gems 🎁</p>
      </form>
    </div>
  );
}
