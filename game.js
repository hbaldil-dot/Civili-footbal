// ============================================================
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
