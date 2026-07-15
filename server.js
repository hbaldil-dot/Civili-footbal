const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// İstemci dosyalarını (index.html, resimler vb.) sunmak için public klasörünü belirliyoruz
app.use(express.static(path.join(__dirname, 'public')));

// Ana sayfa isteğinde index.html dosyasını gönder
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Çevrimiçi havuzdaki (lobideki) aktif oyuncular listesi
let lobbyPlayers = [];

// Aktif oyun odaları
// Yapısı: { [roomId]: { players: [ { id, name, team, ready, placedPins: [] } ] } }
let activeRooms = {};

io.on('connection', (socket) => {
    console.log(`Yeni bağlantı: ${socket.id}`);

    // --- LOBİ (HAVUZ) İŞLEMLERİ ---

    // Oyuncu lobiye katıldığında
    socket.on('join-lobby', (playerName) => {
        // Eğer zaten lobideyse mükerrer kaydı önle
        lobbyPlayers = lobbyPlayers.filter(p => p.id !== socket.id);
        
        lobbyPlayers.push({
            id: socket.id,
            name: playerName
        });

        console.log(`${playerName} lobiye katıldı.`);
        broadcastLobbyUpdate();
    });

    // Oyuncu lobiden ayrıldığında
    socket.on('leave-lobby', () => {
        removePlayerFromLobby(socket.id);
    });

    // Davet gönderme
    socket.on('send-invite', (targetId) => {
        const sender = lobbyPlayers.find(p => p.id === socket.id);
        if (sender) {
            io.to(targetId).emit('receive-invite', {
                fromId: socket.id,
                fromName: sender.name
            });
        }
    });

    // Davet kabul edildiğinde odayı ve maçı oluşturma
    socket.on('accept-invite', (hostId) => {
        const host = lobbyPlayers.find(p => p.id === hostId);
        const guest = lobbyPlayers.find(p => p.id === socket.id);

        if (host && guest) {
            const roomId = `room_${hostId}_${socket.id}`;

            // İki oyuncuyu da lobi listesinden çıkarıyoruz
            lobbyPlayers = lobbyPlayers.filter(p => p.id !== hostId && p.id !== socket.id);
            broadcastLobbyUpdate();

            // Sockets odaya katılır
            const hostSocket = io.sockets.sockets.get(hostId);
            const guestSocket = io.sockets.sockets.get(socket.id);

            if (hostSocket && guestSocket) {
                hostSocket.join(roomId);
                guestSocket.join(roomId);

                // Odayı kaydet
                activeRooms[roomId] = {
                    players: [
                        { id: hostId, name: host.name, team: 1, ready: false, placedPins: [] },
                        { id: socket.id, name: guest.name, team: 2, ready: false, placedPins: [] }
                    ]
                };

                // Oyunculara maçın başladığını ve takım numaralarını bildir
                io.to(hostId).emit('start-online-match', { roomId, team: 1 });
                io.to(socket.id).emit('start-online-match', { roomId, team: 2 });
                
                console.log(`Maç başladı! Oda: ${roomId}`);
            }
        }
    });


    // --- MAÇ KURULUM (SETUP) VE DİZİLİŞ SENKRONİZASYONU ---

    // RAKİBİN EKRANINDA ANINDA SÜRÜKLENEN TAŞI GÖSTEREN KRİTİK OLAY
    socket.on('setup-pin-move', ({ roomId, team, index, x, y }) => {
        // Sürükleme bilgisini odadaki diğer oyuncuya anında fırlatır
        socket.to(roomId).emit('sync-setup-pin-move', { team, index, x, y });
    });

    // Oyuncu kadrosunu onaylayıp "BAŞLAT" butonuna bastığında
    socket.on('player-ready', ({ roomId, team, placedPins }) => {
        const room = activeRooms[roomId];
        if (!room) return;

        const player = room.players.find(p => p.team === team);
        if (player) {
            player.ready = true;
            // Gelen koordinatları oyuncunun takım numarasıyla işaretleyerek kaydet
            player.placedPins = placedPins.map(p => ({ x: p.x, y: p.y, team: team }));
        }

        // İki oyuncu da hazır mı?
        if (room.players.every(p => p.ready)) {
            // İki takımın dizilimini birleştir
            const combinedPins = [
                ...room.players[0].placedPins,
                ...room.players[1].placedPins
            ];

            // Maçı başlat ve birleştirilmiş dizilimi iki tarafa da gönder
            io.to(roomId).emit('match-go', { pins: combinedPins });
            console.log(`Dizilimler onaylandı, maç oynanış aşamasına geçiyor. Oda: ${roomId}`);
        }
    });


    // --- MAÇ İÇİ (PLAYING) CANLI DURUM SENKRONİZASYONU ---

    // Topun fizikleri, hızları, sıralar ve skor güncellemelerini eşitleme
    socket.on('updateState', ({ roomId, state }) => {
        // Bu veriyi odadaki diğer oyuncuya (rakibe) aktarır
        socket.to(roomId).emit('peerState', state);
    });


    // --- BAĞLANTI KOPMA VE AYRILMA DURUMLARI ---

    socket.on('disconnect', () => {
        console.log(`Bağlantı koptu: ${socket.id}`);
        handlePlayerDisconnection(socket);
    });
});

// Lobideki oyuncular listesini tüm lobi sakinlerine güncellenmiş olarak gönderir
function broadcastLobbyUpdate() {
    io.emit('update-lobby-players', lobbyPlayers);
}

// Oyuncuyu lobiden temizleyen yardımcı fonksiyon
function removePlayerFromLobby(socketId) {
    const lengthBefore = lobbyPlayers.length;
    lobbyPlayers = lobbyPlayers.filter(p => p.id !== socketId);
    if (lobbyPlayers.length !== lengthBefore) {
        broadcastLobbyUpdate();
    }
}

// Oyuncu koptuğunda veya çıkış yaptığında odayı temizleyen ve rakibe bilgi veren fonksiyon
function handlePlayerDisconnection(socket) {
    // Önce lobideyse lobiden temizle
    removePlayerFromLobby(socket.id);

    // Aktif bir odada mıydı kontrol et
    for (const roomId in activeRooms) {
        const room = activeRooms[roomId];
        const isPlayerInRoom = room.players.some(p => p.id === socket.id);

        if (isPlayerInRoom) {
            // Rakibe bağlantının koptuğunu haber ver
            socket.to(roomId).emit('opponent-disconnected');
            console.log(`Oda kapatıldı (${roomId}), çünkü oyunculardan biri ayrıldı.`);
            delete activeRooms[roomId];
            break;
        }
    }
}

// Port tanımı ve sunucunun başlatılması
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} portunda başarıyla çalışıyor!`);
});
