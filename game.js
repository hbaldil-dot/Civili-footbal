// ============================================================
// SABİT SÜRELER
// ============================================================
let MATCH_DURATION = 90;
let SHOT_DURATION = 5;
let isSoundOn = true;

// ============================================================
// FİZİK SABİTLERİ
// ============================================================
const PHYSICS = {
    FRICTION: 0.985,
    MAX_SPEED: 12,
    SUB_STEPS: 10,
    SHOT_POWER_MULTIPLIER: 0.14,
    WALL_BOUNCE: 0.85,
    PIN_BOUNCE: 0.85,
    SYNC_INTERVAL: 2000,
    POSITION_TOLERANCE: 25
};

// ============================================================
// SOCKET
// ============================================================
var socket = null;
var onlinePlayers = [];

// ============================================================
// TAKIM LOGOLARI
// ============================================================
var selectedTeamLogo = 'default.png';
var aiTeamLogo = 'default.png';
var loadedLogos = {};
var localPlayer1Logo = '';
var localPlayer2Logo = '';
var localP1Selected = false;
var localP2Selected = false;

var teamLogos = [
    { file: 'fb.png', name: 'Fenerbahçe' },
    { file: 'galatasaray.png', name: 'Galatasaray' },
    { file: 'bjk.png', name: 'Beşiktaş' },
    { file: 'ts.png', name: 'Trabzonspor' },
    { file: 'bs.png', name: 'Başakşehir' },
    { file: 'gfk.png', name: 'Giresunspor' },
    { file: 'kaspasa.png', name: 'Kasımpaşa' },
    { file: 'karagumruk.png', name: 'Fatih Karagümrük' },
    { file: 'hatay.png', name: 'Hatayspor' },
    { file: 'adana.png', name: 'Adana Demirspor' },
    { file: 'antalya.png', name: 'Antalyaspor' },
    { file: 'agucu.png', name: 'Ağrı 1970 Spor' },
    { file: 'samsun.png', name: 'Samsunspor' }
];

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
var myTeamNumber = 1;
var currentRoomId = null;
var isOnlineMatch = false;
var opponentLogoData = 'default.png';

var matchSecondsLeft = MATCH_DURATION;
var timerInterval = null;
var shotSecondsLeft = SHOT_DURATION;
var shotTimerInterval = null;
var setupSecondsLeft = 15;
var setupTimerInterval = null;
var syncInterval = null;
var currentStadiumTexture = 'menu/ayarlar/stat/texure/z1-t.webp';

var cap = { x: width / 2, y: height / 2, vx: 0, vy: 0, radius: 11, rotation: 0 };
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
var MAX_DRAG_DIST = cap.radius * 2 * 6;

var goalAnimation = null;
var goalAnimationStartTime = 0;
var GOAL_ANIMATION_DURATION = 3000;
var goalImage = null;
var fieldImage = null;

// ============================================================
// SAHA RESMİ
// ============================================================
function loadFieldImage(imagePath) {
    var path = imagePath || currentStadiumTexture;
    var img = new Image();
    img.onload = function() {
        fieldImage = img;
        if (currentPhase !== 'menu') draw();
    };
    img.onerror = function() {
        fieldImage = null;
    };
    img.src = path;
}

function showField() {
    var canvasEl = document.getElementById('gameCanvas');
    if (canvasEl) {
        canvasEl.style.backgroundImage = 'url(' + currentStadiumTexture + ')';
        canvasEl.style.backgroundSize = 'cover';
        canvasEl.style.backgroundPosition = 'center';
        canvasEl.style.backgroundRepeat = 'no-repeat';
        canvasEl.style.backgroundColor = '#2e7d32';
        canvasEl.style.border = '4px solid rgba(27, 94, 32, 0.4)';
        canvasEl.style.borderRadius = '8px';
        canvasEl.style.boxShadow = '0 10px 40px rgba(0, 0, 0, 0.6)';
        canvasEl.classList.add('canvas-active');
    }
}

function hideField() {
    var canvasEl = document.getElementById('gameCanvas');
    if (canvasEl) {
        canvasEl.style.backgroundImage = 'none';
        canvasEl.style.background = 'transparent';
        canvasEl.style.backgroundColor = 'transparent';
        canvasEl.style.border = 'none';
        canvasEl.style.borderRadius = '0';
        canvasEl.style.boxShadow = 'none';
        canvasEl.classList.remove('canvas-active');
    }
}

// ============================================================
// ÇİZİM
// ============================================================
function drawFieldLinesOnly() {
    ctx.clearRect(0, 0, width, height);
}

function drawSoccerBall(x, y, r, rotation) {
    if (!x || !y) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation || 0);
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#333';
    ctx.stroke();
    ctx.fillStyle = '#222';
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
    if (!x || !y) return;
    ctx.save();
    ctx.translate(x, y);
    var size = cap.radius * 1.4;
    var logo = logoFile && loadedLogos[logoFile] ? loadedLogos[logoFile] : null;
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (logo) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, size - 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        var logoSize = (size - 2) * 2;
        ctx.drawImage(logo, -(size - 2), -(size - 2), logoSize, logoSize);
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, size - 1, 0, Math.PI * 2);
        ctx.stroke();
    } else {
        ctx.fillStyle = '#555';
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#888';
        ctx.font = size * 0.6 + 'px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚽', 0, 2);
    }
    ctx.restore();
}

function drawFieldLines() {
    var goalLeft = (width - goalWidth) / 2;
    var goalRight = (width + goalWidth) / 2;
    var pBoxX1 = (width - goalWidth * 2.2) / 2;
    var penaltyBoxH = height * 0.15;
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect(pBoxX1, 0, goalWidth * 2.2, penaltyBoxH);
    ctx.strokeRect(pBoxX1, height - penaltyBoxH, goalWidth * 2.2, penaltyBoxH);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(goalLeft, goalHeight);
    ctx.lineTo(goalRight, goalHeight);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(goalLeft, height - goalHeight);
    ctx.lineTo(goalRight, height - goalHeight);
    ctx.stroke();
}

