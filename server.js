const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
// 'public' klasörünü statik olarak dışarıya açar
app.use(express.static(path.join(__dirname, 'public')));
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// ============================================================
// MONGODB BAĞLANTISI - DÜZELTİLMİŞ
// ============================================================

const uri = "mongodb+srv://hbaldil_db_user:8OZyS1gIcgLVLAtd@hbaldil.0whzqhn.mongodb.net/civili-futbol?retryWrites=true&w=majority&appName=hbaldil";

async function connectDB() {
    try {
        await mongoose.connect(uri);
        console.log("✅ MongoDB bağlantısı Mongoose ile başarıyla kuruldu!");
    } catch (err) {
        console.error("❌ MongoDB bağlantı hatası:", err.message);
        setTimeout(connectDB, 5000);
    }
}

// Bağlantı olaylarını dinle
mongoose.connection.on('connected', () => {
    console.log('✅ Mongoose veritabanına bağlandı');
});

mongoose.connection.on('error', (err) => {
    console.error('❌ Mongoose bağlantı hatası:', err.message);
});

mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ Mongoose bağlantısı kesildi, yeniden bağlanılıyor...');
});

// Uygulama kapanırken bağlantıyı güvenli kapat
process.on('SIGINT', async () => {
    await mongoose.connection.close();
    console.log('✅ MongoDB bağlantısı kapatıldı');
    process.exit(0);
});

// Bağlantıyı başlat
connectDB();
// ============================================================
// KULLANICI ŞEMASI (MODEL)
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

// Email indeksi oluştur (performans için)
userSchema.index({ email: 1 });

const User = mongoose.model('User', userSchema);

// ============================================================
// EXPRESS AYARLARI
// ============================================================

app.use(express.static(__dirname));
app.use(express.json()); // JSON body parser

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint (Render.com için)
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
// SOCKET.IO OLAY DİNLEYİCİLERİ
// ============================================================

io.on('connection', (socket) => {
    console.log(`⚡ Yeni bağlantı: ${socket.id}`);

    // ============================================================
    // KAYIT İŞLEMİ
    // ============================================================
    socket.on('registerUser', async (data) => {
        const { username, email, password } = data;

        // Validasyon
        if (!username || !email || !password) {
            socket.emit('authResponse', { 
                success: false, 
                message: 'Tüm alanları doldurun!' 
            });
            return;
        }

        try {
            // E-posta kontrolü
            const existingUser = await User.findOne({ email: email.toLowerCase() });
            if (existingUser) {
                socket.emit('authResponse', { 
                    success: false, 
                    message: 'Bu e-posta adresi zaten kayıtlı!' 
                });
                return;
            }

            // Kullanıcı adı kontrolü
            const existingUsername = await User.findOne({ username: username });
            if (existingUsername) {
                socket.emit('authResponse', { 
                    success: false, 
                    message: 'Bu kullanıcı adı zaten alınmış!' 
                });
                return;
            }

            // Yeni kullanıcı oluştur
            const newUser = new User({
                username: username.trim(),
                email: email.toLowerCase().trim(),
                password: password, // İleride bcrypt ile şifrele
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
                message: 'Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.' 
            });
        }
    });

    // ============================================================
    // GİRİŞ İŞLEMİ
    // ============================================================
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

            if (!user) {
                socket.emit('authResponse', { 
                    success: false, 
                    message: 'Bu e-posta ile kayıtlı kullanıcı bulunamadı!' 
                });
                return;
            }

            if (user.password !== password) {
                socket.emit('authResponse', { 
                    success: false, 
                    message: 'Hatalı şifre!' 
                });
                return;
            }

            // Son giriş tarihini güncelle
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

    // ============================================================
    // ŞİFRE UNUTTUM
    // ============================================================
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

            // Gerçek bir mail sistemi yoksa şifreyi göster (geliştirme aşamasında)
            socket.emit('authResponse', {
                success: true,
                action: 'forgot',
                message: `Şifre sıfırlama bağlantısı ${email} adresine gönderildi! (Test: ${user.password})`
            });

        } catch (error) {
            console.error('❌ Şifre sıfırlama hatası:', error);
            socket.emit('authResponse', { 
                success: false, 
                message: 'İşlem sırasında bir hata oluştu.' 
            });
        }
    });

    // ============================================================
    // PROFİL GÜNCELLEME
    // ============================================================
    socket.on('updateProfile', async (data) => {
        const { email, username, newPassword } = data;

        try {
            const user = await User.findOne({ email: email.toLowerCase().trim() });
            if (!user) {
                socket.emit('profileUpdateResponse', { 
                    success: false, 
                    message: 'Kullanıcı bulunamadı!' 
                });
                return;
            }

            if (username) user.username = username;
            if (newPassword) user.password = newPassword;

            await user.save();
            
            socket.emit('profileUpdateResponse', {
                success: true,
                message: 'Profil güncellendi!'
            });

        } catch (error) {
            console.error('❌ Profil güncelleme hatası:', error);
            socket.emit('profileUpdateResponse', { 
                success: false, 
                message: 'Güncelleme sırasında hata oluştu.' 
            });
        }
    });

    // ============================================================
    // İSTATİSTİK GÜNCELLEME
    // ============================================================
    socket.on('updateStats', async (data) => {
        const { email, stats } = data;

        try {
            const user = await User.findOne({ email: email.toLowerCase().trim() });
            if (!user) return;

            user.stats.totalMatches = (user.stats.totalMatches || 0) + (stats.totalMatches || 0);
            user.stats.wins = (user.stats.wins || 0) + (stats.wins || 0);
            user.stats.losses = (user.stats.losses || 0) + (stats.losses || 0);
            user.stats.draws = (user.stats.draws || 0) + (stats.draws || 0);

            await user.save();
            
            socket.emit('statsUpdateResponse', {
                success: true,
                stats: user.stats
            });

        } catch (error) {
            console.error('❌ İstatistik güncelleme hatası:', error);
        }
    });

    // ============================================================
    // ONLINE LOBBY İŞLEMLERİ (Aynı)
    // ============================================================
    socket.on('join-lobby', (playerData) => {
        lobbyPlayers = lobbyPlayers.filter(p => p.id !== socket.id);
        lobbyPlayers.push({ 
            id: socket.id, 
            name: playerData?.name || 'Oyuncu',
            logo: playerData?.logo || 'default.png'
        });
        console.log(`${playerData?.name || 'Oyuncu'} lobiye katıldı.`);
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
                
                console.log(`🎮 Maç başladı! Oda: ${roomId}`);
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
            console.log(`✅ Dizilimler onaylandı, maç başlıyor. Oda: ${roomId}`);
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

// ============================================================
// YARDIMCI FONKSİYONLAR
// ============================================================

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
            console.log(`❌ Oda kapatıldı (${roomId}), oyuncu ayrıldı.`);
            delete activeRooms[roomId];
            break;
        }
    }
}

// ============================================================
// SUNUCUYU BAŞLAT
// ============================================================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Sunucu ${PORT} portunda çalışıyor...`);
    console.log(`🔗 http://localhost:${PORT}`);
});
