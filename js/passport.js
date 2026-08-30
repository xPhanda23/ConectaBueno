/**
 * passport.js — Passaporte Cultural do Conecta Bueno
 * Módulo compartilhado entre o mapa (check-in) e configurações (ver
 * progresso) — mesmo padrão de accessibility.js: lógica que precisa
 * rodar igual em duas páginas diferentes vira um módulo próprio, em
 * vez de duplicada (ao contrário de toasts/modais, que são baratos o
 * bastante pra duplicar por página, ler/gravar Firestore e calcular
 * selos não é).
 * Não assume nenhum global de página (nem allSpaces, nem categoryIcons
 * do map.js) — funciona sozinho em qualquer página que o carregue
 * junto do Firebase.
 *
 * Exportado em window.CBPassport:
 *  - PASSPORT_BADGES
 *  - fetchVisitas(uid)
 *  - fetchActiveSpaces()
 *  - computeProgress(visitas, activeSpaces)
 *  - registrarVisita(space, method)
 *  - renderPassportInto(containerEl, { visitas, activeSpaces })
 */

'use strict';

(function () {
    const PASSPORT_BADGES = [
        { id: 'primeira-parada', label: 'Primeira Parada', icon: '🥇', test: ctx => ctx.visited >= 1 },
        { id: 'explorador', label: 'Explorador', icon: '🧭', test: ctx => ctx.visited >= 5 },
        { id: 'trilheiro', label: 'Trilheiro', icon: '🥾', test: ctx => ctx.categoriaCompleta('Trilha') },
        { id: 'completo', label: 'Completo', icon: '🏆', test: ctx => ctx.total > 0 && ctx.visited >= ctx.total }
    ];

    async function fetchVisitas(uid) {
        if (!uid || !window.db) return [];
        try {
            const snap = await window.db.collection('users').doc(uid).collection('visitas').get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (error) {
            console.error('❌ Passaporte — carregar visitas:', error);
            return [];
        }
    }

    async function fetchActiveSpaces() {
        if (!window.db) return [];
        try {
            const snap = await window.db.collection('espacos').where('status', '==', 'ativo').get();
            return snap.docs.map(d => ({ id: d.id, nome: d.data().nome || '', categoria: d.data().categoria || null }));
        } catch (error) {
            console.error('❌ Passaporte — carregar lugares ativos:', error);
            return [];
        }
    }

    function computeProgress(visitas, activeSpaces) {
        const visitedIds = new Set(visitas.map(v => v.lugarId));
        const total = activeSpaces.length;
        const visited = visitas.length;
        const percent = total > 0 ? Math.round((visited / total) * 100) : 0;

        const byCategory = {};
        activeSpaces.forEach(space => {
            if (!space.categoria) return;
            const bucket = byCategory[space.categoria] || (byCategory[space.categoria] = { total: 0, visited: 0 });
            bucket.total++;
            if (visitedIds.has(space.id)) bucket.visited++;
        });

        const ctx = {
            total,
            visited,
            categoriaCompleta(categoria) {
                const bucket = byCategory[categoria];
                return !!bucket && bucket.total > 0 && bucket.visited >= bucket.total;
            }
        };

        return {
            total,
            visited,
            percent,
            unlockedBadges: PASSPORT_BADGES.filter(badge => badge.test(ctx))
        };
    }

    // Idempotente por design: se o doc já existe, não escreve de novo
    // (as regras do Firestore proíbem update — só create — porque um
    // selo ganho é permanente, mesma filosofia da coleção "logs").
    async function registrarVisita(space, method) {
        if (typeof window.requireAccount === 'function' && !window.requireAccount('Registrar visita no passaporte')) {
            return false;
        }
        const user = firebase.auth().currentUser;
        if (!user) return false;

        const ref = window.db.collection('users').doc(user.uid).collection('visitas').doc(space.id);

        try {
            const existing = await ref.get();
            if (existing.exists) return true;

            await ref.set({
                lugarId: space.id,
                nome: space.nome || '',
                categoria: space.categoria || null,
                checkinAt: firebase.firestore.FieldValue.serverTimestamp(),
                method: method === 'geo' ? 'geo' : 'manual'
            });
            return true;
        } catch (error) {
            console.error('❌ Passaporte — registrar visita:', error);
            _toast(
                error?.code === 'permission-denied'
                    ? 'Sem permissão para registrar a visita.'
                    : 'Não foi possível registrar a visita agora.',
                'error'
            );
            return false;
        }
    }

    function renderPassportInto(containerEl, { visitas, activeSpaces }) {
        if (!containerEl) return;

        if (!activeSpaces.length) {
            containerEl.innerHTML = '<p class="pp-empty">Nenhum lugar cadastrado no momento.</p>';
            return;
        }

        const { total, visited, percent, unlockedBadges } = computeProgress(visitas, activeSpaces);
        const visitedIds = new Set(visitas.map(v => v.lugarId));
        const unlockedIds = new Set(unlockedBadges.map(b => b.id));

        const stampsHTML = activeSpaces.map(space => `
            <div class="pp-stamp${visitedIds.has(space.id) ? ' is-visited' : ''}" title="${_escHtml(space.nome)}">
                ${visitedIds.has(space.id) ? '✓' : ''}
            </div>
        `).join('');

        const badgesHTML = PASSPORT_BADGES.map(badge => `
            <div class="pp-badge${unlockedIds.has(badge.id) ? ' is-unlocked' : ''}">
                <span class="pp-badge__icon" aria-hidden="true">${badge.icon}</span>
                <span class="pp-badge__label">${_escHtml(badge.label)}</span>
            </div>
        `).join('');

        containerEl.innerHTML = `
            <div class="pp-progress">
                <div class="pp-progress__bar"><div class="pp-progress__fill" style="width:${percent}%"></div></div>
                <p class="pp-progress__label">${visited} de ${total} lugares visitados <span class="pp-progress__percent">(${percent}%)</span></p>
            </div>
            <div class="pp-stamp-grid">${stampsHTML}</div>
            <div class="pp-badges">${badgesHTML}</div>
        `;
    }

    function _escHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function _toast(msg, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        } else {
            console.log(`[${type}] ${msg}`);
        }
    }

    window.CBPassport = {
        PASSPORT_BADGES,
        fetchVisitas,
        fetchActiveSpaces,
        computeProgress,
        registrarVisita,
        renderPassportInto
    };
})();
