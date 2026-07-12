const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path'); // Dosya yolları için eklendi

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- KRİTİK EKSİK: index.html dosyasını tarayıcıya gönderme kodu ---
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
// -----------------------------------------------------------------

let lobbyPlayers = []; // Havuzdaki oyuncular

io.on('connection', (socket) => {
    
    // Lobiye katılma
    socket.on('join-lobby', (playerName) => {
        lobbyPlayers = lobbyPlayers.filter(p => p.id !== socket.id);
        lobbyPlayers.push({ id: socket.id, name: playerName });
        io.emit('update-lobby-players', lobbyPlayers);
    });

    // Lobiden ayrılma
    socket.on('leave-lobby', () => {
        lobbyPlayers = lobbyPlayers.filter(p => p.id !== socket.id);
        io.emit('update-lobby-players', lobbyPlayers);
    });

    // Davet gönderme
    socket.on('send-invite', (toId) => {
        io.to(toId).emit('receive-invite', socket.id);
    });

    // Davet kabul edildiğinde oda yarat ve maçı başlat
    socket.on('accept-invite', (fromId) => {
        const roomId = "room_" + fromId + "_" + socket.id;
        
        socket.join(roomId);
        io.sockets.sockets.get(fromId)?.join(roomId);

        // Havuzdan temizle
        lobbyPlayers = lobbyPlayers.filter(p => p.id !== socket.id && p.id !== fromId);
        io.emit('update-lobby-players', lobbyPlayers);

        // Takımları ata (1: Ev Sahibi, 2: Deplasman)
        io.to(fromId).emit('start-online-match', { roomId, team: 1 });
        io.to(socket.id).emit('start-online-match', { roomId, team: 2 });
    });

    // Vuruş verisini odadaki diğer oyuncuya aktar
    socket.on('player-shot', (data) => {
        socket.to(data.roomId).emit('opponent-shot', data);
    });

    socket.on('disconnect', () => {
        lobbyPlayers = lobbyPlayers.filter(p => p.id !== socket.id);
        io.emit('update-lobby-players', lobbyPlayers);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
