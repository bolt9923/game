import React, { useState } from 'react';
import { Bot, Users, Globe, ArrowLeft, Construction } from 'lucide-react';
import MultiplayerLobby from '../components/MultiplayerLobby';

interface PlaceholderProps {
  gameId: string;
  title: string;
  onBack: () => void;
  modes: { id: string; name: string; icon: React.ReactNode; color: string }[];
}

export default function GamePlaceholder({ gameId, title, onBack, modes }: PlaceholderProps) {
  const [mode, setMode] = useState('menu');

  if (mode === 'online_lobby') {
    return (
      <MultiplayerLobby
        gameName={title}
        onStartGame={() => setMode('playing')}
        onBack={() => setMode('menu')}
      />
    );
  }

  if (mode === 'playing') {
    return (
      <div className="flex flex-col items-center justify-center p-6 h-full text-white bg-gradient-to-b from-[#1a2533] to-[#121922]">
        <div className="absolute top-6 left-6">
          <button onClick={() => setMode('menu')} className="text-gray-400 hover:text-white transition flex items-center gap-2">
             <ArrowLeft className="w-4 h-4" /> Back to modes
          </button>
        </div>
        
        <Construction className="w-24 h-24 text-yellow-500 mb-6 drop-shadow-[0_0_15px_rgba(234,179,8,0.5)] animate-bounce" />
        <h2 className="text-3xl font-black mb-4 text-center text-white">{title}</h2>
        <div className="bg-[#232e3c] border border-gray-700 p-6 rounded-3xl max-w-sm text-center shadow-xl">
           <p className="text-gray-300 font-medium leading-relaxed">
             This game mode is currently under construction and will be deployed in an upcoming update! 
           </p>
           <p className="text-indigo-400 font-bold mt-4">
             Stay tuned for the 3D board experience.
           </p>
        </div>
        <button 
           onClick={onBack}
           className="mt-8 bg-[#17212b] border border-gray-700 hover:bg-[#1c2836] px-8 py-3 rounded-xl font-bold text-gray-300 transition-colors"
        >
          Exit to Hub
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-6 h-full text-white bg-gradient-to-b from-[#1a2533] to-[#121922]">
      <div className="absolute top-6 left-6">
        <button onClick={onBack} className="text-gray-400 hover:text-white transition">Back</button>
      </div>
      
      <h2 className="text-3xl font-black mb-10 text-center tracking-tight">{title}</h2>

      <div className="flex flex-col gap-4 w-full max-w-xs">
        {modes.map(m => (
          <button 
            key={m.id}
            onClick={() => setMode(m.id === 'online' ? 'online_lobby' : 'playing')}
            className={`bg-gradient-to-r ${m.color} text-white font-bold py-5 px-6 rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3`}
          >
            {m.icon} {m.name}
          </button>
        ))}
      </div>
    </div>
  );
}
