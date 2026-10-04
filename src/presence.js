// Active-user cache. Each connected socket is stored as
//   socketId -> { username, rooms: [...], connectedAt }
// in a Redis hash (production) or an in-memory Map (fallback when Redis is unavailable).

const REDIS_KEY = 'chat:active_users';

function createMemoryStore() {
  const map = new Map();
  return {
    name: 'memory',
    async set(id, value) { map.set(id, structuredClone(value)); },
    async get(id) { return map.has(id) ? structuredClone(map.get(id)) : null; },
    async del(id) { map.delete(id); },
    async all() { return [...map.entries()].map(([id, value]) => ({ id, ...structuredClone(value) })); }
  };
}

function createRedisStore(client) {
  return {
    name: 'redis',
    async set(id, value) {
      await client.hSet(REDIS_KEY, id, JSON.stringify(value));
      await client.expire(REDIS_KEY, 24 * 60 * 60); // safety net for crashed servers
    },
    async get(id) {
      const raw = await client.hGet(REDIS_KEY, id);
      return raw ? JSON.parse(raw) : null;
    },
    async del(id) { await client.hDel(REDIS_KEY, id); },
    async all() {
      const all = await client.hGetAll(REDIS_KEY);
      return Object.entries(all).map(([id, raw]) => ({ id, ...JSON.parse(raw) }));
    }
  };
}

function createPresence(store) {
  const unique = (arr) => [...new Set(arr)].sort();
  return {
    storeName: store.name,

    async userConnected(socketId, username) {
      await store.set(socketId, { username, rooms: [], connectedAt: new Date().toISOString() });
    },

    async joinRoom(socketId, room) {
      const rec = await store.get(socketId);
      if (!rec) return false;
      if (!rec.rooms.includes(room)) rec.rooms.push(room);
      await store.set(socketId, rec);
      return true;
    },

    async leaveRoom(socketId, room) {
      const rec = await store.get(socketId);
      if (!rec) return false;
      rec.rooms = rec.rooms.filter((r) => r !== room);
      await store.set(socketId, rec);
      return true;
    },

    // Returns the removed record (so callers know which rooms to notify), or null.
    async userDisconnected(socketId) {
      const rec = await store.get(socketId);
      await store.del(socketId);
      return rec;
    },

    async usersInRoom(room) {
      const all = await store.all();
      return unique(all.filter((r) => r.rooms.includes(room)).map((r) => r.username));
    },

    async onlineUsers() {
      const all = await store.all();
      return unique(all.map((r) => r.username));
    },

    async activeRooms() {
      const all = await store.all();
      const rooms = new Map();
      for (const rec of all) {
        for (const room of rec.rooms) {
          if (!rooms.has(room)) rooms.set(room, new Set());
          rooms.get(room).add(rec.username);
        }
      }
      return [...rooms.entries()]
        .map(([room, users]) => ({ room, users: users.size }))
        .sort((a, b) => a.room.localeCompare(b.room));
    }
  };
}

module.exports = { createMemoryStore, createRedisStore, createPresence, REDIS_KEY };
