const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose'); // MongoDB kütüphanesi

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// ============================================================
// MONGODB BAĞLANTISI VE MODEL TANIMI
// ============================================================
// Buradaki URL'yi MongoDB Atlas'tan aldığınız URL ile değiştirin:
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://<db_username>:8OZyS1gIcgLVLAtd@hbaldil.0whzqhn.mongodb.net/?appName=hbaldil";


mongoose.connect(MONGODB_URI)
    .then(() => console.log('🍃 MongoDB bağlantısı başarıyla kuruldu!'))
    .catch((err) => console.error('❌ MongoDB bağlantı hatası:', err));

// Kullanıcı Şeması (Veritabanında tutulacak yapı)
const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// BELLEK (MEMORY) VERİ ALANLARI (Maçlar ve Lobiler anlık olduğu için RAM'de kalmaya devam ediyor)
let lobbyPlayers = [];
let activeRooms = {};

io.on('connection', (socket) => {
    console.log(`⚡ Yeni bağlantı: ${socket.id}`);

    // ============================================================
    // AUTH (GİRİŞ, KAYIT, ŞİFRE) İŞLEMLERİ - MONGODB ENTEGRASYONLU
    // ============================================================
    socket.on('registerUser', async (data) => {
        const { username, email, password } = data;

        try {
            // E-posta daha önce kayıt olunmuş mu kontrol et
            const existingUser = await User.findOne({ email: email.toLowerCase() });
            if (existingUser) {
                socket.emit('authResponse', { success: false, message: 'Bu e-posta adresi zaten kayıtlı!' });
                return;
            }

            // Yeni kullanıcıyı MongoDB'ye kaydet
            const newUser = new User({
                username,
                email: email.toLowerCase(),
                password // İleride güvenlik için bcrypt ile şifreleyebilirsiniz
            });

            await newUser.save();
            console.log(`✅ Yeni Kayıt Veritabanına Eklendi: ${username} (${email})`);

            socket.emit('authResponse', {
                success: true,
                action: 'register',
                username: username,
                message: 'Kayıt başarıyla oluşturuldu! Hoş geldin.'
            });
        } catch (error) {
            console.error('Kayıt hatası:', error);
            socket.emit('authResponse', { success: false, message: 'Kayıt sırasında bir sunucu hatası oluştu.' });
        }
    });

    socket.on('loginUser', async (data) => {
        const { email, password } = data;

        try {
            // Kullanıcıyı veritabanında ara
            const user = await User.findOne({ email: email.toLowerCase() });

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
        } catch (error) {
            console.error('Giriş hatası:', error);
            socket.emit('authResponse', { success: false, message: 'Giriş sırasında bir sunucu hatası oluştu.' });
        }
    });

    socket.on('forgotPassword', async (data) => {
        const { email } = data;

        try {
            const user = await User.findOne({ email: email.toLowerCase() });

            if (!user) {
                socket.emit('authResponse', { success: false, message: 'Bu e-posta adresine ait bir hesap bulunamadı!' });
                return;
            }

            socket.emit('authResponse', {
                success: true,
                action: 'forgot',
                message: `Şifre sıfırlama bağlantısı ${email} adresine gönderildi! (Test Şifreniz: ${user.password})`
            });
        } catch (error) {
            console.error('Şifre unuttum hatası:', error);
            socket.emit('authResponse', { success: false, message: 'İşlem sırasında hata oluştu.' });
        }
    });

    // ============================================================
    // ONLINE LOBİ & MAÇ İŞLEMLERİ (Aynen Kalıyor)
    // ============================================================
    socket.on('join-lobby', (playerData) => {
        lobbyPlayers = lobbyPlayers.filter(p => p.id !== socket.id);
        lobbyPlayers.push({ 
            id: socket.id, 
            name: playerData ? playerData.name : 'Oyuncu',
            logo: (playerData && playerData.logo) || 'default.png'
        });
        console.log(`${playerData ? playerData.name : 'Oyuncu'} lobiye katıldı.`);
        broadcastLobbyUpdate();
    });

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

    // --- VURUŞ VE SENKRONİZASYON ---
    socket.on('playerShot', ({ roomId, shotData }) => {
        socket.to(roomId).emit('opponentShot', shotData);
    });

    socket.on('syncBallPosition', ({ roomId, ballState }) => {
        socket.to(roomId).emit('correctBallPosition', ballState);
    });

    // --- BAĞLANTI KOPMASI ---
    socket.on('disconnect', () => {
        console.log(`🔌 Bağlantı koptu: ${socket.id}`);
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Sunucu ${PORT} portunda dinlemede...`));
