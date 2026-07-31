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
// MONGODB BAĞLANTISI (Mongoose Temelli Stabil Bağlantı)
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

// Bağlantı Olayları Dinleyicileri
mongoose.connection.on('disconnected', () => {
    console.log('⚠️ MongoDB bağlantısı kesildi, yeniden bağlanılıyor...');
    setTimeout(connectDB, 5000);
});

process.on('SIGINT', async () => {
    await mongoose.connection.close();
    console.log('✅ MongoDB bağlantısı kapatıldı');
    process.exit(0);
});

// Veritabanı Bağlantısını Başlat
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

// Render Healthcheck Endpoint
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

    // KAYIT İŞLEMİ
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

    // GİRİŞ İŞLEMİ
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

    // ŞİFRE UNUTTUM
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

    // ONLINE LOBBY
    socket.on('join-lobby', (playerData) => {
        lobbyPlayers = lobbyPlayers.filter(p => p.id !== socket.id);
        lobbyPlayers.push({ 
            id: socket.id, 
            name: playerData?.name || 'Oyuncu',
            logo: playerData?.logo || 'default.png'
        });
        broadcastLobbyUpdate();
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
    console.log('📨 Davet kabul edildi, host:', hostId);
    
    const host = lobbyPlayers.find(p => p.id === hostId);
    const guest = lobbyPlayers.find(p => p.id === socket.id);

    if (!host || !guest) {
        console.error('❌ Oyuncu bulunamadı!');
        return;
    }

    const roomId = `room_${hostId}_${Date.now()}`;
    console.log(`🏠 Yeni oda oluşturuldu: ${roomId}`);

    // Oyuncuları lobiden kaldır
    lobbyPlayers = lobbyPlayers.filter(p => p.id !== hostId && p.id !== socket.id);
    broadcastLobbyUpdate();

    const hostSocket = io.sockets.sockets.get(hostId);
    const guestSocket = io.sockets.sockets.get(socket.id);

    if (!hostSocket || !guestSocket) {
        console.error('❌ Socket bulunamadı!');
        return;
    }

    // Odaya katıl
    hostSocket.join(roomId);
    guestSocket.join(roomId);

    activeRooms[roomId] = {
        players: [
            { id: hostId, name: host.name, team: 1, ready: false, placedPins: [], logo: host.logo || 'default.png' },
            { id: socket.id, name: guest.name, team: 2, ready: false, placedPins: [], logo: guest.logo || 'default.png' }
        ]
    };

    // MAÇ BAŞLAT - doğrudan emit
    console.log(`⚽ Maç başlatılıyor: ${roomId}`);
    
    const hostData = { roomId, team: 1, opponentLogo: guest.logo || 'default.png' };
    const guestData = { roomId, team: 2, opponentLogo: host.logo || 'default.png' };
    
    console.log('📤 Host verisi:', hostData);
    console.log('📤 Guest verisi:', guestData);
    
    io.to(hostId).emit('start-online-match', hostData);
    io.to(socket.id).emit('start-online-match', guestData);
    
    // Ayrıca doğrudan socket'lere de gönder (yedek)
    hostSocket.emit('start-online-match', hostData);
    guestSocket.emit('start-online-match', guestData);
    
    console.log(`✅ Maç başlatma event'leri gönderildi: ${roomId}`);
});

    socket.on('playerShot', ({ roomId, shotData }) => {
        socket.to(roomId).emit('opponentShot', shotData);
    });

    socket.on('disconnect', () => {
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
        if (room.players.some(p => p.id === socket.id)) {
            socket.to(roomId).emit('opponent-disconnected');
            delete activeRooms[roomId];
            break;
        }
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Sunucu ${PORT} portunda çalışıyor...`);
});
function getPlayerData() {
    const session = checkSession();
    const name = document.getElementById('player-name').value.trim() || 
                 (session ? session.username : "Oyuncu_" + Math.floor(Math.random() * 100));
    return {
        name: name,
        logo: selectedTeamLogo || 'default.png',
        userId: session ? session.email : null
    };
}
