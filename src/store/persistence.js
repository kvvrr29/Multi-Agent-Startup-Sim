export const cloneSerializable = (value) => JSON.parse(JSON.stringify(value));

// Safe localStorage accessor for zustand's persist middleware: returns a no-op
// store when localStorage is unavailable (SSR / test environments) so the
// store still constructs without throwing.
export const getBrowserStorage = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
  return window.localStorage;
};
