import React, { useEffect, useState } from 'react';
import { UserPlus, X, Check, Clock, Trash2, Copy, Users, Send, Search } from 'lucide-react';
import { db } from '../lib/db';

interface Friend {
  userId: string;
  name: string;
  addedAt: number;
  status?: 'online' | 'offline';
}

interface FriendRequest {
  userId: string;
  name: string;
  status: 'pending' | 'accepted';
  at: number;
}

const FRIENDS_KEY = 'gh_friends_v1';
const REQUESTS_KEY = 'gh_friend_requests_v1';

const friendsStore = {
  list(): Friend[] {
    try { return JSON.parse(localStorage.getItem(FRIENDS_KEY) || '[]'); } catch { return []; }
  },
  requests(): FriendRequest[] {
    try { return JSON.parse(localStorage.getItem(REQUESTS_KEY) || '[]'); } catch { return []; }
  },
  sendRequest(userId: string): { ok: boolean; error?: string } {
    const id = userId.trim().toUpperCase();
    const me = db.getUser();
    if (!id) return { ok: false, error: 'User ID daalna zaroori hai' };
    if (id === me.userId) return { ok: false, error: 'Apne aap ko add nahi kar sakte 😄' };
    if (!/^GH\d{3,6}$/.test(id)) return { ok: false, error: 'User ID format galat hai (e.g. GH1234)' };
    if (this.list().some(f => f.userId === id)) return { ok: false, error: 'Ye pehle se hi tumhara dost hai!' };
    const reqs = this.requests();
    if (reqs.some(r => r.userId === id)) return { ok: false, error: 'Request pehle se bheji ja chuki hai' };
    reqs.push({ userId: id, name: `Player ${id}`, status: 'pending', at: Date.now() });
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(reqs));
    // Auto-accept after 4 seconds for demo
    setTimeout(() => {
      const r2 = this.requests().filter(r => r.userId !== id);
      localStorage.setItem(REQUESTS_KEY, JSON.stringify(r2));
      const friends = this.list();
      if (!friends.some(f => f.userId === id)) {
        friends.push({ userId: id, name: `Player ${id}`, addedAt: Date.now() });
        localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends));
      }
    }, 4000);
    return { ok: true };
  },
  remove(userId: string) {
    const friends = this.list().filter(f => f.userId !== userId);
    localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends));
  },
};

export { friendsStore };

export default function FriendsPanel({ onClose }: { onClose: () => void }) {
  const [tick, setTick] = useState(0);
  const [input, setInput] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState<'friends' | 'add'>('friends');
  const me = db.getUser();

  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 2000);
    return () => clearInterval(iv);
  }, []);

  void tick;

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const res = friendsStore.sendRequest(input);
    if (res.ok) { setMsg({ ok: true, text: '✓ Request bheji gayi! 4 sec mein accept hogi (demo)' }); setInput(''); }
    else setMsg({ ok: false, text: res.error || 'Error' });
    setTimeout(() => setMsg(null), 3000);
  };

  const copyId = () => {
    if (me?.userId) {
      navigator.clipboard?.writeText(me.userId).catch(() => {});
      setMsg({ ok: true, text: '✓ ID copy ho gayi!' });
      setTimeout(() => setMsg(null), 1500);
    }
  };

  const friends = friendsStore.list();
  const requests = friendsStore.requests();

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#1c2836] border border-indigo-500/30 rounded-3xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" /> Friends
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* My ID Card */}
        <div className="mx-5 mt-4 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 rounded-2xl p-4 flex items-center justify-between border border-indigo-500/20">
          <div>
            <div className="text-xs text-gray-500 font-medium">Tumhara User ID</div>
            <div className="text-2xl font-mono font-black text-indigo-300 tracking-widest">{me?.userId || 'GH????'}</div>
            <div className="text-xs text-gray-400 mt-0.5">{me?.name}</div>
          </div>
          <button
            onClick={copyId}
            className="bg-indigo-600/40 hover:bg-indigo-600/60 text-indigo-300 p-3 rounded-xl border border-indigo-500/30 transition flex items-center gap-2"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex mx-5 mt-4 bg-[#121922] rounded-xl p-1 gap-1">
          <button
            onClick={() => setTab('friends')}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${tab === 'friends' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            Friends ({friends.length})
          </button>
          <button
            onClick={() => setTab('add')}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${tab === 'add' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            + Add Friend
          </button>
        </div>

        <div className="p-5">
          {tab === 'add' && (
            <div>
              <p className="text-sm text-gray-400 mb-4">Dost ka GH ID daalo (e.g. GH1234) aur request bhejo</p>
              <form onSubmit={send} className="flex gap-2 mb-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={input}
                    onChange={e => setInput(e.target.value.toUpperCase())}
                    placeholder="GH1234"
                    maxLength={8}
                    className="w-full bg-[#121922] border border-gray-700 rounded-xl pl-9 pr-3 py-3 text-white font-mono tracking-widest focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
                <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 rounded-xl flex items-center gap-1 transition">
                  <Send className="w-4 h-4" />
                </button>
              </form>
              {msg && (
                <p className={`text-sm font-bold mb-3 p-2 rounded-lg ${msg.ok ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}>
                  {msg.text}
                </p>
              )}

              {requests.length > 0 && (
                <div className="mt-4">
                  <div className="text-xs font-bold uppercase text-gray-500 mb-2">Pending Requests ({requests.length})</div>
                  {requests.map(r => (
                    <div key={r.userId} className="bg-[#121922] rounded-xl p-3 flex items-center justify-between mb-2 border border-amber-500/20">
                      <div>
                        <div className="font-bold text-white text-sm">{r.name}</div>
                        <div className="text-xs text-gray-500 font-mono">{r.userId}</div>
                      </div>
                      <div className="flex items-center gap-1 text-amber-400 text-xs bg-amber-500/10 px-2 py-1 rounded-lg">
                        <Clock className="w-3 h-3" /> Waiting...
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'friends' && (
            <div>
              {friends.length === 0 ? (
                <div className="text-center py-10">
                  <Users className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">Abhi koi dost nahi hai.</p>
                  <p className="text-gray-600 text-xs mt-1">Add Friend tab mein jao aur User ID se add karo.</p>
                </div>
              ) : (
                friends.map(f => (
                  <div key={f.userId} className="bg-[#121922] rounded-xl p-4 flex items-center justify-between mb-2 border border-gray-800 hover:border-indigo-500/30 transition">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center">
                        <Check className="w-4 h-4 text-green-400" />
                      </div>
                      <div>
                        <div className="font-bold text-white text-sm">{f.name}</div>
                        <div className="text-xs text-indigo-400 font-mono">{f.userId}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => friendsStore.remove(f.userId)}
                      className="text-gray-600 hover:text-red-400 p-2 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
