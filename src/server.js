const path = require('path');
const { createClient } = require('redis');
const { createHub } = require('./hub');
const { createMemoryStore, createRedisStore, createPresence } = require('./presence');
const { createMessageLog } = require('./messageLog');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const LOG_FILE = process.env.LOG_FILE || path.join(__dirname, '..', 'data', 'messages.jsonl');

async function main() {
  let store = createMemoryStore();
  let adapterFactory = null;

  if (process.env.REDIS_URL) {
    try {
      const pubClient = createClient({ url: process.env.REDIS_URL });
      const subClient = pubClient.duplicate();
      pubClient.on('error', (e) => console.error('Redis error:', e.message));
      subClient.on('error', (e) => console.error('Redis error:', e.message));
      await Promise.all([pubClient.connect(), subClient.connect()]);
      store = createRedisStore(pubClient);
      adapterFactory = () => require('@socket.io/redis-adapter').createAdapter(pubClient, subClient);
      console.log('Redis connected: active users cached in Redis, Socket.IO Redis adapter enabled');
    } catch (err) {
      console.log(`Redis unavailable (${err.message}); using in-memory presence (single-server mode).`);
    }
  } else {
    console.log('REDIS_URL not set; using in-memory presence (single-server mode).');
  }

  const presence = createPresence(store);
  const log = createMessageLog(LOG_FILE);
  const { server, io } = createHub({ jwtSecret: JWT_SECRET, presence, log });
  if (adapterFactory) io.adapter(adapterFactory());

  server.listen(PORT, () => console.log(`Task 3 server running on http://localhost:${PORT}`));

  const shutdown = () => { io.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => { console.error(err); process.exit(1); });
