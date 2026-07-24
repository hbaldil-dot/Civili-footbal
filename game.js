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
// SABİT SÜRELER
// ============================================================
const MATCH_DURATION = 90;
const SHOT_DURATION = 5;

// ============================================================
// SAHA GÖSTER/GİZLE FONKSİYONLARI
// ============================================================

function showField() {
    const canvas = document.getElementById('gameCanvas');
    if (canvas) {
        canvas.style.backgroundImage = "url('C6821ED1-5AA6-4147-9DF8-2B2F30C479C8.webp')";
        canvas.style.backgroundSize = "cover";
        canvas.style.backgroundPosition = "center";
        canvas.style.backgroundRepeat = "no-repeat";
        canvas.style.backgroundColor = "#2e7d32";
        canvas.style.border = '4px solid rgba(27, 94, 32, 0.4)';
        canvas.style.borderRadius = '8px';
        canvas.style.boxShadow = '0 10px 40px rgba(0, 0, 0, 0.6)';
        canvas.classList.add('canvas-active');
        console.log('✅ Saha gösteriliyor');
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
// TAKIM LOGO DEĞİŞKENLERİ
// ============================================================
let selectedTeamLogo = '';
let aiTeamLogo = '';
let isTeamSelectOpen = false;
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

let matchSecondsLeft = MATCH_DURATION;
let timerInterval = null;
let shotSecondsLeft = SHOT_DURATION;
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
const MAX_DRAG_DIST = cap.radius * 2 * 6;

let aiLevel = 'orta';

let goalAnimation = null;
let goalAnimationStartTime = 0;
const GOAL_ANIMATION_DURATION = 3000;
let goalImage = null;

// SAHA RESMİ
let fieldImage = null;

function loadFieldImage() {
    console.log('🔄 Saha resmi yükleniyor...');
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
    img.src = 'C6821ED1-5AA6-4147-9DF8-2B2F30C479C8.webp';
}
loadFieldImage();

// ============================================================
// FOTOĞRAF YÜKLEME
// ============================================================
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
    playSound('goal');
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
    
    // SAHA ARKA PLANI
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

    // SAHA ÇİZGİLERİ - 2 KAT KALIN
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
            ctx.strokeStyle = 'rgba(46, 204, 113, 0.4)';
            ctx.lineWidth = 2;
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

    // GOL ANİMASYONU
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
    const levelSelect = document.getElementById('ai-level');
    let level = levelSelect ? levelSelect.value : 'orta';
    switch (level) {
        case 'kolay': return { accuracy: 0.4, power: 0.06, reactionDelay: 800, pullDistance: 50, fakeChance: 0.02 };
        case 'zor': return { accuracy: 0.85, power: 0.13, reactionDelay: 400, pullDistance: 80, fakeChance: 0.15 };
        case 'usta': return { accuracy: 0.95, power: 0.15, reactionDelay: 250, pullDistance: 90, fakeChance: 0.25 };
        default: return { accuracy: 0.65, power: 0.10, reactionDelay: 600, pullDistance: 65, fakeChance: 0.08 };
    }
}

function runAIMove() {
    if (currentPhase !== 'playing' || gameMode !== 'ai' || turn !== 2) return;
    if (Math.hypot(cap.vx, cap.vy) > 0.2 || isAiThinking) return;
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
        if (score > bestScore) { bestScore = score; bestTarget = { x: testX, y: testY }; }
    }
    const errorX = (Math.random() - 0.5) * 30 * (1 - params.accuracy);
    const errorY = (Math.random() - 0.5) * 20 * (1 - params.accuracy);
    return { x: bestTarget.x + errorX, y: bestTarget.y + errorY };
}

function executeAIShot(target, params) {
    const angle = Math.atan2(target.y - cap.y, target.x - cap.x);
    const pullDistance = Math.min(params.pullDistance * (0.8 + Math.random() * 0.4), MAX_DRAG_DIST);
    setTimeout(() => {
        isDraggingBall = true;
        dragStart = { x: cap.x, y: cap.y };
        dragCurrent = { x: cap.x, y: cap.y };
        let stepCount = 0;
        const totalSteps = 8;
        const pullInterval = setInterval(() => {
            stepCount++;
            const ratio = stepCount / totalSteps;
            const currentPull = Math.min(pullDistance * ratio, MAX_DRAG_DIST);
            dragCurrent = { x: cap.x - Math.cos(angle) * currentPull, y: cap.y - Math.sin(angle) * currentPull };
            if (stepCount >= totalSteps) {
                clearInterval(pullInterval);
                setTimeout(() => {
                    isDraggingBall = false;
                    isAiThinking = false;
                    playSound('kick');
                    cap.vx = (dragStart.x - dragCurrent.x) * 0.13;
                    cap.vy = (dragStart.y - dragCurrent.y) * 0.13;
                    turn = 1;
                    updateHUDTurn();
                    resetShotTimer();
                }, 150);
            }
        }, 30);
    }, params.reactionDelay);
}

