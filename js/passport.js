/**
 * passport.js — Passaporte Cultural do Conecta Bueno
 * Módulo compartilhado entre TODAS as páginas com header (mapa,
 * início, eventos, observatório, configurações) — mesmo padrão de
 * accessibility.js/shared-components.js: lógica que precisa rodar
 * igual em várias páginas vira um módulo próprio, em vez de
 * duplicada (ao contrário de toasts/modais, que são baratos o
 * bastante pra duplicar por página, ler/gravar Firestore, calcular
 * selos e desenhar o modal não é).
 * Não assume nenhum global de página (nem allSpaces, nem categoryIcons
 * do map.js) — funciona sozinho em qualquer página que o carregue
 * junto do Firebase. Se a página tiver #passportModal + #menuPassaporte
 * no header, o módulo já se auto-inicializa (abrir/fechar modal) sem
 * precisar de nenhum JS extra na página.
 *
 * Exportado em window.CBPassport:
 *  - PASSPORT_BADGES
 *  - fetchVisitas(uid)
 *  - fetchActiveSpaces()
 *  - computeProgress(visitas, activeSpaces)
 *  - registrarVisita(space, method)
 *  - registrarVisitaComProgresso(space, method) — como acima, mas também
 *    retorna quais selos foram desbloqueados nessa visita (pra celebrar)
 *  - renderPassportInto(containerEl, { visitas, activeSpaces })
 *  - openPassportModal() / closePassportModal() / initPassportModal()
 */

'use strict';

