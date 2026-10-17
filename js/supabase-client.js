import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './supabase-config.js';

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in js/supabase-config.js.');
}

if (
  SUPABASE_PUBLISHABLE_KEY.startsWith('sb_secret_') ||
  (!SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_') &&
    !isLegacyAnonKey(SUPABASE_PUBLISHABLE_KEY))
) {
  throw new Error('The browser configuration must use a Supabase publishable key or legacy anon key.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

function isLegacyAnonKey(key) {
  try {
    const payload = key.split('.')[1];
    if (!payload) return false;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    return JSON.parse(decoded).role === 'anon';
  } catch (error) {
    return false;
  }
}
