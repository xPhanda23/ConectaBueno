/**
 * eventos.js — Agenda Cultural — Conecta Bueno
 * Lê as coleções 'eventos' e 'noticias' do Firestore.
 */

'use strict';

// ─────────────────────────────────────────────────────────────────
// ESTADO GLOBAL
// ─────────────────────────────────────────────────────────────────

let db, auth;
let currentUser     = null;
let allEventos      = [];   // todos do Firestore
let filteredEventos = [];   // após filtros e busca
let currentPage     = 0;
const PAGE_SIZE     = 12;

let activePeriod = 'todos';
let activeCat    = 'todos';
let searchQuery  = '';
let currentView  = 'grid'; // 'grid' | 'timeline'

// Favoritos (IDs salvos no Firestore por usuário)
let userFavorites = new Set();

// ─────────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────────

window.addEventListener('load', async () => {
    await waitForFirebase();
    db   = window.db;
    auth = window.auth;

    if (!db || !auth) {
        showErrorState('Não foi possível conectar ao servidor.');
        return;
    }

    // Nenhuma tela de login na entrada: garante uma sessão (anônima, se
    // preciso) apenas para satisfazer as regras do Firestore, sem nunca
    // navegar para login.html. Se já existir conta real logada, a função
    // detecta isso e não mexe na sessão.
    if (typeof garantirSessaoVisitante === 'function') {
        await garantirSessaoVisitante();
    }

    auth.onAuthStateChanged(async (user) => {
        if (user) {
            await loadUserProfile(user);
        }
        setupListeners();
        hideLoading();
        await Promise.all([loadEventos(), loadNoticias()]);
        openEventFromQuery();
    });
});

function hideLoading() {
    const el = document.getElementById('loadingOverlay');
    if (!el) return;
    el.style.opacity = '0';
    setTimeout(() => { el.style.display = 'none'; el.setAttribute('aria-hidden', 'true'); }, 350);
}

function waitForFirebase(ms = 6000) {
    return new Promise(resolve => {
        if (window.db && window.auth) { resolve(); return; }
        const t0 = Date.now();
        const id = setInterval(() => {
            if (window.db && window.auth)    { clearInterval(id); resolve(); return; }
            if (Date.now() - t0 > ms)         { clearInterval(id); resolve(); }
        }, 100);
    });
}

// ─────────────────────────────────────────────────────────────────
// PERFIL DO USUÁRIO
// ─────────────────────────────────────────────────────────────────

async function loadUserProfile(user) {
    try {
        const doc = await db.collection('users').doc(user.uid).get();
        currentUser = {
            uid:     user.uid,
            email:   user.email,
            nome:    user.displayName || (user.isAnonymous ? 'Visitante' : user.email?.split('@')[0] || 'Usuário'),
            isAdmin: false,
            ...(doc.exists ? doc.data() : {})
        };
        window.sharedComponents?.renderUserInfo(currentUser);
        await loadUserFavorites(user.uid);
    } catch (err) {
        console.error('❌ Perfil:', err);
        currentUser = { uid: user.uid, email: user.email, nome: user.displayName || (user.isAnonymous ? 'Visitante' : user.email?.split('@')[0] || 'Usuário'), isAdmin: false };
        window.sharedComponents?.renderUserInfo(currentUser);
    }
}

// ─────────────────────────────────────────────────────────────────
// FAVORITOS
// ─────────────────────────────────────────────────────────────────

async function loadUserFavorites(uid) {
    try {
        const doc = await db.collection('users').doc(uid)
                             .collection('favoritos').doc('eventos').get();
        if (doc.exists && Array.isArray(doc.data().ids)) {
            userFavorites = new Set(doc.data().ids);
        }
    } catch {
        userFavorites = new Set();
    }
}

/** Reflete o estado de um favorito nos botões já renderizados. */
function paintFavButtons(eventoId, isFav) {
    document.querySelectorAll(`[data-fav-id="${eventoId}"]`).forEach(btn => {
        btn.classList.toggle('is-fav', isFav);
        btn.setAttribute('aria-label', isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos');
        const path = btn.querySelector('svg path, svg polygon');
        if (path) path.setAttribute('fill', isFav ? 'currentColor' : 'none');
    });
}

async function toggleFavorite(eventoId, e) {
    e?.stopPropagation();
    if (!requireAccount('Favoritar eventos')) return;
    if (!currentUser) return;

    const wasFav = userFavorites.has(eventoId);
    const isFav  = !wasFav;

    // Atualiza otimisticamente sem re-renderizar tudo
    wasFav ? userFavorites.delete(eventoId) : userFavorites.add(eventoId);
    paintFavButtons(eventoId, isFav);

    try {
        await db.collection('users').doc(currentUser.uid)
                .collection('favoritos').doc('eventos')
                .set({ ids: Array.from(userFavorites), updatedAt: new Date() });

        // Se a lista exibida é a de favoritos, ela precisa refletir a mudança
        if (activePeriod === 'favoritos') applyFilters();
    } catch (err) {
        // Reverte estado E interface — antes a interface ficava mentindo
        wasFav ? userFavorites.add(eventoId) : userFavorites.delete(eventoId);
        paintFavButtons(eventoId, wasFav);
        console.error('❌ Favorito:', err);
        showToast(
            err?.code === 'permission-denied'
                ? 'Sem permissão para salvar favoritos.'
                : 'Não foi possível salvar o favorito.',
            'error'
        );
    }
}

// ─────────────────────────────────────────────────────────────────
// CARREGAR EVENTOS DO FIRESTORE
// ─────────────────────────────────────────────────────────────────

async function loadEventos() {
    showLoading(true);

    try {
        const snap = await db.collection('eventos')
            .where('status', 'in', ['ativo', 'destaque'])
            .orderBy('dataInicio', 'asc')
            .get();

        allEventos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    } catch {
        // Fallback: sem orderBy (índice pode não existir)
        try {
            const snap2 = await db.collection('eventos')
                .where('status', 'in', ['ativo', 'destaque'])
                .get();

            allEventos = snap2.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => toDate(a.dataInicio) - toDate(b.dataInicio));

        } catch (err2) {
            console.error('❌ loadEventos fallback:', err2);
            showLoading(false);
            showErrorState('Não foi possível carregar os eventos. Verifique sua conexão.');
            return;
        }
    }

    filteredEventos = [...allEventos];

    populateCategoryFilter();
    buildMiniCalendar();
    buildUpcomingList();
    updateHeroStats();
    // showLoading() mexe no `hidden` da grade e da timeline, então precisa vir
    // antes do renderPage() — caso contrário desfaz o que o render decidiu.
    showLoading(false);
    renderPage();
}

// ─────────────────────────────────────────────────────────────────
// ESTATÍSTICAS DO HERO
// ─────────────────────────────────────────────────────────────────

