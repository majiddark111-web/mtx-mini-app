import axios from 'axios';
const adminClient = axios.create({ baseURL: import.meta.env.VITE_API_BASE || '', timeout: 10_000 });
let token = '';
adminClient.interceptors.request.use((config) => { if (token) config.headers.Authorization = `Bearer ${token}`; return config; });
export interface AdminDashboard { stats: { users: number; banned: number; payments: number; confirmedRevenue: number; totalCoins: number }; recentLogs: Array<{ id: string; action: string; target?: string; createdAt: number }>; }
export async function adminLogin(username: string, password: string, otp: string): Promise<void> { const response = await adminClient.post<{ token: string }>('/api/admin/auth', { username, password, otp }); token = response.data.token; }
export async function fetchAdminDashboard(): Promise<AdminDashboard> { return (await adminClient.get('/api/admin/dashboard')).data as AdminDashboard; }
export async function fetchAdminUsers(): Promise<Array<{ userId: string; coins: number; level: number; rank: string; banned: boolean }>> { return ((await adminClient.get('/api/admin/users')).data as { users: Array<{ userId: string; coins: number; level: number; rank: string; banned: boolean }> }).users; }
export async function setUserBan(userId: string, banned: boolean): Promise<void> { await adminClient.post('/api/admin/users/ban', { userId, banned }); }
export async function sendAdminNotification(title: string, message: string): Promise<void> { await adminClient.post('/api/admin/notifications', { title, message }); }

