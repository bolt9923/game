export type ViewState = 'home' | 'leaderboard' | 'social' | 'profile' | 'game' | 'tournaments';

export interface Badge {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface User {
  id: string;
  name: string;
  username: string;
  avatar: string;
  score: number;
  gems: number;
  rank?: number;
  clan?: string;
  badges?: Badge[];
}

export interface GameDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
}

export interface LeaderboardEntry extends User {
  isCurrentUser?: boolean;
}

