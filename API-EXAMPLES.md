# Task 3 - Quick Test

```bash
BASE=http://localhost:3000

# Health check
curl $BASE/health

# Get a JWT
TOKEN=$(curl -s -X POST $BASE/auth/token -H "Content-Type: application/json" -d '{"username":"alice"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')

# Who is online / which rooms are active (served from the presence cache)
curl $BASE/users/online -H "Authorization: Bearer $TOKEN"
curl $BASE/rooms -H "Authorization: Bearer $TOKEN"
curl $BASE/rooms/general/history -H "Authorization: Bearer $TOKEN"
```

## Socket.IO client
```js
const { io } = require("socket.io-client");

const socket = io("http://localhost:3000", { auth: { token: "YOUR_JWT" } });

socket.on("connect", () => {
  socket.emit("join-room", "general");
  socket.emit("chat-message", { room: "general", text: "Hello from Task 3" });
});
socket.on("chat-message", console.log);
socket.on("room-users", console.log);
socket.on("presence", console.log);
socket.on("error-message", console.log);
```
