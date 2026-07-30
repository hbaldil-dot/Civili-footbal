const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let lobbyPlayers = [];
let activeRooms = {};

io.on('connection', (socket) => {
    console.log(`Yeni bağlantı: ${socket.id}`);

    // --- LOBİ İŞLEMLERİ ---
    socket.on('join-lobby', (playerData) => {
        lobbyPlayers = lobbyPlayers.filter(p => p.id !== socket.id);
        lobbyPlayers.push({ 
            id: socket.id, 
            name: playerData.name,
            logo: playerData.logo || 'default.png'
        });
        console.log(`${playerData.name} lobiye katıldı. Logo: ${playerData.logo}`);
        broadcastLobbyUpdate();
    });

    // Oyuncu bilgilerini güncelle
    socket.on('update-player', (playerData) => {
        const player = lobbyPlayers.find(p => p.id === socket.id);
        if (player) {
            player.name = playerData.name;
            player.logo = playerData.logo || 'default.png';
            broadcastLobbyUpdate();
        }
    });

    socket.on('leave-lobby', () => {
        removePlayerFromLobby(socket.id);
    });

    socket.on('send-invite', (targetId) => {
        const sender = lobbyPlayers.find(p => p.id === socket.id);
        if (sender) {
            io.to(targetId).emit('receive-invite', {
                fromId: socket.id,
                fromName: sender.name,
                fromLogo: sender.logo || 'default.png'
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
                        { id: hostId, name: host.name, team: 1, ready: false, placedPins: [], logo: host.logo || 'default.png' },
                        { id: socket.id, name: guest.name, team: 2, ready: false, placedPins: [], logo: guest.logo || 'default.png' }
                    ]
                };

                io.to(hostId).emit('start-online-match', { 
                    roomId, 
                    team: 1,
                    opponentLogo: guest.logo || 'default.png'
                });
                
                io.to(socket.id).emit('start-online-match', { 
                    roomId, 
                    team: 2,
                    opponentLogo: host.logo || 'default.png'
                });
                
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

    // --- VURUŞ BAZLI SENKRONİZASYON ---
    socket.on('playerShot', ({ roomId, shotData }) => {
        socket.to(roomId).emit('opponentShot', shotData);
        console.log(`Vuruş iletildi: Oyuncu ${shotData.player}, Oda: ${roomId}`);
    });

    // --- PERİYODİK SENKRONİZASYON ---
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
// ... Mevcut server.js kodların (express, http server vb.) ...

io.on('connection', (socket) => {
    console.log('⚡ Bir kullanıcı bağlandı:', socket.id);

    // ... Varsa mevcut online maç/oyun dinleyicilerin (joinRoom, move, vs.) ...


    // ============================================================
    // YENİ EKLENEN: KAYIT, GİRİŞ VE ŞİFRE YÖNETİMİ
    // ============================================================
    
    // 1. KAYIT OL İŞLEMİ
    socket.on('registerUser', (data) => {
        const { username, email, password } = data;

        if (registeredUsers[email]) {
            socket.emit('authResponse', { success: false, message: 'Bu e-posta adresi zaten kayıtlı!' });
            return;
        }

        registeredUsers[email] = { username, password };
        console.log(`✅ Yeni Kayıt: ${username} (${email})`);

        socket.emit('authResponse', {
            success: true,
            action: 'register',
            username: username,
            message: 'Kayıt başarıyla oluşturuldu! Hoş geldin.'
        });
    });

    // 2. GİRİŞ YAP İŞLEMİ
    socket.on('loginUser', (data) => {
        const { email, password } = data;
        const user = registeredUsers[email];

        if (!user) {
            socket.emit('authResponse', { success: false, message: 'Bu e-posta adresiyle kayıtlı kullanıcı bulunamadı!' });
            return;
        }

        if (user.password !== password) {
            socket.emit('authResponse', { success: false, message: 'Hatalı şifre girdiniz!' });
            return;
        }

        console.log(`🔑 Giriş Başarılı: ${user.username}`);

        socket.emit('authResponse', {
            success: true,
            action: 'login',
            username: user.username,
            message: 'Giriş başarılı! Yönlendiriliyorsunuz...'
        });
    });

    // 3. ŞİFREMİ UNUTTUM İŞLEMİ
    socket.on('forgotPassword', (data) => {
        const { email } = data;

        if (!registeredUsers[email]) {
            socket.emit('authResponse', { success: false, message: 'Bu e-posta adresine ait bir hesap bulunamadı!' });
            return;
        }

        const userPassword = registeredUsers[email].password;

        socket.emit('authResponse', {
            success: true,
            action: 'forgot',
            message: `Şifre sıfırlama bağlantısı ${email} adresine gönderildi! (Test Şifreniz: ${userPassword})`
        });
    });

}); // <-- io.on('connection') KAPANMA PARANTEZİ

// Kullanıcı hafızası objesini de io.on'un hemen üstüne veya en tepeye koyabilirsin:
const registeredUsers = {};
