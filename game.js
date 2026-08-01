// ============================================================
// SABİT SÜRELER
// ============================================================
let MATCH_DURATION = 90;
let SHOT_DURATION = 5;

// ============================================================
// SOCKET BAĞLANTISI - GÜNCELLENMİŞ
// ============================================================
let socket = null;
let currentRoomId = null;
let myTeamNumber = 1;
let isHost = false;
let onlinePlayers = [];
let isOnlineMatch = false;
let opponentPinsData = [];
let opponentLogoData = 'default.png';

if (typeof io !== 'undefined') {
    try {
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
            // Lobby'ye otomatik katılma yok, manuel
        });
        
        socket.on('connect_error', (error) => console.warn('⚠️ Bağlantı hatası:', error));
        socket.on('disconnect', () => console.warn('⚠️ Bağlantı kesildi'));

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
            
            // Rakip logosunu yükle
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
                if (diff > 30) {
                    cap.x = ballState.x; cap.y = ballState.y;
                    cap.vx = ballState.vx; cap.vy = ballState.vy;
                    turn = ballState.turn;
                    updateHUDTurn();
                }
            }
        });

        // ============================================================
        // AUTH CEVAPLARI
        // ============================================================
        
socket.on('authResponse', (data) => {
    alert(data.message);
    if (data.success) {
        if (data.username) {
            const playerNameInput = document.getElementById('player-name');
            if (playerNameInput) playerNameInput.value = data.username;
        }
        if (data.action === 'login' || data.action === 'register') {
            // Giriş modülünü gizle
            const authOverlay = document.getElementById('auth-modal-overlay');
            if (authOverlay) {
                authOverlay.style.display = 'none'; // CSS class yerine direkt style güncelleyin
                authOverlay.classList.add('hidden');
            }
            
            // Ana menüyü görünür yap
            const menu = document.getElementById('menu');
            if (menu) {
                menu.style.display = 'block';
            }
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

// SAHA ÖLÇÜLERİ (cap tanımlandıktan sonra)
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
// SES EFEKTLERİ (iOS Safari Uyumlu)
// ============================================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// Gol sesini global olarak tek bir nesnede saklıyoruz
const goalSound = new Audio('sesler/gol.mp3');
goalSound.preload = 'auto';

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
    
    if (typeof isSoundOn === 'undefined' || isSoundOn) {
        try {
            if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            goalSound.currentTime = 0;
            goalSound.volume = 1.0;
            const playPromise = goalSound.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
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
        ctx.drawImage(img, -size + 2, -size + 2, size * 2 - 4, size * 2 - 4);
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

    if (currentPhase === 'playing' && isDraggingBall) {
        const dx = dragStart.x - dragCurrent.x;
        const dy = dragStart.y - dragCurrent.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist > 10) {
            ctx.save();
            ctx.strokeStyle = 'rgba(240, 248, 255, 0.6)';
            ctx.lineWidth = 6;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.moveTo(cap.x, cap.y);
            const normX = dx / dist;
            const normY = dy / dist;
            const len = Math.min(dist * 1.2, MAX_DRAG_DIST);
            const endX = cap.x + normX * len;
            const endY = cap.y + normY * len;
            ctx.lineTo(endX, endY);
            ctx.stroke();
            ctx.setLineDash([]);
            const arrowSize = 10;
            const angle = Math.atan2(dy, dx);
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
    
    // ... (AI güç hesaplamaları aynı kalacak) ...
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

    // AI Vuruşu
    setTimeout(() => {
        const force = pullDistance * 0.15;
        cap.vx = Math.cos(angle) * force;
        cap.vy = Math.sin(angle) * force;
        isAiThinking = false;
        
        // ---- BURASI DEĞİŞTİRİLDİ ----
        // AI vuruşunu yaptı, top hareket ediyor. 
        // Sırayı direkt olarak Oyuncu 1'e (insana) veriyoruz.
        if (gameMode === 'ai' && currentPhase === 'playing') {
            turn = 1; 
            updateHUDTurn();
            resetShotTimer();
        }
        // ----------------------------
        
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
    if (!socket) { 
        alert("Şu anda bir sunucuya bağlı değilsiniz!"); 
        return; 
    }
    gameMode = 'online';
    const playerData = getPlayerData();
    socket.emit("join-lobby", playerData);
    document.getElementById('menu').style.display = 'none';
    document.getElementById('online-lobby').style.display = 'flex';
}

function closeOnlineLobby() {
    if (socket) socket.emit("leave-lobby");
    document.getElementById('online-lobby').style.display = 'none';
    document.getElementById('menu').style.display = 'block';
}
function startOnlineMatch() {
    console.log('🎮 Online maç başlıyor... Takım:', myTeamNumber);
    isOnlineMatch = true;
    
    document.getElementById('top-bar').style.display = 'flex';
    matchSecondsLeft = MATCH_DURATION;
    document.getElementById('time-board').innerText = matchSecondsLeft + 's';
    
    showField();
    
    if (opponentLogoData) {
        aiTeamLogo = opponentLogoData;
        loadTeamLogoImage(opponentLogoData);
    }
    
    setTimeout(() => {
        updateScoreLogos();
    }, 100);
    
    startSetupPhase();
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
    }
    
    // Eğer sıra AI'da ise süreyi gösterme (AI anında vuruyor, süre beklemez)
    if (gameMode === 'ai' && turn === 2) {
        if (shotTimer) shotTimer.style.display = 'none';
        return;
    } else {
        if (shotTimer) shotTimer.style.display = 'block';
    }

    shotTimerInterval = setInterval(() => {
        if (currentPhase === 'playing' && Math.hypot(cap.vx, cap.vy) <= 0.2) {
            shotSecondsLeft--;
            const shotTimer = document.getElementById('shot-timer');
            if (shotTimer) {
                shotTimer.innerText = `ŞUT: ${shotSecondsLeft}s`;
                if (shotSecondsLeft <= 1) shotTimer.classList.add('warning');
                else shotTimer.classList.remove('warning');
            }
            
            // VURUŞ SÜRESİ BİTTİĞİNDE BURASI DEVREDE:
            if (shotSecondsLeft <= 0) {
                clearInterval(shotTimerInterval);
                if (shotTimer) shotTimer.classList.remove('warning');
                
                // Sıra süre bittiği için karşıya geçer:
                turn = (turn === 1) ? 2 : 1; 
                updateHUDTurn();
                resetShotTimer(); // Yeni süreyi başlat
                
                // Eğer yeni sıra AI'ya geldiyse direkt AI'yı oynat
                if (gameMode === 'ai' && turn === 2) {
                    setTimeout(() => runAIMove(), 300); // 300ms bekle, AI vursun
                }
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

function getLocalPlayerName(playerNumber) {
    if (playerNumber === 1) {
        if (localPlayer1Logo) {
            const logo = teamLogos.find(l => l.file === localPlayer1Logo);
            return logo ? `Oyuncu 1 (${logo.name.replace('⚽ ', '')})` : 'Oyuncu 1';
        }
        return 'Oyuncu 1';
    } else {
        if (localPlayer2Logo) {
            const logo = teamLogos.find(l => l.file === localPlayer2Logo);
            return logo ? `Oyuncu 2 (${logo.name.replace('⚽ ', '')})` : 'Oyuncu 2';
        }
        return 'Oyuncu 2';
    }
}

function applyShotPhysics(shotData) {
    cap.vx = 0; cap.vy = 0;
    const dx = shotData.startX - shotData.endX;
    const dy = shotData.startY - shotData.endY;
    cap.vx = dx * 0.13; cap.vy = dy * 0.13;
    playSound('kick');
}

function broadcastMyPinMove(pin) {
    if (!socket || gameMode !== 'online' || currentPhase !== 'setup') return;
    let index = -1;
    let count = 0;
    for (let p of pins) {
        if (!p.isPost && p.team === myTeamNumber) {
            if (p === pin) { index = count; break; }
            count++;
        }
    }
    if (index !== -1) {
        console.log('📤 Pin hareketi gönderiliyor:', { team: myTeamNumber, index, x: pin.x, y: pin.y });
        socket.emit("sync-pin-move", { roomId: currentRoomId, team: myTeamNumber, index: index, x: pin.x, y: pin.y });
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
    const SUB_STEPS = 16;
    for (let step = 0; step < SUB_STEPS; step++) {
        cap.x += cap.vx / SUB_STEPS;
        cap.y += cap.vy / SUB_STEPS;
        if (cap.x - cap.radius < 0) { cap.x = cap.radius; cap.vx *= -0.85; playSound('hit'); }
        if (cap.x + cap.radius > width) { cap.x = width - cap.radius; cap.vx *= -0.85; playSound('hit'); }
        if (cap.y - cap.radius <= goalHeight) {
            const goalLeft = (width - goalWidth) / 2;
            const goalRight = (width + goalWidth) / 2;
            if (cap.x > goalLeft && cap.x < goalRight) {
                if (gameMode === 'online') {
                    if (myTeamNumber === 1) { score.p1++; document.getElementById('score-p1').innerText = score.p1; }
                    else { score.p2++; document.getElementById('score-p2').innerText = score.p2; }
                } else { score.p1++; document.getElementById('score-p1').innerText = score.p1; }
                triggerGoalAnimation();
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
            const goalLeft = (width - goalWidth) / 2;
            const goalRight = (width + goalWidth) / 2;
            if (cap.x > goalLeft && cap.x < goalRight) {
                if (gameMode === 'online') {
                    if (myTeamNumber === 2) { score.p2++; document.getElementById('score-p2').innerText = score.p2; }
                    else { score.p1++; document.getElementById('score-p1').innerText = score.p1; }
                } else { score.p2++; document.getElementById('score-p2').innerText = score.p2; }
                triggerGoalAnimation();
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
        pins.forEach(pin => {
            const dist = Math.hypot(cap.x - pin.x, cap.y - pin.y);
            const minDist = cap.radius + (pin.isPost ? 4 : 8);
            if (dist < minDist) {
                playSound('hit');
                const angle = Math.atan2(cap.y - pin.y, cap.x - pin.x);
                cap.x = pin.x + Math.cos(angle) * minDist;
                cap.y = pin.y + Math.sin(angle) * minDist;
                const hitSpeed = Math.hypot(cap.vx, cap.vy);
                cap.vx = Math.cos(angle) * Math.max(hitSpeed, 1.5) * 0.85;
                cap.vy = Math.sin(angle) * Math.max(hitSpeed, 1.5) * 0.85;
            }
        });
    }
    cap.vx *= cap.friction;
    cap.vy *= cap.friction;
    const isMoving = Math.hypot(cap.vx, cap.vy) > 0.15;
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
    syncInterval = setInterval(() => {
        if (gameMode === 'online' && currentPhase === 'playing' && socket) {
            const speed = Math.hypot(cap.vx, cap.vy);
            if (speed < 0.5) {
                socket.emit('syncBallPosition', {
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
        cap.vx = (startX - endX) * 0.13;
        cap.vy = (startY - endY) * 0.13;
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
            // Online: Takım 1 logosu
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
            // Online: Takım 2 logosu
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
// 2 KİŞİLİK AYNI EKRAN - TAKIM SEÇ (DÜZELTİLMİŞ)
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
    
    // Seçimleri sıfırla
    localP1Selected = false;
    localP2Selected = false;
    localPlayer1Logo = '';
    localPlayer2Logo = '';
    
    // İsim etiketlerini sıfırla
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
    
    // Shield'ları temizle
    const shield1 = document.getElementById('local-p1-shield-img');
    const shield2 = document.getElementById('local-p2-shield-img');
    if (shield1) { shield1.style.display = 'none'; shield1.src = ''; }
    if (shield2) { shield2.style.display = 'none'; shield2.src = ''; }
    
    // Logoları yükle
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
    
    console.log('🔄 Logolar yükleniyor... Container1:', !!container1, 'Container2:', !!container2);
    
    if (!container1 || !container2) {
        console.warn('⚠️ Logo containerları bulunamadı!');
        return;
    }
    
    // Container'ları temizle
    container1.innerHTML = '';
    container2.innerHTML = '';
    
    // Her takım logosu için buton oluştur
    teamLogos.forEach((logo) => {
        // === Oyuncu 1 için buton ===
        const btn1 = document.createElement('button');
        btn1.className = 'team-logo-btn';
        btn1.title = logo.name;
        btn1.dataset.logo = logo.file;
        
        const img1 = document.createElement('img');
        img1.src = `takimlar/${logo.file}`;
        img1.alt = logo.name;
        img1.onerror = function() { 
            console.warn('⚠️ Logo yüklenemedi:', logo.file);
            this.src = 'takimlar/default.png'; 
        };
        btn1.appendChild(img1);
        
        btn1.onclick = function(e) {
            e.stopPropagation();
            selectLocalTeam(1, logo.file);
        };
        container1.appendChild(btn1);
        
        // === Oyuncu 2 için buton ===
        const btn2 = document.createElement('button');
        btn2.className = 'team-logo-btn';
        btn2.title = logo.name;
        btn2.dataset.logo = logo.file;
        
        const img2 = document.createElement('img');
        img2.src = `takimlar/${logo.file}`;
        img2.alt = logo.name;
        img2.onerror = function() { 
            console.warn('⚠️ Logo yüklenemedi:', logo.file);
            this.src = 'takimlar/default.png'; 
        };
        btn2.appendChild(img2);
        
        btn2.onclick = function(e) {
            e.stopPropagation();
            selectLocalTeam(2, logo.file);
        };
        container2.appendChild(btn2);
    });
    
    console.log(`✅ ${teamLogos.length} logo yüklendi (Oyuncu 1: ${container1.children.length}, Oyuncu 2: ${container2.children.length})`);
}

function selectLocalTeam(player, logoFile) {
    console.log(`👤 Oyuncu ${player} takım seçti:`, logoFile);
    
    if (player === 1) {
        // Aynı takım kontrolü
        if (logoFile === localPlayer2Logo && localP2Selected) {
            alert('⚠️ Oyuncu 2 zaten bu takımı seçti! Farklı bir takım seçin.');
            return;
        }
        
        localPlayer1Logo = logoFile;
        localP1Selected = true;
        
        // Butonları işaretle
        document.querySelectorAll('#local-player1-logos .team-logo-btn').forEach(btn => {
            btn.classList.remove('active', 'active-p1');
            if (btn.dataset.logo === logoFile) {
                btn.classList.add('active', 'active-p1');
            }
        });
        
        // Shield'ı güncelle
        const shield = document.getElementById('local-p1-shield-img');
        if (shield) {
            shield.src = `takimlar/${logoFile}`;
            shield.style.display = 'block';
            shield.onerror = function() { this.src = 'takimlar/default.png'; };
        }
        
        // İsmi güncelle
        const nameEl = document.getElementById('local-p1-name');
        if (nameEl) {
            const logo = teamLogos.find(l => l.file === logoFile);
            nameEl.textContent = logo ? `👤 ${logo.name.replace('⚽ ', '')}` : '👤 Seçildi';
            nameEl.style.color = '#3498db';
            nameEl.style.opacity = '1';
        }
        
    } else if (player === 2) {
        // Aynı takım kontrolü
        if (logoFile === localPlayer1Logo && localP1Selected) {
            alert('⚠️ Oyuncu 1 zaten bu takımı seçti! Farklı bir takım seçin.');
            return;
        }
        
        localPlayer2Logo = logoFile;
        localP2Selected = true;
        
        // Butonları işaretle
        document.querySelectorAll('#local-player2-logos .team-logo-btn').forEach(btn => {
            btn.classList.remove('active', 'active-p2');
            if (btn.dataset.logo === logoFile) {
                btn.classList.add('active', 'active-p2');
            }
        });
        
        // Shield'ı güncelle
        const shield = document.getElementById('local-p2-shield-img');
        if (shield) {
            shield.src = `takimlar/${logoFile}`;
            shield.style.display = 'block';
            shield.onerror = function() { this.src = 'takimlar/default.png'; };
        }
        
        // İsmi güncelle
        const nameEl = document.getElementById('local-p2-name');
        if (nameEl) {
            const logo = teamLogos.find(l => l.file === logoFile);
            nameEl.textContent = logo ? `👤 ${logo.name.replace('⚽ ', '')}` : '👤 Seçildi';
            nameEl.style.color = '#e74c3c';
            nameEl.style.opacity = '1';
        }
    }
    
    // Seçim durumunu kontrol et
    console.log(`📊 Seçim durumu: P1=${localP1Selected ? localPlayer1Logo : '❌'}, P2=${localP2Selected ? localPlayer2Logo : '❌'}`);
}

function startLocalGameWithTeams() {
    console.log('🚀 2 Kişilik maç başlatılıyor...');
    
    // ---- YENİ KONTROL: Varsayılan süreleri ata (eğer seçilmediyse) ----
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
// SOCKET OLAY DİNLEYİCİLERİ
// ============================================================
function getPlayerData() {
    const name = document.getElementById('player-name').value.trim();
    return {
        name: name,
        logo: selectedTeamLogo || 'default.png'
    };
}

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
    socket.on("opponent-disconnected", () => { alert("Rakip oyundan ayrıldı."); exitToMenu(); });
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

function joinOnlineGame() {
    if (!socket || !socket.connected) {
        alert("Şu anda bir sunucuya bağlı değilsiniz! Lütfen birkaç saniye bekleyip tekrar deneyin.");
        return;
    }
    const currentUsername = (playerProfile && playerProfile.username) 
                            ? playerProfile.username 
                            : "Oyuncu_" + Math.floor(Math.random() * 1000);
       socket.emit("registerPlayer", {
        username: currentUsername,
        teamLogo: selectedTeamLogo || "default.png"
    });
    showLobbyScreen(); 
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
    selectRandomTeam();
    updateSelectedTeamName();
    updateTeamLogoDisplay();
    updateScoreLogos();
    loadTeamLogoImage(selectedTeamLogo);
    selectRandomAITeam();
    console.log('✅ Sayfa yüklendi!');
});

// ============================================================
// SES AÇ/KAPA FONKSİYONLARI
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
            setTimeout(() => playButtonSound(), 100);
        } else {
            soundBtn.src = 'menu/ayarlar/ses-off.webp';
            console.log('🔇 Ses KAPALI');
        }
    }
    localStorage.setItem('soundEnabled', isSoundOn ? 'true' : 'false');
}

function loadSoundSettings() {
    const savedSound = localStorage.getItem('soundEnabled');
    if (savedSound !== null) {
        isSoundOn = savedSound === 'true';
        const soundBtn = document.getElementById('sound-toggle-btn');
        if (soundBtn) {
            soundBtn.src = isSoundOn ? 'menu/ayarlar/ses.webp' : 'menu/ayarlar/ses-off.webp';
        }
        console.log('🔊 Ses durumu yüklendi:', isSoundOn ? 'AÇIK' : 'KAPALI');
    }
}

// ============================================================
// MP3 SES DOSYALARI - iOS Safari İçin Özel
// ============================================================
let audioElements = {
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
                audioElements.hit.play().catch(() => {
                    const newHit = new Audio('sesler/Carpma.mp3');
                    newHit.play().catch(e => console.log('Hit ses hatası:', e));
                });
            }
        } catch (e) {
            console.log('Hit ses hatası:', e);
        }
        return;
    }
    if (type === 'goal') {
        try {
            const goalSound = new Audio('sesler/gol.mp3');
            goalSound.preload = 'auto';
            goalSound.volume = 1.0;
            const playPromise = goalSound.play();
            if (playPromise !== undefined) {
                playPromise.catch(() => {
                    try {
                        const osc = audioCtx.createOscillator();
                        const gain = audioCtx.createGain();
                        osc.connect(gain);
                        gain.connect(audioCtx.destination);
                        const now = audioCtx.currentTime;
                        osc.type = 'sawtooth';
                        osc.frequency.setValueAtTime(200, now);
                        osc.frequency.linearRampToValueAtTime(600, now + 0.4);
                        gain.gain.setValueAtTime(0.2, now);
                        gain.gain.linearRampToValueAtTime(0, now + 0.45);
                        osc.start(now);
                        osc.stop(now + 0.45);
                    } catch (e) {}
                });
            }
        } catch (error) {
            try {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                const now = audioCtx.currentTime;
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
        } catch (error) {
            console.error('❌ Vuruş sesi hatası:', error);
        }
    }
}

// ============================================================
// 2 KİŞİLİK AYNI EKRAN - TAKIM SEÇ (DEVAM)
// ============================================================
function openLocalTeamSelect() {
    console.log('👥 2 Kişilik takım seç açılıyor...');
    const popup = document.getElementById('local-team-select');
    if (!popup) {
        console.error('❌ local-team-select pop-up bulunamadı!');
        return;
    }
    popup.style.display = 'flex';
    localP1Selected = false;
    localP2Selected = false;
    localPlayer1Logo = '';
    localPlayer2Logo = '';
    const p1Name = document.getElementById('local-p1-name');
    const p2Name = document.getElementById('local-p2-name');
    if (p1Name) { p1Name.textContent = 'Oyuncu 1'; p1Name.style.color = '#3498db'; }
    if (p2Name) { p2Name.textContent = 'Oyuncu 2'; p2Name.style.color = '#e74c3c'; }
    const shield1 = document.getElementById('local-p1-shield-img');
    const shield2 = document.getElementById('local-p2-shield-img');
    if (shield1) { shield1.style.display = 'none'; shield1.src = ''; }
    if (shield2) { shield2.style.display = 'none'; shield2.src = ''; }
    loadLocalTeamLogos();
}

// (loadLocalTeamLogos, selectLocalTeam burada zaten var, tekrar yazmıyoruz ama üstte kaldı)

// ============================================================
// 2 KİŞİLİK MOD - SÜRE AYARLARI (YENİ)
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
// OYUNCU DATA YÖNETİMİ & KULLANICI PROFİLİ
// ============================================================
let playerProfile = {
    username: "Oyuncu_" + Math.floor(Math.random() * 1000),
    selectedTeamLogo: "default.png",
    stats: {
        totalMatches: 0,
        wins: 0,
        losses: 0,
        draws: 0
    }
};

window.addEventListener('load', () => {
    if (typeof loadPlayerData === 'function') {
        loadPlayerData();
    }
    if (typeof connectToServer === 'function') {
        connectToServer();
    }
});

function loadPlayerData() {
    const savedData = localStorage.getItem('fingerSoccerPlayerData');
    if (savedData) {
        try {
            playerProfile = JSON.parse(savedData);
        } catch (e) {
            console.error("Veri okuma hatası:", e);
        }
    }
    syncDataToUI();
}

function savePlayerData() {
    localStorage.setItem('fingerSoccerPlayerData', JSON.stringify(playerProfile));
}

function syncDataToUI() {
    const modalName = document.getElementById('profile-username');
    if (modalName) modalName.value = playerProfile.username;
    const totalMatchesEl = document.getElementById('stat-total-matches');
    if (totalMatchesEl) totalMatchesEl.innerText = playerProfile.stats.totalMatches;
    const winsEl = document.getElementById('stat-wins');
    if (winsEl) winsEl.innerText = playerProfile.stats.wins;
    const lossesEl = document.getElementById('stat-losses');
    if (lossesEl) lossesEl.innerText = playerProfile.stats.losses;
}

function openProfileModal() {
    syncDataToUI();
    const modal = document.getElementById('player-profile-modal');
    if (modal) modal.style.display = 'flex';
}

function closeProfileModal() {
    const modal = document.getElementById('player-profile-modal');
    if (modal) modal.style.display = 'none';
}

function savePlayerProfile() {
    const newName = document.getElementById('profile-username').value.trim();
    if (newName) {
        playerProfile.username = newName;
        savePlayerData();
        syncDataToUI();
        closeProfileModal();
        alert("✅ Profil başarıyla güncellendi!");
    } else {
        alert("⚠️ Lütfen geçerli bir kullanıcı adı girin!");
    }
}

function resetPlayerData() {
    if (confirm("⚠️ Tüm istatistikleriniz sıfırlanacak! Emin misiniz?")) {
        playerProfile.stats = { totalMatches: 0, wins: 0, losses: 0, draws: 0 };
        savePlayerData();
        syncDataToUI();
        alert("🧹 Veriler sıfırlandı.");
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
// EKSİK OLAN FONKSİYONLAR (AUTH & MİSAFİR GİRİŞİ) - DÜZELTİLDİ
// ============================================================
function switchAuthTab(tab) {
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');
    const formForgot = document.getElementById('form-forgot');
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
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
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value.trim();
        socket.emit('loginUser', { email, password });
    } else if (action === 'register') {
        const username = document.getElementById('reg-username').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const password = document.getElementById('reg-password').value.trim();
        socket.emit('registerUser', { username, email, password });
    } else if (action === 'forgot') {
        const email = document.getElementById('forgot-email').value.trim();
        socket.emit('forgotPassword', { email });
    }
}

function continueAsGuest() {
    const authOverlay = document.getElementById('auth-modal-overlay');
    if (authOverlay) {
        authOverlay.style.display = 'none'; // Görünürlüğü tamamen kaldırır
        authOverlay.classList.add('hidden');
    }
    
    const menu = document.getElementById('menu');
    if (menu) {
        menu.style.display = 'block'; // Ana menüyü açar
    }

    const playerNameInput = document.getElementById('player-name');
    if (playerNameInput && (!playerNameInput.value || playerNameInput.value === 'Oyuncu')) {
        playerNameInput.value = "Misafir_" + Math.floor(Math.random() * 1000);
    }
    
    console.log("🎮 Misafir girişi başarılı, ana menü açıldı.");
}

if (socket) {
    socket.on('authResponse', (data) => {
        alert(data.message);
        if (data.success) {
            if (data.username) {
                const playerNameInput = document.getElementById('player-name');
                if (playerNameInput) playerNameInput.value = data.username;
            }
            if (data.action === 'login' || data.action === 'register') {
                const authOverlay = document.getElementById('auth-modal-overlay');
                if (authOverlay) {
                    authOverlay.classList.add('hidden');
                }
                const menu = document.getElementById('menu');
                if (menu) {
                    menu.style.display = 'block';
                }
            } else if (data.action === 'forgot') {
                switchAuthTab('login');
            }
        }
    });
}
// ============================================================
// EKSİK KALAN MENÜ VE POP-UP FONKSİYONLARI
// ============================================================

// --- TAKIM SEÇİM POP-UP AÇ/KAPA ---
function openTeamSelectPopup() {
    console.log('🏆 Takım seçim pop-up açılıyor...');
    const popup = document.getElementById('team-select-popup');
    const grid = document.getElementById('team-select-grid');
    const shieldImg = document.getElementById('popup-selected-team-img');
    
    if (!popup || !grid) { console.error("Pop-up veya Grid bulunamadı!"); return; }

    popup.style.display = 'block';
    popup.style.visibility = 'visible';
    popup.style.opacity = '1';

    // Seçili takımı armaya koy
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

    // Grid'i doldur
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
            // Ana menüdeki logoyu güncelle
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

// --- DİĞER MENÜ AÇ/KAPA FONKSİYONLARI ---
function openAILevelMenu() {
    document.getElementById('menu').style.display = 'none';
    document.getElementById('ai-level-menu').style.display = 'flex';
}

function closeAILevelMenu() {
    document.getElementById('ai-level-menu').style.display = 'none';
    document.getElementById('menu').style.display = 'block';
}

function openSettingsPopup() {
    const popup = document.getElementById('settings-popup');
    if (popup) {
        popup.style.display = 'flex';
        popup.style.visibility = 'visible';
        popup.style.opacity = '1';
    }
}

function closeSettingsPopup() {
    const popup = document.getElementById('settings-popup');
    if (popup) {
        popup.style.display = 'none';
        popup.style.visibility = 'hidden';
        popup.style.opacity = '0';
    }
}

function openOnlineLobby() {
    if (!socket) { 
        alert("Şu anda bir sunucuya bağlı değilsiniz!"); 
        return; 
    }
    
    if (!socket.connected) {
        alert("Sunucu bağlantısı kurulamadı! Lütfen sayfayı yenileyin.");
        return;
    }
    
    gameMode = 'online';
    const playerData = getPlayerData();
    
    console.log('📤 Lobby\'ye katılınıyor:', playerData);
    socket.emit("join-lobby", playerData);
    
    document.getElementById('menu').style.display = 'none';
    document.getElementById('online-lobby').style.display = 'flex';
    
    // Lobby listesini temizle
    const listContainer = document.getElementById('lobby-list');
    if (listContainer) {
        listContainer.innerHTML = "<div style='padding:15px;color:rgba(255,255,255,0.3);text-align:center;'>Oyuncular aranıyor...</div>";
    }
}
function updateLobbyUI() {
    const listContainer = document.getElementById('lobby-list');
    if (!listContainer) return;
    
    // Mevcut oyuncuyu filtrele (kendini gösterme)
    const otherPlayers = onlinePlayers.filter(p => p.id !== socket.id);
    
    if (otherPlayers.length === 0) {
        listContainer.innerHTML = "<div style='padding:15px;color:rgba(255,255,255,0.3);text-align:center;'>Havuzda oyuncu yok. Bekleyin...</div>";
        return;
    }
    
    let html = '';
    otherPlayers.forEach(p => {
        html += `
            <div class="player-item">
                <span>
                    <img src="takimlar/${p.logo || 'default.png'}" class="lobby-logo" onerror="this.src='takimlar/default.png'">
                    ${p.name}
                </span>
                <button class="status" onclick="sendInvite('${p.id}')">Davet Et</button>
            </div>
        `;
    });
    
    listContainer.innerHTML = html;
}
function closeOnlineLobby() {
    if (socket) socket.emit("leave-lobby");
    document.getElementById('online-lobby').style.display = 'none';
    document.getElementById('menu').style.display = 'block';
}
function sendInvite(targetId) {
    if (!socket) {
        alert('Bağlantı yok!');
        return;
    }
    
    console.log('📨 Davet gönderiliyor:', targetId);
    socket.emit("send-invite", targetId);
    
    // Butonu güncelle
    const btns = document.querySelectorAll('.status');
    btns.forEach(btn => {
        if (btn.textContent === 'Davet Et') {
            btn.textContent = '⏳ Bekleniyor...';
            btn.style.background = '#e67e22';
        }
    });
}
function openLocalTeamSelect() {
    document.getElementById('local-team-select').style.display = 'flex';
    localP1Selected = false; localP2Selected = false;
    localPlayer1Logo = ''; localPlayer2Logo = '';
    document.getElementById('local-p1-name').textContent = 'Seçilmedi';
    document.getElementById('local-p2-name').textContent = 'Seçilmedi';
    loadLocalTeamLogos();
}

function closeLocalTeamSelect() {
    document.getElementById('local-team-select').style.display = 'none';
}

// --- 2 KİŞİLİK LOKAL TAKIM LOGOLARINI YÜKLEME ---
function loadLocalTeamLogos() {
    const container1 = document.getElementById('local-player1-logos');
    const container2 = document.getElementById('local-player2-logos');
    if (!container1 || !container2) return;
    
    container1.innerHTML = ''; container2.innerHTML = '';
    teamLogos.forEach((logo) => {
        // Oyuncu 1
        const btn1 = document.createElement('button');
        btn1.className = 'team-logo-btn'; btn1.dataset.logo = logo.file;
        const img1 = document.createElement('img'); img1.src = `takimlar/${logo.file}`;
        img1.onerror = function() { this.src = 'takimlar/default.png'; };
        btn1.appendChild(img1);
        btn1.onclick = function() { selectLocalTeam(1, logo.file); };
        container1.appendChild(btn1);
        
        // Oyuncu 2
        const btn2 = document.createElement('button');
        btn2.className = 'team-logo-btn'; btn2.dataset.logo = logo.file;
        const img2 = document.createElement('img'); img2.src = `takimlar/${logo.file}`;
        img2.onerror = function() { this.src = 'takimlar/default.png'; };
        btn2.appendChild(img2);
        btn2.onclick = function() { selectLocalTeam(2, logo.file); };
        container2.appendChild(btn2);
    });
}

function selectLocalTeam(player, logoFile) {
    if (player === 1) {
        if (logoFile === localPlayer2Logo && localP2Selected) { alert('Oyuncu 2 zaten bu takımı seçti!'); return; }
        localPlayer1Logo = logoFile; localP1Selected = true;
        document.querySelectorAll('#local-player1-logos .team-logo-btn').forEach(btn => {
            btn.classList.remove('active', 'active-p1');
            if (btn.dataset.logo === logoFile) btn.classList.add('active', 'active-p1');
        });
        const shield = document.getElementById('local-p1-shield-img');
        if (shield) { shield.src = `takimlar/${logoFile}`; shield.style.display = 'block'; }
        const nameEl = document.getElementById('local-p1-name');
        if (nameEl) {
            const logo = teamLogos.find(l => l.file === logoFile);
            nameEl.textContent = logo ? logo.name.replace('⚽ ', '') : 'Seçildi';
            nameEl.style.color = '#3498db';
        }
    } else if (player === 2) {
        if (logoFile === localPlayer1Logo && localP1Selected) { alert('Oyuncu 1 zaten bu takımı seçti!'); return; }
        localPlayer2Logo = logoFile; localP2Selected = true;
        document.querySelectorAll('#local-player2-logos .team-logo-btn').forEach(btn => {
            btn.classList.remove('active', 'active-p2');
            if (btn.dataset.logo === logoFile) btn.classList.add('active', 'active-p2');
        });
        const shield = document.getElementById('local-p2-shield-img');
        if (shield) { shield.src = `takimlar/${logoFile}`; shield.style.display = 'block'; }
        const nameEl = document.getElementById('local-p2-name');
        if (nameEl) {
            const logo = teamLogos.find(l => l.file === logoFile);
            nameEl.textContent = logo ? logo.name.replace('⚽ ', '') : 'Seçildi';
            nameEl.style.color = '#e74c3c';
        }
    }
}
// Ses butonu test sesi için (Hata vermemesi için boş fonksiyon)
function playButtonSound() {
    // Bu fonksiyon şu an için sadece hatayı susturmak için var.
    // İsterseniz ileride buraya kısa bir 'tık' sesi ekleyebilirsiniz.
}
