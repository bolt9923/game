import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Coins, Gift, Users, LogOut } from "lucide-react";
import { profileStore, dailyBonus, type Profile } from "../lib/profile";
import ProfileSetup from "../components/ProfileSetup";
import DailyBonus from "../components/DailyBonus";
import FriendsPanel from "../components/FriendsPanel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Gaming Hub" },
      { name: "description", content: "Play Carrom & Ludo with friends" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showBonus, setShowBonus] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const p = profileStore.get();
    setProfile(p);
    setReady(true);
    if (p && dailyBonus.canClaim()) {
      // Show only once per day, after profile exists
      setTimeout(() => setShowBonus(true), 400);
    }
  }, []);

  if (!ready) return <div className="min-h-screen bg-[#0a0e14]" />;

  if (!profile) {
    return <ProfileSetup onDone={p => { setProfile(p); setShowBonus(dailyBonus.canClaim()); }} />;
  }

  const logout = () => {
    if (confirm('Reset profile? This clears your local data.')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0e14] to-[#121922] text-white">
      {/* Top bar */}
      <div className="px-4 pt-4 flex items-center justify-between max-w-md mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-black text-lg">
            {profile.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-bold leading-tight">{profile.name}</div>
            <div className="text-xs text-gray-400 font-mono">{profile.userId}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-[#1c2836] border border-amber-500/30 rounded-full px-3 py-1.5 flex items-center gap-1.5">
            <Coins className="w-4 h-4 text-amber-400"/>
            <span className="font-black text-amber-300">{profile.coins}</span>
          </div>
          <button onClick={logout} className="text-gray-500 hover:text-red-400 p-2"><LogOut className="w-4 h-4"/></button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-4 mt-5 flex gap-3 max-w-md mx-auto">
        <button onClick={() => setShowFriends(true)}
          className="flex-1 bg-[#1c2836] border border-gray-700 hover:border-indigo-500 rounded-2xl p-3 flex items-center justify-center gap-2 transition">
          <Users className="w-5 h-5 text-indigo-400"/>
          <span className="font-bold">Friends</span>
        </button>
        <button onClick={() => setShowBonus(true)}
          className={`flex-1 rounded-2xl p-3 flex items-center justify-center gap-2 transition border ${
            dailyBonus.canClaim()
              ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-amber-400/50 animate-pulse'
              : 'bg-[#1c2836] border-gray-700'
          }`}>
          <Gift className="w-5 h-5 text-amber-400"/>
          <span className="font-bold">{dailyBonus.canClaim() ? 'Claim Bonus' : 'Bonus'}</span>
        </button>
      </div>

      {/* Games */}
      <div className="px-4 mt-8 max-w-md mx-auto">
        <h2 className="text-xs uppercase tracking-widest text-gray-500 font-bold mb-3">Games</h2>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => navigate({ to: '/carrom' })}
            className="aspect-square bg-gradient-to-br from-amber-500 to-orange-600 rounded-3xl p-4 flex flex-col justify-between text-left shadow-xl hover:scale-105 transition-transform">
            <div className="text-3xl">🎯</div>
            <div>
              <div className="font-black text-xl">Carrom</div>
              <div className="text-xs text-amber-100">Real rules</div>
            </div>
          </button>
          <button onClick={() => navigate({ to: '/ludo' })}
            className="aspect-square bg-gradient-to-br from-red-500 to-rose-600 rounded-3xl p-4 flex flex-col justify-between text-left shadow-xl hover:scale-105 transition-transform">
            <div className="text-3xl">🎲</div>
            <div>
              <div className="font-black text-xl">Ludo</div>
              <div className="text-xs text-rose-100">Multiplayer</div>
            </div>
          </button>
        </div>
      </div>

      {showBonus && <DailyBonus onClose={() => setShowBonus(false)} />}
      {showFriends && <FriendsPanel onClose={() => setShowFriends(false)} />}
    </div>
  );
}
