import axios, { AxiosError } from 'axios';

let authToken = '';
let sessionKey = '';
export const setApiAuthToken = (token: string): void => { authToken = token; };
export const setApiSessionKey = (key: string): void => { sessionKey = key; };
export const getApiAuthToken = (): string => authToken;

export const httpClient = axios.create({ baseURL: import.meta.env.VITE_API_BASE || '', timeout: 10_000 });

const base64Url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const decodeBase64Url = (value: string): Uint8Array => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), (character) => character.charCodeAt(0));

httpClient.interceptors.request.use(async (config) => {
  if (authToken) config.headers.Authorization = `Bearer ${authToken}`;
  if (authToken && sessionKey) {
    const body = config.data === undefined ? '' : typeof config.data === 'string' ? config.data : JSON.stringify(config.data);
    if (config.data !== undefined) { config.data = body; config.headers['Content-Type'] = 'application/json'; }
    const timestamp = String(Date.now());
    const nonce = crypto.randomUUID().replace(/-/g, '');
    const pathname = new URL(config.url ?? '/', config.baseURL || globalThis.location.origin).pathname;
    const bodyHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)));
    const canonical = `${(config.method ?? 'GET').toUpperCase()}\n${pathname}\n${timestamp}\n${nonce}\n${base64Url(bodyHash)}`;
    const key = await crypto.subtle.importKey('raw', decodeBase64Url(sessionKey).slice().buffer as ArrayBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical)));
    config.headers['X-MTX-Timestamp'] = timestamp;
    config.headers['X-MTX-Nonce'] = nonce;
    config.headers['X-MTX-Signature'] = base64Url(signature);
  }
  return config;
});

httpClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string; error?: string }>) => Promise.reject(new Error(error.response?.data?.error ?? error.response?.data?.message ?? 'Request failed')),
);
