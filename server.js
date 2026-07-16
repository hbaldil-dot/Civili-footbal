const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Render.com için CORS ve transport ayarları
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Statik dosyaları doğrudan ana dizinden sunuyoruz
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Çevrimiçi havuzdaki (lobideki) aktif oyuncular listesi
let lobbyPlayers = [];

// Aktif oyun odaları
let activeRooms = {};

io.on('connection', (socket) => {
    console.log(`Yeni bağlantı: ${socket.id}`);

    // --- LOBİ İŞLEMLERİ ---
    socket.on('join-lobby', (playerName) => {
        lobbyPlayers = lobbyPlayers.filter(p => p.id !== socket.id);
        lobbyPlayers.push({ id: socket.id, name: playerName });
        console.log(`${playerName} lobiye katıldı.`);
        broadcastLobbyUpdate();
    });

    socket.on('leave-lobby', () => {
        removePlayerFromLobby(socket.id);
    });

    socket.on('send-invite', (targetId) => {
        const sender = lobbyPlayers.find(p => p.id === socket.id);
        if (sender) {
            io.to(targetId).emit('receive-invite', {
                fromId: socket.id,
                fromName: sender.name
            });
        }
    });

    socket.on('accept-invite', (hostId) => {
        const host = lobbyPlayers.find(p => p.id === hostId);
        const guest = lobbyPlayers.find(p => p.id === socket.id);

        if (host && guest) {
            const roomId = `room_${hostId}_${socket.id}`;
            lobbyPlayers = lobbyPlayers.filter(p => p.id !== hostId && p.id !== socket.id);
            broadcastLobbyUpdate();

            const hostSocket = io.sockets.sockets.get(hostId);
            const guestSocket = io.sockets.sockets.get(socket.id);

            if (hostSocket && guestSocket) {
                hostSocket.join(roomId);
                guestSocket.join(roomId);

                activeRooms[roomId] = {
                    players: [
                        { id: hostId, name: host.name, team: 1, ready: false, placedPins: [] },
                        { id: socket.id, name: guest.name, team: 2, ready: false, placedPins: [] }
                    ]
                };

                io.to(hostId).emit('start-online-match', { roomId, team: 1 });
                io.to(socket.id).emit('start-online-match', { roomId, team: 2 });
                console.log(`Maç başladı! Oda: ${roomId}`);
            }
        }
    });

    // --- DİZİLİŞ SENKRONİZASYONU ---
    socket.on('setup-pin-move', ({ roomId, team, index, x, y }) => {
        socket.to(roomId).emit('sync-setup-pin-move', { team, index, x, y });
    });

    socket.on('player-ready', ({ roomId, team, placedPins }) => {
        const room = activeRooms[roomId];
        if (!room) return;

        const player = room.players.find(p => p.team === team);
        if (player) {
            player.ready = true;
            player.placedPins = placedPins;
        }

        if (room.players.every(p => p.ready)) {
            const combinedPins = [
                ...room.players[0].placedPins,
                ...room.players[1].placedPins
            ];

            io.to(roomId).emit('match-go', { pins: combinedPins });
            console.log(`Dizilimler onaylandı, maç başlıyor. Oda: ${roomId}`);
        }
    });

    // --- YENİ: VURUŞ BAZLI SENKRONİZASYON ---
    socket.on('playerShot', ({ roomId, shotData }) => {
        // Vuruş verilerini diğer oyuncuya ilet
        socket.to(roomId).emit('opponentShot', shotData);
        console.log(`Vuruş iletildi: Oyuncu ${shotData.player}, Oda: ${roomId}`);
    });

    // --- YENİ: PERİYODİK SENKRONİZASYON (DÜZELTME) ---
    socket.on('syncBallPosition', ({ roomId, ballState }) => {
        socket.to(roomId).emit('correctBallPosition', ballState);
    });

    // --- BAĞLANTI KOPMASI ---
    socket.on('disconnect', () => {
        console.log(`Bağlantı koptu: ${socket.id}`);
        handlePlayerDisconnection(socket);
    });
});

function broadcastLobbyUpdate() {
    io.emit('update-lobby-players', lobbyPlayers);
}

function removePlayerFromLobby(socketId) {
    const lengthBefore = lobbyPlayers.length;
    lobbyPlayers = lobbyPlayers.filter(p => p.id !== socketId);
    if (lobbyPlayers.length !== lengthBefore) {
        broadcastLobbyUpdate();
    }
}

function handlePlayerDisconnection(socket) {
    removePlayerFromLobby(socket.id);

    for (const roomId in activeRooms) {
        const room = activeRooms[roomId];
        const isPlayerInRoom = room.players.some(p => p.id === socket.id);

        if (isPlayerInRoom) {
            socket.to(roomId).emit('opponent-disconnected');
            console.log(`Oda kapatıldı (${roomId}), oyuncu ayrıldı.`);
            delete activeRooms[roomId];
            break;
        }
    }
}

// Render.com için PORT ve host ayarı
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Sunucu http://0.0.0.0:${PORT} portunda başarıyla çalışıyor!`);
});
