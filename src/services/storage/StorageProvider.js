import { LocalStorageProvider } from './LocalStorageProvider';
import { SupabaseProvider } from './SupabaseProvider';

// Determine the active provider based on environment/config.
// For development/capstone mode, we use LocalStorageProvider to bypass Supabase.
// To switch back to Supabase, simply return new SupabaseProvider().
const createActiveProvider = () => {
  // Hardcoded to LocalStorageProvider for the current development phase.
  // In the future, this can be toggled via an env var like VITE_STORAGE_MODE=supabase
  return new LocalStorageProvider();
};

export const StorageProvider = createActiveProvider();
