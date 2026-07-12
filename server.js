const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, '')));

let rooms = {};

io.on('connection', (socket) => {
    console.log('Kullanıcı bağlandı:', socket.id);

    socket.on('joinRoom', (roomId) => {
        if (!rooms[roomId]) {
            rooms[roomId] = { players: [], gameState: null };
        }

        if (rooms[roomId].players.length < 2) {
            const role = rooms[roomId].players.length === 0 ? 1 : 2;
            rooms[roomId].players.push({ id: socket.id, role: role });
            socket.join(roomId);
            
            socket.emit('initPlayer', role);
            io.to(roomId).emit('roomStatus', rooms[roomId].players.length);
            
            console.log(`Kullanıcı ${socket.id}, ${roomId} odasına ${role}. oyuncu olarak katıldı.`);
        } else {
            socket.emit('roomFull');
        }
    });

    // Mekaniğin ve hareketlerin senkronizasyonu
    socket.on('updateState', (data) => {
        socket.to(data.roomId).emit('peerState', data.state);
    });

    socket.on('disconnect', () => {
        console.log('Kullanıcı ayrıldı:', socket.id);
        for (const roomId in rooms) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            io.to(roomId).emit('roomStatus', rooms[roomId].players.length);
            if (rooms[roomId].players.length === 0) {
                delete rooms[roomId];
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
