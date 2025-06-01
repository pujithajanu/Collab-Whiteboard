const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('✅ Whiteboard Server is Live!');
});

let lockedAreas = [];
let drawingActions = [];
let userLocks = new Map();

const MIN_DISTANCE = 20;

function isTooClose(region1, region2) {
  return !(
    region1.x + region1.width + MIN_DISTANCE < region2.x ||
    region1.x > region2.x + region2.width + MIN_DISTANCE ||
    region1.y + region1.height + MIN_DISTANCE < region2.y ||
    region1.y > region2.y + region2.height + MIN_DISTANCE
  );
}

io.on('connection', (socket) => {
  console.log('🟢 New connection:', socket.id);

  socket.emit('init-lock-areas', lockedAreas);
  socket.emit('init-drawing-actions', drawingActions);

  socket.on('clear-canvas', () => {
    drawingActions = [];
    lockedAreas = [];
    userLocks.clear();
    io.emit('clear-canvas'); // Notify all clients
  });

  socket.on('lock-area', (lockData) => {
    socket.on('lock-area', (data) => {
  io.emit('lock-area', data);
});

    let conflict = false;
    for (let area of lockedAreas) {
      if (isTooClose(lockData, area)) {
        conflict = true;
        break;
      }
    }

    if (conflict) {
      socket.emit('lock-rejected', { reason: 'Too close to another user’s locked area' });
    } else {
      lockedAreas.push(lockData);
      if (!userLocks.has(socket.id)) {
        userLocks.set(socket.id, []);
      }
      userLocks.get(socket.id).push(lockData);
      socket.broadcast.emit('lock-area', lockData);
      socket.emit('lock-confirmed', lockData);
    }
  });

  socket.on('unlock-area', (data) => {
    lockedAreas = lockedAreas.filter(lock => lock.id !== data.id);
    const userLockedList = userLocks.get(socket.id);
    if (userLockedList) {
      userLocks.set(socket.id, userLockedList.filter(lock => lock.id !== data.id));
    }
    socket.broadcast.emit('unlock-area', data);
  });

  socket.on('draw-coordinates', (data) => {
    drawingActions.push(data);
    socket.broadcast.emit('draw-coordinates', data);
  });

  socket.on('chat-message', (data) => {
    socket.broadcast.emit('chat-message', data);
  });

  socket.on('disconnect', () => {
    console.log('🔴 Disconnected:', socket.id);
    const userLockedList = userLocks.get(socket.id);
    if (userLockedList) {
      userLockedList.forEach(lock => {
        lockedAreas = lockedAreas.filter(area => area.id !== lock.id);
        socket.broadcast.emit('unlock-area', { id: lock.id });
      });
      userLocks.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
