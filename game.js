// ============================================================
// SABİT SÜRELER
// ============================================================
let MATCH_DURATION = 90;
let SHOT_DURATION = 5;

// ============================================================
// SOCKET BAĞLANTISI - iOS Safari Uyumlu
// ============================================================

// iOS Safari tespiti
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
console.log('📱 Platform:', isIOS ? 'iOS Safari' : 'Diğer');

if (typeof io !== 'undefined') {
    try {
        const serverUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? undefined
            : window.location.origin;

        const socketOptions = {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000,
            autoConnect: true,
            forceNew: true,
            upgrade: true,
            rememberUpgrade: true
        };

        if (isIOS) {
            socketOptions.transports = ['websocket', 'polling'];
            socketOptions.forceNew = true;
            console.log('📱 iOS Safari modu aktif');
        }

        socket = io(serverUrl, socketOptions);

        socket.on('connect', () => {
            console.log('✅ Sunucuya bağlandı! ID:', socket.id);
            console.log('📱 Platform:', isIOS ? 'iOS Safari' : 'Diğer');
            
            if (isIOS) {
                setInterval(() => {
                    if (socket && socket.connected) {
                        socket.emit('ping');
                    }
                }, 15000);
            }
        });
        
        socket.on('connect_error', (error) => {
            console.warn('⚠️ Bağlantı hatası:', error.message);
            if (isIOS) {
                console.log('📱 iOS Safari bağlantı hatası, yeniden deneniyor...');
                setTimeout(() => {
                    if (socket) socket.connect();
                }, 2000);
            }
        });
        
        socket.on('disconnect', (reason) => {
            console.warn('⚠️ Bağlantı kesildi:', reason);
            if (isIOS && reason === 'io client disconnect') {
                console.log('📱 iOS Safari bağlantısı kesildi, yeniden bağlanılıyor...');
                setTimeout(() => {
                    if (socket) socket.connect();
                }, 1000);
            }
        });

        socket.on('pong', () => {
            console.log('💓 Heartbeat alındı (iOS Safari)');
        });

        // ============================================================
        // LOBBY OLAYLARI
        // ============================================================
        
        socket.on('update-lobby-players', (players) => {
            console.log('🔄 Lobby güncellendi:', players.length, 'oyuncu');
            onlinePlayers = players;
            updateLobbyUI();
        });

        // ============================================================
        // ODA OLAYLARI
        // ============================================================
        
        socket.on('start-online-match', (data) => {
            console.log('🎮 MAÇ BAŞLANGIÇ:', data);
            currentRoomId = data.roomId;
            myTeamNumber = data.team;
            opponentLogoData = data.opponentLogo || 'default.png';
            aiTeamLogo = opponentLogoData;
            isOnlineMatch = true;
            
            console.log('📊 Benim takımım:', myTeamNumber);
            console.log('📊 Rakip logosu:', opponentLogoData);
            
            if (opponentLogoData) {
                loadTeamLogoImage(opponentLogoData);
            }
            
            document.getElementById('online-lobby').style.display = 'none';
            document.getElementById('top-bar').style.display = 'flex';
            matchSecondsLeft = MATCH_DURATION;
            const timeBoard = document.getElementById('time-board');
            if (timeBoard) timeBoard.innerText = matchSecondsLeft + 's';
            
            setTimeout(() => {
                updateScoreLogos();
            }, 100);
            
            startSetupPhase();
        });

        socket.on('lockstep-shots', ({ shot1, shot2, timestamp, timeout }) => {
            if (gameMode !== 'online' || currentPhase !== 'playing') return;
            
            console.log('🎯 Lockstep vuruşlar alındı!');
            
            let opponentShot = null;
            
            if (shot1 && shot1.player !== myTeamNumber) {
                opponentShot = shot1;
            } else if (shot2 && shot2.player !== myTeamNumber) {
                opponentShot = shot2;
            }
            
            if (opponentShot) {
                const startX = opponentShot.startX || 0;
                const startY = opponentShot.startY || 0;
                const endX = opponentShot.endX || 0;
                const endY = opponentShot.endY || 0;
                
                const opponentForceX = (startX - endX) * 0.06;
                const opponentForceY = (startY - endY) * 0.06;
                
                cap.vx = cap.vx * 0.6 + opponentForceX * 0.1;
                cap.vy = cap.vy * 0.6 + opponentForceY * 0.1;
                
                playSound('kick');
                console.log('📥 Rakip vuruşu uygulandı (yumuşak)');
            }
            
            turn = myTeamNumber === 1 ? 2 : 1;
            updateHUDTurn();
            resetShotTimer();
        });

        socket.on('opponent-disconnected', () => {
            alert("⚠️ Rakip oyundan ayrıldı!");
            exitToMenu();
        });

        socket.on('opponentShot', (shotData) => {
            if (gameMode === 'online' && currentPhase === 'playing') {
                cap.vx = (shotData.startX - shotData.endX) * 0.13;
                cap.vy = (shotData.startY - shotData.endY) * 0.13;
                playSound('kick');
                turn = myTeamNumber;
                updateHUDTurn();
                resetShotTimer();
            }
        });

        socket.on('sync-setup-pin-move', ({ team, index, x, y }) => {
            if (currentPhase === 'setup') {
                let count = 0;
                for (let p of pins) {
                    if (!p.isPost && p.team === team) {
                        if (count === index) { p.x = x; p.y = y; break; }
                        count++;
                    }
                }
            }
        });

        socket.on('match-go', ({ pins: finalPins }) => {
            if (setupTimerInterval) clearInterval(setupTimerInterval);
            pins = [
                { x: (width - goalWidth) / 2, y: goalHeight, isPost: true, locked: true },
                { x: (width + goalWidth) / 2, y: goalHeight, isPost: true, locked: true },
                { x: (width - goalWidth) / 2, y: height - goalHeight, isPost: true, locked: true },
                { x: (width + goalWidth) / 2, y: height - goalHeight, isPost: true, locked: true }
            ];
            finalPins.forEach((p, index) => {
                let assignedTeam = p.team || (index < 11 ? 1 : 2);
                pins.push({ x: p.x, y: p.y, team: assignedTeam, locked: true });
            });
            currentPhase = 'playing';
            document.getElementById('start-match-btn').style.display = 'none';
            const shotTimer = document.getElementById('shot-timer');
            if (shotTimer) shotTimer.style.display = 'block';
            updateHUDTurn();
            startMatchTimer();
            resetShotTimer();
            animate();
        });

        socket.on('correctBallPosition', (ballState) => {
            if (gameMode === 'online' && currentPhase === 'playing') {
                const diff = Math.hypot(cap.x - ballState.x, cap.y - ballState.y);
                if (diff > 10) {
                    const lerpFactor = 0.3;
                    cap.x = cap.x + (ballState.x - cap.x) * lerpFactor;
                    cap.y = cap.y + (ballState.y - cap.y) * lerpFactor;
                    cap.vx = cap.vx * 0.5 + (ballState.vx || 0) * 0.5;
                    cap.vy = cap.vy * 0.5 + (ballState.vy || 0) * 0.5;
                    if (ballState.turn) {
                        turn = ballState.turn;
                        updateHUDTurn();
                    }
                    console.log(`📥 Pozisyon düzeltildi (yumuşak): fark=${diff.toFixed(1)}`);
                }
            }
        });

// ============================================================
// AUTH RESPONSE - LOGO GÜNCELLEME (DÜZELTİLDİ)
// ============================================================

socket.on('authResponse', (data) => {
    console.log('📨 authResponse alındı:', data);
    alert(data.message);
    
    if (data.success) {
        // 1. Oyuncu adını güncelle
        if (data.username) {
            const playerNameInput = document.getElementById('player-name');
            if (playerNameInput) {
                playerNameInput.value = data.username;
            }
        }
        
        // 2. ★★★ TAKIM LOGOSUNU GÜNCELLE ★★★
        if (data.teamLogo && (data.action === 'login' || data.action === 'register')) {
            console.log('🏆 Takım logosu güncelleniyor:', data.teamLogo);
            
            // Ana menüdeki logoyu güncelle
            const logoDisplay = document.getElementById('selected-team-logo-display');
            if (logoDisplay) {
                if (data.teamLogo.startsWith('data:')) {
                    logoDisplay.src = data.teamLogo;
                } else {
                    logoDisplay.src = `takimlar/${data.teamLogo}`;
                }
                logoDisplay.style.display = 'block';
                logoDisplay.style.opacity = '1';
                console.log('✅ Ana menü logosu güncellendi:', logoDisplay.src);
            }
            
            // OYUN DEĞİŞKENLERİNİ GÜNCELLE
            if (!data.teamLogo.startsWith('data:')) {
                selectedTeamLogo = data.teamLogo;
                console.log('🏆 selectedTeamLogo güncellendi:', selectedTeamLogo);
                // Logoyu yükle
                loadTeamLogoImage(selectedTeamLogo);
            } else {
                selectedTeamLogo = data.teamLogo;
                console.log('🏆 selectedTeamLogo (base64) güncellendi');
            }
            
            // Skor tablosunu güncelle (gecikmeli)
            setTimeout(() => {
                updateScoreLogos();
                console.log('✅ Skor tablosu logoları güncellendi');
            }, 300);
        }
        
        // 3. Giriş başarılı - menüyü aç
        if (data.action === 'login' || data.action === 'register') {
            const authOverlay = document.getElementById('auth-modal-overlay');
            if (authOverlay) {
                authOverlay.style.display = 'none';
                authOverlay.classList.add('hidden');
            }
            const menu = document.getElementById('menu');
            if (menu) {
                menu.style.display = 'block';
            }
            console.log('✅ Ana menü açıldı');
        } else if (data.action === 'forgot') {
            switchAuthTab('login');
        }
    }
});

    } catch (e) {
        console.error("❌ Socket bağlantı hatası:", e);
    }
}

// ============================================================
// SAHA GÖSTER/GİZLE
// ============================================================
let currentStadiumTexture = 'menu/ayarlar/stat/texure/z1-t.webp';

