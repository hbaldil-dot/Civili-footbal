// ============================================================
// SABİT SÜRELER
// ============================================================
let MATCH_DURATION = 90;
let SHOT_DURATION = 5;

// ============================================================
// SOCKET BAĞLANTISI
// ============================================================
let socket = null;
let currentRoomId = null;
let myTeamNumber = 1;
let isHost = false;
let onlinePlayers = [];
let isOnlineMatch = false;
let opponentPinsData = [];

function initSocket() {
    if (typeof io === 'undefined') {
        console.warn('⚠️ Socket.io yüklenemedi!');
        return;
    }
    
    const serverUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? undefined
        : window.location.origin;

    socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });

    socket.on('connect', () => {
        console.log('✅ Sunucuya bağlandı!');
        updateLobbyStatus('🟢 Bağlandı', '#2ecc71');
    });
    
    socket.on('connect_error', (error) => {
        console.warn('⚠️ Bağlantı hatası:', error);
        updateLobbyStatus('🔴 Bağlantı Hatası', '#e74c3c');
    });

    socket.on('disconnect', () => {
        console.warn('⚠️ Bağlantı kesildi');
        updateLobbyStatus('🔴 Bağlantı Kesildi', '#e74c3c');
    });

    // Lobby güncellemeleri
    socket.on('lobby-update', (players) => {
        onlinePlayers = players;
        updateLobbyUI();
    });

    // Oda oluşturuldu
    socket.on('room-created', (data) => {
        currentRoomId = data.roomId;
        myTeamNumber = 1;
        isHost = true;
        console.log('🏠 Oda oluşturuldu:', currentRoomId);
        document.getElementById('online-lobby').style.display = 'none';
        document.getElementById('room-waiting').style.display = 'flex';
        document.getElementById('room-code-display').textContent = currentRoomId;
        document.getElementById('room-player-count').textContent = '1/2';
    });

    // Odaya katılındı
    socket.on('room-joined', (data) => {
        currentRoomId = data.roomId;
        myTeamNumber = 2;
        isHost = false;
        console.log('🚪 Odaya katılındı:', currentRoomId);
        document.getElementById('online-lobby').style.display = 'none';
        document.getElementById('room-waiting').style.display = 'flex';
        document.getElementById('room-code-display').textContent = currentRoomId;
        document.getElementById('room-player-count').textContent = '2/2';
    });

    // Oda güncellemesi
    socket.on('room-update', (data) => {
        const countEl = document.getElementById('room-player-count');
        if (countEl) countEl.textContent = data.playerCount + '/2';
        
        const listEl = document.getElementById('room-player-list');
        if (listEl) {
            listEl.innerHTML = data.players.map(function(p) {
                return '<div class="room-player">' + p.name + ' ' + (p.isHost ? '👑' : '') + ' ' + (p.isReady ? '✅' : '⏳') + '</div>';
            }).join('');
        }
    });

    // Oda hatası
    socket.on('room-join-error', (data) => {
        alert('⚠️ ' + data.message);
    });

    // Davet alma
    socket.on('invite-received', (data) => {
        if (confirm(data.fromName + ' seni maça davet ediyor! Kabul ediyor musun?')) {
            socket.emit('accept-invite', data.fromId);
        }
    });

    // Rakip hazır oldu
    socket.on('opponent-ready', function() {
        var statusEl = document.getElementById('opponent-status');
        if (statusEl) {
            statusEl.textContent = '✅ Hazır';
            statusEl.style.color = '#2ecc71';
        }
    });

    // ============================================================
    // ONLINE SENKRONİZASYON OLAYLARI
    // ============================================================

  // MAÇ BAŞLANGICI - GÜNCELLENMİŞ
// MAÇ BAŞLANGICI - GÜNCELLENMİŞ
socket.on('match-start', function(data) {
    console.log('🎮 MAÇ BAŞLANGIÇ VERİLERİ:', data);
    
    currentRoomId = data.roomId;
    isHost = data.isHost;              // <-- EKLENDİ: Host mu Misafir mi?
    myTeamNumber = data.isHost ? 1 : 2; // <-- EKLENDİ
    isOnlineMatch = true;

    // Rakip logosunu kaydet
    if (data.opponentLogo) {
        aiTeamLogo = data.opponentLogo;
        console.log('✅ Rakip logosu kaydedildi:', aiTeamLogo);
        loadTeamLogoImage(aiTeamLogo);
    } else {
        aiTeamLogo = 'default.png';
        console.warn('⚠️ Rakip logosu gelmedi, default kullanılacak');
    }

    // Rakip pinlerini kaydet
    opponentPinsData = data.opponentPins || [];
    console.log('✅ Rakip pinleri kaydedildi:', opponentPinsData.length);

    document.getElementById('room-waiting').style.display = 'none';
    startOnlineMatch();

    // ========================================================
    // 🔥 EKLENEN KISIM: EĞER HOST İSEK SAHAYI DİĞER OYUNCUYA GÖNDER
    // ========================================================
    if (isHost) {
        const initialGameState = {
            pins: getPinsData(), // Sahadaki pin koordinatlarınız
            ball: getNormalizedBallState(ball, canvas.width, canvas.height)
        };
        socket.emit('sync-initial-field', { roomId: currentRoomId, gameState: initialGameState });
    }
});

// ========================================================
// 🔥 EKLENEN KISIM: MİSAFİR OYUNCU HOST'TAN GELEN SAHAYI YÜKLER
// (Hemen match-start bloğunun altına ekleyebilirsiniz)
// ========================================================
socket.on('load-initial-field', function(gameState) {
    if (!isHost) {
        console.log("📌 Host'un sahası ve pinleri yüklendi!");
        applyPinsData(gameState.pins);
        applyBallState(gameState.ball);
    }
});
    // PIN HAREKETİ ALMA
    socket.on('pin-move-sync', function(data) {
        console.log('📥 PIN HAREKETİ ALINDI:', data);
        if (currentPhase !== 'setup') return;
        
        var team = data.team;
        var index = data.index;
        var x = data.x;
        var y = data.y;
        var count = 0;
        
        for (var i = 0; i < pins.length; i++) {
            var p = pins[i];
            if (!p.isPost && p.team === team) {
                if (count === index) {
                    p.x = x;
                    p.y = y;
                    break;
                }
                count++;
            }
        }
    });

    // VURUŞ ALMA
   //Rakip vuruş yaptığında
socket.on('opponent-shot', (shotData) => {
    // Rakibin vuruş açı ve kuvvetini al, topa uygula
    applyShotToBall(shotData);
        console.log('📥 VURUŞ ALINDI:', shotData);
        if (currentPhase === 'playing' && isOnlineMatch) {
            cap.vx = (shotData.startX - shotData.endX) * 0.13;
            cap.vy = (shotData.startY - shotData.endY) * 0.13;
            turn = myTeamNumber;
            updateHUDTurn();
            resetShotTimer();
            playSound('kick');
        }
    });

    // GOL ALMA
    socket.on('opponent-goal', function(data) {
        console.log('📥 Gol alındı:', data);
        if (currentPhase === 'playing' && isOnlineMatch) {
            triggerGoalAnimation();
        }
    });
socket.on('ball-sync', (data) => {
    if (!isHost) { 
        let targetX, targetY;

        // --- SİZİN KODUNUZ BURAYA GELİYOR ---
        if (myTeam === 2) {
            targetX = (1.0 - data.xRatio) * canvas.width;
            targetY = (1.0 - data.yRatio) * canvas.height;
        } else {
            targetX = data.xRatio * canvas.width;
            targetY = data.yRatio * canvas.height;
        }
        // ------------------------------------

        // Pürüzsüz takip (Lerp) ile topun yerini güncelleme
        ball.x += (targetX - ball.x) * 0.3;
        ball.y += (targetY - ball.y) * 0.3;
    }
});
// game.js - Topa veya Çiviye Vurulduğu An:

function makeShot(startX, endY, startY, endX) {
    // 1. Kendi ekranında hareketi başlat
    // ... (kendi fizik kodlarınız)

    // 2. Eğer online maçtaysak karşı tarafa HABER VER
    if (isOnlineMatch) {
        socket.emit('player-shot', {
            roomId: currentRoomId, // O anki oda ID'si
            shotData: {
                startX: startX,
                startY: startY,
                endX: endX,
                endY: endY
            }
        });
    }
}
// game.js içindeki mevcut gol kontrol fonksiyonunuz (Örn: checkGoal veya updatePhysics içi):

function checkGoal() {
    // ... Sizin mevcut gol atıldı mı kontrolünüz ...
    if (topKaleCizgisiniGecti) {
        
        // --- İŞTE BURAYA EKLENECEK ---
        if (isOnlineMatch) {
            socket.emit('send-goal', {
                roomId: currentRoomId,
                goalData: {
                    scorer: golAtanTakim,
                    scoreTeam1: score1,
                    scoreTeam2: score2
                }
            });
        }
        // -----------------------------
    }
}
// Top durduğunda kesin konumu sabitle
socket.on('ball-final-position', (pos) => {
    ball.x = pos.x * canvas.width;
    ball.y = pos.y * canvas.height;
    ball.vx = 0;
    ball.vy = 0;
    isBallMoving = false; // Sıra geçişi yapılabilir
});

    // RAKİP AYRILDI
    socket.on('opponent-left', function() {
        alert('⚠️ Rakip oyundan ayrıldı!');
        if (isOnlineMatch) {
            isOnlineMatch = false;
            exitToMenu();
        }
    });

    // Auth cevapları
    socket.on('authResponse', function(data) {
        alert(data.message);
        if (data.success) {
            if (data.username) {
                var playerNameInput = document.getElementById('player-name');
                if (playerNameInput) playerNameInput.value = data.username;
            }
            if (data.action === 'login' || data.action === 'register') {
                var authOverlay = document.getElementById('auth-modal-overlay');
                if (authOverlay) authOverlay.classList.add('hidden');
                var menu = document.getElementById('menu');
                if (menu) menu.style.display = 'block';
            } else if (data.action === 'forgot') {
                switchAuthTab('login');
            }
        }
    });
}
// game.js içindeki Dönüştürücü Fonksiyonlar:

// 1. Gönderirken: Kendi ekranındaki X, Y'yi 0.0 - 1.0 arasına oranla
function getNormalizedBallState(ball, canvasWidth, canvasHeight) {
    return {
        xRatio: ball.x / canvasWidth,
        yRatio: ball.y / canvasHeight,
        vxRatio: ball.vx / canvasWidth,
        vyRatio: ball.vy / canvasHeight
    };
}

// 2. Alırken: Gelen oranları kendi ekran genişlik/yüksekliğinle çarp
function setBallFromNormalized(data, canvasWidth, canvasHeight) {
    return {
        x: data.xRatio * canvasWidth,
        y: data.yRatio * canvasHeight,
        vx: data.vxRatio * canvasWidth,
        vy: data.vyRatio * canvasHeight
    };
}
function updateLobbyStatus(text, color) {
    var statusEl = document.getElementById('lobby-status');
    if (statusEl) {
        statusEl.textContent = text;
        statusEl.style.color = color;
    }
}

// ============================================================
// AUTH FONKSİYONLARI
// ============================================================
function switchAuthTab(tab) {
    var formLogin = document.getElementById('form-login');
    var formRegister = document.getElementById('form-register');
    var formForgot = document.getElementById('form-forgot');
    var tabLogin = document.getElementById('tab-login');
    var tabRegister = document.getElementById('tab-register');
    
    if (!formLogin || !formRegister || !formForgot) return;
    
    formLogin.classList.add('hidden');
    formRegister.classList.add('hidden');
    formForgot.classList.add('hidden');
    
    if (tabLogin) tabLogin.classList.remove('active');
    if (tabRegister) tabRegister.classList.remove('active');
    
    if (tab === 'login') {
        formLogin.classList.remove('hidden');
        if (tabLogin) tabLogin.classList.add('active');
    } else if (tab === 'register') {
        formRegister.classList.remove('hidden');
        if (tabRegister) tabRegister.classList.add('active');
    } else if (tab === 'forgot') {
        formForgot.classList.remove('hidden');
    }
}

function handleAuthSubmit(event, action) {
    event.preventDefault();
    if (!socket || !socket.connected) {
        alert("Sunucu bağlantısı kurulamadı. Lütfen sayfayı yenileyin.");
        return;
    }
    if (action === 'login') {
        var email = document.getElementById('login-email').value.trim();
        var password = document.getElementById('login-password').value.trim();
        socket.emit('loginUser', { email: email, password: password });
    } else if (action === 'register') {
        var username = document.getElementById('reg-username').value.trim();
        var email = document.getElementById('reg-email').value.trim();
        var password = document.getElementById('reg-password').value.trim();
        socket.emit('registerUser', { username: username, email: email, password: password });
    } else if (action === 'forgot') {
        var email = document.getElementById('forgot-email').value.trim();
        socket.emit('forgotPassword', { email: email });
    }
}

function continueAsGuest() {
    var authOverlay = document.getElementById('auth-modal-overlay');
    if (authOverlay) authOverlay.classList.add('hidden');
    document.getElementById('menu').style.display = 'block';
    var nameInput = document.getElementById('player-name');
    if (nameInput && nameInput.value === 'Oyuncu') {
        nameInput.value = "Misafir_" + Math.floor(Math.random() * 1000);
    }
    console.log("🎮 Misafir girişi başarılı");
}

// ============================================================
// ONLINE LOBBY FONKSİYONLARI
// ============================================================
function openOnlineLobby() {
    console.log('🎮 Online lobby açılıyor...');
    
    if (!socket) {
        alert('🔴 Socket bağlantısı başlatılamadı! Sayfayı yenileyin.');
        return;
    }
    
    if (!socket.connected) {
        alert('🔴 Sunucuya bağlanılamıyor! Lütfen sayfayı yenileyin.');
        return;
    }
    
    document.getElementById('menu').style.display = 'none';
    document.getElementById('online-lobby').style.display = 'flex';
    document.getElementById('lobby-players').innerHTML = '<div style="color:#666;text-align:center;padding:15px;">Oyuncular bekleniyor...</div>';
    
    var playerName = document.getElementById('player-name').value.trim() || 'Oyuncu';
    var logo = selectedTeamLogo || 'default.png';
    socket.emit('join-lobby', { name: playerName, logo: logo });
    
    console.log('✅ Online lobby açıldı, isim:', playerName);
}

function closeOnlineLobby() {
    console.log('🚪 Online lobby kapatılıyor...');
    if (socket) socket.emit('leave-lobby');
    document.getElementById('online-lobby').style.display = 'none';
    document.getElementById('menu').style.display = 'block';
}

function updateLobbyUI() {
    var container = document.getElementById('lobby-players');
    if (!container) return;
    
    if (onlinePlayers.length === 0) {
        container.innerHTML = '<div style="color:#666;text-align:center;padding:15px;">Oyuncu yok</div>';
        return;
    }
    
    var html = '';
    for (var i = 0; i < onlinePlayers.length; i++) {
        var p = onlinePlayers[i];
        var isMe = p.id === socket.id;
        html += '<div class="lobby-player ' + (isMe ? 'me' : '') + '">';
        html += '<div class="lobby-player-info">';
        html += '<img src="takimlar/' + (p.logo || 'default.png') + '" class="lobby-logo" onerror="this.src=\'takimlar/default.png\'">';
        html += '<span>' + p.name + (isMe ? ' (Sen)' : '') + '</span>';
        html += '</div>';
        if (!isMe) {
            html += '<button class="lobby-invite-btn" onclick="invitePlayer(\'' + p.id + '\')">Davet Et</button>';
        }
        html += '</div>';
    }
    container.innerHTML = html;
}

function invitePlayer(playerId) {
    if (!socket) {
        alert('🔴 Bağlantı yok!');
        return;
    }
    console.log('📨 Davet gönderiliyor:', playerId);
    socket.emit('invite-player', playerId);
}

