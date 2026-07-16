// ============================================================
// SOCKET BAĞLANTISI
// ============================================================
let socket = null;
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

        socket.on('connect', () => console.log('✅ Sunucuya bağlandı!'));
        socket.on('connect_error', (error) => console.warn('⚠️ Bağlantı hatası:', error));
    } catch (e) {
        console.error("❌ Socket bağlantı hatası:", e);
    }
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

let matchSecondsLeft = 90;
let timerInterval = null;
let shotSecondsLeft = 3;
let shotTimerInterval = null;
let setupSecondsLeft = 15;
let setupTimerInterval = null;
let syncInterval = null;

let cap = { x: width / 2, y: height / 2, vx: 0, vy: 0, radius: 11, friction: 0.983, rotation: 0 };
let pins = [];
let editableTeam = 1;
let selectedPin = null;
let isDraggingBall = false;
let dragStart = { x: 0, y: 0 };
let dragCurrent = { x: 0, y: 0 };
let isAiThinking = false;

const minAllowedDistance = 45;
const goalWidth = cap.radius * 2 * 3.2;
const goalHeight = 12;
const penaltyBoxW = goalWidth * 2.2;
const penaltyBoxH = height * 0.15;
const pBoxX1 = (width - penaltyBoxW) / 2;
const MAX_DRAG_DIST = cap.radius * 2 * 7;

// AI Zorluk Seviyesi (varsayılan)
let aiLevel = 'orta';

// ============================================================
// SES EFEKTLERİ
// ============================================================
const audioCtx = new(window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === 'kick') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
    } else if (type === 'hit') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.08);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
    } else if (type === 'goal') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.linearRampToValueAtTime(600, now + 0.4);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
    }
}

// ============================================================
// ÇİZİM FONKSİYONLARI
// ============================================================
function drawFieldLinesOnly() {
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect(pBoxX1, 0, penaltyBoxW, penaltyBoxH);
    ctx.strokeRect(pBoxX1, height - penaltyBoxH, penaltyBoxW, penaltyBoxH);
}

function drawRetroPlayer(x, y, team) {
    ctx.save();
    ctx.translate(x, y);
    const bodyColor = (team === 1) ? '#3498db' : '#cc0000';
    const skinColor = '#ffad87';

    ctx.fillStyle = bodyColor;
    ctx.fillRect(-14, -4, 5, 4);
    ctx.fillRect(9, -4, 5, 4);
    ctx.fillStyle = skinColor;
    ctx.fillRect(-14, -8, 4, 4);
    ctx.fillRect(10, -8, 4, 4);
    ctx.fillStyle = bodyColor;
    ctx.fillRect(-9, -2, 18, 7);
    ctx.fillRect(-6, 5, 12, 4);
    ctx.fillStyle = skinColor;
    ctx.fillRect(-3, -5, 6, 4);
    ctx.fillStyle = '#111111';
    ctx.fillRect(-4, 4, 8, 7);
    ctx.restore();
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
    ctx.fillStyle = (turn === 1) ? '#3498db' : '#cc0000';
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

function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.save();

    if (gameMode === 'online' && myTeamNumber === 2) {
        ctx.translate(width / 2, height / 2);
        ctx.rotate(Math.PI);
        ctx.translate(-width / 2, -height / 2);
    }

    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect(pBoxX1, 0, penaltyBoxW, penaltyBoxH);
    ctx.strokeRect(pBoxX1, height - penaltyBoxH, penaltyBoxW, penaltyBoxH);

    if (currentPhase === 'setup') {
        ctx.fillStyle = "rgba(46, 204, 113, 0.08)";
        ctx.strokeStyle = "rgba(46, 204, 113, 0.25)";
        ctx.lineWidth = 2;
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
            drawRetroPlayer(pin.x, pin.y, pin.team);
        }
    });

    if (currentPhase === 'playing' && isDraggingBall) {
        ctx.strokeStyle = '#2ecc71';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cap.x, cap.y);
        ctx.lineTo(cap.x + (dragStart.x - dragCurrent.x), cap.y + (dragStart.y - dragCurrent.y));
        ctx.stroke();
    }

    if (currentPhase === 'playing' && cap) {
        drawSoccerBall(cap.x, cap.y, cap.radius, cap.rotation);
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
    const levelSelect = document.getElementById('ai-level');
    let level = 'orta';
    if (levelSelect) {
        level = levelSelect.value;
    }
    
    console.log('🤖 AI Zorluk:', level);

    switch (level) {
        case 'kolay':
            return {
                accuracy: 0.4,
                power: 0.06,
                reactionDelay: 800,
                pullDistance: 50,
                fakeChance: 0.02,
                errorRate: 0.3
            };
        case 'zor':
            return {
                accuracy: 0.85,
                power: 0.13,
                reactionDelay: 400,
                pullDistance: 80,
                fakeChance: 0.15,
                errorRate: 0.05
            };
        case 'usta':
            return {
                accuracy: 0.95,
                power: 0.15,
                reactionDelay: 250,
                pullDistance: 90,
                fakeChance: 0.25,
                errorRate: 0.02
            };
        default:
            return {
                accuracy: 0.65,
                power: 0.10,
                reactionDelay: 600,
                pullDistance: 65,
                fakeChance: 0.08,
                errorRate: 0.12
            };
    }
}

function runAIMove() {
    if (currentPhase !== 'playing' || gameMode !== 'ai' || turn !== 2) return;
    if (Math.hypot(cap.vx, cap.vy) > 0.2) return;
    if (isAiThinking) return;

    isAiThinking = true;
    const params = getAIParameters();
    const target = calculateAITarget(params);
    executeAIShot(target, params);
}

