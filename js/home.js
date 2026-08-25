/**
 * home.js — Conecta Bueno (REDESIGN)
 * Nova estrutura simplificada inspirada em buenobrandao.com.br
 * 
 * Seções:
 * - Hero com vídeo + estatísticas
 * - Próximos eventos (3-4 eventos)
 * - Lugares para explorar (6-8 lugares com filtro)
 * - Sobre a cidade
 * 
 * ZERO dados fake — apenas Firestore real
 */

'use strict';

let currentUser = null;
let db, auth;
let todosLugares = []; // cache para filtros

// ══════════════════════════════════════════
// INICIALIZAÇÃO
// ══════════════════════════════════════════

window.addEventListener('load', async () => {
    await waitForFirebase();
    db   = window.db;
    auth = window.auth;

    if (!db || !auth) return;

    auth.onAuthStateChanged(async (user) => {
        if (user) {
            await loadUserProfile(user);
            setupVisitorMode(user);
            hideLoading();
            await Promise.all([
                loadStatistics(),
                loadEventos(),
                loadLugares(),
                loadWeather()
            ]);
        } else {
            window.location.href = 'login.html';
        }
    });


function setupVisitorMode(user) {
    const isAnonymous = Boolean(user?.isAnonymous);
    document.body.classList.toggle('visitor-mode', isAnonymous);

    const dropdown = document.getElementById('userDropdown');
    if (!dropdown) return;

    const existingNote = dropdown.querySelector('.visitor-account-note');
    if (existingNote) existingNote.remove();

    document.querySelectorAll('a[href*="panel.html"], a[href*="settings.html"]').forEach(link => {
        if (link.dataset.visitorGuarded === 'true') return;
        link.dataset.visitorGuarded = 'true';
        link.addEventListener('click', event => {
            if (!isAnonymous) return;
            event.preventDefault();
            if (typeof window.showConvertModal === 'function') {
                window.showConvertModal();
            }
        });
    });

    if (!isAnonymous) return;

    const note = document.createElement('div');
    note.className = 'visitor-account-note';
    note.setAttribute('role', 'status');
    note.innerHTML = '<strong>Modo visitante</strong><p>Explore mapas, lugares e eventos. Recursos pessoais ficam disponíveis após criar uma conta.</p>';

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Criar conta gratuita';
    button.addEventListener('click', () => {
        if (typeof window.showConvertModal === 'function') window.showConvertModal();
    });
    note.appendChild(button);

    const profile = dropdown.querySelector('.hd-dd-profile');
    if (profile) profile.insertAdjacentElement('afterend', note);
    else dropdown.prepend(note);
}
    setupListeners();
    setupHeaderScroll();
    setupAboutCarousel();
});

function waitForFirebase(ms = 5000) {
    return new Promise(resolve => {
        if (window.db && window.auth) { resolve(); return; }
        const t0 = Date.now();
        const id = setInterval(() => {
            if (window.db && window.auth) { clearInterval(id); resolve(); }
            else if (Date.now() - t0 > ms) { clearInterval(id); resolve(); }
        }, 100);
    });
}

// ══════════════════════════════════════════
// HEADER SCROLL (transparente → sólido)
// ══════════════════════════════════════════

