import { createClient } from '@supabase/supabase-js';

// Publishable credentials — safe to ship to the browser. Row Level Security and
// the JWT-verified Edge Function are what actually protect the data.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ymxxxfvxjheaiacddcfa.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_LRNsxU4hCSXDNnxSRlii4A_QuqIlY9w';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// Exposed for e2e tests only (programmatic sign-in without a mailbox).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__supabase = supabase;
}
