# Task 3 - Concurrent WebSocket Real-Time Communication Hub

**Student:** Muhammad Siddique

## Objective
A real-time instant-messaging backend with live full-duplex WebSocket connections.

## Requirement checklist
| Requirement from the task letter | Where |
|---|---|
| WebSockets with Socket.IO | `src/hub.js` |
| Multiple chat channels | Rooms: `join-room` / `leave-room`, any number of rooms per user; `GET /rooms` |
| Cache active user data in Redis | `src/presence.js` stores every connected user (socket id, username, rooms) in the Redis hash `chat:active_users`; also uses the Socket.IO Redis adapter to scale across servers |
| Log transaction timestamps to persistent file stores | `src/messageLog.js` appends one JSON line per event (message, join, leave, connect, disconnect) with an ISO timestamp to `data/messages.jsonl` |
| High concurrency | async handlers, Redis adapter for multiple instances, per-socket rate limit (20 messages / 10 s) |

If `REDIS_URL` is missing or Redis is down, the hub falls back to in-memory presence (single server) and keeps working.

## Run with Docker (includes Redis)
```bash
docker compose up --build
```

## Run locally
```bash
npm install
npm start                       # in-memory presence
# with Redis:  docker run -d -p 6379:6379 redis:7   then   REDIS_URL=redis://localhost:6379 npm start
```

## Quick demo
```bash
npm start                                   # terminal 1
node scripts/demo-client.js alice general   # terminal 2
node scripts/demo-client.js bob general     # terminal 3
```

## Authentication
1. `POST /auth/token` with `{"username":"alice"}` returns a JWT (guest-style login for a chat hub).
2. Connect with it:
```javascript
const socket = io("http://localhost:3000", { auth: { token: "<JWT>" } });
```

## Socket events
| Event | Direction | Payload |
|---|---|---|
| `join-room` | client -> server | `"general"` |
| `leave-room` | client -> server | `"general"` |
| `chat-message` | client -> server | `{ "room": "general", "text": "Hello" }` (must have joined the room) |
| `chat-message` | server -> room | `{ id, type, room, username, text, timestamp }` |
| `presence` | server -> room | `{ type: "joined" \| "left", user, room, timestamp }` |
| `room-users` | server -> room | `{ room, users: [...] }` (from the Redis cache) |
| `room-history` | server -> joining client | last 50 messages of the room |
| `error-message` | server -> client | error text |

Room names: letters, numbers, `-`, `_` (max 50 chars). Messages: max 1000 characters.

## HTTP endpoints
`GET /health` (public) - `POST /auth/token` (public) - with `Authorization: Bearer <JWT>`: `GET /users/online`, `GET /rooms`, `GET /rooms/:room/users`, `GET /rooms/:room/history?limit=50`.

## Tests
```bash
npm test      # 24 unit tests: presence cache (memory + Redis layout), file log, validation, rate limiter
```
