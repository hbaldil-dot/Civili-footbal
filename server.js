const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);

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
    console.log(`⚡ Yeni bağlantı: ${socket.id}`);
    let playerName = 'Oyuncu';
    let playerLogo = 'default.png';

    // Heartbeat
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
        
        lobbyPlayers = lobbyPlayers.filter(p => p.id !== socket.id);
        lobbyPlayers.push({
            id: socket.id,
            name: playerName,
            logo: playerLogo
        });
        
        playerSessions[socket.id] = { name: playerName, logo: playerLogo };
        console.log(`👤 ${playerName} lobiye katıldı (${lobbyPlayers.length} oyuncu)`);
        io.emit('lobby-update', lobbyPlayers);
        socket.emit('lobby-update', lobbyPlayers);
    });

    socket.on('leave-lobby', () => {
        lobbyPlayers = lobbyPlayers.filter(p => p.id !== socket.id);
        delete playerSessions[socket.id];
        io.emit('lobby-update', lobbyPlayers);
        console.log(`👤 ${playerName} lobiden ayrıldı`);
    });

    // ============================================================
    // ODA İŞLEMLERİ
    // ============================================================

    socket.on('create-room', (data) => {
        const name = data?.name || playerName || 'Oyuncu';
        const logo = data?.logo || playerLogo || 'default.png';
        
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
                isReady: false,
                pins: []
            }],
            started: false,
            createdAt: Date.now()
        };
        
        socket.join(roomId);
        socket.emit('room-created', { roomId });
        socket.emit('room-update', {
            roomId,
            playerCount: 1,
            players: activeRooms[roomId].players
        });
        
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
            isReady: false,
            pins: []
        });
        
        socket.join(roomId);
        socket.emit('room-joined', { roomId });
        
        io.to(roomId).emit('room-update', {
            roomId,
            playerCount: room.players.length,
            players: room.players
        });
        
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
        if (!sender) return;
        const target = lobbyPlayers.find(p => p.id === targetId);
        if (!target) return;
        
        console.log(`📨 Davet: ${sender.name} -> ${target.name}`);
        io.to(targetId).emit('invite-received', {
            fromId: socket.id,
            fromName: sender.name,
            fromLogo: sender.logo || 'default.png'
        });
    });

    socket.on('accept-invite', (hostId) => {
        const host = lobbyPlayers.find(p => p.id === hostId);
        const guest = lobbyPlayers.find(p => p.id === socket.id);
        if (!host || !guest) return;
        
        console.log(`✅ Davet kabul: ${guest.name} -> ${host.name}`);
        
        lobbyPlayers = lobbyPlayers.filter(p => p.id !== hostId && p.id !== socket.id);
        io.emit('lobby-update', lobbyPlayers);
        
        let roomId;
        let attempts = 0;
        do {
            roomId = `R${String(roomIdCounter++).padStart(3, '0')}`;
            attempts++;
        } while (activeRooms[roomId] && attempts < 100);
        
        activeRooms[roomId] = {
            host: hostId,
            players: [
                { id: hostId, name: host.name, logo: host.logo || 'default.png', isHost: true, isReady: false, pins: [] },
                { id: socket.id, name: guest.name, logo: guest.logo || 'default.png', isHost: false, isReady: false, pins: [] }
            ],
            started: false,
            createdAt: Date.now()
        };
        
        io.sockets.sockets.get(hostId)?.join(roomId);
        io.sockets.sockets.get(socket.id)?.join(roomId);
        
        io.to(hostId).emit('room-created', { roomId });
        io.to(socket.id).emit('room-joined', { roomId });
        
        io.to(roomId).emit('room-update', {
            roomId,
            playerCount: 2,
            players: activeRooms[roomId].players
        });
        
        console.log(`🏠 Davet ile oda: ${roomId}`);
    });

    // ============================================================
    // MAÇ HAZIRLIK - SENKRONİZASYON
    // ============================================================

    // Takım diziliminde değişiklik olduğunda karşı tarafa bildir
    socket.on('sync-pin-move', (data) => {
        const { roomId, team, index, x, y } = data;
        socket.to(roomId).emit('pin-move-sync', { team, index, x, y });
    });