function draw() {
    ctx.clearRect(0, 0, width, height);
    if (fieldImage) {
        try { ctx.drawImage(fieldImage, 0, 0, width, height); } 
        catch(e) { ctx.fillStyle = '#2e7d32'; ctx.fillRect(0, 0, width, height); }
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
    drawFieldLines();
    for (var i = 0; i < pins.length; i++) {
        var pin = pins[i];
        if (pin.isPost) {
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = 'rgba(255,255,255,0.3)';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(pin.x, pin.y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        } else {
            var logoFile = 'default.png';
            if (pin.team === 1) {
                logoFile = selectedTeamLogo || 'default.png';
            } else if (pin.team === 2) {
                if (gameMode === 'ai') logoFile = aiTeamLogo || 'default.png';
                else if (gameMode === 'local' && localPlayer2Logo) logoFile = localPlayer2Logo;
                else if (gameMode === 'online') logoFile = opponentLogoData || 'default.png';
            }
            drawPlayerWithLogo(pin.x, pin.y, logoFile);
        }
    }
    if (currentPhase === 'playing' || currentPhase === 'setup') {
        drawSoccerBall(cap.x, cap.y, cap.radius, cap.rotation);
    }
    if (currentPhase === 'playing' && isDraggingBall) {
        var dx = dragStart.x - dragCurrent.x;
        var dy = dragStart.y - dragCurrent.y;
        var dist = Math.hypot(dx, dy);
        if (dist > 10) {
            ctx.save();
            ctx.strokeStyle = 'rgba(240, 248, 255, 0.6)';
            ctx.lineWidth = 4;
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
            ctx.restore();
        }
    }
    if (goalAnimation) {
        var elapsed = Date.now() - goalAnimationStartTime;
        var progress = Math.min(elapsed / GOAL_ANIMATION_DURATION, 1);
        var scale = 0.5 + progress * 0.8;
        var alpha = 1 - progress * 0.8;
        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.scale(scale, scale);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(255, 215, 0, ' + (alpha * 0.7) + ')';
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,' + (alpha * 0.5) + ')';
        ctx.shadowBlur = 20;
        ctx.fillText('⚽ GOAL! ⚽', 0, 0);
        ctx.restore();
        if (progress >= 1) goalAnimation = null;
    }
    ctx.restore();
}

// ============================================================
// FİZİK
// ============================================================
function updatePhysics() {
    if (currentPhase !== 'playing') return;
    var currentSpeed = Math.hypot(cap.vx, cap.vy);
    if (currentSpeed > PHYSICS.MAX_SPEED) {
        cap.vx = (cap.vx / currentSpeed) * PHYSICS.MAX_SPEED;
        cap.vy = (cap.vy / currentSpeed) * PHYSICS.MAX_SPEED;
    }
    for (var step = 0; step < PHYSICS.SUB_STEPS; step++) {
        cap.x += cap.vx / PHYSICS.SUB_STEPS;
        cap.y += cap.vy / PHYSICS.SUB_STEPS;
        if (cap.x - cap.radius < 0) { cap.x = cap.radius; cap.vx *= -PHYSICS.WALL_BOUNCE; playSound('hit'); }
        if (cap.x + cap.radius > width) { cap.x = width - cap.radius; cap.vx *= -PHYSICS.WALL_BOUNCE; playSound('hit'); }
        if (cap.y - cap.radius <= goalHeight) {
            var goalLeft = (width - goalWidth) / 2;
            var goalRight = (width + goalWidth) / 2;
            if (cap.x > goalLeft && cap.x < goalRight) {
                handleGoalScored(1);
                return;
            } else {
                cap.y = goalHeight + cap.radius;
                cap.vy *= -PHYSICS.WALL_BOUNCE;
                playSound('hit');
            }
        }
        if (cap.y + cap.radius >= height - goalHeight) {
            var goalLeft2 = (width - goalWidth) / 2;
            var goalRight2 = (width + goalWidth) / 2;
            if (cap.x > goalLeft2 && cap.x < goalRight2) {
                handleGoalScored(2);
                return;
            } else {
                cap.y = height - goalHeight - cap.radius;
                cap.vy *= -PHYSICS.WALL_BOUNCE;
                playSound('hit');
            }
        }
        for (var i = 0; i < pins.length; i++) {
            var pin = pins[i];
            if (pin.isPost) continue;
            var dist = Math.hypot(cap.x - pin.x, cap.y - pin.y);
            var minDist = cap.radius + 8;
            if (dist < minDist) {
                var angle = Math.atan2(cap.y - pin.y, cap.x - pin.x);
                cap.x = pin.x + Math.cos(angle) * minDist;
                cap.y = pin.y + Math.sin(angle) * minDist;
                var hitSpeed = Math.hypot(cap.vx, cap.vy);
                var newSpeed = Math.max(hitSpeed, 1.2) * PHYSICS.PIN_BOUNCE;
                cap.vx = Math.cos(angle) * newSpeed;
                cap.vy = Math.sin(angle) * newSpeed;
                playSound('hit');
            }
        }
    }
    cap.vx *= PHYSICS.FRICTION;
    cap.vy *= PHYSICS.FRICTION;
    if (Math.hypot(cap.vx, cap.vy) < 0.05) {
        cap.vx = 0;
        cap.vy = 0;
    }
    if (Math.hypot(cap.vx, cap.vy) > 0.1) {
        cap.rotation += (cap.vx + cap.vy) * 0.02;
    }
    if (gameMode === 'ai' && turn === 2 && Math.hypot(cap.vx, cap.vy) < 0.1) {
        runAIMove();
    }
}

function handleGoalScored(scoringTeam) {
    console.log('⚽ Gol! Takım ' + scoringTeam);
    if (scoringTeam === 1) {
        score.p1++;
        document.getElementById('score-p1').innerText = score.p1;
    } else {
        score.p2++;
        document.getElementById('score-p2').innerText = score.p2;
    }
    if (gameMode === 'online' && socket && currentRoomId) {
        socket.emit('goal-scored', { roomId: currentRoomId, scoringTeam: scoringTeam });
    }
    triggerGoalAnimation();
    cap.x = width / 2;
    cap.y = height / 2;
    cap.vx = 0;
    cap.vy = 0;
    turn = scoringTeam;
    updateHUDTurn();
    resetShotTimer();
}

function performShot(startX, startY, endX, endY) {
    var dx = (startX - endX) * PHYSICS.SHOT_POWER_MULTIPLIER;
    var dy = (startY - endY) * PHYSICS.SHOT_POWER_MULTIPLIER;
    var speed = Math.hypot(dx, dy);
    if (speed > PHYSICS.MAX_SPEED) {
        dx = (dx / speed) * PHYSICS.MAX_SPEED;
        dy = (dy / speed) * PHYSICS.MAX_SPEED;
    }
    cap.vx = dx;
    cap.vy = dy;
    playSound('kick');
    turn = turn === 1 ? 2 : 1;
    updateHUDTurn();
    resetShotTimer();
    if (gameMode === 'online' && socket && currentRoomId) {
        socket.emit('playerShot', { roomId: currentRoomId, shotData: { startX: startX, startY: startY, endX: endX, endY: endY } });
    }
}

// ============================================================
// SES
// ============================================================
var audioElements = { hit: null, goal: null };

function preloadSounds() {
    try {
        audioElements.hit = new Audio('sesler/Carpma.mp3');
        audioElements.goal = new Audio('sesler/gol.mp3');
    } catch(e) {}
}

function playSound(type) {
    if (!isSoundOn) return;
    try {
        if (type === 'hit' && audioElements.hit) {
            audioElements.hit.currentTime = 0;
            audioElements.hit.play().catch(function() {});
        } else if (type === 'goal' && audioElements.goal) {
            audioElements.goal.currentTime = 0;
            audioElements.goal.play().catch(function() {});
        } else if (type === 'kick') {
            try {
                var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                var osc = audioCtx.createOscillator();
                var gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                var now = audioCtx.currentTime;
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.15);
                osc.start(now);
                osc.stop(now + 0.15);
            } catch(e) {}
        }
    } catch(e) {}
}

