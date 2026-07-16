// ============================================================
// GELİŞMİŞ AI SİSTEMİ
// ============================================================

// AI Strateji Seviyeleri
const AI_STRATEGY = {
    AGRESSIVE: 'aggressive',    // Sürekli atağa geç
    DEFENSIVE: 'defensive',      // Savunma ağırlıklı
    BALANCED: 'balanced',        // Denge
    SMART: 'smart'              // Duruma göre karar ver
};

class AIStrategy {
    constructor(level = 'smart') {
        this.level = level;
        this.thinkingTime = 600 + Math.random() * 400; // 600-1000ms
        this.shotPower = 0.08 + Math.random() * 0.06; // 0.08-0.14
        this.decisionCount = 0;
    }

    // ============================================================
    // ANA KARAR MEKANİZMASI
    // ============================================================
    makeDecision(cap, pins, turn) {
        this.decisionCount++;
        
        // 1. Topun konumuna göre strateji seç
        const ballPosition = this.analyzeBallPosition(cap);
        
        // 2. Rakip oyuncuları analiz et
        const playerAnalysis = this.analyzePlayers(pins, turn);
        
        // 3. En iyi hedefi bul
        const bestTarget = this.findBestTarget(cap, pins, ballPosition, playerAnalysis);
        
        // 4. Vuruş gücünü hesapla
        const power = this.calculateShotPower(cap, bestTarget, ballPosition);
        
        // 5. Vuruş açısını hesapla
        const angle = this.calculateShotAngle(cap, bestTarget, playerAnalysis);
        
        return {
            targetX: bestTarget.x,
            targetY: bestTarget.y,
            power: power,
            angle: angle,
            strategy: this.level,
            shouldFake: this.shouldFakeShot()
        };
    }

    // ============================================================
    // TOP KONUM ANALİZİ
    // ============================================================
    analyzeBallPosition(cap) {
        const midY = height / 2;
        const goalY = (turn === 2) ? height - goalHeight : goalHeight;
        const distanceToGoal = Math.abs(cap.y - goalY);
        const isInMyHalf = (turn === 2) ? cap.y > midY : cap.y < midY;
        const isNearGoal = distanceToGoal < 150;
        
        return {
            distanceToGoal: distanceToGoal,
            isInMyHalf: isInMyHalf,
            isNearGoal: isNearGoal,
            zone: this.getBallZone(cap)
        };
    }

    getBallZone(cap) {
        // Sahayı 3 bölgeye ayır: sol, orta, sağ
        if (cap.x < width * 0.3) return 'left';
        if (cap.x > width * 0.7) return 'right';
        return 'center';
    }

    // ============================================================
    // OYUNCU ANALİZİ
    // ============================================================
    analyzePlayers(pins, myTeam) {
        const myPlayers = pins.filter(p => p.team === myTeam && !p.isPost);
        const enemyPlayers = pins.filter(p => p.team !== myTeam && !p.isPost);
        
        // Oyuncu yoğunluğu
        const myDensity = this.calculateDensity(myPlayers);
        const enemyDensity = this.calculateDensity(enemyPlayers);
        
        // Açık alanlar
        const openSpaces = this.findOpenSpaces(pins, myTeam);
        
        return {
            myPlayers: myPlayers,
            enemyPlayers: enemyPlayers,
            myDensity: myDensity,
            enemyDensity: enemyDensity,
            openSpaces: openSpaces
        };
    }

    calculateDensity(players) {
        // Oyuncuların sahanın hangi bölgesinde yoğunlaştığını hesapla
        const zones = { left: 0, center: 0, right: 0 };
        players.forEach(p => {
            if (p.x < width * 0.3) zones.left++;
            else if (p.x > width * 0.7) zones.right++;
            else zones.center++;
        });
        return zones;
    }

    // ============================================================
    // AÇIK ALAN BULMA
    // ============================================================
    findOpenSpaces(pins, myTeam) {
        const openSpaces = [];
        const step = 30;
        
        // Sahayı tarayarak boş alanları bul
        for (let y = goalHeight + 30; y < height - goalHeight - 30; y += step) {
            for (let x = 30; x < width - 30; x += step) {
                let isFree = true;
                for (let p of pins) {
                    if (p.isPost) continue;
                    if (Math.hypot(x - p.x, y - p.y) < 35) {
                        isFree = false;
                        break;
                    }
                }
                if (isFree) {
                    openSpaces.push({ x, y });
                }
            }
        }
        
        return openSpaces;
    }

    // ============================================================
    // EN İYİ HEDEFİ BUL
    // ============================================================
    findBestTarget(cap, pins, ballPosition, analysis) {
        const myTeam = 2; // AI her zaman takım 2
        const goalY = height - goalHeight;
        const goalCenter = width / 2;
        
        // 1. Top kaleye yakınsa direkt şut
        if (ballPosition.isNearGoal) {
            return this.getDirectShotTarget(cap);
        }
        
        // 2. Açık alanları değerlendir
        if (analysis.openSpaces.length > 0) {
            // En iyi açık alanı bul (kaleye en yakın)
            let bestSpace = analysis.openSpaces[0];
            let bestScore = -Infinity;
            
            analysis.openSpaces.forEach(space => {
                // Kaleye yakınlık + açıklık + rakip oyuncu uzaklığı
                const goalDistance = Math.hypot(space.x - goalCenter, space.y - goalY);
                const enemyDistance = Math.min(...analysis.enemyPlayers.map(p => 
                    Math.hypot(space.x - p.x, space.y - p.y)
                ));
                
                const score = (1000 - goalDistance) + (enemyDistance * 2);
                if (score > bestScore) {
                    bestScore = score;
                    bestSpace = space;
                }
            });
            
            return bestSpace;
        }
        
        // 3. Varsayılan: kaleye doğru
        return {
            x: goalCenter + (Math.random() - 0.5) * 60, // Rastgele sapma
            y: goalY
        };
    }

