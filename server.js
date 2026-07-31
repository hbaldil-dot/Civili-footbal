const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);

// CORS ve WebSocket ayarları - iOS Safari için optimize
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
        console.log('✅ MongoDB bağlantısı başarılı');
    } catch (err) {
        console.error('❌ MongoDB bağlantı hatası:', err.message);
    }
}

mongoose.connection.on('disconnected', () => {
    console.log('⚠️ MongoDB bağlantısı kesildi, yeniden bağlanılıyor...');
    setTimeout(connectDB, 5000);
});

connectDB();

// ============================================================
// KULLANICI ŞEMASI
// ============================================================
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, trim: true, minlength: 2, maxlength: 30 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date, default: Date.now },
    stats: {
        totalMatches: { type: Number, default: 0 },
        wins: { type: Number, default: 0 },
        losses: { type: Number, default: 0 },
        draws: { type: Number, default: 0 }
    }
});

const User = mongoose.model('User', userSchema);

// ============================================================
// EXPRESS AYARLARI
// ============================================================
app.use(express.static(__dirname));
app.use(express.json());

// CORS headers - iOS Safari için
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

// ============================================================
// BELLEK VERİLERİ
// ============================================================
let lobbyPlayers = [];
let activeRooms = {};
let roomIdCounter = 1000;
let playerSessions = {};

