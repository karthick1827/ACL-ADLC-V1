const cache = new Map();
const DEFAULT_TTL_MS = 8000;

export function getCachedList(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.payload;
}

export function setCachedList(key, payload, ttlMs = DEFAULT_TTL_MS) {
  cache.set(key, { payload, expiresAt: Date.now() + ttlMs });
}

export function invalidateListCache(prefix = '') {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
