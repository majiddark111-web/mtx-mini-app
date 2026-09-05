import { httpClient } from '../api/httpClient';
export interface Mission { id: string; title: string; target: number; progress: number; reward: number; claimed: boolean; period: string; }
export interface Leader { userId: string; username: string; coins: number; rank: number; }
export const fetchMissions = async (): Promise<Mission[]> => ((await httpClient.get('/api/missions')).data as { missions: Mission[] }).missions;
export const claimMission = async (missionId: string): Promise<void> => { await httpClient.post('/api/missions/claim', { missionId }); };
export const fetchDaily = async (): Promise<{ streak: number; reward: number; claimed: boolean }> => (await httpClient.get('/api/daily')).data as { streak: number; reward: number; claimed: boolean };
export const claimDaily = async (): Promise<void> => { await httpClient.post('/api/daily/claim'); };
export interface DailyChallenges { combo: { slots: number; reward: number; claimed: boolean }; cipher: { hint: string; length: number; reward: number; claimed: boolean }; }
export const fetchDailyChallenges = async (): Promise<DailyChallenges> => (await httpClient.get('/api/daily/challenges')).data as DailyChallenges;
export const claimDailyChallenge = async (type: 'combo' | 'cipher', answer: string[]): Promise<void> => { await httpClient.post('/api/daily/challenges/claim', { type, answer }); };
export const fetchReferral = async (): Promise<{ code: string; invited: number; earned: number }> => (await httpClient.get('/api/referral')).data as { code: string; invited: number; earned: number };
export const acceptReferral = async (code: string, deviceHash: string): Promise<void> => { await httpClient.post('/api/referral/accept', { code, deviceHash }); };
export const fetchLeaderboard = async (): Promise<Leader[]> => ((await httpClient.get('/api/leaderboard')).data as { entries: Leader[] }).entries;
export interface Achievement { id: string; icon: string; title: string; description: string; progress: number; target: number; unlocked: boolean; }
export interface ProfileData { state: { coins: number; xp: number; level: number; rank: string; profitPerTap: number; profitPerHour: number }; inventory: unknown[]; referral: { invited: number; earned: number }; payments: unknown[]; achievements: Achievement[]; }
export const fetchProfile = async (): Promise<ProfileData> => (await httpClient.get('/api/profile')).data as ProfileData;