function createRoom() {
    if (!socket || !socket.connected) {
        alert('🔴 Bağlantı yok!');
        return;
    }
    console.log('🏠 Oda oluşturuluyor...');
    var playerName = document.getElementById('player-name').value.trim() || 'Oyuncu';
    var logo = selectedTeamLogo || 'default.png';
    socket.emit('create-room', { name: playerName, logo: logo });
}

function joinRoom() {
    var code = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (!code || code.length < 4) {
        alert('⚠️ Lütfen geçerli bir oda kodu girin (4+ karakter)');
        return;
    }
    if (!socket || !socket.connected) {
        alert('🔴 Bağlantı yok!');
        return;
    }
    console.log('🚪 Odaya katılınıyor:', code);
    var playerName = document.getElementById('player-name').value.trim() || 'Oyuncu';
    var logo = selectedTeamLogo || 'default.png';
    socket.emit('join-room', { roomId: code, name: playerName, logo: logo });
}

function leaveRoom() {
    console.log('🚪 Odadan ayrılınıyor...');
    if (socket && currentRoomId) {
        socket.emit('leave-room', currentRoomId);
    }
    currentRoomId = null;
    isHost = false;
    isOnlineMatch = false;
    document.getElementById('room-waiting').style.display = 'none';
    document.getElementById('online-lobby').style.display = 'flex';
}

function setReady() {
    if (!socket || !currentRoomId) {
        alert('🔴 Bağlantı yok veya oda bulunamadı!');
        return;
    }
    
    var myPlacedPins = [];
    for (var i = 0; i < pins.length; i++) {
        var p = pins[i];
        if (!p.isPost && p.team === myTeamNumber) {
            myPlacedPins.push({ x: p.x, y: p.y });
        }
    }
    
    console.log('📤 HAZIR - Pin sayısı:', myPlacedPins.length);
    console.log('📤 Benim logo:', selectedTeamLogo);
    
    // Logo bilgisini de gönder
    socket.emit('player-ready', { 
        roomId: currentRoomId, 
        pins: myPlacedPins,
        logo: selectedTeamLogo || 'default.png'
    });
    
    var btn = document.getElementById('player-ready-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '✅ HAZIR';
    }
}

// ============================================================
// PIN HAREKETİ GÖNDERME
// ============================================================
function sendPinMove(pin) {
    if (!socket || !currentRoomId || gameMode !== 'online' || currentPhase !== 'setup') {
        return;
    }
    
    var index = -1;
    var count = 0;
    for (var i = 0; i < pins.length; i++) {
        var p = pins[i];
        if (!p.isPost && p.team === myTeamNumber) {
            if (p === pin) { index = count; break; }
            count++;
        }
    }
    
    if (index !== -1) {
        socket.emit('sync-pin-move', {
            roomId: currentRoomId,
            team: myTeamNumber,
            index: index,
            x: pin.x,
            y: pin.y
        });
        console.log('📤 PIN HAREKETİ GÖNDER:', { team: myTeamNumber, index: index, x: pin.x, y: pin.y });
    }
}

// ============================================================
// ONLINE MAÇ BAŞLATMA
// ============================================================
function startOnlineMatch() {
    console.log('🎮 Online maç başlıyor...');
    console.log('📊 Benim takımım:', myTeamNumber);
    console.log('📊 Benim logo:', selectedTeamLogo);
    console.log('📊 Rakip logo:', aiTeamLogo);
    
    isOnlineMatch = true;
    
    document.getElementById('top-bar').style.display = 'flex';
    matchSecondsLeft = MATCH_DURATION;
    document.getElementById('time-board').innerText = matchSecondsLeft + 's';
    
    showField();
    
    // Kendi logosunu yükle
    if (selectedTeamLogo) {
        loadTeamLogoImage(selectedTeamLogo);
    }
    // Rakip logosunu yükle (tekrar)
    if (aiTeamLogo && aiTeamLogo !== 'default.png') {
        loadTeamLogoImage(aiTeamLogo);
    }
    
    setTimeout(function() { 
        updateScoreLogos(); 
    }, 100);
    
    startOnlineSetupPhase();
}
// ============================================================
// ONLINE SETUP - RAKİP PİNLERİNİ EKLE
// ============================================================
function startOnlineSetupPhase() {
    console.log('⚙️ Online setup başlıyor...');
    console.log('📊 Benim logo:', selectedTeamLogo);
    console.log('📊 Rakip logo:', aiTeamLogo);
    console.log('📊 Rakip pinleri:', opponentPinsData);
    
    showField();
    currentPhase = 'setup';
    score = { p1: 0, p2: 0 };
    document.getElementById('score-p1').innerText = "0";
    document.getElementById('score-p2').innerText = "0";
    document.getElementById('time-board').innerText = matchSecondsLeft + 's';
    
    var startBtn = document.getElementById('start-match-btn');
    startBtn.style.display = 'flex';
    startBtn.style.opacity = '1';
    startBtn.disabled = false;
    startBtn.innerHTML = 'BAŞLAT';
    
    var indicator = document.getElementById('turn-indicator');
    if (indicator) {
        indicator.innerText = "🏆 Takım Taktik Ayarla";
        indicator.style.borderColor = "#f1c40f";
        indicator.style.color = "#f1c40f";
    }
    
    document.getElementById('shot-timer').style.display = 'none';
    editableTeam = myTeamNumber;
    
    // KALELER
    pins = [
        { x: (width - goalWidth) / 2, y: goalHeight, isPost: true, locked: false },
        { x: (width + goalWidth) / 2, y: goalHeight, isPost: true, locked: false },
        { x: (width - goalWidth) / 2, y: height - goalHeight, isPost: true, locked: false },
        { x: (width + goalWidth) / 2, y: height - goalHeight, isPost: true, locked: false }
    ];
    
    // KENDİ TAKIMINI EKLE
    var myPositions;
    if (myTeamNumber === 1) {
        myPositions = [
            { x: width * 0.50, y: height * 0.88, team: 1 },
            { x: width * 0.15, y: height * 0.73, team: 1 },
            { x: width * 0.38, y: height * 0.77, team: 1 },
            { x: width * 0.62, y: height * 0.77, team: 1 },
            { x: width * 0.85, y: height * 0.73, team: 1 },
            { x: width * 0.15, y: height * 0.58, team: 1 },
            { x: width * 0.38, y: height * 0.60, team: 1 },
            { x: width * 0.62, y: height * 0.60, team: 1 },
            { x: width * 0.85, y: height * 0.58, team: 1 },
            { x: width * 0.35, y: height * 0.45, team: 1 },
            { x: width * 0.65, y: height * 0.45, team: 1 }
        ];
    } else {
        myPositions = [
            { x: width * 0.50, y: height * 0.12, team: 2 },
            { x: width * 0.85, y: height * 0.27, team: 2 },
            { x: width * 0.62, y: height * 0.23, team: 2 },
            { x: width * 0.38, y: height * 0.23, team: 2 },
            { x: width * 0.15, y: height * 0.27, team: 2 },
            { x: width * 0.85, y: height * 0.42, team: 2 },
            { x: width * 0.62, y: height * 0.40, team: 2 },
            { x: width * 0.38, y: height * 0.40, team: 2 },
            { x: width * 0.15, y: height * 0.42, team: 2 },
            { x: width * 0.65, y: height * 0.55, team: 2 },
            { x: width * 0.35, y: height * 0.55, team: 2 }
        ];
    }
    for (var i = 0; i < myPositions.length; i++) {
        pins.push({ x: myPositions[i].x, y: myPositions[i].y, team: myPositions[i].team, locked: false });
    }
    
    // RAKİP TAKIMINI EKLE
    var opponentTeam = myTeamNumber === 1 ? 2 : 1;
    
    if (opponentPinsData && opponentPinsData.length > 0) {
        console.log('📊 RAKİP PİNLERİ EKLENİYOR:', opponentPinsData.length);
        for (var j = 0; j < opponentPinsData.length; j++) {
            var p = opponentPinsData[j];
            pins.push({ 
                x: p.x, 
                y: p.y, 
                team: opponentTeam, 
                locked: false 
            });
        }
        console.log('✅ Rakip pinleri eklendi, toplam pin:', pins.length);
    } else {
        console.warn('⚠️ Rakip pinleri boş! Varsayılan kullanılıyor');
        var defaultOpponent;
        if (opponentTeam === 1) {
            defaultOpponent = [
                { x: width * 0.50, y: height * 0.88, team: 1 },
                { x: width * 0.15, y: height * 0.73, team: 1 },
                { x: width * 0.38, y: height * 0.77, team: 1 },
                { x: width * 0.62, y: height * 0.77, team: 1 },
                { x: width * 0.85, y: height * 0.73, team: 1 },
                { x: width * 0.15, y: height * 0.58, team: 1 },
                { x: width * 0.38, y: height * 0.60, team: 1 },
                { x: width * 0.62, y: height * 0.60, team: 1 },
                { x: width * 0.85, y: height * 0.58, team: 1 },
                { x: width * 0.35, y: height * 0.45, team: 1 },
                { x: width * 0.65, y: height * 0.45, team: 1 }
            ];
        } else {
            defaultOpponent = [
                { x: width * 0.50, y: height * 0.12, team: 2 },
                { x: width * 0.85, y: height * 0.27, team: 2 },
                { x: width * 0.62, y: height * 0.23, team: 2 },
                { x: width * 0.38, y: height * 0.23, team: 2 },
                { x: width * 0.15, y: height * 0.27, team: 2 },
                { x: width * 0.85, y: height * 0.42, team: 2 },
                { x: width * 0.62, y: height * 0.40, team: 2 },
                { x: width * 0.38, y: height * 0.40, team: 2 },
                { x: width * 0.15, y: height * 0.42, team: 2 },
                { x: width * 0.65, y: height * 0.55, team: 2 },
                { x: width * 0.35, y: height * 0.55, team: 2 }
            ];
        }
        for (var k = 0; k < defaultOpponent.length; k++) {
            pins.push({ x: defaultOpponent[k].x, y: defaultOpponent[k].y, team: defaultOpponent[k].team, locked: false });
        }
    }
    
    // Skor logolarını güncelle (rakip logosu görünsün)
    updateScoreLogos();
    
    cap.x = width / 2;
    cap.y = height / 2;
    cap.vx = 0;
    cap.vy = 0;
    
    console.log('📊 TOPLAM PIN SAYISI:', pins.length);
    startSetupTimer();
    animate();
}

// ============================================================
// SAHA GÖSTER/GİZLE
// ============================================================
var currentStadiumTexture = 'menu/ayarlar/stat/texure/z1-t.webp';

function showField() {
    var canvas = document.getElementById('gameCanvas');
    if (canvas) {
        canvas.style.backgroundImage = "url('" + currentStadiumTexture + "')";
        canvas.style.backgroundSize = "cover";
        canvas.style.backgroundPosition = "center";
        canvas.style.backgroundRepeat = "no-repeat";
        canvas.style.backgroundColor = "#2e7d32";
        canvas.style.border = '4px solid rgba(27, 94, 32, 0.4)';
        canvas.style.borderRadius = '8px';
        canvas.style.boxShadow = '0 10px 40px rgba(0, 0, 0, 0.6)';
        canvas.classList.add('canvas-active');
        console.log('✅ Saha gösteriliyor:', currentStadiumTexture);
    }
}

function hideField() {
    var canvas = document.getElementById('gameCanvas');
    if (canvas) {
        canvas.style.backgroundImage = 'none';
        canvas.style.background = 'transparent';
        canvas.style.backgroundColor = 'transparent';
        canvas.style.border = 'none';
        canvas.style.borderRadius = '0';
        canvas.style.boxShadow = 'none';
        canvas.classList.remove('canvas-active');
        console.log('✅ Saha gizlendi');
    }
}

// ============================================================
// TAKIM LOGOLARI
// ============================================================
var selectedTeamLogo = '';
var aiTeamLogo = '';
var loadedLogos = {};
var localPlayer1Logo = '';
var localPlayer2Logo = '';
var localP1Selected = false;
var localP2Selected = false;

var teamLogos = [
    { file: 'fb.png', name: '⚽ Fenerbahçe' },
    { file: 'galatasaray.png', name: '⚽ Galatasaray' },
    { file: 'bjk.png', name: '⚽ Beşiktaş' },
    { file: 'ts.png', name: '⚽ Trabzonspor' },
    { file: 'bs.png', name: '⚽ Başakşehir' },
    { file: 'gfk.png', name: '⚽ Giresunspor' },
    { file: 'kaspasa.png', name: '⚽ Kasımpaşa' },
    { file: 'karagumruk.png', name: '⚽ Fatih Karagümrük' },
    { file: 'hatay.png', name: '⚽ Hatayspor' },
    { file: 'adana.png', name: '⚽ Adana Demirspor' },
    { file: 'antalya.png', name: '⚽ Antalyaspor' },
    { file: 'agucu.png', name: '⚽ Ağrı 1970 Spor' },
    { file: 'samsun.png', name: '⚽ Samsunspor' }
];

function selectRandomTeam() {
    var randomIndex = Math.floor(Math.random() * teamLogos.length);
    var selected = teamLogos[randomIndex];
    selectedTeamLogo = selected.file;
    console.log('🏆 Rastgele takım seçildi:', selected.name);
    return selected;
}

function selectRandomAITeam() {
    var availableLogos = [];
    for (var i = 0; i < teamLogos.length; i++) {
        if (teamLogos[i].file !== selectedTeamLogo) {
            availableLogos.push(teamLogos[i]);
        }
    }
    if (availableLogos.length === 0) {
        aiTeamLogo = teamLogos[0].file;
    } else {
        var randomIndex = Math.floor(Math.random() * availableLogos.length);
        var selected = availableLogos[randomIndex];
        aiTeamLogo = selected.file;
    }
    console.log('🤖 AI Takımı seçti:', aiTeamLogo);
    loadTeamLogoImage(aiTeamLogo);
    updateScoreLogos();
}

// ============================================================
// OYUN DEĞİŞKENLERİ
// ============================================================
var canvas = document.getElementById('gameCanvas');
var ctx = canvas.getContext('2d');
var width = 360;
var height = 620;
canvas.width = width;
canvas.height = height;

var currentPhase = 'menu';
var gameMode = 'local';
var score = { p1: 0, p2: 0 };
var turn = 1;

var matchSecondsLeft = MATCH_DURATION;
var timerInterval = null;
var shotSecondsLeft = SHOT_DURATION;
var shotTimerInterval = null;
var setupSecondsLeft = 15;
var setupTimerInterval = null;
var syncInterval = null;

var cap = { x: width / 2, y: height / 2, vx: 0, vy: 0, radius: 11, friction: 0.983, rotation: 0 };
var pins = [];
var editableTeam = 1;
var selectedPin = null;
var isDraggingBall = false;
var dragStart = { x: 0, y: 0 };
var dragCurrent = { x: 0, y: 0 };
var isAiThinking = false;
var aiLevel = 'orta';

var minAllowedDistance = 45;
var goalWidth = cap.radius * 2 * 3.2;
var goalHeight = 12;
var penaltyBoxW = goalWidth * 2.2;
var penaltyBoxH = height * 0.15;
var pBoxX1 = (width - penaltyBoxW) / 2;
var MAX_DRAG_DIST = cap.radius * 2 * 6;

var goalAnimation = null;
var goalAnimationStartTime = 0;
var GOAL_ANIMATION_DURATION = 3000;
var goalImage = null;
var fieldImage = null;

// ============================================================
// SAHA RESMİ YÜKLEME
// ============================================================
function loadFieldImage(imagePath) {
    var path = imagePath || currentStadiumTexture;
    console.log('🔄 Saha resmi yükleniyor:', path);
    
    var img = new Image();
    img.onload = function() {
        fieldImage = img;
        console.log('✅ Saha resmi yüklendi!');
        if (currentPhase !== 'menu') {
            draw();
        }
    };
    img.onerror = function() {
        console.warn('⚠️ Saha resmi yüklenemedi! Varsayılan yeşil arka plan kullanılacak.');
        fieldImage = null;
    };
    img.src = path;
}
loadFieldImage('menu/ayarlar/stat/texure/z1-t.webp');