function calculateAITarget(params) {
    const goalY = height - goalHeight;
    const goalCenterX = width / 2;
    const enemyPlayers = pins.filter(p => p.team === 1 && !p.isPost);

    let bestTarget = { x: goalCenterX, y: goalY };
    let bestScore = -Infinity;

    for (let i = 0; i < 5; i++) {
        const offsetX = (Math.random() - 0.5) * 60;
        const testX = goalCenterX + offsetX;
        const testY = goalY;

        let minDist = Infinity;
        enemyPlayers.forEach(p => {
            const dist = Math.hypot(testX - p.x, testY - p.y);
            if (dist < minDist) minDist = dist;
        });

        const score = (60 - Math.abs(offsetX)) + minDist * 2;
        if (score > bestScore) {
            bestScore = score;
            bestTarget = { x: testX, y: testY };
        }
    }

    const errorX = (Math.random() - 0.5) * 30 * (1 - params.accuracy);
    const errorY = (Math.random() - 0.5) * 20 * (1 - params.accuracy);

    return {
        x: bestTarget.x + errorX,
        y: bestTarget.y + errorY
    };
}

function executeAIShot(target, params) {
    const angle = Math.atan2(target.y - cap.y, target.x - cap.x);
    const power = params.power * (0.8 + Math.random() * 0.4);
    const pullDistance = params.pullDistance * (0.8 + Math.random() * 0.4);

    if (Math.random() < params.fakeChance) {
        executeFakeShot(angle, power);
        return;
    }

    setTimeout(() => {
        isDraggingBall = true;
        dragStart = { x: cap.x, y: cap.y };
        dragCurrent = { x: cap.x, y: cap.y };

        let stepCount = 0;
        const totalSteps = 8;
        const pullInterval = setInterval(() => {
            stepCount++;
            const ratio = stepCount / totalSteps;
            dragCurrent = {
                x: cap.x - Math.cos(angle) * (pullDistance * ratio),
                y: cap.y - Math.sin(angle) * (pullDistance * ratio)
            };

            if (stepCount >= totalSteps) {
                clearInterval(pullInterval);
                setTimeout(() => {
                    isDraggingBall = false;
                    isAiThinking = false;
                    playSound('kick');
                    cap.vx = (dragStart.x - dragCurrent.x) * power * 1.5;
                    cap.vy = (dragStart.y - dragCurrent.y) * power * 1.5;
                    turn = 1;
                    updateHUDTurn();
                    resetShotTimer();
                }, 150);
            }
        }, 30);
    }, params.reactionDelay);
}

function executeFakeShot(angle, power) {
    const fakeAngle = angle + (Math.random() - 0.5) * 1.5;
    const fakeDistance = 30;

    isDraggingBall = true;
    dragStart = { x: cap.x, y: cap.y };
    dragCurrent = {
        x: cap.x - Math.cos(fakeAngle) * fakeDistance,
        y: cap.y - Math.sin(fakeAngle) * fakeDistance
    };

    setTimeout(() => {
        const realAngle = angle + (Math.random() - 0.5) * 0.5;
        const realPower = power * 1.1;
        isDraggingBall = false;
        isAiThinking = false;
        playSound('kick');
        cap.vx = Math.cos(realAngle) * realPower * 60;
        cap.vy = Math.sin(realAngle) * realPower * 60;
        turn = 1;
        updateHUDTurn();
        resetShotTimer();
    }, 300);
}

// ============================================================
// SOCKET OLAY DİNLEYİCİLERİ
// ============================================================
function setupSocketListeners() {
    if (!socket) return;

    socket.on("update-lobby-players", (players) => {
        const listContainer = document.getElementById('lobby-list');
        listContainer.innerHTML = "";
        let count = 0;
        players.forEach(p => {
            if (p.id !== socket.id) {
                count++;
                const item = document.createElement('div');
                item.className = 'player-item';
                const nameSpan = document.createElement('span');
                nameSpan.innerHTML = `⚽ ${p.name}`;
                const btn = document.createElement('button');
                btn.className = 'status';
                btn.innerText = 'Davet Et';
                btn.onclick = () => {
                    btn.innerText = "Bekleniyor...";
                    btn.style.background = "#e67e22";
                    socket.emit("send-invite", p.id);
                };
                item.appendChild(nameSpan);
                item.appendChild(btn);
                listContainer.appendChild(item);
            }
        });
        if (count === 0) {
            listContainer.innerHTML = "<div style='padding:15px;color:#888;text-align:center;'>Havuz boş. Diğer telefondan da girin.</div>";
        }
    });

    socket.on("receive-invite", (data) => {
        if (confirm(`${data.fromName} seni maça davet ediyor! Kabul ediyor musun?`)) {
            socket.emit("accept-invite", data.fromId);
        }
    });

    socket.on("start-online-match", ({ roomId, team }) => {
        currentRoomId = roomId;
        myTeamNumber = team;
        document.getElementById('online-lobby').style.display = 'none';
        document.getElementById('top-bar').style.display = 'flex';
        matchSecondsLeft = parseInt(document.getElementById('match-duration').value);
        document.getElementById('time-board').innerText = matchSecondsLeft + "s";
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
                    if (count === index) {
                        p.x = x;
                        p.y = y;
                        break;
                    }
                    count++;
                }
            }
        }
    });

    socket.on("match-go", ({ pins: finalPins }) => {
        if (setupTimerInterval) clearInterval(setupTimerInterval);

        pins = [
            { x: (width - goalWidth) / 2, y: goalHeight, isPost: true },
            { x: (width + goalWidth) / 2, y: goalHeight, isPost: true },
            { x: (width - goalWidth) / 2, y: height - goalHeight, isPost: true },
            { x: (width + goalWidth) / 2, y: height - goalHeight, isPost: true }
        ];

        finalPins.forEach((p, index) => {
            let assignedTeam = p.team || (index < 11 ? 1 : 2);
            pins.push({ x: p.x, y: p.y, team: assignedTeam });
        });

        currentPhase = 'playing';
        document.getElementById('start-match-btn').style.display = 'none';
        document.getElementById('shot-timer').style.display = 'block';
        updateHUDTurn();
        startMatchTimer();
        resetShotTimer();
        animate();
    });

    socket.on("opponentShot", (shotData) => {
        if (gameMode === 'online' && currentPhase === 'playing') {
            applyShotPhysics(shotData);
            turn = shotData.player === 1 ? 2 : 1;
            updateHUDTurn();
            resetShotTimer();
        }
    });

    socket.on("correctBallPosition", (ballState) => {
        if (gameMode === 'online' && currentPhase === 'playing') {
            const diff = Math.hypot(cap.x - ballState.x, cap.y - ballState.y);
            if (diff > 30) {
                console.log(`🔄 Pozisyon düzeltiliyor: ${diff.toFixed(0)}px`);
                cap.x = ballState.x;
                cap.y = ballState.y;
                cap.vx = ballState.vx;
                cap.vy = ballState.vy;
                turn = ballState.turn;
                updateHUDTurn();
            }
        }
    });
}

