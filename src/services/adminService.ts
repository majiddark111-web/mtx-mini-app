import axios from 'axios';

const adminClient = axios.create({ baseURL: import.meta.env.VITE_API_BASE || '', timeout: 10_000 });
const tokenKey = 'mtx:admin-token';
let token = sessionStorage.getItem(tokenKey) ?? '';
adminClient.interceptors.request.use((config) => { if (token) config.headers.Authorization = `Bearer ${token}`; return config; });
adminClient.interceptors.response.use((response) => response, (error: unknown) => { if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) { token = ''; sessionStorage.removeItem(tokenKey); window.dispatchEvent(new Event('mtx:admin-expired')); } return Promise.reject(error); });

export interface AdminLog { id: string; action: string; target?: string; adminId?: string; createdAt: number; }
export interface AdminDashboard { stats: { users: number; banned: number; payments: number; confirmedRevenue: number; totalCoins: number }; recentLogs: AdminLog[]; }
export interface AdminUser { userId: string; coins: number; level: number; rank: string; banned: boolean; }
export interface AdminPayment { transactionId: string; userId: string; asset: string; amount: number; status: string; createdAt: number; }
export interface AdminItem { id: string; title: string; category: string; price: number; }
export interface AdminAnomaly { userId: string; type: string; at: number; details?: Record<string, string | number | boolean>; }
export interface AdminEvent { id: string; title: string; startsAt: number; endsAt: number; multiplier: number; }
export interface AdminNotification { id: string; title: string; message: string; createdAt: number; }

export function hasAdminSession(): boolean { return Boolean(token); }
export function adminLogout(): void { token = ''; sessionStorage.removeItem(tokenKey); }
export async function adminLogin(username: string, password: string, otp: string): Promise<void> { const response = await adminClient.post<{ token: string }>('/api/admin/auth', { username, password, otp }); token = response.data.token; sessionStorage.setItem(tokenKey, token); }
export async function fetchAdminDashboard(): Promise<AdminDashboard> { return (await adminClient.get('/api/admin/dashboard')).data as AdminDashboard; }
export async function fetchAdminUsers(): Promise<AdminUser[]> { return ((await adminClient.get('/api/admin/users')).data as { users: AdminUser[] }).users; }
export async function fetchAdminPayments(): Promise<AdminPayment[]> { return ((await adminClient.get('/api/admin/payments')).data as { payments: AdminPayment[] }).payments; }
export async function fetchAdminItems(): Promise<AdminItem[]> { return ((await adminClient.get('/api/admin/items')).data as { items: AdminItem[] }).items; }
export async function fetchAdminLogs(): Promise<AdminLog[]> { return ((await adminClient.get('/api/admin/logs')).data as { logs: AdminLog[] }).logs; }
export async function fetchAdminAnomalies(): Promise<AdminAnomaly[]> { return ((await adminClient.get('/api/admin/anomalies')).data as { anomalies: AdminAnomaly[] }).anomalies; }
export async function fetchAdminEvents(): Promise<AdminEvent[]> { return ((await adminClient.get('/api/admin/events')).data as { events: AdminEvent[] }).events; }
export async function fetchAdminNotifications(): Promise<AdminNotification[]> { return ((await adminClient.get('/api/admin/notifications')).data as { notifications: AdminNotification[] }).notifications; }
export async function setUserBan(userId: string, banned: boolean): Promise<void> { await adminClient.post('/api/admin/users/ban', { userId, banned }); }
export async function sendAdminNotification(title: string, message: string): Promise<void> { await adminClient.post('/api/admin/notifications', { title, message }); }
export async function createAdminEvent(title: string, startsAt: number, endsAt: number, multiplier: number): Promise<void> { await adminClient.post('/api/admin/events', { title, startsAt, endsAt, multiplier }); }
