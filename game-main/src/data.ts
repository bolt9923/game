import { GameDef, LeaderboardEntry } from './types';

export const GAMES: GameDef[] = [
  {
    id: 'wordchain',
    title: 'Word Chain',
    description: 'Chain words using the last letter! Play against AI or friends.',
    icon: 'Link',
    color: 'from-indigo-500 to-purple-500',
  },
  {
    id: 'emojiquiz',
    title: 'Emoji Quiz',
    description: 'Can you guess the movie from the emojis? Test your pop culture knowledge.',
    icon: 'Smile',
    color: 'from-yellow-400 to-orange-500',
  },
  {
    id: 'word',
    title: 'Word Seek Ultimate',
    description: 'Guess the hidden words! Level up and earn coins.',
    icon: 'Keyboard',
    color: 'from-emerald-500 to-teal-400',
  },
  {
    id: 'rps',
    title: 'Rock Paper Scissors',
    description: 'Classic game of chance. Play against bot or friend!',
    icon: 'HandMetal',
    color: 'from-blue-500 to-cyan-400',
  },
  {
    id: 'tictactoe',
    title: 'Tic Tac Toe',
    description: 'Line up 3 symbols. Solo AI mode or Local 1v1.',
    icon: 'Grid3X3',
    color: 'from-purple-500 to-pink-500',
  },
  {
    id: 'reaction',
    title: 'Speed Catch',
    description: 'Test your reflexes! Tap as fast as you can.',
    icon: 'Zap',
    color: 'from-orange-500 to-yellow-400',
  },
  {
    id: 'ludo',
    title: 'Ludo Classic',
    description: 'Play Ludo with 2, 3, or 4 players online or vs Bot!',
    icon: 'Dices',
    color: 'from-red-500 to-rose-400',
  },
  {
    id: 'chess',
    title: 'Grandmaster Chess',
    description: 'Classic 1v1 chess against bot or online opponent.',
    icon: 'Crown',
    color: 'from-amber-600 to-yellow-500',
  },
  {
    id: 'carrom',
    title: 'Carrom Strike',
    description: 'Strike the striker! 2 or 4 player online multiplayer.',
    icon: 'CircleDot',
    color: 'from-amber-700 to-orange-800',
  }
];

export const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { id: 'u1', name: 'Alex Hunter', username: 'alexh_gaming', avatar: 'https://i.pravatar.cc/150?u=1', score: 12500, gems: 450, clan: 'ProGamers' },
  { id: 'u2', name: 'Sarah Connor', username: 'terminator', avatar: 'https://i.pravatar.cc/150?u=2', score: 9800, gems: 120, clan: 'Skynet' },
  { id: 'u3', name: 'Rahul Dev', username: 'rahul_dev99', avatar: 'https://i.pravatar.cc/150?u=3', score: 8550, gems: 300, clan: 'IndiaTG' },
  { id: 'u4', name: 'Ninja', username: 'ninja_pro', avatar: 'https://i.pravatar.cc/150?u=4', score: 7200, gems: 50 },
  { id: 'u5', name: 'Elena Smith', username: 'elena_s', avatar: 'https://i.pravatar.cc/150?u=5', score: 6100, gems: 15 },
  { id: 'u6', name: 'Vortex', username: 'vortex_boss', avatar: 'https://i.pravatar.cc/150?u=6', score: 5400, gems: 230, clan: 'Void' },
  { id: 'u7', name: 'Cyber Punk', username: 'cp_2077', avatar: 'https://i.pravatar.cc/150?u=7', score: 4900, gems: 0 },
  { id: 'u8', name: 'Crypto King', username: 'hodl_king', avatar: 'https://i.pravatar.cc/150?u=8', score: 3200, gems: 500, clan: 'Whales' },
];
