const cache = new Map();

function setCache(key, value, ttlSeconds = 300) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

function getCache(key) {
  const data = cache.get(key);

  if (!data) return null;

  if (Date.now() > data.expiresAt) {
    cache.delete(key);
    return null;
  }

  return data.value;
}

module.exports = { setCache, getCache };
