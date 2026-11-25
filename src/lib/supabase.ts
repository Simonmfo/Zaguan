import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://wjjjxdlorndnkufyyjef.supabase.co';

const STORAGE_KEY_ANON = 'zaguan_supabase_anon_key';

export function getStoredSupabaseAnonKey(): string {
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  if (envKey) return envKey;
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(STORAGE_KEY_ANON) || '';
}

export function setStoredSupabaseAnonKey(key: string) {
  if (typeof window === 'undefined') return;
  const trimmed = key.trim();
  if (!trimmed) {
    window.localStorage.removeItem(STORAGE_KEY_ANON);
  } else {
    window.localStorage.setItem(STORAGE_KEY_ANON, trimmed);
  }
  cachedClient = null;
}

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const anonKey = getStoredSupabaseAnonKey();
  if (!DEFAULT_SUPABASE_URL || !anonKey) return null;
  if (!cachedClient) {
    cachedClient = createClient(DEFAULT_SUPABASE_URL, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return cachedClient;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(DEFAULT_SUPABASE_URL && getStoredSupabaseAnonKey());
}