if (socket) {
    setupSocketListeners();
}

// ============================================================
// OYUN FONKSİYONLARI
// ============================================================
function startLocalGame(mode) {
    gameMode = mode;
    document.getElementById('menu').style.display = 'none';
    document.getElementById('top-bar').style.display = 'flex';
    matchSecondsLeft = parseInt(document.getElementById('match-duration').value);
    document.getElementById('time-board').innerText = matchSecondsLeft + "s";
    startSetupPhase();
}

function openOnlineLobby() {
    if (!socket) {
        alert("Şu anda bir sunucuya bağlı değilsiniz!");
        return;
    }
    gameMode = 'online';
    const name = document.getElementById('player-name').value.trim() || "Oyuncu_" + Math.floor(Math.random() * 100);
    socket.emit("join-lobby", name);
    document.getElementById('menu').style.display = 'none';
    document.getElementById('online-lobby').style.display = 'block';
}

function closeOnlineLobby() {
    if (socket) socket.emit("leave-lobby");
    document.getElementById('online-lobby').style.display = 'none';
    document.getElementById('menu').style.display = 'block';
}

function startSetupPhase() {
    currentPhase = 'setup';
    score = { p1: 0, p2: 0 };
    document.getElementById('score-p1').innerText = "0";
    document.getElementById('score-p2').innerText = "0";

    const startBtn = document.getElementById('start-match-btn');
    startBtn.style.display = 'flex';
    startBtn.style.opacity = '1';
    startBtn.disabled = false;

    document.getElementById('turn-indicator').innerText = "Kadro Ayarla";
    document.getElementById('shot-timer').style.display = 'none';

    editableTeam = (gameMode === 'online') ? myTeamNumber : 1;

    pins = [
        { x: (width - goalWidth) / 2, y: goalHeight, isPost: true },
        { x: (width + goalWidth) / 2, y: goalHeight, isPost: true },
        { x: (width - goalWidth) / 2, y: height - goalHeight, isPost: true },
        { x: (width + goalWidth) / 2, y: height - goalHeight, isPost: true }
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

    blue442.forEach(p => pins.push(p));
    red442.forEach(p => pins.push(p));

    cap.x = width / 2;
    cap.y = height / 2;
    cap.vx = 0;
    cap.vy = 0;

    startSetupTimer();
    animate();
}

function confirmFormationsAndStart() {
    if (setupTimerInterval) clearInterval(setupTimerInterval);

    if (gameMode === 'online' && socket) {
        const btn = document.getElementById('start-match-btn');
        btn.innerHTML = "BEKLE";
        btn.disabled = true;

        const myPlacedPins = pins.filter(p => p.team === myTeamNumber).map(p => {
            return { x: p.x, y: p.y };
        });

        socket.emit("player-ready", { roomId: currentRoomId, team: myTeamNumber, placedPins: myPlacedPins });
    } else {
        currentPhase = 'playing';
        document.getElementById('start-match-btn').style.display = 'none';
        document.getElementById('shot-timer').style.display = 'block';
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
            document.getElementById('time-board').innerText = matchSecondsLeft + "s";
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
    shotSecondsLeft = 3;
    document.getElementById('shot-timer').innerText = `ŞUT: ${shotSecondsLeft}s`;

    if (gameMode === 'ai' && turn === 2) {
        document.getElementById('shot-timer').style.display = 'none';
        return;
    } else {
        document.getElementById('shot-timer').style.display = 'block';
    }

    shotTimerInterval = setInterval(() => {
        if (currentPhase === 'playing' && Math.hypot(cap.vx, cap.vy) <= 0.2) {
            shotSecondsLeft--;
            document.getElementById('shot-timer').innerText = `ŞUT: ${shotSecondsLeft}s`;
            if (shotSecondsLeft <= 0) {
                clearInterval(shotTimerInterval);
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
    let resultMessage = "Maç Berabere Bitti!";
    if (score.p1 > score.p2) resultMessage = gameMode === 'online' && myTeamNumber === 2 ? "Kaybettiniz!" : "Mavi Takım Kazandı! 🎉";
    else if (score.p2 > score.p1) resultMessage = gameMode === 'online' && myTeamNumber === 2 ? "Kazandınız! 🎉" : "Kırmızı Takım Kazandı! 🎉";

    alert(`SÜRE DOLDU!\nSkor: ${score.p1} - ${score.p2}\n\n${resultMessage}`);
    exitToMenu();
}

function updateHUDTurn() {
    const indicator = document.getElementById('turn-indicator');
    if (gameMode === 'online') {
        if (turn === myTeamNumber) {
            indicator.innerText = "SIRA SİZDE";
            indicator.style.borderColor = "#2ecc71";
            indicator.style.color = "#2ecc71";
        } else {
            indicator.innerText = "RAKİPTE";
            indicator.style.borderColor = "#e74c3c";
            indicator.style.color = "#e74c3c";
        }
    } else {
        indicator.innerText = turn === 1 ? "MAVİ SIRA" : "KIRMIZI SIRA";
        indicator.style.borderColor = turn === 1 ? "#3498db" : "#e74c3c";
        indicator.style.color = turn === 1 ? "#3498db" : "#e74c3c";
    }
}

function applyShotPhysics(shotData) {
    cap.vx = 0;
    cap.vy = 0;
    const dx = shotData.startX - shotData.endX;
    const dy = shotData.startY - shotData.endY;
    const force = 0.13;
    cap.vx = dx * force;
    cap.vy = dy * force;
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
        socket.emit("setup-pin-move", {
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
    if (socket) socket.emit("leave-lobby");
    currentPhase = 'menu';
    document.getElementById('menu').style.display = 'block';
    document.getElementById('top-bar').style.display = 'none';
    document.getElementById('online-lobby').style.display = 'none';
    document.getElementById('start-match-btn').style.display = 'none';
    isAiThinking = false;
    isDraggingBall = false;
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

        if (cap.x - cap.radius < 0) { cap.x = cap.radius;
            cap.vx *= -0.85;
            playSound('hit'); }
        if (cap.x + cap.radius > width) { cap.x = width - cap.radius;
            cap.vx *= -0.85;
            playSound('hit'); }

        if (cap.y - cap.radius <= goalHeight || cap.y + cap.radius >= height - goalHeight) {
            if (cap.x > (width - goalWidth) / 2 && cap.x < (width + goalWidth) / 2) {
                if (cap.y < height / 2) { score.p1++; } else { score.p2++; }

                playSound('goal');
                document.getElementById('score-p1').innerText = score.p1;
                document.getElementById('score-p2').innerText = score.p2;

                cap.x = width / 2;
                cap.y = height / 2;
                cap.vx = 0;
                cap.vy = 0;

                resetShotTimer();
                return;
            } else {
                if (cap.y - cap.radius < 0) { cap.y = cap.radius;
                    cap.vy *= -0.85;
                    playSound('hit'); }
                if (cap.y + cap.radius > height) { cap.y = height - cap.radius;
                    cap.vy *= -0.85;
                    playSound('hit'); }
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
            if (Math.hypot(cap.vx, cap.vy) < 0.1 && turn !== myTeamNumber) {
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
        }
    }, 3000);
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
        }
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (gameMode === 'ai' && turn === 2) return;

    const pos = getCanvasTouchPos(e);
    if (currentPhase === 'setup' && selectedPin) {
        selectedPin.x = pos.x;
        selectedPin.y = pos.y;
        broadcastMyPinMove(selectedPin);
    } else if (currentPhase === 'playing' && isDraggingBall) {
        let dx = pos.x - dragStart.x;
        let dy = pos.y - dragStart.y;
        let dist = Math.hypot(dx, dy);

        if (dist > MAX_DRAG_DIST) {
            dx = (dx / dist) * MAX_DRAG_DIST;
            dy = (dy / dist) * MAX_DRAG_DIST;
        }
        dragCurrent = { x: dragStart.x + dx, y: dragStart.y + dy };
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
                if (p !== selectedPin) {
                    if (p.isPost || p.team === selectedPin.team) {
                        if (Math.hypot(selectedPin.x - p.x, selectedPin.y - p.y) < minAllowedDistance) {
                            valid = false;
                            break;
                        }
                    }
                }
            }
        }
        if (!valid) {
            selectedPin.x = dragStartPinPos.x;
            selectedPin.y = dragStartPinPos.y;
        }

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

        if (gameMode === 'online' && socket) {
            const shotData = {
                player: turn,
                startX: startX,
                startY: startY,
                endX: endX,
                endY: endY,
                timestamp: Date.now()
            };
            socket.emit('playerShot', { roomId: currentRoomId, shotData: shotData });
        }

        turn = turn === 1 ? 2 : 1;
        updateHUDTurn();
        resetShotTimer();
    }
});

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const touch = e.touches[0];
    if (touch) {
        canvas.dispatchEvent(new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        }));
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const touch = e.touches[0];
    if (touch) {
        canvas.dispatchEvent(new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        }));
    }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const touch = e.changedTouches[0];
    if (touch) {
        window.dispatchEvent(new MouseEvent('mouseup', {
            clientX: touch.clientX,
            clientY: touch.clientY
        }));
    } else {
        window.dispatchEvent(new MouseEvent('mouseup'));
    }
}, { passive: false });

