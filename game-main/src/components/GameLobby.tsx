import React, { useState } from 'react';
import { Zap, Lock, Users, Cpu, ArrowLeft, UserPlus } from 'lucide-react';
import MultiplayerLobby from './MultiplayerLobby';
import { friendsStore } from './FriendsPanel';

export type LobbyMode = 'local' | 'bot' | 'quick' | 'private' | 'friend';

interface Props {
  gameName: string;
  onPick: (mode: LobbyMode, opts?: { friendId?: string; role?: 'p1'|'p2'; roomId?: string }) => void;
  onBack: () => void;
}

export default function GameLobby({ gameName, onPick, onBack }: Props) {
  const [view, setView] = useState<'menu' | 'multiplayer' | 'friend'>('menu');
  const friends = friendsStore.list();

  if (view === 'multiplayer') {
    return (
      <MultiplayerLobby
        gameName={gameName}
        onStartGame={(role, roomId) => onPick('private', { role, roomId })}
        onBack={() => setView('menu')}
      />
    );
  }

  if (view === 'friend') {
    return (
      <div className="flex flex-col items-center justify-center p-6 min-h-screen text-white bg-[#121922]">
        <div className="absolute top-6 left-6">
          <button onClick={() => setView('menu')} className="text-gray-400 hover:text-white flex items-center gap-1">
            <ArrowLeft className="w-4 h-4"/> Back
          </button>
        </div>
        <div className="w-14 h-14 rounded-2xl bg-pink-500/20 border border-pink-500/30 flex items-center justify-center mb-4">
          <UserPlus className="w-7 h-7 text-pink-400" />
        </div>
        <h2 className="text-2xl font-black mb-2">Friend Ko Invite Karo</h2>
        <p className="text-gray-500 text-sm mb-6">Kisi dost ke saath game khelo</p>
        {friends.length === 0 ? (
          <div className="text-center max-w-sm bg-[#1c2836] rounded-2xl p-6 border border-gray-700">
            <p className="text-gray-400 text-sm">Abhi koi dost nahi hai.</p>
            <p className="text-gray-500 text-xs mt-1">Home screen se User ID use karke dosto ko add karo.</p>
          </div>
        ) : (
          <div className="w-full max-w-sm flex flex-col gap-2">
            {friends.map(f => (
              <button
                key={f.userId}
                onClick={() => onPick('friend', { friendId: f.userId })}
                className="bg-[#1c2836] border border-gray-700 hover:border-pink-500/50 rounded-xl p-4 flex items-center justify-between transition group"
              >
                <div className="text-left">
                  <div className="font-bold text-white">{f.name}</div>
                  <div className="text-xs text-indigo-400 font-mono">{f.userId}</div>
                </div>
                <span className="text-pink-400 text-sm font-bold group-hover:translate-x-1 transition-transform">Invite →</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const opts: { mode: LobbyMode; icon: any; title: string; desc: string; color: string }[] = [
    { mode: 'local', icon: Users, title: 'Local 2 Players', desc: 'Ek hi device par 2 log khelo', color: 'from-emerald-500 to-teal-500' },
    { mode: 'bot', icon: Cpu, title: 'Vs Computer', desc: 'AI ke against practice karo', color: 'from-purple-500 to-fuchsia-500' },
    { mode: 'quick', icon: Zap, title: 'Quick Match', desc: 'Kisi random opponent se khelo', color: 'from-amber-500 to-orange-500' },
    { mode: 'private', icon: Lock, title: 'Private Room', desc: 'Code se room banao ya join karo', color: 'from-blue-500 to-indigo-500' },
    { mode: 'friend', icon: UserPlus, title: 'Dost ke saath khelo', desc: 'Friend list se invite bhejo', color: 'from-pink-500 to-rose-500' },
  ];

  return (
    <div className="flex flex-col items-center p-6 min-h-screen text-white bg-[#121922]">
      <div className="w-full max-w-md flex items-center justify-between mb-6 pt-4">
        <button onClick={onBack} className="text-gray-400 hover:text-white flex items-center gap-1">
          <ArrowLeft className="w-4 h-4"/> Home
        </button>
        <h2 className="text-xl font-black">{gameName}</h2>
        <div className="w-12" />
      </div>
      <p className="text-gray-500 text-sm mb-4">Game mode chuno</p>
      <div className="w-full max-w-md flex flex-col gap-3">
        {opts.map(o => (
          <button
            key={o.mode}
            onClick={() => {
              if (o.mode === 'private' || o.mode === 'quick') setView('multiplayer');
              else if (o.mode === 'friend') setView('friend');
              else onPick(o.mode);
            }}
            className={`bg-gradient-to-r ${o.color} p-[1px] rounded-2xl active:scale-[0.98] transition`}
          >
            <div className="bg-[#1c2836] rounded-2xl p-4 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${o.color} flex items-center justify-center flex-shrink-0`}>
                <o.icon className="w-6 h-6 text-white"/>
              </div>
              <div className="text-left flex-1">
                <div className="font-black text-white">{o.title}</div>
                <div className="text-xs text-gray-400">{o.desc}</div>
              </div>
              <span className="text-gray-500 text-lg">›</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