// ============================================================
// ONLINE - OYUNCU BİLGİLERİ
// ============================================================
function getPlayerData() {
    const name = document.getElementById('player-name').value.trim() || "Oyuncu_" + Math.floor(Math.random() * 100);
    return {
        name: name,
        logo: selectedTeamLogo || 'default.png'
    };
}

// ============================================================
// SOCKET OLAY DİNLEYİCİLERİ
// ============================================================
function setupSocketListeners() {
    if (!socket) return;
    
    socket.on("update-lobby-players", (players) => {
        const listContainer = document.getElementById('lobby-list');
        if (!listContainer) return;
        listContainer.innerHTML = "";
        let count = 0;
        players.forEach(p => {
            if (p.id !== socket.id) {
                count++;
                const item = document.createElement('div');
                item.className = 'player-item';
                
                const infoSpan = document.createElement('span');
                const logoImg = document.createElement('img');
                logoImg.src = `takimlar/${p.logo || 'default.png'}`;
                logoImg.className = 'lobby-logo';
                logoImg.onerror = function() { this.src = 'takimlar/default.png'; };
                infoSpan.appendChild(logoImg);
                
                const nameSpan = document.createElement('span');
                nameSpan.textContent = ` ${p.name}`;
                infoSpan.appendChild(nameSpan);
                
                const btn = document.createElement('button');
                btn.className = 'status';
                btn.innerText = 'Davet Et';
                btn.onclick = () => {
                    btn.innerText = "Bekleniyor...";
                    btn.style.background = "#e67e22";
                    socket.emit("send-invite", p.id);
                };
                item.appendChild(infoSpan);
                item.appendChild(btn);
                listContainer.appendChild(item);
            }
        });
        if (count === 0) {
            listContainer.innerHTML = "<div style='padding:15px;color:#888;text-align:center;'>Havuz boş.</div>";
        }
    });
    
    socket.on("receive-invite", (data) => {
        if (confirm(`${data.fromName} seni maça davet ediyor! Kabul ediyor musun?`)) {
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
}
if (socket) setupSocketListeners();

// ============================================================
// OYUN FONKSİYONLARI
// ============================================================
function startLocalGame(mode, aiLevelParam) {
    gameMode = mode;
    if (mode === 'ai' && aiLevelParam) {
        aiLevel = aiLevelParam;
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
    if (!socket) { alert("Şu anda bir sunucuya bağlı değilsiniz!"); return; }
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
            if (shotSecondsLeft <= 0) {
                clearInterval(shotTimerInterval);
                if (shotTimer) shotTimer.classList.remove('warning');
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
    if (gameMode === 'online') {
        if (turn === myTeamNumber) {
            indicator.innerText = "🔥 SIRA SİZDE";
            indicator.style.borderColor = "#2ecc71";
            indicator.style.color = "#2ecc71";
        } else {
            indicator.innerText = "⏳ RAKİPTE";
            indicator.style.borderColor = "#e74c3c";
            indicator.style.color = "#e74c3c";
        }
    } else {
        indicator.innerText = turn === 1 ? "🔵 SİZ" : "🔴 BİLGİSAYAR";
        indicator.style.borderColor = turn === 1 ? "#3498db" : "#e74c3c";
        indicator.style.color = turn === 1 ? "#3498db" : "#e74c3c";
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
        socket.emit("setup-pin-move", { roomId: currentRoomId, team: myTeamNumber, index: index, x: pin.x, y: pin.y });
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
// BİLGİ GÖSTERİCİ
// ============================================================
function showGameInfo() {
    alert('⚙️ Oyun Bilgileri\n\n⏱️ Maç Süresi: 90 saniye\n🎯 Vuruş Süresi: 5 saniye\n🟢 Saha: Özel zemin\n🏆 Takım: Seçtiğiniz logo');
}

// ============================================================
// BAŞLANGIÇ
// ============================================================
drawFieldLinesOnly();
console.log("🎮 Çivili Futbol Başlatıldı!");
console.log("⏱️ Maç Süresi: " + MATCH_DURATION + " saniye");
console.log("🎯 Vuruş Süresi: " + SHOT_DURATION + " saniye");
startPeriodicSync();

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
        } else if (gameMode === 'online' && myTeamNumber === 2) {
            logoP1.src = `takimlar/${aiTeamLogo || 'default.png'}`;
        } else {
            logoP1.src = selectedTeamLogo ? `takimlar/${selectedTeamLogo}` : 'takimlar/default.png';
        }
        logoP1.onerror = function() { this.src = 'takimlar/default.png'; };
    }
    
    const logoP2 = document.getElementById('score-logo-p2');
    if (logoP2) {
        if (gameMode === 'local' && localPlayer2Logo) {
            logoP2.src = `takimlar/${localPlayer2Logo}`;
        } else if (gameMode === 'online' && myTeamNumber === 1) {
            logoP2.src = `takimlar/${aiTeamLogo || 'default.png'}`;
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
    localP1Selected = false;
    localP2Selected = false;
    localPlayer1Logo = '';
    localPlayer2Logo = '';
    document.getElementById('local-p1-name').textContent = 'Seçilmedi';
    document.getElementById('local-p1-name').style.color = '#888';
    document.getElementById('local-p2-name').textContent = 'Seçilmedi';
    document.getElementById('local-p2-name').style.color = '#888';
    loadLocalTeamLogos();
}

function closeLocalTeamSelect() {
    document.getElementById('local-team-select').style.display = 'none';
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
        btn1.onclick = function() { selectLocalTeam(1, logo.file); };
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
        btn2.onclick = function() { selectLocalTeam(2, logo.file); };
        container2.appendChild(btn2);
    });
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
        
        const logo = teamLogos.find(l => l.file === logoFile);
        document.getElementById('local-p1-name').textContent = logo ? logo.name.replace('⚽ ', '') : 'Seçildi';
        document.getElementById('local-p1-name').style.color = '#3498db';
        
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
        
        const logo = teamLogos.find(l => l.file === logoFile);
        document.getElementById('local-p2-name').textContent = logo ? logo.name.replace('⚽ ', '') : 'Seçildi';
        document.getElementById('local-p2-name').style.color = '#e74c3c';
    }
}

function startLocalGameWithTeams() {
    console.log('🚀 2 Kişilik maç başlatılıyor...');
    
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
    
    startSetupPhase();
}

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', function() {
    selectRandomTeam();
    updateSelectedTeamName();
    updateTeamLogoDisplay();
    updateScoreLogos();
    loadTeamLogoImage(selectedTeamLogo);
    selectRandomAITeam();
    hideField();
});

// ============================================================
// ZORLUK SEÇİMİ
// ============================================================
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
// AYARLAR - FONKSİYONLAR
// ============================================================

// Global değişkenler
let selectedMatchDuration = 90;
let selectedShotDuration = 5;
let selectedStadium = 'default';
let selectedSound = 'on';

// ============================================================
// MAÇ SÜRESİ FONKSİYONLARI
// ============================================================

// Seçenekleri aç/kapa
function toggleMatchDurationOptions() {
    const options = document.getElementById('match-duration-options');
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

// Maç süresi seç
function setMatchDuration(seconds) {
    console.log('⏱️ Maç süresi seçildi:', seconds, 'saniye');
    
    // Seçilen değeri güncelle
    const display = document.getElementById('match-duration-display');
    if (display) {
        display.textContent = seconds + 'sn';
    }
    
    // Aktif butonu güncelle
    document.querySelectorAll('.settings-option[data-duration]').forEach(btn => {
        btn.classList.remove('active');
        if (parseInt(btn.dataset.duration) === seconds) {
            btn.classList.add('active');
        }
    });
    
    // MATCH_DURATION sabitini güncelle
    window.MATCH_DURATION = seconds;
    
    // Seçenekleri kapat
    const options = document.getElementById('match-duration-options');
    if (options) {
        options.style.display = 'none';
        options.classList.remove('show');
    }
    
    console.log('✅ Maç süresi güncellendi:', seconds, 'sn');
}

// ============================================================
// BAŞLANGIÇ - Varsayılan Değer
// ============================================================

// Varsayılan maç süresi
window.MATCH_DURATION = 90;
console.log('⏱️ Varsayılan maç süresi:', window.MATCH_DURATION, 'sn');