function loadGoalImage(imageUrl) {
    var img = new Image();
    img.onload = function() {
        goalImage = img;
        console.log('✅ Gol fotoğrafı yüklendi!');
    };
    img.onerror = function() {
        console.warn('⚠️ Fotoğraf yüklenemedi');
        goalImage = null;
    };
    img.src = imageUrl;
}
loadGoalImage('goal.webp');

// ============================================================
// SES EFEKTLERİ
// ============================================================
var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
var goalSound = new Audio('sesler/gol.mp3');
goalSound.preload = 'auto';

// isSoundOn zaten tanımlıysa tekrar tanımlama
if (typeof isSoundOn === 'undefined') {
    var isSoundOn = true;
}

// ============================================================
// GOL ANİMASYONU
// ============================================================
function triggerGoalAnimation() {
    goalAnimation = {
        scale: 0,
        alpha: 1,
        blinkCount: 0,
        type: goalImage ? 'image' : 'text'
    };
    goalAnimationStartTime = Date.now();
    
    if (isSoundOn) {
        try {
            if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            goalSound.currentTime = 0;
            goalSound.volume = 1.0;
            var playPromise = goalSound.play();
            if (playPromise !== undefined) {
                playPromise.catch(function(error) {
                    console.warn("Safari ses çalma engeli:", error);
                });
            }
        } catch (e) {
            console.error("Gol sesi hatası:", e);
        }
    }
}

// ============================================================
// ÇİZİM FONKSİYONLARI
// ============================================================
function drawFieldLinesOnly() {
    ctx.clearRect(0, 0, width, height);
}

function drawSoccerBall(x, y, r, rotation) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.fillStyle = '#888';
    ctx.beginPath();
    for (var i = 0; i < 5; i++) {
        var a = (Math.PI * 2 / 5) * i - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * (r * 0.4), Math.sin(a) * (r * 0.4));
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