function toggleSound() {
    isSoundOn = !isSoundOn;
    var soundBtn = document.getElementById('sound-toggle-btn');
    if (soundBtn) {
        soundBtn.src = isSoundOn ? 'menu/ayarlar/ses.webp' : 'menu/ayarlar/ses-off.webp';
    }
    localStorage.setItem('soundEnabled', isSoundOn ? 'true' : 'false');
}

function loadSoundSettings() {
    var saved = localStorage.getItem('soundEnabled');
    if (saved !== null) {
        isSoundOn = saved === 'true';
        var soundBtn = document.getElementById('sound-toggle-btn');
        if (soundBtn) {
            soundBtn.src = isSoundOn ? 'menu/ayarlar/ses.webp' : 'menu/ayarlar/ses-off.webp';
        }
    }
}

// ============================================================
// SOCKET BAĞLANTISI
// ============================================================
if (typeof io !== 'undefined') {
    try {
        var serverUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
            ? undefined
            : window.location.origin;
        
        socket = io(serverUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 20000
        });
        
        socket.on('connect', function() {
            console.log('✅ Sunucuya bağlandı! ID:', socket.id);
        });
        
        socket.on('disconnect', function() {
            console.warn('⚠️ Bağlantı kesildi');
        });
        
        socket.on('connect_error', function(error) {
            console.warn('⚠️ Bağlantı hatası:', error.message);
        });
        
        socket.on('update-lobby-players', function(players) {
            console.log('🔄 Lobby güncellendi:', players.length, 'oyuncu');
            onlinePlayers = players || [];
            updateLobbyUI();
        });
        
        socket.on('receive-invite', function(data) {
            if (confirm(data.fromName + ' seni maça davet ediyor! Kabul et?')) {
                socket.emit('accept-invite', data.fromId);
            }
        });
        
        socket.on('start-online-match', function(data) {
            console.log('🎮 MAÇ BAŞLANGIÇ:', data);
            currentRoomId = data.roomId;
            myTeamNumber = data.team;
            opponentLogoData = data.opponentLogo || 'default.png';
            isOnlineMatch = true;
            loadTeamLogoImage(opponentLogoData);
            document.getElementById('online-lobby').style.display = 'none';
            document.getElementById('top-bar').style.display = 'flex';
            matchSecondsLeft = MATCH_DURATION;
            document.getElementById('time-board').innerText = matchSecondsLeft + 's';
            setTimeout(function() { updateScoreLogos(); }, 100);
            startSetupPhase();
        });
        
        socket.on('opponent-goal', function(data) {
            console.log('📥 Rakip gol bildirimi:', data);
            if (currentPhase === 'playing' && isOnlineMatch) {
                if (data.scoringTeam === 1) {
                    score.p1++;
                    document.getElementById('score-p1').innerText = score.p1;
                } else {
                    score.p2++;
                    document.getElementById('score-p2').innerText = score.p2;
                }
                triggerGoalAnimation();
                cap.x = width / 2;
                cap.y = height / 2;
                cap.vx = 0;
                cap.vy = 0;
                turn = data.scoringTeam;
                updateHUDTurn();
                resetShotTimer();
            }
        });
        
        socket.on('opponentShot', function(shotData) {
            if (gameMode === 'online' && currentPhase === 'playing') {
                var dx = (shotData.startX - shotData.endX) * PHYSICS.SHOT_POWER_MULTIPLIER;
                var dy = (shotData.startY - shotData.endY) * PHYSICS.SHOT_POWER_MULTIPLIER;
                cap.vx = dx;
                cap.vy = dy;
                playSound('kick');
                turn = myTeamNumber;
                updateHUDTurn();
                resetShotTimer();
            }
        });
        
        socket.on('correctBallPosition', function(data) {
            if (gameMode === 'online' && currentPhase === 'playing') {
                var ball = data.ballState;
                var diff = Math.hypot(cap.x - ball.x, cap.y - ball.y);
                if (diff > PHYSICS.POSITION_TOLERANCE) {
                    cap.x = cap.x + (ball.x - cap.x) * 0.3;
                    cap.y = cap.y + (ball.y - cap.y) * 0.3;
                    cap.vx = ball.vx || 0;
                    cap.vy = ball.vy || 0;
                }
                if (ball.turn && turn !== ball.turn) {
                    turn = ball.turn;
                    updateHUDTurn();
                }
            }
        });
        
        socket.on('authResponse', function(data) {
            alert(data.message);
            if (data.success && data.username) {
                document.getElementById('player-name').value = data.username;
                if (data.action === 'login' || data.action === 'register') {
                    document.getElementById('auth-modal-overlay').style.display = 'none';
                    document.getElementById('menu').style.display = 'block';
                }
            }
        });
        
        socket.on('sync-setup-pin-move', function(data) {
            if (currentPhase === 'setup') {
                var count = 0;
                for (var i = 0; i < pins.length; i++) {
                    var p = pins[i];
                    if (!p.isPost && p.team === data.team) {
                        if (count === data.index) {
                            p.x = data.x;
                            p.y = data.y;
                            break;
                        }
                        count++;
                    }
                }
            }
        });
        
        socket.on('match-go', function(data) {
            if (setupTimerInterval) clearInterval(setupTimerInterval);
            pins = [
                { x: (width - goalWidth) / 2, y: goalHeight, isPost: true, locked: true },
                { x: (width + goalWidth) / 2, y: goalHeight, isPost: true, locked: true },
                { x: (width - goalWidth) / 2, y: height - goalHeight, isPost: true, locked: true },
                { x: (width + goalWidth) / 2, y: height - goalHeight, isPost: true, locked: true }
            ];
            for (var i = 0; i < data.pins.length; i++) {
                var p = data.pins[i];
                var assignedTeam = p.team || (i < 11 ? 1 : 2);
                pins.push({ x: p.x, y: p.y, team: assignedTeam, locked: true });
            }
            currentPhase = 'playing';
            document.getElementById('start-match-btn').style.display = 'none';
            var shotTimer = document.getElementById('shot-timer');
            if (shotTimer) shotTimer.style.display = 'block';
            updateHUDTurn();
            startMatchTimer();
            resetShotTimer();
            animate();
        });
        
        socket.on('opponent-disconnected', function() {
            alert('⚠️ Rakip oyundan ayrıldı!');
            exitToMenu();
        });
        
    } catch(e) {
        console.error('❌ Socket bağlantı hatası:', e);
    }
}