canvas.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new MouseEvent('mouseup'));
}, { passive: false });

// ============================================================
// BAŞLANGIÇ
// ============================================================
drawFieldLinesOnly();
console.log("🎮 Çivili Futbol Başlatıldı!");
console.log("📱 Cihaz:", navigator.userAgent);
console.log("📐 Device Pixel Ratio:", window.devicePixelRatio);
console.log("🟢 Sunucu durumu:", socket ? "Bağlı" : "Bağlı değil");

startPeriodicSync();// ============================================================
// SOCKET BAĞLANTISI
// ============================================================
let socket = null;
if (typeof io !== 'undefined') {
    socket = io(window.location.origin, {
        transports: ['websocket', 'polling'],
        reconnection: true
    });
    socket.on('connect', () => console.log('✅ Bağlandı'));
    socket.on('connect_error', (e) => console.warn('⚠️ Bağlantı hatası:', e));
}

// ============================================================
// OYUN DEĞİŞKENLERİ
// ============================================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const W = 360;
const H = 620;
canvas.width = W;
canvas.height = H;

let phase = 'menu'; // menu, setup, playing, ended
let mode = 'local';
let myTeam = 1;
let roomId = null;
let turn = 1;
let score = { p1: 0, p2: 0 };
let timeLeft = 90;
let setupTime = 15;