async function updateHeroStats() {
    const hoje = startOfDay(new Date());
    const mes  = hoje.getMonth();
    const ano  = hoje.getFullYear();

    const strip   = document.getElementById('heroAgendaStrip');
    const liveDot = document.getElementById('heroLiveDot');
    const cta     = document.getElementById('heroAgendaCTA');

    // Antes, um evento de vários dias já em andamento (ex.: começou ontem,
    // termina amanhã) ficava de fora daqui porque só a dataInicio era
    // comparada com hoje — a agenda mostrava "0 eventos"/"—" mesmo com uma
    // festa acontecendo agora. getEffectiveEnd() corrige isso.
    const eventosMes = allEventos.filter(ev => {
        const d = toDate(ev.dataInicio);
        return d && d.getMonth() === mes && d.getFullYear() === ano && getEffectiveEnd(ev) >= hoje;
    });

    const proximo = allEventos
        .map(ev => ({ ...ev, _d: toDate(ev.dataInicio), _fim: getEffectiveEnd(ev) }))
        .filter(ev => ev._d && ev._fim >= hoje)
        .sort((a, b) => a._d - b._d)[0];

    const safeValue = eventosMes.length || 0;
    setTxt('heroAgendaValue', String(safeValue));
    setTxt('heroAgendaLabel', safeValue === 1 ? 'evento em agenda' : 'eventos em agenda');

    const live = !!proximo && proximo._d <= hoje; // já começou e ainda não terminou

    if (liveDot) liveDot.hidden = !live;
    strip?.classList.toggle('ev-agenda-strip-live', live);

    if (live) {
        const diasFim  = Math.ceil((proximo._fim - hoje) / 86_400_000);
        const fimText  = diasFim <= 0 ? 'Termina hoje' : diasFim === 1 ? 'Termina amanhã' : `Termina em ${diasFim} dias`;

        setTxt('heroAgendaCountdownLabel', 'acontecendo agora');
        setTxt('heroAgendaCountdown', 'Ao vivo');
        setTxt('heroAgendaPillText', 'Acontecendo agora');
        setTxt('heroAgendaMeta', `${fimText} · ${proximo.titulo || 'Evento em destaque'}`);
    } else {
        setTxt('heroAgendaCountdownLabel', 'próximo evento');

        if (proximo) {
            // Chegando aqui, proximo._d é sempre > hoje — o caso "já começou"
            // foi tratado no branch `live` acima —, então não há "Hoje" a cobrir.
            const dias     = Math.ceil((proximo._d - hoje) / 86_400_000);
            const mesmoMes = proximo._d.getMonth() === mes && proximo._d.getFullYear() === ano;

            setTxt('heroAgendaCountdown', dias === 1 ? 'Em 1 dia' : `Em ${dias} dias`);
            setTxt('heroAgendaPillText', mesmoMes ? 'Neste mês' : 'Próximo evento');

            const weatherText = await getWeatherForDateSummary(proximo._d);
            const prefix = dias === 1 ? 'Amanhã: ' : 'Próximo destaque: ';
            const nextLabel = proximo.titulo || 'Evento em destaque';
            setTxt('heroAgendaMeta', weatherText ? `${weatherText} · ${prefix}${nextLabel}` : `${prefix}${nextLabel}`);
        } else {
            setTxt('heroAgendaCountdown', '—');
            setTxt('heroAgendaPillText', 'Em breve');
            setTxt('heroAgendaMeta', 'A agenda segue em atualização para o próximo período.');
        }
    }

    if (cta) {
        cta.hidden = !proximo;
        cta.onclick = proximo ? () => openModal(allEventos.find(e => e.id === proximo.id) || proximo) : null;
    }
}