(function () {
    // Mesmas categorias usadas em map.js (categoryIcons) — duplicado de
    // propósito: este módulo não pode depender de globais de outra página.
    const CATEGORY_ICONS = {
        'Cachoeira': '💧',
        'Montanha': '⛰️',
        'Trilha': '🥾',
        'Mirante': '👁️',
        'Parque': '🌳',
        'Cultura': '🎭',
        'Gastronomia': '🍴',
        'Hotel': '🏨',
        'Comercio': '🛍️'
    };

    const PASSPORT_BADGES = [
        {
            id: 'primeira-parada', label: 'Primeira Parada', icon: '🥇',
            description: 'Registre sua primeira visita no passaporte.',
            test: ctx => ctx.visited >= 1,
            progress: ctx => ({ current: ctx.visited, target: 1 })
        },
        {
            id: 'explorador', label: 'Explorador', icon: '🧭',
            description: 'Visite 5 lugares diferentes.',
            test: ctx => ctx.visited >= 5,
            progress: ctx => ({ current: ctx.visited, target: 5 })
        },
        {
            id: 'aventureiro', label: 'Aventureiro', icon: '🏕️',
            description: 'Visite 10 lugares diferentes.',
            test: ctx => ctx.visited >= 10,
            progress: ctx => ({ current: ctx.visited, target: 10 })
        },
        {
            id: 'trilheiro', label: 'Trilheiro', icon: '🥾',
            description: 'Complete todas as trilhas cadastradas.',
            test: ctx => ctx.categoriaCompleta('Trilha'),
            progress: ctx => ctx.categoriaProgress('Trilha')
        },
        {
            id: 'cacador-cachoeiras', label: 'Caçador de Cachoeiras', icon: '💧',
            description: 'Visite todas as cachoeiras cadastradas.',
            test: ctx => ctx.categoriaCompleta('Cachoeira'),
            progress: ctx => ctx.categoriaProgress('Cachoeira')
        },
        {
            id: 'gourmet-local', label: 'Gourmet Local', icon: '🍴',
            description: 'Experimente toda a gastronomia local cadastrada.',
            test: ctx => ctx.categoriaCompleta('Gastronomia'),
            progress: ctx => ctx.categoriaProgress('Gastronomia')
        },
        {
            id: 'guardiao-cultura', label: 'Guardião da Cultura', icon: '🎭',
            description: 'Visite todos os pontos culturais cadastrados.',
            test: ctx => ctx.categoriaCompleta('Cultura'),
            progress: ctx => ctx.categoriaProgress('Cultura')
        },
        {
            id: 'visitante-fiel', label: 'Visitante Fiel', icon: '📅',
            description: 'Registre visitas em 3 dias diferentes.',
            test: ctx => ctx.diasDistintos >= 3,
            progress: ctx => ({ current: ctx.diasDistintos, target: 3 })
        },
        {
            id: 'lenda-bueno', label: 'Lenda de Bueno', icon: '🏆',
            description: 'Visite todos os lugares cadastrados na cidade.',
            test: ctx => ctx.total > 0 && ctx.visited >= ctx.total,
            progress: ctx => ({ current: ctx.visited, target: ctx.total })
        }
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

    function _toDateKey(timestamp) {
        if (!timestamp) return null;
        const date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
        if (Number.isNaN(date.getTime())) return null;
        return date.toISOString().slice(0, 10);
    }

    function _formatDate(timestamp) {
        if (!timestamp) return '';
        const date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleDateString('pt-BR');
    }

    function _computeLevel(percent) {
        if (percent >= 100) return { label: 'Lenda de Bueno', icon: '🏆' };
        if (percent >= 50) return { label: 'Guia da Serra', icon: '🗺️' };
        if (percent >= 20) return { label: 'Explorador Local', icon: '🧭' };
        return { label: 'Iniciante', icon: '🌱' };
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

        const diasDistintos = new Set(visitas.map(v => _toDateKey(v.checkinAt)).filter(Boolean)).size;

        const ctx = {
            total,
            visited,
            diasDistintos,
            categoriaCompleta(categoria) {
                const bucket = byCategory[categoria];
                return !!bucket && bucket.total > 0 && bucket.visited >= bucket.total;
            },
            categoriaProgress(categoria) {
                const bucket = byCategory[categoria];
                return { current: bucket ? bucket.visited : 0, target: bucket ? bucket.total : 0 };
            }
        };

        const badgeStatus = PASSPORT_BADGES.map(badge => {
            const unlocked = badge.test(ctx);
            const prog = typeof badge.progress === 'function' ? badge.progress(ctx) : null;
            return {
                id: badge.id,
                label: badge.label,
                icon: badge.icon,
                description: badge.description || '',
                unlocked,
                current: prog ? Math.min(prog.current, prog.target) : null,
                target: prog ? prog.target : null
            };
        });

        const unlockedBadges = badgeStatus.filter(b => b.unlocked);
        const nextBadge = badgeStatus
            .filter(b => !b.unlocked && b.target > 0)
            .sort((a, b) => (a.target - a.current) - (b.target - b.current))[0] || null;

        return {
            total,
            visited,
            percent,
            diasDistintos,
            level: _computeLevel(percent),
            badgeStatus,
            unlockedBadges,
            nextBadge
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

    // Mesma escrita de registrarVisita, mas compara o progresso de selos
    // antes/depois pra dizer ao chamador quais selos acabaram de ser
    // desbloqueados — usado pra celebrar o check-in (toast de selo novo)
    // sem duplicar a lógica de comparação em cada página que faz check-in.
    async function registrarVisitaComProgresso(space, method) {
        const user = firebase.auth().currentUser;
        if (!user) return { ok: false, novosSelos: [] };

        let antes = null;
        try {
            const [visitasAntes, activeSpaces] = await Promise.all([fetchVisitas(user.uid), fetchActiveSpaces()]);
            antes = { visitas: visitasAntes, activeSpaces, progress: computeProgress(visitasAntes, activeSpaces) };
        } catch {
            antes = null;
        }

        const ok = await registrarVisita(space, method);
        if (!ok || !antes) return { ok, novosSelos: [] };

        const jaTinha = antes.visitas.some(v => v.lugarId === space.id);
        const visitasDepois = jaTinha
            ? antes.visitas
            : [...antes.visitas, { lugarId: space.id, categoria: space.categoria || null, checkinAt: new Date() }];
        const depois = computeProgress(visitasDepois, antes.activeSpaces);

        const idsAntes = new Set(antes.progress.unlockedBadges.map(b => b.id));
        const novosSelos = depois.unlockedBadges.filter(b => !idsAntes.has(b.id));

        document.dispatchEvent(new CustomEvent('cbpassport:checkin', { detail: { space, novosSelos } }));

        return { ok, novosSelos };
    }

    function _shareProgress({ visited, total, percent }) {
        const text = `🎫 Já visitei ${visited} de ${total} lugares em Bueno Brandão (${percent}%) no Passaporte Cultural do Conecta Bueno!`;

        if (navigator.share) {
            navigator.share({ title: 'Passaporte Cultural — Conecta Bueno', text }).catch(() => {});
            return;
        }
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text)
                .then(() => _toast('Progresso copiado! Cole onde quiser compartilhar.', 'success'))
                .catch(() => _toast('Não foi possível copiar o progresso.', 'error'));
            return;
        }
        _toast(text, 'info');
    }

    function renderPassportInto(containerEl, { visitas, activeSpaces }) {
        if (!containerEl) return;

        if (!activeSpaces.length) {
            containerEl.innerHTML = '<p class="pp-empty">Nenhum lugar cadastrado no momento.</p>';
            return;
        }

        const { total, visited, percent, level, badgeStatus, nextBadge } = computeProgress(visitas, activeSpaces);
        const visitedMap = new Map(visitas.map(v => [v.lugarId, v]));

        const groups = new Map();
        activeSpaces.forEach(space => {
            const categoria = space.categoria || 'Outros';
            if (!groups.has(categoria)) groups.set(categoria, []);
            groups.get(categoria).push(space);
        });

        const stampGroupsHTML = Array.from(groups.entries()).map(([categoria, spaces]) => {
            const visitedCount = spaces.filter(s => visitedMap.has(s.id)).length;
            const stampsHTML = spaces.map(space => {
                const visita = visitedMap.get(space.id);
                const isVisited = !!visita;
                const title = isVisited && visita.checkinAt
                    ? `${space.nome} — visitado em ${_formatDate(visita.checkinAt)}`
                    : space.nome;
                return `
                    <div class="pp-stamp${isVisited ? ' is-visited' : ''}" title="${_escHtml(title)}">
                        ${isVisited ? '✓' : ''}
                    </div>
                `;
            }).join('');

            return `
                <div class="pp-category">
                    <div class="pp-category__head">
                        <span class="pp-category__icon" aria-hidden="true">${CATEGORY_ICONS[categoria] || '📍'}</span>
                        <span class="pp-category__label">${_escHtml(categoria)}</span>
                        <span class="pp-category__count">${visitedCount}/${spaces.length}</span>
                    </div>
                    <div class="pp-stamp-grid">${stampsHTML}</div>
                </div>
            `;
        }).join('');

        const badgesHTML = badgeStatus.map(badge => `
            <div class="pp-badge${badge.unlocked ? ' is-unlocked' : ''}" title="${_escHtml(badge.description)}">
                <span class="pp-badge__icon" aria-hidden="true">${badge.icon}</span>
                <span class="pp-badge__label">${_escHtml(badge.label)}</span>
                ${!badge.unlocked && badge.target ? `<span class="pp-badge__progress">${badge.current}/${badge.target}</span>` : ''}
            </div>
        `).join('');

        const nextBadgeHTML = nextBadge ? `
            <div class="pp-next">
                <span class="pp-next__icon" aria-hidden="true">${nextBadge.icon}</span>
                <p class="pp-next__text">Faltam <strong>${nextBadge.target - nextBadge.current}</strong> para o selo <strong>${_escHtml(nextBadge.label)}</strong></p>
            </div>
        ` : '';

        containerEl.innerHTML = `
            <div class="pp-level">
                <span class="pp-level__icon" aria-hidden="true">${level.icon}</span>
                <span class="pp-level__label">${_escHtml(level.label)}</span>
            </div>
            <div class="pp-progress">
                <div class="pp-progress__bar"><div class="pp-progress__fill" style="width:${percent}%"></div></div>
                <p class="pp-progress__label">${visited} de ${total} lugares visitados <span class="pp-progress__percent">(${percent}%)</span></p>
            </div>
            ${nextBadgeHTML}
            <div class="pp-stamp-groups">${stampGroupsHTML}</div>
            <div class="pp-badges">${badgesHTML}</div>
            <button type="button" class="pp-share" id="ppShareBtn">📤 Compartilhar meu progresso</button>
        `;

        containerEl.querySelector('#ppShareBtn')?.addEventListener('click', () => _shareProgress({ visited, total, percent }));
    }

    function openPassportModal() {
        const modal = document.getElementById('passportModal');
        const body = document.getElementById('passportModalBody');
        if (!modal || !body) return;

        modal.hidden = false;
        body.innerHTML = '<p class="pp-empty">Carregando...</p>';

        const user = firebase.auth().currentUser;
        if (!user || user.isAnonymous) {
            body.innerHTML = '<p class="pp-empty">Entre com uma conta permanente para acompanhar seu passaporte cultural.</p>';
            return;
        }

        Promise.all([fetchVisitas(user.uid), fetchActiveSpaces()])
            .then(([visitas, activeSpaces]) => {
                renderPassportInto(body, { visitas, activeSpaces });
                document.dispatchEvent(new CustomEvent('cbpassport:loaded', { detail: { visitas, activeSpaces } }));
            })
            .catch(() => {
                body.innerHTML = '<p class="pp-empty">Não foi possível carregar seu passaporte agora.</p>';
            });
    }

    function closePassportModal() {
        const modal = document.getElementById('passportModal');
        if (modal) modal.hidden = true;
    }

    function initPassportModal() {
        const modal = document.getElementById('passportModal');
        const menuBtn = document.getElementById('menuPassaporte');
        if (!modal || !menuBtn) return;

        menuBtn.addEventListener('click', openPassportModal);
        document.getElementById('passportModalClose')?.addEventListener('click', closePassportModal);
        modal.addEventListener('click', event => {
            if (event.target.id === 'passportModal') closePassportModal();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !modal.hidden) closePassportModal();
        });
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

    // Auto-inicialização: qualquer página com #passportModal + #menuPassaporte
    // no header ganha o modal funcionando sem precisar de JS próprio.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPassportModal);
    } else {
        initPassportModal();
    }

    window.CBPassport = {
        PASSPORT_BADGES,
        fetchVisitas,
        fetchActiveSpaces,
        computeProgress,
        registrarVisita,
        registrarVisitaComProgresso,
        renderPassportInto,
        openPassportModal,
        closePassportModal,
        initPassportModal
    };
})();