    // ============================================================
    // DOĞRUDAN ŞUT HEDEFİ
    // ============================================================
    getDirectShotTarget(cap) {
        const goalY = height - goalHeight;
        const goalWidth = 42; // Kale genişliği
        
        // Kalenin sağına veya soluna şut
        const side = Math.random() > 0.5 ? 1 : -1;
        const offset = (15 + Math.random() * 20) * side;
        
        return {
            x: width / 2 + offset,
            y: goalY
        };
    }

    // ============================================================
    // VURUŞ GÜCÜ HESAPLAMA
    // ============================================================
    calculateShotPower(cap, target, ballPosition) {
        let basePower = 0.08;
        
        // Top kaleye yakınsa daha sert vur
        if (ballPosition.isNearGoal) {
            basePower += 0.04;
        }
        
        // Top kendi yarı sahamdaysa daha yumuşak vur
        if (ballPosition.isInMyHalf) {
            basePower -= 0.02;
        }
        
        // Rastgele varyasyon
        const variation = (Math.random() - 0.5) * 0.02;
        
        return Math.max(0.06, Math.min(0.18, basePower + variation));
    }

    // ============================================================
    // VURUŞ AÇISI HESAPLAMA
    // ============================================================
    calculateShotAngle(cap, target, analysis) {
        // Direkt hedef açısı
        const directAngle = Math.atan2(target.y - cap.y, target.x - cap.x);
        
        // Rakip oyuncuları engellemek için açıyı değiştir
        let angleOffset = 0;
        const enemyPlayers = analysis.enemyPlayers;
        
        // En yakın rakip oyuncuyu bul
        let closestEnemy = null;
        let closestDist = Infinity;
        enemyPlayers.forEach(p => {
            const dist = Math.hypot(p.x - cap.x, p.y - cap.y);
            if (dist < closestDist) {
                closestDist = dist;
                closestEnemy = p;
            }
        });
        
        // Rakip oyuncu varsa, ondan uzaklaşacak şekilde açıyı ayarla
        if (closestEnemy && closestDist < 100) {
            const enemyAngle = Math.atan2(closestEnemy.y - cap.y, closestEnemy.x - cap.x);
            angleOffset = (enemyAngle - directAngle) * 0.5;
        }
        
        // Rastgele sapma
        const randomOffset = (Math.random() - 0.5) * 0.3;
        
        return directAngle + angleOffset + randomOffset;
    }

    // ============================================================
    // FAKE SHOT (Aldatma)
    // ============================================================
    shouldFakeShot() {
        // %10 ihtimalle fake at
        return Math.random() < 0.1;
    }

    // ============================================================
    // ALDATMA VURUŞU
    // ============================================================
    executeFakeShot(cap) {
        // Önce bir yöne çek, sonra diğer yöne vur
        const fakeDirection = (Math.random() - 0.5) * 2;
        const fakeDuration = 200; // ms
        
        // Fake hareketi
        const fakeX = cap.x + Math.cos(fakeDirection) * 30;
        const fakeY = cap.y + Math.sin(fakeDirection) * 30;
        
        // Gerçek vuruş
        setTimeout(() => {
            const realTarget = this.getDirectShotTarget(cap);
            const angle = Math.atan2(realTarget.y - cap.y, realTarget.x - cap.x);
            const power = 0.12;
            
            cap.vx = Math.cos(angle) * power * 100;
            cap.vy = Math.sin(angle) * power * 100;
        }, fakeDuration);
    }
}

// ============================================================
// YENİ AI MOVE FONKSİYONU
// ============================================================
function runAIMove() {
    if (currentPhase !== 'playing' || gameMode !== 'ai' || turn !== 2) return;
    if (Math.hypot(cap.vx, cap.vy) > 0.2) return;
    if (isAiThinking) return;

    isAiThinking = true;

    // AI stratejisini oluştur
    const aiStrategy = new AIStrategy('smart');
    
    // Karar ver
    const decision = aiStrategy.makeDecision(cap, pins, turn);
    
    // Eğer fake atacaksa
    if (decision.shouldFake) {
        aiStrategy.executeFakeShot(cap);
        isAiThinking = false;
        turn = 1;
        updateHUDTurn();
        resetShotTimer();
        return;
    }

    // Normal vuruş hazırlığı
    const targetX = decision.targetX;
    const targetY = decision.targetY;
    const angle = decision.angle;
    const power = decision.power;

    // Çekme mesafesi
    const pullDistance = 50 + Math.random() * 40;

    // Animasyonlu çekme ve vuruş
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

                // Vuruşu uygula
                cap.vx = (dragStart.x - dragCurrent.x) * power * 2;
                cap.vy = (dragStart.y - dragCurrent.y) * power * 2;

                turn = 1;
                updateHUDTurn();
                resetShotTimer();
            }, 200);
        }
    }, 40);
}