function showField() {
    const canvas = document.getElementById('gameCanvas');
    if (canvas) {
        canvas.style.backgroundImage = `url('${currentStadiumTexture}')`;
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
    const canvas = document.getElementById('gameCanvas');
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
let selectedTeamLogo = '';
let aiTeamLogo = '';
let loadedLogos = {};
let localPlayer1Logo = '';
let localPlayer2Logo = '';
let localP1Selected = false;
let localP2Selected = false;

const teamLogos = [
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
    const randomIndex = Math.floor(Math.random() * teamLogos.length);
    const selected = teamLogos[randomIndex];
    selectedTeamLogo = selected.file;
    console.log('🏆 Rastgele takım seçildi:', selected.name);
    return selected;
}

function selectRandomAITeam() {
    const availableLogos = teamLogos.filter(l => l.file !== selectedTeamLogo);
    if (availableLogos.length === 0) {
        aiTeamLogo = teamLogos[0].file;
    } else {
        const randomIndex = Math.floor(Math.random() * availableLogos.length);
        const selected = availableLogos[randomIndex];
        aiTeamLogo = selected.file;
    }
    console.log('🤖 AI Takımı seçti:', aiTeamLogo);
    loadTeamLogoImage(aiTeamLogo);
    updateScoreLogos();
}

// ============================================================
// OYUN DEĞİŞKENLERİ
// ============================================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const width = 360;
const height = 620;
canvas.width = width;
canvas.height = height;

let currentPhase = 'menu';
let gameMode = 'local';
let score = { p1: 0, p2: 0 };
let turn = 1;
let myTeamNumber = 1;
let currentRoomId = null;
let isOnlineMatch = false;
let opponentPinsData = [];
let opponentLogoData = 'default.png';

let matchSecondsLeft = MATCH_DURATION;
let timerInterval = null;
let shotSecondsLeft = SHOT_DURATION;
let shotTimerInterval = null;
let setupSecondsLeft = 15;
let setupTimerInterval = null;
let syncInterval = null;

// TOP VE SAHA DEĞİŞKENLERİ
let cap = { x: width / 2, y: height / 2, vx: 0, vy: 0, radius: 11, friction: 0.983, rotation: 0 };
let pins = [];
let editableTeam = 1;
let selectedPin = null;
let isDraggingBall = false;
let dragStart = { x: 0, y: 0 };
let dragCurrent = { x: 0, y: 0 };
let isAiThinking = false;
let aiLevel = 'orta';

// SAHA ÖLÇÜLERİ
const minAllowedDistance = 45;
const goalWidth = cap.radius * 2 * 3.2;
const goalHeight = 12;
const penaltyBoxW = goalWidth * 2.2;
const penaltyBoxH = height * 0.15;
const pBoxX1 = (width - penaltyBoxW) / 2;
const MAX_DRAG_DIST = cap.radius * 2 * 6;

let goalAnimation = null;
let goalAnimationStartTime = 0;
const GOAL_ANIMATION_DURATION = 3000;
let goalImage = null;
let fieldImage = null;

// ============================================================
// SAHA RESMİ YÜKLEME
// ============================================================
function loadFieldImage(imagePath) {
    const path = imagePath || currentStadiumTexture;
    console.log('🔄 Saha resmi yükleniyor:', path);
    
    const img = new Image();
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
    const img = new Image();
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
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const goalSound = new Audio('sesler/gol.mp3');
goalSound.preload = 'auto';

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
    for (let i = 0; i < 5; i++) {
        let a = (Math.PI * 2 / 5) * i - Math.PI / 2;
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
    
    const shouldFlip = (gameMode === 'online' && myTeamNumber === 2);
    
    if (logoFile && loadedLogos[logoFile]) {
        const img = loadedLogos[logoFile];
        const size = cap.radius * 1.4;
        
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
        
        if (shouldFlip) {
            ctx.translate(0, 0);
            ctx.rotate(Math.PI);
            ctx.drawImage(img, -(size - 2), -(size - 2), (size - 2) * 2, (size - 2) * 2);
        } else {
            ctx.drawImage(img, -size + 2, -size + 2, size * 2 - 4, size * 2 - 4);
        }
        
        ctx.restore();
        
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, size - 1, 0, Math.PI * 2);
        ctx.stroke();
    } else {
        const size = cap.radius * 1.2;
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

    const goalLeft = (width - goalWidth) / 2;
    const goalRight = (width + goalWidth) / 2;
    
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

    pins.forEach(pin => {
        if (pin.isPost) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(pin.x, pin.y, 4, 0, Math.PI * 2);
            ctx.fill();
        } else {
            let logoFile = 'default.png';
            if (pin.team === 1) {
                if (gameMode === 'local' && localPlayer1Logo) {
                    logoFile = localPlayer1Logo;
                } else if (gameMode === 'online' && myTeamNumber === 2) {
                    logoFile = aiTeamLogo || 'default.png';
                } else {
                    logoFile = selectedTeamLogo || 'default.png';
                }
            } else if (pin.team === 2) {
                if (gameMode === 'ai') {
                    logoFile = aiTeamLogo || 'default.png';
                } else if (gameMode === 'local' && localPlayer2Logo) {
                    logoFile = localPlayer2Logo;
                } else if (gameMode === 'online') {
                    if (myTeamNumber === 1) {
                        logoFile = aiTeamLogo || 'default.png';
                    } else {
                        logoFile = selectedTeamLogo || 'default.png';
                    }
                } else {
                    logoFile = 'default.png';
                }
            }
            drawPlayerWithLogo(pin.x, pin.y, logoFile);
        }
    });

    if (currentPhase === 'playing' && cap) {
        drawSoccerBall(cap.x, cap.y, cap.radius, cap.rotation);
    }

    // Goal Animation
    if (goalAnimation) {
        const elapsed = Date.now() - goalAnimationStartTime;
        const progress = Math.min(elapsed / GOAL_ANIMATION_DURATION, 1);
        let scale = 0;
        if (progress < 0.15) {
            scale = (progress / 0.15) * 1.2;
        } else {
            scale = 1.2;
        }
        let alpha = 1;
        if (progress < 0.9) {
            const blinkDuration = 0.5;
            const blinkPhase = progress / blinkDuration;
            const currentBlink = Math.floor(blinkPhase);
            const phaseInBlink = blinkPhase - currentBlink;
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
            const imgSize = 100;
            ctx.shadowColor = `rgba(255, 215, 0, ${alpha * 0.5})`;
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
                ctx.strokeStyle = `rgba(255, 215, 0, ${alpha * 0.9})`;
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(0, 0, imgSize / 2 + 4, 0, Math.PI * 2);
                ctx.stroke();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.font = `bold 38px Arial`;
                ctx.shadowColor = `rgba(0, 0, 0, ${alpha * 0.9})`;
                ctx.shadowBlur = 15;
                ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.7})`;
                ctx.fillText('⚽ GOAL! ⚽', 2, imgSize/2 + 12);
                ctx.shadowBlur = 0;
                ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`;
                ctx.shadowColor = `rgba(255, 215, 0, ${alpha * 0.3})`;
                ctx.shadowBlur = 20;
                ctx.fillText('⚽ GOAL! ⚽', 0, imgSize/2 + 12);
                ctx.shadowBlur = 0;
            }
        } else if (alpha > 0.1) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `bold ${70 * (0.8 + scale * 0.2)}px Arial`;
            ctx.shadowColor = `rgba(0, 0, 0, ${alpha * 0.8})`;
            ctx.shadowBlur = 15;
            ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.7})`;
            ctx.fillText('⚽ GOAL! ⚽', 3, 3);
            ctx.shadowBlur = 0;
            const textGradient = ctx.createLinearGradient(-70, -40, 70, 40);
            textGradient.addColorStop(0, `rgba(255, 215, 0, ${alpha})`);
            textGradient.addColorStop(0.5, `rgba(255, 255, 0, ${alpha})`);
            textGradient.addColorStop(1, `rgba(255, 200, 0, ${alpha})`);
            ctx.fillStyle = textGradient;
            ctx.shadowColor = `rgba(255, 215, 0, ${alpha * 0.3})`;
            ctx.shadowBlur = 30;
            ctx.fillText('⚽ GOAL! ⚽', 0, 0);
            ctx.shadowBlur = 0;
        }
        if (alpha > 0.1) {
            for (let i = 0; i < 16; i++) {
                const angle = (i / 16) * Math.PI * 2 + progress * 0.5;
                const dist = 80 + Math.sin(progress * 6 + i * 1.2) * 20;
                const starX = Math.cos(angle) * dist;
                const starY = Math.sin(angle) * dist;
                const starSize = 5 + Math.sin(progress * 8 + i * 1.8) * 3;
                ctx.fillStyle = `rgba(255, 215, 0, ${alpha * (0.15 + Math.sin(progress * 10 + i * 1.5) * 0.1)})`;
                ctx.shadowBlur = 0;
                ctx.beginPath();
                const spikes = 5;
                const outerRadius = Math.abs(starSize);
                const innerRadius = outerRadius * 0.4;
                ctx.moveTo(starX + outerRadius * Math.cos(0), starY + outerRadius * Math.sin(0));
                for (let j = 1; j < spikes * 2; j++) {
                    const radius = j % 2 === 0 ? outerRadius : innerRadius;
                    const theta = (j / (spikes * 2)) * Math.PI * 2;
                    ctx.lineTo(starX + radius * Math.cos(theta), starY + radius * Math.sin(theta));
                }
                ctx.closePath();
                ctx.fill();
            }
            const blinkFlash = Math.sin(progress * 20) * 0.5 + 0.5;
            if (blinkFlash > 0.8 && alpha > 0.5) {
                ctx.fillStyle = `rgba(255, 255, 200, ${alpha * 0.05 * blinkFlash})`;
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
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
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
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let x = (clientX - rect.left) * scaleX;
    let y = (clientY - rect.top) * scaleY;
    x = Math.max(0, Math.min(width, x));
    y = Math.max(0, Math.min(height, y));
    if (gameMode === 'online' && myTeamNumber === 2) {
        x = width - x;
        y = height - y;
    }
    return { x, y };
}

// ============================================================
// AI SİSTEMİ
// ============================================================
function getAIParameters() {
    switch (aiLevel) {
        case 'kolay': 
            return { reactionDelay: 800, pullDistanceMin: 20, pullDistanceMax: 50, errorMargin: 25, powerError: 0.20, fakeChance: 0.02, targetZones: 3, analyzeOpponents: false, analyzeWalls: false };
        case 'orta': 
            return { reactionDelay: 600, pullDistanceMin: 30, pullDistanceMax: 70, errorMargin: 12, powerError: 0.10, fakeChance: 0.08, targetZones: 5, analyzeOpponents: true, analyzeWalls: false };
        case 'zor': 
            return { reactionDelay: 400, pullDistanceMin: 50, pullDistanceMax: 85, errorMargin: 6, powerError: 0.05, fakeChance: 0.15, targetZones: 5, analyzeOpponents: true, analyzeWalls: true };
        case 'usta': 
            return { reactionDelay: 250, pullDistanceMin: 60, pullDistanceMax: 90, errorMargin: 2, powerError: 0.02, fakeChance: 0.25, targetZones: 7, analyzeOpponents: true, analyzeWalls: true };
        default: 
            return { reactionDelay: 600, pullDistanceMin: 30, pullDistanceMax: 65, errorMargin: 12, powerError: 0.10, fakeChance: 0.08, targetZones: 5, analyzeOpponents: true, analyzeWalls: false };
    }
}

function runAIMove() {
    if (currentPhase !== 'playing' || gameMode !== 'ai' || turn !== 2) return;
    if (Math.hypot(cap.vx, cap.vy) > 0.2 || isAiThinking) return;
    isAiThinking = true;
    
    const params = getAIParameters();
    if (shotSecondsLeft < 2) {
        params.reactionDelay = Math.min(params.reactionDelay, 200);
        params.pullDistanceMin = Math.min(params.pullDistanceMin, 20);
        params.pullDistanceMax = Math.min(params.pullDistanceMax, 40);
    }
    const target = calculateAITarget(params);
    if (Math.random() < params.fakeChance && aiLevel === 'usta') {
        executeFakeShot(target, params);
    } else {
        executeAIShot(target, params);
    }
}

function calculateAITarget(params) {
    const goalY = height - goalHeight;
    const goalCenterX = width / 2;
    const goalLeft = (width - goalWidth) / 2;
    const goalRight = (width + goalWidth) / 2;
    const opponentPins = pins.filter(p => p.team === 1 && !p.isPost);
    const zones = [];
    const numZones = params.targetZones || 5;
    const zoneWidth = (goalRight - goalLeft) / numZones;
    for (let i = 0; i < numZones; i++) {
        const zoneCenterX = goalLeft + (i * zoneWidth) + (zoneWidth / 2);
        const testX = zoneCenterX;
        const testY = goalY;
        let score = 0;
        const centerDist = Math.abs(testX - goalCenterX);
        score += (60 - centerDist) * 1.5;
        if (params.analyzeOpponents) {
            let minDistToOpponent = Infinity;
            opponentPins.forEach(p => {
                const dist = Math.hypot(testX - p.x, testY - p.y);
                if (dist < minDistToOpponent) minDistToOpponent = dist;
            });
            const safetyMargin = (aiLevel === 'usta') ? 20 : 10;
            if (minDistToOpponent < safetyMargin) {
                score -= (safetyMargin - minDistToOpponent) * 3;
            } else {
                score += minDistToOpponent * 2;
            }
        }
        if (params.analyzeWalls) {
            const angleToTarget = Math.atan2(testY - cap.y, testX - cap.x);
            const wallLeftDist = cap.x;
            const wallRightDist = width - cap.x;
            const angleToWallLeft = Math.abs(angleToTarget - Math.PI);
            const angleToWallRight = Math.abs(angleToTarget);
            if (angleToWallLeft < 0.3 && cap.x < 50) {
                score -= 20;
            }
            if (angleToWallRight < 0.3 && (width - cap.x) < 50) {
                score -= 20;
            }
            const distToGoal = Math.abs(testY - cap.y);
            if (distToGoal < 50) {
                score += 10;
            }
        }
        zones.push({ x: testX, y: testY, score: score });
    }
    let bestZone = zones.reduce((a, b) => a.score > b.score ? a : b);
    const errorX = (Math.random() - 0.5) * 2 * params.errorMargin;
    const errorY = (Math.random() - 0.5) * 2 * (params.errorMargin * 0.6);
    let targetX = Math.max(goalLeft + 5, Math.min(goalRight - 5, bestZone.x + errorX));
    let targetY = Math.max(goalY - 5, Math.min(goalY + 5, bestZone.y + errorY));
    return { x: targetX, y: targetY };
}

function executeAIShot(target, params) {
    const angle = Math.atan2(target.y - cap.y, target.x - cap.x);
    const distanceToTarget = Math.hypot(target.x - cap.x, target.y - cap.y);
    let pullDistance;
    
    if (aiLevel === 'usta') {
        const normalizedDist = Math.min(distanceToTarget / 300, 1);
        pullDistance = params.pullDistanceMin + (params.pullDistanceMax - params.pullDistanceMin) * normalizedDist;
    } else {
        pullDistance = params.pullDistanceMin + Math.random() * (params.pullDistanceMax - params.pullDistanceMin);
    }
    const powerErrorFactor = 1 + (Math.random() - 0.5) * 2 * params.powerError;
    pullDistance = Math.min(pullDistance * powerErrorFactor, MAX_DRAG_DIST);
    
    let extraDelay = 150;
    if (shotSecondsLeft < 2) { extraDelay = 50; }

    setTimeout(() => {
        const force = pullDistance * 0.15;
        cap.vx = Math.cos(angle) * force;
        cap.vy = Math.sin(angle) * force;
        isAiThinking = false;
        
        if (gameMode === 'ai' && currentPhase === 'playing') {
            turn = 1; 
            updateHUDTurn();
            resetShotTimer();
        }
        
    }, params.reactionDelay + extraDelay);
}

function executeFakeShot(target, params) {
    const fakeAngle = Math.atan2(target.y - cap.y, target.x - cap.x) + (Math.random() - 0.5) * 1.5;
    const realAngle = Math.atan2(target.y - cap.y, target.x - cap.x);
    const pullDistance = Math.min(params.pullDistanceMin + Math.random() * (params.pullDistanceMax - params.pullDistanceMin), MAX_DRAG_DIST);
    setTimeout(() => {
        isDraggingBall = true;
        dragStart = { x: cap.x, y: cap.y };
        dragCurrent = { x: cap.x - Math.cos(fakeAngle) * pullDistance * 0.6, y: cap.y - Math.sin(fakeAngle) * pullDistance * 0.6 };
        setTimeout(() => {
            const realPullDistance = Math.min(pullDistance * 0.8, MAX_DRAG_DIST);
            dragCurrent = { x: cap.x - Math.cos(realAngle) * realPullDistance, y: cap.y - Math.sin(realAngle) * realPullDistance };
            setTimeout(() => {
                isDraggingBall = false;
                isAiThinking = false;
                playSound('kick');
                const powerMultiplier = 0.13 * (0.8 + Math.random() * 0.4);
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
// OYUN FONKSİYONLARI
// ============================================================
function startLocalGame(mode, level) {
    gameMode = mode;
    if (mode === 'ai' && level) {
        aiLevel = level;
        closeAILevelMenu();
        selectRandomAITeam();
        setTimeout(() => {
            updateScoreLogos();
        }, 100);
    }
    document.getElementById('menu').style.display = 'none';
    document.getElementById('top-bar').style.display = 'flex';
    matchSecondsLeft = MATCH_DURATION;
    const timeBoard = document.getElementById('time-board');
    if (timeBoard) timeBoard.innerText = matchSecondsLeft + 's';
    showField();
    startSetupPhase();
}

function openOnlineLobby() {
    console.log('🎮 Online lobby açılıyor...');
    console.log('📱 Platform:', isIOS ? 'iOS Safari' : 'Diğer');
    
    if (!socket) { 
        alert("Şu anda bir sunucuya bağlı değilsiniz!"); 
        return; 
    }
    
    if (!socket.connected) {
        alert("Sunucu bağlantısı kurulamadı! Lütfen sayfayı yenileyin.");
        if (isIOS) {
            console.log('📱 iOS Safari yeniden bağlanmayı deniyor...');
            socket.connect();
        }
        return;
    }
    
    gameMode = 'online';
    const playerData = getPlayerData();
    
    console.log('📤 Lobby\'ye katılınıyor:', playerData);
    console.log('📱 Socket ID:', socket.id);
    
    socket.emit("join-lobby", playerData);
    
    document.getElementById('menu').style.display = 'none';
    document.getElementById('online-lobby').style.display = 'flex';
}

function closeOnlineLobby() {
    if (socket) socket.emit("leave-lobby");
    document.getElementById('online-lobby').style.display = 'none';
    document.getElementById('menu').style.display = 'block';
}

function startSetupPhase() {
    showField();
    currentPhase = 'setup';
    score = { p1: 0, p2: 0 };
    document.getElementById('score-p1').innerText = "0";
    document.getElementById('score-p2').innerText = "0";
    const timeBoard = document.getElementById('time-board');
    if (timeBoard) timeBoard.innerText = matchSecondsLeft + 's';
    const startBtn = document.getElementById('start-match-btn');
    startBtn.style.display = 'flex';
    startBtn.style.opacity = '1';
    startBtn.disabled = false;
    const indicator = document.getElementById('turn-indicator');
    if (indicator) {
        indicator.innerText = "🏆 Takım Taktik Ayarla";
        indicator.style.borderColor = "#f1c40f";
        indicator.style.color = "#f1c40f";
    }
    const shotTimer = document.getElementById('shot-timer');
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
    const blue442 = [
        { x: width * 0.50, y: height * 0.88, team: 1 }, { x: width * 0.15, y: height * 0.73, team: 1 },
        { x: width * 0.38, y: height * 0.77, team: 1 }, { x: width * 0.62, y: height * 0.77, team: 1 },
        { x: width * 0.85, y: height * 0.73, team: 1 }, { x: width * 0.15, y: height * 0.58, team: 1 },
        { x: width * 0.38, y: height * 0.60, team: 1 }, { x: width * 0.62, y: height * 0.60, team: 1 },
        { x: width * 0.85, y: height * 0.58, team: 1 }, { x: width * 0.35, y: height * 0.45, team: 1 },
        { x: width * 0.65, y: height * 0.45, team: 1 }
    ];
    const red442 = [
        { x: width * 0.50, y: height * 0.12, team: 2 }, { x: width * 0.85, y: height * 0.27, team: 2 },
        { x: width * 0.62, y: height * 0.23, team: 2 }, { x: width * 0.38, y: height * 0.23, team: 2 },
        { x: width * 0.15, y: height * 0.27, team: 2 }, { x: width * 0.85, y: height * 0.42, team: 2 },
        { x: width * 0.62, y: height * 0.40, team: 2 }, { x: width * 0.38, y: height * 0.40, team: 2 },
        { x: width * 0.15, y: height * 0.42, team: 2 }, { x: width * 0.65, y: height * 0.55, team: 2 },
        { x: width * 0.35, y: height * 0.55, team: 2 }
    ];
    blue442.forEach(p => pins.push({ ...p, locked: false }));
    red442.forEach(p => pins.push({ ...p, locked: false }));
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
        const btn = document.getElementById('start-match-btn');
        btn.innerHTML = "BEKLE";
        btn.disabled = true;
        const myPlacedPins = pins.filter(p => p.team === myTeamNumber).map(p => ({ x: p.x, y: p.y }));
        console.log('📤 Hazır gönderiliyor, pinler:', myPlacedPins);
        socket.emit("player-ready", { roomId: currentRoomId, team: myTeamNumber, placedPins: myPlacedPins });
    } else {
        pins.forEach(pin => { pin.locked = true; });
        currentPhase = 'playing';
        document.getElementById('start-match-btn').style.display = 'none';
        const shotTimer = document.getElementById('shot-timer');
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
    timerInterval = setInterval(() => {
        if (currentPhase === 'playing') {
            matchSecondsLeft--;
            const timeBoard = document.getElementById('time-board');
            if (timeBoard) timeBoard.innerText = matchSecondsLeft + 's';
            if (matchSecondsLeft <= 0) endMatch();
        }
    }, 1000);
}

function startSetupTimer() {
    if (setupTimerInterval) clearInterval(setupTimerInterval);
    setupSecondsLeft = 15;
    const btn = document.getElementById('start-match-btn');
    if (gameMode === 'online') {
        btn.innerHTML = `BAŞLAT<span class="timer-subtext">${setupSecondsLeft}s</span>`;
        setupTimerInterval = setInterval(() => {
            setupSecondsLeft--;
            if (setupSecondsLeft <= 0) {
                clearInterval(setupTimerInterval);
                confirmFormationsAndStart();
            } else {
                btn.innerHTML = `BAŞLAT<span class="timer-subtext">${setupSecondsLeft}s</span>`;
            }
        }, 1000);
    } else {
        btn.innerHTML = "BAŞLAT";
    }
}

function resetShotTimer() {
    if (shotTimerInterval) clearInterval(shotTimerInterval);
    shotSecondsLeft = SHOT_DURATION;
    
    const shotTimer = document.getElementById('shot-timer');
    if (shotTimer) {
        shotTimer.innerText = 'ŞUT: ' + shotSecondsLeft + 's';
        shotTimer.classList.remove('warning');
        shotTimer.style.color = '#2ecc71';
    }
    
    if (gameMode === 'online' && turn !== myTeamNumber) {
        if (shotTimer) {
            shotTimer.innerText = '⏳ RAKİP BEKLENİYOR';
            shotTimer.style.color = '#f1c40f';
        }
        return;
    }
    
    shotTimerInterval = setInterval(() => {
        if (currentPhase === 'playing' && Math.hypot(cap.vx, cap.vy) <= 0.2) {
            shotSecondsLeft--;
            const shotTimer = document.getElementById('shot-timer');
            if (shotTimer) {
                shotTimer.innerText = `ŞUT: ${shotSecondsLeft}s`;
                if (shotSecondsLeft <= 1) {
                    shotTimer.classList.add('warning');
                    shotTimer.style.color = '#e74c3c';
                } else {
                    shotTimer.classList.remove('warning');
                    shotTimer.style.color = '#2ecc71';
                }
            }
            
            if (shotSecondsLeft <= 0) {
                clearInterval(shotTimerInterval);
                console.log('⏰ Vuruş süresi doldu!');
                
                if (gameMode === 'online' && socket) {
                    const shotData = {
                        player: myTeamNumber,
                        startX: cap.x,
                        startY: cap.y,
                        endX: cap.x + (Math.random() - 0.5) * 20,
                        endY: cap.y + (Math.random() - 0.5) * 20,
                        timestamp: Date.now(),
                        auto: true
                    };
                    
                    socket.emit('playerShot', {
                        roomId: currentRoomId,
                        shotData: shotData
                    });
                }
                
                turn = turn === 1 ? 2 : 1;
                updateHUDTurn();
                resetShotTimer();
            }
        }
    }, 1000);
}

function endMatch() {
    currentPhase = 'ended';
    clearInterval(timerInterval);
    clearInterval(shotTimerInterval);
    let playerScore = gameMode === 'online' ? (myTeamNumber === 1 ? score.p1 : score.p2) : score.p1;
    let opponentScore = gameMode === 'online' ? (myTeamNumber === 1 ? score.p2 : score.p1) : score.p2;
    let resultMessage = "Maç Berabere Bitti!";
    if (playerScore > opponentScore) resultMessage = "🎉 KAZANDINIZ! 🎉";
    else if (playerScore < opponentScore) resultMessage = "😔 Kaybettiniz.";
    alert(`⏰ SÜRE DOLDU!\n\n📊 Skor: ${playerScore} - ${opponentScore}\n\n${resultMessage}`);
    setTimeout(() => exitToMenu(), 500);
}

function updateHUDTurn() {
    const indicator = document.getElementById('turn-indicator');
    if (!indicator) return;
    if (gameMode === 'local') {
        const playerNames = {
            1: localPlayer1Logo ? teamLogos.find(l => l.file === localPlayer1Logo)?.name.replace('⚽ ', '') || 'Oyuncu 1' : 'Oyuncu 1',
            2: localPlayer2Logo ? teamLogos.find(l => l.file === localPlayer2Logo)?.name.replace('⚽ ', '') || 'Oyuncu 2' : 'Oyuncu 2'
        };
        if (turn === 1) {
            indicator.innerText = `🎯 ${playerNames[1]}`;
            indicator.style.borderColor = "#3498db";
            indicator.style.color = "#3498db";
        } else {
            indicator.innerText = `🎯 ${playerNames[2]}`;
            indicator.style.borderColor = "#e74c3c";
            indicator.style.color = "#e74c3c";
        }
    }
}

function exitToMenu() {
    if (timerInterval) clearInterval(timerInterval);
    if (shotTimerInterval) clearInterval(shotTimerInterval);
    if (setupTimerInterval) clearInterval(setupTimerInterval);
    if (syncInterval) clearInterval(syncInterval);
    if (socket && gameMode === 'online') {
        if (currentRoomId) { socket.emit('leave-room', currentRoomId); currentRoomId = null; }
        else { socket.emit("leave-lobby"); }
    }
    currentPhase = 'menu';
    gameMode = 'local';
    document.getElementById('menu').style.display = 'block';
    document.getElementById('top-bar').style.display = 'none';
    document.getElementById('online-lobby').style.display = 'none';
    document.getElementById('start-match-btn').style.display = 'none';
    isAiThinking = false;
    isDraggingBall = false;
    hideField();
    drawFieldLinesOnly();
}

// ============================================================
// FİZİK MOTORU
// ============================================================
function updatePhysics() {
    if (currentPhase !== 'playing') return;
    
    const SUB_STEPS = 20;
    const stepSize = 1 / SUB_STEPS;
    
    for (let step = 0; step < SUB_STEPS; step++) {
        cap.x += cap.vx * stepSize;
        cap.y += cap.vy * stepSize;
        
        if (cap.x - cap.radius < 0) {
            cap.x = cap.radius;
            cap.vx *= -0.85;
            playSound('hit');
        }
        if (cap.x + cap.radius > width) {
            cap.x = width - cap.radius;
            cap.vx *= -0.85;
            playSound('hit');
        }
        
        if (cap.y - cap.radius <= goalHeight) {
            const goalLeft = (width - goalWidth) / 2;
            const goalRight = (width + goalWidth) / 2;
            if (cap.x > goalLeft && cap.x < goalRight) {
                handleGoal(1);
                return;
            } else {
                cap.y = goalHeight + cap.radius;
                cap.vy *= -0.85;
                playSound('hit');
            }
        }
        
        if (cap.y + cap.radius >= height - goalHeight) {
            const goalLeft = (width - goalWidth) / 2;
            const goalRight = (width + goalWidth) / 2;
            if (cap.x > goalLeft && cap.x < goalRight) {
                handleGoal(2);
                return;
            } else {
                cap.y = height - goalHeight - cap.radius;
                cap.vy *= -0.85;
                playSound('hit');
            }
        }
        
        pins.forEach(pin => {
            const dist = Math.hypot(cap.x - pin.x, cap.y - pin.y);
            const minDist = cap.radius + (pin.isPost ? 4 : 8);
            if (dist < minDist && dist > 0) {
                const angle = Math.atan2(cap.y - pin.y, cap.x - pin.x);
                cap.x = pin.x + Math.cos(angle) * minDist;
                cap.y = pin.y + Math.sin(angle) * minDist;
                const hitSpeed = Math.hypot(cap.vx, cap.vy);
                cap.vx = Math.cos(angle) * Math.max(hitSpeed, 1.5) * 0.85;
                cap.vy = Math.sin(angle) * Math.max(hitSpeed, 1.5) * 0.85;
                playSound('hit');
            }
        });
    }
    
    cap.vx *= cap.friction;
    cap.vy *= cap.friction;
    
    const isMoving = Math.hypot(cap.vx, cap.vy) > 0.15;
    if (isMoving) {
        cap.rotation += (Math.sign(cap.vx) * Math.abs(cap.vx) + Math.sign(cap.vy) * Math.abs(cap.vy)) * 0.05;
    }
}

function handleGoal(scoringTeam) {
    console.log(`⚽ GOL! Takım ${scoringTeam}`);
    
    if (gameMode === 'online') {
        if (scoringTeam === myTeamNumber) {
            if (myTeamNumber === 1) {
                score.p1++;
                document.getElementById('score-p1').innerText = score.p1;
            } else {
                score.p2++;
                document.getElementById('score-p2').innerText = score.p2;
            }
        }
        socket.emit('goal-scored', {
            roomId: currentRoomId,
            scoringTeam: scoringTeam
        });
    } else {
        if (scoringTeam === 1) {
            score.p1++;
            document.getElementById('score-p1').innerText = score.p1;
        } else {
            score.p2++;
            document.getElementById('score-p2').innerText = score.p2;
        }
    }
    
    triggerGoalAnimation();
    turn = scoringTeam === 1 ? 2 : 1;
    updateHUDTurn();
    cap.x = width / 2;
    cap.y = height / 2;
    cap.vx = 0;
    cap.vy = 0;
    resetShotTimer();
}

// ============================================================
// PERİYODİK SENKRONİZASYON
// ============================================================
function startPeriodicSync() {
    if (syncInterval) clearInterval(syncInterval);
    
    syncInterval = setInterval(() => {
        if (gameMode === 'online' && currentPhase === 'playing' && socket && socket.connected) {
            socket.emit('syncBallPosition', {
                roomId: currentRoomId,
                ballState: {
                    x: cap.x,
                    y: cap.y,
                    vx: cap.vx,
                    vy: cap.vy,
                    turn: turn
                }
            });
        }
    }, 500);
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
let dragStartPinPos = { x: 0, y: 0 };

canvas.addEventListener('mousedown', (e) => {
    if (gameMode === 'ai' && turn === 2) return;
    const pos = getCanvasTouchPos(e);
    if (currentPhase === 'setup') {
        for (let p of pins) {
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
            const container = document.getElementById('power-bar-container');
            if (container) container.style.display = 'block';
        }
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (gameMode === 'ai' && turn === 2) return;
    const pos = getCanvasTouchPos(e);
    if (currentPhase === 'setup' && selectedPin) {
        const margin = 15;
        const topMargin = goalHeight + 15;
        const bottomMargin = height - goalHeight - 15;
        let newX = Math.max(margin, Math.min(width - margin, pos.x));
        let newY = Math.max(topMargin, Math.min(bottomMargin, pos.y));
        let collision = false;
        for (let p of pins) {
            if (p !== selectedPin && !p.isPost && p.team === selectedPin.team) {
                if (Math.hypot(newX - p.x, newY - p.y) < minAllowedDistance) { collision = true; break; }
            }
        }
        if (!collision) { selectedPin.x = newX; selectedPin.y = newY; broadcastMyPinMove(selectedPin); }
    } else if (currentPhase === 'playing' && isDraggingBall) {
        let dx = pos.x - dragStart.x;
        let dy = pos.y - dragStart.y;
        let dist = Math.hypot(dx, dy);
        if (dist > MAX_DRAG_DIST) { dx = (dx / dist) * MAX_DRAG_DIST; dy = (dy / dist) * MAX_DRAG_DIST; dist = MAX_DRAG_DIST; }
        dragCurrent = { x: dragStart.x + dx, y: dragStart.y + dy };
        const powerPercent = Math.min(100, (dist / MAX_DRAG_DIST) * 100);
        const powerBar = document.getElementById('power-bar');
        if (powerBar) {
            powerBar.style.width = powerPercent + '%';
            if (powerPercent < 33) powerBar.style.background = '#2ecc71';
            else if (powerPercent < 66) powerBar.style.background = '#f1c40f';
            else powerBar.style.background = '#e74c3c';
        }
    }
});

window.addEventListener('mouseup', () => {
    if (gameMode === 'ai' && turn === 2) return;
    if (currentPhase === 'setup' && selectedPin) {
        let valid = true;
        if (selectedPin.x < 15 || selectedPin.x > width - 15) valid = false;
        if (selectedPin.y < goalHeight + 15 || selectedPin.y > height - goalHeight - 15) valid = false;
        if (valid) {
            for (let p of pins) {
                if (p !== selectedPin && (p.isPost || p.team === selectedPin.team)) {
                    if (Math.hypot(selectedPin.x - p.x, selectedPin.y - p.y) < minAllowedDistance) { valid = false; break; }
                }
            }
        }
        if (!valid) { selectedPin.x = dragStartPinPos.x; selectedPin.y = dragStartPinPos.y; }
        broadcastMyPinMove(selectedPin);
        selectedPin = null;
    }
    if (currentPhase === 'playing' && isDraggingBall) {
        isDraggingBall = false;
        playSound('kick');
        const startX = dragStart.x;
        const startY = dragStart.y;
        const endX = dragCurrent.x;
        const endY = dragCurrent.y;
        cap.vx = (startX - endX) * 0.10;
        cap.vy = (startY - endY) * 0.10;
        turn = turn === 1 ? 2 : 1;
        updateHUDTurn();
        resetShotTimer();
        if (gameMode === 'online' && socket) {
            socket.emit('playerShot', {
                roomId: currentRoomId,
                shotData: { player: turn, startX, startY, endX, endY, timestamp: Date.now() }
            });
        }
        const container = document.getElementById('power-bar-container');
        if (container) container.style.display = 'none';
        const powerBar = document.getElementById('power-bar');
        if (powerBar) powerBar.style.width = '0%';
    }
});

// Touch Events
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (touch) canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: touch.clientX, clientY: touch.clientY }));
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (touch) canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: touch.clientX, clientY: touch.clientY }));
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    if (touch) window.dispatchEvent(new MouseEvent('mouseup', { clientX: touch.clientX, clientY: touch.clientY }));
    else window.dispatchEvent(new MouseEvent('mouseup'));
}, { passive: false });

canvas.addEventListener('touchcancel', (e) => {
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

// ============================================================
// TAKIM LOGO FONKSİYONLARI
// ============================================================
function toggleTeamSelect() {
    const container = document.getElementById('team-logo-container');
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
    const container = document.getElementById('team-logo-options');
    if (!container) return;
    container.innerHTML = '';
    console.log('🏆 Logolar yükleniyor...');
    teamLogos.forEach((logo) => {
        const btn = document.createElement('button');
        btn.className = 'team-logo-btn';
        btn.title = logo.name;
        if (logo.file === selectedTeamLogo) btn.classList.add('active');
        const img = document.createElement('img');
        img.src = `takimlar/${logo.file}`;
        img.alt = logo.name;
        img.onerror = function() { 
            console.warn(`⚠️ Logo yüklenemedi: ${logo.file}`);
            this.src = 'takimlar/default.png'; 
        };
        btn.appendChild(img);
        btn.onclick = function(e) {
            e.stopPropagation();
            selectTeamLogo(logo.file);
        };
        container.appendChild(btn);
    });
    updateTeamLogoDisplay();
    updateSelectedTeamName();
    console.log(`✅ ${teamLogos.length} logo yüklendi`);
}

function selectTeamLogo(logoFile) {
    console.log(`🏆 Takım seçildi: ${logoFile}`);
    selectedTeamLogo = logoFile;
    document.querySelectorAll('.team-logo-btn').forEach(btn => {
        btn.classList.remove('active');
        const img = btn.querySelector('img');
        if (img && img.src && img.src.includes(logoFile)) {
            btn.classList.add('active');
        }
    });
    updateTeamLogoDisplay();
    updateSelectedTeamName();
    updateScoreLogos();
    loadTeamLogoImage(logoFile);
    selectRandomAITeam();
}

function updateTeamLogoDisplay() {
    const displayImg = document.getElementById('selected-team-logo-display');
    if (displayImg) {
        if (selectedTeamLogo && selectedTeamLogo !== 'default.png') {
            displayImg.src = `takimlar/${selectedTeamLogo}`;
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
    const logo = teamLogos.find(l => l.file === selectedTeamLogo);
    const teamName = logo ? logo.name.replace('⚽ ', '') : 'Varsayılan';
    const displayName = document.getElementById('selected-team-name-display');
    if (displayName) displayName.textContent = teamName;
}

// ============================================================
// SKORBORD LOGO GÜNCELLEME
// ============================================================
function updateScoreLogos() {
    const logoP1 = document.getElementById('score-logo-p1');
    if (logoP1) {
        if (gameMode === 'local' && localPlayer1Logo) {
            logoP1.src = `takimlar/${localPlayer1Logo}`;
        } else if (gameMode === 'online') {
            if (myTeamNumber === 1) {
                logoP1.src = selectedTeamLogo ? `takimlar/${selectedTeamLogo}` : 'takimlar/default.png';
            } else {
                logoP1.src = opponentLogoData ? `takimlar/${opponentLogoData}` : 'takimlar/default.png';
            }
        } else {
            logoP1.src = selectedTeamLogo ? `takimlar/${selectedTeamLogo}` : 'takimlar/default.png';
        }
        logoP1.onerror = function() { this.src = 'takimlar/default.png'; };
    }
    
    const logoP2 = document.getElementById('score-logo-p2');
    if (logoP2) {
        if (gameMode === 'local' && localPlayer2Logo) {
            logoP2.src = `takimlar/${localPlayer2Logo}`;
        } else if (gameMode === 'online') {
            if (myTeamNumber === 2) {
                logoP2.src = selectedTeamLogo ? `takimlar/${selectedTeamLogo}` : 'takimlar/default.png';
            } else {
                logoP2.src = opponentLogoData ? `takimlar/${opponentLogoData}` : 'takimlar/default.png';
            }
        } else if (gameMode === 'ai') {
            logoP2.src = `takimlar/${aiTeamLogo || 'default.png'}`;
        } else {
            logoP2.src = 'takimlar/default.png';
        }
        logoP2.onerror = function() { this.src = 'takimlar/default.png'; };
    }
}

function loadTeamLogoImage(logoFile) {
    return new Promise((resolve) => {
        if (loadedLogos[logoFile]) {
            resolve(loadedLogos[logoFile]);
            return;
        }
        const img = new Image();
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
        img.src = `takimlar/${logoFile}`;
    });
}

// ============================================================
// 2 KİŞİLİK AYNI EKRAN - TAKIM SEÇ
// ============================================================

function openLocalTeamSelect() {
    console.log('👥 2 Kişilik takım seç açılıyor...');
    const popup = document.getElementById('local-team-select');
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
    
    const p1Name = document.getElementById('local-p1-name');
    const p2Name = document.getElementById('local-p2-name');
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
    
    const shield1 = document.getElementById('local-p1-shield-img');
    const shield2 = document.getElementById('local-p2-shield-img');
    if (shield1) { shield1.style.display = 'none'; shield1.src = ''; }
    if (shield2) { shield2.style.display = 'none'; shield2.src = ''; }
    
    loadLocalTeamLogos();
}

function closeLocalTeamSelect() {
    console.log('👥 2 Kişilik takım seç kapatılıyor...');
    const popup = document.getElementById('local-team-select');
    if (popup) {
        popup.style.display = 'none';
        popup.style.visibility = 'hidden';
        popup.style.opacity = '0';
    }
}

function loadLocalTeamLogos() {
    const container1 = document.getElementById('local-player1-logos');
    const container2 = document.getElementById('local-player2-logos');
    
    if (!container1 || !container2) {
        console.warn('⚠️ Logo containerları bulunamadı!');
        return;
    }
    
    container1.innerHTML = '';
    container2.innerHTML = '';
    
    teamLogos.forEach((logo) => {
        const btn1 = document.createElement('button');
        btn1.className = 'team-logo-btn';
        btn1.title = logo.name;
        btn1.dataset.logo = logo.file;
        const img1 = document.createElement('img');
        img1.src = `takimlar/${logo.file}`;
        img1.alt = logo.name;
        img1.onerror = function() { this.src = 'takimlar/default.png'; };
        btn1.appendChild(img1);
        btn1.onclick = function(e) {
            e.stopPropagation();
            selectLocalTeam(1, logo.file);
        };
        container1.appendChild(btn1);
        
        const btn2 = document.createElement('button');
        btn2.className = 'team-logo-btn';
        btn2.title = logo.name;
        btn2.dataset.logo = logo.file;
        const img2 = document.createElement('img');
        img2.src = `takimlar/${logo.file}`;
        img2.alt = logo.name;
        img2.onerror = function() { this.src = 'takimlar/default.png'; };
        btn2.appendChild(img2);
        btn2.onclick = function(e) {
            e.stopPropagation();
            selectLocalTeam(2, logo.file);
        };
        container2.appendChild(btn2);
    });
    
    console.log(`✅ ${teamLogos.length} logo yüklendi`);
}

function selectLocalTeam(player, logoFile) {
    console.log(`👤 Oyuncu ${player} takım seçti:`, logoFile);
    
    if (player === 1) {
        if (logoFile === localPlayer2Logo && localP2Selected) {
            alert('⚠️ Oyuncu 2 zaten bu takımı seçti! Farklı bir takım seçin.');
            return;
        }
        
        localPlayer1Logo = logoFile;
        localP1Selected = true;
        
        document.querySelectorAll('#local-player1-logos .team-logo-btn').forEach(btn => {
            btn.classList.remove('active', 'active-p1');
            if (btn.dataset.logo === logoFile) {
                btn.classList.add('active', 'active-p1');
            }
        });
        
        const shield = document.getElementById('local-p1-shield-img');
        if (shield) {
            shield.src = `takimlar/${logoFile}`;
            shield.style.display = 'block';
            shield.onerror = function() { this.src = 'takimlar/default.png'; };
        }
        
        const nameEl = document.getElementById('local-p1-name');
        if (nameEl) {
            const logo = teamLogos.find(l => l.file === logoFile);
            nameEl.textContent = logo ? `👤 ${logo.name.replace('⚽ ', '')}` : '👤 Seçildi';
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
        
        document.querySelectorAll('#local-player2-logos .team-logo-btn').forEach(btn => {
            btn.classList.remove('active', 'active-p2');
            if (btn.dataset.logo === logoFile) {
                btn.classList.add('active', 'active-p2');
            }
        });
        
        const shield = document.getElementById('local-p2-shield-img');
        if (shield) {
            shield.src = `takimlar/${logoFile}`;
            shield.style.display = 'block';
            shield.onerror = function() { this.src = 'takimlar/default.png'; };
        }
        
        const nameEl = document.getElementById('local-p2-name');
        if (nameEl) {
            const logo = teamLogos.find(l => l.file === logoFile);
            nameEl.textContent = logo ? `👤 ${logo.name.replace('⚽ ', '')}` : '👤 Seçildi';
            nameEl.style.color = '#e74c3c';
            nameEl.style.opacity = '1';
        }
    }
    
    console.log(`📊 Seçim durumu: P1=${localP1Selected ? localPlayer1Logo : '❌'}, P2=${localP2Selected ? localPlayer2Logo : '❌'}`);
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
    const timeBoard = document.getElementById('time-board');
    if (timeBoard) timeBoard.innerText = matchSecondsLeft + 's';
    
    showField();
    
    setTimeout(() => {
        updateScoreLogos();
    }, 100);
    
    turn = 1;
    updateHUDTurn();
    
    startSetupPhase();
}

function selectDifficulty(level) {
    console.log('🎯 Zorluk seçildi:', level);
    
    const menu = document.getElementById('ai-level-menu');
    if (menu) {
        menu.style.display = 'none';
    }
    
    const mainMenu = document.getElementById('menu');
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
    const popup = document.getElementById('settings-popup');
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
    const popup = document.getElementById('settings-popup');
    if (popup) {
        popup.style.display = 'none';
        popup.style.visibility = 'hidden';
        popup.style.opacity = '0';
        console.log('✅ Ayarlar pop-up kapatıldı');
    }
}

function toggleMatchDurationOptions() {
    const options = document.getElementById('match-duration-options');
    const shotOptions = document.getElementById('shot-duration-options');
    const stadiumOptions = document.getElementById('stadium-options');
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
    const display = document.getElementById('match-duration-display');
    if (display) {
        display.textContent = seconds + 'sn';
    }
    document.querySelectorAll('.settings-option[data-duration]').forEach(btn => {
        btn.classList.remove('active');
        if (parseInt(btn.dataset.duration) === seconds) {
            btn.classList.add('active');
        }
    });
    MATCH_DURATION = seconds;
    if (currentPhase === 'playing' || currentPhase === 'setup') {
        matchSecondsLeft = seconds;
        const timeBoard = document.getElementById('time-board');
        if (timeBoard) {
            timeBoard.innerText = seconds + 's';
        }
    }
    const options = document.getElementById('match-duration-options');
    if (options) {
        options.style.display = 'none';
        options.classList.remove('show');
    }
    console.log('✅ Maç süresi güncellendi:', seconds, 'sn');
}

function toggleShotDurationOptions() {
    const optionsDiv = document.getElementById('shot-duration-options');
    const matchOptions = document.getElementById('match-duration-options');
    const stadiumOptions = document.getElementById('stadium-options');
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
    const display = document.getElementById('shot-duration-display');
    if (display) {
        display.textContent = seconds + 'sn';
    }
    document.querySelectorAll('.settings-option[data-shot-duration]').forEach(btn => {
        btn.classList.remove('active');
        if (parseInt(btn.dataset.shotDuration) === seconds) {
            btn.classList.add('active');
        }
    });
    SHOT_DURATION = seconds;
    if (currentPhase === 'playing') {
        const shotTimer = document.getElementById('shot-timer');
        if (shotTimer) {
            shotTimer.innerText = 'ŞUT: ' + seconds + 's';
        }
        if (shotTimerInterval) {
            clearInterval(shotTimerInterval);
            resetShotTimer();
        }
    }
    const options = document.getElementById('shot-duration-options');
    if (options) {
        options.style.display = 'none';
        options.classList.remove('show');
    }
    console.log('✅ Vuruş süresi güncellendi:', seconds, 'sn');
}

function toggleStadiumOptions() {
    const optionsDiv = document.getElementById('stadium-options');
    const matchOptions = document.getElementById('match-duration-options');
    const shotOptions = document.getElementById('shot-duration-options');
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
    const previewImg = document.getElementById('selected-stadium-preview');
    if (previewImg) {
        previewImg.src = `menu/ayarlar/stat/${stadiumKey}.webp`;
    }
    const cards = document.querySelectorAll('.stadium-option-card');
    cards.forEach(card => {
        const img = card.querySelector('img');
        if (img && img.src && img.src.includes(`${stadiumKey}.webp`)) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    });
    currentStadiumTexture = texturePath;
    loadFieldImage(texturePath);
    if (currentPhase !== 'menu') {
        showField();
    }
    const optionsDiv = document.getElementById('stadium-options');
    if (optionsDiv) {
        optionsDiv.style.display = 'none';
        optionsDiv.classList.remove('show');
    }
    console.log('✅ Stadyum güncellendi:', texturePath);
}

// ============================================================
// SOCKET OLAY DİNLEYİCİLERİ - EKSİK OLANLAR
// ============================================================
function getPlayerData() {
    const name = document.getElementById('player-name').value.trim();
    return {
        name: name,
        logo: selectedTeamLogo || 'default.png'
    };
}

// ============================================================
// GOL SENKRONİZASYONU
// ============================================================
socket.on('opponent-goal', (data) => {
    console.log('📥 Rakip gol bildirimi:', data);
    
    if (currentPhase === 'playing' && isOnlineMatch) {
        if (data.scoringTeam === 1) {
            score.p1++;
            document.getElementById('score-p1').innerText = score.p1;
            triggerGoalAnimation();
        } else if (data.scoringTeam === 2) {
            score.p2++;
            document.getElementById('score-p2').innerText = score.p2;
            triggerGoalAnimation();
        }
    }
});

socket.on("receive-invite", (data) => {
    if (confirm(`${data.fromName} seni maça davet ediyor! Kabul et?`)) {
        socket.emit("accept-invite", data.fromId);
    }
});

socket.on("start-online-match", ({ roomId, team, opponentLogo }) => {
    currentRoomId = roomId;
    myTeamNumber = team;
    aiTeamLogo = opponentLogo || 'default.png';
    console.log('🟢 Online rakip logosu:', aiTeamLogo);
    loadTeamLogoImage(aiTeamLogo);
    document.getElementById('online-lobby').style.display = 'none';
    document.getElementById('top-bar').style.display = 'flex';
    matchSecondsLeft = MATCH_DURATION;
    const timeBoard = document.getElementById('time-board');
    if (timeBoard) timeBoard.innerText = matchSecondsLeft + 's';
    setTimeout(() => {
        updateScoreLogos();
    }, 100);
    startSetupPhase();
});

socket.on("opponent-disconnected", () => { 
    alert("Rakip oyundan ayrıldı."); 
    exitToMenu(); 
});

socket.on("sync-setup-pin-move", ({ team, index, x, y }) => {
    if (currentPhase === 'setup') {
        let count = 0;
        for (let p of pins) {
            if (!p.isPost && p.team === team) {
                if (count === index) { p.x = x; p.y = y; break; }
                count++;
            }
        }
    }
});

socket.on("match-go", ({ pins: finalPins }) => {
    if (setupTimerInterval) clearInterval(setupTimerInterval);
    pins = [
        { x: (width - goalWidth) / 2, y: goalHeight, isPost: true, locked: true },
        { x: (width + goalWidth) / 2, y: goalHeight, isPost: true, locked: true },
        { x: (width - goalWidth) / 2, y: height - goalHeight, isPost: true, locked: true },
        { x: (width + goalWidth) / 2, y: height - goalHeight, isPost: true, locked: true }
    ];
    finalPins.forEach((p, index) => {
        let assignedTeam = p.team || (index < 11 ? 1 : 2);
        pins.push({ x: p.x, y: p.y, team: assignedTeam, locked: true });
    });
    currentPhase = 'playing';
    document.getElementById('start-match-btn').style.display = 'none';
    const shotTimer = document.getElementById('shot-timer');
    if (shotTimer) shotTimer.style.display = 'block';
    updateHUDTurn();
    startMatchTimer();
    resetShotTimer();
    animate();
});

socket.on("opponentShot", (shotData) => {
    if (gameMode === 'online' && currentPhase === 'playing') {
        cap.vx = (shotData.startX - shotData.endX) * 0.13;
        cap.vy = (shotData.startY - shotData.endY) * 0.13;
        playSound('kick');
        turn = myTeamNumber;
        updateHUDTurn();
        resetShotTimer();
    }
});

socket.on("correctBallPosition", (ballState) => {
    if (gameMode === 'online' && currentPhase === 'playing') {
        const diff = Math.hypot(cap.x - ballState.x, cap.y - ballState.y);
        if (diff > 30) {
            cap.x = ballState.x; cap.y = ballState.y;
            cap.vx = ballState.vx; cap.vy = ballState.vy;
            turn = ballState.turn;
            updateHUDTurn();
        }
    }
});

// ============================================================
// TAKIM SEÇİM POP-UP
// ============================================================
function openTeamSelectPopup() {
    console.log('🏆 Takım seçim pop-up açılıyor...');
    const popup = document.getElementById('team-select-popup');
    const grid = document.getElementById('team-select-grid');
    const shieldImg = document.getElementById('popup-selected-team-img');
    
    if (!popup || !grid) { console.error("Pop-up veya Grid bulunamadı!"); return; }

    popup.style.display = 'block';
    popup.style.visibility = 'visible';
    popup.style.opacity = '1';

    if (shieldImg) {
        if (selectedTeamLogo && selectedTeamLogo !== 'default.png') {
            shieldImg.src = 'takimlar/' + selectedTeamLogo;
            shieldImg.style.display = 'block';
        } else {
            const defaultTeam = teamLogos[0];
            if (defaultTeam) {
                selectedTeamLogo = defaultTeam.file;
                shieldImg.src = 'takimlar/' + defaultTeam.file;
                shieldImg.style.display = 'block';
            }
        }
    }

    grid.innerHTML = '';
    teamLogos.forEach((team) => {
        const btn = document.createElement('div');
        btn.className = 'big-team-logo-btn';
        if (selectedTeamLogo === team.file) btn.classList.add('active');
        
        const img = document.createElement('img');
        img.src = 'takimlar/' + team.file;
        img.alt = team.name;
        img.onerror = function() { this.src = 'takimlar/default.png'; };
        btn.appendChild(img);
        
        btn.onclick = function(e) {
            e.stopPropagation();
            document.querySelectorAll('.big-team-logo-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            selectedTeamLogo = team.file;
            console.log('🏆 Takım seçildi:', team.file);
            
            if (shieldImg) {
                shieldImg.src = 'takimlar/' + team.file;
                shieldImg.style.display = 'block';
            }
            const menuOverlay = document.getElementById('selected-team-logo-display');
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
    });
}

function closeTeamSelectPopup() {
    console.log('🏆 Takım seçim pop-up kapatılıyor...');
    const popup = document.getElementById('team-select-popup');
    if (popup) {
        popup.style.display = 'none';
        popup.style.visibility = 'hidden';
        popup.style.opacity = '0';
    }
    updateTeamLogoDisplay();
    updateSelectedTeamName();
}

// ============================================================
// GİRİŞ/KAYIT MODALI - TAKIM LOGO FONKSİYONLARI
// ============================================================

function loadAuthTeamLogos() {
    console.log('🔄 loadAuthTeamLogos çağrıldı');
    const regGrid = document.getElementById('reg-team-logo-grid');
    if (!regGrid) {
        console.warn('⚠️ reg-team-logo-grid bulunamadı!');
        return;
    }
    
    regGrid.innerHTML = '';
    
    teamLogos.forEach((logo) => {
        const btn = document.createElement('button');
        btn.className = 'team-logo-btn';
        btn.dataset.logo = logo.file;
        btn.title = logo.name;
        
        const img = document.createElement('img');
        img.src = `takimlar/${logo.file}`;
        img.alt = logo.name;
        img.onerror = function() { this.src = 'takimlar/default.png'; };
        
        btn.appendChild(img);
        
        btn.onclick = function(e) {
            e.stopPropagation();
            regGrid.querySelectorAll('.team-logo-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const preview = document.getElementById('reg-uploaded-logo-preview');
            if (preview) {
                preview.src = `takimlar/${logo.file}`;
                preview.style.borderColor = '#2ecc71';
                preview.dataset.uploadedUrl = '';
            }
            
            console.log('🏆 Hazır logo seçildi:', logo.file);
        };
        
        regGrid.appendChild(btn);
    });
    
    console.log('✅ Kayıt formu logoları yüklendi,', teamLogos.length, 'adet');
}

function setupLogoUpload() {
    console.log('🔄 setupLogoUpload çağrıldı');
    const input = document.getElementById('reg-logo-upload');
    const preview = document.getElementById('reg-uploaded-logo-preview');
    
    if (!input || !preview) {
        console.warn('⚠️ Logo input veya preview bulunamadı!');
        return;
    }
    
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        console.log('📁 Dosya seçildi:', file.name, file.size, 'bytes');
        
        if (file.size > 2 * 1024 * 1024) {
            alert('⚠️ Logo dosyası 2MB\'dan büyük olamaz!');
            this.value = '';
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                canvas.width = 100;
                canvas.height = 100;
                const ctx = canvas.getContext('2d');
                
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, 100, 100);
                
                const size = Math.min(img.width, img.height);
                const offsetX = (img.width - size) / 2;
                const offsetY = (img.height - size) / 2;
                ctx.drawImage(img, offsetX, offsetY, size, size, 0, 0, 100, 100);
                
                const resizedDataUrl = canvas.toDataURL('image/png');
                
                preview.src = resizedDataUrl;
                preview.style.borderColor = '#2ecc71';
                preview.dataset.uploadedUrl = 'uploaded';
                
                const grid = document.getElementById('reg-team-logo-grid');
                if (grid) {
                    grid.querySelectorAll('.team-logo-btn').forEach(b => b.classList.remove('active'));
                }
                
                console.log('✅ Logo 100x100 boyutlandırıldı ve önizlendi');
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    };
}

// ============================================================
// GET SELECTED TEAM LOGO - GÜNCELLENDİ
// ============================================================

function getSelectedTeamLogo() {
    console.log('🔄 getSelectedTeamLogo çağrıldı');
    
    // 1. Önce hazır logolardan seçili olanı kontrol et
    const grid = document.getElementById('reg-team-logo-grid');
    if (grid) {
        const activeBtn = grid.querySelector('.team-logo-btn.active');
        if (activeBtn) {
            const logo = activeBtn.dataset.logo;
            console.log('🏆 Hazır logo seçili (dosya):', logo);
            return logo; // DOSYA ADI DÖNDÜR (base64 değil)
        }
    }
    
    // 2. Yüklenen logoyu kontrol et (base64)
    const preview = document.getElementById('reg-uploaded-logo-preview');
    if (preview && preview.src && !preview.src.includes('default.png')) {
        console.log('📷 Yüklenen logo var (base64)');
        // Base64 verisini URL'den çıkar, sadece dosya adı olarak kaydetmek için
        // Bu durumda default kullan - base64 çok büyük
        return 'default.png';
    }
    
    // 3. Varsayılan
    console.log('⚠️ Varsayılan logo kullanılacak');
    return 'default.png';
}

// ============================================================
// SELECT LOCAL TEAM (2 KİŞİLİK) - GÜNCELLENDİ
// ============================================================

function selectLocalTeam(player, logoFile) {
    console.log(`👤 Oyuncu ${player} takım seçti:`, logoFile);
    
    if (player === 1) {
        if (logoFile === localPlayer2Logo && localP2Selected) {
            alert('⚠️ Oyuncu 2 zaten bu takımı seçti! Farklı bir takım seçin.');
            return;
        }
        
        localPlayer1Logo = logoFile;
        localP1Selected = true;
        
        document.querySelectorAll('#local-player1-logos .team-logo-btn').forEach(btn => {
            btn.classList.remove('active', 'active-p1');
            if (btn.dataset.logo === logoFile) {
                btn.classList.add('active', 'active-p1');
            }
        });
        
        const shield = document.getElementById('local-p1-shield-img');
        if (shield) {
            shield.src = `takimlar/${logoFile}`;
            shield.style.display = 'block';
            shield.onerror = function() { this.src = 'takimlar/default.png'; };
        }
        
        const nameEl = document.getElementById('local-p1-name');
        if (nameEl) {
            const logo = teamLogos.find(l => l.file === logoFile);
            nameEl.textContent = logo ? `👤 ${logo.name.replace('⚽ ', '')}` : '👤 Seçildi';
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
        
        document.querySelectorAll('#local-player2-logos .team-logo-btn').forEach(btn => {
            btn.classList.remove('active', 'active-p2');
            if (btn.dataset.logo === logoFile) {
                btn.classList.add('active', 'active-p2');
            }
        });
        
        const shield = document.getElementById('local-p2-shield-img');
        if (shield) {
            shield.src = `takimlar/${logoFile}`;
            shield.style.display = 'block';
            shield.onerror = function() { this.src = 'takimlar/default.png'; };
        }
        
        const nameEl = document.getElementById('local-p2-name');
        if (nameEl) {
            const logo = teamLogos.find(l => l.file === logoFile);
            nameEl.textContent = logo ? `👤 ${logo.name.replace('⚽ ', '')}` : '👤 Seçildi';
            nameEl.style.color = '#e74c3c';
            nameEl.style.opacity = '1';
        }
    }
}

// ============================================================
// AUTH FORM SWITCH
// ============================================================

function switchAuthTab(tab) {
    console.log('🔄 switchAuthTab çağrıldı:', tab);
    
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');
    const formForgot = document.getElementById('form-forgot');
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    
    if (!formLogin || !formRegister || !formForgot) {
        console.warn('⚠️ Formlar bulunamadı!');
        return;
    }
    
    formLogin.classList.add('hidden');
    formRegister.classList.add('hidden');
    formForgot.classList.add('hidden');
    
    if (tabLogin) tabLogin.classList.remove('active');
    if (tabRegister) tabRegister.classList.remove('active');
    
    if (tab === 'login') {
        formLogin.classList.remove('hidden');
        if (tabLogin) tabLogin.classList.add('active');
        console.log('✅ Giriş formu gösteriliyor');
    } else if (tab === 'register') {
        formRegister.classList.remove('hidden');
        if (tabRegister) tabRegister.classList.add('active');
        console.log('✅ Kayıt formu gösteriliyor');
        setTimeout(() => {
            loadAuthTeamLogos();
        }, 100);
    } else if (tab === 'forgot') {
        formForgot.classList.remove('hidden');
        console.log('✅ Şifre sıfırlama formu gösteriliyor');
    }
}

// ============================================================
// AUTH FORM GÖNDERME
// ============================================================

function handleAuthSubmit(event, action) {
    event.preventDefault();
    console.log('📤 handleAuthSubmit çağrıldı:', action);
    
    if (!socket || !socket.connected) {
        alert("Sunucu bağlantısı kurulamadı. Lütfen sayfayı yenileyin.");
        return;
    }
    
    if (action === 'login') {
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value.trim();
        
        console.log('📤 Giriş yapılıyor:', email);
        
        if (!email || !password) {
            alert('⚠️ E-posta ve şifre girin!');
            return;
        }
        
        socket.emit('loginUser', { email, password });
        
    } else if (action === 'register') {
        const username = document.getElementById('reg-username').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const password = document.getElementById('reg-password').value.trim();
        const teamName = document.getElementById('reg-team-name').value.trim();
        const teamLogo = getSelectedTeamLogo();
        
        console.log('📤 Kayıt yapılıyor:', { username, email, teamName });
        
        if (!username || username.length < 2) {
            alert('⚠️ Oyuncu adı en az 2 karakter olmalı!');
            return;
        }
        if (!email || !email.includes('@')) {
            alert('⚠️ Geçerli bir e-posta adresi girin!');
            return;
        }
        if (!password || password.length < 4) {
            alert('⚠️ Şifre en az 4 karakter olmalı!');
            return;
        }
        
        socket.emit('registerUser', { 
            username, 
            email, 
            password, 
            teamName, 
            teamLogo 
        });
        
    } else if (action === 'forgot') {
        const email = document.getElementById('forgot-email').value.trim();
        console.log('📤 Şifre sıfırlama isteği:', email);
        
        if (!email) {
            alert('⚠️ E-posta adresinizi girin!');
            return;
        }
        socket.emit('forgotPassword', { email });
    }
}

// ============================================================
// MİSAFİR GİRİŞİ
// ============================================================

function continueAsGuest() {
    console.log('🎮 Misafir girişi başlatılıyor...');
    
    const authOverlay = document.getElementById('auth-modal-overlay');
    if (authOverlay) {
        authOverlay.style.display = 'none';
        authOverlay.classList.add('hidden');
    }
    
    const menu = document.getElementById('menu');
    if (menu) {
        menu.style.display = 'block';
    }
    
    const playerNameInput = document.getElementById('player-name');
    if (playerNameInput) {
        const randomName = "Misafir_" + Math.floor(Math.random() * 10000);
        playerNameInput.value = randomName;
    }
    
    selectRandomTeam();
    updateTeamLogoDisplay();
    updateSelectedTeamName();
    updateScoreLogos();
    loadTeamLogoImage(selectedTeamLogo);
    selectRandomAITeam();
    
    console.log('✅ Misafir girişi başarılı!');
}

// ============================================================
// SES FONKSİYONLARI
// ============================================================
let isSoundOn = true;

function toggleSound() {
    console.log('🔊 Ses butonuna tıklandı! Mevcut durum:', isSoundOn ? 'AÇIK' : 'KAPALI');
    isSoundOn = !isSoundOn;
    const soundBtn = document.getElementById('sound-toggle-btn');
    if (soundBtn) {
        if (isSoundOn) {
            soundBtn.src = 'menu/ayarlar/ses.webp';
            console.log('🔊 Ses AÇIK');
        } else {
            soundBtn.src = 'menu/ayarlar/ses-off.webp';
            console.log('🔇 Ses KAPALI');
        }
    }
    localStorage.setItem('soundEnabled', isSoundOn ? 'true' : 'false');
}

function playSound(type) {
    if (!isSoundOn) return;
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    if (type === 'hit') {
        try {
            const hitSound = new Audio('sesler/Carpma.mp3');
            hitSound.volume = 0.5;
            hitSound.play().catch(() => {});
        } catch (e) {}
        return;
    }
    if (type === 'kick') {
        try {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            const now = audioCtx.currentTime;
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        } catch (error) {}
    }
}

// ============================================================
// LOBBY UI GÜNCELLEME
// ============================================================
let onlinePlayers = [];

function updateLobbyUI() {
    console.log('🔄 Lobby UI güncelleniyor');
    
    const listContainer = document.getElementById('lobby-list');
    if (!listContainer) return;
    
    if (!onlinePlayers || onlinePlayers.length === 0) {
        listContainer.innerHTML = `
            <div style="padding:20px;color:rgba(255,255,255,0.4);text-align:center;">
                <div style="font-size:30px;margin-bottom:8px;">👤</div>
                Havuzda oyuncu yok
            </div>
        `;
        return;
    }
    
    let html = '';
    for (let i = 0; i < onlinePlayers.length; i++) {
        let p = onlinePlayers[i];
        let isMe = (p.id === socket.id);
        
        html += `
            <div class="player-item" style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.05);${isMe ? 'background:rgba(46,204,113,0.05);' : ''}">
                <span style="display:flex;align-items:center;gap:10px;font-size:13px;color:${isMe ? '#2ecc71' : 'rgba(255,255,255,0.8)'};">
                    <img src="takimlar/${p.logo || 'default.png'}" 
                         style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:1px solid ${isMe ? 'rgba(46,204,113,0.3)' : 'rgba(255,255,255,0.1)'};"
                         onerror="this.src='takimlar/default.png'">
                    ${p.name} ${isMe ? '(Sen)' : ''}
                </span>
                ${!isMe ? `
                    <button onclick="sendInvite('${p.id}')" 
                            style="background:rgba(46,204,113,0.15);color:#2ecc71;border:1px solid rgba(46,204,113,0.1);padding:4px 14px;border-radius:16px;font-size:10px;cursor:pointer;font-family:inherit;transition:all 0.2s ease;">
                        Davet Et
                    </button>
                ` : ''}
            </div>
        `;
    }
    
    listContainer.innerHTML = html;
}

function sendInvite(targetId) {
    if (!socket) {
        alert('Bağlantı yok!');
        return;
    }
    
    console.log('📨 Davet gönderiliyor:', targetId);
    socket.emit("send-invite", targetId);
    
    document.querySelectorAll('.player-item button').forEach(btn => {
        if (btn.textContent === 'Davet Et') {
            btn.textContent = '⏳ Bekleniyor...';
            btn.style.background = 'rgba(230, 126, 34, 0.2)';
            btn.style.color = '#f1c40f';
            btn.disabled = true;
        }
    });
}

// ============================================================
// 2 KİŞİLİK MOD - SÜRE AYARLARI
// ============================================================
function setLocalMatchDuration(seconds) {
    console.log('⏱️ 2 Kişilik Maç Süresi Seçildi:', seconds, 'sn');
    MATCH_DURATION = seconds;
    document.querySelectorAll('.local-time-btn[data-time]').forEach(btn => {
        btn.classList.remove('active');
        if (parseInt(btn.dataset.time) === seconds) {
            btn.classList.add('active');
        }
    });
    if (currentPhase === 'playing' || currentPhase === 'setup') {
        matchSecondsLeft = seconds;
        const timeBoard = document.getElementById('time-board');
        if (timeBoard) {
            timeBoard.innerText = seconds + 's';
        }
    }
}

function setLocalShotDuration(seconds) {
    console.log('🎯 2 Kişilik Vuruş Süresi Seçildi:', seconds, 'sn');
    SHOT_DURATION = seconds;
    document.querySelectorAll('.local-time-btn[data-shot]').forEach(btn => {
        btn.classList.remove('active');
        if (parseInt(btn.dataset.shot) === seconds) {
            btn.classList.add('active');
        }
    });
    if (currentPhase === 'playing') {
        const shotTimer = document.getElementById('shot-timer');
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
// GOL ANİMASYONU TRIGGER
// ============================================================
function triggerGoalAnimation() {
    goalAnimation = {
        scale: 0,
        alpha: 1,
        blinkCount: 0,
        type: goalImage ? 'image' : 'text'
    };
    goalAnimationStartTime = Date.now();
    
    if (typeof isSoundOn === 'undefined' || isSoundOn) {
        try {
            if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            goalSound.currentTime = 0;
            goalSound.volume = 1.0;
            goalSound.play().catch(error => {});
        } catch (e) {}
    }
}

// ============================================================
// BAŞLANGIÇ
// ============================================================
drawFieldLinesOnly();
console.log("🎮 Çivili Futbol Başlatıldı!");
console.log("⏱️ Maç Süresi: " + MATCH_DURATION + " saniye");
console.log("🎯 Vuruş Süresi: " + SHOT_DURATION + " saniye");
startPeriodicSync();

document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 DOM yüklendi, başlangıç işlemleri...');
    
    selectRandomTeam();
    updateSelectedTeamName();
    updateTeamLogoDisplay();
    updateScoreLogos();
    loadTeamLogoImage(selectedTeamLogo);
    selectRandomAITeam();
    
    console.log('🔄 Logo fonksiyonları başlatılıyor...');
    loadAuthTeamLogos();
    setupLogoUpload();
    
    console.log('✅ Sayfa yüklendi!');
});