// server.js içinde player-ready olayı
socket.on('player-ready', (data) => {
    const { roomId, pins, logo } = data;  // logo eklendi
    const room = activeRooms[roomId];
    if (!room) return;
    
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    
    player.isReady = true;
    if (pins) {
        player.pins = pins;
    }
    if (logo) {
        player.logo = logo;  // Logo kaydedildi
    }
    
    console.log(`✅ ${player.name} hazır (${roomId})`);
    
    // Oda güncellemesi
    io.to(roomId).emit('room-update', {
        roomId,
        playerCount: room.players.length,
        players: room.players
    });
    
    // Rakibe hazır olduğunu bildir
    room.players.forEach(p => {
        if (p.id !== socket.id) {
            io.to(p.id).emit('opponent-ready');
        }
    });
    
    // Her iki oyuncu da hazırsa maçı başlat
    const allReady = room.players.every(p => p.isReady === true);
    if (allReady && room.players.length === 2) {
        room.started = true;
        const hostPlayer = room.players.find(p => p.isHost);
        const guestPlayer = room.players.find(p => !p.isHost);
        
        console.log(`🎮 Maç başlıyor: ${roomId}`);
        
        // Tüm pinleri topla
        const allPins = [];
        room.players.forEach(p => {
            if (p.pins && p.pins.length > 0) {
                p.pins.forEach(pin => {
                    allPins.push({ x: pin.x, y: pin.y, team: p.id === hostPlayer?.id ? 1 : 2 });
                });
            }
        });
        
        // Host (Takım 1)
        io.to(hostPlayer.id).emit('match-start', {
            roomId,
            team: 1,
            opponentLogo: guestPlayer?.logo || 'default.png',  // Rakip logosu
            opponentPins: guestPlayer?.pins || [],
            allPins: allPins
        });
        
        // Guest (Takım 2)
        io.to(guestPlayer.id).emit('match-start', {
            roomId,
            team: 2,
            opponentLogo: hostPlayer?.logo || 'default.png',  // Rakip logosu
            opponentPins: hostPlayer?.pins || [],
            allPins: allPins
        });
    }
});
    // ============================================================
    // OYUN SİSTEMİ - SENKRONİZASYON
    // ============================================================

    // Vuruş gönder
    socket.on('player-shot', (data) => {
        const { roomId, shotData } = data;
        socket.to(roomId).emit('opponent-shot', shotData);
    });

    // Top pozisyonu senkronizasyonu
    socket.on('sync-ball-position', (data) => {
        const { roomId, ballState } = data;
        socket.to(roomId).emit('ball-sync', ballState);
    });

    // Gol senkronizasyonu
    socket.on('goal-scored', (data) => {
        const { roomId, scoringTeam } = data;
        socket.to(roomId).emit('opponent-goal', { scoringTeam });
    });

    // ============================================================
    // BAĞLANTI KESİLME
    // ============================================================

    socket.on('disconnect', () => {
        console.log(`🔌 Bağlantı koptu: ${socket.id}`);
        
        lobbyPlayers = lobbyPlayers.filter(p => p.id !== socket.id);
        io.emit('lobby-update', lobbyPlayers);
        delete playerSessions[socket.id];
        
        for (const roomId in activeRooms) {
            const room = activeRooms[roomId];
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                console.log(`👤 ${player.name} odadan ayrıldı (disconnect): ${roomId}`);
                room.players = room.players.filter(p => p.id !== socket.id);
                
                if (room.players.length === 0) {
                    delete activeRooms[roomId];
                    console.log(`🗑️ Oda silindi: ${roomId}`);
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
// PERİYODİK TEMİZLİK
// ============================================================
setInterval(() => {
    const now = Date.now();
    for (const roomId in activeRooms) {
        const room = activeRooms[roomId];
        if (!room.started && (now - room.createdAt) > 600000) {
            console.log(`🗑️ Eski oda temizlendi: ${roomId}`);
            delete activeRooms[roomId];
        }
    }
}, 300000);

// ============================================================
// SUNUCU BAŞLAT
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Sunucu ${PORT} portunda çalışıyor...`);
});
