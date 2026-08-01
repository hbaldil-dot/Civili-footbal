const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);

// iOS Safari için CORS ve WebSocket ayarları
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
    allowEIO3: true,
    upgradeTimeout: 10000,
    maxHttpBufferSize: 1e8
});

// ============================================================
// MONGODB BAĞLANTISI
// ============================================================
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://hbaldil_db_user:8OZyS1gIcgLVLAtd@hbaldil.0whzqhn.mongodb.net/civili-futbol?retryWrites=true&w=majority";

async function connectDB() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ MongoDB Mongoose ile başarıyla bağlandı');
    } catch (err) {
        console.error('❌ MongoDB bağlantı hatası:', err.message);
    }
}

mongoose.connection.on('disconnected', () => {
    console.log('⚠️ MongoDB bağlantısı kesildi, yeniden bağlanılıyor...');
    setTimeout(connectDB, 5000);
});

process.on('SIGINT', async () => {
    await mongoose.connection.close();
    console.log('✅ MongoDB bağlantısı kapatıldı');
    process.exit(0);
});

connectDB();

// ============================================================
// KULLANICI ŞEMASI
// ============================================================
const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 30
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastLogin: {
        type: Date,
        default: Date.now
    },
    stats: {
        totalMatches: { type: Number, default: 0 },
        wins: { type: Number, default: 0 },
        losses: { type: Number, default: 0 },
        draws: { type: Number, default: 0 }
    }
});

userSchema.index({ email: 1 });
const User = mongoose.model('User', userSchema);

// ============================================================
// EXPRESS AYARLARI
// ============================================================
app.use(express.static(__dirname));
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    res.json({
        status: 'ok',
        database: dbStatus,
        timestamp: new Date().toISOString()
    });
});

// ============================================================
// BELLEK VERİLERİ
// ============================================================
let lobbyPlayers = [];
let activeRooms = {};