// ============================================================
// LOBBY
// ============================================================
function updateLobbyUI() {
    var listContainer = document.getElementById('lobby-list');
    if (!listContainer) return;
    if (!onlinePlayers || onlinePlayers.length === 0) {
        listContainer.innerHTML = '<div style="padding:20px;color:rgba(255,255,255,0.4);text-align:center;"><div style="font-size:30px;margin-bottom:8px;">👤</div>Havuzda oyuncu yok</div>';
        return;
    }
    var html = '';
    for (var i = 0; i < onlinePlayers.length; i++) {
        var p = onlinePlayers[i];
        var isMe = (p.id === socket.id);
        html += '<div class="player-item" style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.05);' + (isMe ? 'background:rgba(46,204,113,0.05);' : '') + '">';
        html += '<span style="display:flex;align-items:center;gap:10px;font-size:13px;color:' + (isMe ? '#2ecc71' : 'rgba(255,255,255,0.8)') + ';">';
        html += '<img src="takimlar/' + (p.logo || 'default.png') + '" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:1px solid ' + (isMe ? 'rgba(46,204,113,0.3)' : 'rgba(255,255,255,0.1)') + ';" onerror="this.src=\'takimlar/default.png\'">';
        html += p.name + (isMe ? ' (Sen)' : '');
        html += '</span>';
        if (!isMe) {
            html += '<button onclick="sendInvite(\'' + p.id + '\')" style="background:rgba(46,204,113,0.15);color:#2ecc71;border:1px solid rgba(46,204,113,0.1);padding:4px 14px;border-radius:16px;font-size:10px;cursor:pointer;font-family:inherit;">Davet Et</button>';
        }
        html += '</div>';
    }
    listContainer.innerHTML = html;
}

function sendInvite(targetId) {
    if (!socket) return;
    socket.emit('send-invite', targetId);
}

function getPlayerData() {
    var name = document.getElementById('player-name').value.trim() || 'Oyuncu';
    return { name: name, logo: selectedTeamLogo || 'default.png' };
}

function openOnlineLobby() {
    if (!socket) { alert('Sunucu bağlantısı yok!'); return; }
    if (!socket.connected) { alert('Sunucu bağlanamadı! Sayfayı yenileyin.'); return; }
    gameMode = 'online';
    var playerData = getPlayerData();
    socket.emit('join-lobby', playerData);
    document.getElementById('menu').style.display = 'none';
    document.getElementById('online-lobby').style.display = 'flex';
}

function closeOnlineLobby() {
    if (socket) socket.emit('leave-lobby');
    document.getElementById('online-lobby').style.display = 'none';
    document.getElementById('menu').style.display = 'block';
}

// ============================================================
// TAKIM SEÇİMİ
// ============================================================
function loadTeamLogoImage(logoFile) {
    return new Promise(function(resolve) {
        if (loadedLogos[logoFile]) { resolve(loadedLogos[logoFile]); return; }
        var img = new Image();
        img.onload = function() { loadedLogos[logoFile] = img; resolve(img); };
        img.onerror = function() {
            if (logoFile !== 'default.png') {
                loadTeamLogoImage('default.png').then(resolve);
            } else { resolve(null); }
        };
        img.src = 'takimlar/' + logoFile;
    });
}

function selectRandomTeam() {
    var randomIndex = Math.floor(Math.random() * teamLogos.length);
    var selected = teamLogos[randomIndex];
    selectedTeamLogo = selected.file;
    return selected;
}

function selectRandomAITeam() {
    var available = teamLogos.filter(function(l) { return l.file !== selectedTeamLogo; });
    aiTeamLogo = available.length > 0 ? available[Math.floor(Math.random() * available.length)].file : teamLogos[0].file;
    loadTeamLogoImage(aiTeamLogo);
    updateScoreLogos();
}

function updateScoreLogos() {
    var logoP1 = document.getElementById('score-logo-p1');
    var logoP2 = document.getElementById('score-logo-p2');
    if (logoP1) { logoP1.src = selectedTeamLogo ? 'takimlar/' + selectedTeamLogo : 'takimlar/default.png'; }
    if (logoP2) {
        if (gameMode === 'ai') logoP2.src = 'takimlar/' + (aiTeamLogo || 'default.png');
        else if (gameMode === 'local' && localPlayer2Logo) logoP2.src = 'takimlar/' + localPlayer2Logo;
        else if (gameMode === 'online') logoP2.src = 'takimlar/' + (opponentLogoData || 'default.png');
        else logoP2.src = 'takimlar/default.png';
    }
}

