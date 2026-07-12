const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Online havuzda bekleyen oyuncular
let onlinePool = [];
let activeRooms = {};

io.on('connection', (socket) => {
    console.log('Yeni bağlantı:', socket.id);

    socket.on('joinPool', (playerName) => {
        // Havuzda zaten varsa temizle
        onlinePool = onlinePool.filter(p => p.id !== socket.id);
        
        // Havuza ekle
        onlinePool.push({ id: socket.id, name: playerName });
        console.log(`${playerName} havuza girdi. Havuz mevcudu:`, onlinePool.length);

        // Havuzda en az 2 kişi varsa hemen eşleştir
        if (onlinePool.length >= 2) {
            const p1 = onlinePool.shift();
            const p2 = onlinePool.shift();
            const roomId = `room_${p1.id}_${p2.id}`;

            activeRooms[roomId] = {
                p1: { id: p1.id, name: p1.name },
                p2: { id: p2.id, name: p2.name }
            };

            // İki oyuncuyu da odaya al
            io.sockets.sockets.get(p1.id)?.join(roomId);
            io.sockets.sockets.get(p2.id)?.join(roomId);

            // Oyunculara rolleri ve rakip isimlerini bildir
            io.to(p1.id).emit('matchFound', { roomId, role: 1, opponentName: p2.name });
            io.to(p2.id).emit('matchFound', { roomId, role: 2, opponentName: p1.name });
            
            console.log(`Maç başladı: ${p1.name} vs ${p2.name}`);
        } else {
            socket.emit('waitingInPool');
        }
    });

    socket.on('updateState', (data) => {
        socket.to(data.roomId).emit('peerState', data.state);
    });

    socket.on('leaveOnline', () => {
        onlinePool = onlinePool.filter(p => p.id !== socket.id);
    });

    socket.on('disconnect', () => {
        onlinePool = onlinePool.filter(p => p.id !== socket.id);
        // Aktif odalardan düşen varsa diğerine bildir
        for (const roomId in activeRooms) {
            if (activeRooms[roomId].p1.id === socket.id || activeRooms[roomId].p2.id === socket.id) {
                io.to(roomId).emit('opponentDisconnected');
                delete activeRooms[roomId];
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Sunucu ${PORT} portunda aktif.`);
});