let ball = { x: W/2, y: H/2, vx: 0, vy: 0, r: 11, friction: 0.983, rotation: 0 };
let players = [];
let selectedPlayer = null;
let isDraggingBall = false;
let dragStart = { x: 0, y: 0 };
let dragEnd = { x: 0, y: 0 };

const GOAL_W = 42;
const GOAL_H = 12;
const MIN_DIST = 45;
const MAX_DRAG = 77;

// Renkler
let team1Color = '#3498db';
let team2Color = '#e74c3c';
let fieldColor = '#2e7d32';

// Timer'lar
let gameTimer = null;
let shotTimer = null;
let setupTimer = null;
let syncTimer = null;
let shotCount = 3;

// ============================================================
// SOCKET OLAYLARI
// ============================================================
function setupSocket() {
    if (!socket) return;

    socket.on('update-lobby', (players) => {
        const list = document.getElementById('lobby-list');
        list.innerHTML = '';
        players.forEach(p => {
            if (p.id === socket.id) return;
            const div = document.createElement('div');
            div.className = 'player-item';
            div.innerHTML = `
                <span>⚽ ${p.name}</span>
                <button class="invite-btn" onclick="invitePlayer('${p.id}')">Davet Et</button>
            `;
            list.appendChild(div);
        });
        if (list.children.length === 0) {
            list.innerHTML = '<div style="padding:15px;color:#888;text-align:center;">🏊 Havuz boş</div>';
        }
    });

    socket.on('invite-received', (data) => {
        if (confirm(`📨 ${data.from} seni maça davet ediyor!`)) {
            socket.emit('accept-invite', data.fromId);
        }
    });

    socket.on('match-start', ({ roomId, team }) => {
        myTeam = team;
        roomId = roomId;
        closeOnlineLobby();
        document.getElementById('top-bar').style.display = 'flex';
        startSetup();
    });

    socket.on('opponent-left', () => {
        alert('❌ Rakip ayrıldı');
        exitToMenu();
    });

    // === KADRO SENKRONİZASYONU ===
    socket.on('sync-player', ({ team, index, x, y }) => {
        if (phase === 'setup') {
            let count = 0;
            for (let p of players) {
                if (!p.post && p.team === team) {
                    if (count === index) {
                        p.x = x;
                        p.y = y;
                        break;
                    }
                    count++;
                }
            }
        }
    });

    socket.on('match-ready', ({ players: finalPlayers }) => {
        if (setupTimer) clearInterval(setupTimer);
        document.getElementById('start-btn').style.display = 'none';
        document.getElementById('setup-timer').style.display = 'none';
        
        players = [
            { x: (W - GOAL_W)/2, y: GOAL_H, post: true },
            { x: (W + GOAL_W)/2, y: GOAL_H, post: true },
            { x: (W - GOAL_W)/2, y: H - GOAL_H, post: true },
            { x: (W + GOAL_W)/2, y: H - GOAL_H, post: true }
        ];
        
        finalPlayers.forEach(p => {
            players.push({ x: p.x, y: p.y, team: p.team });
        });
        
        phase = 'playing';
        document.getElementById('turn-indicator').innerHTML = '⚡ SİZDE';
        startGameTimer();
        startShotTimer();
        startSync();
        animate();
    });

    // === RAKİP VURUŞU ===
    socket.on('opponent-shot', (data) => {
        if (phase === 'playing') {
            ball.vx = 0;
            ball.vy = 0;
            const dx = data.startX - data.endX;
            const dy = data.startY - data.endY;
            ball.vx = dx * 0.13;
            ball.vy = dy * 0.13;
            turn = data.player === 1 ? 2 : 1;
            updateTurn();
            resetShotTimer();
        }
    });

    // === TOP SENKRONİZASYONU ===
    socket.on('sync-ball', (data) => {
        if (phase === 'playing') {
            if (myTeam === 2) {
                ball.x = W - data.x;
                ball.y = H - data.y;
                ball.vx = -data.vx;
                ball.vy = -data.vy;
            } else {
                ball.x = data.x;
                ball.y = data.y;
                ball.vx = data.vx;
                ball.vy = data.vy;
            }
            ball.rotation = data.rotation || 0;
            turn = data.turn;
            score = data.score;
            document.getElementById('score-p1').innerHTML = score.p1;
            document.getElementById('score-p2').innerHTML = score.p2;
            updateTurn();
        }
    });
}

function invitePlayer(id) {
    socket.emit('send-invite', id);
}

