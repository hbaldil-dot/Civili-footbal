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
// AYARLAR VE GLOBAL DEĞİŞKENLER
// ============================================================
let MATCH_DURATION = 90;
let SHOT_DURATION = 5;

const stadiumList = [
    { key: 'z1', texture: 'menu/ayarlar/stat/texure/z1-t.webp' },
    { key: 'z2', texture: 'menu/ayarlar/stat/texure/z2-t.webp' },
    { key: 'z3', texture: 'menu/ayarlar/stat/texure/z3-t.webp' },
    { key: 'z4', texture: 'menu/ayarlar/stat/texure/z4-t.webp' },
    { key: 'z5', texture: 'menu/ayarlar/stat/texure/z5-t.webp' }
];

let currentStadiumTexture = stadiumList[0].texture;

// ============================================================
// SAHA GÖSTER/GİZLE FONKSİYONLARI
// ============================================================
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

let fieldImage = null;

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
loadFieldImage();

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
    
    if (fieldImage) {
        try {
            ctx.drawImage(fieldImage, 0, 0, width, height);
        } catch(e) {
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

    if (goalAnimation) {
        const elapsed = Date.now() - goalAnimationStartTime;
        const progress = Math.min(elapsed / GOAL_ANIMATION_DURATION, 1);
        
        let scale = progress < 0.15 ? (progress / 0.15) * 1.2 : 1.2;
        let alpha = 1;
        if (progress < 0.9) {
            const blinkDuration = 0.5;
            const blinkPhase = progress / blinkDuration;
            const currentBlink = Math.floor(blinkPhase);
            const phaseInBlink = blinkPhase - currentBlink;
            
            if (currentBlink < 6) {
                alpha = phaseInBlink < 0.5 ? phaseInBlink * 2 : 1 - (phaseInBlink - 0.5) * 2;
                if (currentBlink >= 2) alpha *= 0.9;
                if (currentBlink >= 4) alpha *= 0.8;
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
// POP-UP VE MENÜ AÇMA/KAPAMA FONKSİYONLARI (DÜZELTİLDİ)
// ============================================================
function openSettingsPopup() {
    console.log('⚙️ Ayarlar menüsü açılıyor...');
    const popup = document.getElementById('settings-popup');
    if (popup) {
        popup.style.display = 'flex';
        popup.style.visibility = 'visible';
        popup.style.opacity = '1';
    } else {
        console.error('❌ settings-popup elementi bulunamadı!');
    }
}

function closeSettingsPopup() {
    console.log('⚙️ Ayarlar menüsü kapatılıyor...');
    const popup = document.getElementById('settings-popup');
    if (popup) {
        popup.style.display = 'none';
        popup.style.visibility = 'hidden';
        popup.style.opacity = '0';
    }
}

function toggleMatchDurationOptions() {
    const options = document.getElementById('match-duration-options');
    const arrow = document.querySelector('.settings-arrow');
    if (options) {
        const isHidden = options.style.display === 'none' || options.style.display === '';
        options.style.display = isHidden ? 'flex' : 'none';
        if (arrow) arrow.classList.toggle('open', isHidden);
    }
}

function setMatchDuration(seconds) {
    console.log('⏱️ Maç süresi seçildi:', seconds, 'saniye');
    MATCH_DURATION = seconds;
    
    const display = document.getElementById('match-duration-display');
    if (display) display.textContent = seconds + 'sn';
    
    document.querySelectorAll('.settings-option[data-duration]').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.duration) === seconds);
    });
    
    const options = document.getElementById('match-duration-options');
    if (options) options.style.display = 'none';
    
    if (typeof matchSecondsLeft !== 'undefined') {
        matchSecondsLeft = seconds;
        const timeBoard = document.getElementById('time-board');
        if (timeBoard) timeBoard.innerText = seconds + 's';
    }
}

function toggleShotDurationOptions() {
    const optionsDiv = document.getElementById('shot-duration-options');
    if (!optionsDiv) return;
    
    const matchOptions = document.getElementById('match-duration-options');
    if (matchOptions) matchOptions.style.display = 'none';

    optionsDiv.style.display = (optionsDiv.style.display === 'none' || optionsDiv.style.display === '') ? 'flex' : 'none';
}

function setShotDuration(seconds) {
    SHOT_DURATION = seconds;
    
    const displaySpan = document.getElementById('shot-duration-display');
    if (displaySpan) displaySpan.innerText = seconds + 'sn';

    document.querySelectorAll('#shot-duration-options .settings-option').forEach(opt => {
        opt.classList.toggle('active', parseInt(opt.getAttribute('data-shot-duration')) === seconds);
    });

    const optionsDiv = document.getElementById('shot-duration-options');
    if (optionsDiv) optionsDiv.style.display = 'none';
}

function toggleStadiumOptions() {
    const optionsDiv = document.getElementById('stadium-options');
    if (!optionsDiv) return;

    ['match-duration-options', 'shot-duration-options'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    optionsDiv.style.display = (optionsDiv.style.display === 'none' || optionsDiv.style.display === '') ? 'flex' : 'none';
}

function selectStadium(stadiumKey, texturePath) {
    currentStadiumTexture = texturePath;

    const previewImg = document.getElementById('selected-stadium-preview');
    if (previewImg) previewImg.src = `menu/ayarlar/stat/${stadiumKey}.webp`;

    document.querySelectorAll('.stadium-option-card').forEach(card => {
        const img = card.querySelector('img');
        if (img && img.src.includes(`${stadiumKey}.webp`)) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    });

    const optionsDiv = document.getElementById('stadium-options');
    if (optionsDiv) optionsDiv.style.display = 'none';

    loadFieldImage(currentStadiumTexture);
}

function openAILevelMenu() {
    document.getElementById('menu').style.display = 'none';
    document.getElementById('ai-level-menu').style.display = 'flex';
}

function closeAILevelMenu() {
    document.getElementById('ai-level-menu').style.display = 'none';
    document.getElementById('menu').style.display = 'block';
}

function toggleTeamSelect() {
    const container = document.getElementById('team-logo-container');
    if (!container) return;
    
    if (container.style.display === 'block') {
        container.style.display = 'none';
    } else {
        container.style.display = 'block';
        loadTeamLogos();
    }
}

function loadTeamLogos() {
    const container = document.getElementById('team-logo-options');
    if (!container) return;
    
    container.innerHTML = '';
    teamLogos.forEach((logo) => {
        const btn = document.createElement('button');
        btn.className = 'team-logo-btn';
        btn.title = logo.name;
        if (logo.file === selectedTeamLogo) btn.classList.add('active');
        
        const img = document.createElement('img');
        img.src = `takimlar/${logo.file}`;
        img.onerror = function() { this.src = 'takimlar/default.png'; };
        btn.appendChild(img);
        
        btn.onclick = function(e) {
            e.stopPropagation();
            selectTeamLogo(logo.file);
        };
        container.appendChild(btn);
    });
}

function selectTeamLogo(logoFile) {
    selectedTeamLogo = logoFile;
    updateTeamLogoDisplay();
    updateSelectedTeamName();
    updateScoreLogos();
    loadTeamLogoImage(logoFile);
    selectRandomAITeam();
}

function updateTeamLogoDisplay() {
    const displayImg = document.getElementById('selected-team-logo-display');
    if (displayImg) {
        displayImg.src = selectedTeamLogo ? `takimlar/${selectedTeamLogo}` : 'takimlar/default.png';
        displayImg.style.display = 'block';
    }
}

function updateSelectedTeamName() {
    const logo = teamLogos.find(l => l.file === selectedTeamLogo);
    const displayName = document.getElementById('selected-team-name-display');
    if (displayName) displayName.textContent = logo ? logo.name.replace('⚽ ', '') : 'Varsayılan';
}

function updateScoreLogos() {
    const logoP1 = document.getElementById('score-logo-p1');
    if (logoP1) {
        logoP1.src = `takimlar/${selectedTeamLogo || 'default.png'}`;
    }
    const logoP2 = document.getElementById('score-logo-p2');
    if (logoP2) {
        logoP2.src = `takimlar/${aiTeamLogo || 'default.png'}`;
    }
}

function loadTeamLogoImage(logoFile) {
    return new Promise((resolve) => {
        if (loadedLogos[logoFile]) return resolve(loadedLogos[logoFile]);
        const img = new Image();
        img.onload = () => { loadedLogos[logoFile] = img; resolve(img); };
        img.onerror = () => resolve(null);
        img.src = `takimlar/${logoFile}`;
    });
}

// Sayfa Yüklendiğinde İlk Tetikleyiciler
document.addEventListener('DOMContentLoaded', function() {
    selectRandomTeam();
    updateSelectedTeamName();
    updateTeamLogoDisplay();
    updateScoreLogos();
    loadTeamLogoImage(selectedTeamLogo);
    selectRandomAITeam();
    hideField();
    drawFieldLinesOnly();
});
