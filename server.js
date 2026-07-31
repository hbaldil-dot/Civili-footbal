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
    },
    pingTimeout: 30000,
    pingInterval: 5000
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
        setTimeout(connectDB, 5000);
    }
}
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
// EXPRESS
// ============================================================
app.use(express.static(__dirname));
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
    });
});

// ============================================================
// BELLEK VERİLERİ
// ============================================================
let lobbyPlayers = [];
let activeRooms = {};
let playerSockets = {}; // playerId -> socketId

// ============================================================
// ODA YÖNETİMİ
// ============================================================
function createRoom(hostId, guestId, hostData, guestData) {
    const roomId = `room_${hostId}_${Date.now()}`;
    
    activeRooms[roomId] = {
        id: roomId,
        players: {
            [hostId]: {
                id: hostId,
                name: hostData.name,
                team: 1,
                logo: hostData.logo || 'default.png',
                ready: false,
                placedPins: [],
                connected: true
            },
            [guestId]: {
                id: guestId,
                name: guestData.name,
                team: 2,
                logo: guestData.logo || 'default.png',
                ready: false,
                placedPins: [],
                connected: true
            }
        },
        gameState: {
            phase: 'setup', // setup, playing, ended
            turn: 1,
            score: { p1: 0, p2: 0 },
            ball: { x: 180, y: 310, vx: 0, vy: 0 },
            shotTimer: 5,
            matchTimer: 90,
            matchDuration: 90,
            shotDuration: 5
        },
        pinStates: [],
        createdAt: Date.now(),
        lastActivity: Date.now()
    };
    
    return roomId;
}

function getRoom(roomId) {
    return activeRooms[roomId];
}

function getRoomByPlayerId(playerId) {
    for (const roomId in activeRooms) {
        if (activeRooms[roomId].players[playerId]) {
            return activeRooms[roomId];
        }
    }
    return null;
}

function removeRoom(roomId) {
    if (activeRooms[roomId]) {
        const room = activeRooms[roomId];
        // Odadaki tüm oyunculara bildir
        for (const playerId in room.players) {
            const socket = io.sockets.sockets.get(playerSockets[playerId]);
            if (socket) {
                socket.emit('room-closed', { reason: 'Oda kapatıldı' });
            }
        }
        delete activeRooms[roomId];
        console.log(`🗑️ Oda silindi: ${roomId}`);
    }
}

function cleanupInactiveRooms() {
    const now = Date.now();
    for (const roomId in activeRooms) {
        const room = activeRooms[roomId];
        // 5 dakikadan uzun süre işlem görmemiş odaları temizle
        if (now - room.lastActivity > 300000) {
            removeRoom(roomId);
        }
    }
}
setInterval(cleanupInactiveRooms, 60000);

// ============================================================
// LOBBY YÖNETİMİ
// ============================================================
function broadcastLobbyUpdate() {
    io.emit('lobby-update', lobbyPlayers);
}

function addPlayerToLobby(socketId, playerData) {
    lobbyPlayers = lobbyPlayers.filter(p => p.id !== socketId);
    lobbyPlayers.push({
        id: socketId,
        name: playerData.name || 'Oyuncu',
        logo: playerData.logo || 'default.png',
        status: 'idle'
    });
    broadcastLobbyUpdate();
}

function removePlayerFromLobby(socketId) {
    lobbyPlayers = lobbyPlayers.filter(p => p.id !== socketId);
    broadcastLobbyUpdate();
}