function drawPlayerWithLogo(x, y, logoFile) {
    ctx.save();
    ctx.translate(x, y);
    
    if (logoFile && loadedLogos[logoFile]) {
        var img = loadedLogos[logoFile];
        var size = cap.radius * 1.4;
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 6;
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, size - 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, -size + 2, -size + 2, size * 2 - 4, size * 2 - 4);
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, size - 1, 0, Math.PI * 2);
        ctx.stroke();
    } else {
        var size = cap.radius * 1.2;
        ctx.fillStyle = '#666';
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function draw() {
    ctx.clearRect(0, 0, width, height);
    
    if (fieldImage) {
        try {
            ctx.drawImage(fieldImage, 0, 0, width, height);
        } catch(e) {
            console.warn('⚠️ Saha resmi çizilemedi, yedek kullanılıyor');
            ctx.fillStyle = '#2e7d32';
            ctx.fillRect(0, 0, width, height);
        }
    } else {
        ctx.fillStyle = '#2e7d32';
        ctx.fillRect(0, 0, width, height);
    }
    
    ctx.save();

    if (gameMode === 'online' && myTeamNumber === 2) {
        ctx.translate(width / 2, height / 2);
        ctx.rotate(Math.PI);
        ctx.translate(-width / 2, -height / 2);
    }

    var goalLeft = (width - goalWidth) / 2;
    var goalRight = (width + goalWidth) / 2;
    
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect(pBoxX1, 0, penaltyBoxW, penaltyBoxH);
    ctx.strokeRect(pBoxX1, height - penaltyBoxH, penaltyBoxW, penaltyBoxH);

    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(goalLeft, goalHeight);
    ctx.lineTo(goalRight, goalHeight);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(goalLeft, height - goalHeight);
    ctx.lineTo(goalRight, height - goalHeight);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(goalLeft, goalHeight - 10);
    ctx.lineTo(goalLeft, goalHeight + 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(goalRight, goalHeight - 10);
    ctx.lineTo(goalRight, goalHeight + 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(goalLeft, height - goalHeight - 10);
    ctx.lineTo(goalLeft, height - goalHeight + 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(goalRight, height - goalHeight - 10);
    ctx.lineTo(goalRight, height - goalHeight + 10);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(width, 0);
    ctx.lineTo(width, height);
    ctx.stroke();

    if (currentPhase === 'setup') {
        ctx.fillStyle = "rgba(46, 204, 113, 0.05)";
        ctx.strokeStyle = "rgba(46, 204, 113, 0.2)";
        ctx.lineWidth = 2.5;
        ctx.fillRect(10, goalHeight + 10, width - 20, height - (goalHeight * 2) - 20);
        ctx.strokeRect(10, goalHeight + 10, width - 20, height - (goalHeight * 2) - 20);
    }

// draw fonksiyonu içinde, pin çizim döngüsü
for (var i = 0; i < pins.length; i++) {
    var pin = pins[i];
    if (pin.isPost) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(pin.x, pin.y, 4, 0, Math.PI * 2);
        ctx.fill();
    } else {
        var logoFile = 'default.png';
        
        if (gameMode === 'online') {
            // ONLINE MOD - Her takım için doğru logo
            if (pin.team === 1) {
                // Takım 1 için logo
                if (myTeamNumber === 1) {
                    // Ben Takım 1 ise kendi logomu göster
                    logoFile = selectedTeamLogo || 'default.png';
                } else {
                    // Ben Takım 2 ise rakip logomu göster
                    logoFile = aiTeamLogo || 'default.png';
                }
            } else if (pin.team === 2) {
                // Takım 2 için logo
                if (myTeamNumber === 2) {
                    // Ben Takım 2 ise kendi logomu göster
                    logoFile = selectedTeamLogo || 'default.png';
                } else {
                    // Ben Takım 1 ise rakip logomu göster
                    logoFile = aiTeamLogo || 'default.png';
                }
            }
            
            // DEBUG: Hangi logo kullanılıyor kontrol et
            // console.log('🎯 Pin team:', pin.team, 'Logo:', logoFile, 'myTeam:', myTeamNumber);
            
        } else if (gameMode === 'local') {
            // LOCAL MOD
            if (pin.team === 1) {
                logoFile = localPlayer1Logo || selectedTeamLogo || 'default.png';
            } else if (pin.team === 2) {
                logoFile = localPlayer2Logo || 'default.png';
            }
        } else if (gameMode === 'ai') {
            // AI MOD
            if (pin.team === 1) {
                logoFile = selectedTeamLogo || 'default.png';
            } else if (pin.team === 2) {
                logoFile = aiTeamLogo || 'default.png';
            }
        }
        
        drawPlayerWithLogo(pin.x, pin.y, logoFile);
    }
}

    if (currentPhase === 'playing' && isDraggingBall) {
        var dx = dragStart.x - dragCurrent.x;
        var dy = dragStart.y - dragCurrent.y;
        var dist = Math.hypot(dx, dy);
        
        if (dist > 10) {
            ctx.save();
            ctx.strokeStyle = 'rgba(240, 248, 255, 0.6)';
            ctx.lineWidth = 6;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.moveTo(cap.x, cap.y);
            var normX = dx / dist;
            var normY = dy / dist;
            var len = Math.min(dist * 1.2, MAX_DRAG_DIST);
            var endX = cap.x + normX * len;
            var endY = cap.y + normY * len;
            ctx.lineTo(endX, endY);
            ctx.stroke();
            ctx.setLineDash([]);
            var arrowSize = 10;
            var angle = Math.atan2(dy, dx);
            ctx.fillStyle = 'rgba(46, 204, 113, 0.6)';
            ctx.beginPath();
            ctx.moveTo(endX, endY);
            ctx.lineTo(endX - Math.cos(angle - 0.5) * arrowSize, 
                       endY - Math.sin(angle - 0.5) * arrowSize);
            ctx.lineTo(endX - Math.cos(angle + 0.5) * arrowSize, 
                       endY - Math.sin(angle + 0.5) * arrowSize);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }

    if (currentPhase === 'playing' && cap) {
        drawSoccerBall(cap.x, cap.y, cap.radius, cap.rotation);
    }

    if (goalAnimation) {
        var elapsed = Date.now() - goalAnimationStartTime;
        var progress = Math.min(elapsed / GOAL_ANIMATION_DURATION, 1);
        var scale = 0;
        if (progress < 0.15) {
            scale = (progress / 0.15) * 1.2;
        } else {
            scale = 1.2;
        }
        var alpha = 1;
        if (progress < 0.9) {
            var blinkDuration = 0.5;
            var blinkPhase = progress / blinkDuration;
            var currentBlink = Math.floor(blinkPhase);
            var phaseInBlink = blinkPhase - currentBlink;
            if (currentBlink < 6) {
                if (phaseInBlink < 0.5) {
                    alpha = phaseInBlink * 2;
                } else {
                    alpha = 1 - (phaseInBlink - 0.5) * 2;
                }
                if (currentBlink >= 2) alpha = alpha * 0.9;
                if (currentBlink >= 4) alpha = alpha * 0.8;
            } else {
                alpha = 0;
            }
        } else {
            alpha = 1 - ((progress - 0.9) / 0.1);
        }
        if (alpha < 0.01) alpha = 0;
        if (scale < 0.01) scale = 0;
        
        if (gameMode === 'online' && myTeamNumber === 2) {
            ctx.save();
            ctx.translate(width / 2, height / 2);
            ctx.rotate(Math.PI);
            ctx.translate(-width / 2, -height / 2);
        }
        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.scale(scale, scale);
        
        if (alpha > 0.1 && goalAnimation.type === 'image' && goalImage) {
            var imgSize = 100;
            ctx.shadowColor = 'rgba(255, 215, 0, ' + (alpha * 0.5) + ')';
            ctx.shadowBlur = 50;
            ctx.save();
            ctx.beginPath();
            ctx.arc(0, 0, imgSize / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.globalAlpha = alpha;
            ctx.drawImage(goalImage, -imgSize/2, -imgSize/2, imgSize, imgSize);
            ctx.globalAlpha = 1;
            ctx.restore();
            ctx.shadowBlur = 0;
            if (alpha > 0.1) {
                ctx.strokeStyle = 'rgba(255, 215, 0, ' + (alpha * 0.9) + ')';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(0, 0, imgSize / 2 + 4, 0, Math.PI * 2);
                ctx.stroke();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.font = 'bold 38px Arial';
                ctx.shadowColor = 'rgba(0, 0, 0, ' + (alpha * 0.9) + ')';
                ctx.shadowBlur = 15;
                ctx.fillStyle = 'rgba(0, 0, 0, ' + (alpha * 0.7) + ')';
                ctx.fillText('⚽ GOAL! ⚽', 2, imgSize/2 + 12);
                ctx.shadowBlur = 0;
                ctx.fillStyle = 'rgba(255, 215, 0, ' + alpha + ')';
                ctx.shadowColor = 'rgba(255, 215, 0, ' + (alpha * 0.3) + ')';
                ctx.shadowBlur = 20;
                ctx.fillText('⚽ GOAL! ⚽', 0, imgSize/2 + 12);
                ctx.shadowBlur = 0;
            }
        } else if (alpha > 0.1) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold ' + (70 * (0.8 + scale * 0.2)) + 'px Arial';
            ctx.shadowColor = 'rgba(0, 0, 0, ' + (alpha * 0.8) + ')';
            ctx.shadowBlur = 15;
            ctx.fillStyle = 'rgba(0, 0, 0, ' + (alpha * 0.7) + ')';
            ctx.fillText('⚽ GOAL! ⚽', 3, 3);
            ctx.shadowBlur = 0;
            var textGradient = ctx.createLinearGradient(-70, -40, 70, 40);
            textGradient.addColorStop(0, 'rgba(255, 215, 0, ' + alpha + ')');
            textGradient.addColorStop(0.5, 'rgba(255, 255, 0, ' + alpha + ')');
            textGradient.addColorStop(1, 'rgba(255, 200, 0, ' + alpha + ')');
            ctx.fillStyle = textGradient;
            ctx.shadowColor = 'rgba(255, 215, 0, ' + (alpha * 0.3) + ')';
            ctx.shadowBlur = 30;
            ctx.fillText('⚽ GOAL! ⚽', 0, 0);
            ctx.shadowBlur = 0;
        }
        if (alpha > 0.1) {
            for (var si = 0; si < 16; si++) {
                var angle = (si / 16) * Math.PI * 2 + progress * 0.5;
                var dist = 80 + Math.sin(progress * 6 + si * 1.2) * 20;
                var starX = Math.cos(angle) * dist;
                var starY = Math.sin(angle) * dist;
                var starSize = 5 + Math.sin(progress * 8 + si * 1.8) * 3;
                ctx.fillStyle = 'rgba(255, 215, 0, ' + (alpha * (0.15 + Math.sin(progress * 10 + si * 1.5) * 0.1)) + ')';
                ctx.shadowBlur = 0;
                ctx.beginPath();
                var spikes = 5;
                var outerRadius = Math.abs(starSize);
                var innerRadius = outerRadius * 0.4;
                ctx.moveTo(starX + outerRadius * Math.cos(0), starY + outerRadius * Math.sin(0));
                for (var j = 1; j < spikes * 2; j++) {
                    var radius = j % 2 === 0 ? outerRadius : innerRadius;
                    var theta = (j / (spikes * 2)) * Math.PI * 2;
                    ctx.lineTo(starX + radius * Math.cos(theta), starY + radius * Math.sin(theta));
                }
                ctx.closePath();
                ctx.fill();
            }
            var blinkFlash = Math.sin(progress * 20) * 0.5 + 0.5;
            if (blinkFlash > 0.8 && alpha > 0.5) {
                ctx.fillStyle = 'rgba(255, 255, 200, ' + (alpha * 0.05 * blinkFlash) + ')';
                ctx.beginPath();
                ctx.arc(0, 0, 200, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
        if (gameMode === 'online' && myTeamNumber === 2) {
            ctx.restore();
        }
        if (progress >= 1) {
            goalAnimation = null;
        }
    }
    ctx.restore();
}

// ============================================================
// KOORDİNAT YAKALAMA
// ============================================================
function getCanvasTouchPos(e) {
    var rect = canvas.getBoundingClientRect();
    var clientX, clientY;
    if (e.touches) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else if (e.changedTouches) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    var x = (clientX - rect.left) * scaleX;
    var y = (clientY - rect.top) * scaleY;
    x = Math.max(0, Math.min(width, x));
    y = Math.max(0, Math.min(height, y));
    if (gameMode === 'online' && myTeamNumber === 2) {
        x = width - x;
        y = height - y;
    }
    return { x: x, y: y };
}

// ============================================================
// AI SİSTEMİ - GELİŞMİŞ VERSİYON
// ============================================================

// ============================================================
// 1. VURUŞ DEĞERLENDİRME SİSTEMİ
// ============================================================
function evaluateShot(targetX, targetY, shotType, level) {
    let score = 0;
    const opponentPins = pins.filter(p => p.team === 1 && !p.isPost);
    
    // 1. Doğrudan yol kontrolü (tüm seviyeler)
    const directPath = checkDirectPath(targetX, targetY, opponentPins);
    if (directPath.clear) {
        score += 50;
    } else {
        // Engellenmişse, sektirme avantajlı
        if (shotType !== 'direct') {
            score += 30;
        }
    }
    
    // 2. Hedef kalitesi (tüm seviyeler)
    const goalCenterX = width / 2;
    const centerDist = Math.abs(targetX - goalCenterX);
    score += (60 - centerDist) * 1.5;
    
    // 3. Topun hedefe olan mesafesi
    const distToTarget = Math.hypot(targetX - cap.x, targetY - cap.y);
    if (distToTarget < 50) {
        score += 10;
    } else if (distToTarget > 250) {
        score -= 10;
    }
    
    // 4. Vuruş tipine göre bonus (seviyeye göre)
    switch(shotType) {
        case 'direct':
            score += 15;
            break;
        case 'bank_wall':
            if (level === 'orta' || level === 'zor' || level === 'usta') score += 10;
            break;
        case 'bank_pin':
            if (level === 'zor' || level === 'usta') score += 20;
            break;
        case 'double_bank':
            if (level === 'usta') score += 25;
            break;
        case 'pin_wall_combo':
            if (level === 'usta') score += 30;
            break;
    }
    
    // 5. Duvar mesafesi kontrolü
    const wallDist = Math.min(cap.x, width - cap.x);
    if (wallDist < 30) {
        if (shotType === 'bank_wall') {
            score += 10;
        } else {
            score -= 5;
        }
    }
    
    return score;
}

// ============================================================
// 2. DOĞRUDAN YOL KONTROLÜ
// ============================================================
function checkDirectPath(targetX, targetY, opponentPins) {
    const ballToTargetAngle = Math.atan2(targetY - cap.y, targetX - cap.x);
    const distToTarget = Math.hypot(targetX - cap.x, targetY - cap.y);
    let clear = true;
    let blockedBy = null;
    
    for (var i = 0; i < opponentPins.length; i++) {
        var pin = opponentPins[i];
        var pinToBall = Math.hypot(pin.x - cap.x, pin.y - cap.y);
        var pinAngle = Math.atan2(pin.y - cap.y, pin.x - cap.x);
        var angleDiff = Math.abs(ballToTargetAngle - pinAngle);
        
        if (angleDiff < 0.2 && pinToBall < distToTarget) {
            var distFromLine = Math.abs(Math.sin(angleDiff) * pinToBall);
            if (distFromLine < 25) {
                clear = false;
                blockedBy = pin;
            }
        }
    }
    
    return { clear: clear, blockedBy: blockedBy };
}

// ============================================================
// 3. PİNDEN SEKTİRME HESAPLAMA
// ============================================================
function calculatePinBankShot(pin, targetX, targetY) {
    // Top → Pin → Kale açısını hesapla
    var angleToPin = Math.atan2(pin.y - cap.y, pin.x - cap.x);
    var anglePinToGoal = Math.atan2(targetY - pin.y, targetX - pin.x);
    
    // Yansıma açısı: Geliş açısı = Yansıma açısı
    var reflectionAngle = 2 * anglePinToGoal - angleToPin;
    
    // Yansıyan açıdan hedefi hesapla
    var distPinToGoal = Math.hypot(targetX - pin.x, targetY - pin.y);
    var reflectedX = pin.x + Math.cos(reflectionAngle) * distPinToGoal;
    var reflectedY = pin.y + Math.sin(reflectionAngle) * distPinToGoal;
    
    return { x: reflectedX, y: reflectedY, angle: reflectionAngle };
}

// ============================================================
// 4. PIN + DUVAR KOMBİNASYONU HESAPLAMA (Sadece Usta)
// ============================================================
function calculatePinWallCombo(pin, wallSide) {
    // Top → Pin → Duvar → Kale
    var wallX, wallY;
    
    if (wallSide === 'left') {
        wallX = 0;
        wallY = pin.y + (cap.y - pin.y) * (0 - pin.x) / (cap.x - pin.x);
    } else {
        wallX = width;
        wallY = pin.y + (cap.y - pin.y) * (width - pin.x) / (cap.x - pin.x);
    }
    
    // Duvar → Kale
    var goalY = height - goalHeight;
    var goalCenterX = width / 2;
    
    // Duvar noktasından kaleye doğru açı
    var angleWallToGoal = Math.atan2(goalY - wallY, goalCenterX - wallX);
    
    // Yansıma açısı ile hedefi bul
    var distWallToGoal = Math.hypot(goalCenterX - wallX, goalY - wallY);
    var reflectedX = wallX + Math.cos(angleWallToGoal) * distWallToGoal;
    var reflectedY = wallY + Math.sin(angleWallToGoal) * distWallToGoal;
    
    return { x: reflectedX, y: reflectedY, wallX: wallX, wallY: wallY };
}

// ============================================================
// 5. AI PARAMETRELERİ - GELİŞMİŞ VERSİYON
// ============================================================
function getAIParameters() {
    switch (aiLevel) {
        case 'kolay': 
            return { 
                reactionDelay: 800, 
                pullDistanceMin: 20, 
                pullDistanceMax: 50, 
                errorMargin: 25, 
                powerError: 0.20,
                fakeChance: 0.02,
                targetZones: 3,
                analyzeOpponents: false,
                analyzeWalls: false,
                useBankShots: false,
                useDoubleBank: false,
                bankShotChance: 0,
                usePinBank: false,
                usePinWallCombo: false
            };
        case 'orta': 
            return { 
                reactionDelay: 600, 
                pullDistanceMin: 30, 
                pullDistanceMax: 70, 
                errorMargin: 12, 
                powerError: 0.10,
                fakeChance: 0.08,
                targetZones: 5,
                analyzeOpponents: true,
                analyzeWalls: false,
                useBankShots: true,
                useDoubleBank: false,
                bankShotChance: 0.30,
                usePinBank: false,
                usePinWallCombo: false
            };
        case 'zor': 
            return { 
                reactionDelay: 400, 
                pullDistanceMin: 50, 
                pullDistanceMax: 85, 
                errorMargin: 6, 
                powerError: 0.05,
                fakeChance: 0.15,
                targetZones: 5,
                analyzeOpponents: true,
                analyzeWalls: true,
                useBankShots: true,
                useDoubleBank: false,
                bankShotChance: 0.40,
                usePinBank: true,
                usePinWallCombo: false
            };
        case 'usta': 
            return { 
                reactionDelay: 200, 
                pullDistanceMin: 50, 
                pullDistanceMax: 90, 
                errorMargin: 2, 
                powerError: 0.02,
                fakeChance: 0.30,
                targetZones: 7,
                analyzeOpponents: true,
                analyzeWalls: true,
                useBankShots: true,
                useDoubleBank: true,
                bankShotChance: 0.50,
                usePinBank: true,
                usePinWallCombo: true
            };
        default: 
            return { 
                reactionDelay: 600, 
                pullDistanceMin: 30, 
                pullDistanceMax: 65, 
                errorMargin: 12, 
                powerError: 0.10,
                fakeChance: 0.08,
                targetZones: 5,
                analyzeOpponents: true,
                analyzeWalls: false,
                useBankShots: false,
                useDoubleBank: false,
                bankShotChance: 0,
                usePinBank: false,
                usePinWallCombo: false
            };
    }
}

// ============================================================
// 6. AI HEDEF SEÇİMİ - GELİŞMİŞ VERSİYON
// ============================================================
function calculateAITarget(params) {
    var goalY = height - goalHeight;
    var goalLeft = (width - goalWidth) / 2;
    var goalRight = (width + goalWidth) / 2;
    var level = aiLevel;
    
    // Rakip oyuncular (takım 1)
    var opponentPins = [];
    for (var i = 0; i < pins.length; i++) {
        if (pins[i].team === 1 && !pins[i].isPost) {
            opponentPins.push(pins[i]);
        }
    }
    
    var bestShot = null;
    var bestScore = -Infinity;
    
    // === 1. DOĞRUDAN VURUŞLAR (Tüm seviyeler) ===
    var numDirectZones = (level === 'usta') ? 7 : (level === 'zor' || level === 'orta' ? 5 : 3);
    for (var i = 0; i < numDirectZones; i++) {
        var targetX = goalLeft + (i / (numDirectZones - 1)) * (goalRight - goalLeft);
        var targetY = goalY;
        
        var score = evaluateShot(targetX, targetY, 'direct', level);
        if (score > bestScore) {
            bestScore = score;
            bestShot = { x: targetX, y: targetY, type: 'direct' };
        }
    }
    
    // === 2. DUVARDAN SEKTİRME (Orta ve üzeri) ===
    if (level === 'orta' || level === 'zor' || level === 'usta') {
        var numBankZones = (level === 'usta') ? 5 : 4;
        for (var wallSide = 0; wallSide < 2; wallSide++) {
            for (var i = 0; i < numBankZones; i++) {
                var targetX = goalLeft + (i / (numBankZones - 1)) * (goalRight - goalLeft);
                var targetY = goalY;
                
                var reflectedX, reflectedY;
                if (wallSide === 0) {
                    reflectedX = -targetX; // Sol duvar
                    reflectedY = targetY;
                } else {
                    reflectedX = width + (width - targetX); // Sağ duvar
                    reflectedY = targetY;
                }
                
                var score = evaluateShot(reflectedX, reflectedY, 'bank_wall', level);
                if (score > bestScore) {
                    bestScore = score;
                    bestShot = { 
                        x: reflectedX, 
                        y: reflectedY, 
                        type: 'bank_wall',
                        actualTarget: { x: targetX, y: targetY }
                    };
                }
            }
        }
    }
    
  // === 3. PİNDEN SEKTİRME (Zor ve Usta) ===
if (level === 'zor' || level === 'usta') {
    var numPinZones = (level === 'usta') ? 5 : 3; // Daha fazla bölge
    for (var pinIdx = 0; pinIdx < opponentPins.length; pinIdx++) {
        var pin = opponentPins[pinIdx];
        // Sadece topa yakın pinleri kullan (Usta için)
        var distToPin = Math.hypot(pin.x - cap.x, pin.y - cap.y);
        if (level === 'usta' && distToPin > 200) continue; // Çok uzak pinleri atla
        
        for (var i = 0; i < numPinZones; i++) {
            var targetX = goalLeft + (i / (numPinZones - 1)) * (goalRight - goalLeft);
            var targetY = goalY;
            
            var pinBank = calculatePinBankShot(pin, targetX, targetY);
            
            // Usta için: Pin'den sonra topun kaleye ulaşma açısını kontrol et
            if (level === 'usta') {
                var angleAfterPin = Math.atan2(targetY - pin.y, targetX - pin.x);
                var angleToGoal = Math.atan2(goalY - pin.y, goalCenterX - pin.x);
                var angleDiff = Math.abs(angleAfterPin - angleToGoal);
                if (angleDiff > 0.5) continue; // Açı çok farklıysa atla
            }
            
            var score = evaluateShot(pinBank.x, pinBank.y, 'bank_pin', level);
            
            if (score > bestScore) {
                bestScore = score;
                bestShot = {
                    x: pinBank.x,
                    y: pinBank.y,
                    type: 'bank_pin',
                    actualTarget: { x: targetX, y: targetY },
                    pinUsed: pin
                };
            }
        }
    }
}
    // === 4. PIN + DUVAR KOMBİNASYONU (Sadece Usta) ===
    if (level === 'usta') {
        for (var pinIdx = 0; pinIdx < opponentPins.length; pinIdx++) {
            var pin = opponentPins[pinIdx];
            for (var wallSide = 0; wallSide < 2; wallSide++) {
                var combo = calculatePinWallCombo(pin, wallSide === 0 ? 'left' : 'right');
                var score = evaluateShot(combo.x, combo.y, 'pin_wall_combo', level);
                
                if (score > bestScore) {
                    bestScore = score;
                    bestShot = {
                        x: combo.x,
                        y: combo.y,
                        type: 'pin_wall_combo',
                        actualTarget: { x: combo.x, y: combo.y },
                        pinUsed: pin,
                        wallUsed: wallSide === 0 ? 'left' : 'right'
                    };
                }
            }
        }
    }
    
    // === 5. ÇİFT DUVAR SEKTİRME (Sadece Usta) ===
    if (level === 'usta') {
        var numDoubleZones = 3;
        for (var i = 0; i < numDoubleZones; i++) {
            var targetX = goalLeft + (i / (numDoubleZones - 1)) * (goalRight - goalLeft);
            var targetY = goalY;
            
            var tempX = -targetX;
            var doubleReflectedX = width + (width - tempX);
            
            var score = evaluateShot(doubleReflectedX, targetY, 'double_bank', level);
            if (score > bestScore) {
                bestScore = score;
                bestShot = {
                    x: doubleReflectedX,
                    y: targetY,
                    type: 'double_bank',
                    actualTarget: { x: targetX, y: targetY }
                };
            }
        }
    }
    
    // Hata payı ekle
    if (bestShot) {
        var errorX = (Math.random() - 0.5) * 2 * params.errorMargin;
        var errorY = (Math.random() - 0.5) * 2 * (params.errorMargin * 0.6);
        bestShot.x += errorX;
        bestShot.y += errorY;
    }
    
    return bestShot || { x: width/2, y: goalY, type: 'direct' };
}

// ============================================================
// 7. AI VURUŞ FONKSİYONU - TAM GÜNCELLENMİŞ (USTA İYİLEŞTİRMELİ)
// ============================================================
function executeAIShot(target, params) {
    var angle;
    var pullDistance;
    var level = aiLevel;
    
    // === Vuruş tipine göre açı hesaplama ===
    switch(target.type) {
        case 'direct':
            // Doğrudan vuruş
            angle = Math.atan2(target.y - cap.y, target.x - cap.x);
            break;
            
        case 'bank_wall':
            // Duvardan sektirme
            if (target.x < 0) {
                // Sol duvar: Top sol duvara çarpıp kaleye gidecek
                var reflectedX = -target.x;
                angle = Math.atan2(target.y - cap.y, reflectedX - cap.x);
                console.log('🎯 SOL DUVAR SEKTİRME - Açı:', angle * 180 / Math.PI);
            } else {
                // Sağ duvar: Top sağ duvara çarpıp kaleye gidecek
                var reflectedX = width + (width - target.x);
                angle = Math.atan2(target.y - cap.y, reflectedX - cap.x);
                console.log('🎯 SAĞ DUVAR SEKTİRME - Açı:', angle * 180 / Math.PI);
            }
            break;
            
        case 'bank_pin':
            // Pinden sektirme
            if (target.pinUsed) {
                var angleToPin = Math.atan2(target.pinUsed.y - cap.y, target.pinUsed.x - cap.x);
                var anglePinToGoal = Math.atan2(target.actualTarget.y - target.pinUsed.y, 
                                                 target.actualTarget.x - target.pinUsed.x);
                angle = 2 * anglePinToGoal - angleToPin;
                console.log('🎯 PİNDEN SEKTİRME - Pin:', target.pinUsed.x, target.pinUsed.y, 'Açı:', angle * 180 / Math.PI);
            } else {
                angle = Math.atan2(target.y - cap.y, target.x - cap.x);
            }
            break;
            
        case 'pin_wall_combo':
            // Pin + Duvar kombinasyonu
            if (target.pinUsed) {
                var angleToPin = Math.atan2(target.pinUsed.y - cap.y, target.pinUsed.x - cap.x);
                var wallX = target.wallUsed === 'left' ? 0 : width;
                var anglePinToWall = Math.atan2(wallX - target.pinUsed.x, target.pinUsed.y - cap.y);
                angle = 2 * anglePinToWall - angleToPin;
                console.log('🎯 PIN+DUVAR KOMBO - Pin:', target.pinUsed.x, target.pinUsed.y, 'Duvar:', target.wallUsed, 'Açı:', angle * 180 / Math.PI);
            } else {
                angle = Math.atan2(target.y - cap.y, target.x - cap.x);
            }
            break;
            
        case 'double_bank':
            // Çift duvar sektirme
            var tempX = -target.x;
            var doubleReflectedX = width + (width - tempX);
            angle = Math.atan2(target.y - cap.y, doubleReflectedX - cap.x);
            console.log('🎯 ÇİFT DUVAR SEKTİRME - Açı:', angle * 180 / Math.PI);
            break;
            
        default:
            angle = Math.atan2(target.y - cap.y, target.x - cap.x);
    }
    
    // === GÜÇ HESAPLAMA ===
    var distanceToTarget = Math.hypot(target.x - cap.x, target.y - cap.y);
    var normalizedDist = Math.min(distanceToTarget / 300, 1);
    
    if (level === 'usta') {
        // USTA: Hedefe olan mesafeye göre dinamik güç
        // Uzaktaki hedefler için daha sert vuruş
        pullDistance = params.pullDistanceMin + (params.pullDistanceMax - params.pullDistanceMin) * normalizedDist;
        // Usta için ekstra güç bonusu
        pullDistance = Math.min(pullDistance * 1.1, MAX_DRAG_DIST);
    } else if (level === 'zor') {
        pullDistance = params.pullDistanceMin + Math.random() * (params.pullDistanceMax - params.pullDistanceMin);
        pullDistance = Math.min(pullDistance * 1.05, MAX_DRAG_DIST);
    } else {
        pullDistance = params.pullDistanceMin + Math.random() * (params.pullDistanceMax - params.pullDistanceMin);
    }
    
    // Güç hata payı ekle
    var powerErrorFactor = 1 + (Math.random() - 0.5) * 2 * params.powerError;
    pullDistance = Math.min(pullDistance * powerErrorFactor, MAX_DRAG_DIST);
    
    // === VURUŞU GERÇEKLEŞTİR ===
    // Vuruş süresi kontrolü
    var extraDelay = 150;
    if (shotSecondsLeft < 2) {
        extraDelay = 50;
        pullDistance = Math.min(pullDistance, 60);
    }
    
    // Hata payı: Usta için çok az, diğerleri için daha fazla
    var angleError = 0;
    if (level === 'kolay') {
        angleError = (Math.random() - 0.5) * 0.3;
    } else if (level === 'orta') {
        angleError = (Math.random() - 0.5) * 0.15;
    } else if (level === 'zor') {
        angleError = (Math.random() - 0.5) * 0.07;
    } else { // Usta
        angleError = (Math.random() - 0.5) * 0.03;
    }
    angle += angleError;
    
    console.log('💪 VURUŞ - Tip:', target.type, 'Güç:', pullDistance, 'Açı:', angle * 180 / Math.PI);
    
    setTimeout(function() {
        // ÇEKİŞ ANİMASYONU (Görsel efekt için)
        isDraggingBall = true;
        dragStart = { x: cap.x, y: cap.y };
        dragCurrent = { 
            x: cap.x - Math.cos(angle) * pullDistance * 0.5,
            y: cap.y - Math.sin(angle) * pullDistance * 0.5
        };
        
        var stepCount = 0;
        var totalSteps = Math.max(4, Math.min(8, Math.floor(pullDistance / 15)));
        
        var pullInterval = setInterval(function() {
            stepCount++;
            var ratio = stepCount / totalSteps;
            var currentPull = Math.min(pullDistance * ratio, MAX_DRAG_DIST);
            dragCurrent = { 
                x: cap.x - Math.cos(angle) * currentPull, 
                y: cap.y - Math.sin(angle) * currentPull 
            };
            
            if (stepCount >= totalSteps) {
                clearInterval(pullInterval);
                
                // VURUŞ
                setTimeout(function() {
                    isDraggingBall = false;
                    isAiThinking = false;
                    playSound('kick');
                    
                    // VURUŞ KATSAYISI (0.13 standart, Usta için biraz daha yüksek)
                    var powerMultiplier = 0.13;
                    if (level === 'usta') {
                        powerMultiplier = 0.14; // Biraz daha sert
                    } else if (level === 'zor') {
                        powerMultiplier = 0.135;
                    }
                    powerMultiplier *= (0.9 + Math.random() * 0.2);
                    
                    cap.vx = (dragStart.x - dragCurrent.x) * powerMultiplier;
                    cap.vy = (dragStart.y - dragCurrent.y) * powerMultiplier;
                    
                    // Usta için vuruş sonrası topa ekstra hız kontrolü
                    if (level === 'usta') {
                        var currentSpeed = Math.hypot(cap.vx, cap.vy);
                        if (currentSpeed < 2) {
                            cap.vx *= 1.3;
                            cap.vy *= 1.3;
                        }
                    }
                    
                    turn = 1;
                    updateHUDTurn();
                    resetShotTimer();
                    
                    console.log('⚡ VURUŞ TAMAMLANDI - Hız:', Math.hypot(cap.vx, cap.vy));
                }, extraDelay);
            }
        }, 30);
        
    }, params.reactionDelay);
}
// ============================================================
// 8. SAHTE VURUŞ (FAKE SHOT) - SADECE USTA
// ============================================================
function executeFakeShot(target, params) {
    var fakeAngle = Math.atan2(target.y - cap.y, target.x - cap.x) + (Math.random() - 0.5) * 1.5;
    var realAngle = Math.atan2(target.y - cap.y, target.x - cap.x);
    
    var pullDistance = Math.min(
        params.pullDistanceMin + Math.random() * (params.pullDistanceMax - params.pullDistanceMin),
        MAX_DRAG_DIST
    );
    
    // 1. Sahte çekiş
    setTimeout(function() {
        isDraggingBall = true;
        dragStart = { x: cap.x, y: cap.y };
        dragCurrent = { 
            x: cap.x - Math.cos(fakeAngle) * pullDistance * 0.6,
            y: cap.y - Math.sin(fakeAngle) * pullDistance * 0.6
        };
        
        // 2. Gerçek vuruşa geç
        setTimeout(function() {
            var realPullDistance = Math.min(pullDistance * 0.8, MAX_DRAG_DIST);
            dragCurrent = {
                x: cap.x - Math.cos(realAngle) * realPullDistance,
                y: cap.y - Math.sin(realAngle) * realPullDistance
            };
            
            setTimeout(function() {
                isDraggingBall = false;
                isAiThinking = false;
                playSound('kick');
                
                var powerMultiplier = 0.13 * (0.8 + Math.random() * 0.4);
                cap.vx = (dragStart.x - dragCurrent.x) * powerMultiplier;
                cap.vy = (dragStart.y - dragCurrent.y) * powerMultiplier;
                
                turn = 1;
                updateHUDTurn();
                resetShotTimer();
            }, 150);
        }, 200);
    }, params.reactionDelay * 0.6);
}

// ============================================================
// 9. AI HAREKET BAŞLATICI - GÜNCELLENMİŞ
// ============================================================
function runAIMove() {
    if (currentPhase !== 'playing' || gameMode !== 'ai' || turn !== 2) return;
    if (Math.hypot(cap.vx, cap.vy) > 0.2 || isAiThinking) return;
    isAiThinking = true;
    
    var params = getAIParameters();
    
    // Vuruş süresine göre acil durum kontrolü
    if (shotSecondsLeft < 2) {
        params.reactionDelay = Math.min(params.reactionDelay, 200);
        params.pullDistanceMin = Math.min(params.pullDistanceMin, 20);
        params.pullDistanceMax = Math.min(params.pullDistanceMax, 40);
    }
    
    var target = calculateAITarget(params);
    
    // Sahte vuruş kontrolü (sadece Usta)
    if (Math.random() < params.fakeChance && aiLevel === 'usta') {
        executeFakeShot(target, params);
    } else {
        executeAIShot(target, params);
    }
}
// ============================================================
// OYUN FONKSİYONLARI
// ============================================================
function startLocalGame(mode, level) {
    gameMode = mode;
    if (mode === 'ai' && level) {
        aiLevel = level;
        closeAILevelMenu();
        selectRandomAITeam();
        setTimeout(function() {
            updateScoreLogos();
        }, 100);
    }
    document.getElementById('menu').style.display = 'none';
    document.getElementById('top-bar').style.display = 'flex';
    matchSecondsLeft = MATCH_DURATION;
    var timeBoard = document.getElementById('time-board');
    if (timeBoard) timeBoard.innerText = matchSecondsLeft + 's';
    showField();
    startSetupPhase();
}

function startSetupPhase() {
    showField();
    currentPhase = 'setup';
    score = { p1: 0, p2: 0 };
    document.getElementById('score-p1').innerText = "0";
    document.getElementById('score-p2').innerText = "0";
    var timeBoard = document.getElementById('time-board');
    if (timeBoard) timeBoard.innerText = matchSecondsLeft + 's';
    var startBtn = document.getElementById('start-match-btn');
    startBtn.style.display = 'flex';
    startBtn.style.opacity = '1';
    startBtn.disabled = false;
    var indicator = document.getElementById('turn-indicator');
    if (indicator) {
        indicator.innerText = "🏆 Takım Taktik Ayarla";
        indicator.style.borderColor = "#f1c40f";
        indicator.style.color = "#f1c40f";
    }
    var shotTimer = document.getElementById('shot-timer');
    if (shotTimer) {
        shotTimer.style.display = 'none';
        shotTimer.innerText = 'ŞUT: ' + SHOT_DURATION + 's';
    }
    editableTeam = (gameMode === 'online') ? myTeamNumber : 1;
    pins = [
        { x: (width - goalWidth) / 2, y: goalHeight, isPost: true, locked: false },
        { x: (width + goalWidth) / 2, y: goalHeight, isPost: true, locked: false },
        { x: (width - goalWidth) / 2, y: height - goalHeight, isPost: true, locked: false },
        { x: (width + goalWidth) / 2, y: height - goalHeight, isPost: true, locked: false }
    ];
    var blue442 = [
        { x: width * 0.50, y: height * 0.88, team: 1 }, { x: width * 0.15, y: height * 0.73, team: 1 },
        { x: width * 0.38, y: height * 0.77, team: 1 }, { x: width * 0.62, y: height * 0.77, team: 1 },
        { x: width * 0.85, y: height * 0.73, team: 1 }, { x: width * 0.15, y: height * 0.58, team: 1 },
        { x: width * 0.38, y: height * 0.60, team: 1 }, { x: width * 0.62, y: height * 0.60, team: 1 },
        { x: width * 0.85, y: height * 0.58, team: 1 }, { x: width * 0.35, y: height * 0.45, team: 1 },
        { x: width * 0.65, y: height * 0.45, team: 1 }
    ];
    var red442 = [
        { x: width * 0.50, y: height * 0.12, team: 2 }, { x: width * 0.85, y: height * 0.27, team: 2 },
        { x: width * 0.62, y: height * 0.23, team: 2 }, { x: width * 0.38, y: height * 0.23, team: 2 },
        { x: width * 0.15, y: height * 0.27, team: 2 }, { x: width * 0.85, y: height * 0.42, team: 2 },
        { x: width * 0.62, y: height * 0.40, team: 2 }, { x: width * 0.38, y: height * 0.40, team: 2 },
        { x: width * 0.15, y: height * 0.42, team: 2 }, { x: width * 0.65, y: height * 0.55, team: 2 },
        { x: width * 0.35, y: height * 0.55, team: 2 }
    ];
    for (var i = 0; i < blue442.length; i++) {
        pins.push({ x: blue442[i].x, y: blue442[i].y, team: blue442[i].team, locked: false });
    }
    for (var i = 0; i < red442.length; i++) {
        pins.push({ x: red442[i].x, y: red442[i].y, team: red442[i].team, locked: false });
    }
    cap.x = width / 2;
    cap.y = height / 2;
    cap.vx = 0;
    cap.vy = 0;
    updateScoreLogos();
    startSetupTimer();
    animate();
}

function confirmFormationsAndStart() {
    if (setupTimerInterval) clearInterval(setupTimerInterval);
    if (gameMode === 'online' && socket) {
        var btn = document.getElementById('start-match-btn');
        btn.innerHTML = "BEKLE";
        btn.disabled = true;
        var myPlacedPins = [];
        for (var i = 0; i < pins.length; i++) {
            var p = pins[i];
            if (!p.isPost && p.team === myTeamNumber) {
                myPlacedPins.push({ x: p.x, y: p.y });
            }
        }
        socket.emit('player-ready', { roomId: currentRoomId, pins: myPlacedPins });
    } else {
        for (var i = 0; i < pins.length; i++) {
            pins[i].locked = true;
        }
        currentPhase = 'playing';
        document.getElementById('start-match-btn').style.display = 'none';
        var shotTimer = document.getElementById('shot-timer');
        if (shotTimer) {
            shotTimer.style.display = 'block';
            shotTimer.innerText = 'ŞUT: ' + SHOT_DURATION + 's';
        }
        updateHUDTurn();
        startMatchTimer();
        resetShotTimer();
        animate();
    }
}

function startMatchTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(function() {
        if (currentPhase === 'playing') {
            matchSecondsLeft--;
            var timeBoard = document.getElementById('time-board');
            if (timeBoard) timeBoard.innerText = matchSecondsLeft + 's';
            if (matchSecondsLeft <= 0) endMatch();
        }
    }, 1000);
}

function startSetupTimer() {
    if (setupTimerInterval) clearInterval(setupTimerInterval);
    setupSecondsLeft = 15;
    var btn = document.getElementById('start-match-btn');
    if (gameMode === 'online') {
        btn.innerHTML = 'BAŞLAT<span class="timer-subtext">' + setupSecondsLeft + 's</span>';
        setupTimerInterval = setInterval(function() {
            setupSecondsLeft--;
            if (setupSecondsLeft <= 0) {
                clearInterval(setupTimerInterval);
                confirmFormationsAndStart();
            } else {
                btn.innerHTML = 'BAŞLAT<span class="timer-subtext">' + setupSecondsLeft + 's</span>';
            }
        }, 1000);
    } else {
        btn.innerHTML = "BAŞLAT";
    }
}

function resetShotTimer() {
    if (shotTimerInterval) clearInterval(shotTimerInterval);
    shotSecondsLeft = SHOT_DURATION;
    var shotTimer = document.getElementById('shot-timer');
    if (shotTimer) {
        shotTimer.innerText = 'ŞUT: ' + shotSecondsLeft + 's';
        shotTimer.classList.remove('warning');
    }
    
    if (gameMode === 'ai' && turn === 2) {
        if (shotTimer) shotTimer.style.display = 'none';
        return;
    } else {
        if (shotTimer) shotTimer.style.display = 'block';
    }

    shotTimerInterval = setInterval(function() {
        if (currentPhase === 'playing' && Math.hypot(cap.vx, cap.vy) <= 0.2) {
            shotSecondsLeft--;
            var shotTimer = document.getElementById('shot-timer');
            if (shotTimer) {
                shotTimer.innerText = 'ŞUT: ' + shotSecondsLeft + 's';
                if (shotSecondsLeft <= 1) shotTimer.classList.add('warning');
                else shotTimer.classList.remove('warning');
            }
            
            if (shotSecondsLeft <= 0) {
                clearInterval(shotTimerInterval);
                if (shotTimer) shotTimer.classList.remove('warning');
                
                turn = (turn === 1) ? 2 : 1; 
                updateHUDTurn();
                resetShotTimer();
                
                if (gameMode === 'ai' && turn === 2) {
                    setTimeout(function() { runAIMove(); }, 300);
                }
            }
        }
    }, 1000);
}

function endMatch() {
    currentPhase = 'ended';
    clearInterval(timerInterval);
    clearInterval(shotTimerInterval);
    var playerScore = gameMode === 'online' ? (myTeamNumber === 1 ? score.p1 : score.p2) : score.p1;
    var opponentScore = gameMode === 'online' ? (myTeamNumber === 1 ? score.p2 : score.p1) : score.p2;
    var resultMessage = "Maç Berabere Bitti!";
    if (playerScore > opponentScore) resultMessage = "🎉 KAZANDINIZ! 🎉";
    else if (playerScore < opponentScore) resultMessage = "😔 Kaybettiniz.";
    alert('⏰ SÜRE DOLDU!\n\n📊 Skor: ' + playerScore + ' - ' + opponentScore + '\n\n' + resultMessage);
    setTimeout(function() { exitToMenu(); }, 500);
}

function updateHUDTurn() {
    var indicator = document.getElementById('turn-indicator');
    if (!indicator) return;
    
    if (gameMode === 'online' && isOnlineMatch) {
        if (turn === myTeamNumber) {
            indicator.innerText = '🎯 SEN (Takım ' + myTeamNumber + ')';
            indicator.style.borderColor = "#2ecc71";
            indicator.style.color = "#2ecc71";
        } else {
            indicator.innerText = '🎯 RAKİP';
            indicator.style.borderColor = "#e74c3c";
            indicator.style.color = "#e74c3c";
        }
        return;
    }
    
    if (gameMode === 'local') {
        var playerNames = {
            1: localPlayer1Logo ? (teamLogos.find(function(l) { return l.file === localPlayer1Logo; }) || {}).name.replace('⚽ ', '') || 'Oyuncu 1' : 'Oyuncu 1',
            2: localPlayer2Logo ? (teamLogos.find(function(l) { return l.file === localPlayer2Logo; }) || {}).name.replace('⚽ ', '') || 'Oyuncu 2' : 'Oyuncu 2'
        };
        if (turn === 1) {
            indicator.innerText = '🎯 ' + playerNames[1];
            indicator.style.borderColor = "#3498db";
            indicator.style.color = "#3498db";
        } else {
            indicator.innerText = '🎯 ' + playerNames[2];
            indicator.style.borderColor = "#e74c3c";
            indicator.style.color = "#e74c3c";
        }
    }
}

function getLocalPlayerName(playerNumber) {
    if (playerNumber === 1) {
        if (localPlayer1Logo) {
            var logo = teamLogos.find(function(l) { return l.file === localPlayer1Logo; });
            return logo ? 'Oyuncu 1 (' + logo.name.replace('⚽ ', '') + ')' : 'Oyuncu 1';
        }
        return 'Oyuncu 1';
    } else {
        if (localPlayer2Logo) {
            var logo = teamLogos.find(function(l) { return l.file === localPlayer2Logo; });
            return logo ? 'Oyuncu 2 (' + logo.name.replace('⚽ ', '') + ')' : 'Oyuncu 2';
        }
        return 'Oyuncu 2';
    }
}

function applyShotPhysics(shotData) {
    cap.vx = 0; cap.vy = 0;
    var dx = shotData.startX - shotData.endX;
    var dy = shotData.startY - shotData.endY;
    cap.vx = dx * 0.13; cap.vy = dy * 0.13;
    playSound('kick');
}

function broadcastMyPinMove(pin) {
    if (!socket || gameMode !== 'online' || currentPhase !== 'setup') return;
    var index = -1;
    var count = 0;
    for (var i = 0; i < pins.length; i++) {
        var p = pins[i];
        if (!p.isPost && p.team === myTeamNumber) {
            if (p === pin) { index = count; break; }
            count++;
        }
    }
    if (index !== -1) {
        socket.emit('sync-pin-move', { 
            roomId: currentRoomId, 
            team: myTeamNumber, 
            index: index, 
            x: pin.x, 
            y: pin.y 
        });
    }
}

function exitToMenu() {
    if (timerInterval) clearInterval(timerInterval);
    if (shotTimerInterval) clearInterval(shotTimerInterval);
    if (setupTimerInterval) clearInterval(setupTimerInterval);
    if (syncInterval) clearInterval(syncInterval);
    
    
        isOnlineMatch = false;
        if (socket && currentRoomId) {
            socket.emit('leave-room', currentRoomId);
            currentRoomId = null;
        }
    }
    
    if (socket && gameMode === 'online') {
        if (currentRoomId) { socket.emit('leave-room', currentRoomId); currentRoomId = null; }
        else { socket.emit('leave-lobby'); }
    }
    
    currentPhase = 'menu';
    gameMode = 'local';
    opponentPinsData = [];
    document.getElementById('menu').style.display = 'block';
    document.getElementById('top-bar').style.display = 'none';
    document.getElementById('online-lobby').style.display = 'none';
    document.getElementById('room-waiting').style.display = 'none';
    document.getElementById('start-match-btn').style.display = 'none';
    isAiThinking = false;
    isDraggingBall = false;
    hideField();
    drawFieldLinesOnly();

// ============================================================
// FİZİK MOTORU
// ============================================================
function updatePhysics() {
    if (currentPhase !== 'playing') return;
    var SUB_STEPS = 16;
    for (var step = 0; step < SUB_STEPS; step++) {
        cap.x += cap.vx / SUB_STEPS;
        cap.y += cap.vy / SUB_STEPS;
        if (cap.x - cap.radius < 0) { cap.x = cap.radius; cap.vx *= -0.85; playSound('hit'); }
        if (cap.x + cap.radius > width) { cap.x = width - cap.radius; cap.vx *= -0.85; playSound('hit'); }
        if (cap.y - cap.radius <= goalHeight) {
            var goalLeft = (width - goalWidth) / 2;
            var goalRight = (width + goalWidth) / 2;
            if (cap.x > goalLeft && cap.x < goalRight) {
                if (gameMode === 'online') {
                    if (myTeamNumber === 1) { score.p1++; document.getElementById('score-p1').innerText = score.p1; }
                    else { score.p2++; document.getElementById('score-p2').innerText = score.p2; }
                } else { score.p1++; document.getElementById('score-p1').innerText = score.p1; }
                triggerGoalAnimation();
                
                if (gameMode === 'online' && isOnlineMatch && socket && currentRoomId) {
                    socket.emit('goal-scored', {
                        roomId: currentRoomId,
                        scoringTeam: 1
                    });
                }
                
                turn = 2;
                updateHUDTurn();
                cap.x = width / 2; cap.y = height / 2; cap.vx = 0; cap.vy = 0;
                resetShotTimer();
                return;
            } else {
                cap.y = goalHeight + cap.radius;
                cap.vy *= -0.85;
                playSound('hit');
            }
        }
        if (cap.y + cap.radius >= height - goalHeight) {
            var goalLeft = (width - goalWidth) / 2;
            var goalRight = (width + goalWidth) / 2;
            if (cap.x > goalLeft && cap.x < goalRight) {
                if (gameMode === 'online') {
                    if (myTeamNumber === 2) { score.p2++; document.getElementById('score-p2').innerText = score.p2; }
                    else { score.p1++; document.getElementById('score-p1').innerText = score.p1; }
                } else { score.p2++; document.getElementById('score-p2').innerText = score.p2; }
                triggerGoalAnimation();
                
                if (gameMode === 'online' && isOnlineMatch && socket && currentRoomId) {
                    socket.emit('goal-scored', {
                        roomId: currentRoomId,
                        scoringTeam: 2
                    });
                }
                
                turn = 1;
                updateHUDTurn();
                cap.x = width / 2; cap.y = height / 2; cap.vx = 0; cap.vy = 0;
                resetShotTimer();
                return;
            } else {
                cap.y = height - goalHeight - cap.radius;
                cap.vy *= -0.85;
                playSound('hit');
            }
        }
        for (var i = 0; i < pins.length; i++) {
            var pin = pins[i];
            var dist = Math.hypot(cap.x - pin.x, cap.y - pin.y);
            var minDist = cap.radius + (pin.isPost ? 4 : 8);
            if (dist < minDist) {
                playSound('hit');
                var angle = Math.atan2(cap.y - pin.y, cap.x - pin.x);
                cap.x = pin.x + Math.cos(angle) * minDist;
                cap.y = pin.y + Math.sin(angle) * minDist;
                var hitSpeed = Math.hypot(cap.vx, cap.vy);
                cap.vx = Math.cos(angle) * Math.max(hitSpeed, 1.5) * 0.85;
                cap.vy = Math.sin(angle) * Math.max(hitSpeed, 1.5) * 0.85;
            }
        }
    }
    cap.vx *= cap.friction;
    cap.vy *= cap.friction;
    var isMoving = Math.hypot(cap.vx, cap.vy) > 0.15;
    if (isMoving) {
        cap.rotation += (Math.sign(cap.vx) * Math.abs(cap.vx) + Math.sign(cap.vy) * Math.abs(cap.vy)) * 0.05;
    } else if (gameMode === 'ai' && turn === 2) {
        runAIMove();
    }
}

// ============================================================
// PERİYODİK SENKRONİZASYON
// ============================================================
function startPeriodicSync() {
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(function() {
        if (gameMode === 'online' && currentPhase === 'playing' && socket && currentRoomId) {
            var speed = Math.hypot(cap.vx, cap.vy);
            if (speed < 0.5) {
                socket.emit('sync-ball-position', {
                    roomId: currentRoomId,
                    ballState: { x: cap.x, y: cap.y, vx: cap.vx, vy: cap.vy, turn: turn }
                });
            }
        }
    }, 1500);
}

// ============================================================
// ANİMASYON DÖNGÜSÜ
// ============================================================
function animate() {
    if (currentPhase === 'menu') return;
    updatePhysics();
    draw();
    requestAnimationFrame(animate);
}

// ============================================================
// OLAY DİNLEYİCİLERİ
// ============================================================
var dragStartPinPos = { x: 0, y: 0 };

canvas.addEventListener('mousedown', function(e) {
    if (gameMode === 'ai' && turn === 2) return;
    var pos = getCanvasTouchPos(e);
    if (currentPhase === 'setup') {
        for (var i = 0; i < pins.length; i++) {
            var p = pins[i];
            if (p.locked) continue;
            if (!p.isPost) {
                if (gameMode === 'online' && p.team !== editableTeam) continue;
                if (Math.hypot(pos.x - p.x, pos.y - p.y) < 22) {
                    selectedPin = p;
                    dragStartPinPos = { x: p.x, y: p.y };
                    break;
                }
            }
        }
    } else if (currentPhase === 'playing') {
        if (gameMode === 'online' && turn !== myTeamNumber) return;
        if (Math.hypot(cap.vx, cap.vy) > 0.2) return;
        if (Math.hypot(pos.x - cap.x, pos.y - cap.y) < 45) {
            isDraggingBall = true;
            dragStart = { x: cap.x, y: cap.y };
            dragCurrent = pos;
            var container = document.getElementById('power-bar-container');
            if (container) container.style.display = 'block';
        }
    }
});

canvas.addEventListener('mousemove', function(e) {
    if (gameMode === 'ai' && turn === 2) return;
    var pos = getCanvasTouchPos(e);
    if (currentPhase === 'setup' && selectedPin) {
        var margin = 15;
        var topMargin = goalHeight + 15;
        var bottomMargin = height - goalHeight - 15;
        var newX = Math.max(margin, Math.min(width - margin, pos.x));
        var newY = Math.max(topMargin, Math.min(bottomMargin, pos.y));
        var collision = false;
        for (var i = 0; i < pins.length; i++) {
            var p = pins[i];
            if (p !== selectedPin && !p.isPost && p.team === selectedPin.team) {
                if (Math.hypot(newX - p.x, newY - p.y) < minAllowedDistance) { collision = true; break; }
            }
        }
        if (!collision) { 
            selectedPin.x = newX; 
            selectedPin.y = newY;
            
            // ONLINE: Pin hareketini karşı tarafa gönder
            if (gameMode === 'online') {
                sendPinMove(selectedPin);
            }
        }
    } else if (currentPhase === 'playing' && isDraggingBall) {
        var dx = pos.x - dragStart.x;
        var dy = pos.y - dragStart.y;
        var dist = Math.hypot(dx, dy);
        if (dist > MAX_DRAG_DIST) { dx = (dx / dist) * MAX_DRAG_DIST; dy = (dy / dist) * MAX_DRAG_DIST; dist = MAX_DRAG_DIST; }
        dragCurrent = { x: dragStart.x + dx, y: dragStart.y + dy };
        var powerPercent = Math.min(100, (dist / MAX_DRAG_DIST) * 100);
        var powerBar = document.getElementById('power-bar');
        if (powerBar) {
            powerBar.style.width = powerPercent + '%';
            if (powerPercent < 33) powerBar.style.background = '#2ecc71';
            else if (powerPercent < 66) powerBar.style.background = '#f1c40f';
            else powerBar.style.background = '#e74c3c';
        }
    }
});

window.addEventListener('mouseup', function() {
    if (gameMode === 'ai' && turn === 2) return;
    if (currentPhase === 'setup' && selectedPin) {
        var valid = true;
        if (selectedPin.x < 15 || selectedPin.x > width - 15) valid = false;
        if (selectedPin.y < goalHeight + 15 || selectedPin.y > height - goalHeight - 15) valid = false;
        if (valid) {
            for (var i = 0; i < pins.length; i++) {
                var p = pins[i];
                if (p !== selectedPin && (p.isPost || p.team === selectedPin.team)) {
                    if (Math.hypot(selectedPin.x - p.x, selectedPin.y - p.y) < minAllowedDistance) { valid = false; break; }
                }
            }
        }
        if (!valid) { selectedPin.x = dragStartPinPos.x; selectedPin.y = dragStartPinPos.y; }
        
        // ONLINE: Pin hareketini karşı tarafa gönder
        if (gameMode === 'online') {
            sendPinMove(selectedPin);
        }
        selectedPin = null;
    }
    
    // Vuruş gönderme
    if (currentPhase === 'playing' && isDraggingBall && gameMode === 'online' && isOnlineMatch) {
        var startX = dragStart.x;
        var startY = dragStart.y;
        var endX = dragCurrent.x;
        var endY = dragCurrent.y;
        
        if (socket && currentRoomId) {
            socket.emit('player-shot', {
                roomId: currentRoomId,
                shotData: { startX: startX, startY: startY, endX: endX, endY: endY }
            });
        }
    }
    
    if (currentPhase === 'playing' && isDraggingBall) {
        isDraggingBall = false;
        playSound('kick');
        var startX = dragStart.x;
        var startY = dragStart.y;
        var endX = dragCurrent.x;
        var endY = dragCurrent.y;
        cap.vx = (startX - endX) * 0.13;
        cap.vy = (startY - endY) * 0.13;
        turn = turn === 1 ? 2 : 1;
        updateHUDTurn();
        resetShotTimer();
        if (gameMode === 'online' && socket) {
            socket.emit('player-shot', {
                roomId: currentRoomId,
                shotData: { startX: startX, startY: startY, endX: endX, endY: endY }
            });
        }
        var container = document.getElementById('power-bar-container');
        if (container) container.style.display = 'none';
        var powerBar = document.getElementById('power-bar');
        if (powerBar) powerBar.style.width = '0%';
    }
});

// Touch Events
canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    var touch = e.touches[0];
    if (touch) canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: touch.clientX, clientY: touch.clientY }));
}, { passive: false });

canvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    var touch = e.touches[0];
    if (touch) canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: touch.clientX, clientY: touch.clientY }));
}, { passive: false });

