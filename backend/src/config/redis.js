const Redis = require('ioredis');

let client = null;

function getRedis() {
  if (client) return client;

  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  client = new Redis(url, {
    maxRetriesPerRequest: 2,
    lazyConnect: false,
    retryStrategy(times) {
      return Math.min(times * 200, 2000);
    },
  });

  client.on('error', (err) => {
    console.error('[redis] error:', err.message);
  });

  client.on('connect', () => {
    console.log('[redis] connected');
  });

  return client;
}

module.exports = getRedis;