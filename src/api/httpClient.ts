import axios, { AxiosError } from 'axios';

let authToken = '';
export const setApiAuthToken = (token: string): void => { authToken = token; };
export const getApiAuthToken = (): string => authToken;

export const httpClient = axios.create({ baseURL: import.meta.env.VITE_API_BASE || '', timeout: 10_000 });

httpClient.interceptors.request.use((config) => {
  if (authToken) config.headers.Authorization = `Bearer ${authToken}`;
  return config;
});

httpClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string }>) => Promise.reject(new Error(error.response?.data?.message ?? 'Request failed')),
);
