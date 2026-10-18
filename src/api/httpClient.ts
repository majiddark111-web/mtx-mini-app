import axios, { AxiosError } from 'axios';
import { PlayerSessionController, SessionRejectedError, type SessionCredentials } from '../services/playerSession';

const baseURL = import.meta.env.VITE_API_BASE || '';
export const httpClient = axios.create({ baseURL, timeout: 30_000 });
const renewalClient = axios.create({ baseURL, timeout: 15_000 });
export const PLAYER_SESSION_EXPIRED = 'mtx:player-session-expired';

const base64Url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const decodeBase64Url = (value: string): Uint8Array => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), (character) => character.charCodeAt(0));

async function signedHeaders(credentials: SessionCredentials, method: string, pathname: string, body: string): Promise<Record<string, string>> {
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const bodyHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)));
  const canonical = [method.toUpperCase(), pathname, timestamp, nonce, base64Url(bodyHash)].join('\n');
  const key = await crypto.subtle.importKey('raw', decodeBase64Url(credentials.sessionKey).slice().buffer as ArrayBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical)));
  return { Authorization: 'Bearer ' + credentials.token, 'X-MTX-Timestamp': timestamp, 'X-MTX-Nonce': nonce, 'X-MTX-Signature': base64Url(signature) };
}

const session = new PlayerSessionController(async (credentials) => {
  const path = '/api/session/refresh';
  try {
    const response = await renewalClient.post<SessionCredentials>(path, '{}', { headers: { ...await signedHeaders(credentials, 'POST', path, '{}'), 'Content-Type': 'application/json' } });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) throw new SessionRejectedError();
    throw error;
  }
}, () => window.dispatchEvent(new Event(PLAYER_SESSION_EXPIRED)));

export const setApiSession = (credentials: SessionCredentials): void => session.install(credentials);
export const getApiAuthToken = (): string => session.current()?.token ?? '';
export const hasUsablePlayerSession = (): boolean => session.usable();
export const maintainPlayerSession = async (): Promise<void> => { if (session.current()) await session.ensure(); };

httpClient.interceptors.request.use(async (config) => {
  const pathname = new URL(config.url ?? '/', config.baseURL || globalThis.location.origin).pathname;
  // Login must never carry an old token or an old request signature.
  if (pathname === '/api/auth/telegram') return config;
  const credentials = await session.ensure();
  const body = config.data === undefined ? '' : typeof config.data === 'string' ? config.data : JSON.stringify(config.data);
  if (config.data !== undefined) { config.data = body; config.headers['Content-Type'] = 'application/json'; }
  const headers = await signedHeaders(credentials, config.method ?? 'GET', pathname, body);
  for (const [name, value] of Object.entries(headers)) config.headers.set(name, value);
  return config;
});

httpClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string; error?: string }>) => {
    const authorization = error.config?.headers?.get('Authorization');
    if (error.response?.status === 401 && typeof authorization === 'string' && authorization.startsWith('Bearer ')) session.reject(authorization.slice(7));
    return Promise.reject(new Error(error.response?.data?.error ?? error.response?.data?.message ?? error.message ?? 'Request failed'));
  },
);
