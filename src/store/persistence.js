export const getBrowserStorage = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
  return window.localStorage;
};

export const cloneSerializable = (value) => JSON.parse(JSON.stringify(value));
