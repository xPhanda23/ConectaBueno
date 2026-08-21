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
            hideLoading();
            // Carrega seções em paralelo
            await Promise.all([
                loadStatistics(),
                loadEventos(),
                loadLugares()
            ]);
        } else {
            window.location.href = 'login.html';
        }
    });

    setupListeners();
    setupHeaderScroll();
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
            nome: user.displayName || user.email.split('@')[0],
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
            nome: user.email.split('@')[0], 
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
    console.log('🔄 Carregando estatísticas...');
    console.log('DB disponível:', !!db);
    console.log('Auth disponível:', !!auth);
    console.log('User atual:', auth?.currentUser?.uid);
    
    if (!db) {
        console.error('❌ Firestore não disponível');
        setTxt('statPlaces', '0');
        setTxt('statEvents', '0');
        return;
    }
    
    try {
        console.log('🔄 Testando acesso ao Firestore...');
        
        // Testar places
        console.log('🔄 Buscando places...');
        const pSnap = await db.collection('places').limit(1).get();
        console.log('✅ Places query executada. Docs:', pSnap.size);
        
        // Buscar total
        const pSnapAll = await db.collection('places').get();
        console.log('✅ Places total:', pSnapAll.size);
        
        // Testar events
        console.log('🔄 Buscando events...');
        const eSnap = await db.collection('events').limit(1).get();
        console.log('✅ Events query executada. Docs:', eSnap.size);
        
        // Buscar total
        const eSnapAll = await db.collection('events').get();
        console.log('✅ Events total:', eSnapAll.size);

        // Animar contadores
        animCount('statPlaces', pSnapAll.size);
        animCount('statEvents', eSnapAll.size);

    } catch (err) {
        console.error('❌ Erro ao carregar estatísticas:', err);
        console.error('Código do erro:', err.code);
        console.error('Mensagem:', err.message);
        
        // Tentar com coleções alternativas
        try {
            console.log('🔄 Tentando coleções alternativas (espacos/eventos)...');
            const pSnap2 = await db.collection('espacos').get();
            const eSnap2 = await db.collection('eventos').get();
            console.log('✅ Espacos:', pSnap2.size);
            console.log('✅ Eventos:', eSnap2.size);
            
            animCount('statPlaces', pSnap2.size);
            animCount('statEvents', eSnap2.size);
        } catch (err2) {
            console.error('❌ Erro com coleções alternativas:', err2);
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

    try {
        const now = new Date(); 
        now.setHours(0,0,0,0);

        const snap = await db.collection('events')
            .where('startDate','>=', now)
            .orderBy('startDate','asc')
            .limit(4)
            .get();

        grid.innerHTML = '';

        if (snap.empty) {
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

        snap.forEach(doc => {
            const ev = { id: doc.id, ...doc.data() };
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
    const date = ev.startDate?.toDate ? ev.startDate.toDate() : null;
    const endDt = ev.endDate?.toDate ? ev.endDate.toDate() : null;
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
        const snap = await db.collection('places').limit(24).get();

        if (snap.empty) {
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

// ══════════════════════════════════════════
// EVENT LISTENERS
// ══════════════════════════════════════════

function setupListeners() {
    // Filtro "Todos"
    const allBtn = document.querySelector('.cat-filter[data-category="all"]');
    if (allBtn) {
        allBtn.addEventListener('click', () => filterByCategory('all'));
    }

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

function esc(str) {
    return String(str ?? '')
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;');
}
