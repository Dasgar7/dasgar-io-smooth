const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const Game = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 10000,
  pingTimeout: 5000
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '../public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const game = new Game(io);

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('join', (data) => {
    const name = (data && data.name) ? String(data.name).slice(0, 15) : 'An unnamed cell';
    game.addPlayer(socket, name);
  });

  socket.on('input', (data) => {
    game.handleInput(socket.id, data);
  });

  socket.on('split', () => {
    game.splitPlayer(socket.id);
  });

  socket.on('eject', () => {
    game.ejectMass(socket.id);
  });

  socket.on('spectate', () => {
    game.spectate(socket.id);
  });

  socket.on('respawn', (data) => {
    const name = (data && data.name) ? String(data.name).slice(0, 15) : 'An unnamed cell';
    game.respawn(socket.id, name);
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    game.removePlayer(socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`dasgar-io-smooth server running on port ${PORT}`);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
