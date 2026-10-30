import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Only initialize if keys are present and not placeholders
const isValidUrl = (url) => {
    try {
        return url && url.startsWith('https://') && !url.includes('YOUR_SUPABASE');
    } catch {
        return false;
    }
};

export const supabase = isValidUrl(supabaseUrl) && supabaseAnonKey && !supabaseAnonKey.includes('YOUR_SUPABASE')
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            // Bypass Web LockManager deadlock in dev/Strict Mode
            lock: async (name, acquireTimeout, fn) => await fn(),
        }
    })
    : null;