// ============================================================
// OYUN FONKSİYONLARI
// ============================================================
function startLocalGame(modeType) {
    mode = modeType;
    document.getElementById('menu').style.display = 'none';
    document.getElementById('top-bar').style.display = 'flex';
    timeLeft = 90;
    document.getElementById('time-board').innerHTML = '90s';
    startSetup();
}

function openOnlineLobby() {
    if (!socket) {
        alert('⚠️ Sunucuya bağlanılamadı!');
        return;
    }
    const name = document.getElementById('player-name').value || 'Oyuncu';
    socket.emit('join-lobby', name);
    document.getElementById('menu').style.display = 'none';
    document.getElementById('online-lobby').style.display = 'flex';
}

function closeOnlineLobby() {
    if (socket) socket.emit('leave-lobby');
    document.getElementById('online-lobby').style.display = 'none';
    document.getElementById('menu').style.display = 'block';
}

function startSetup() {
    phase = 'setup';
    score = { p1: 0, p2: 0 };
    document.getElementById('score-p1').innerHTML = '0';
    document.getElementById('score-p2').innerHTML = '0';
    
    const btn = document.getElementById('start-btn');
    btn.style.display = 'flex';
    btn.innerHTML = 'BAŞLAT';
    btn.disabled = false;
    
    const timer = document.getElementById('setup-timer');
    timer.style.display = 'block';
    timer.innerHTML = '15';
    
    document.getElementById('turn-indicator').innerHTML = '📋 KADRO';
    
    // Kaleler
    players = [
        { x: (W - GOAL_W)/2, y: GOAL_H, post: true },
        { x: (W + GOAL_W)/2, y: GOAL_H, post: true },
        { x: (W - GOAL_W)/2, y: H - GOAL_H, post: true },
        { x: (W + GOAL_W)/2, y: H - GOAL_H, post: true }
    ];
    
    // Takım 1
    const t1 = [
        { x: W*0.50, y: H*0.88 }, { x: W*0.15, y: H*0.73 },
        { x: W*0.38, y: H*0.77 }, { x: W*0.62, y: H*0.77 },
        { x: W*0.85, y: H*0.73 }, { x: W*0.15, y: H*0.58 },
        { x: W*0.38, y: H*0.60 }, { x: W*0.62, y: H*0.60 },
        { x: W*0.85, y: H*0.58 }, { x: W*0.35, y: H*0.45 },
        { x: W*0.65, y: H*0.45 }
    ];
    t1.forEach(p => players.push({ x: p.x, y: p.y, team: 1 }));
    
    // Takım 2
    const t2 = [
        { x: W*0.50, y: H*0.12 }, { x: W*0.85, y: H*0.27 },
        { x: W*0.62, y: H*0.23 }, { x: W*0.38, y: H*0.23 },
        { x: W*0.15, y: H*0.27 }, { x: W*0.85, y: H*0.42 },
        { x: W*0.62, y: H*0.40 }, { x: W*0.38, y: H*0.40 },
        { x: W*0.15, y: H*0.42 }, { x: W*0.65, y: H*0.55 },
        { x: W*0.35, y: H*0.55 }
    ];
    t2.forEach(p => players.push({ x: p.x, y: p.y, team: 2 }));
    
    ball.x = W/2;
    ball.y = H/2;
    ball.vx = 0;
    ball.vy = 0;
    
    // Sayaç
    setupTime = 15;
    if (mode === 'online') {
        setupTimer = setInterval(() => {
            setupTime--;
            document.getElementById('setup-timer').innerHTML = setupTime;
            btn.innerHTML = `BAŞLAT (${setupTime}s)`;
            if (setupTime <= 0) {
                clearInterval(setupTimer);
                startMatch();
            }
        }, 1000);
    }
    
    animate();
}

function startMatch() {
    if (setupTimer) clearInterval(setupTimer);
    
    if (mode === 'online' && socket) {
        const btn = document.getElementById('start-btn');
        btn.innerHTML = '⏳ BEKLE';
        btn.disabled = true;
        
        const myPlayers = players.filter(p => p.team === myTeam && !p.post).map(p => {
            return { x: p.x, y: p.y };
        });
        socket.emit('player-ready', { roomId, team: myTeam, players: myPlayers });
    } else {
        phase = 'playing';
        document.getElementById('start-btn').style.display = 'none';
        document.getElementById('setup-timer').style.display = 'none';
        document.getElementById('turn-indicator').innerHTML = '⚡ SİZDE';
        startGameTimer();
        startShotTimer();
        animate();
    }
}

function startGameTimer() {
    if (gameTimer) clearInterval(gameTimer);
    gameTimer = setInterval(() => {
        if (phase === 'playing') {
            timeLeft--;
            document.getElementById('time-board').innerHTML = timeLeft + 's';
            if (timeLeft <= 0) endMatch();
        }
    }, 1000);
}

function startShotTimer() {
    if (shotTimer) clearInterval(shotTimer);
    shotCount = 3;
    shotTimer = setInterval(() => {
        if (phase === 'playing' && Math.hypot(ball.vx, ball.vy) < 0.2) {
            shotCount--;
            if (shotCount <= 0) {
                turn = turn === 1 ? 2 : 1;
                updateTurn();
                shotCount = 3;
            }
        }
    }, 1000);
}

function resetShotTimer() {
    shotCount = 3;
}

