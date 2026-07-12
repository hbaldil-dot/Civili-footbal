const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Render'ın index.html'i kesin bulabilmesi için statik klasör yolunu netleştiriyoruz
app.use(express.static(__dirname));

// Tarayıcı direkt siteye girdiğinde index.html'i zorunlu olarak fırlat diyoruz
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

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
        } else {
            socket.emit('roomFull');
        }
    });

    socket.on('updateState', (data) => {
        socket.to(data.roomId).emit('peerState', data.state);
    });

    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            io.to(roomId).emit('roomStatus', rooms[roomId].players.length);
            if (rooms[roomId].players.length === 0) {
                delete rooms[roomId];
            }
        }
    });
});

// Render için en kritik kısım: Portu 0.0.0.0 üzerinden dinlemek
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Sunucu ${PORT} portunda başarıyla çalışıyor.`);
});