// ============================================================
// SOCKET.IO OLAY DİNLEYİCİLERİ
// ============================================================
io.on('connection', (socket) => {
    console.log(`⚡ Bağlantı: ${socket.id}`);
    playerSockets[socket.id] = socket.id;

    // ----- AUTH -----
    socket.on('registerUser', async (data) => {
        const { username, email, password } = data;
        if (!username || !email || !password) {
            socket.emit('authResponse', { success: false, message: 'Tüm alanları doldurun!' });
            return;
        }
        try {
            const existing = await User.findOne({ email: email.toLowerCase() });
            if (existing) {
                socket.emit('authResponse', { success: false, message: 'Bu e-posta zaten kayıtlı!' });
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
                message: 'Kayıt başarılı! Hoş geldin.'
            });
        } catch (error) {
            console.error('❌ Kayıt hatası:', error);
            socket.emit('authResponse', { success: false, message: 'Kayıt sırasında hata oluştu.' });
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
            socket.emit('authResponse', { success: false, message: 'Giriş sırasında hata oluştu.' });
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

    // ----- LOBBY -----
    socket.on('join-lobby', (playerData) => {
        addPlayerToLobby(socket.id, playerData);
        socket.emit('lobby-joined', { success: true });
    });

    socket.on('leave-lobby', () => {
        removePlayerFromLobby(socket.id);
    });

    // ----- DAVET SİSTEMİ -----
    socket.on('send-invite', (targetId) => {
        const sender = lobbyPlayers.find(p => p.id === socket.id);
        if (!sender) {
            socket.emit('invite-error', { message: 'Lobide değilsiniz!' });
            return;
        }
        const target = lobbyPlayers.find(p => p.id === targetId);
        if (!target) {
            socket.emit('invite-error', { message: 'Oyuncu bulunamadı!' });
            return;
        }
        io.to(targetId).emit('receive-invite', {
            fromId: socket.id,
            fromName: sender.name,
            fromLogo: sender.logo || 'default.png'
        });
    });

    socket.on('accept-invite', (hostId) => {
        const host = lobbyPlayers.find(p => p.id === hostId);
        const guest = lobbyPlayers.find(p => p.id === socket.id);
        
        if (!host || !guest) {
            socket.emit('invite-error', { message: 'Oyuncu bulunamadı!' });
            return;
        }

        // Odadaki diğer oyuncuları lobiden kaldır
        removePlayerFromLobby(hostId);
        removePlayerFromLobby(socket.id);

        // Oda oluştur
        const roomId = createRoom(hostId, socket.id, host, guest);
        const room = activeRooms[roomId];
        
        // Oyuncuları odaya ekle
        socket.join(roomId);
        const hostSocket = io.sockets.sockets.get(hostId);
        if (hostSocket) {
            hostSocket.join(roomId);
        }

        // Maç başlatma bilgilerini gönder
        const hostData = room.players[hostId];
        const guestData = room.players[socket.id];

        io.to(hostId).emit('match-start', {
            roomId: roomId,
            team: 1,
            opponentName: guestData.name,
            opponentLogo: guestData.logo,
            matchDuration: 90,
            shotDuration: 5
        });

        io.to(socket.id).emit('match-start', {
            roomId: roomId,
            team: 2,
            opponentName: hostData.name,
            opponentLogo: hostData.logo,
            matchDuration: 90,
            shotDuration: 5
        });

        room.lastActivity = Date.now();
        console.log(`🏟️ Oda oluşturuldu: ${roomId}`);
    });

    socket.on('decline-invite', (hostId) => {
        io.to(hostId).emit('invite-declined', {
            fromId: socket.id
        });
    });

    // ----- MAÇ YÖNETİMİ -----
    socket.on('player-ready', ({ roomId, team, placedPins }) => {
        const room = getRoom(roomId);
        if (!room) {
            socket.emit('error', { message: 'Oda bulunamadı!' });
            return;
        }

        const playerId = socket.id;
        if (room.players[playerId]) {
            room.players[playerId].ready = true;
            room.players[playerId].placedPins = placedPins;
            room.lastActivity = Date.now();
        }

        // Tüm oyuncular hazır mı?
        const allReady = Object.values(room.players).every(p => p.ready === true);
        
        if (allReady) {
            // Maçı başlat
            room.gameState.phase = 'playing';
            room.gameState.turn = 1;
            
            // Pinleri birleştir
            const allPins = [];
            for (const playerId in room.players) {
                const player = room.players[playerId];
                // Post'ları ekle (sabit)
                if (allPins.length === 0) {
                    allPins.push(
                        { x: 141, y: 12, isPost: true, team: 0 },
                        { x: 219, y: 12, isPost: true, team: 0 },
                        { x: 141, y: 608, isPost: true, team: 0 },
                        { x: 219, y: 608, isPost: true, team: 0 }
                    );
                }
                // Oyuncu pinlerini ekle
                player.placedPins.forEach(p => {
                    allPins.push({ x: p.x, y: p.y, team: player.team, isPost: false });
                });
            }
            room.pinStates = allPins;

            // Her iki oyuncuya maç başladı bilgisini gönder
            for (const pid in room.players) {
                const player = room.players[pid];
                const opponent = Object.values(room.players).find(p => p.id !== pid);
                io.to(pid).emit('match-started', {
                    team: player.team,
                    opponentName: opponent.name,
                    opponentLogo: opponent.logo,
                    pins: allPins,
                    turn: 1,
                    matchDuration: room.gameState.matchDuration,
                    shotDuration: room.gameState.shotDuration
                });
            }
            console.log(`🎮 Maç başladı: ${roomId}`);
        }
    });

    // ----- OYUN İÇİ -----
    socket.on('player-shot', ({ roomId, shotData }) => {
        const room = getRoom(roomId);
        if (!room || room.gameState.phase !== 'playing') return;

        const playerId = socket.id;
        const player = room.players[playerId];
        if (!player) return;

        // Sıra kontrolü
        if (room.gameState.turn !== player.team) {
            socket.emit('error', { message: 'Sıra sizde değil!' });
            return;
        }

        // Vuruş verilerini kaydet
        room.gameState.ball.vx = (shotData.startX - shotData.endX) * 0.13;
        room.gameState.ball.vy = (shotData.startY - shotData.endY) * 0.13;
        room.gameState.ball.x = shotData.ballX || 180;
        room.gameState.ball.y = shotData.ballY || 310;
        
        // Sırayı değiştir
        room.gameState.turn = player.team === 1 ? 2 : 1;
        room.lastActivity = Date.now();

        // Rakibe gönder
        const opponentId = Object.keys(room.players).find(id => id !== playerId);
        if (opponentId) {
            io.to(opponentId).emit('opponent-shot', {
                shotData: {
                    startX: shotData.startX,
                    startY: shotData.startY,
                    endX: shotData.endX,
                    endY: shotData.endY,
                    ballX: room.gameState.ball.x,
                    ballY: room.gameState.ball.y,
                    vx: room.gameState.ball.vx,
                    vy: room.gameState.ball.vy
                },
                turn: room.gameState.turn
            });
        }

        // Vuruşu yapan oyuncuya sıra değişikliğini bildir
        io.to(playerId).emit('turn-changed', {
            turn: room.gameState.turn
        });

        // Shot timer'ı sıfırla
        room.gameState.shotTimer = 5;
    });

    socket.on('sync-ball', ({ roomId, ballState }) => {
        const room = getRoom(roomId);
        if (!room || room.gameState.phase !== 'playing') return;

        // Sadece top durduğunda senkronize et
        const speed = Math.hypot(ballState.vx || 0, ballState.vy || 0);
        if (speed < 0.3) {
            room.gameState.ball.x = ballState.x;
            room.gameState.ball.y = ballState.y;
            room.gameState.ball.vx = ballState.vx || 0;
            room.gameState.ball.vy = ballState.vy || 0;
            if (ballState.turn !== undefined) {
                room.gameState.turn = ballState.turn;
            }
            room.lastActivity = Date.now();
        }
    });

    socket.on('score-update', ({ roomId, score, scorer }) => {
        const room = getRoom(roomId);
        if (!room || room.gameState.phase !== 'playing') return;

        const playerId = socket.id;
        const player = room.players[playerId];
        if (!player) return;

        // Skoru güncelle
        if (scorer === 1) {
            room.gameState.score.p1++;
        } else if (scorer === 2) {
            room.gameState.score.p2++;
        }
        room.lastActivity = Date.now();

        // Topu ortala
        room.gameState.ball.x = 180;
        room.gameState.ball.y = 310;
        room.gameState.ball.vx = 0;
        room.gameState.ball.vy = 0;

        // Sırayı gol yiyene ver
        room.gameState.turn = scorer === 1 ? 2 : 1;

        // Her iki oyuncuya skor güncellemesini gönder
        for (const pid in room.players) {
            io.to(pid).emit('score-updated', {
                score: room.gameState.score,
                turn: room.gameState.turn,
                scorer: scorer
            });
        }
    });

    socket.on('match-ended', ({ roomId, result }) => {
        const room = getRoom(roomId);
        if (!room) return;

        room.gameState.phase = 'ended';
        room.lastActivity = Date.now();

        // Her iki oyuncuya maç bitti bilgisi
        for (const pid in room.players) {
            io.to(pid).emit('match-ended', {
                score: room.gameState.score,
                result: result,
                playerStats: room.players[pid].stats || { wins: 0, losses: 0, draws: 0 }
            });
        }

        // 5 saniye sonra odayı kaldır
        setTimeout(() => {
            removeRoom(roomId);
        }, 10000);
    });

    // ----- STADYUM -----
    socket.on('stadium-change', ({ roomId, texture }) => {
        socket.to(roomId).emit('stadium-changed', { texture });
    });

    // ----- BAĞLANTI KOPMASI -----
    socket.on('disconnect', () => {
        console.log(`🔌 Bağlantı koptu: ${socket.id}`);
        
        // Lobbiden kaldır
        removePlayerFromLobby(socket.id);
        
        // Aktif odalardan kaldır
        const room = getRoomByPlayerId(socket.id);
        if (room) {
            const player = room.players[socket.id];
            if (player) {
                player.connected = false;
                // Rakibe bildir
                const opponentId = Object.keys(room.players).find(id => id !== socket.id);
                if (opponentId) {
                    io.to(opponentId).emit('opponent-disconnected', {
                        message: 'Rakip oyundan ayrıldı'
                    });
                }
                // 10 saniye bekle, eğer geri gelmezse odayı kapat
                setTimeout(() => {
                    const currentRoom = getRoomByPlayerId(socket.id);
                    if (currentRoom && !currentRoom.players[socket.id]?.connected) {
                        removeRoom(currentRoom.id);
                    }
                }, 10000);
            }
        }
        
        delete playerSockets[socket.id];
    });

    // ----- HEARTBEAT -----
    socket.on('ping', () => {
        socket.emit('pong');
    });
});

// ============================================================
// SUNUCU BAŞLAT
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Sunucu ${PORT} portunda çalışıyor...`);
    console.log(`📊 MongoDB: ${mongoose.connection.readyState === 1 ? 'Bağlı' : 'Bağlı değil'}`);
});