function updateTeamLogoDisplay() {
    var displayImg = document.getElementById('selected-team-logo-display');
    if (displayImg) {
        displayImg.src = selectedTeamLogo ? 'takimlar/' + selectedTeamLogo : 'takimlar/default.png';
        displayImg.style.display = 'block';
    }
}

function updateSelectedTeamName() {
    var logo = teamLogos.find(function(l) { return l.file === selectedTeamLogo; });
    var nameEl = document.getElementById('selected-team-name-display');
    if (nameEl) nameEl.textContent = logo ? logo.name : 'Varsayılan';
}

// ============================================================
// MENÜLER
// ============================================================
function openTeamSelectPopup() {
    var popup = document.getElementById('team-select-popup');
    var grid = document.getElementById('team-select-grid');
    var shieldImg = document.getElementById('popup-selected-team-img');
    if (!popup || !grid) return;
    popup.style.display = 'block';
    if (shieldImg && selectedTeamLogo) {
        shieldImg.src = 'takimlar/' + selectedTeamLogo;
        shieldImg.style.display = 'block';
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
        btn.onclick = (function(t) {
            return function(e) {
                e.stopPropagation();
                document.querySelectorAll('.big-team-logo-btn').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                selectedTeamLogo = t.file;
                if (shieldImg) { shieldImg.src = 'takimlar/' + t.file; shieldImg.style.display = 'block'; }
                var menuOverlay = document.getElementById('selected-team-logo-display');
                if (menuOverlay) { menuOverlay.src = 'takimlar/' + t.file; menuOverlay.style.display = 'block'; }
                loadTeamLogoImage(t.file);
                selectRandomAITeam();
                updateScoreLogos();
            };
        })(team);
        grid.appendChild(btn);
    }
}

function closeTeamSelectPopup() {
    var popup = document.getElementById('team-select-popup');
    if (popup) popup.style.display = 'none';
    updateTeamLogoDisplay();
    updateSelectedTeamName();
}

function openAILevelMenu() {
    document.getElementById('menu').style.display = 'none';
    document.getElementById('ai-level-menu').style.display = 'flex';
}

function closeAILevelMenu() {
    document.getElementById('ai-level-menu').style.display = 'none';
    document.getElementById('menu').style.display = 'block';
}

function selectDifficulty(level) {
    aiLevel = level;
    closeAILevelMenu();
    startLocalGame('ai', level);
}

function openSettingsPopup() {
    var popup = document.getElementById('settings-popup');
    if (popup) { popup.style.display = 'flex'; }
}

function closeSettingsPopup() {
    var popup = document.getElementById('settings-popup');
    if (popup) { popup.style.display = 'none'; }
}

// ============================================================
// 2 KİŞİLİK
// ============================================================
function openLocalTeamSelect() {
    var popup = document.getElementById('local-team-select');
    if (!popup) return;
    popup.style.display = 'flex';
    localP1Selected = false;
    localP2Selected = false;
    localPlayer1Logo = '';
    localPlayer2Logo = '';
    var p1Name = document.getElementById('local-p1-name');
    var p2Name = document.getElementById('local-p2-name');
    if (p1Name) { p1Name.textContent = 'Oyuncu 1'; p1Name.style.color = '#3498db'; }
    if (p2Name) { p2Name.textContent = 'Oyuncu 2'; p2Name.style.color = '#e74c3c'; }
    var shield1 = document.getElementById('local-p1-shield-img');
    var shield2 = document.getElementById('local-p2-shield-img');
    if (shield1) { shield1.style.display = 'none'; shield1.src = ''; }
    if (shield2) { shield2.style.display = 'none'; shield2.src = ''; }
    loadLocalTeamLogos();
}

function closeLocalTeamSelect() {
    var popup = document.getElementById('local-team-select');
    if (popup) popup.style.display = 'none';
}

function loadLocalTeamLogos() {
    var container1 = document.getElementById('local-player1-logos');
    var container2 = document.getElementById('local-player2-logos');
    if (!container1 || !container2) return;
    container1.innerHTML = '';
    container2.innerHTML = '';
    for (var i = 0; i < teamLogos.length; i++) {
        var logo = teamLogos[i];
        (function(t) {
            var btn1 = document.createElement('button');
            btn1.className = 'team-logo-btn';
            btn1.dataset.logo = t.file;
            var img1 = document.createElement('img');
            img1.src = 'takimlar/' + t.file;
            img1.onerror = function() { this.src = 'takimlar/default.png'; };
            btn1.appendChild(img1);
            btn1.onclick = function(e) { e.stopPropagation(); selectLocalTeam(1, t.file); };
            container1.appendChild(btn1);
            var btn2 = document.createElement('button');
            btn2.className = 'team-logo-btn';
            btn2.dataset.logo = t.file;
            var img2 = document.createElement('img');
            img2.src = 'takimlar/' + t.file;
            img2.onerror = function() { this.src = 'takimlar/default.png'; };
            btn2.appendChild(img2);
            btn2.onclick = function(e) { e.stopPropagation(); selectLocalTeam(2, t.file); };
            container2.appendChild(btn2);
        })(logo);
    }
}

function selectLocalTeam(player, logoFile) {
    if (player === 1) {
        if (logoFile === localPlayer2Logo && localP2Selected) { alert('Oyuncu 2 zaten bu takımı seçti!'); return; }
        localPlayer1Logo = logoFile;
        localP1Selected = true;
        var btns = document.querySelectorAll('#local-player1-logos .team-logo-btn');
        for (var i = 0; i < btns.length; i++) {
            btns[i].classList.remove('active', 'active-p1');
            if (btns[i].dataset.logo === logoFile) btns[i].classList.add('active', 'active-p1');
        }
        var shield = document.getElementById('local-p1-shield-img');
        if (shield) { shield.src = 'takimlar/' + logoFile; shield.style.display = 'block'; }
        var nameEl = document.getElementById('local-p1-name');
        if (nameEl) {
            var logo = teamLogos.find(function(l) { return l.file === logoFile; });
            nameEl.textContent = logo ? logo.name : 'Seçildi';
            nameEl.style.color = '#3498db';
        }
    } else if (player === 2) {
        if (logoFile === localPlayer1Logo && localP1Selected) { alert('Oyuncu 1 zaten bu takımı seçti!'); return; }
        localPlayer2Logo = logoFile;
        localP2Selected = true;
        var btns2 = document.querySelectorAll('#local-player2-logos .team-logo-btn');
        for (var j = 0; j < btns2.length; j++) {
            btns2[j].classList.remove('active', 'active-p2');
            if (btns2[j].dataset.logo === logoFile) btns2[j].classList.add('active', 'active-p2');
        }
        var shield2 = document.getElementById('local-p2-shield-img');
        if (shield2) { shield2.src = 'takimlar/' + logoFile; shield2.style.display = 'block'; }
        var nameEl2 = document.getElementById('local-p2-name');
        if (nameEl2) {
            var logo2 = teamLogos.find(function(l) { return l.file === logoFile; });
            nameEl2.textContent = logo2 ? logo2.name : 'Seçildi';
            nameEl2.style.color = '#e74c3c';
        }
    }
}

