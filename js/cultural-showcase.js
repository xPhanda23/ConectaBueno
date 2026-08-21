/**
 * cultural-showcase.js
 * Vitrine Cultural reutilizável — carrega eventos em alta do Firestore
 *
 * Uso:
 *   Em login.html NÃO é necessário — auth.js já faz isso.
 *   Pode ser usado em outras páginas que queiram exibir a vitrine.
 *
 * Requisitos:
 *   - Firebase já inicializado (window.db disponível)
 *   - Elemento #eventosListaVitrine no DOM
 *   - Coleção 'events' no Firestore com campo 'startDate' (Timestamp)
 *
 * ZERO dados fake — apenas Firestore real.
 */

'use strict';

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */

/**
 * Ponto de entrada principal.
 * Aguarda Firebase antes de qualquer chamada ao Firestore.
 * Exportada no window para uso externo opcional.
 */
async function initCulturalShowcase() {
    const container = document.getElementById('eventosListaVitrine');
    if (!container) return; // página não tem vitrine, sai silenciosamente

    try {
        await _waitForFirebase(8000);
        await _loadShowcase(container);
    } catch (err) {
        console.error('cultural-showcase:', err);
        _renderError(container);
    }
}

/* ============================================================
   CARREGAMENTO — ZERO DADOS FAKE
   ============================================================ */

async function _loadShowcase(container) {
    _renderLoading(container);

    const now    = new Date();
    const future = new Date();
    future.setDate(future.getDate() + 30);

    let snap;
    try {
        snap = await window.db
            .collection('events')
            .where('startDate', '>=', now)
            .where('startDate', '<=', future)
            .orderBy('startDate', 'asc')
            .limit(6)
            .get();
    } catch (err) {
        console.error('Firestore query:', err);
        _renderError(container);
        return;
    }

    if (snap.empty) {
        _renderEmpty(container);
        return;
    }

    container.innerHTML = '';

    snap.forEach(doc => {
        const ev   = doc.data();
        const card = _buildCard(ev);
        container.appendChild(card);
    });

    console.log(`✅ Vitrine: ${snap.size} evento(s) carregado(s)`);
}

/* ============================================================
   CARD
   ============================================================ */

function _buildCard(ev) {
    const date = ev.startDate?.toDate ? ev.startDate.toDate() : null;
    const days = date ? Math.ceil((date - new Date()) / 86_400_000) : null;

    const dateStr = date
        ? date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
        : null;

    const urgente = days !== null && days <= 7;

    const card = document.createElement('div');
    card.className = 'showcase-card';

    card.innerHTML = `
        ${dateStr ? `
        <div class="showcase-date">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                <rect x="1" y="2" width="9" height="8" rx="1" stroke="currentColor" stroke-width="1.2"/>
                <path d="M3 1v1M8 1v1M1 5h9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            ${dateStr}
        </div>` : ''}

        <div class="showcase-title">${_esc(ev.title ?? 'Evento')}</div>

        ${ev.location ? `
        <div class="showcase-location">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                <path d="M5 0C3.3 0 2 1.3 2 3c0 2.5 3 7 3 7s3-4.5 3-7C8 1.3 6.7 0 5 0zm0 4.5C4.2 4.5 3.5 3.8 3.5 3S4.2 1.5 5 1.5 6.5 2.2 6.5 3 5.8 4.5 5 4.5z"/>
            </svg>
            ${_esc(ev.location)}
        </div>` : ''}

        ${days !== null ? `
        <span class="showcase-badge ${urgente ? 'urgente' : ''}">
            ${urgente ? '🔥 ' + days + (days === 1 ? ' dia' : ' dias') : '📅 Em breve'}
        </span>` : ''}

        ${ev.category ? `
        <span class="showcase-badge" style="margin-left:4px;background:rgba(45,90,61,.08);color:#2d5a3d;">
            ${_categoryIcon(ev.category)} ${_esc(ev.category)}
        </span>` : ''}
    `;

    return card;
}

/* ============================================================
   ESTADOS VISUAIS
   ============================================================ */

function _renderLoading(container) {
    container.innerHTML = `
        <div class="showcase-state">
            <div class="showcase-spinner" aria-hidden="true"></div>
            <p>Carregando eventos...</p>
        </div>
    `;
}

function _renderEmpty(container) {
    container.innerHTML = `
        <div class="showcase-state">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
                <rect x="5" y="9" width="30" height="26" rx="2" stroke="#ccc" stroke-width="1.8"/>
                <path d="M12 5v4M28 5v4M5 17h30" stroke="#ccc" stroke-width="1.8" stroke-linecap="round"/>
                <circle cx="14" cy="26" r="1.5" fill="#ccc"/>
                <circle cx="20" cy="26" r="1.5" fill="#ccc"/>
                <circle cx="26" cy="26" r="1.5" fill="#ccc"/>
            </svg>
            <p>Nenhum evento nos próximos 30 dias.</p>
            <small style="font-size:11px;color:#bbb;">Confira em breve!</small>
        </div>
    `;
}

function _renderError(container) {
    container.innerHTML = `
        <div class="showcase-state">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
                <circle cx="20" cy="20" r="17" stroke="#e0a0a0" stroke-width="1.8"/>
                <path d="M20 12v10M20 27v1" stroke="#e0a0a0" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <p>Não foi possível carregar os eventos.</p>
            <button
                style="margin-top:8px;padding:6px 14px;background:#2d5a3d;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;"
                onclick="initCulturalShowcase()"
            >
                Tentar novamente
            </button>
        </div>
    `;
}

/* ============================================================
   UTILITÁRIOS
   ============================================================ */

function _esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _categoryIcon(cat) {
    const map = {
        'Música':       '🎵',
        'Teatro':       '🎭',
        'Dança':        '💃',
        'Cinema':       '🎬',
        'Exposição':    '🖼️',
        'Festival':     '🎪',
        'Literatura':   '📚',
        'Gastronomia':  '🍽️',
        'Esporte':      '⚽',
        'Tradicional':  '🎉',
        'Cultural':     '🎨',
    };
    return map[cat] ?? '📅';
}

/** Aguarda window.db e window.auth estarem prontos */
function _waitForFirebase(timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
        if (typeof firebase !== 'undefined' && firebase.apps.length > 0 && window.db) {
            resolve();
            return;
        }
        const start = Date.now();
        const id = setInterval(() => {
            if (typeof firebase !== 'undefined' && firebase.apps.length > 0 && window.db) {
                clearInterval(id);
                resolve();
            } else if (Date.now() - start > timeoutMs) {
                clearInterval(id);
                reject(new Error('Firebase timeout'));
            }
        }, 150);
    });
}

/* ============================================================
   AUTO-INICIALIZAÇÃO
   Inicia apenas se o container existir na página atual
   e somente após o DOM + Firebase estarem prontos.
   NÃO usa DOMContentLoaded puro (resolve race condition #7).
   ============================================================ */
window.addEventListener('load', () => {
    if (document.getElementById('eventosListaVitrine')) {
        initCulturalShowcase();
    }
});

/* ============================================================
   EXPOSIÇÃO GLOBAL
   ============================================================ */
window.initCulturalShowcase = initCulturalShowcase;

console.log('✅ cultural-showcase.js carregado');