async function getWeatherForDateSummary(date) {
    if (!date || Number.isNaN(date.getTime())) return '';

    // Bueno Brandão/MG — mesmas coordenadas usadas na home
    const lat = -22.4408;
    const lon = -46.3508;
    const dateStr = date.toISOString().slice(0, 10);

    try {
        const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,weather_code&timezone=auto&start_date=${dateStr}&end_date=${dateStr}`
        );
        const data = await res.json();
        const temp = data?.daily?.temperature_2m_max?.[0];
        const code = data?.daily?.weather_code?.[0];
        const label = getWeatherLabel(code);
        const icon = getWeatherIcon(code);

        if (typeof temp !== 'number' || Number.isNaN(temp)) return '';
        return `${icon} ${Math.round(temp)}°C previstos · ${label}`;
    } catch (err) {
        console.warn('⚠️ Clima do evento indisponível:', err);
        return '';
    }
}

function getWeatherLabel(code) {
    const map = {
        0: 'céu limpo',
        1: 'parcialmente nublado',
        2: 'nublado',
        3: 'encoberto',
        45: 'nevoeiro',
        48: 'nevoeiro',
        51: 'garoa leve',
        53: 'garoa',
        61: 'chuva leve',
        63: 'chuva moderada',
        65: 'chuva forte',
        80: 'pancadas',
        81: 'chuva forte',
        82: 'chuva forte'
    };
    return map[code] || 'tempo estável';
}

function getWeatherIcon(code) {
    const map = {
        0: '☀️',
        1: '🌤️',
        2: '⛅',
        3: '☁️',
        45: '🌫️',
        48: '🌫️',
        51: '🌦️',
        53: '🌧️',
        61: '🌧️',
        63: '🌧️',
        65: '🌧️',
        80: '🌦️',
        81: '🌧️',
        82: '🌧️'
    };
    return map[code] || '🌤️';
}

// ─────────────────────────────────────────────────────────────────
// FILTRO DE CATEGORIAS DINÂMICO
// ─────────────────────────────────────────────────────────────────

function populateCategoryFilter() {
    const cats = [...new Set(allEventos.map(e => e.categoria).filter(Boolean))].sort();
    const wrap = document.getElementById('evCats');
    if (!wrap) return;

    // Remove as categorias geradas antes (mantém o botão fixo "Todas")
    wrap.querySelectorAll('.ev-cat:not([data-cat="todos"])').forEach(b => b.remove());
    if (!cats.length) return;

    cats.forEach(cat => {
        const btn = document.createElement('button');
        btn.className    = 'ev-cat';
        btn.dataset.cat  = cat;
        btn.textContent  = cat;
        btn.addEventListener('click', () => setCat(cat, btn));
        wrap.appendChild(btn);
    });
}

// ─────────────────────────────────────────────────────────────────
// CALENDÁRIO MINI
// ─────────────────────────────────────────────────────────────────

let calYear, calMonth;

function buildMiniCalendar(year, month) {
    const wrap = document.getElementById('miniCal');
    if (!wrap) return;

    const hoje = new Date();
    calYear  = year  ?? hoje.getFullYear();
    calMonth = month ?? hoje.getMonth();

    const daysInMonth  = new Date(calYear, calMonth + 1, 0).getDate();
    const firstWeekday = new Date(calYear, calMonth, 1).getDay();

    // Dias que têm evento neste mês/ano
    const eventDays = new Set();
    allEventos.forEach(ev => {
        const d = toDate(ev.dataInicio);
        if (d && d.getFullYear() === calYear && d.getMonth() === calMonth) {
            eventDays.add(d.getDate());
        }
        // Também marca dias cobertos por dataFim
        const df = toDate(ev.dataFim);
        if (df && df.getFullYear() === calYear && df.getMonth() === calMonth) {
            for (let dt = 1; dt <= daysInMonth; dt++) {
                const check = new Date(calYear, calMonth, dt);
                const dInicio = toDate(ev.dataInicio);
                if (dInicio && check >= dInicio && check <= df) eventDays.add(dt);
            }
        }
    });

    const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const WD     = ['D','S','T','Q','Q','S','S'];

    const isCurrentMonth = (calYear === hoje.getFullYear() && calMonth === hoje.getMonth());
    const todayDate      = hoje.getDate();

    let daysHTML = '';
    for (let i = 0; i < firstWeekday; i++) {
        daysHTML += '<div class="ev-cal-day ev-cal-empty" aria-hidden="true"></div>';
    }
    for (let d = 1; d <= daysInMonth; d++) {
        const isToday    = isCurrentMonth && d === todayDate;
        const hasEvent   = eventDays.has(d);
        const isPast     = !hasEvent && isCurrentMonth && d < todayDate;
        let cls = 'ev-cal-day';
        if (hasEvent) cls += ' ev-cal-has-event';
        if (isToday)  cls += ' ev-cal-today';
        if (isPast)   cls += ' ev-cal-past';
        const label = `${d} de ${MONTHS[calMonth]}${hasEvent ? ' — com evento' : ''}`;
        daysHTML += `<div class="${cls}" data-day="${d}" tabindex="${hasEvent ? 0 : -1}" role="${hasEvent ? 'button' : 'gridcell'}" aria-label="${label}">${d}</div>`;
    }

    wrap.innerHTML = `
        <div class="ev-cal-nav">
            <button class="ev-cal-nav-btn" id="calPrev" aria-label="Mês anterior">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M8.5 3L5 7l3.5 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
            <span class="ev-cal-month-name">${MONTHS[calMonth]} ${calYear}</span>
            <button class="ev-cal-nav-btn" id="calNext" aria-label="Próximo mês">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M5.5 3L9 7l-3.5 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
        </div>
        <div class="ev-cal-grid" role="grid" aria-label="${MONTHS[calMonth]} ${calYear}">
            ${WD.map(w => `<div class="ev-cal-wd" aria-hidden="true">${w}</div>`).join('')}
            ${daysHTML}
        </div>
    `;

    // Navegação entre meses
    wrap.querySelector('#calPrev')?.addEventListener('click', () => {
        let m = calMonth - 1, y = calYear;
        if (m < 0) { m = 11; y--; }
        buildMiniCalendar(y, m);
    });
    wrap.querySelector('#calNext')?.addEventListener('click', () => {
        let m = calMonth + 1, y = calYear;
        if (m > 11) { m = 0; y++; }
        buildMiniCalendar(y, m);
    });

    // Clique/Enter em dia com evento
    wrap.querySelectorAll('.ev-cal-has-event').forEach(el => {
        const handler = () => filterByDay(calYear, calMonth, parseInt(el.dataset.day), el);
        el.addEventListener('click', handler);
        el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } });
    });
}

function filterByDay(year, month, day, el) {
    const isSelected = el.classList.contains('ev-cal-selected');

    document.querySelectorAll('.ev-cal-day').forEach(e => e.classList.remove('ev-cal-selected'));

    if (isSelected) {
        // Toggle: remove filtro de dia e volta ao filtro de período
        applyFilters();
        return;
    }

    el.classList.add('ev-cal-selected');

    const inicio = new Date(year, month, day, 0, 0, 0, 0);
    const fim    = new Date(year, month, day, 23, 59, 59, 999);

    filteredEventos = allEventos.filter(ev => {
        const dInicio = toDate(ev.dataInicio);
        const dFim    = toDate(ev.dataFim);
        if (!dInicio) return false;

        // O evento cobre o dia se começou antes do final do dia E termina depois do início do dia
        const eventoFim = dFim ?? dInicio;
        if (dInicio > fim || eventoFim < inicio) return false;

        // Respeita filtro de categoria
        if (activeCat !== 'todos' && ev.categoria !== activeCat) return false;

        // Respeita busca
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const hay = [ev.titulo, ev.descricao, ev.local, ev.categoria, ev.organizador]
                .filter(Boolean).join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }

        return true;
    });

    currentPage = 0;
    renderPage();
    updateCount();
}

// ─────────────────────────────────────────────────────────────────
// PRÓXIMAS DATAS (sidebar)
// ─────────────────────────────────────────────────────────────────

function buildUpcomingList() {
    const wrap = document.getElementById('upcomingList');
    if (!wrap) return;

    const hoje = startOfDay(new Date());

    // getEffectiveEnd() garante que um evento de vários dias continue
    // aparecendo aqui enquanto ainda estiver rolando, não só até a véspera.
    const coming = allEventos
        .map(ev => ({ ...ev, _d: toDate(ev.dataInicio), _live: isLiveNow(ev, hoje) }))
        .filter(ev => ev._d && getEffectiveEnd(ev) >= hoje)
        .sort((a, b) => a._d - b._d)
        .slice(0, 5);

    if (!coming.length) {
        wrap.innerHTML = `
            <p class="ev-sidebar-title">Próximas datas</p>
            <p class="ev-upcoming-empty">Sem eventos programados.</p>
        `;
        return;
    }

    const items = coming.map(ev => {
        const d   = ev._d;
        const day = ev._live ? 'HOJE' : d.getDate().toString().padStart(2, '0');
        const mon = ev._live ? '' : d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
        return `
            <div class="ev-upcoming-item" data-id="${ev.id}" role="button" tabindex="0"
                 aria-label="${esc(ev.titulo)}${ev._live ? ' — acontecendo hoje' : ` em ${day} de ${mon}`}">
                <div class="ev-upcoming-date${ev._live ? ' ev-upcoming-date-live' : ''}">
                    <span class="ud-day">${day}</span>
                    <span class="ud-mon">${mon}</span>
                </div>
                <div class="ev-upcoming-info">
                    <strong>${esc(ev.titulo || 'Evento')}</strong>
                    <span>${esc(ev.categoria || '')}${ev.local ? ' · ' + esc(ev.local) : ''}</span>
                </div>
            </div>
        `;
    }).join('');

    wrap.innerHTML = `<p class="ev-sidebar-title">Próximas datas</p>${items}`;

    wrap.querySelectorAll('.ev-upcoming-item').forEach(el => {
        const handler = () => {
            const ev = allEventos.find(e => e.id === el.dataset.id);
            if (ev) openModal(ev);
        };
        el.addEventListener('click', handler);
        el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } });
    });
}

// ─────────────────────────────────────────────────────────────────
// FILTROS
// ─────────────────────────────────────────────────────────────────

function applyFilters() {
    // Remove seleção manual de dia do calendário (o filterByDay tem sua própria lógica)
    document.querySelectorAll('.ev-cal-selected').forEach(e => e.classList.remove('ev-cal-selected'));

    const hoje       = startOfDay(new Date());
    const fimDeHoje  = endOfDay(hoje);

    filteredEventos = allEventos.filter(ev => {
        const dInicio = toDate(ev.dataInicio);
        const dFim    = toDate(ev.dataFim);

        // ── Filtro de período ────────────────────────────────────
        if (activePeriod === 'favoritos') {
            if (!userFavorites.has(ev.id)) return false;
        }
        else if (activePeriod !== 'todos') {
            if (!dInicio) return false;

            // Um evento "cobre" um intervalo se: dInicio <= fimIntervalo E eventoFim >= inicioIntervalo
            const eventoFim = dFim ?? dInicio;

            if (activePeriod === 'hoje') {
                // Acontece hoje: começa antes ou em hoje E termina depois ou em hoje
                if (dInicio > fimDeHoje || eventoFim < hoje) return false;
            }
            else if (activePeriod === 'semana') {
                // Semana atual: domingo a sábado correntes
                const iniSemana = startOfDay(new Date(hoje));
                iniSemana.setDate(hoje.getDate() - hoje.getDay());
                const fimSemana = endOfDay(new Date(iniSemana));
                fimSemana.setDate(iniSemana.getDate() + 6);
                if (dInicio > fimSemana || eventoFim < iniSemana) return false;
            }
            else if (activePeriod === 'mes') {
                // Mês atual
                const iniMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
                const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59, 999);
                if (dInicio > fimMes || eventoFim < iniMes) return false;
            }
            else if (activePeriod === 'proximos') {
                // A partir de hoje (inclui os que já começaram e ainda vão rolar)
                if (eventoFim < hoje) return false;
            }
        }

        // ── Filtro de categoria ──────────────────────────────────
        if (activeCat !== 'todos' && ev.categoria !== activeCat) return false;

        // ── Busca textual ─────────────────────────────────────────
        if (searchQuery) {
            const q   = searchQuery.toLowerCase();
            const hay = [ev.titulo, ev.descricao, ev.local, ev.categoria, ev.organizador]
                .filter(Boolean).join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }

        return true;
    });

    currentPage = 0;
    renderPage();
    updateCount();
}

function setPeriod(period, btn) {
    activePeriod = period;
    document.querySelectorAll('.ev-tab').forEach(b => {
        b.classList.toggle('ev-tab-active', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
    });
    applyFilters();
}

function setCat(cat, btn) {
    activeCat = cat;
    document.querySelectorAll('.ev-cat').forEach(b => b.classList.toggle('ev-cat-active', b === btn));
    applyFilters();
}

function updateCount() {
    const el = document.getElementById('evCount');
    if (!el) return;
    el.textContent = filteredEventos.length
        ? `${filteredEventos.length} evento${filteredEventos.length !== 1 ? 's' : ''}`
        : '';
}

function clearAllFilters() {
    activePeriod = 'todos';
    activeCat    = 'todos';
    searchQuery  = '';
    currentPage  = 0;

    document.querySelectorAll('.ev-cal-day').forEach(e => e.classList.remove('ev-cal-selected'));

    document.querySelectorAll('.ev-tab').forEach(b => {
        b.classList.toggle('ev-tab-active', b.dataset.period === 'todos');
        b.setAttribute('aria-selected', b.dataset.period === 'todos' ? 'true' : 'false');
    });
    document.querySelectorAll('.ev-cat').forEach(b => b.classList.toggle('ev-cat-active', b.dataset.cat === 'todos'));

    const si = document.getElementById('searchInput');
    if (si) si.value = '';
    const sc = document.getElementById('searchClear');
    if (sc) sc.hidden = true;

    filteredEventos = [...allEventos];
    renderPage();
    updateCount();
}

// ─────────────────────────────────────────────────────────────────
// RENDER — grade ou timeline
// ─────────────────────────────────────────────────────────────────

function renderPage() {
    const grid     = document.getElementById('evGrid');
    const timeline = document.getElementById('evTimeline');
    const empty    = document.getElementById('evEmpty');
    const more     = document.getElementById('evLoadMore');
    if (!grid || !timeline || !empty || !more) return;

    if (!filteredEventos.length) {
        grid.hidden = timeline.hidden = more.hidden = true;
        empty.hidden = false;

        const title = activePeriod === 'favoritos'
            ? 'Você ainda não tem favoritos'
            : searchQuery
            ? `Nenhum evento encontrado para "${searchQuery}"`
            : activeCat !== 'todos' || activePeriod !== 'todos'
            ? 'Nenhum evento nesse filtro'
            : 'Nenhum evento encontrado';

        const desc = activePeriod === 'favoritos'
            ? 'Toque na estrela em qualquer evento para salvá-lo aqui.'
            : (searchQuery || activeCat !== 'todos' || activePeriod !== 'todos')
            ? 'Tente ajustar os filtros ou a busca.'
            : 'Ainda não há eventos cadastrados. Volte em breve!';

        setTxt('evEmptyTitle', title);
        setTxt('evEmptyDesc',  desc);
        updateCount();
        return;
    }

    empty.hidden = true;

    const slice    = filteredEventos.slice(0, (currentPage + 1) * PAGE_SIZE);
    const hasMore  = slice.length < filteredEventos.length;
    more.hidden    = !hasMore;
    const topEvent = getTopPresenceEvent();

    if (currentView === 'grid') {
        timeline.hidden = true;
        grid.hidden     = false;
        grid.innerHTML  = '';
        slice.forEach(ev => grid.appendChild(buildCard(ev, topEvent)));
    } else {
        grid.hidden        = true;
        timeline.hidden    = false;
        timeline.innerHTML = '';
        slice.forEach(ev => timeline.appendChild(buildTimelineItem(ev, topEvent)));
    }

    updateCount();
}

// ─────────────────────────────────────────────────────────────────
// CARD (grade)
// ─────────────────────────────────────────────────────────────────

function getTopPresenceEvent() {
    if (!allEventos.length) return null;
    return [...allEventos].sort((a, b) => (Number(b.presencasCount || 0) - Number(a.presencasCount || 0)))[0];
}

function buildCard(ev, topEvent) {
    const d      = toDate(ev.dataInicio);
    const hoje   = startOfDay(new Date());
    const days   = d ? Math.ceil((d - hoje) / 86_400_000) : null;
    const live   = isLiveNow(ev, hoje);
    const isTopPresence = !!topEvent && topEvent.id === ev.id && Number(ev.presencasCount || 0) > 0;

    const day   = d ? d.getDate().toString().padStart(2, '0') : '—';
    const month = d ? d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase() : '';

    let badgeHTML = '';
    if (isTopPresence) {
        badgeHTML += '<span class="ev-badge ev-badge-em-alta">🔥 Em Alta</span>';
    }
    // Um evento que já começou (ex.: dura vários dias e hoje está no meio)
    // tinha "days" negativo e não ganhava nenhum aviso — parecia um evento
    // qualquer, mesmo estando em andamento agora. isLiveNow() cobre isso.
    if (live) {
        badgeHTML += '<span class="ev-badge ev-badge-live"><span class="ev-live-dot" aria-hidden="true"></span>Ao Vivo</span>';
    } else if (days !== null && days >= 0) {
        if      (days === 1) badgeHTML += '<span class="ev-badge ev-badge-amanha">Amanhã</span>';
        else if (days <= 7)  badgeHTML += `<span class="ev-badge ev-badge-breve">Em ${days} dias</span>`;
    }

    const imgUrl = ev.imagem || ev.image || '../assets/images/placeholder-city.svg';
    const imgStyle = `background-image:url('${escUrl(imgUrl)}'); background-size:cover; background-position:center;`;

    const isFav = userFavorites.has(ev.id);

    const art = document.createElement('article');
    art.className = 'ev-card';
    art.setAttribute('tabindex', '0');
    art.setAttribute('role', 'button');
    art.setAttribute('aria-label', `Ver detalhes de ${esc(ev.titulo || 'evento')}`);

    art.innerHTML = `
        <div class="ev-card-top">
            <div class="ev-card-date-col">
                <span class="c-day">${day}</span>
                <span class="c-month">${month}</span>
            </div>
            <div class="ev-card-img" style="${imgStyle}">
                <div class="ev-card-badges">
                    ${badgeHTML}
                </div>
            </div>
        </div>
        <div class="ev-card-body">
            <div class="ev-card-header">
                <span class="ev-card-cat">${esc(ev.categoria || 'Evento')}</span>
                <button class="ev-card-fav ${isFav ? 'is-fav' : ''}"
                    data-fav-id="${ev.id}"
                    aria-label="${isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="${isFav ? 'currentColor' : 'none'}" aria-hidden="true">
                        <polygon points="7,1.5 8.8,5.2 13,5.6 10,8.5 10.8,12.7 7,10.5 3.2,12.7 4,8.5 1,5.6 5.2,5.2"
                            stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
                    </svg>
                </button>
            </div>
            <h3 class="ev-card-title">${esc(ev.titulo || 'Evento sem título')}</h3>
            ${ev.descricao ? `<p class="ev-card-desc">${esc(ev.descricao)}</p>` : ''}
            <div class="ev-card-meta">
                ${ev.local ? `
                <div class="ev-card-meta-row">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path d="M6 1C4.3 1 3 2.4 3 4C3 6.4 6 11 6 11S9 6.4 9 4C9 2.4 7.7 1 6 1Z" stroke="currentColor" stroke-width="1.4"/>
                    </svg>
                    ${esc(ev.local)}
                </div>` : ''}
                ${ev.horario ? `
                <div class="ev-card-meta-row">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.4"/>
                        <path d="M6 3.5v2.8l2 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                    </svg>
                    ${esc(ev.horario)}
                </div>` : ''}
                ${ev.entrada ? `
                <div class="ev-card-meta-row">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <rect x="1" y="3" width="10" height="6" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
                        <path d="M1 5.5h10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                    </svg>
                    ${esc(ev.entrada)}
                </div>` : ''}
            </div>
        </div>
        <div class="ev-card-footer">
            <div class="ev-card-footer-actions">
                <button class="ev-rsvp-btn" data-evt-id="${ev.id}" aria-pressed="false" data-tooltip="Confirmar presença" aria-label="Confirmar presença">🔥 <span class="rsvp-count">${ev.presencasCount || 0}</span></button>
                <button type="button" class="ev-card-share" data-share-id="${ev.id}" aria-label="Compartilhar ${esc(ev.titulo || 'evento')}" title="Compartilhar">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <circle cx="11" cy="2.5" r="1.5" stroke="currentColor" stroke-width="1.5"/>
                        <circle cx="3"  cy="7"   r="1.5" stroke="currentColor" stroke-width="1.5"/>
                        <circle cx="11" cy="11.5" r="1.5" stroke="currentColor" stroke-width="1.5"/>
                        <path d="M4.5 6.2l5-2.4M4.5 8l5 2.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
            <span class="ev-card-link">
                Ver detalhes
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                    <path d="M3 2l4 3-4 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
            </span>
        </div>
    `;

    // Clique no card (exceto nos botões de favorito/compartilhar)
    const openHandler = (e) => {
        if (!e.target.closest('.ev-card-fav') && !e.target.closest('.ev-card-share')) openModal(ev);
    };
    art.addEventListener('click', openHandler);
    art.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openHandler(e); } });

    art.querySelector('.ev-card-fav').addEventListener('click', e => toggleFavorite(ev.id, e));

    const rsvpBtn = art.querySelector('.ev-rsvp-btn');
    if (rsvpBtn) {
        const countEl = rsvpBtn.querySelector('.rsvp-count');
        const updateUI = (count, going) => {
            if (countEl) countEl.textContent = String(count);
            rsvpBtn.setAttribute('aria-pressed', going ? 'true' : 'false');
            rsvpBtn.classList.toggle('is-going', !!going);
            const label = going ? 'Cancelar presença' : 'Confirmar presença';
            rsvpBtn.setAttribute('data-tooltip', label);
            rsvpBtn.setAttribute('aria-label', label);
        };

        // Só descobre se o usuário já confirmou (1 leitura). A contagem já veio
        // no documento do evento — não vale um segundo get() por card.
        const syncPresenceState = async () => {
            if (!currentUser || !db) return;
            try {
                const snap = await db.collection('eventos').doc(ev.id)
                                     .collection('presencas').doc(currentUser.uid).get();
                updateUI(Number(ev.presencasCount || 0), snap.exists);
            } catch (err) {
                // Sem permissão de leitura: mantém o botão neutro, sem quebrar a página
                console.warn('⚠️ Presença indisponível:', err?.code || err);
            }
        };

        rsvpBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!currentUser) { window.location.href = 'login.html'; return; }
            if (!requireAccount('Confirmar presença')) return;

            const evtId   = rsvpBtn.dataset.evtId;
            const docRef  = db.collection('eventos').doc(evtId);
            const userRef = docRef.collection('presencas').doc(currentUser.uid);

            rsvpBtn.disabled = true;
            try {
                const going = (await userRef.get()).exists;

                if (going) {
                    await userRef.delete();
                    await docRef.update({ presencasCount: firebase.firestore.FieldValue.increment(-1) });
                } else {
                    await userRef.set({ uid: currentUser.uid, nome: currentUser.nome || currentUser.email || 'Visitante', createdAt: new Date() });
                    await docRef.update({ presencasCount: firebase.firestore.FieldValue.increment(1) });
                }

                const nextCount = Number((await docRef.get()).data()?.presencasCount || 0);
                ev.presencasCount = nextCount;
                updateUI(nextCount, !going);

                const idx = allEventos.findIndex(item => item.id === ev.id);
                if (idx >= 0) allEventos[idx].presencasCount = nextCount;
                const filtIdx = filteredEventos.findIndex(item => item.id === ev.id);
                if (filtIdx >= 0) filteredEventos[filtIdx].presencasCount = nextCount;

                const latestTopEvent = getTopPresenceEvent();
                if (latestTopEvent && latestTopEvent.id === ev.id) renderPage();
            } catch (err) {
                console.error('RSVP erro:', err);
                showToast(
                    err?.code === 'permission-denied'
                        ? 'Sem permissão para confirmar presença.'
                        : 'Não foi possível confirmar presença.',
                    'error'
                );
            } finally {
                rsvpBtn.disabled = false;
            }
        });

        syncPresenceState();
    }

    return art;
}

// ─────────────────────────────────────────────────────────────────
// ITEM DE TIMELINE
// ─────────────────────────────────────────────────────────────────

function buildTimelineItem(ev, topEvent) {
    const d     = toDate(ev.dataInicio);
    const day   = d ? d.getDate().toString().padStart(2, '0') : '—';
    const month = d ? d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase() : '';
    const isFav = userFavorites.has(ev.id);
    const live  = isLiveNow(ev, startOfDay(new Date()));
    const isTopPresence = !!topEvent && topEvent.id === ev.id && Number(ev.presencasCount || 0) > 0;

    const item = document.createElement('div');
    item.className = 'ev-tl-item';
    item.setAttribute('tabindex', '0');
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', `Ver detalhes de ${esc(ev.titulo || 'evento')}`);

    item.innerHTML = `
        <div class="ev-tl-date" aria-hidden="true">
            <span class="tl-day">${day}</span>
            <span class="tl-month">${month}</span>
        </div>
        <div class="ev-tl-body">
            <h3 class="ev-tl-title">${esc(ev.titulo || 'Evento')}</h3>
            <div class="ev-tl-meta">
                ${ev.horario ? `
                <div class="ev-tl-meta-item">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.4"/>
                        <path d="M6 3.5v2.8l2 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                    </svg>
                    ${esc(ev.horario)}
                </div>` : ''}
                ${ev.local ? `
                <div class="ev-tl-meta-item">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path d="M6 1C4.3 1 3 2.4 3 4C3 6.4 6 11 6 11S9 6.4 9 4C9 2.4 7.7 1 6 1Z" stroke="currentColor" stroke-width="1.4"/>
                    </svg>
                    ${esc(ev.local)}
                </div>` : ''}
                ${ev.entrada ? `
                <div class="ev-tl-meta-item">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <rect x="1" y="3" width="10" height="6" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
                    </svg>
                    ${esc(ev.entrada)}
                </div>` : ''}
            </div>
        </div>
        <div class="ev-tl-aside">
            ${live ? '<span class="ev-badge ev-badge-live"><span class="ev-live-dot" aria-hidden="true"></span>Ao Vivo</span>' : ''}
            <span class="ev-tl-cat">${esc(ev.categoria || 'Evento')}</span>
            <button type="button" class="ev-tl-share" data-share-id="${ev.id}" aria-label="Compartilhar ${esc(ev.titulo || 'evento')}" title="Compartilhar">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <circle cx="11" cy="2.5" r="1.5" stroke="currentColor" stroke-width="1.5"/>
                    <circle cx="3"  cy="7"   r="1.5" stroke="currentColor" stroke-width="1.5"/>
                    <circle cx="11" cy="11.5" r="1.5" stroke="currentColor" stroke-width="1.5"/>
                    <path d="M4.5 6.2l5-2.4M4.5 8l5 2.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                </svg>
            </button>
            <button class="ev-tl-fav ${isFav ? 'is-fav' : ''}"
                data-fav-id="${ev.id}"
                aria-label="${isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="${isFav ? 'currentColor' : 'none'}" aria-hidden="true">
                    <polygon points="7,1.5 8.8,5.2 13,5.6 10,8.5 10.8,12.7 7,10.5 3.2,12.7 4,8.5 1,5.6 5.2,5.2"
                        stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
                </svg>
            </button>
        </div>
    `;

    const openHandler = (e) => {
        if (!e.target.closest('.ev-tl-fav') && !e.target.closest('.ev-tl-share')) openModal(ev);
    };
    item.addEventListener('click', openHandler);
    item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openHandler(e); } });

    item.querySelector('.ev-tl-fav').addEventListener('click', e => toggleFavorite(ev.id, e));

    return item;
}

// ─────────────────────────────────────────────────────────────────
// MODAL DE DETALHES
// ─────────────────────────────────────────────────────────────────

function openModal(ev) {
    const modal   = document.getElementById('modalEvento');
    const content = document.getElementById('modalContent');
    if (!modal || !content) return;

    const dInicio = toDate(ev.dataInicio);
    const dFim    = toDate(ev.dataFim);

    const dStr    = dInicio
        ? dInicio.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
        : '—';
    const dFimStr = dFim
        ? dFim.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
        : null;

    const imgStyle = ev.imagem
        ? `background-image:url('${escUrl(ev.imagem)}'); background-size:cover; background-position:center;`
        : '';
    const topEvent = getTopPresenceEvent();
    const isTopPresence = !!topEvent && topEvent.id === ev.id && Number(ev.presencasCount || 0) > 0;

    content.innerHTML = `
        <div class="ev-modal-hero" style="${imgStyle}">
            <span class="ev-modal-hero-cat">${esc(ev.categoria || 'Evento')}</span>
            ${isTopPresence ? '<span class="ev-badge ev-badge-em-alta" style="position:absolute;right:18px;top:18px;z-index:2;">🔥 Em Alta</span>' : ''}
        </div>
        <div class="ev-modal-body">
            <h2 class="ev-modal-title" id="modalEventoTitle">${esc(ev.titulo || 'Evento')}</h2>

            <div class="ev-modal-info-grid">
                <div class="ev-modal-info-item">
                    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true">
                        <rect x="2" y="3" width="13" height="12" rx="1.5" stroke="currentColor" stroke-width="1.6"/>
                        <path d="M5 2v2M12 2v2M2 7h13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                    </svg>
                    <div>
                        <strong>Data</strong>
                        <span>${dStr}${dFimStr ? ' até ' + dFimStr : ''}</span>
                    </div>
                </div>
                ${ev.horario ? `
                <div class="ev-modal-info-item">
                    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true">
                        <circle cx="8.5" cy="8.5" r="6.5" stroke="currentColor" stroke-width="1.6"/>
                        <path d="M8.5 5v4l3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                    </svg>
                    <div><strong>Horário</strong><span>${esc(ev.horario)}</span></div>
                </div>` : ''}
                ${ev.local ? `
                <div class="ev-modal-info-item">
                    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true">
                        <path d="M8.5 2C6 2 4 4 4 6.5C4 10 8.5 16 8.5 16S13 10 13 6.5C13 4 11 2 8.5 2Z" stroke="currentColor" stroke-width="1.6"/>
                        <circle cx="8.5" cy="6.5" r="1.8" stroke="currentColor" stroke-width="1.4"/>
                    </svg>
                    <div><strong>Local</strong><span>${esc(ev.local)}</span></div>
                </div>` : ''}
                ${ev.entrada ? `
                <div class="ev-modal-info-item">
                    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true">
                        <rect x="2" y="5" width="13" height="7" rx="1.5" stroke="currentColor" stroke-width="1.6"/>
                        <path d="M2 8h13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                    </svg>
                    <div><strong>Entrada</strong><span>${esc(ev.entrada)}</span></div>
                </div>` : ''}
                ${ev.organizador ? `
                <div class="ev-modal-info-item">
                    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true">
                        <circle cx="8.5" cy="6" r="2.8" stroke="currentColor" stroke-width="1.6"/>
                        <path d="M3 15c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                    </svg>
                    <div><strong>Organização</strong><span>${esc(ev.organizador)}</span></div>
                </div>` : ''}
                ${ev.contato ? `
                <div class="ev-modal-info-item">
                    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true">
                        <rect x="2" y="4" width="13" height="9" rx="1.5" stroke="currentColor" stroke-width="1.6"/>
                        <path d="M2 7l6.5 4L15 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                    </svg>
                    <div><strong>Contato</strong><span>${esc(ev.contato)}</span></div>
                </div>` : ''}
            </div>

            ${ev.descricao ? `
            <p class="ev-modal-desc-label">Sobre o evento</p>
            <p class="ev-modal-desc">${esc(ev.descricao)}</p>
            ` : ''}

            <div class="ev-modal-attendees" id="modalAttendees" hidden></div>

            <div class="ev-modal-footer">
                <div class="ev-modal-calendar-wrap">
                    <button class="ev-modal-btn-primary" id="modalCalendarBtn" type="button">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                            <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
                            <path d="M4 1.5v2M10 1.5v2M1.5 5.5h11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                        </svg>
                        Adicionar ao Calendário
                    </button>
                    <div class="ev-modal-calendar-menu" id="modalCalendarMenu" role="menu">
                        <button class="ev-modal-calendar-option" type="button" data-cal="google">Google Calendar</button>
                        <button class="ev-modal-calendar-option" type="button" data-cal="ics">Apple / Outlook (.ics)</button>
                    </div>
                </div>
                ${ev.link ? `
                <a href="${esc(ev.link)}" target="_blank" rel="noopener noreferrer" class="ev-modal-btn-primary">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <path d="M9 2h3v3M12 2l-5.5 5.5M5 3.5H3a1 1 0 00-1 1v6a1 1 0 001 1h6a1 1 0 001-1V8"
                            stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                    </svg>
                    Mais informações
                </a>` : ''}
                <button class="ev-modal-btn-sec" id="modalShareBtn" type="button">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <circle cx="11" cy="2.5" r="1.5" stroke="currentColor" stroke-width="1.5"/>
                        <circle cx="3"  cy="7"   r="1.5" stroke="currentColor" stroke-width="1.5"/>
                        <circle cx="11" cy="11.5" r="1.5" stroke="currentColor" stroke-width="1.5"/>
                        <path d="M4.5 6.2l5-2.4M4.5 8l5 2.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                    </svg>
                    Compartilhar
                </button>
            </div>
        </div>
    `;

    const modalCalendarBtn = document.getElementById('modalCalendarBtn');
    const modalCalendarMenu = document.getElementById('modalCalendarMenu');
    modalCalendarBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = modalCalendarMenu?.classList.contains('show');
        modalCalendarMenu?.classList.toggle('show', !isOpen);
    });
    modalCalendarMenu?.querySelectorAll('[data-cal]').forEach((item) => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            modalCalendarMenu?.classList.remove('show');
            const kind = item.dataset.cal;
            if (kind === 'google') openGoogleCalendar(ev);
            if (kind === 'ics') downloadICS(ev);
        });
    });

    // Fecha o menu de calendário ao clicar em qualquer outro lugar do modal
    content.addEventListener('click', () => modalCalendarMenu?.classList.remove('show'));

    document.getElementById('modalShareBtn')?.addEventListener('click', () => shareEvento(ev.id));

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    document.getElementById('modalClose')?.focus();

    loadAttendeesPreview(ev);
}

// ─────────────────────────────────────────────────────────────────
// PROVA SOCIAL — quem já confirmou presença
// ─────────────────────────────────────────────────────────────────

/** Busca sob demanda (só ao abrir o modal) os primeiros nomes que confirmaram
 *  presença e monta uma linha tipo "Maria, João e mais 3 confirmaram presença".
 *  As regras do Firestore liberam a leitura para qualquer sessão autenticada,
 *  inclusive visitante anônimo — garantida em toda a página por
 *  garantirSessaoVisitante() no boot. */
async function loadAttendeesPreview(ev) {
    const box = document.getElementById('modalAttendees');
    if (!box || !db || !Number(ev.presencasCount || 0)) return;

    try {
        const snap = await db.collection('eventos').doc(ev.id)
                             .collection('presencas').limit(6).get();
        const nomes = snap.docs
            .map(d => (d.data().nome || '').trim().split(' ')[0])
            .filter(Boolean);
        if (!nomes.length) return;

        const extra = Number(ev.presencasCount || 0) - nomes.length;
        let text;
        if (extra > 0) {
            text = `${nomes.join(', ')} e mais ${extra} confirmaram presença`;
        } else if (nomes.length === 1) {
            text = `${nomes[0]} confirmou presença`;
        } else {
            text = `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]} confirmaram presença`;
        }

        box.textContent = `🎉 ${text}`;
        box.hidden = false;
    } catch (err) {
        // Sem permissão ou offline: a página segue normalmente sem essa linha.
        console.warn('⚠️ Lista de presenças indisponível:', err?.code || err);
    }
}

function closeModal() {
    const modal = document.getElementById('modalEvento');
    if (modal) modal.hidden = true;
    document.body.style.overflow = '';
}

// Abre direto o evento vindo de um link "Compartilhar" (?evento=<id>)
function openEventFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const eventoId = params.get('evento');
    if (!eventoId) return;

    const ev = allEventos.find(e => e.id === eventoId);
    if (!ev) {
        showToast('Evento não encontrado ou indisponível no momento', 'error');
        return;
    }
    openModal(ev);
}

// ─────────────────────────────────────────────────────────────────
// COMPARTILHAR
// ─────────────────────────────────────────────────────────────────

/** Usa a gaveta nativa de compartilhamento quando disponível, senão copia o link. */
function shareEvento(id) {
    const ev = allEventos.find(e => e.id === id);
    if (!ev) return;

    const url = `${location.origin}${location.pathname}?evento=${id}`;
    if (navigator.share) {
        navigator.share({ title: ev.titulo, url }).catch(() => {});
        return;
    }
    navigator.clipboard?.writeText(url)
        .then(() => showToast('Link copiado!', 'success'))
        .catch(() => showToast('Não foi possível compartilhar o link', 'error'));
}

// Delegação: os cards são recriados a cada render, então um listener só
// nos containers cobre todos eles sem precisar religar a cada renderPage().
function setupShareDelegation() {
    const handler = (event) => {
        const btn = event.target.closest('[data-share-id]');
        if (!btn) return;
        event.preventDefault();
        shareEvento(btn.dataset.shareId);
    };
    document.getElementById('evGrid')?.addEventListener('click', handler);
    document.getElementById('evTimeline')?.addEventListener('click', handler);
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = { success: '✓', error: '✕', info: 'ℹ' };

    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.info}</div>
        <div class="toast-message">${esc(message)}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.2s reverse';
        setTimeout(() => toast.remove(), 200);
    }, 4000);
}

// ─────────────────────────────────────────────────────────────────
// NOTÍCIAS
// ─────────────────────────────────────────────────────────────────

async function loadNoticias() {
    const grid = document.getElementById('newsGrid');
    if (!grid) return;

    let noticias = [];

    try {
        const snap = await db.collection('noticias')
            .where('status', '==', 'publicado')
            .orderBy('createdAt', 'desc')
            .limit(6)
            .get();

        noticias = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    } catch (err) {
        // Mesmo tratamento de loadEventos(): a consulta com orderBy exige um
        // índice composto. Sem ele a seção inteira sumia da página.
        console.warn('⚠️ noticias (fallback sem orderBy):', err?.code || err);
        try {
            const snap2 = await db.collection('noticias')
                .where('status', '==', 'publicado')
                .get();

            noticias = snap2.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (toDate(b.createdAt) ?? 0) - (toDate(a.createdAt) ?? 0))
                .slice(0, 6);

        } catch (err2) {
            console.warn('⚠️ noticias indisponiveis:', err2?.code || err2);
            document.getElementById('secNoticias')?.style.setProperty('display', 'none');
            return;
        }
    }

    if (!noticias.length) {
        document.getElementById('secNoticias')?.style.setProperty('display', 'none');
        return;
    }

    grid.innerHTML = '';
    noticias.forEach(n => grid.appendChild(buildNewsCard(n)));
}

function buildNewsCard(n) {
    const createdAt = toDate(n.createdAt);
    const dateStr   = createdAt
        ? createdAt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
        : '';
    const imgStyle = n.imagem
        ? `background-image:url('${escUrl(n.imagem)}'); background-size:cover; background-position:center;`
        : '';

    const card = document.createElement('article');
    card.className = 'news-card';
    card.innerHTML = `
        <div class="news-card-img" style="${imgStyle}" aria-hidden="${n.imagem ? 'false' : 'true'}">
            ${!n.imagem ? `
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
                <rect x="3" y="7" width="30" height="22" rx="2" stroke="currentColor" stroke-width="1.8"/>
                <path d="M7 5v3M29 5v3M3 15h30" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>` : ''}
        </div>
        <div class="news-card-body">
            ${n.categoria ? `<span class="news-card-cat">${esc(n.categoria)}</span>` : ''}
            <h3 class="news-card-title">${esc(n.titulo || 'Notícia')}</h3>
            <p class="news-card-preview">${esc(n.resumo || (n.conteudo || '').slice(0, 120))}</p>
        </div>
        <div class="news-card-footer">
            <span class="news-card-date">${dateStr}</span>
            <span class="news-card-link">
                Ler mais
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                    <path d="M3 2l4 3-4 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
            </span>
        </div>
    `;

    card.addEventListener('click', () => openNewsModal(n));
    return card;
}

function openNewsModal(n) {
    const modal   = document.getElementById('modalEvento');
    const content = document.getElementById('modalContent');
    if (!modal || !content) return;

    const createdAt = toDate(n.createdAt);
    const dateStr   = createdAt
        ? createdAt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
        : '';
    const imgStyle = n.imagem
        ? `background-image:url('${escUrl(n.imagem)}'); background-size:cover; background-position:center;`
        : '';

    content.innerHTML = `
        <div class="ev-modal-hero" style="${imgStyle}"></div>
        <div class="news-modal-body">
            ${n.categoria ? `<span class="news-modal-cat">${esc(n.categoria)}</span>` : ''}
            <h2 class="news-modal-title" id="modalEventoTitle">${esc(n.titulo || 'Notícia')}</h2>
            <p class="news-modal-meta">${n.autor ? esc(n.autor) + ' · ' : ''}${dateStr}</p>
            <div class="news-modal-content">
                ${(n.conteudo || '')
                    .split('\n')
                    .map(p => p.trim() ? `<p>${esc(p)}</p>` : '')
                    .join('')}
            </div>
        </div>
    `;

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
}

// ─────────────────────────────────────────────────────────────────
// EVENT LISTENERS
// ─────────────────────────────────────────────────────────────────

function setupListeners() {
    // Tabs de período
    document.querySelectorAll('.ev-tab').forEach(btn => {
        btn.addEventListener('click', () => setPeriod(btn.dataset.period, btn));
    });

    // Botão "Todas" nas categorias
    const allCatBtn = document.querySelector('.ev-cat[data-cat="todos"]');
    allCatBtn?.addEventListener('click', () => setCat('todos', allCatBtn));

    // Toggle de visualização
    document.querySelectorAll('.ev-view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentView = btn.dataset.view;
            document.querySelectorAll('.ev-view-btn').forEach(b => b.classList.toggle('ev-view-active', b === btn));
            currentPage = 0;
            renderPage();
        });
    });

    // Busca
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    let searchTimer;

    searchInput?.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchQuery = searchInput.value.trim();
        if (searchClear) searchClear.hidden = !searchQuery;
        searchTimer = setTimeout(applyFilters, 280);
    });

    searchClear?.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        searchQuery = '';
        if (searchClear) searchClear.hidden = true;
        applyFilters();
        searchInput?.focus();
    });

    // Carregar mais
    document.getElementById('btnLoadMore')?.addEventListener('click', () => {
        currentPage++;
        renderPage();
        // Foca o primeiro novo item para acessibilidade
        const items = currentView === 'grid'
            ? document.querySelectorAll('.ev-card')
            : document.querySelectorAll('.ev-tl-item');
        items[currentPage * PAGE_SIZE]?.focus();
    });

    // Limpar filtros (estado vazio)
    document.getElementById('evClearAll')?.addEventListener('click', clearAllFilters);

    // Modal — fechar
    document.getElementById('modalClose')?.addEventListener('click', closeModal);
    document.getElementById('modalOverlay')?.addEventListener('click', closeModal);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

    // Compartilhar (delegado, cobre os cards recriados a cada renderPage())
    setupShareDelegation();

    // Botões do hero
    document.getElementById('heroSearchBtn')?.addEventListener('click', () => {
        document.getElementById('filtersBar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => document.getElementById('searchInput')?.focus({ preventScroll: true }), 400);
    });
    document.getElementById('heroSeeAgendaBtn')?.addEventListener('click', () => {
        document.querySelector('.ev-main-inner')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

// ─────────────────────────────────────────────────────────────────
// ESTADOS DE UI
// ─────────────────────────────────────────────────────────────────

function showLoading(show) {
    const ls = document.getElementById('evLoadingState');
    if (!ls) return;
    ls.style.display = show ? 'flex' : 'none';
    const grid = document.getElementById('evGrid');
    const tl   = document.getElementById('evTimeline');
    if (grid) grid.hidden = show;
    if (tl)   tl.hidden   = show;
}

function showErrorState(msg) {
    const empty = document.getElementById('evEmpty');
    if (!empty) return;
    empty.hidden = false;
    setTxt('evEmptyTitle', msg);
    setTxt('evEmptyDesc',  '');
    const clearBtn = document.getElementById('evClearAll');
    if (clearBtn) clearBtn.hidden = true;
}

// ─────────────────────────────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────────────────────────────

/** Converte qualquer valor de data do Firestore para Date ou null */
function toDate(val) {
    if (!val) return null;
    if (val?.toDate)   return val.toDate();              // Firestore Timestamp
    if (val?.seconds)  return new Date(val.seconds * 1000);
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
        // Strings vindas de <input type="date"> (painel admin) são gravadas
        // como "AAAA-MM-DD" puro. new Date("AAAA-MM-DD") é interpretado como
        // UTC meia-noite pela spec; lido com getters locais em UTC-3 isso
        // "volta" um dia. Construímos a data localmente para evitar isso.
        const [y, m, d] = val.split('-').map(Number);
        return new Date(y, m - 1, d);
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
}

/** Retorna o início do dia (00:00:00.000) de uma data */
function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

/** Retorna o fim do dia (23:59:59.999) de uma data */
function endOfDay(date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}

/** Data de término efetiva do evento: dataFim, ou dataInicio se for de um dia só */
function getEffectiveEnd(ev) {
    return toDate(ev.dataFim) || toDate(ev.dataInicio);
}

/** Um evento está "ao vivo" quando hoje cai dentro de [dataInicio, dataFim].
 *  `hoje` deve ser startOfDay() — a comparação é por dia, não por horário. */
function isLiveNow(ev, hoje) {
    const inicio = toDate(ev.dataInicio);
    const fim = getEffectiveEnd(ev);
    return !!inicio && !!fim && inicio <= hoje && fim >= hoje;
}

function setTxt(id, txt) {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
}

/* Abre o Google Calendar com os parâmetros do evento */
function openGoogleCalendar(ev) {
    const dStart = toDate(ev.dataInicio);
    const dEnd   = toDate(ev.dataFim) || toDate(ev.dataInicio);
    if (!dStart) return;
    const fmt = d => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const text = ev.titulo || '';
    const details = [ev.descricao || '', ev.link || ''].filter(Boolean).join('\n');
    const location = ev.local || '';
    const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(text)}&dates=${encodeURIComponent(fmt(dStart) + '/' + fmt(dEnd))}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}&sf=true&output=xml`;
    window.open(url, '_blank');
}