function updateTurn() {
    const el = document.getElementById('turn-indicator');
    if (mode === 'online') {
        if (turn === myTeam) {
            el.innerHTML = '🔥 SİZDE';
            el.style.borderColor = '#2ecc71';
            el.style.color = '#2ecc71';
        } else {
            el.innerHTML = '⏳ RAKİPTE';
            el.style.borderColor = '#e74c3c';
            el.style.color = '#e74c3c';
        }
    } else {
        el.innerHTML = turn === 1 ? '🔵 MAVİ' : '🔴 KIRMIZI';
        el.style.borderColor = turn === 1 ? '#3498db' : '#e74c3c';
        el.style.color = turn === 1 ? '#3498db' : '#e74c3c';
    }
}

function endMatch() {
    phase = 'ended';
    clearInterval(gameTimer);
    clearInterval(shotTimer);
    clearInterval(syncTimer);
    let msg = 'Berabere!';
    if (score.p1 > score.p2) msg = '🏆 Mavi Kazandı!';
    else if (score.p2 > score.p1) msg = '🏆 Kırmızı Kazandı!';
    alert(`⏰ SÜRE DOLDU!\n${score.p1} - ${score.p2}\n${msg}`);
    exitToMenu();
}

function exitToMenu() {
    clearInterval(gameTimer);
    clearInterval(shotTimer);
    clearInterval(setupTimer);
    clearInterval(syncTimer);
    if (socket) socket.emit('leave-lobby');
    phase = 'menu';
    document.getElementById('menu').style.display = 'block';
    document.getElementById('top-bar').style.display = 'none';
    document.getElementById('online-lobby').style.display = 'none';
    document.getElementById('start-btn').style.display = 'none';
    document.getElementById('setup-timer').style.display = 'none';
    isDraggingBall = false;
    drawField();
}

// ============================================================
// SENKRONİZASYON
// ============================================================
function startSync() {
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = setInterval(() => {
        if (mode === 'online' && phase === 'playing' && socket) {
            let sendBall = { ...ball };
            if (myTeam === 2) {
                sendBall.x = W - ball.x;
                sendBall.y = H - ball.y;
                sendBall.vx = -ball.vx;
                sendBall.vy = -ball.vy;
            }
            socket.emit('sync-ball', {
                roomId,
                ball: {
                    x: sendBall.x,
                    y: sendBall.y,
                    vx: sendBall.vx,
                    vy: sendBall.vy,
                    rotation: ball.rotation
                },
                turn,
                score
            });
        }
    }, 100);
}

// ============================================================
// FİZİK
// ============================================================
function updatePhysics() {
    if (phase !== 'playing') return;
    
    const steps = 16;
    for (let s = 0; s < steps; s++) {
        ball.x += ball.vx / steps;
        ball.y += ball.vy / steps;
        
        // Duvarlar
        if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx *= -0.85; }
        if (ball.x + ball.r > W) { ball.x = W - ball.r; ball.vx *= -0.85; }
        
        // Kaleler
        if (ball.y - ball.r <= GOAL_H || ball.y + ball.r >= H - GOAL_H) {
            if (ball.x > (W - GOAL_W)/2 && ball.x < (W + GOAL_W)/2) {
                if (ball.y < H/2) score.p1++;
                else score.p2++;
                document.getElementById('score-p1').innerHTML = score.p1;
                document.getElementById('score-p2').innerHTML = score.p2;
                ball.x = W/2;
                ball.y = H/2;
                ball.vx = 0;
                ball.vy = 0;
                resetShotTimer();
                return;
            } else {
                if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy *= -0.85; }
                if (ball.y + ball.r > H) { ball.y = H - ball.r; ball.vy *= -0.85; }
            }
        }
        
        // Oyuncular
        players.forEach(p => {
            if (p.post) return;
            const dist = Math.hypot(ball.x - p.x, ball.y - p.y);
            const minDist = ball.r + 8;
            if (dist < minDist) {
                const angle = Math.atan2(ball.y - p.y, ball.x - p.x);
                ball.x = p.x + Math.cos(angle) * minDist;
                ball.y = p.y + Math.sin(angle) * minDist;
                const speed = Math.hypot(ball.vx, ball.vy);
                ball.vx = Math.cos(angle) * Math.max(speed, 1.5) * 0.85;
                ball.vy = Math.sin(angle) * Math.max(speed, 1.5) * 0.85;
            }
        });
    }
    
    ball.vx *= ball.friction;
    ball.vy *= ball.friction;
    
    if (Math.hypot(ball.vx, ball.vy) > 0.15) {
        ball.rotation += (Math.sign(ball.vx) * Math.abs(ball.vx) + Math.sign(ball.vy) * Math.abs(ball.vy)) * 0.05;
    }
}

// ============================================================
// ÇİZİM
// ============================================================
function drawField() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = fieldColor;
    ctx.fillRect(0, 0, W, H);
    
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, H/2);
    ctx.lineTo(W, H/2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W/2, H/2, 45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect((W - GOAL_W*2.2)/2, 0, GOAL_W*2.2, H*0.15);
    ctx.strokeRect((W - GOAL_W*2.2)/2, H - H*0.15, GOAL_W*2.2, H*0.15);
    
    players.forEach(p => {
        if (p.post) {
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fill();
        } else {
            drawPlayer(p.x, p.y, p.team);
        }
    });
    
    if (phase === 'playing') {
        drawBall(ball.x, ball.y, ball.r, ball.rotation);
        if (isDraggingBall) {
            ctx.strokeStyle = '#2ecc71';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(ball.x, ball.y);
            ctx.lineTo(ball.x + (dragStart.x - dragEnd.x), ball.y + (dragStart.y - dragEnd.y));
            ctx.stroke();
        }
    }
}

