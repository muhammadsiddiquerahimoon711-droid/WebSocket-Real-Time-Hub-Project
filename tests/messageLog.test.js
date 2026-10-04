const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createMessageLog } = require('../src/messageLog');

describe('message log (JSONL file store)', () => {
  let dir, file, log;
  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-log-'));
    file = path.join(dir, 'data', 'messages.jsonl');
    log = createMessageLog(file);
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('writes one valid JSON object per line (real newlines)', async () => {
    await log.append({ id: '1', type: 'message', room: 'general', username: 'a', text: 'hi', timestamp: new Date().toISOString() });
    await log.append({ id: '2', type: 'message', room: 'general', username: 'b', text: 'yo', timestamp: new Date().toISOString() });
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);
    for (const line of lines) assert.doesNotThrow(() => JSON.parse(line));
    assert.ok(!fs.readFileSync(file, 'utf8').includes('\\n'), 'file must not contain a literal backslash-n');
  });

  test('every entry keeps its timestamp', async () => {
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
    for (const e of lines) assert.ok(!Number.isNaN(Date.parse(e.timestamp)));
  });

  test('recent() filters by room and ignores non-message events', async () => {
    await log.append({ id: '3', type: 'join', room: 'general', username: 'a', timestamp: new Date().toISOString() });
    await log.append({ id: '4', type: 'message', room: 'other', username: 'a', text: 'x', timestamp: new Date().toISOString() });
    const msgs = await log.recent('general');
    assert.deepEqual(msgs.map((m) => m.id), ['1', '2']);
  });

  test('recent() respects the limit and returns the newest', async () => {
    const msgs = await log.recent('general', 1);
    assert.deepEqual(msgs.map((m) => m.id), ['2']);
  });

  test('recent() works on a missing file', async () => {
    const empty = createMessageLog(path.join(dir, 'other', 'none.jsonl'));
    assert.deepEqual(await empty.recent('general'), []);
  });

  test('old entries without a "type" field still count as messages', async () => {
    fs.appendFileSync(file, JSON.stringify({ id: 'old', room: 'legacy', username: 'x', text: 't', timestamp: '2026-10-01T00:00:00.000Z' }) + '\n');
    assert.equal((await log.recent('legacy')).length, 1);
  });

  test('concurrent appends all land on their own lines', async () => {
    const before = fs.readFileSync(file, 'utf8').trim().split('\n').length;
    await Promise.all(Array.from({ length: 50 }, (_, i) => log.append({ id: `c${i}`, type: 'message', room: 'load', username: 'u', text: String(i), timestamp: new Date().toISOString() })));
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    assert.equal(lines.length, before + 50);
    for (const line of lines) assert.doesNotThrow(() => JSON.parse(line));
  });
});
