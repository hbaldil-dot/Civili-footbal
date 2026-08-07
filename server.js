const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer'); // YENİ
const fs = require('fs'); // YENİ

const app = express();
const server = http.createServer(app);

// ============================================================
// DOSYA YÜKLEME AYARLARI - YENİ
// ============================================================
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'logo-' + uniqueSuffix + '.png');
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: function (req, file, cb) {
        const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Sadece PNG, JPEG ve WEBP formatları desteklenir.'));
        }
    }
});

// ============================================================
// DOSYA YÜKLEME ROTASI - YENİ
// ============================================================
app.post('/upload-logo', upload.single('logo'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Dosya yüklenemedi!' });
        }
        
        const logoUrl = '/uploads/' + req.file.filename;
        console.log('✅ Logo yüklendi:', logoUrl);
        res.json({ success: true, logoUrl: logoUrl });
        
    } catch (error) {
        console.error('❌ Logo yükleme hatası:', error);
        res.status(500).json({ success: false, message: 'Logo yüklenirken hata oluştu!' });
    }
});

// Uploads klasörünü statik olarak sun
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================================
// OYUN AYARLARI
// ============================================================
let SHOT_DURATION = 5;

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
// KULLANICI ŞEMASI (GÜNCELLENDİ)
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
    teamName: {
        type: String,
        trim: true,
        maxlength: 30,
        default: ''
    },
    teamLogo: {
        type: String,
        trim: true,
        default: 'default.png'
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
const pendingShots = new Map();

function addShotToPending(roomId, playerId, shotData) {
    if (!pendingShots.has(roomId)) {
        pendingShots.set(roomId, {
            player1Shot: null,
            player2Shot: null,
            timeout: null
        });
    }
    
    const pending = pendingShots.get(roomId);
    const room = activeRooms[roomId];
    if (!room) return;
    
    const player = room.players.find(p => p.id === playerId);
    if (!player) return;
    
    if (player.team === 1) {
        pending.player1Shot = shotData;
        console.log(`📥 Takım 1 vuruşu alındı: ${roomId}`);
    } else if (player.team === 2) {
        pending.player2Shot = shotData;
        console.log(`📥 Takım 2 vuruşu alındı: ${roomId}`);
    }
    
    if (pending.timeout) {
        clearTimeout(pending.timeout);
        pending.timeout = null;
    }
    
    if (pending.player1Shot && pending.player2Shot) {
        console.log(`🎯 Her iki vuruş da alındı! ${roomId}`);
        io.to(roomId).emit('lockstep-shots', {
            shot1: pending.player1Shot,
            shot2: pending.player2Shot,
            timestamp: Date.now()
        });
        pendingShots.delete(roomId);
        return;
    }
    
    const waitTime = (SHOT_DURATION || 5) * 1000 + 1000;
    pending.timeout = setTimeout(() => {
        console.log(`⏰ Zaman aşımı: ${roomId}`);
        const singleShot = pending.player1Shot || pending.player2Shot;
        const shotTeam = pending.player1Shot ? 1 : 2;
        if (singleShot) {
            io.to(roomId).emit('lockstep-shots', {
                shot1: shotTeam === 1 ? singleShot : null,
                shot2: shotTeam === 2 ? singleShot : null,
                timestamp: Date.now(),
                timeout: true
            });
        }
        pendingShots.delete(roomId);
    }, waitTime);
}

// ============================================================
// SOCKET.IO OLAY DİNLEYİCİLERİ
// ============================================================
io.on('connection', (socket) => {
    console.log(`⚡ Yeni bağlantı: ${socket.id}`);
    console.log(`📱 Transport: ${socket.conn.transport.name}`);
    
    socket.on('upgrade', () => {
        console.log(`📱 Transport yükseltildi: ${socket.conn.transport.name}`);
    });

    socket.on('ping', () => {
        socket.emit('pong');
    });

    // ============================================================
    // AUTH İŞLEMLERİ
    // ============================================================

 // server.js - registerUser (GÜNCELLENDİ)
socket.on('registerUser', async (data) => {
    const { username, email, password, teamName, teamLogo } = data;

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

        // ★★★ LOGO KONTROLÜ ★★★
        let logoToSave = 'default.png';
        if (teamLogo && teamLogo !== 'default.png') {
            // Base64 ise default kullan (çok büyük)
            if (teamLogo.startsWith('data:')) {
                console.warn('⚠️ Base64 logo tespit edildi, default kullanılıyor');
                logoToSave = 'default.png';
            } else {
                logoToSave = teamLogo;
            }
        }
        
        console.log('📝 Kaydedilecek logo:', logoToSave);

        const newUser = new User({
            username: username.trim(),
            email: email.toLowerCase().trim(),
            password: password,
            teamName: teamName || '',
            teamLogo: logoToSave,
            lastLogin: new Date()
        });

        await newUser.save();
        console.log(`✅ Yeni kayıt: ${username} (${email})`);
        console.log(`🏆 Takım: ${newUser.teamName || 'İsimsiz'}, Logo: ${newUser.teamLogo}`);

        socket.emit('authResponse', {
            success: true,
            action: 'register',
            username: username,
            teamName: newUser.teamName,
            teamLogo: newUser.teamLogo, // ★★★ LOGO GÖNDER ★★★
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

// server.js - loginUser (GÜNCELLENDİ)
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
        console.log(`🏆 Takım: ${user.teamName || 'İsimsiz'}, Logo: ${user.teamLogo}`);

        socket.emit('authResponse', {
            success: true,
            action: 'login',
            username: user.username,
            teamName: user.teamName,
            teamLogo: user.teamLogo, // ★★★ LOGO GÖNDER ★★★
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
        
        lobbyPlayers = lobbyPlayers.filter(p => p.id !== socket.id);

        const player = {
            id: socket.id,
            name: playerData?.name || "Oyuncu",
            logo: playerData?.logo || "default.png"
        };

        lobbyPlayers.push(player);
        console.log(`👤 ${player.name} lobiye katıldı (${lobbyPlayers.length} oyuncu)`);

        io.emit('update-lobby-players', lobbyPlayers);
        socket.emit('update-lobby-players', lobbyPlayers);
    });

    socket.on('leave-lobby', () => {
        lobbyPlayers = lobbyPlayers.filter(p => p.id !== socket.id);
        io.emit('update-lobby-players', lobbyPlayers);
        console.log(`👤 Oyuncu lobiden ayrıldı: ${socket.id}`);
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
        if (!roomId || !activeRooms[roomId]) {
            console.warn('⚠️ Geçersiz oda:', roomId);
            return;
        }
        addShotToPending(roomId, socket.id, shotData);
    });

    socket.on('syncBallPosition', ({ roomId, ballState }) => {
        socket.to(roomId).emit('correctBallPosition', ballState);
    });

    socket.on('goal-scored', ({ roomId, scoringTeam }) => {
        console.log(`⚽ Gol! Takım ${scoringTeam} gol attı (Oda: ${roomId})`);
        socket.to(roomId).emit('opponent-goal', { scoringTeam });
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