canvas.addEventListener('touchend', function(e) {
    e.preventDefault();
    var touch = e.changedTouches[0];
    if (touch) window.dispatchEvent(new MouseEvent('mouseup', { clientX: touch.clientX, clientY: touch.clientY }));
    else window.dispatchEvent(new MouseEvent('mouseup'));
}, { passive: false });

canvas.addEventListener('touchcancel', function(e) {
    e.preventDefault();
    window.dispatchEvent(new MouseEvent('mouseup'));
}, { passive: false });

// ============================================================
// MENÜ FONKSİYONLARI
// ============================================================
function openAILevelMenu() {
    document.getElementById('menu').style.display = 'none';
    document.getElementById('ai-level-menu').style.display = 'flex';
}

function closeAILevelMenu() {
    document.getElementById('ai-level-menu').style.display = 'none';
    document.getElementById('menu').style.display = 'block';
}

function selectColor(team, color) {
    alert('🎨 Artık takım logoları kullanılıyor. Forma rengi seçimine gerek yok!');
}

function selectFieldColor(color) {
    console.log('🟩 Saha rengi seçimi devre dışı - resim kullanılıyor');
}

// ============================================================
// TAKIM LOGO FONKSİYONLARI
// ============================================================
function toggleTeamSelect() {
    var container = document.getElementById('team-logo-container');
    if (!container) return;
    if (container.style.display === 'block') {
        container.style.display = 'none';
        console.log('🔽 Takım seçimi kapatıldı');
    } else {
        container.style.display = 'block';
        console.log('🔼 Takım seçimi açıldı');
        loadTeamLogos();
    }
}