// ============================================================
// SOCKET.IO OLAY DİNLEYİCİLERİ
// ============================================================
io.on('connection', (socket) => {
    console.log(`⚡ Yeni bağlantı: ${socket.id} (${socket.handshake.address})`);
    let playerName = 'Oyuncu';
    let playerLogo = 'default.png';

    // iOS Safari için heartbeat
    socket.on('ping', () => {
        socket.emit('pong');
    });

    // ============================================================
    // AUTH İŞLEMLERİ
    // ============================================================
    
    socket.on('registerUser', async (data) => {
        const { username, email, password } = data;
        if (!username || !email || !password) {
            socket.emit('authResponse', { success: false, message: 'Tüm alanları doldurun!' });
            return;
        }
        try {
            const existingUser = await User.findOne({ email: email.toLowerCase() });
            if (existingUser) {
                socket.emit('authResponse', { success: false, message: 'Bu e-posta zaten kayıtlı!' });
                return;
            }
            const existingUsername = await User.findOne({ username: username });
            if (existingUsername) {
                socket.emit('authResponse', { success: false, message: 'Bu kullanıcı adı zaten alınmış!' });
                return;
            }
            const newUser = new User({
                username: username.trim(),
                email: email.toLowerCase().trim(),
                password: password,
                lastLogin: new Date()
            });
            await newUser.save();
            socket.emit('authResponse', {
                success: true,
                action: 'register',
                username: username,
                message: 'Kayıt başarılı!'
            });
        } catch (error) {
            console.error('❌ Kayıt hatası:', error);
            socket.emit('authResponse', { success: false, message: 'Kayıt hatası oluştu.' });
        }
    });

    socket.on('loginUser', async (data) => {
        const { email, password } = data;
        if (!email || !password) {
            socket.emit('authResponse', { success: false, message: 'E-posta ve şifre girin!' });
            return;
        }
        try {
            const user = await User.findOne({ email: email.toLowerCase().trim() });
            if (!user || user.password !== password) {
                socket.emit('authResponse', { success: false, message: 'E-posta veya şifre hatalı!' });
                return;
            }
            user.lastLogin = new Date();
            await user.save();
            socket.emit('authResponse', {
                success: true,
                action: 'login',
                username: user.username,
                message: 'Giriş başarılı!'
            });
        } catch (error) {
            console.error('❌ Giriş hatası:', error);
            socket.emit('authResponse', { success: false, message: 'Giriş hatası oluştu.' });
        }
    });

    socket.on('forgotPassword', async (data) => {
        const { email } = data;
        try {
            const user = await User.findOne({ email: email.toLowerCase().trim() });
            if (!user) {
                socket.emit('authResponse', { success: false, message: 'Kullanıcı bulunamadı!' });
                return;
            }
            socket.emit('authResponse', {
                success: true,
                action: 'forgot',
                message: `Şifreniz: ${user.password}`
            });
        } catch (error) {
            socket.emit('authResponse', { success: false, message: 'İşlem hatası.' });
        }
    });

    // ============================================================
    // LOBBY İŞLEMLERİ
    // ============================================================

    socket.on('join-lobby', (data) => {
        playerName = data?.name || 'Oyuncu';
        playerLogo = data?.logo || 'default.png';
        
        // Eski kayıt varsa kaldır
        lobbyPlayers = lobbyPlayers.filter(p => p.id !== socket.id);
        
        lobbyPlayers.push({
            id: socket.id,
            name: playerName,
            logo: playerLogo
        });
        
        playerSessions[socket.id] = { name: playerName, logo: playerLogo };
        
        console.log(`👤 ${playerName} lobiye katıldı (${lobbyPlayers.length} oyuncu)`);
        
        // Güncel lobby listesini tüm istemcilere gönder
        io.emit('lobby-update', lobbyPlayers);
        
        // Yeni katılan oyuncuya özel lobby listesi gönder
        socket.emit('lobby-update', lobbyPlayers);
    });

    socket.on('leave-lobby', () => {
        lobbyPlayers = lobbyPlayers.filter(p => p.id !== socket.id);
        delete playerSessions[socket.id];
        io.emit('lobby-update', lobbyPlayers);
        console.log(`👤 ${playerName} lobiden ayrıldı`);
    });

    // ============================================================
    // ODA İŞLEMLERİ - GÜNCELLENMİŞ
    // ============================================================

    socket.on('create-room', (data) => {
        const name = data?.name || playerName || 'Oyuncu';
        const logo = data?.logo || playerLogo || 'default.png';
        
        // Benzersiz oda kodu oluştur
        let roomId;
        let attempts = 0;
        do {
            roomId = `R${String(roomIdCounter++).padStart(3, '0')}`;
            attempts++;
        } while (activeRooms[roomId] && attempts < 100);
        
        activeRooms[roomId] = {
            host: socket.id,
            players: [{
                id: socket.id,
                name: name,
                logo: logo,
                isHost: true,
                isReady: false
            }],
            started: false,
            createdAt: Date.now()
        };
        
        socket.join(roomId);
        socket.emit('room-created', { roomId });
        
        // Oda güncellemesini gönder
        const roomUpdate = {
            roomId,
            playerCount: 1,
            players: activeRooms[roomId].players
        };
        socket.emit('room-update', roomUpdate);
        
        console.log(`🏠 Oda oluşturuldu: ${roomId} (${name})`);
    });

    socket.on('join-room', (data) => {
        const { roomId, name, logo } = data;
        const room = activeRooms[roomId];
        
        if (!room) {
            socket.emit('room-join-error', { message: 'Oda bulunamadı!' });
            return;
        }
        
        if (room.started) {
            socket.emit('room-join-error', { message: 'Maç başlamış!' });
            return;
        }
        
        if (room.players.length >= 2) {
            socket.emit('room-join-error', { message: 'Oda dolu!' });
            return;
        }
        
        // Aynı oyuncu tekrar katılmaya çalışıyorsa
        if (room.players.some(p => p.id === socket.id)) {
            socket.emit('room-join-error', { message: 'Zaten odadasın!' });
            return;
        }
        
        const playerName = name || playerName || 'Oyuncu';
        const playerLogo = logo || playerLogo || 'default.png';
        
        room.players.push({
            id: socket.id,
            name: playerName,
            logo: playerLogo,
            isHost: false,
            isReady: false
        });
        
        socket.join(roomId);
        socket.emit('room-joined', { roomId });
        
        // Odayı güncelle - tüm odadakilere gönder
        const roomUpdate = {
            roomId,
            playerCount: room.players.length,
            players: room.players
        };
        io.to(roomId).emit('room-update', roomUpdate);
        
        console.log(`🚪 ${playerName} odaya katıldı: ${roomId}`);
    });

    socket.on('leave-room', (roomId) => {
        const room = activeRooms[roomId];
        if (!room) return;
        
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            console.log(`👤 ${player.name} odadan ayrıldı: ${roomId}`);
        }
        
        room.players = room.players.filter(p => p.id !== socket.id);
        socket.leave(roomId);
        
        if (room.players.length === 0) {
            delete activeRooms[roomId];
            console.log(`🗑️ Oda silindi: ${roomId}`);
        } else {
            // Kalan oyuncuya rakip ayrıldı bilgisi ver
            io.to(roomId).emit('opponent-left');
            io.to(roomId).emit('room-update', {
                roomId,
                playerCount: room.players.length,
                players: room.players
            });
        }
    });

    socket.on('invite-player', (targetId) => {
        const sender = lobbyPlayers.find(p => p.id === socket.id);
        if (!sender) {
            console.warn('⚠️ Davet gönderen bulunamadı:', socket.id);
            return;
        }
        
        const target = lobbyPlayers.find(p => p.id === targetId);
        if (!target) {
            console.warn('⚠️ Davet hedefi bulunamadı:', targetId);
            return;
        }
        
        console.log(`📨 Davet gönderiliyor: ${sender.name} -> ${target.name}`);
        
        io.to(targetId).emit('invite-received', {
            fromId: socket.id,
            fromName: sender.name,
            fromLogo: sender.logo || 'default.png'
        });
    });

    socket.on('accept-invite', (hostId) => {
        const host = lobbyPlayers.find(p => p.id === hostId);
        const guest = lobbyPlayers.find(p => p.id === socket.id);
        
        if (!host || !guest) {
            console.warn('⚠️ Davet kabul edilemedi, oyuncu bulunamadı');
            return;
        }
        
        console.log(`✅ Davet kabul edildi: ${guest.name} -> ${host.name}`);
        
        // Lobi'den kaldır
        lobbyPlayers = lobbyPlayers.filter(p => p.id !== hostId && p.id !== socket.id);
        io.emit('lobby-update', lobbyPlayers);
        
        // Oda oluştur
        let roomId;
        let attempts = 0;
        do {
            roomId = `R${String(roomIdCounter++).padStart(3, '0')}`;
            attempts++;
        } while (activeRooms[roomId] && attempts < 100);
        
        activeRooms[roomId] = {
            host: hostId,
            players: [
                { id: hostId, name: host.name, logo: host.logo || 'default.png', isHost: true, isReady: false },
                { id: socket.id, name: guest.name, logo: guest.logo || 'default.png', isHost: false, isReady: false }
            ],
            started: false,
            createdAt: Date.now()
        };
        
        // Her iki oyuncuyu da odaya ekle
        io.sockets.sockets.get(hostId)?.join(roomId);
        io.sockets.sockets.get(socket.id)?.join(roomId);
        
        // Host'a oda oluşturuldu bilgisi
        io.to(hostId).emit('room-created', { roomId });
        
        // Misafire odaya katılındı bilgisi
        io.to(socket.id).emit('room-joined', { roomId });
        
        // Oda güncellemesi
        const roomUpdate = {
            roomId,
            playerCount: 2,
            players: activeRooms[roomId].players
        };
        io.to(roomId).emit('room-update', roomUpdate);
        
        console.log(`🏠 Davet ile oda oluşturuldu: ${roomId} (${host.name} & ${guest.name})`);
    });

    // ============================================================
    // MAÇ HAZIRLIK - GÜNCELLENMİŞ
    // ============================================================

    socket.on('player-ready', (data) => {
        const { roomId, pins } = data;
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
        
        player.isReady = true;
        if (pins) {
            player.pins = pins;
        }
        
        console.log(`✅ ${player.name} hazır (${roomId})`);
        
        // Oda güncellemesini gönder
        io.to(roomId).emit('room-update', {
            roomId,
            playerCount: room.players.length,
            players: room.players
        });
        
        // Rakibe hazır olduğunu bildir
        room.players.forEach(p => {
            if (p.id !== socket.id) {
                io.to(p.id).emit('opponent-ready');
                console.log(`📢 ${player.name} hazır -> ${p.name}`);
            }
        });
        
        // Her iki oyuncu da hazırsa maçı başlat
        const allReady = room.players.every(p => p.isReady === true);
        if (allReady && room.players.length === 2) {
            room.started = true;
            const hostPlayer = room.players.find(p => p.isHost);
            const guestPlayer = room.players.find(p => !p.isHost);
            
            console.log(`🎮 Maç başlıyor: ${roomId} (${hostPlayer?.name} vs ${guestPlayer?.name})`);
            
            // Her oyuncuya kendi takım numarasını ve rakip logosunu gönder
            if (hostPlayer) {
                io.to(hostPlayer.id).emit('match-start', {
                    roomId,
                    team: 1,
                    opponentLogo: guestPlayer?.logo || 'default.png'
                });
            }
            
            if (guestPlayer) {
                io.to(guestPlayer.id).emit('match-start', {
                    roomId,
                    team: 2,
                    opponentLogo: hostPlayer?.logo || 'default.png'
                });
            }
        }
    });

    // ============================================================
    // OYUN SİSTEMİ
    // ============================================================

    socket.on('player-shot', (data) => {
        const { roomId, shotData } = data;
        socket.to(roomId).emit('opponent-shot', shotData);
    });

    socket.on('sync-ball-position', (data) => {
        const { roomId, ballState } = data;
        socket.to(roomId).emit('ball-sync', ballState);
    });

    // ============================================================
    // BAĞLANTI KESİLME
    // ============================================================

    socket.on('disconnect', () => {
        console.log(`🔌 Bağlantı koptu: ${socket.id}`);
        
        // Lobi'den kaldır
        lobbyPlayers = lobbyPlayers.filter(p => p.id !== socket.id);
        io.emit('lobby-update', lobbyPlayers);
        delete playerSessions[socket.id];
        
        // Aktif odalardan kaldır
        for (const roomId in activeRooms) {
            const room = activeRooms[roomId];
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                console.log(`👤 ${player.name} odadan ayrıldı (disconnect): ${roomId}`);
                room.players = room.players.filter(p => p.id !== socket.id);
                
                if (room.players.length === 0) {
                    delete activeRooms[roomId];
                    console.log(`🗑️ Oda silindi (disconnect): ${roomId}`);
                } else {
                    io.to(roomId).emit('opponent-left');
                    io.to(roomId).emit('room-update', {
                        roomId,
                        playerCount: room.players.length,
                        players: room.players
                    });
                }
                break;
            }
        }
    });
});

// ============================================================
// PERİYODİK TEMİZLİK (Eski odaları temizle)
// ============================================================
setInterval(() => {
    const now = Date.now();
    for (const roomId in activeRooms) {
        const room = activeRooms[roomId];
        // 10 dakikadan eski ve başlamamış odaları temizle
        if (!room.started && (now - room.createdAt) > 600000) {
            console.log(`🗑️ Eski oda temizlendi: ${roomId}`);
            delete activeRooms[roomId];
        }
    }
}, 300000); // 5 dakikada bir kontrol

// ============================================================
// SUNUCU BAŞLAT
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Sunucu ${PORT} portunda çalışıyor...`);
    console.log(`📡 WebSocket aktif, iOS Safari için optimize edildi`);
});