function startLocalGameWithTeams() {
    if (!localP1Selected || !localP2Selected) { alert('Lütfen her iki oyuncu için takım seçin!'); return; }
    if (localPlayer1Logo === localPlayer2Logo) { alert('İki oyuncu aynı takımı seçemez!'); return; }
    closeLocalTeamSelect();
    selectedTeamLogo = localPlayer1Logo;
    aiTeamLogo = localPlayer2Logo;
    loadTeamLogoImage(selectedTeamLogo);
    loadTeamLogoImage(aiTeamLogo);
    gameMode = 'local';
    document.getElementById('menu').style.display = 'none';
    document.getElementById('top-bar').style.display = 'flex';
    matchSecondsLeft = MATCH_DURATION;
    document.getElementById('time-board').innerText = matchSecondsLeft + 's';
    showField();
    setTimeout(function() { updateScoreLogos(); }, 100);
    turn = 1;
    updateHUDTurn();
    startSetupPhase();
}

// ============================================================
// OYUN
// ============================================================
function startLocalGame(mode, level) {
    gameMode = mode;
    if (mode === 'ai' && level) {
        aiLevel = level;
        selectRandomAITeam();
        setTimeout(function() { updateScoreLogos(); }, 100);
    }
    document.getElementById('menu').style.display = 'none';
    document.getElementById('top-bar').style.display = 'flex';
    matchSecondsLeft = MATCH_DURATION;
    document.getElementById('time-board').innerText = matchSecondsLeft + 's';
    showField();
    startSetupPhase();
}

function startSetupPhase() {
    showField();
    currentPhase = 'setup';
    score = { p1: 0, p2: 0 };
    document.getElementById('score-p1').innerText = '0';
    document.getElementById('score-p2').innerText = '0';
    document.getElementById('time-board').innerText = matchSecondsLeft + 's';
    var startBtn = document.getElementById('start-match-btn');
    startBtn.style.display = 'flex';
    startBtn.style.opacity = '1';
    startBtn.disabled = false;
    var indicator = document.getElementById('turn-indicator');
    if (indicator) {
        indicator.innerText = '🏆 Takım Taktik Ayarla';
        indicator.style.borderColor = '#f1c40f';
        indicator.style.color = '#f1c40f';
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
    for (var i = 0; i < blue442.length; i++) { pins.push({ x: blue442[i].x, y: blue442[i].y, team: 1, locked: false }); }
    for (var j = 0; j < red442.length; j++) { pins.push({ x: red442[j].x, y: red442[j].y, team: 2, locked: false }); }
    cap.x = width / 2;
    cap.y = height / 2;
    cap.vx = 0;
    cap.vy = 0;
    updateScoreLogos();
    startSetupTimer();
    animate();
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
        btn.innerHTML = 'BAŞLAT';
    }
}

function confirmFormationsAndStart() {
    if (setupTimerInterval) clearInterval(setupTimerInterval);
    for (var i = 0; i < pins.length; i++) { pins[i].locked = true; }
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

function startMatchTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(function() {
        if (currentPhase === 'playing') {
            matchSecondsLeft--;
            document.getElementById('time-board').innerText = matchSecondsLeft + 's';
            if (matchSecondsLeft <= 0) endMatch();
        }
    }, 1000);
}