function setupHeaderScroll() {
    const header = document.getElementById('siteHeader');
    if (!header) return;

    const onScroll = () => {
        header.classList.toggle('scrolled', window.scrollY > 60);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
}

// ══════════════════════════════════════════
// PERFIL DO USUÁRIO
// ══════════════════════════════════════════

async function loadUserProfile(user) {
    try {
        const doc = await db.collection('users').doc(user.uid).get();

        currentUser = {
            uid: user.uid,
            email: user.email,
            nome: user.displayName || (user.isAnonymous ? 'Visitante' : user.email?.split('@')[0] || 'Usuário'),
            isAdmin: false,
            ...(doc.exists ? doc.data() : {})
        };

        // Usa sharedComponents para renderizar info do usuário
        if (window.sharedComponents) {
            window.sharedComponents.renderUserInfo(currentUser);
        }

        // Mostra painel admin se for admin
        if (currentUser.isAdmin) {
            document.querySelectorAll('#menuAdminPanel').forEach(el => {
                el.style.display = 'flex';
            });
        }

    } catch (err) {
        console.error('❌ Perfil:', err);
        currentUser = { 
            uid: user.uid, 
            email: user.email, 
            nome: user.displayName || (user.isAnonymous ? 'Visitante' : user.email?.split('@')[0] || 'Usuário'), 
            isAdmin: false 
        };
        if (window.sharedComponents) {
            window.sharedComponents.renderUserInfo(currentUser);
        }
    }
}

// ══════════════════════════════════════════
// ESTATÍSTICAS (hero)
// ══════════════════════════════════════════

async function loadStatistics() {
    if (!db) {
        setTxt('statPlaces', '0');
        setTxt('statEvents', '0');
        return;
    }

    try {
        const [placesSnap, eventsSnap] = await Promise.all([
            db.collection('espacos').where('status', '==', 'ativo').get(),
            db.collection('eventos').where('status', 'in', ['ativo', 'destaque']).get()
        ]);

        const placesCount = placesSnap.size || 0;
        const eventsCount = eventsSnap.size || 0;

        animCount('statPlaces', placesCount);
        animCount('statEvents', eventsCount);

    } catch (err) {
        console.warn('⚠️ Falha na contagem principal, tentando coleções alternativas:', err);

        try {
            const [placesAlt, eventsAlt] = await Promise.all([
                db.collection('places').get(),
                db.collection('events').get()
            ]);

            animCount('statPlaces', placesAlt.size || 0);
            animCount('statEvents', eventsAlt.size || 0);
        } catch (err2) {
            console.error('❌ Erro ao carregar estatísticas:', err2);
            setTxt('statPlaces', '0');
            setTxt('statEvents', '0');
        }
    }
}

function animCount(id, target) {
    const el = document.getElementById(id);
    console.log(`🎯 animCount chamado para ${id} com valor ${target}`);
    console.log('Elemento encontrado:', !!el);
    
    if (!el) {
        console.error(`❌ Elemento ${id} não encontrado`);
        return;
    }
    
    if (!target || target === 0) { 
        el.textContent = '0'; 
        console.log(`✅ ${id} definido como 0`);
        return; 
    }

    const steps = 40, ms = 1200 / steps;
    let cur = 0;
    const t = setInterval(() => {
        cur += target / steps;
        if (cur >= target) { 
            el.textContent = target.toString(); 
            console.log(`✅ ${id} animação completa: ${target}`);
            clearInterval(t); 
        } else { 
            el.textContent = Math.floor(cur).toString(); 
        }
    }, ms);
}

function setTxt(id, txt) {
    const el = document.getElementById(id);
    console.log(`📝 setTxt chamado para ${id} com valor ${txt}`);
    console.log('Elemento encontrado:', !!el);
    if (el) {
        el.textContent = txt;
        console.log(`✅ ${id} definido como ${txt}`);
    } else {
        console.error(`❌ Elemento ${id} não encontrado`);
    }
}

// ══════════════════════════════════════════
// EVENTOS (primeiros 3-4)
// ══════════════════════════════════════════

async function loadEventos() {
    const grid = document.getElementById('eventosGrid');
    if (!grid) return;

    grid.innerHTML = '<div class="loading-content"><div class="spinner"></div><span>Carregando eventos…</span></div>';

    try {
        let snap;

        try {
            snap = await db.collection('eventos')
                .where('status', 'in', ['ativo', 'destaque'])
                .orderBy('dataInicio', 'asc')
                .limit(4)
                .get();
        } catch (err) {
            const fallback = await db.collection('eventos')
                .where('status', 'in', ['ativo', 'destaque'])
                .get();

            snap = {
                docs: fallback.docs
                    .map(doc => ({ ...doc, data: doc.data }))
                    .sort((a, b) => (toDate(a.data().dataInicio) || 0) - (toDate(b.data().dataInicio) || 0))
                    .slice(0, 4)
            };
        }

        if (!snap || !snap.docs || !snap.docs.length) {
            const alt = await db.collection('events').limit(4).get();
            snap = alt;
        }

        grid.innerHTML = '';

        if (!snap || !snap.docs || !snap.docs.length) {
            grid.innerHTML = `<div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                    <rect x="8" y="10" width="32" height="28" rx="3" stroke="currentColor" stroke-width="2.5"/>
                    <path d="M15 6v6M33 6v6M8 18h32" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                </svg>
                <p>Nenhum evento programado no momento</p>
                <a href="eventos.html" class="link-primary">Ver histórico</a>
            </div>`;
            return;
        }

        snap.docs.slice(0, 4).forEach(doc => {
            const raw = doc.data ? doc.data() : doc;
            const ev = {
                id: doc.id,
                ...raw,
                title: raw.titulo || raw.title || 'Evento sem título',
                description: raw.descricao || raw.description || '',
                location: raw.local || raw.location || '',
                category: raw.categoria || raw.category || 'Evento',
                startDate: raw.dataInicio || raw.startDate || null,
                endDate: raw.dataFim || raw.endDate || null
            };
            grid.appendChild(buildEventCard(ev));
        });

    } catch (err) {
        console.error('❌ Eventos:', err);
        grid.innerHTML = `<div class="empty-state">
            <p>Não foi possível carregar os eventos</p>
        </div>`;
    }
}

function buildEventCard(ev) {
    const date = toDate(ev.startDate || ev.dataInicio);
    const now = new Date();
    const days = date ? Math.ceil((date - now) / 86400000) : null;

    const dayNum = date ? date.getDate().toString().padStart(2,'0') : '—';
    const monthName = date ? date.toLocaleDateString('pt-BR',{month:'short'}).replace('.','').toUpperCase() : '';
    const dateStr = date ? date.toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'}) : '';

    let badge = '';
    if (days !== null) {
        if (days === 0) badge = '<span class="ev-badge badge-today">Hoje</span>';
        else if (days === 1) badge = '<span class="ev-badge badge-soon">Amanhã</span>';
        else if (days <= 7) badge = `<span class="ev-badge badge-soon">Em ${days} dias</span>`;
    }

    const card = document.createElement('article');
    card.className = 'event-card';
    card.innerHTML = `
        <div class="ev-date-badge">
            <span class="day">${dayNum}</span>
            <span class="month">${monthName}</span>
        </div>
        <div class="ev-content">
            <div class="ev-header">
                <span class="ev-category">${getCatIcon(ev.category)} ${esc(ev.category || 'Evento')}</span>
                ${badge}
            </div>
            <h3 class="ev-title">${esc(ev.title || 'Evento sem título')}</h3>
            ${ev.description ? `<p class="ev-desc">${esc(ev.description)}</p>` : ''}
            <div class="ev-meta">
                ${ev.location ? `
                    <span class="ev-meta-item">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M7 2C5 2 3.5 3.5 3.5 5.5C3.5 8.5 7 12.5 7 12.5S10.5 8.5 10.5 5.5C10.5 3.5 9 2 7 2Z" stroke="currentColor" stroke-width="1.5"/>
                            <circle cx="7" cy="5.5" r="1.5" stroke="currentColor" stroke-width="1.3"/>
                        </svg>
                        ${esc(ev.location)}
                    </span>
                ` : ''}
                ${dateStr ? `
                    <span class="ev-meta-item">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <rect x="2" y="3" width="10" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
                            <path d="M4.5 1.5v2M9.5 1.5v2M2 6h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                        ${dateStr}
                    </span>
                ` : ''}
            </div>
            <a href="eventos.html" class="ev-link">
                Ver detalhes
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </a>
        </div>
    `;

    return card;
}

function getCatIcon(cat) {
    const icons = {
        'Música':'🎵','Teatro':'🎭','Dança':'💃','Cinema':'🎬',
        'Exposição':'🖼️','Festival':'🎪','Literatura':'📚',
        'Gastronomia':'🍽️','Esporte':'⚽','Tradicional':'🎉',
        'Cultural':'🎨','Religioso':'⛪','Artesanato':'🧶'
    };
    return icons[cat] || '📅';
}

// ══════════════════════════════════════════
// LUGARES (primeiros 6-8 com filtro)
// ══════════════════════════════════════════

let currentCategory = 'all';

async function loadLugares() {
    const grid = document.getElementById('placesGrid');
    const filtersWrap = document.getElementById('categoryFilters');
    if (!grid) return;

    try {
        let snap;
        try {
            snap = await db.collection('espacos').where('status', '==', 'ativo').limit(24).get();
        } catch (err) {
            snap = await db.collection('places').limit(24).get();
        }

        if (!snap || snap.empty) {
            grid.innerHTML = `<div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                    <path d="M24 8C17 8 11 14 11 20C11 29 24 42 24 42S37 29 37 20C37 14 31 8 24 8Z" stroke="currentColor" stroke-width="2.5"/>
                    <circle cx="24" cy="20" r="5" stroke="currentColor" stroke-width="2.5"/>
                </svg>
                <p>Nenhum lugar cadastrado</p>
            </div>`;
            return;
        }

        todosLugares = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Montar filtros de categoria
        if (filtersWrap) {
            const categories = [...new Set(
                todosLugares.map(l => l.categoria || l.category).filter(Boolean)
            )].sort();

            categories.forEach(cat => {
                const btn = document.createElement('button');
                btn.className = 'cat-filter';
                btn.textContent = cat;
                btn.dataset.category = cat;
                btn.addEventListener('click', () => filterByCategory(cat));
                filtersWrap.appendChild(btn);
            });
        }

        renderPlaces(todosLugares.slice(0, 8), grid);

    } catch (err) {
        console.error('❌ Lugares:', err);
        grid.innerHTML = `<div class="empty-state">
            <p>Não foi possível carregar os lugares</p>
        </div>`;
    }
}

function filterByCategory(cat) {
    currentCategory = cat;
    const grid = document.getElementById('placesGrid');
    const filtersWrap = document.getElementById('categoryFilters');

    // Atualiza botões ativos
    filtersWrap?.querySelectorAll('.cat-filter').forEach(btn => {
        btn.classList.toggle('cat-filter-active', btn.dataset.category === cat);
    });

    // Filtra lugares
    const filtered = cat === 'all' 
        ? todosLugares.slice(0, 8)
        : todosLugares.filter(l => (l.categoria || l.category) === cat).slice(0, 8);

    renderPlaces(filtered, grid);
}

function renderPlaces(places, grid) {
    grid.innerHTML = '';

    if (!places.length) {
        grid.innerHTML = `<div class="empty-state">
            <p>Nenhum lugar nessa categoria</p>
        </div>`;
        return;
    }

    places.forEach(place => {
        grid.appendChild(buildPlaceCard(place));
    });
}

function buildPlaceCard(place) {
    const nome = place.nome || place.name || 'Local';
    const cat = place.categoria || place.category || 'Local';
    const desc = place.descricao || place.description || '';

    const card = document.createElement('article');
    card.className = 'place-card';
    card.innerHTML = `
        <div class="place-icon">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M16 4C11 4 7 8 7 12C7 18 16 28 16 28S25 18 25 12C25 8 21 4 16 4Z" stroke="currentColor" stroke-width="2.2"/>
                <circle cx="16" cy="12" r="3.5" stroke="currentColor" stroke-width="2"/>
            </svg>
        </div>
        <div class="place-content">
            <div class="place-category">${getCatIcon(cat)} ${esc(cat)}</div>
            <h3 class="place-name">${esc(nome)}</h3>
            ${desc ? `<p class="place-desc">${esc(desc)}</p>` : ''}
            <a href="../index.html?place=${place.id}" class="place-link">
                Ver no mapa
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </a>
        </div>
    `;

    card.addEventListener('click', (e) => {
        if (!e.target.closest('a')) {
            window.location.href = `../index.html?place=${place.id}`;
        }
    });

    return card;
}

async function loadWeather() {
    const weatherTemp = document.getElementById('weatherTemp');
    const weatherDesc = document.getElementById('weatherDesc');
    const weatherUpdated = document.getElementById('weatherUpdated');
    const weatherIcon = document.getElementById('weatherIcon');
    if (!weatherTemp || !weatherDesc || !weatherUpdated) return;

    const lat = -21.9722;
    const lon = -43.2814;

    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`);
        const data = await res.json();
        const temp = data?.current?.temperature_2m;
        const code = data?.current?.weather_code;
        const label = getWeatherLabel(code);
        const icon = getWeatherIcon(code);

        weatherTemp.textContent = `${Math.round(temp)}°C`;
        weatherDesc.textContent = label;
        if (weatherIcon) weatherIcon.textContent = icon;
        weatherUpdated.textContent = 'agora';
    } catch (err) {
        console.warn('⚠️ Clima indisponível:', err);
        weatherTemp.textContent = '22°C';
        weatherDesc.textContent = 'Tempo limpo';
        if (weatherIcon) weatherIcon.textContent = '☀️';
        weatherUpdated.textContent = 'offline';
    }
}

function getWeatherLabel(code) {
    const map = {
        0: 'Céu limpo',
        1: 'Parcialmente nublado',
        2: 'Nublado',
        3: 'Encoberto',
        45: 'Nevoeiro',
        48: 'Nevoeiro',
        51: 'Garoa leve',
        53: 'Garoa',
        61: 'Chuva leve',
        63: 'Chuva moderada',
        65: 'Chuva forte',
        80: 'Pancadas',
        81: 'Chuva forte',
        82: 'Chuva forte'
    };
    return map[code] || 'Clima estável';
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
    return map[code] || '☀️';
}

// ══════════════════════════════════════════
// EVENT LISTENERS
// ══════════════════════════════════════════

function setupListeners() {
    // Filtro "Todos"
    const allBtn = document.querySelector('.cat-filter[data-category="all"]');
    if (allBtn) {
        allBtn.addEventListener('click', () => filterByCategory('all'));
    }

    document.querySelectorAll('.hero-stat-link').forEach((stat) => {
        stat.addEventListener('click', () => {
            const target = stat.dataset.target;
            if (target === 'map') {
                window.location.href = '../index.html';
                return;
            }
            if (target === 'eventos') {
                window.location.href = 'eventos.html';
            }
        });
    });

    // Scroll suave para indicador do hero
    const scrollIndicator = document.querySelector('.hero-scroll-indicator');
    if (scrollIndicator) {
        scrollIndicator.addEventListener('click', () => {
            const firstSection = document.querySelector('.section-eventos');
            if (firstSection) {
                firstSection.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }
}

function setupAboutCarousel() {
    const slider = document.getElementById('aboutSlider');
    if (!slider) return;

    const slides = Array.from(slider.querySelectorAll('.about-slide'));
    if (slides.length < 2) return;

    let index = 0;

    setInterval(() => {
        slides[index].classList.remove('active');
        index = (index + 1) % slides.length;
        slides[index].classList.add('active');
    }, 3600);
}

// ══════════════════════════════════════════
// LOADING
// ══════════════════════════════════════════

function hideLoading() {
    const el = document.getElementById('loadingOverlay');
    if (!el) return;
    el.style.opacity = '0';
    setTimeout(() => { 
        el.style.display = 'none'; 
        el.setAttribute('aria-hidden', 'true');
    }, 350);
}

// ══════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════

function toDate(val) {
    if (!val) return null;
    if (val && typeof val.toDate === 'function') return val.toDate();
    if (val && typeof val.seconds === 'number') return new Date(val.seconds * 1000);
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
}

function esc(str) {
    return String(str ?? '')
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;');
}
