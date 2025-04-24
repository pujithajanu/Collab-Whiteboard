const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // allow all origins (you can restrict later)
    methods: ['GET', 'POST']
  }
});

// Basic route
app.get('/', (req, res) => {
  res.send('Server is running ✅');
});

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('🟢 A user connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('🔴 A user disconnected:', socket.id);
  });
});

// Run server
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server is listening on http://localhost:${PORT}`);
});