function loadTeamLogos() {
    var container = document.getElementById('team-logo-options');
    if (!container) return;
    container.innerHTML = '';
    console.log('🏆 Logolar yükleniyor...');
    for (var i = 0; i < teamLogos.length; i++) {
        var logo = teamLogos[i];
        var btn = document.createElement('button');
        btn.className = 'team-logo-btn';
        btn.title = logo.name;
        if (logo.file === selectedTeamLogo) btn.classList.add('active');
        var img = document.createElement('img');
        img.src = 'takimlar/' + logo.file;
        img.alt = logo.name;
        img.onerror = function() { 
            console.warn('⚠️ Logo yüklenemedi:', this.src);
            this.src = 'takimlar/default.png'; 
        };
        btn.appendChild(img);
        btn.onclick = function(e) {
            e.stopPropagation();
            selectTeamLogo(logo.file);
        };
        container.appendChild(btn);
    }
    updateTeamLogoDisplay();
    updateSelectedTeamName();
    console.log('✅ ' + teamLogos.length + ' logo yüklendi');
}

function selectTeamLogo(logoFile) {
    console.log('🏆 Takım seçildi:', logoFile);
    selectedTeamLogo = logoFile;
    var btns = document.querySelectorAll('.team-logo-btn');
    for (var i = 0; i < btns.length; i++) {
        var btn = btns[i];
        btn.classList.remove('active');
        var img = btn.querySelector('img');
        if (img && img.src && img.src.indexOf(logoFile) !== -1) {
            btn.classList.add('active');
        }
    }
    updateTeamLogoDisplay();
    updateSelectedTeamName();
    updateScoreLogos();
    loadTeamLogoImage(logoFile);
    selectRandomAITeam();
}