// ============================================================
// SOCKET.IO OLAY DİNLEYİCİLERİ - iOS Safari Uyumlu
// ============================================================
io.on('connection', (socket) => {
    console.log(`⚡ Yeni bağlantı: ${socket.id}`);
    console.log(`📱 Transport: ${socket.conn.transport.name}`);
    
    // iOS Safari için transport yükseltme
    socket.on('upgrade', () => {
        console.log(`📱 Transport yükseltildi: ${socket.conn.transport.name}`);
    });

    // Heartbeat (iOS Safari için)
    socket.on('ping', () => {
        socket.emit('pong');
    });

    // ============================================================
    // AUTH İŞLEMLERİ
    // ============================================================

    socket.on('registerUser', async (data) => {
        const { username, email, password } = data;

        if (!username || !email || !password) {
            socket.emit('authResponse', {
                success: false,
                message: 'Tüm alanları doldurun!'
            });
            return;
        }

        try {
            const existingUser = await User.findOne({ email: email.toLowerCase() });
            if (existingUser) {
                socket.emit('authResponse', {
                    success: false,
                    message: 'Bu e-posta adresi zaten kayıtlı!'
                });
                return;
            }

            const existingUsername = await User.findOne({ username: username });
            if (existingUsername) {
                socket.emit('authResponse', {
                    success: false,
                    message: 'Bu kullanıcı adı zaten alınmış!'
                });
                return;
            }

            const newUser = new User({
                username: username.trim(),
                email: email.toLowerCase().trim(),
                password: password,
                lastLogin: new Date()
            });

            await newUser.save();
            console.log(`✅ Yeni kayıt: ${username} (${email})`);

            socket.emit('authResponse', {
                success: true,
                action: 'register',
                username: username,
                message: 'Kayıt başarıyla oluşturuldu! Hoş geldin.'
            });

        } catch (error) {
            console.error('❌ Kayıt hatası:', error);
            socket.emit('authResponse', {
                success: false,
                message: 'Kayıt sırasında bir hata oluştu.'
            });
        }
    });

    socket.on('loginUser', async (data) => {
        const { email, password } = data;

        if (!email || !password) {
            socket.emit('authResponse', {
                success: false,
                message: 'E-posta ve şifre girin!'
            });
            return;
        }

        try {
            const user = await User.findOne({ email: email.toLowerCase().trim() });

            if (!user || user.password !== password) {
                socket.emit('authResponse', {
                    success: false,
                    message: 'E-posta veya şifre hatalı!'
                });
                return;
            }

            user.lastLogin = new Date();
            await user.save();

            console.log(`🔑 Giriş: ${user.username}`);

            socket.emit('authResponse', {
                success: true,
                action: 'login',
                username: user.username,
                message: 'Giriş başarılı!'
            });

        } catch (error) {
            console.error('❌ Giriş hatası:', error);
            socket.emit('authResponse', {
                success: false,
                message: 'Giriş sırasında bir hata oluştu.'
            });
        }
    });

    socket.on('forgotPassword', async (data) => {
        const { email } = data;
        try {
            const user = await User.findOne({ email: email.toLowerCase().trim() });
            if (!user) {
                socket.emit('authResponse', {
                    success: false,
                    message: 'Bu e-posta ile kayıtlı kullanıcı bulunamadı!'
                });
                return;
            }

            socket.emit('authResponse', {
                success: true,
                action: 'forgot',
                message: `Şifreniz: ${user.password}`
            });
        } catch (error) {
            console.error('❌ Şifre sıfırlama hatası:', error);
            socket.emit('authResponse', {
                success: false,
                message: 'İşlem hatası.'
            });
        }
    });

    // ============================================================
    // LOBBY İŞLEMLERİ
    // ============================================================

socket.on("join-lobby", (playerData) => {
    console.log(`📥 join-lobby alındı:`, playerData);
    console.log(`📱 Socket ID: ${socket.id}`);
    console.log(`📱 Transport: ${socket.conn.transport.name}`);
    
    // Eski kaydı kaldır
    lobbyPlayers = lobbyPlayers.filter(p => p.id !== socket.id);

    const player = {
        id: socket.id,
        name: playerData?.name || "Oyuncu",
        logo: playerData?.logo || "default.png"
    };

    lobbyPlayers.push(player);
    console.log(`👤 ${player.name} lobiye katıldı (${lobbyPlayers.length} oyuncu)`);
    console.log(`📊 Lobby listesi:`, lobbyPlayers);

    // TÜM oyunculara lobby listesini gönder
    io.emit('update-lobby-players', lobbyPlayers);
    
    // Yeni katılan oyuncuya özel olarak da gönder
    socket.emit('update-lobby-players', lobbyPlayers);
});

socket.on('leave-lobby', () => {
    lobbyPlayers = lobbyPlayers.filter(p => p.id !== socket.id);
    io.emit('update-lobby-players', lobbyPlayers);
    console.log(`👤 Oyuncu lobiden ayrıldı: ${socket.id}`);
    console.log(`📊 Kalan oyuncular:`, lobbyPlayers);
});

    // ============================================================
    // DAVET İŞLEMLERİ
    // ============================================================

    socket.on('send-invite', (targetId) => {
        const sender = lobbyPlayers.find(p => p.id === socket.id);
        if (sender) {
            console.log(`📨 Davet gönderiliyor: ${sender.name} -> ${targetId}`);
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
            io.emit('update-lobby-players', lobbyPlayers);

            const hostSocket = io.sockets.sockets.get(hostId);
            const guestSocket = io.sockets.sockets.get(socket.id);

            if (hostSocket && guestSocket) {
                hostSocket.join(roomId);
                guestSocket.join(roomId);

                activeRooms[roomId] = {
                    players: [
                        { id: hostId, name: host.name, team: 1, ready: false, placedPins: [], logo: host.logo || 'default.png' },
                        { id: socket.id, name: guest.name, team: 2, ready: false, placedPins: [], logo: guest.logo || 'default.png' }
                    ],
                    started: false
                };

                console.log(`🏠 Davet ile oda oluşturuldu: ${roomId} (${host.name} vs ${guest.name})`);

                io.to(hostId).emit('start-online-match', {
                    roomId: roomId,
                    team: 1,
                    opponentLogo: guest.logo || 'default.png'
                });

                io.to(socket.id).emit('start-online-match', {
                    roomId: roomId,
                    team: 2,
                    opponentLogo: host.logo || 'default.png'
                });
            }
        }
    });

    // ============================================================
    // MAÇ HAZIRLIK
    // ============================================================

    socket.on('player-ready', ({ roomId, team, placedPins }) => {
        const room = activeRooms[roomId];
        if (!room) {
            console.warn('⚠️ Oda bulunamadı:', roomId);
            return;
        }

        const player = room.players.find(p => p.id === socket.id);
        if (!player) {
            console.warn('⚠️ Oyuncu odada bulunamadı:', socket.id);
            return;
        }

        player.ready = true;
        if (placedPins) {
            player.placedPins = placedPins;
        }

        console.log(`✅ ${player.name} hazır (${roomId})`);

        room.players.forEach(p => {
            if (p.id !== socket.id) {
                io.to(p.id).emit('opponent-ready');
            }
        });

        const allReady = room.players.every(p => p.ready === true);
        if (allReady && room.players.length === 2) {
            room.started = true;

            const allPins = [];
            room.players.forEach(p => {
                if (p.placedPins && p.placedPins.length > 0) {
                    p.placedPins.forEach(pin => {
                        allPins.push({ x: pin.x, y: pin.y, team: p.team });
                    });
                }
            });

            console.log(`🎮 Maç başlıyor: ${roomId}`);

            io.to(roomId).emit('match-go', { pins: allPins });
        }
    });

    // ============================================================
    // OYUN SENKRONİZASYONU
    // ============================================================

    socket.on('sync-pin-move', ({ roomId, team, index, x, y }) => {
        socket.to(roomId).emit('sync-setup-pin-move', { team, index, x, y });
    });

    socket.on('playerShot', ({ roomId, shotData }) => {
        socket.to(roomId).emit('opponentShot', shotData);
    });

    socket.on('syncBallPosition', ({ roomId, ballState }) => {
        socket.to(roomId).emit('correctBallPosition', ballState);
    });

    // ============================================================
    // BAĞLANTI KESİLME
    // ============================================================

    socket.on('disconnect', () => {
        lobbyPlayers = lobbyPlayers.filter(p => p.id !== socket.id);
        io.emit('update-lobby-players', lobbyPlayers);
        console.log(`🔌 Bağlantı koptu: ${socket.id}`);

        for (const roomId in activeRooms) {
            const room = activeRooms[roomId];
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                room.players = room.players.filter(p => p.id !== socket.id);
                if (room.players.length === 0) {
                    delete activeRooms[roomId];
                    console.log(`🗑️ Oda silindi: ${roomId}`);
                } else {
                    io.to(roomId).emit('opponent-disconnected');
                    console.log(`👤 Oyuncu odadan ayrıldı: ${roomId}`);
                }
                break;
            }
        }
    });
});

// ============================================================
// SUNUCU BAŞLAT
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Sunucu ${PORT} portunda çalışıyor...`);
});
