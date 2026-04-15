// Thin fetch wrapper that attaches a fresh Firebase ID token and retries once on 401.
import { auth } from './firebase';

const BASE =
  process.env.EXPO_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://groundopscos.vercel.app';

export class ApiError extends Error {
  status: number;
  payload?: any;
  constructor(message: string, status: number, payload?: any) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function getAuthHeader(forceRefresh = false): Promise<Record<string, string>> {
  const u = auth.currentUser;
  if (!u) return {};
  const token = await u.getIdToken(forceRefresh);
  return { Authorization: `Bearer ${token}` };
}

async function call<T>(
  method: string,
  path: string,
  body?: any,
  extraHeaders: Record<string, string> = {},
  attempt = 0,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(await getAuthHeader(attempt > 0)),
    ...extraHeaders,
  };
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && attempt === 0 && auth.currentUser) {
    return call<T>(method, path, body, extraHeaders, 1);
  }
  const text = await res.text();
  const payload = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) throw new ApiError(`API ${method} ${path} → ${res.status}`, res.status, payload);
  return payload as T;
}

export const api = {
  get: <T = any>(p: string) => call<T>('GET', p),
  post: <T = any>(p: string, body?: any) => call<T>('POST', p, body),
  patch: <T = any>(p: string, body?: any) => call<T>('PATCH', p, body),
  delete: <T = any>(p: string) => call<T>('DELETE', p),
};

export const API_BASE = BASE;
export const FIREBASE_FUNCTIONS_URL =
  process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_URL ||
  'https://us-central1-groundopss.cloudfunctions.net';