function updateTeamLogoDisplay() {
    var displayImg = document.getElementById('selected-team-logo-display');
    if (displayImg) {
        if (selectedTeamLogo && selectedTeamLogo !== 'default.png') {
            displayImg.src = 'takimlar/' + selectedTeamLogo;
            displayImg.style.display = 'block';
            displayImg.style.opacity = '1';
        } else {
            displayImg.src = 'takimlar/default.png';
            displayImg.style.display = 'block';
            displayImg.style.opacity = '0.3';
        }
        displayImg.onerror = function() {
            this.src = 'takimlar/default.png';
            this.style.opacity = '0.3';
        };
        console.log('🔄 Takım logosu güncellendi:', selectedTeamLogo || 'default');
    }
}

function updateSelectedTeamName() {
    var logo = null;
    for (var i = 0; i < teamLogos.length; i++) {
        if (teamLogos[i].file === selectedTeamLogo) {
            logo = teamLogos[i];
            break;
        }
    }
    var teamName = logo ? logo.name.replace('⚽ ', '') : 'Varsayılan';
    var displayName = document.getElementById('selected-team-name-display');
    if (displayName) displayName.textContent = teamName;
}

// ============================================================
// SKORBORD LOGO GÜNCELLEME
// ============================================================
function updateScoreLogos() {
    console.log('🔄 Skor logoları güncelleniyor...');
    console.log('📊 myTeamNumber:', myTeamNumber);
    console.log('📊 selectedTeamLogo:', selectedTeamLogo);
    console.log('📊 aiTeamLogo:', aiTeamLogo);
    
    var logoP1 = document.getElementById('score-logo-p1');
    if (logoP1) {
        if (gameMode === 'online') {
            // ONLINE: Takım 1 logosu
            if (myTeamNumber === 1) {
                // Ben Takım 1 ise kendi logomu göster
                logoP1.src = 'takimlar/' + (selectedTeamLogo || 'default.png');
            } else {
                // Ben Takım 2 ise rakip logomu göster
                logoP1.src = 'takimlar/' + (aiTeamLogo || 'default.png');
            }
        } else if (gameMode === 'local' && localPlayer1Logo) {
            logoP1.src = 'takimlar/' + localPlayer1Logo;
        } else {
            logoP1.src = 'takimlar/' + (selectedTeamLogo || 'default.png');
        }
        logoP1.onerror = function() { 
            console.warn('⚠️ Logo yüklenemedi:', this.src);
            this.src = 'takimlar/default.png'; 
        };
    }
    
    var logoP2 = document.getElementById('score-logo-p2');
    if (logoP2) {
        if (gameMode === 'online') {
            // ONLINE: Takım 2 logosu
            if (myTeamNumber === 2) {
                // Ben Takım 2 ise kendi logomu göster
                logoP2.src = 'takimlar/' + (selectedTeamLogo || 'default.png');
            } else {
                // Ben Takım 1 ise rakip logomu göster
                logoP2.src = 'takimlar/' + (aiTeamLogo || 'default.png');
            }
        } else if (gameMode === 'local' && localPlayer2Logo) {
            logoP2.src = 'takimlar/' + localPlayer2Logo;
        } else if (gameMode === 'ai') {
            logoP2.src = 'takimlar/' + (aiTeamLogo || 'default.png');
        } else {
            logoP2.src = 'takimlar/default.png';
        }
        logoP2.onerror = function() { 
            console.warn('⚠️ Logo yüklenemedi:', this.src);
            this.src = 'takimlar/default.png'; 
        };
    }
}

function loadTeamLogoImage(logoFile) {
    return new Promise(function(resolve) {
        if (loadedLogos[logoFile]) {
            resolve(loadedLogos[logoFile]);
            return;
        }
        var img = new Image();
        img.onload = function() {
            loadedLogos[logoFile] = img;
            resolve(img);
        };
        img.onerror = function() {
            if (logoFile !== 'default.png') {
                loadTeamLogoImage('default.png').then(resolve);
            } else {
                resolve(null);
            }
        };
        img.src = 'takimlar/' + logoFile;
    });
}

// ============================================================
// 2 KİŞİLİK AYNI EKRAN - TAKIM SEÇ
// ============================================================

function openLocalTeamSelect() {
    console.log('👥 2 Kişilik takım seç açılıyor...');
    var popup = document.getElementById('local-team-select');
    if (!popup) {
        console.error('❌ local-team-select pop-up bulunamadı!');
        return;
    }
    
    popup.style.display = 'flex';
    popup.style.visibility = 'visible';
    popup.style.opacity = '1';
    
    localP1Selected = false;
    localP2Selected = false;
    localPlayer1Logo = '';
    localPlayer2Logo = '';
    
    var p1Name = document.getElementById('local-p1-name');
    var p2Name = document.getElementById('local-p2-name');
    if (p1Name) { 
        p1Name.textContent = '👤 Oyuncu 1';
        p1Name.style.color = '#3498db';
        p1Name.style.opacity = '1';
    }
    if (p2Name) { 
        p2Name.textContent = '👤 Oyuncu 2';
        p2Name.style.color = '#e74c3c';
        p2Name.style.opacity = '1';
    }
    
    var shield1 = document.getElementById('local-p1-shield-img');
    var shield2 = document.getElementById('local-p2-shield-img');
    if (shield1) { shield1.style.display = 'none'; shield1.src = ''; }
    if (shield2) { shield2.style.display = 'none'; shield2.src = ''; }
    
    loadLocalTeamLogos();
}

function closeLocalTeamSelect() {
    console.log('👥 2 Kişilik takım seç kapatılıyor...');
    var popup = document.getElementById('local-team-select');
    if (popup) {
        popup.style.display = 'none';
        popup.style.visibility = 'hidden';
        popup.style.opacity = '0';
    }
}

function loadLocalTeamLogos() {
    var container1 = document.getElementById('local-player1-logos');
    var container2 = document.getElementById('local-player2-logos');
    
    console.log('🔄 Logolar yükleniyor... Container1:', !!container1, 'Container2:', !!container2);
    
    if (!container1 || !container2) {
        console.warn('⚠️ Logo containerları bulunamadı!');
        return;
    }
    
    container1.innerHTML = '';
    container2.innerHTML = '';
    
    for (var i = 0; i < teamLogos.length; i++) {
        var logo = teamLogos[i];
        
        // Oyuncu 1
        var btn1 = document.createElement('button');
        btn1.className = 'team-logo-btn';
        btn1.title = logo.name;
        btn1.dataset.logo = logo.file;
        
        var img1 = document.createElement('img');
        img1.src = 'takimlar/' + logo.file;
        img1.alt = logo.name;
        img1.onerror = function() { 
            console.warn('⚠️ Logo yüklenemedi:', this.src);
            this.src = 'takimlar/default.png'; 
        };
        btn1.appendChild(img1);
        
        btn1.onclick = function(e) {
            e.stopPropagation();
            selectLocalTeam(1, logo.file);
        };
        container1.appendChild(btn1);
        
        // Oyuncu 2
        var btn2 = document.createElement('button');
        btn2.className = 'team-logo-btn';
        btn2.title = logo.name;
        btn2.dataset.logo = logo.file;
        
        var img2 = document.createElement('img');
        img2.src = 'takimlar/' + logo.file;
        img2.alt = logo.name;
        img2.onerror = function() { 
            console.warn('⚠️ Logo yüklenemedi:', this.src);
            this.src = 'takimlar/default.png'; 
        };
        btn2.appendChild(img2);
        
        btn2.onclick = function(e) {
            e.stopPropagation();
            selectLocalTeam(2, logo.file);
        };
        container2.appendChild(btn2);
    }
    
    console.log('✅ ' + teamLogos.length + ' logo yüklendi (Oyuncu 1: ' + container1.children.length + ', Oyuncu 2: ' + container2.children.length + ')');
}

function selectLocalTeam(player, logoFile) {
    console.log('👤 Oyuncu ' + player + ' takım seçti:', logoFile);
    
    if (player === 1) {
        if (logoFile === localPlayer2Logo && localP2Selected) {
            alert('⚠️ Oyuncu 2 zaten bu takımı seçti! Farklı bir takım seçin.');
            return;
        }
        
        localPlayer1Logo = logoFile;
        localP1Selected = true;
        
        var btns1 = document.querySelectorAll('#local-player1-logos .team-logo-btn');
        for (var i = 0; i < btns1.length; i++) {
            var btn = btns1[i];
            btn.classList.remove('active', 'active-p1');
            if (btn.dataset.logo === logoFile) {
                btn.classList.add('active', 'active-p1');
            }
        }
        
        var shield = document.getElementById('local-p1-shield-img');
        if (shield) {
            shield.src = 'takimlar/' + logoFile;
            shield.style.display = 'block';
            shield.onerror = function() { this.src = 'takimlar/default.png'; };
        }
        
        var nameEl = document.getElementById('local-p1-name');
        if (nameEl) {
            var logo = null;
            for (var j = 0; j < teamLogos.length; j++) {
                if (teamLogos[j].file === logoFile) {
                    logo = teamLogos[j];
                    break;
                }
            }
            nameEl.textContent = logo ? '👤 ' + logo.name.replace('⚽ ', '') : '👤 Seçildi';
            nameEl.style.color = '#3498db';
            nameEl.style.opacity = '1';
        }
        
    } else if (player === 2) {
        if (logoFile === localPlayer1Logo && localP1Selected) {
            alert('⚠️ Oyuncu 1 zaten bu takımı seçti! Farklı bir takım seçin.');
            return;
        }
        
        localPlayer2Logo = logoFile;
        localP2Selected = true;
        
        var btns2 = document.querySelectorAll('#local-player2-logos .team-logo-btn');
        for (var i = 0; i < btns2.length; i++) {
            var btn = btns2[i];
            btn.classList.remove('active', 'active-p2');
            if (btn.dataset.logo === logoFile) {
                btn.classList.add('active', 'active-p2');
            }
        }
        
        var shield = document.getElementById('local-p2-shield-img');
        if (shield) {
            shield.src = 'takimlar/' + logoFile;
            shield.style.display = 'block';
            shield.onerror = function() { this.src = 'takimlar/default.png'; };
        }
        
        var nameEl = document.getElementById('local-p2-name');
        if (nameEl) {
            var logo = null;
            for (var j = 0; j < teamLogos.length; j++) {
                if (teamLogos[j].file === logoFile) {
                    logo = teamLogos[j];
                    break;
                }
            }
            nameEl.textContent = logo ? '👤 ' + logo.name.replace('⚽ ', '') : '👤 Seçildi';
            nameEl.style.color = '#e74c3c';
            nameEl.style.opacity = '1';
        }
    }
    
    console.log('📊 Seçim durumu: P1=' + (localP1Selected ? localPlayer1Logo : '❌') + ', P2=' + (localP2Selected ? localPlayer2Logo : '❌'));
}

function startLocalGameWithTeams() {
    console.log('🚀 2 Kişilik maç başlatılıyor...');
    
    if (!MATCH_DURATION) MATCH_DURATION = 90;
    if (!SHOT_DURATION) SHOT_DURATION = 5;
    
    if (!localP1Selected || !localP2Selected) {
        alert('⚠️ Lütfen her iki oyuncu için de takım seçin!');
        return;
    }
    
    if (localPlayer1Logo === localPlayer2Logo) {
        alert('⚠️ İki oyuncu aynı takımı seçemez!');
        return;
    }
    
    closeLocalTeamSelect();
    
    selectedTeamLogo = localPlayer1Logo;
    aiTeamLogo = localPlayer2Logo;
    
    loadTeamLogoImage(selectedTeamLogo);
    loadTeamLogoImage(aiTeamLogo);
    
    gameMode = 'local';
    document.getElementById('menu').style.display = 'none';
    document.getElementById('top-bar').style.display = 'flex';
    matchSecondsLeft = MATCH_DURATION;
    var timeBoard = document.getElementById('time-board');
    if (timeBoard) timeBoard.innerText = matchSecondsLeft + 's';
    
    showField();
    
    setTimeout(function() {
        updateScoreLogos();
    }, 100);
    
    turn = 1;
    updateHUDTurn();
    
    startSetupPhase();
}

function selectDifficulty(level) {
    console.log('🎯 Zorluk seçildi:', level);
    
    var menu = document.getElementById('ai-level-menu');
    if (menu) {
        menu.style.display = 'none';
    }
    
    var mainMenu = document.getElementById('menu');
    if (mainMenu) {
        mainMenu.style.display = 'block';
    }
    
    startLocalGame('ai', level);
}

// ============================================================
// AYARLAR POP-UP AÇ/KAPA
// ============================================================
function openSettingsPopup() {
    console.log('⚙️ Ayarlar menüsü açılıyor...');
    var popup = document.getElementById('settings-popup');
    if (popup) {
        popup.style.display = 'flex';
        popup.style.visibility = 'visible';
        popup.style.opacity = '1';
        console.log('✅ Ayarlar pop-up gösteriliyor');
    } else {
        console.error('❌ settings-popup bulunamadı!');
    }
}

function closeSettingsPopup() {
    console.log('⚙️ Ayarlar menüsü kapatılıyor...');
    var popup = document.getElementById('settings-popup');
    if (popup) {
        popup.style.display = 'none';
        popup.style.visibility = 'hidden';
        popup.style.opacity = '0';
        console.log('✅ Ayarlar pop-up kapatıldı');
    }
}

function toggleMatchDurationOptions() {
    var options = document.getElementById('match-duration-options');
    var shotOptions = document.getElementById('shot-duration-options');
    var stadiumOptions = document.getElementById('stadium-options');
    if (shotOptions) {
        shotOptions.style.display = 'none';
        shotOptions.classList.remove('show');
    }
    if (stadiumOptions) {
        stadiumOptions.style.display = 'none';
        stadiumOptions.classList.remove('show');
    }
    if (options) {
        if (options.style.display === 'none' || options.style.display === '') {
            options.style.display = 'flex';
            options.classList.add('show');
            console.log('📋 Maç süresi seçenekleri açıldı');
        } else {
            options.style.display = 'none';
            options.classList.remove('show');
            console.log('📋 Maç süresi seçenekleri kapatıldı');
        }
    }
}

function setMatchDuration(seconds) {
    console.log('⏱️ Maç süresi seçildi:', seconds, 'saniye');
    var display = document.getElementById('match-duration-display');
    if (display) {
        display.textContent = seconds + 'sn';
    }
    var btns = document.querySelectorAll('.settings-option[data-duration]');
    for (var i = 0; i < btns.length; i++) {
        var btn = btns[i];
        btn.classList.remove('active');
        if (parseInt(btn.dataset.duration) === seconds) {
            btn.classList.add('active');
        }
    }
    MATCH_DURATION = seconds;
    if (currentPhase === 'playing' || currentPhase === 'setup') {
        matchSecondsLeft = seconds;
        var timeBoard = document.getElementById('time-board');
        if (timeBoard) {
            timeBoard.innerText = seconds + 's';
        }
    }
    var options = document.getElementById('match-duration-options');
    if (options) {
        options.style.display = 'none';
        options.classList.remove('show');
    }
    console.log('✅ Maç süresi güncellendi:', seconds, 'sn');
}

