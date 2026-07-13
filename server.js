const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Statik dosyaları sunmak için index.html'in olduğu klasörü gösteriyoruz
app.use(express.static(path.join(__dirname, '')));

let lobbyPlayers = []; // Aktif olarak havuzda bekleyen oyuncular { id, name }
let activeMatches = {}; // Aktif odalar ve maç durumları

io.on('connection', (socket) => {
    console.log('Oyuncu bağlandı:', socket.id);

    // 1. Oyuncu Havuza (Lobiye) Giriyor
    socket.on('join-lobby', (playerName) => {
        // Eski kayıtları temizle ve yeni isimle ekle
        lobbyPlayers = lobbyPlayers.filter(p => p.id !== socket.id);
        lobbyPlayers.push({ id: socket.id, name: playerName });
        
        // Güncel havuz listesini herkese yayınla
        io.emit('update-lobby-players', lobbyPlayers);
    });

    // 2. Oyuncu Lobiden Çıkıyor
    socket.on('leave-lobby', () => {
        lobbyPlayers = lobbyPlayers.filter(p => p.id !== socket.id);
        io.emit('update-lobby-players', lobbyPlayers);
    });

    // 3. Davet Gönderme
    socket.on('send-invite', (targetId) => {
        const sender = lobbyPlayers.find(p => p.id === socket.id);
        if (sender) {
            io.to(targetId).emit('receive-invite', { fromId: socket.id, fromName: sender.name });
        }
    });

    // 4. Davet Kabul Edildiğinde Oda Kurma
    socket.on('accept-invite', (fromId) => {
        const roomId = `room_${fromId}_${socket.id}`;
        
        // İki oyuncuyu da lobi listesinden çıkarıyoruz
        lobbyPlayers = lobbyPlayers.filter(p => p.id !== socket.id && p.id !== fromId);
        io.emit('update-lobby-players', lobbyPlayers);

        // Soketleri odaya sokuyoruz
        socket.join(roomId);
        const inviterSocket = io.sockets.sockets.get(fromId);
        if (inviterSocket) {
            inviterSocket.join(roomId);
        }

        // Maç verisini oluştur
        activeMatches[roomId] = {
            players: [
                { id: fromId, team: 1, ready: false },
                { id: socket.id, team: 2, ready: false }
            ]
        };

        // Oyunculara maçın başladığını ve takımlarını bildiriyoruz
        io.to(fromId).emit('start-online-match', { roomId, team: 1 });
        io.to(socket.id).emit('start-online-match', { roomId, team: 2 });
    });

    // 5. Oyuncu Kadrosunu Yerleştirdi ve "BAŞLAT"a Bastı
    socket.on('player-ready', ({ roomId, team, placedPins }) => {
        const match = activeMatches[roomId];
        if (!match) return;

        // Hazır olan oyuncuyu güncelle ve dizilimini kaydet
        const player = match.players.find(p => p.team === team);
        if (player) {
            player.ready = true;
            player.pins = placedPins;
        }

        // Her iki oyuncu da hazır mı?
        const allReady = match.players.every(p => p.ready);
        if (allReady) {
            // İki oyuncunun dizilimini birleştirip oyunu resmen başlatıyoruz
            const finalPins = [
                // Kale direkleri standart
                {x: 180 - (11 * 2 * 3.2)/2, y: 12, isPost: true}, {x: 180 + (11 * 2 * 3.2)/2, y: 12, isPost: true},
                {x: 180 - (11 * 2 * 3.2)/2, y: 620 - 12, isPost: true}, {x: 180 + (11 * 2 * 3.2)/2, y: 620 - 12, isPost: true}
            ];

            // 1. Oyuncunun taşları (Alt Yarı Saha)
            const p1 = match.players.find(p => p.team === 1);
            p1.pins.forEach(pin => finalPins.push({ x: pin.x, y: pin.y, team: 1 }));

            // 2. Oyuncunun taşları (Üst Yarı Saha - Ters simetrisi alınarak yerleştirilir)
            const p2 = match.players.find(p => p.team === 2);
            p2.pins.forEach(pin => {
                // Diğer oyuncunun ekranına göre üst yarıya simetrik yerleştirme:
                // Kendi ekranında alt yarıda yerleştirdiği x, y değerlerini ters çevirip üst yarıya koyuyoruz.
                finalPins.push({ x: 360 - pin.x, y: 620 - pin.y, team: 2 });
            });

            io.to(roomId).emit('match-go', { pins: finalPins });
        }
    });

    // 6. Maç Esnasında Fizik ve Sıra Güncellemeleri
    socket.on('updateState', (data) => {
        socket.to(data.roomId).emit('peerState', data.state);
    });

    // Bağlantı Koptuğunda
    socket.on('disconnect', () => {
        console.log('Kullanıcı ayrıldı:', socket.id);
        lobbyPlayers = lobbyPlayers.filter(p => p.id !== socket.id);
        io.emit('update-lobby-players', lobbyPlayers);

        // Aktif odalardan bu oyuncunun olduğu maçı bul ve odadaki diğer kişiye bildir
        for (const roomId in activeMatches) {
            const hasPlayer = activeMatches[roomId].players.some(p => p.id === socket.id);
            if (hasPlayer) {
                socket.to(roomId).emit('opponent-disconnected');
                delete activeMatches[roomId];
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda aktif.`);
});