/* Gera e baixa um arquivo .ics compatível com Apple/Outlook */
function downloadICS(ev) {
    const dStart = toDate(ev.dataInicio);
    const dEnd   = toDate(ev.dataFim) || toDate(ev.dataInicio);
    if (!dStart) return;

    const fmt = d => {
        // formata como YYYYMMDDTHHMMSSZ
        return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const uid = `evt-${(ev.id || Math.random().toString(36).slice(2,9))}@conectabueno.local`;
    const now = fmt(new Date());
    const ics = [`BEGIN:VCALENDAR`,`VERSION:2.0`,`PRODID:-//ConectaBueno//Agenda//PT-BR`,`BEGIN:VEVENT`,
        `UID:${uid}`,
        `DTSTAMP:${now}`,
        `DTSTART:${fmt(dStart)}`,
        `DTEND:${fmt(dEnd)}`,
        `SUMMARY:${(ev.titulo || '').replace(/\n/g,' ')}`,
        `DESCRIPTION:${(ev.descricao || '').replace(/\n/g,' ')}`,
        `LOCATION:${(ev.local || '')}`,
        `END:VEVENT`,`END:VCALENDAR`].join('\r\n');

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(ev.titulo || 'evento').replace(/[^a-z0-9]/gi,'_')}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Escapa uma URL para uso dentro de url('...') num atributo style.
 *  esc() transforma ' em &#39;, que o navegador decodifica de volta para '
 *  e encerra a string CSS antes da hora. */
function escUrl(url) {
    return esc(String(url ?? '').replace(/["'()\\]/g, encodeURIComponent));
}

/** Escapa caracteres HTML para evitar XSS */
function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
