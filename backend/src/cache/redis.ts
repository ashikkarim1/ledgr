import * as redis from 'redis';

const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_DB || '0'),
  password: process.env.REDIS_PASSWORD,
});

redisClient.on('error', (err: Error) => {
  console.error('Redis error:', err);
});

redisClient.on('connect', () => {
  console.log('Connected to Redis');
});

export const cache = {
  set: (key: string, value: any, ttl?: number) => {
    const serialized = JSON.stringify(value);
    if (ttl) {
      return redisClient.setex(key, ttl, serialized);
    } else {
      return redisClient.set(key, serialized);
    }
  },

  get: async (key: string) => {
    return new Promise((resolve, reject) => {
      redisClient.get(key, (err, data) => {
        if (err) {
          reject(err);
        } else if (data) {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });
    });
  },

  del: (key: string) => {
    return redisClient.del(key);
  },

  flush: () => {
    return redisClient.flushdb();
  },

  close: () => {
    return redisClient.quit();
  },
};
