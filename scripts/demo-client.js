// Usage: node scripts/demo-client.js [username] [room] [message]
// Needs the server running (npm start). Gets a JWT, joins a room, sends one message, prints events.
const { io } = require('socket.io-client');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const username = process.argv[2] || 'demo-user';
const room = process.argv[3] || 'general';
const text = process.argv[4] || `Hello from ${username}`;

(async () => {
  const res = await fetch(`${BASE}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username })
  });
  const { token } = await res.json();

  const socket = io(BASE, { auth: { token } });
  socket.on('connect', () => {
    console.log('connected as', username);
    socket.emit('join-room', room);
    setTimeout(() => socket.emit('chat-message', { room, text }), 500);
  });
  for (const ev of ['chat-message', 'presence', 'room-users', 'room-history', 'error-message']) {
    socket.on(ev, (data) => console.log(`[${ev}]`, JSON.stringify(data)));
  }
  socket.on('connect_error', (err) => { console.error('connect_error:', err.message); process.exit(1); });
  setTimeout(() => { socket.close(); process.exit(0); }, 3000);
})();
