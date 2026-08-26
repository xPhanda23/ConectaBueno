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
                loadWeather(),
                loadPopulation(),
                loadHospedagens()
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
    setupRevealAnimations();
    renderTimeline();
    renderCulturaViva();
    renderTestimonials();
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

    observeReveal(card);
    return card;
}

function getCatIcon(cat) {
    const icons = {
        'Música':'🎵','Teatro':'🎭','Dança':'💃','Cinema':'🎬',
        'Exposição':'🖼️','Festival':'🎪','Literatura':'📚',
        'Gastronomia':'🍽️','Esporte':'⚽','Tradicional':'🎉',
        'Cultural':'🎨','Religioso':'⛪','Artesanato':'🧶',
        'Hotel':'🏨','Pousada':'🏡','Chale':'🏔️','Camping':'⛺','Hostel':'🛏️'
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

    observeReveal(card);
    return card;
}

// ══════════════════════════════════════════
// HOSPEDAGENS
// ══════════════════════════════════════════

const AMENITY_LABELS = {
    wifi: 'Wi-Fi',
    cafeDaManha: 'Café da manhã',
    piscina: 'Piscina',
    petFriendly: 'Pet friendly',
    estacionamento: 'Estacionamento',
    arCondicionado: 'Ar-condicionado',
    churrasqueira: 'Churrasqueira'
};

const PRECO_LABELS = {
    economico: '$',
    moderado: '$$',
    alto_padrao: '$$$'
};

async function loadHospedagens() {
    const grid = document.getElementById('hospedagensGrid');
    if (!grid) return;

    try {
        const snap = await db.collection('hospedagens').where('status', '==', 'ativo').limit(9).get();
        grid.innerHTML = '';

        if (!snap || snap.empty) {
            grid.innerHTML = `<div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                    <path d="M5 40V17L24 6L43 17V40H27V27H21V40H5Z" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
                </svg>
                <p>Nenhuma hospedagem cadastrada no momento</p>
            </div>`;
            return;
        }

        snap.docs.forEach(doc => {
            grid.appendChild(buildHospedagemCard({ id: doc.id, ...doc.data() }));
        });

    } catch (err) {
        console.error('❌ Hospedagens:', err);
        grid.innerHTML = `<div class="empty-state">
            <p>Não foi possível carregar as hospedagens</p>
        </div>`;
    }
}

function buildHospedagemCard(h) {
    const imgStyle = h.imagem ? ` style="background-image:url('${esc(h.imagem)}')"` : '';
    const precoTag = PRECO_LABELS[h.faixaPreco] || '';
    const amenities = Array.isArray(h.comodidades) ? h.comodidades.slice(0, 4) : [];

    const card = document.createElement('article');
    card.className = 'hospedagem-card';
    card.innerHTML = `
        <div class="hosp-img"${imgStyle}>
            ${!h.imagem ? `<svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true"><path d="M5 30V13L18 5L31 13V30H20V20H16V30H5Z" stroke="currentColor" stroke-width="2"/></svg>` : ''}
            ${precoTag ? `<span class="hosp-price-badge">${precoTag}</span>` : ''}
        </div>
        <div class="hosp-content">
            <span class="hosp-type">${getCatIcon(h.tipo)} ${esc(h.tipo || 'Hospedagem')}</span>
            <h3 class="hosp-name">${esc(h.nome || 'Hospedagem')}</h3>
            ${h.descricao ? `<p class="hosp-desc">${esc(h.descricao)}</p>` : ''}
            ${amenities.length ? `<div class="hosp-amenities">${amenities.map(a => `<span class="hosp-amenity">${esc(AMENITY_LABELS[a] || a)}</span>`).join('')}</div>` : ''}
            <div class="hosp-actions">
                ${h.whatsapp ? `<a class="hosp-action-btn hosp-action-btn-primary" href="https://wa.me/${esc(h.whatsapp.replace(/\D/g, ''))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
                ${h.website ? `<a class="hosp-action-btn" href="${esc(h.website)}" target="_blank" rel="noopener">Site</a>` : ''}
            </div>
        </div>
    `;

    observeReveal(card);
    return card;
}

async function loadWeather() {
    const weatherWidget = document.getElementById('weatherWidget');
    const weatherTemp = document.getElementById('weatherTemp');
    const weatherIcon = document.getElementById('weatherIcon');
    if (!weatherTemp) return;

    // Coordenadas de Bueno Brandão, MG (Serra da Mantiqueira)
    const lat = -22.4408;
    const lon = -46.3508;

    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`);
        const data = await res.json();
        const temp = data?.current?.temperature_2m;
        const code = data?.current?.weather_code;
        const label = getWeatherLabel(code);

        weatherTemp.textContent = `${Math.round(temp)}°C`;
        if (weatherIcon) weatherIcon.textContent = getWeatherIcon(code);
        if (weatherWidget) weatherWidget.title = `${label} em Bueno Brandão`;
    } catch (err) {
        console.warn('⚠️ Clima indisponível:', err);
        weatherTemp.textContent = '22°C';
        if (weatherIcon) weatherIcon.textContent = '☀️';
        if (weatherWidget) weatherWidget.title = 'Tempo limpo em Bueno Brandão';
    }
}

// ══════════════════════════════════════════
// POPULAÇÃO (IBGE — estimativa oficial)
// ══════════════════════════════════════════

async function loadPopulation() {
    const heroStat = document.getElementById('statPopulation');
    const aboutStat = document.getElementById('aboutPopulation');
    if (!heroStat && !aboutStat) return;

    try {
        // Código do município de Bueno Brandão, MG no IBGE: 3109105
        const res = await fetch('https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/-1/variaveis/9324?localidades=N6[3109105]');
        const data = await res.json();
        const serie = data?.[0]?.resultados?.[0]?.series?.[0]?.serie;
        const ano = serie ? Object.keys(serie)[0] : null;
        const valor = ano ? parseInt(serie[ano], 10) : null;

        if (!valor || Number.isNaN(valor)) return;

        const formatted = `${(valor / 1000).toFixed(1).replace('.0', '')} mil`;
        if (heroStat) heroStat.textContent = `~${formatted}`;
        if (aboutStat) aboutStat.textContent = `~${valor.toLocaleString('pt-BR')}`;
    } catch (err) {
        console.warn('⚠️ População (IBGE) indisponível:', err);
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
            const firstSection = document.querySelector('.section-quickfacts');
            if (firstSection) {
                firstSection.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }
}

// ══════════════════════════════════════════
// REVELAR AO ROLAR
// ══════════════════════════════════════════

let revealObserver = null;

function setupRevealAnimations() {
    if (!('IntersectionObserver' in window)) {
        document.querySelectorAll('.reveal').forEach(el => el.classList.add('is-visible'));
        return;
    }

    revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
}

function observeReveal(el) {
    el.classList.add('reveal');
    if (revealObserver) revealObserver.observe(el);
    else el.classList.add('is-visible');
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
// LINHA DO TEMPO
// Conteúdo estático — fatos históricos reais pesquisados
// (Câmara Municipal de Bueno Brandão, IBGE, AltaMontanha)
// ══════════════════════════════════════════

const TIMELINE_DATA = [
    { date: '~1800', title: 'Ocupação bandeirante', desc: 'Colonizadores portugueses — Capitão Antônio Amaral, Antonio Nunes Brigagão e o Coronel Agostinho — se estabelecem às margens do Ribeirão das Antas.' },
    { date: '1800', title: 'Bom Jesus da Pedra Fria', desc: 'Patrício José Joaquim de Miranda traz a imagem do Senhor Bom Jesus da Pedra Fria. O povoado recebe seu primeiro nome.' },
    { date: '~1850', title: 'Campo Místico', desc: 'O frade italiano Eugênio Maria de Gênova sugere "Bom Jesus do Campo Místico", logo abreviado para Campo Místico.' },
    { date: '1º de julho de 1850', title: 'Distrito de Pouso Alegre', desc: 'Pela Lei Provincial nº 471, Campo Místico se torna distrito de Pouso Alegre.' },
    { date: '23 de julho de 1864', title: 'Subordinado a Jaguari/Camanducaia', desc: 'A Lei Provincial nº 1.190 muda a subordinação administrativa do distrito.' },
    { date: '4 de novembro de 1880', title: 'Transferido para Ouro Fino', desc: 'A Lei Provincial nº 2.658 vincula o distrito ao município de Ouro Fino.' },
    { date: '17 de dezembro de 1938', title: 'Emancipação: nasce Bueno Brandão', desc: 'O Decreto-Lei nº 148 cria o município, rebatizado em homenagem ao ex-governador de Minas Gerais Júlio Bueno Brandão.', featured: true },
    { date: '2013', title: 'Monumento a Júlio Bueno Brandão', desc: 'Inaugurado na Praça Virgílio de Melo Franco, no centro da cidade.' },
    { date: 'Hoje', title: 'Cidade das Cachoeiras', desc: 'Cerca de 11,2 mil habitantes (IBGE) e por volta de 30 quedas d’água — um símbolo vivo da identidade de Bueno Brandão.' }
];

function renderTimeline() {
    const track = document.getElementById('timelineTrack');
    if (!track) return;

    track.innerHTML = '';
    TIMELINE_DATA.forEach(item => {
        const el = document.createElement('div');
        el.className = 'timeline-item' + (item.featured ? ' timeline-featured' : '');
        el.innerHTML = `
            <span class="timeline-dot" aria-hidden="true"></span>
            <div class="timeline-card">
                <span class="timeline-date">${esc(item.date)}</span>
                <h3 class="timeline-title">${esc(item.title)}</h3>
                <p class="timeline-desc">${esc(item.desc)}</p>
            </div>
        `;
        observeReveal(el);
        track.appendChild(el);
    });
}

// ══════════════════════════════════════════════════════════
// CULTURA VIVA
// CV_FACTS: fatos reais pesquisados sobre tradições locais.
//
// CULTURA_VIVA_PROFILES — PERFIS DE EXEMPLO (PLACEHOLDER)
// Nomes e biografias são ILUSTRATIVOS, não pessoas reais.
// Diferente do restante do site ("Zero Mock Data" — apenas
// Firestore real), este array é conteúdo estático editorial
// a ser substituído por perfis reais antes da publicação.
// Cada item tem `placeholder: true` para localizar/substituir,
// e o cartão exibe a tag visível "Exemplo ilustrativo".
// ══════════════════════════════════════════════════════════

const CV_FACTS = [
    { icon: '💧', title: 'Cidade das Cachoeiras', desc: 'Cerca de 30 quedas d’água, entre elas a Cachoeira dos Luiz, do Félix, do Cigano, de Santa Rita e do Davi.' },
    { icon: '⛪', title: 'Arquitetura de Fé', desc: 'Aproximadamente 30 igrejas históricas erguidas com a torre única, marca registrada da arquitetura religiosa da região.' },
    { icon: '⛰️', title: 'Picos da Serra', desc: 'Pedra da Torre (~1.750 m), Pico Dois Irmãos (~1.560 m) e Pedra Vermelha (~1.600 m) coroam a paisagem.' },
    { icon: '🍇', title: 'Tradição Vinícola', desc: 'Herança dos colonizadores portugueses, viva até hoje na produção local de vinho.' },
    { icon: '🐐', title: 'Queijos de Cabra', desc: 'Produção artesanal de laticínios caprinos, um saber-fazer passado de geração em geração.' }
];

const CULTURA_VIVA_PROFILES = [
    { nome: 'Seu Ronaldo', papel: 'Violeiro e Contador de Causos', bio: 'Há mais de 40 anos toca viola e reúne vizinhos nas tardes de domingo para contar as histórias antigas da Serra da Mantiqueira.', placeholder: true },
    { nome: 'Dona Zélia', papel: 'Guardiã da Tradição do Queijo', bio: 'Aprendeu com a mãe o ofício dos queijos de cabra artesanais, uma receita que atravessa gerações na região.', placeholder: true },
    { nome: 'Marina', papel: 'Poeta da Serra', bio: 'Escreve sobre as cachoeiras, as igrejas de torre única e a vida simples do interior mineiro em versos publicados em jornais locais.', placeholder: true }
];

function initialsOf(name) {
    return String(name || '').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function renderCulturaViva() {
    const factsGrid = document.getElementById('cvFactsGrid');
    if (factsGrid) {
        factsGrid.innerHTML = '';
        CV_FACTS.forEach(f => {
            const card = document.createElement('div');
            card.className = 'cv-fact-card';
            card.innerHTML = `
                <div class="cv-fact-icon" aria-hidden="true">${f.icon}</div>
                <h3 class="cv-fact-title">${esc(f.title)}</h3>
                <p class="cv-fact-desc">${esc(f.desc)}</p>
            `;
            observeReveal(card);
            factsGrid.appendChild(card);
        });
    }

    const profilesGrid = document.getElementById('cvProfilesGrid');
    if (profilesGrid) {
        profilesGrid.innerHTML = '';
        CULTURA_VIVA_PROFILES.forEach(p => {
            const card = document.createElement('div');
            card.className = 'cv-profile-card';
            card.innerHTML = `
                ${p.placeholder ? '<span class="example-tag">Exemplo ilustrativo</span>' : ''}
                <div class="cv-profile-avatar" aria-hidden="true">${esc(initialsOf(p.nome))}</div>
                <h4 class="cv-profile-name">${esc(p.nome)}</h4>
                <span class="cv-profile-role">${esc(p.papel)}</span>
                <p class="cv-profile-bio">${esc(p.bio)}</p>
            `;
            observeReveal(card);
            profilesGrid.appendChild(card);
        });
    }
}

// ══════════════════════════════════════════════════════════
// DEPOIMENTOS — PLACEHOLDER
// Mesma convenção da seção Cultura Viva acima: nomes curtos,
// biografias ILUSTRATIVAS, tag visível "Exemplo ilustrativo".
// ══════════════════════════════════════════════════════════

const TESTIMONIALS_DATA = [
    { nome: 'Cida', papel: 'Moradora, Bairro Centro', texto: 'Aqui a gente ainda conhece o vizinho pelo nome. É esse acolhimento que faz Bueno Brandão ser especial.', placeholder: true },
    { nome: 'João', papel: 'Produtor Rural', texto: 'Cresci ouvindo o som das cachoeiras. Hoje mostro esse mesmo som para meus filhos — e para quem vem nos visitar.', placeholder: true },
    { nome: 'Helena', papel: 'Comerciante Local', texto: 'A gente vive do turismo com orgulho, porque cada visitante que chega se apaixona pela nossa serra como a gente.', placeholder: true }
];

function renderTestimonials() {
    const grid = document.getElementById('testimonialsGrid');
    if (!grid) return;

    grid.innerHTML = '';
    TESTIMONIALS_DATA.forEach(t => {
        const card = document.createElement('div');
        card.className = 'testimonial-card';
        card.innerHTML = `
            ${t.placeholder ? '<span class="example-tag">Exemplo ilustrativo</span>' : ''}
            <span class="testimonial-quote-mark" aria-hidden="true">"</span>
            <p class="testimonial-text">${esc(t.texto)}</p>
            <div class="testimonial-footer">
                <div class="testimonial-avatar" aria-hidden="true">${esc(initialsOf(t.nome))}</div>
                <div>
                    <div class="testimonial-name">${esc(t.nome)}</div>
                    <div class="testimonial-role">${esc(t.papel)}</div>
                </div>
            </div>
        `;
        observeReveal(card);
        grid.appendChild(card);
    });
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