function resetShotTimer() {
    if (shotTimerInterval) clearInterval(shotTimerInterval);
    shotSecondsLeft = SHOT_DURATION;
    var shotTimer = document.getElementById('shot-timer');
    if (shotTimer) {
        shotTimer.innerText = 'ŞUT: ' + shotSecondsLeft + 's';
        shotTimer.classList.remove('warning');
        shotTimer.style.display = (gameMode === 'ai' && turn === 2) ? 'none' : 'block';
    }
    shotTimerInterval = setInterval(function() {
        if (currentPhase === 'playing' && Math.hypot(cap.vx, cap.vy) <= 0.2) {
            shotSecondsLeft--;
            var shotTimerEl = document.getElementById('shot-timer');
            if (shotTimerEl) {
                shotTimerEl.innerText = 'ŞUT: ' + shotSecondsLeft + 's';
                if (shotSecondsLeft <= 1) shotTimerEl.classList.add('warning');
                else shotTimerEl.classList.remove('warning');
            }
            if (shotSecondsLeft <= 0) {
                clearInterval(shotTimerInterval);
                turn = turn === 1 ? 2 : 1;
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
    var resultMessage = 'Maç Berabere Bitti!';
    if (playerScore > opponentScore) resultMessage = '🎉 KAZANDINIZ! 🎉';
    else if (playerScore < opponentScore) resultMessage = '😔 Kaybettiniz.';
    alert('⏰ SÜRE DOLDU!\n\n📊 Skor: ' + playerScore + ' - ' + opponentScore + '\n\n' + resultMessage);
    setTimeout(function() { exitToMenu(); }, 500);
}

function updateHUDTurn() {
    var indicator = document.getElementById('turn-indicator');
    if (!indicator) return;
    if (gameMode === 'local') {
        var names = {
            1: localPlayer1Logo ? 'Oyuncu 1' : 'Oyuncu 1',
            2: localPlayer2Logo ? 'Oyuncu 2' : 'Oyuncu 2'
        };
        indicator.innerText = '🎯 ' + names[turn];
        indicator.style.borderColor = turn === 1 ? '#3498db' : '#e74c3c';
        indicator.style.color = turn === 1 ? '#3498db' : '#e74c3c';
    } else {
        indicator.innerText = turn === 1 ? '🎯 Sizin Sıranız' : '🎯 Rakip Sırası';
        indicator.style.borderColor = turn === 1 ? '#3498db' : '#e74c3c';
        indicator.style.color = turn === 1 ? '#3498db' : '#e74c3c';
    }
}

function triggerGoalAnimation() {
    goalAnimation = true;
    goalAnimationStartTime = Date.now();
    playSound('goal');
}

function exitToMenu() {
    if (timerInterval) clearInterval(timerInterval);
    if (shotTimerInterval) clearInterval(shotTimerInterval);
    if (setupTimerInterval) clearInterval(setupTimerInterval);
    if (syncInterval) clearInterval(syncInterval);
    if (socket && gameMode === 'online') {
        if (currentRoomId) { socket.emit('leave-room', currentRoomId); currentRoomId = null; }
        else { socket.emit('leave-lobby'); }
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

// ============================================================
// AI
// ============================================================
function getAIParameters() {
    switch (aiLevel) {
        case 'kolay': return { reactionDelay: 800, pullDistanceMin: 20, pullDistanceMax: 50, errorMargin: 25, powerError: 0.20, fakeChance: 0.02, targetZones: 3 };
        case 'orta': return { reactionDelay: 600, pullDistanceMin: 30, pullDistanceMax: 70, errorMargin: 12, powerError: 0.10, fakeChance: 0.08, targetZones: 5 };
        case 'zor': return { reactionDelay: 400, pullDistanceMin: 50, pullDistanceMax: 85, errorMargin: 6, powerError: 0.05, fakeChance: 0.15, targetZones: 5 };
        case 'usta': return { reactionDelay: 250, pullDistanceMin: 60, pullDistanceMax: 90, errorMargin: 2, powerError: 0.02, fakeChance: 0.25, targetZones: 7 };
        default: return { reactionDelay: 600, pullDistanceMin: 30, pullDistanceMax: 65, errorMargin: 12, powerError: 0.10, fakeChance: 0.08, targetZones: 5 };
    }
}

function runAIMove() {
    if (currentPhase !== 'playing' || gameMode !== 'ai' || turn !== 2) return;
    if (Math.hypot(cap.vx, cap.vy) > 0.2 || isAiThinking) return;
    isAiThinking = true;
    var params = getAIParameters();
    var target = calculateAITarget(params);
    var angle = Math.atan2(target.y - cap.y, target.x - cap.x);
    var distanceToTarget = Math.hypot(target.x - cap.x, target.y - cap.y);
    var pullDistance = params.pullDistanceMin + Math.random() * (params.pullDistanceMax - params.pullDistanceMin);
    var powerErrorFactor = 1 + (Math.random() - 0.5) * 2 * params.powerError;
    pullDistance = Math.min(pullDistance * powerErrorFactor, MAX_DRAG_DIST);
    setTimeout(function() {
        var force = pullDistance * 0.15;
        cap.vx = Math.cos(angle) * force;
        cap.vy = Math.sin(angle) * force;
        isAiThinking = false;
        turn = 1;
        updateHUDTurn();
        resetShotTimer();
    }, params.reactionDelay);
}

function calculateAITarget(params) {
    var goalY = height - goalHeight;
    var goalLeft = (width - goalWidth) / 2;
    var goalRight = (width + goalWidth) / 2;
    var zones = [];
    var numZones = params.targetZones || 5;
    var zoneWidth = (goalRight - goalLeft) / numZones;
    for (var i = 0; i < numZones; i++) {
        var zoneCenterX = goalLeft + (i * zoneWidth) + (zoneWidth / 2);
        var score_val = 0;
        var centerDist = Math.abs(zoneCenterX - width / 2);
        score_val += (60 - centerDist) * 1.5;
        zones.push({ x: zoneCenterX, y: goalY, score: score_val });
    }
    var bestZone = zones[0];
    for (var j = 1; j < zones.length; j++) {
        if (zones[j].score > bestZone.score) bestZone = zones[j];
    }
    var errorX = (Math.random() - 0.5) * 2 * params.errorMargin;
    var errorY = (Math.random() - 0.5) * 2 * (params.errorMargin * 0.6);
    var targetX = Math.max(goalLeft + 5, Math.min(goalRight - 5, bestZone.x + errorX));
    var targetY = Math.max(goalY - 5, Math.min(goalY + 5, bestZone.y + errorY));
    return { x: targetX, y: targetY };
}

// ============================================================
// AUTH
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
    if (tab === 'login') { formLogin.classList.remove('hidden'); if (tabLogin) tabLogin.classList.add('active'); }
    else if (tab === 'register') { formRegister.classList.remove('hidden'); if (tabRegister) tabRegister.classList.add('active'); }
    else if (tab === 'forgot') { formForgot.classList.remove('hidden'); }
}

function handleAuthSubmit(event, action) {
    event.preventDefault();
    if (!socket || !socket.connected) { alert('Sunucu bağlantısı yok!'); return; }
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
    console.log('🎮 Misafir girişi yapılıyor...');
    var authOverlay = document.getElementById('auth-modal-overlay');
    if (authOverlay) {
        authOverlay.style.display = 'none';
        authOverlay.classList.add('hidden');
    }
    var menu = document.getElementById('menu');
    if (menu) {
        menu.style.display = 'block';
    }
    var playerNameInput = document.getElementById('player-name');
    if (playerNameInput && (!playerNameInput.value || playerNameInput.value === 'Oyuncu')) {
        playerNameInput.value = 'Misafir_' + Math.floor(Math.random() * 1000);
    }
    console.log('✅ Misafir girişi başarılı, ana menü açıldı.');
}

// ============================================================
// AYARLAR
// ============================================================
function setMatchDuration(seconds) {
    MATCH_DURATION = seconds;
    var display = document.getElementById('match-duration-display');
    if (display) display.textContent = seconds + 'sn';
    var btns = document.querySelectorAll('.settings-option[data-duration]');
    for (var i = 0; i < btns.length; i++) {
        btns[i].classList.remove('active');
        if (parseInt(btns[i].dataset.duration) === seconds) btns[i].classList.add('active');
    }
}

function setShotDuration(seconds) {
    SHOT_DURATION = seconds;
    var display = document.getElementById('shot-duration-display');
    if (display) display.textContent = seconds + 'sn';
    var btns = document.querySelectorAll('.settings-option[data-shot-duration]');
    for (var i = 0; i < btns.length; i++) {
        btns[i].classList.remove('active');
        if (parseInt(btns[i].dataset.shotDuration) === seconds) btns[i].classList.add('active');
    }
}

function setLocalMatchDuration(seconds) {
    MATCH_DURATION = seconds;
    var btns = document.querySelectorAll('.local-time-btn[data-time]');
    for (var i = 0; i < btns.length; i++) {
        btns[i].classList.remove('active');
        if (parseInt(btns[i].dataset.time) === seconds) btns[i].classList.add('active');
    }
}

function setLocalShotDuration(seconds) {
    SHOT_DURATION = seconds;
    var btns = document.querySelectorAll('.local-time-btn[data-shot]');
    for (var i = 0; i < btns.length; i++) {
        btns[i].classList.remove('active');
        if (parseInt(btns[i].dataset.shot) === seconds) btns[i].classList.add('active');
    }
}

function toggleMatchDurationOptions() {
    var options = document.getElementById('match-duration-options');
    if (!options) return;
    var shotOptions = document.getElementById('shot-duration-options');
    var stadiumOptions = document.getElementById('stadium-options');
    if (shotOptions) { shotOptions.style.display = 'none'; shotOptions.classList.remove('show'); }
    if (stadiumOptions) { stadiumOptions.style.display = 'none'; stadiumOptions.classList.remove('show'); }
    if (options.style.display === 'none' || options.style.display === '') {
        options.style.display = 'flex';
        options.classList.add('show');
    } else {
        options.style.display = 'none';
        options.classList.remove('show');
    }
}

function toggleShotDurationOptions() {
    var options = document.getElementById('shot-duration-options');
    if (!options) return;
    var matchOptions = document.getElementById('match-duration-options');
    var stadiumOptions = document.getElementById('stadium-options');
    if (matchOptions) { matchOptions.style.display = 'none'; matchOptions.classList.remove('show'); }
    if (stadiumOptions) { stadiumOptions.style.display = 'none'; stadiumOptions.classList.remove('show'); }
    if (options.style.display === 'none' || options.style.display === '') {
        options.style.display = 'flex';
        options.classList.add('show');
    } else {
        options.style.display = 'none';
        options.classList.remove('show');
    }
}

function toggleStadiumOptions() {
    var options = document.getElementById('stadium-options');
    if (!options) return;
    var matchOptions = document.getElementById('match-duration-options');
    var shotOptions = document.getElementById('shot-duration-options');
    if (matchOptions) { matchOptions.style.display = 'none'; matchOptions.classList.remove('show'); }
    if (shotOptions) { shotOptions.style.display = 'none'; shotOptions.classList.remove('show'); }
    if (options.style.display === 'none' || options.style.display === '') {
        options.style.display = 'flex';
        options.classList.add('show');
    } else {
        options.style.display = 'none';
        options.classList.remove('show');
    }
}

function selectStadium(stadiumKey, texturePath) {
    currentStadiumTexture = texturePath;
    var previewImg = document.getElementById('selected-stadium-preview');
    if (previewImg) previewImg.src = 'menu/ayarlar/stat/' + stadiumKey + '.webp';
    var cards = document.querySelectorAll('.stadium-option-card');
    for (var i = 0; i < cards.length; i++) {
        var img = cards[i].querySelector('img');
        if (img && img.src && img.src.indexOf(stadiumKey + '.webp') !== -1) {
            cards[i].classList.add('active');
        } else {
            cards[i].classList.remove('active');
        }
    }
    loadFieldImage(texturePath);
    if (currentPhase !== 'menu') showField();
    var optionsDiv = document.getElementById('stadium-options');
    if (optionsDiv) { optionsDiv.style.display = 'none'; optionsDiv.classList.remove('show'); }
}

// ============================================================
// CANVAS OLAYLARI
// ============================================================
function getCanvasTouchPos(e) {
    var rect = canvas.getBoundingClientRect();
    var clientX, clientY;
    if (e.touches) { clientX = e.touches[0].clientX; clientY = e.touches[0].clientY; }
    else if (e.changedTouches) { clientX = e.changedTouches[0].clientX; clientY = e.changedTouches[0].clientY; }
    else { clientX = e.clientX; clientY = e.clientY; }
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    var x = (clientX - rect.left) * scaleX;
    var y = (clientY - rect.top) * scaleY;
    x = Math.max(0, Math.min(width, x));
    y = Math.max(0, Math.min(height, y));
    if (gameMode === 'online' && myTeamNumber === 2) { x = width - x; y = height - y; }
    return { x: x, y: y };
}

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
        if (!collision) { selectedPin.x = newX; selectedPin.y = newY; broadcastMyPinMove(selectedPin); }
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
        selectedPin = null;
    }
    if (currentPhase === 'playing' && isDraggingBall) {
        isDraggingBall = false;
        performShot(dragStart.x, dragStart.y, dragCurrent.x, dragCurrent.y);
        var container = document.getElementById('power-bar-container');
        if (container) container.style.display = 'none';
        var powerBar = document.getElementById('power-bar');
        if (powerBar) powerBar.style.width = '0%';
    }
});

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

// ============================================================
// ANİMASYON
// ============================================================
function animate() {
    if (currentPhase === 'menu') return;
    updatePhysics();
    draw();
    requestAnimationFrame(animate);
}

// ============================================================
// BAŞLAT
// ============================================================
loadFieldImage('menu/ayarlar/stat/texure/z1-t.webp');
preloadSounds();
loadSoundSettings();
drawFieldLinesOnly();

selectRandomTeam();
updateSelectedTeamName();
updateTeamLogoDisplay();
updateScoreLogos();
loadTeamLogoImage(selectedTeamLogo);
selectRandomAITeam();

console.log('🎮 Çivili Futbol Başlatıldı!');
console.log('⏱️ Maç Süresi: ' + MATCH_DURATION + 's');
console.log('🎯 Vuruş Süresi: ' + SHOT_DURATION + 's');
