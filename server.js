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
        methods: ["GET", "POST"]
    }
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

// ============================================================
// SOCKET.IO OLAY DİNLEYİCİLERİ
// ============================================================
io.on('connection', (socket) => {
    console.log(`⚡ Yeni bağlantı: ${socket.id}`);
    let playerName = 'Oyuncu';
    let playerLogo = 'default.png';

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
        
        console.log(`👤 ${playerName} lobiye katıldı (${lobbyPlayers.length} oyuncu)`);
        io.emit('lobby-update', lobbyPlayers);
    });

    socket.on('leave-lobby', () => {
        lobbyPlayers = lobbyPlayers.filter(p => p.id !== socket.id);
        io.emit('lobby-update', lobbyPlayers);
        console.log(`👤 ${playerName} lobiden ayrıldı`);
    });

    // ============================================================
    // ODA İŞLEMLERİ
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
            started: false
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
        
        // Odayı güncelle
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
            console.log(`👤 Oyuncu odadan ayrıldı: ${roomId}`);
        }
    });

    socket.on('invite-player', (targetId) => {
        const sender = lobbyPlayers.find(p => p.id === socket.id);
        if (!sender) return;
        
        const target = lobbyPlayers.find(p => p.id === targetId);
        if (!target) return;
        
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
            started: false
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
        
        console.log(`🏠 Davet ile oda oluşturuldu: ${roomId}`);
    });

    // ============================================================
    // MAÇ HAZIRLIK
    // ============================================================

    socket.on('player-ready', (data) => {
        const { roomId, pins } = data;
        const room = activeRooms[roomId];
        if (!room) return;
        
        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;
        
        player.isReady = true;
        if (pins) {
            player.pins = pins;
        }
        
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
        const allReady = room.players.every(p => p.isReady);
        if (allReady && room.players.length === 2) {
            room.started = true;
            const hostPlayer = room.players.find(p => p.isHost);
            const guestPlayer = room.players.find(p => !p.isHost);
            
            // Her oyuncuya kendi takım numarasını ve rakip logosunu gönder
            io.to(hostPlayer.id).emit('match-start', {
                roomId,
                team: 1,
                opponentLogo: guestPlayer.logo || 'default.png'
            });
            
            io.to(guestPlayer.id).emit('match-start', {
                roomId,
                team: 2,
                opponentLogo: hostPlayer.logo || 'default.png'
            });
            
            console.log(`🎮 Maç başladı: ${roomId}`);
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
        
        // Aktif odalardan kaldır
        for (const roomId in activeRooms) {
            const room = activeRooms[roomId];
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
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
// SUNUCU BAŞLAT
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Sunucu ${PORT} portunda çalışıyor...`);
});