function drawPlayer(x, y, team) {
    ctx.save();
    ctx.translate(x, y);
    const color = team === 1 ? team1Color : team2Color;
    const skin = '#ffad87';
    ctx.fillStyle = color;
    ctx.fillRect(-14, -4, 5, 4);
    ctx.fillRect(9, -4, 5, 4);
    ctx.fillStyle = skin;
    ctx.fillRect(-14, -8, 4, 4);
    ctx.fillRect(10, -8, 4, 4);
    ctx.fillStyle = color;
    ctx.fillRect(-9, -2, 18, 7);
    ctx.fillRect(-6, 5, 12, 4);
    ctx.fillStyle = skin;
    ctx.fillRect(-3, -5, 6, 4);
    ctx.fillStyle = '#111';
    ctx.fillRect(-4, 4, 8, 7);
    ctx.restore();
}

function drawBall(x, y, r, rotation) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = turn === 1 ? '#3498db' : '#e74c3c';
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

function animate() {
    if (phase === 'menu') return;
    updatePhysics();
    drawField();
    requestAnimationFrame(animate);
}

// ============================================================
// KOORDİNAT YAKALAMA
// ============================================================
function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    let x = (cx - rect.left) * sx;
    let y = (cy - rect.top) * sy;
    x = Math.max(0, Math.min(W, x));
    y = Math.max(0, Math.min(H, y));
    if (mode === 'online' && myTeam === 2) {
        x = W - x;
        y = H - y;
    }
    return { x, y };
}

// ============================================================
// MOUSE / TOUCH OLAYLARI
// ============================================================
let dragPinStart = { x: 0, y: 0 };

canvas.addEventListener('mousedown', (e) => {
    const pos = getPos(e);
    
    if (phase === 'setup') {
        const editTeam = (mode === 'online') ? myTeam : 1;
        for (let p of players) {
            if (p.post) continue;
            if (mode === 'online' && p.team !== editTeam) continue;
            if (Math.hypot(pos.x - p.x, pos.y - p.y) < 22) {
                selectedPlayer = p;
                dragPinStart = { x: p.x, y: p.y };
                break;
            }
        }
    }
    
    if (phase === 'playing') {
        if (mode === 'online' && turn !== myTeam) return;
        if (Math.hypot(ball.vx, ball.vy) > 0.2) return;
        if (Math.hypot(pos.x - ball.x, pos.y - ball.y) < 45) {
            isDraggingBall = true;
            dragStart = { x: ball.x, y: ball.y };
            dragEnd = pos;
        }
    }
});

canvas.addEventListener('mousemove', (e) => {
    const pos = getPos(e);
    
    if (phase === 'setup' && selectedPlayer) {
        selectedPlayer.x = pos.x;
        selectedPlayer.y = pos.y;
        // Online'da gönder
        if (mode === 'online' && socket) {
            let idx = 0;
            let count = 0;
            for (let p of players) {
                if (!p.post && p.team === myTeam) {
                    if (p === selectedPlayer) { idx = count; break; }
                    count++;
                }
            }
            socket.emit('sync-player', { roomId, team: myTeam, index: idx, x: pos.x, y: pos.y });
        }
    }
    
    if (phase === 'playing' && isDraggingBall) {
        let dx = pos.x - dragStart.x;
        let dy = pos.y - dragStart.y;
        let dist = Math.hypot(dx, dy);
        if (dist > MAX_DRAG) {
            dx = (dx / dist) * MAX_DRAG;
            dy = (dy / dist) * MAX_DRAG;
        }
        dragEnd = { x: dragStart.x + dx, y: dragStart.y + dy };
    }
});

window.addEventListener('mouseup', (e) => {
    if (phase === 'setup' && selectedPlayer) {
        // Geçerlilik kontrolü
        let valid = true;
        if (selectedPlayer.x < 15 || selectedPlayer.x > W - 15) valid = false;
        if (selectedPlayer.y < GOAL_H + 15 || selectedPlayer.y > H - GOAL_H - 15) valid = false;
        if (valid) {
            for (let p of players) {
                if (p === selectedPlayer) continue;
                if (p.post || p.team === selectedPlayer.team) {
                    if (Math.hypot(selectedPlayer.x - p.x, selectedPlayer.y - p.y) < MIN_DIST) {
                        valid = false;
                        break;
                    }
                }
            }
        }
        if (!valid) {
            selectedPlayer.x = dragPinStart.x;
            selectedPlayer.y = dragPinStart.y;
        }
        selectedPlayer = null;
    }
    
    if (phase === 'playing' && isDraggingBall) {
        isDraggingBall = false;
        const startX = dragStart.x;
        const startY = dragStart.y;
        const endX = dragEnd.x;
        const endY = dragEnd.y;
        
        ball.vx = (startX - endX) * 0.13;
        ball.vy = (startY - endY) * 0.13;
        
        // Online'da vuruşu gönder
        if (mode === 'online' && socket) {
            socket.emit('shot', {
                roomId,
                player: turn,
                startX,
                startY,
                endX,
                endY
            });
        }
        
        turn = turn === 1 ? 2 : 1;
        updateTurn();
        resetShotTimer();
    }
});

// Touch
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.touches[0];
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: t.clientX, clientY: t.clientY }));
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const t = e.touches[0];
    canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: t.clientX, clientY: t.clientY }));
}, { passive: false });

window.addEventListener('touchend', () => {
    window.dispatchEvent(new MouseEvent('mouseup'));
});

// ============================================================
// BAŞLANGIÇ
// ============================================================
setupSocket();
drawField();
console.log('🎮 Çivili Futbol');
console.log('🟢 Sunucu:', socket ? 'Bağlı' : 'Bağlı değil');
