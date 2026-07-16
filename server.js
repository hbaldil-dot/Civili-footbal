const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let lobby = [];
let rooms = {};

io.on('connection', (socket) => {
    console.log(`🟢 ${socket.id} bağlandı`);

    // === LOBI ===
    socket.on('join-lobby', (name) => {
        lobby = lobby.filter(p => p.id !== socket.id);
        lobby.push({ id: socket.id, name });
        io.emit('update-lobby', lobby);
        console.log(`👤 ${name} lobiye katıldı (${lobby.length} kişi)`);
    });

    socket.on('leave-lobby', () => {
        lobby = lobby.filter(p => p.id !== socket.id);
        io.emit('update-lobby', lobby);
    });

    socket.on('send-invite', (targetId) => {
        const from = lobby.find(p => p.id === socket.id);
        if (from) {
            io.to(targetId).emit('invite-received', {
                fromId: socket.id,
                from: from.name
            });
        }
    });

    socket.on('accept-invite', (hostId) => {
        const host = lobby.find(p => p.id === hostId);
        const guest = lobby.find(p => p.id === socket.id);
        if (!host || !guest) return;

        const roomId = `room_${hostId}_${socket.id}`;
        
        // Lobi'den çıkar
        lobby = lobby.filter(p => p.id !== hostId && p.id !== socket.id);
        io.emit('update-lobby', lobby);

        // Odaya al
        socket.join(roomId);
        const hostSocket = io.sockets.sockets.get(hostId);
        if (hostSocket) hostSocket.join(roomId);

        rooms[roomId] = {
            players: [
                { id: hostId, team: 1, ready: false, players: [] },
                { id: socket.id, team: 2, ready: false, players: [] }
            ]
        };

        io.to(hostId).emit('match-start', { roomId, team: 1 });
        io.to(socket.id).emit('match-start', { roomId, team: 2 });
        console.log(`🎮 Maç başladı: ${host.name} vs ${guest.name}`);
    });

    // === KADRO SENKRONİZASYONU ===
    socket.on('sync-player', ({ roomId, team, index, x, y }) => {
        socket.to(roomId).emit('sync-player', { team, index, x, y });
    });

    socket.on('player-ready', ({ roomId, team, players: placedPlayers }) => {
        const room = rooms[roomId];
        if (!room) return;
        
        const player = room.players.find(p => p.team === team);
        if (player) {
            player.ready = true;
            player.players = placedPlayers;
        }

        if (room.players.every(p => p.ready)) {
            const allPlayers = [
                ...room.players[0].players.map(p => ({ ...p, team: 1 })),
                ...room.players[1].players.map(p => ({ ...p, team: 2 }))
            ];
            io.to(roomId).emit('match-ready', { players: allPlayers });
            console.log(`🚀 Maç başlıyor: ${roomId}`);
            delete rooms[roomId];
        }
    });

    // === OYUN ===
    socket.on('shot', ({ roomId, player, startX, startY, endX, endY }) => {
        socket.to(roomId).emit('opponent-shot', { player, startX, startY, endX, endY });
    });

    socket.on('sync-ball', ({ roomId, ball, turn, score }) => {
        socket.to(roomId).emit('sync-ball', { ...ball, turn, score });
    });

    socket.on('disconnect', () => {
        console.log(`🔴 ${socket.id} ayrıldı`);
        lobby = lobby.filter(p => p.id !== socket.id);
        io.emit('update-lobby', lobby);

        for (const roomId in rooms) {
            const room = rooms[roomId];
            if (room.players.some(p => p.id === socket.id)) {
                socket.to(roomId).emit('opponent-left');
                delete rooms[roomId];
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Sunucu http://localhost:${PORT}`);
});
