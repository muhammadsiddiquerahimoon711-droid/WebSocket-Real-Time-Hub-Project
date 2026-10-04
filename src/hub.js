const express = require('express');
const http = require('http');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { validateUsername, validateRoom, validateText } = require('./validate');
const { createLimiter } = require('./rateLimiter');

function createHub({ jwtSecret, presence, log, corsOrigin = '*' }) {
  const app = express();
  app.use(express.json({ limit: '10kb' }));

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: corsOrigin } });

  const entry = (type, extra) => ({ id: crypto.randomUUID(), type, timestamp: new Date().toISOString(), ...extra });
  const record = (e) => log.append(e).catch((err) => console.error('Log error:', err.message));

  // ---------- HTTP ----------
  app.get('/health', async (req, res) => {
    res.json({ ok: true, service: 'websocket-chat-hub', presenceStore: presence.storeName, online: (await presence.onlineUsers()).length });
  });

  // Guest-style login: gives the chat client a JWT for the username it chose.
  app.post('/auth/token', (req, res) => {
    const v = validateUsername(req.body && req.body.username);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const token = jwt.sign({ username: v.value, role: 'user' }, jwtSecret, { expiresIn: '1h' });
    res.json({ token, username: v.value });
  });

  function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Token required' });
    try { req.user = jwt.verify(token, jwtSecret); next(); } catch { res.status(401).json({ error: 'Invalid token' }); }
  }
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  app.get('/users/online', requireAuth, wrap(async (req, res) => res.json({ users: await presence.onlineUsers() })));
  app.get('/rooms', requireAuth, wrap(async (req, res) => res.json({ rooms: await presence.activeRooms() })));
  app.get('/rooms/:room/users', requireAuth, wrap(async (req, res) => {
    const r = validateRoom(req.params.room);
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json({ room: r.value, users: await presence.usersInRoom(r.value) });
  }));
  app.get('/rooms/:room/history', requireAuth, wrap(async (req, res) => {
    const r = validateRoom(req.params.room);
    if (!r.ok) return res.status(400).json({ error: r.error });
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    res.json({ room: r.value, messages: await log.recent(r.value, limit) });
  }));

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // ---------- WebSocket ----------
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next(new Error('JWT token required'));
      const payload = jwt.verify(token, jwtSecret);
      const v = validateUsername(payload.username);
      if (!v.ok) return next(new Error('Invalid JWT payload'));
      socket.user = { username: v.value, role: payload.role || 'user' };
      await presence.userConnected(socket.id, socket.user.username);
      next();
    } catch {
      next(new Error('Invalid JWT token'));
    }
  });

  io.on('connection', (socket) => {
    const limiter = createLimiter(20, 10_000); // 20 messages / 10 s per socket
    const fail = (message) => socket.emit('error-message', message);
    const safe = (handler) => async (...args) => {
      try { await handler(...args); } catch (err) { console.error(err); fail('Server error'); }
    };

    record(entry('connect', { username: socket.user.username }));

    socket.on('join-room', safe(async (roomInput) => {
      const r = validateRoom(roomInput);
      if (!r.ok) return fail(r.error);
      const room = r.value;
      socket.join(room);
      await presence.joinRoom(socket.id, room);
      record(entry('join', { room, username: socket.user.username }));

      socket.to(room).emit('presence', { type: 'joined', user: socket.user.username, room, timestamp: new Date().toISOString() });
      socket.emit('room-history', { room, messages: await log.recent(room, 50) });
      io.to(room).emit('room-users', { room, users: await presence.usersInRoom(room) });
    }));

    socket.on('leave-room', safe(async (roomInput) => {
      const r = validateRoom(roomInput);
      if (!r.ok) return fail(r.error);
      const room = r.value;
      socket.leave(room);
      await presence.leaveRoom(socket.id, room);
      record(entry('leave', { room, username: socket.user.username }));
      io.to(room).emit('presence', { type: 'left', user: socket.user.username, room, timestamp: new Date().toISOString() });
      io.to(room).emit('room-users', { room, users: await presence.usersInRoom(room) });
    }));

    socket.on('chat-message', safe(async (payload) => {
      if (!limiter.allow()) return fail('Too many messages; slow down.');
      const r = validateRoom(payload && payload.room);
      const t = validateText(payload && payload.text);
      if (!r.ok) return fail(r.error);
      if (!t.ok) return fail(t.error);
      if (!socket.rooms.has(r.value)) return fail('Join the room before sending messages.');

      const message = entry('message', { room: r.value, username: socket.user.username, text: t.value });
      io.to(r.value).emit('chat-message', message);
      record(message);
    }));

    socket.on('disconnect', async () => {
      try {
        const rec = await presence.userDisconnected(socket.id);
        record(entry('disconnect', { username: socket.user.username }));
        for (const room of (rec && rec.rooms) || []) {
          io.to(room).emit('presence', { type: 'left', user: socket.user.username, room, timestamp: new Date().toISOString() });
          io.to(room).emit('room-users', { room, users: await presence.usersInRoom(room) });
        }
      } catch (err) {
        console.error('Disconnect cleanup failed:', err.message);
      }
    });
  });

  return { app, server, io };
}

module.exports = { createHub };
