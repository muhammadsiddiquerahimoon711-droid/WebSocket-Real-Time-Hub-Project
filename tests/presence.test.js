const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryStore, createRedisStore, createPresence, REDIS_KEY } = require('../src/presence');

// Minimal fake of the node-redis v4 hash commands used by the Redis store.
function fakeRedis() {
  const hashes = new Map();
  return {
    hashes,
    async hSet(key, field, value) { if (!hashes.has(key)) hashes.set(key, new Map()); hashes.get(key).set(field, value); },
    async hGet(key, field) { return hashes.get(key)?.get(field) ?? null; },
    async hDel(key, field) { hashes.get(key)?.delete(field); },
    async hGetAll(key) { return Object.fromEntries(hashes.get(key) ?? []); },
    async expire() {}
  };
}

for (const [label, makeStore] of [
  ['memory store', () => createMemoryStore()],
  ['redis store (fake client)', () => createRedisStore(fakeRedis())]
]) {
  describe(`presence with ${label}`, () => {
    test('tracks connected users and rooms', async () => {
      const p = createPresence(makeStore());
      await p.userConnected('s1', 'alice');
      await p.userConnected('s2', 'bob');
      await p.joinRoom('s1', 'general');
      await p.joinRoom('s2', 'general');
      await p.joinRoom('s2', 'random');

      assert.deepEqual(await p.onlineUsers(), ['alice', 'bob']);
      assert.deepEqual(await p.usersInRoom('general'), ['alice', 'bob']);
      assert.deepEqual(await p.usersInRoom('random'), ['bob']);
      assert.deepEqual(await p.activeRooms(), [{ room: 'general', users: 2 }, { room: 'random', users: 1 }]);
    });

    test('same user on two sockets is counted once', async () => {
      const p = createPresence(makeStore());
      await p.userConnected('s1', 'alice');
      await p.userConnected('s2', 'alice');
      await p.joinRoom('s1', 'general');
      await p.joinRoom('s2', 'general');
      assert.deepEqual(await p.usersInRoom('general'), ['alice']);
    });

    test('leaveRoom removes the user from that room only', async () => {
      const p = createPresence(makeStore());
      await p.userConnected('s1', 'alice');
      await p.joinRoom('s1', 'general');
      await p.joinRoom('s1', 'random');
      await p.leaveRoom('s1', 'general');
      assert.deepEqual(await p.usersInRoom('general'), []);
      assert.deepEqual(await p.usersInRoom('random'), ['alice']);
    });

    test('disconnect returns the rooms to notify and removes the user', async () => {
      const p = createPresence(makeStore());
      await p.userConnected('s1', 'alice');
      await p.joinRoom('s1', 'general');
      const rec = await p.userDisconnected('s1');
      assert.deepEqual(rec.rooms, ['general']);
      assert.deepEqual(await p.onlineUsers(), []);
      assert.equal(await p.userDisconnected('s1'), null);
    });

    test('joining twice does not duplicate the room', async () => {
      const p = createPresence(makeStore());
      await p.userConnected('s1', 'alice');
      await p.joinRoom('s1', 'general');
      await p.joinRoom('s1', 'general');
      assert.deepEqual(await p.activeRooms(), [{ room: 'general', users: 1 }]);
    });

    test('joinRoom for an unknown socket returns false', async () => {
      const p = createPresence(makeStore());
      assert.equal(await p.joinRoom('ghost', 'general'), false);
    });
  });
}

describe('redis store layout', () => {
  test('stores active users in one Redis hash', async () => {
    const client = fakeRedis();
    const p = createPresence(createRedisStore(client));
    await p.userConnected('s1', 'alice');
    assert.ok(client.hashes.get(REDIS_KEY).has('s1'));
    assert.equal(JSON.parse(client.hashes.get(REDIS_KEY).get('s1')).username, 'alice');
  });
});
