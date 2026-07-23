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
// SAHA GÖSTER/GİZLE FONKSİYONLARI
// ============================================================

function showField() {
    const canvas = document.getElementById('gameCanvas');
    if (canvas) {
        canvas.style.background = fieldColor || '#2e7d32';
        canvas.style.border = '4px solid rgba(27, 94, 32, 0.4)';
        canvas.style.borderRadius = '8px';
        canvas.style.boxShadow = '0 10px 40px rgba(0, 0, 0, 0.6)';
        canvas.classList.add('canvas-active');
        console.log('✅ Saha gösteriliyor, renk:', fieldColor);
    }
}

function