function toggleShotDurationOptions() {
    var optionsDiv = document.getElementById('shot-duration-options');
    var matchOptions = document.getElementById('match-duration-options');
    var stadiumOptions = document.getElementById('stadium-options');
    if (matchOptions) {
        matchOptions.style.display = 'none';
        matchOptions.classList.remove('show');
    }
    if (stadiumOptions) {
        stadiumOptions.style.display = 'none';
        stadiumOptions.classList.remove('show');
    }
    if (!optionsDiv) return;
    if (optionsDiv.style.display === 'none' || optionsDiv.style.display === '') {
        optionsDiv.style.display = 'flex';
        optionsDiv.classList.add('show');
        console.log('📋 Vuruş süresi seçenekleri açıldı');
    } else {
        optionsDiv.style.display = 'none';
        optionsDiv.classList.remove('show');
        console.log('📋 Vuruş süresi seçenekleri kapatıldı');
    }
}

function setShotDuration(seconds) {
    console.log('🎯 Vuruş süresi seçildi:', seconds, 'saniye');
    var display = document.getElementById('shot-duration-display');
    if (display) {
        display.textContent = seconds + 'sn';
    }
    var btns = document.querySelectorAll('.settings-option[data-shot-duration]');
    for (var i = 0; i < btns.length; i++) {
        var btn = btns[i];
        btn.classList.remove('active');
        if (parseInt(btn.dataset.shotDuration) === seconds) {
            btn.classList.add('active');
        }
    }
    SHOT_DURATION = seconds;
    if (currentPhase === 'playing') {
        var shotTimer = document.getElementById('shot-timer');
        if (shotTimer) {
            shotTimer.innerText = 'ŞUT: ' + seconds + 's';
        }
        if (shotTimerInterval) {
            clearInterval(shotTimerInterval);
            resetShotTimer();
        }
    }
    var options = document.getElementById('shot-duration-options');
    if (options) {
        options.style.display = 'none';
        options.classList.remove('show');
    }
    console.log('✅ Vuruş süresi güncellendi:', seconds, 'sn');
}

function toggleStadiumOptions() {
    var optionsDiv = document.getElementById('stadium-options');
    var matchOptions = document.getElementById('match-duration-options');
    var shotOptions = document.getElementById('shot-duration-options');
    if (matchOptions) {
        matchOptions.style.display = 'none';
        matchOptions.classList.remove('show');
    }
    if (shotOptions) {
        shotOptions.style.display = 'none';
        shotOptions.classList.remove('show');
    }
    if (!optionsDiv) return;
    if (optionsDiv.style.display === 'none' || optionsDiv.style.display === '') {
        optionsDiv.style.display = 'flex';
        optionsDiv.classList.add('show');
        console.log('📋 Stadyum seçenekleri açıldı');
    } else {
        optionsDiv.style.display = 'none';
        optionsDiv.classList.remove('show');
        console.log('📋 Stadyum seçenekleri kapatıldı');
    }
}

function selectStadium(stadiumKey, texturePath) {
    console.log('🏟️ Stadyum seçildi:', stadiumKey);
    var previewImg = document.getElementById('selected-stadium-preview');
    if (previewImg) {
        previewImg.src = 'menu/ayarlar/stat/' + stadiumKey + '.webp';
    }
    var cards = document.querySelectorAll('.stadium-option-card');
    for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var img = card.querySelector('img');
        if (img && img.src && img.src.indexOf(stadiumKey + '.webp') !== -1) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    }
    currentStadiumTexture = texturePath;
    loadFieldImage(texturePath);
    if (currentPhase !== 'menu') {
        showField();
    }
    var optionsDiv = document.getElementById('stadium-options');
    if (optionsDiv) {
        optionsDiv.style.display = 'none';
        optionsDiv.classList.remove('show');
    }
    console.log('✅ Stadyum güncellendi:', texturePath);
}

// ============================================================
// SOCKET OLAY DİNLEYİCİLERİ (Eski sistem için)
// ============================================================
function getPlayerData() {
    var name = document.getElementById('player-name').value.trim() || 'Oyuncu_' + Math.floor(Math.random() * 100);
    return {
        name: name,
        logo: selectedTeamLogo || 'default.png'
    };
}

function setupSocketListeners() {
    // Artık initSocket içinde tanımlandı
}

// ============================================================
// SES AÇ/KAPA FONKSİYONLARI
// ============================================================
// isSoundOn zaten tanımlı, tekrar tanımlama
if (typeof isSoundOn === 'undefined') {
    var isSoundOn = true;
}

function toggleSound() {
    console.log('🔊 Ses butonuna tıklandı! Mevcut durum:', isSoundOn ? 'AÇIK' : 'KAPALI');
    isSoundOn = !isSoundOn;
    var soundBtn = document.getElementById('sound-toggle-btn');
    if (soundBtn) {
        if (isSoundOn) {
            soundBtn.src = 'menu/ayarlar/ses.webp';
            console.log('🔊 Ses AÇIK');
            setTimeout(function() { playButtonSound(); }, 100);
        } else {
            soundBtn.src = 'menu/ayarlar/ses-off.webp';
            console.log('🔇 Ses KAPALI');
        }
    }
    localStorage.setItem('soundEnabled', isSoundOn ? 'true' : 'false');
}

function loadSoundSettings() {
    var savedSound = localStorage.getItem('soundEnabled');
    if (savedSound !== null) {
        isSoundOn = savedSound === 'true';
        var soundBtn = document.getElementById('sound-toggle-btn');
        if (soundBtn) {
            soundBtn.src = isSoundOn ? 'menu/ayarlar/ses.webp' : 'menu/ayarlar/ses-off.webp';
        }
        console.log('🔊 Ses durumu yüklendi:', isSoundOn ? 'AÇIK' : 'KAPALI');
    }
}

// ============================================================
// MP3 SES DOSYALARI
// ============================================================
var audioElements = {
    hit: null,
    goal: null
};

function preloadSounds() {
    audioElements.hit = new Audio('sesler/Carpma.mp3');
    audioElements.hit.preload = 'auto';
    audioElements.hit.load();
    audioElements.goal = new Audio('sesler/gol.mp3');
    audioElements.goal.preload = 'auto';
    audioElements.goal.load();
}

document.addEventListener('DOMContentLoaded', function() {
    preloadSounds();
});

function playSound(type) {
    if (!isSoundOn) return;
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    if (type === 'hit') {
        try {
            if (audioElements.hit) {
                audioElements.hit.currentTime = 0;
                audioElements.hit.play().catch(function(e) {
                    console.log('Hit ses hatası:', e);
                });
            }
        } catch (e) {
            console.log('Hit ses hatası:', e);
        }
        return;
    }
    if (type === 'goal') {
        try {
            var goalSound = new Audio('sesler/gol.mp3');
            goalSound.preload = 'auto';
            goalSound.volume = 1.0;
            var playPromise = goalSound.play();
            if (playPromise !== undefined) {
                playPromise.catch(function(e) {
                    console.log('Goal ses hatası:', e);
                });
            }
        } catch (error) {
            try {
                var osc = audioCtx.createOscillator();
                var gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                var now = audioCtx.currentTime;
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.linearRampToValueAtTime(600, now + 0.4);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.45);
                osc.start(now);
                osc.stop(now + 0.45);
            } catch (e) {}
        }
        return;
    }
    if (type === 'kick') {
        try {
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            var now = audioCtx.currentTime;
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        } catch (error) {
            console.error('❌ Vuruş sesi hatası:', error);
        }
    }
}

function playButtonSound() {
    if (!isSoundOn) return;
    try {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        var now = audioCtx.currentTime;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.05);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
    } catch(e) {
        console.log('Buton ses hatası:', e);
    }
}

// ============================================================
// 2 KİŞİLİK MOD - SÜRE AYARLARI
// ============================================================
function setLocalMatchDuration(seconds) {
    console.log('⏱️ 2 Kişilik Maç Süresi Seçildi:', seconds, 'sn');
    MATCH_DURATION = seconds;
    var btns = document.querySelectorAll('.local-time-btn[data-time]');
    for (var i = 0; i < btns.length; i++) {
        var btn = btns[i];
        btn.classList.remove('active');
        if (parseInt(btn.dataset.time) === seconds) {
            btn.classList.add('active');
        }
    }
    if (currentPhase === 'playing' || currentPhase === 'setup') {
        matchSecondsLeft = seconds;
        var timeBoard = document.getElementById('time-board');
        if (timeBoard) {
            timeBoard.innerText = seconds + 's';
        }
    }
}

function setLocalShotDuration(seconds) {
    console.log('🎯 2 Kişilik Vuruş Süresi Seçildi:', seconds, 'sn');
    SHOT_DURATION = seconds;
    var btns = document.querySelectorAll('.local-time-btn[data-shot]');
    for (var i = 0; i < btns.length; i++) {
        var btn = btns[i];
        btn.classList.remove('active');
        if (parseInt(btn.dataset.shot) === seconds) {
            btn.classList.add('active');
        }
    }
    if (currentPhase === 'playing') {
        var shotTimer = document.getElementById('shot-timer');
        if (shotTimer) {
            shotTimer.innerText = 'ŞUT: ' + seconds + 's';
        }
        if (shotTimerInterval) {
            clearInterval(shotTimerInterval);
            resetShotTimer();
        }
    }
}

// ============================================================
// OYUNCU DATA YÖNETİMİ
// ============================================================
var playerProfile = {
    username: 'Oyuncu_' + Math.floor(Math.random() * 1000),
    selectedTeamLogo: 'default.png',
    stats: {
        totalMatches: 0,
        wins: 0,
        losses: 0,
        draws: 0
    }
};

function loadPlayerData() {
    var savedData = localStorage.getItem('fingerSoccerPlayerData');
    if (savedData) {
        try {
            playerProfile = JSON.parse(savedData);
        } catch (e) {
            console.error('Veri okuma hatası:', e);
        }
    }
    syncDataToUI();
}

function savePlayerData() {
    localStorage.setItem('fingerSoccerPlayerData', JSON.stringify(playerProfile));
}

function syncDataToUI() {
    var modalName = document.getElementById('profile-username');
    if (modalName) modalName.value = playerProfile.username;
    var totalMatchesEl = document.getElementById('stat-total-matches');
    if (totalMatchesEl) totalMatchesEl.innerText = playerProfile.stats.totalMatches;
    var winsEl = document.getElementById('stat-wins');
    if (winsEl) winsEl.innerText = playerProfile.stats.wins;
    var lossesEl = document.getElementById('stat-losses');
    if (lossesEl) lossesEl.innerText = playerProfile.stats.losses;
}

function openProfileModal() {
    syncDataToUI();
    var modal = document.getElementById('player-profile-modal');
    if (modal) modal.style.display = 'flex';
}

function closeProfileModal() {
    var modal = document.getElementById('player-profile-modal');
    if (modal) modal.style.display = 'none';
}

function savePlayerProfile() {
    var newName = document.getElementById('profile-username').value.trim();
    if (newName) {
        playerProfile.username = newName;
        savePlayerData();
        syncDataToUI();
        closeProfileModal();
        alert('✅ Profil başarıyla güncellendi!');
    } else {
        alert('⚠️ Lütfen geçerli bir kullanıcı adı girin!');
    }
}

function resetPlayerData() {
    if (confirm('⚠️ Tüm istatistikleriniz sıfırlanacak! Emin misiniz?')) {
        playerProfile.stats = { totalMatches: 0, wins: 0, losses: 0, draws: 0 };
        savePlayerData();
        syncDataToUI();
        alert('🧹 Veriler sıfırlandı.');
    }
}

function recordMatchResult(isWin, isDraw) {
    playerProfile.stats.totalMatches++;
    if (isDraw) {
        playerProfile.stats.draws++;
    } else if (isWin) {
        playerProfile.stats.wins++;
    } else {
        playerProfile.stats.losses++;
    }
    savePlayerData();
}

// ============================================================
// EKSİK MENÜ VE POP-UP FONKSİYONLARI
// ============================================================

// TAKIM SEÇİM POP-UP
function openTeamSelectPopup() {
    console.log('🏆 Takım seçim pop-up açılıyor...');
    var popup = document.getElementById('team-select-popup');
    var grid = document.getElementById('team-select-grid');
    var shieldImg = document.getElementById('popup-selected-team-img');
    
    if (!popup || !grid) { console.error('Pop-up veya Grid bulunamadı!'); return; }

    popup.style.display = 'block';
    popup.style.visibility = 'visible';
    popup.style.opacity = '1';

    if (shieldImg) {
        if (selectedTeamLogo && selectedTeamLogo !== 'default.png') {
            shieldImg.src = 'takimlar/' + selectedTeamLogo;
            shieldImg.style.display = 'block';
        } else {
            var defaultTeam = teamLogos[0];
            if (defaultTeam) {
                selectedTeamLogo = defaultTeam.file;
                shieldImg.src = 'takimlar/' + defaultTeam.file;
                shieldImg.style.display = 'block';
            }
        }
    }

    grid.innerHTML = '';
    for (var i = 0; i < teamLogos.length; i++) {
        var team = teamLogos[i];
        var btn = document.createElement('div');
        btn.className = 'big-team-logo-btn';
        if (selectedTeamLogo === team.file) btn.classList.add('active');
        
        var img = document.createElement('img');
        img.src = 'takimlar/' + team.file;
        img.alt = team.name;
        img.onerror = function() { this.src = 'takimlar/default.png'; };
        btn.appendChild(img);
        
        btn.onclick = function(e) {
            e.stopPropagation();
            var btns = document.querySelectorAll('.big-team-logo-btn');
            for (var j = 0; j < btns.length; j++) {
                btns[j].classList.remove('active');
            }
            btn.classList.add('active');
            
            selectedTeamLogo = team.file;
            console.log('🏆 Takım seçildi:', team.file);
            
            if (shieldImg) {
                shieldImg.src = 'takimlar/' + team.file;
                shieldImg.style.display = 'block';
            }
            var menuOverlay = document.getElementById('selected-team-logo-display');
            if (menuOverlay) {
                menuOverlay.src = 'takimlar/' + team.file;
                menuOverlay.style.display = 'block';
                menuOverlay.style.opacity = '1';
            }
            loadTeamLogoImage(team.file);
            selectRandomAITeam();
            updateScoreLogos();
        };
        grid.appendChild(btn);
    }
}

function closeTeamSelectPopup() {
    console.log('🏆 Takım seçim pop-up kapatılıyor...');
    var popup = document.getElementById('team-select-popup');
    if (popup) {
        popup.style.display = 'none';
        popup.style.visibility = 'hidden';
        popup.style.opacity = '0';
    }
    updateTeamLogoDisplay();
    updateSelectedTeamName();
}

// ============================================================
// BAŞLANGIÇ
// ============================================================
drawFieldLinesOnly();
console.log('🎮 Çivili Futbol Başlatıldı!');
console.log('⏱️ Maç Süresi: ' + MATCH_DURATION + ' saniye');
console.log('🎯 Vuruş Süresi: ' + SHOT_DURATION + ' saniye');
startPeriodicSync();

document.addEventListener('DOMContentLoaded', function() {
    initSocket();
    selectRandomTeam();
    updateSelectedTeamName();
    updateTeamLogoDisplay();
    updateScoreLogos();
    loadTeamLogoImage(selectedTeamLogo);
    selectRandomAITeam();
    console.log('✅ Sayfa yüklendi!');
});
// ==========================================
// ONLINE GOL DİNLENMESİ (game.js - En Alt Kısım)
// ==========================================
socket.on('on-goal-scored', function(goalData) {
    console.log('⚽ GOL DETAYLARI ALINDI:', goalData);
    
    // Her iki ekranda skorları eşitle
    score1 = goalData.scoreTeam1;
    score2 = goalData.scoreTeam2;
    
    // Ekrana skoru bas ve animasyonları çalıştır
    if (typeof updateScoreboardUI === 'function') updateScoreboardUI();
    if (typeof triggerGoalAnimation === 'function') triggerGoalAnimation();
    
    // Topu sıfırla (Santra yap)
    if (typeof resetBallAndPositions === 'function') resetBallAndPositions();
});
