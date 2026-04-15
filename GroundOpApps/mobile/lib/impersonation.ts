// Mirrors web `localStorage['impersonationState']` — uses AsyncStorage on mobile.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'impersonationState';

export interface ImpersonationState {
  isImpersonating: boolean;
  appName: string;
  targetUid?: string;
  targetRole?: 'client' | 'subcontractor';
  targetName?: string;
}

export async function getImpersonationState(): Promise<ImpersonationState | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function setImpersonationState(s: ImpersonationState | null) {
  if (s === null) await AsyncStorage.removeItem(KEY);
  else await AsyncStorage.setItem(KEY, JSON.stringify(s));
}
