/**
 * map.js — Mapa Principal do Conecta Bueno
 * Gerencia mapa, filtros, busca, ordenação, legenda, clustering e autenticação
 */

// ===================================
// VARIÁVEIS GLOBAIS
// ===================================

let map;
let markerClusterGroup;
let markers = [];
let allSpaces = [];
let currentUser = null;
let userLocation = null;
let activeCategory = 'todas';
let searchQuery = '';
let sortMode = 'nome';
let showFavoritesOnly = false;

// Favoritos de locais (IDs salvos no Firestore por usuário — só para
// contas permanentes; visitantes veem o convite de login ao tentar).
let userLugaresFavoritos = new Set();

// IDs dos lugares já visitados pelo usuário (Passaporte Cultural,
// js/passport.js) — mesmo padrão de cache local que userLugaresFavoritos.
let userVisitasIds = new Set();

// Painel de detalhes do espaço (substitui o popup do Leaflet)
let activeMarker = null;
let currentDetailSpaceId = null;
let detailReturnFocusEl = null;

// Meu roteiro — passeio com vários pontos, guardado em localStorage
// (não depende de conta: funciona pra visitante anônimo também).
// Formato: [{ id, nome, categoria, lat, lng, addedAt }]
let roteiro = [];
const ROTEIRO_STORAGE_KEY = 'cb-roteiro';
const ROTEIRO_AVG_SPEED_KMH = 35; // estrada de serra sinuosa — estimativa, não roteamento real
const ROTEIRO_MAX_WAYPOINTS = 9;  // limite prático do link de rota do Google Maps

// Centro de Bueno Brandão
const BUENO_CENTER = {
    lat: -22.4408,
    lng: -46.3511
};

// Limites do município e zona rural ao redor (aproximado ±0.15 graus)
const BUENO_BOUNDS = [
    [-22.5908, -46.5011], // sudoeste
    [-22.2908, -46.2011]  // nordeste
];

// Cores e ícones por categoria
const categoryColors = {
    'Cachoeira': '#00bcd4',
    'Montanha': '#8d6e63',
    'Trilha': '#66bb6a',
    'Mirante': '#ffa726',
    'Parque': '#4caf50',
    'Cultura': '#ba68c8',
    'Gastronomia': '#ff7043',
    'Hotel': '#5c6bc0',
    'Comercio': '#42a5f5'
};

const categoryIcons = {
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

// ===================================
// INICIALIZAÇÃO
// ===================================

document.addEventListener('DOMContentLoaded', function () {
    console.log('🗺️ Inicializando Conecta Bueno...');
    initAuth();
});

// ===================================
// AUTENTICAÇÃO E PROTEÇÃO DE ROTA
// ===================================

function initAuth() {
    const checkFirebase = setInterval(async () => {
        if (window.db && window.auth) {
            clearInterval(checkFirebase);

            // Nenhuma tela de login na entrada: garante uma sessão (anônima,
            // se preciso) apenas para satisfazer as regras do Firestore,
            // sem nunca navegar para login.html. Se já existir conta real
            // logada, a função detecta isso e não mexe na sessão.
            if (typeof garantirSessaoVisitante === 'function') {
                await garantirSessaoVisitante();
            }

            window.auth.onAuthStateChanged(async (user) => {
                renderMapAuthState(user);
                if (user) {
                    console.log(user.isAnonymous ? '👋 Sessão de visitante ativa' : `✅ Usuário autenticado: ${user.email}`);
                    await loadUserProfile(user);
                } else {
                    console.log('👋 Navegando sem sessão (recursos que exigem conta ficam bloqueados)');
                }
                initApp();
            });
        }
    }, 100);

    setTimeout(() => {
        if (!window.db || !window.auth) {
            clearInterval(checkFirebase);
            console.error('⏱️ Timeout na inicialização do Firebase');
            showToast('Erro ao conectar. Recarregue a página.', 'error');
        }
    }, 10000);
}

/** Alterna entre o avatar/dropdown (conta permanente) e o botão
 *  "Entrar / Criar Conta" (visitante anônimo ou sem sessão). */
function renderMapAuthState(user) {
    const wrap = document.getElementById('hdUserWrap');
    if (!wrap) return;

    const isGuest = !user || user.isAnonymous;
    const avatarBtn = document.getElementById('btnUserMenu');
    let cta = document.getElementById('btnAuthCta');

    if (isGuest) {
        if (!cta) {
            cta = document.createElement('a');
            cta.id = 'btnAuthCta';
            cta.className = 'hd-auth-cta';
            // Mesmo rótulo em duas partes de shared-components.js: em
            // telas estreitas o CSS esconde o sufixo e sobra "Entrar".
            cta.innerHTML = 'Entrar<span class="hd-auth-cta-long"> / Criar Conta</span>';
            wrap.appendChild(cta);
        }
        cta.href = wrap.dataset.loginHref || 'login.html';
        cta.style.display = '';
        if (avatarBtn) avatarBtn.style.display = 'none';
        document.getElementById('userDropdown')?.classList.remove('active');
    } else {
        if (cta) cta.style.display = 'none';
        if (avatarBtn) avatarBtn.style.display = '';
    }
}

async function loadUserProfile(user) {
    const db = window.db;
    try {
        const userDoc = await db.collection('users').doc(user.uid).get();

        if (userDoc.exists) {
            currentUser = { uid: user.uid, email: user.email, ...userDoc.data() };
        } else {
            currentUser = {
                uid: user.uid,
                email: user.email,
                nome: user.displayName || (user.isAnonymous ? 'Visitante' : user.email?.split('@')[0]) || 'Usuário',
                role: 'usuario',
                isAdmin: false
            };
            await db.collection('users').doc(user.uid).set(currentUser);
        }

        displayUserProfile();
        await loadUserLugaresFavoritos(user.uid);
        await loadUserVisitas(user.uid);
    } catch (error) {
        console.error('❌ Erro ao carregar perfil:', error);
        showToast('Erro ao carregar perfil', 'error');
    }
}

/* ===================================
   FAVORITOS DE LOCAIS
   =================================== */

async function loadUserLugaresFavoritos(uid) {
    try {
        const doc = await window.db.collection('users').doc(uid)
            .collection('favoritos').doc('lugares').get();
        userLugaresFavoritos = (doc.exists && Array.isArray(doc.data().ids))
            ? new Set(doc.data().ids)
            : new Set();
    } catch {
        userLugaresFavoritos = new Set();
    }
    paintFavButton(currentDetailSpaceId);
    updateFavFilterCount();
}

/* ===================================
   PASSAPORTE CULTURAL
   =================================== */

async function loadUserVisitas(uid) {
    try {
        const visitas = await window.CBPassport.fetchVisitas(uid);
        userVisitasIds = new Set(visitas.map(v => v.lugarId));
    } catch {
        userVisitasIds = new Set();
    }
    refreshCheckinButtonInOpenCard();
}

function refreshCheckinButtonInOpenCard() {
    const btn = document.querySelector('[data-checkin-id]');
    if (!btn) return;
    const isVisited = userVisitasIds.has(btn.dataset.checkinId);
    btn.classList.toggle('is-visited', isVisited);
    btn.innerHTML = `${isVisited ? PC_ICON.roteiroCheck : PC_ICON.pin}<span>${isVisited ? 'Visitado ✓' : 'Marcar como visitado'}</span>`;
    btn.setAttribute('aria-label', isVisited ? 'Você já visitou este lugar' : 'Marcar como visitado no passaporte');
}

async function handleCheckin(space) {
    if (userVisitasIds.has(space.id)) return; // já visitado — idempotente
    const { ok, novosSelos } = await window.CBPassport.registrarVisitaComProgresso(space, 'manual');
    if (!ok) return;
    userVisitasIds.add(space.id);
    refreshCheckinButtonInOpenCard();
    showToast('Visita registrada no passaporte! 🎉', 'success');
    (novosSelos || []).forEach((badge, i) => {
        setTimeout(() => showToast(`Novo selo desbloqueado: ${badge.icon} ${badge.label}!`, 'success'), 900 + i * 700);
    });
}

// Modal do passaporte (abrir/fechar/carregar) é gerenciado por
// js/passport.js (auto-init em qualquer página com #passportModal +
// #menuPassaporte) — aqui só sincronizamos o cache local de visitas
// pra manter o botão "Marcar como visitado" do card certo depois que
// o modal recarrega os dados do Firestore.
document.addEventListener('cbpassport:loaded', (event) => {
    const visitas = event.detail?.visitas;
    if (!visitas) return;
    userVisitasIds = new Set(visitas.map(v => v.lugarId));
    refreshCheckinButtonInOpenCard();
});

function paintFavButton(spaceId) {
    if (!spaceId) return;
    const isFav = userLugaresFavoritos.has(spaceId);
    // querySelectorAll: o mesmo lugar pode ter um botão no cartão da lista
    // E outro no painel de detalhes aberto — os dois precisam refletir o estado.
    document.querySelectorAll(`[data-fav-id="${CSS.escape(spaceId)}"]`).forEach(btn => {
        btn.classList.toggle('is-fav', isFav);
        btn.setAttribute('aria-label', isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos');
        btn.setAttribute('aria-pressed', String(isFav));
        const path = btn.querySelector('svg path');
        if (path) path.setAttribute('fill', isFav ? 'currentColor' : 'none');
    });
}

function updateFavFilterCount() {
    const option = document.getElementById('sortOptionFavoritos');
    if (!option) return;
    const count = userLugaresFavoritos.size;
    option.textContent = count > 0 ? `Favoritos` : 'Favoritos';
}

async function toggleLugarFavorite(spaceId) {
    if (!requireAccount('Favoritar locais')) return;

    const wasFav = userLugaresFavoritos.has(spaceId);
    wasFav ? userLugaresFavoritos.delete(spaceId) : userLugaresFavoritos.add(spaceId);
    paintFavButton(spaceId);
    updateFavFilterCount();
    if (showFavoritesOnly) applyFilters({ focusMap: false });

    try {
        await window.db.collection('users').doc(currentUser.uid)
            .collection('favoritos').doc('lugares')
            .set({ ids: Array.from(userLugaresFavoritos), updatedAt: new Date() });
    } catch (error) {
        wasFav ? userLugaresFavoritos.add(spaceId) : userLugaresFavoritos.delete(spaceId);
        paintFavButton(spaceId);
        updateFavFilterCount();
        if (showFavoritesOnly) applyFilters({ focusMap: false });
        console.error('❌ Favorito de local:', error);
        showToast(
            error?.code === 'permission-denied'
                ? 'Sem permissão para salvar favoritos.'
                : 'Não foi possível salvar o favorito.',
            'error'
        );
    }
}

function displayUserProfile() {
    const nome = currentUser.nome || 'Usuário';
    const email = currentUser.email;
    const iniciais = getInitials(nome);
    const photoURL = currentUser.photoURL;

    const userAvatar = document.getElementById('btnUserMenu');
    const userInitials = document.getElementById('userInitials');

    if (userAvatar && userInitials) {
        if (photoURL && photoURL.startsWith('data:image')) {
            userInitials.style.display = 'none';
            let img = userAvatar.querySelector('img');
            if (!img) {
                img = document.createElement('img');
                img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;';
                userAvatar.appendChild(img);
            }
            img.src = photoURL;
        } else {
            userInitials.textContent = iniciais;
            userInitials.style.display = 'flex';
            userAvatar.querySelector('img')?.remove();
        }
    }

    const userAvatarLarge = document.querySelector('#userDropdown .hd-dd-avatar');
    const userInitialsLarge = document.getElementById('userInitialsLarge');

    if (userAvatarLarge && userInitialsLarge) {
        if (photoURL && photoURL.startsWith('data:image')) {
            userInitialsLarge.style.display = 'none';
            let imgLarge = userAvatarLarge.querySelector('img');
            if (!imgLarge) {
                imgLarge = document.createElement('img');
                imgLarge.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;';
                userAvatarLarge.appendChild(imgLarge);
            }
            imgLarge.src = photoURL;
        } else {
            userInitialsLarge.textContent = iniciais;
            userInitialsLarge.style.display = 'flex';
            userAvatarLarge.querySelector('img')?.remove();
        }
    }

    const userName = document.getElementById('userName');
    const userEmail = document.getElementById('userEmail');
    if (userName) userName.textContent = nome;
    if (userEmail) userEmail.textContent = email;

    const menuAdminPanel = document.getElementById('menuAdminPanel');
    if (menuAdminPanel) {
        menuAdminPanel.style.display = currentUser.isAdmin ? 'flex' : 'none';
    }
}

function getInitials(name) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

// ===================================
// INICIALIZAÇÃO DO APP
// ===================================

function initApp() {
    console.log('🚀 Inicializando aplicação...');

    const sidebar = document.getElementById('sidebar');
    const btnToggleMenu = document.getElementById('btnToggleMenu');

    // Desktop: sidebar aberta. Mobile: mapa em primeiro plano, sidebar acessível pelo botão.
    if (sidebar) {
        const openByDefault = window.innerWidth > 1024;
        sidebar.classList.toggle('active', openByDefault);
        sidebar.classList.toggle('sidebar-collapsed', !openByDefault);
        if (btnToggleMenu) {
            btnToggleMenu.classList.toggle('active', openByDefault);
            btnToggleMenu.innerHTML = openByDefault ? '<span>‹</span>' : '<span>›</span>';
            btnToggleMenu.setAttribute('aria-label', openByDefault ? 'Recolher painel lateral' : 'Expandir painel lateral');
        }
    }

    initMap();
    setupEventListeners();
    loadRoteiro();
    setupRoteiroUI();
    renderRoteiroBadge();
    renderRoteiroTab();
    loadSpaces();

    setTimeout(() => {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 300);
        }
    }, 1000);
}

// ===================================
// MAPA
// ===================================

function initMap() {
    console.log('🗺️ Inicializando mapa...');

    map = L.map('map', {
        center: [BUENO_CENTER.lat, BUENO_CENTER.lng],
        zoom: 14,
        minZoom: 11,
        maxZoom: 21,
        maxBounds: BUENO_BOUNDS,
        maxBoundsViscosity: 1.0,
        zoomControl: false
    });

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=cb1_29oc_1_8106c16c07bc5b3596bfab03', {
    maxZoom: 21,
    maxNativeZoom: 19, // provedor não tem tiles além do 19 — acima disso, o tile do 19 é escalado
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
}).addTo(map);

    // Agrupa marcadores próximos automaticamente (função nova)
    markerClusterGroup = L.markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false
    });
    map.addLayer(markerClusterGroup);

    setTimeout(() => { if (map) map.invalidateSize(); }, 100);
    setTimeout(() => { if (map) map.invalidateSize(); }, 400);

    console.log('✅ Mapa inicializado');
}

// ===================================
// CARREGAR ESPAÇOS DO FIRESTORE
// ===================================

async function loadSpaces() {
    console.log('📍 Carregando espaços...');

    try {
        const snapshot = await window.db.collection('espacos')
            .where('status', '==', 'ativo')
            .get();

        allSpaces = [];
        snapshot.forEach(doc => {
            allSpaces.push({ id: doc.id, ...doc.data() });
        });

        console.log(`✅ ${allSpaces.length} espaços carregados`);

        loadCategories();
        applyFilters({ focusMap: false });
        focusOnPlaceFromQuery();

    } catch (error) {
        console.error('❌ Erro ao carregar espaços:', error);
        showToast('Erro ao carregar espaços', 'error');
    }
}

// Abre direto o lugar vindo de um link "Ver no mapa" da Home (?place=<id>)
function focusOnPlaceFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const placeId = params.get('place');
    if (!placeId) return;

    const space = allSpaces.find(s => s.id === placeId);
    if (!space) {
        showToast('Lugar não encontrado ou indisponível no momento', 'error');
        return;
    }

    setTimeout(() => focusOnSpace(space), 350);
}

function loadCategories() {
    const categoriesSet = new Set();
    allSpaces.forEach(space => {
        if (space.categoria) categoriesSet.add(space.categoria);
    });

    const categories = Array.from(categoriesSet).sort();
    renderCategoryFilters(categories);
    renderMapLegend(categories);
}

function renderCategoryFilters(categories) {
    const container = document.getElementById('filterButtons');
    if (!container) return;
    container.innerHTML = '';

    const todasBtn = document.createElement('button');
    todasBtn.className = 'filter-btn active';
    todasBtn.dataset.category = 'todas';
    todasBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        <span>Todas</span>
    `;
    todasBtn.addEventListener('click', () => filterByCategory('todas'));
    container.appendChild(todasBtn);

    // Ícones SVG para os botões de filtro (não confundir com categoryIcons, que são emojis dos marcadores)
    const categoryFilterIcons = {
        'Cachoeira': '<path d="M10 2C10 2 7 6 7 9C7 10.1 7.9 11 9 11H11C12.1 11 13 10.1 13 9C13 6 10 2 10 2Z" stroke="currentColor" stroke-width="1.5"/>',
        'Montanha': '<path d="M2 14L7 6L10 10L15 4L18 14H2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
        'Trilha': '<path d="M3 18L6 12L9 15L12 9L15 13L18 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
        'Mirante': '<path d="M2 12L9 5L16 12M5 10V18H13V10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
        'Parque': '<circle cx="9" cy="6" r="4" stroke="currentColor" stroke-width="1.5"/><path d="M9 10V18" stroke="currentColor" stroke-width="1.5"/>',
        'Cultura': '<rect x="4" y="4" width="12" height="14" rx="1" stroke="currentColor" stroke-width="1.5"/><path d="M8 8H12M8 12H12" stroke="currentColor" stroke-width="1.5"/>',
        'default': '<circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.5"/>'
    };

    categories.forEach(category => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn';
        btn.dataset.category = category;

        const icon = categoryFilterIcons[category] || categoryFilterIcons.default;

        btn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">${icon}</svg>
            <span>${esc(category)}</span>
        `;

        btn.addEventListener('click', () => filterByCategory(category));
        container.appendChild(btn);
    });
}

function filterByCategory(category) {
    activeCategory = category;

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });

    applyFilters();
}

// ===================================
// LEGENDA DE CATEGORIAS (nova)
// ===================================

function renderMapLegend(categories) {
    const content = document.getElementById('legendContent');
    if (!content) return;

    if (!categories.length) {
        content.innerHTML = '';
        return;
    }

    content.innerHTML = categories.map(cat => `
        <div class="legend-item">
            <span class="legend-dot" style="background:${categoryColors[cat] || '#2d5a3d'}"></span>
            <span>${esc(cat)}</span>
        </div>
    `).join('');
}

function setupLegendToggle() {
    const btn = document.getElementById('btnLegendToggle');
    const content = document.getElementById('legendContent');
    if (!btn || !content) return;

    btn.addEventListener('click', () => {
        const isHidden = content.hidden;
        content.hidden = !isHidden;
        btn.setAttribute('aria-expanded', String(isHidden));
    });
}

// ===================================
// BUSCA + FILTRO + ORDENAÇÃO (consolidados)
// ===================================

// Único ponto que recalcula a view: aplica categoria + busca, ordena,
// e atualiza mapa + lista + contador + estatísticas juntos — evita os
// pequenos desvios que existiam entre os antigos call sites separados.
function applyFilters({ focusMap = true } = {}) {
    let filtered = activeCategory === 'todas'
        ? allSpaces
        : allSpaces.filter(space => space.categoria === activeCategory);

    if (showFavoritesOnly) {
        filtered = filtered.filter(space => userLugaresFavoritos.has(space.id));
    }

    if (searchQuery) {
        const q = searchQuery;
        filtered = filtered.filter(space =>
            (space.nome && space.nome.toLowerCase().includes(q)) ||
            (space.categoria && space.categoria.toLowerCase().includes(q)) ||
            (space.endereco && space.endereco.toLowerCase().includes(q)) ||
            (space.descricao && space.descricao.toLowerCase().includes(q))
        );
    }

    const sorted = sortSpaces(filtered, sortMode);

    renderSpaces(sorted);
    reconcileDetailPanelWithFilters(sorted);
    renderResultsList(sorted);
    updateResultsCount(sorted.length);
    updateSidebarStats();

    if (!focusMap) return;

    if (activeCategory === 'todas' && !searchQuery) {
        map.setView([BUENO_CENTER.lat, BUENO_CENTER.lng], 14, { animate: true, duration: 1 });
    } else {
        focusMapOnPlaces(sorted);
    }
}

function sortSpaces(spaces, mode) {
    const arr = [...spaces];

    if (mode === 'categoria') {
        arr.sort((a, b) =>
            (a.categoria || '').localeCompare(b.categoria || '') ||
            (a.nome || '').localeCompare(b.nome || '')
        );
    } else if (mode === 'distancia' && userLocation) {
        const origin = userLocation.getLatLng();
        arr.sort((a, b) => distanceMeters(origin, a) - distanceMeters(origin, b));
    } else {
        arr.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    }

    return arr;
}

function distanceMeters(origin, space) {
    if (!Number.isFinite(space.lat) || !Number.isFinite(space.lng)) return Infinity;
    return origin.distanceTo(L.latLng(space.lat, space.lng));
}

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const btnClearSearch = document.getElementById('btnClearSearch');
    if (!searchInput || !btnClearSearch) return;

    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim().toLowerCase();
        btnClearSearch.style.display = searchQuery ? 'flex' : 'none';
        applyFilters();
    });

    btnClearSearch.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        btnClearSearch.style.display = 'none';
        applyFilters();
    });
}

// ===================================
// LISTA DE RESULTADOS (nova)
// ===================================

function renderResultsList(spaces) {
    const list = document.getElementById('resultsList');
    if (!list) return;

    list.innerHTML = '';

    if (!spaces.length) {
        list.innerHTML = `
            <div class="results-empty">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                    <path d="M20 6C14 6 9 11 9 17c0 9 11 21 11 21s11-12 11-21c0-6-5-11-11-11Z" stroke="currentColor" stroke-width="2.2"/>
                    <circle cx="20" cy="17" r="4" stroke="currentColor" stroke-width="2"/>
                </svg>
                <p>Nenhum lugar encontrado</p>
            </div>
        `;
        return;
    }

    spaces.forEach(space => list.appendChild(createSpaceCard(space)));
}

function createSpaceCard(space) {
    const card = document.createElement('div');
    card.className = 'space-card';
    card.dataset.id = space.id;
    card.style.borderLeftColor = categoryColors[space.categoria] || '#2f9e52';

    const isFav = userLugaresFavoritos.has(space.id);
    const heartIcon = PC_ICON.heart.replace('<path ', `<path fill="${isFav ? 'currentColor' : 'none'}" `);

    card.innerHTML = `
        <div class="space-card-top">
            <div class="category">${esc(space.categoria || 'Sem categoria')}</div>
            <button type="button" class="space-card-fav${isFav ? ' is-fav' : ''}" data-fav-id="${esc(space.id)}"
                    aria-label="${isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}" aria-pressed="${isFav}">
                ${heartIcon}
            </button>
        </div>
        <h4>${esc(space.nome || 'Local')}</h4>
        <div class="address">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor">
                <path d="M7 0C4.2 0 2 2.2 2 5c0 3.9 5 9 5 9s5-5.1 5-9c0-2.8-2.2-5-5-5zm0 7c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
            </svg>
            <span>${esc(space.endereco || 'Endereço não informado')}</span>
        </div>
    `;

    card.addEventListener('click', () => focusOnSpace(space));
    card.querySelector('[data-fav-id]').addEventListener('click', (event) => {
        event.stopPropagation();
        toggleLugarFavorite(space.id);
    });

    return card;
}

// ===================================
// RENDERIZAR MARCADORES
// ===================================

function renderSpaces(spaces) {
    markerClusterGroup.clearLayers();
    markers = [];

    spaces.forEach(space => {
        if (Number.isFinite(space.lat) && Number.isFinite(space.lng)) {
            markers.push(createMarker(space));
        }
    });

    console.log(`${markers.length} marcadores adicionados ao mapa`);
}

function createMarker(space) {
    const color = categoryColors[space.categoria] || '#2d5a3d';
    const icon = categoryIcons[space.categoria] || '📍';

    const marker = L.marker([space.lat, space.lng], {
        icon: L.divIcon({
            className: 'custom-marker',
            html: `
                <div class="marker-pin" style="background: ${color};">
                    <span class="marker-icon">${icon}</span>
                </div>
            `,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
            popupAnchor: [0, -18]
        })
    });

    // pan:false — clique direto num marcador não deve mover o mapa,
    // só abrir o painel lateral (diferente de focusOnSpace, que vem da
    // lista/busca e precisa centralizar o marcador antes de abrir).
    marker.on('click', () => openSpaceDetail(space, marker, { pan: false }));

    markerClusterGroup.addLayer(marker);
    return marker;
}

// Ícones do card — declarados uma vez, marcados como decorativos (o
// significado vai no texto/aria-label ao lado).
const PC_ICON = {
    pin: '<svg class="pc-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false"><path d="M9 2C6.5 2 4.5 4 4.5 6.5C4.5 10.4 9 16 9 16C9 16 13.5 10.4 13.5 6.5C13.5 4 11.5 2 9 2ZM9 8.5C8 8.5 7 7.5 7 6.5C7 5.5 8 4.5 9 4.5C10 4.5 11 5.5 11 6.5C11 7.5 10 8.5 9 8.5Z" fill="currentColor"/></svg>',
    clock: '<svg class="pc-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false"><circle cx="9" cy="9" r="7.5" stroke="currentColor" stroke-width="1.5"/><path d="M9 5V9L12 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    phone: '<svg class="pc-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.01 15.38C18.78 15.38 17.59 15.18 16.48 14.82C16.13 14.7 15.74 14.79 15.47 15.06L13.9 17.03C11.07 15.68 8.42 13.13 7.01 10.2L8.96 8.54C9.23 8.26 9.31 7.87 9.2 7.52C8.83 6.41 8.64 5.22 8.64 3.99C8.64 3.45 8.19 3 7.65 3H4.19C3.65 3 3 3.24 3 3.99C3 13.28 10.73 21 20.01 21C20.72 21 21 20.37 21 19.82V16.37C21 15.83 20.55 15.38 20.01 15.38Z" fill="currentColor"/></svg>',
    ticket: '<svg class="pc-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 6H16L14 4H10L8 6H4C2.9 6 2 6.9 2 8V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V8C22 6.9 21.1 6 20 6ZM20 18H4V8H8.83L10.83 6H13.17L15.17 8H20V18ZM12 9C10.34 9 9 10.34 9 12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12C15 10.34 13.66 9 12 9Z" fill="currentColor"/></svg>',
    navigate: '<svg class="pc-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false"><path d="M9 1L3 7H7V13H11V7H15L9 1Z" fill="currentColor"/><rect x="3" y="15" width="12" height="2" rx="1" fill="currentColor"/></svg>',
    waze: '<svg class="pc-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false"><path d="M9 2.5C5.97 2.5 3.5 4.7 3.5 7.7C3.5 10.5 5.6 12.6 8.2 12.9L8.2 14.5H9.8V12.9C12.4 12.6 14.5 10.5 14.5 7.7C14.5 4.7 12.03 2.5 9 2.5Z" stroke="currentColor" stroke-width="1.4"/><circle cx="9" cy="8" r="2.1" stroke="currentColor" stroke-width="1.4"/></svg>',
    info: '<svg class="pc-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false"><circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M9 6V9L12 10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    instagram: '<svg class="pc-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false"><rect x="2" y="2" width="14" height="14" rx="4" stroke="currentColor" stroke-width="1.5"/><circle cx="9" cy="9" r="3.5" stroke="currentColor" stroke-width="1.5"/><circle cx="13" cy="5" r="0.6" fill="currentColor"/></svg>',
    globe: '<svg class="pc-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false"><circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M3 9H15M9 3C9 3 7 5 7 9C7 13 9 15 9 15M9 3C9 3 11 5 11 9C11 13 9 15 9 15" stroke="currentColor" stroke-width="1.5"/></svg>',
    share: '<svg class="pc-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false"><circle cx="12.5" cy="3.5" r="2" stroke="currentColor" stroke-width="1.4"/><circle cx="3.5" cy="8" r="2" stroke="currentColor" stroke-width="1.4"/><circle cx="12.5" cy="12.5" r="2" stroke="currentColor" stroke-width="1.4"/><path d="M5.3 7L10.7 4.2M5.3 9L10.7 11.8" stroke="currentColor" stroke-width="1.4"/></svg>',
    heart: '<svg class="pc-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false"><path d="M9 15.5C9 15.5 2 11 2 6.5C2 4.2 3.9 2.5 6 2.5C7.3 2.5 8.4 3.1 9 4.1C9.6 3.1 10.7 2.5 12 2.5C14.1 2.5 16 4.2 16 6.5C16 11 9 15.5 9 15.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    roteiroAdd: '<svg class="pc-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false"><circle cx="4" cy="4" r="2" stroke="currentColor" stroke-width="1.5"/><circle cx="14" cy="14" r="2" stroke="currentColor" stroke-width="1.5"/><path d="M6 5C10 5 8 13 12 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="1.5 2"/></svg>',
    roteiroCheck: '<svg class="pc-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false"><circle cx="9" cy="9" r="7.5" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 9.2L7.8 11.5L12.5 6.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    listen: '<svg class="pc-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false"><path d="M3 7V11H6L10 14.5V3.5L6 7H3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12.5 6.2C13.3 7 13.8 8 13.8 9C13.8 10 13.3 11 12.5 11.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M14.5 4C15.9 5.4 16.7 7.1 16.7 9C16.7 10.9 15.9 12.6 14.5 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".55"/></svg>',
    stop: '<svg class="pc-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false"><rect x="4" y="4" width="10" height="10" rx="2" fill="currentColor"/></svg>',
    accessible: '<svg class="pc-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false"><circle cx="11" cy="3.2" r="1.4" fill="currentColor"/><path d="M10.4 6.3L9.6 9.8H13.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.6 9.8L6.4 13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M9.2 8.1H6.3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="7" cy="13" r="3.4" stroke="currentColor" stroke-width="1.4"/></svg>',
    trash: '<svg class="pc-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false"><path d="M3.5 5.5H14.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M7 5.5V3.8C7 3.36 7.36 3 7.8 3H10.2C10.64 3 11 3.36 11 3.8V5.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 5.5L6.1 14C6.15 14.55 6.6 15 7.16 15H10.84C11.4 15 11.85 14.55 11.9 14L12.5 5.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.5 8V12M10.5 8V12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'
};

/**
 * Normaliza texto vindo do Firestore: colapsa espaços e remove pontuação
 * pendente no fim (o caso comum é o endereço terminar em "- " quando o
 * complemento ficou vazio no cadastro).
 */
function tidyText(value) {
    return String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[\s,;:.\-–—/|]+$/u, '')
        .trim();
}

/** Monta o href de discagem; assume DDI brasileiro quando só há DDD + número. */
function toTelHref(telefone) {
    const raw = String(telefone).replace(/[^\d+]/g, '');
    if (raw.startsWith('+')) return raw;
    const digits = raw.replace(/\D/g, '');
    return (digits.length === 10 || digits.length === 11) ? `+55${digits}` : digits;
}

function createImmersiveCard(space) {
    const nome = tidyText(space.nome) || 'Local';
    const titleId = `ic-title-${space.id}`;
    const hasCoords = Number.isFinite(space.lat) && Number.isFinite(space.lng);

    // ── Capa: sempre presente — categoria e nome vivem nela agora, como
    // manchete de revista sobre a foto (ou textura de categoria, se não
    // houver foto). ─────────────────────────────────────────────────
    const photo = space.foto || (Array.isArray(space.galeria) ? space.galeria[0] : null);
    const icon = categoryIcons[space.categoria] || '📍';
    const imgHTML = photo
        ? `<img class="ic-hero__img" src="${esc(photo)}" alt="Foto de ${esc(nome)}"
                onerror="this.remove(); this.parentElement.classList.add('ic-hero--noimg');">`
        : '';
    const eyebrowHTML = space.categoria
        ? `<span class="ic-eyebrow">${icon} ${esc(tidyText(space.categoria))}</span>`
        : '';
    const heroHTML = `
        <figure class="ic-hero${photo ? '' : ' ic-hero--noimg'}" data-icon="${esc(icon)}">
            ${imgHTML}
            <div class="ic-hero__scrim"></div>
            <div class="ic-hero__caption">
                ${eyebrowHTML}
                <h3 class="ic-title" id="${esc(titleId)}">${esc(nome)}</h3>
            </div>
        </figure>
    `;

    // ── Tags livres ─────────────────────────────────────────────────
    const tags = Array.isArray(space.tags) ? space.tags.map(tidyText).filter(Boolean).slice(0, 4) : [];
    const tagsHTML = tags.length
        ? `<ul class="pc-tags">${tags.map(t => `<li class="pc-tag">${esc(t)}</li>`).join('')}</ul>`
        : '';

    // ── Descrição ───────────────────────────────────────────────────
    const descricao = tidyText(space.descricao);
    const descHTML = descricao
        ? `<p class="pc-desc">${esc(descricao.length > 140 ? descricao.slice(0, 140).trimEnd() + '…' : descricao)}</p>`
        : '';

    // ── Dados de contato/visita ─────────────────────────────────────
    const infoItems = [];

    const endereco = tidyText(space.endereco);
    if (endereco) {
        infoItems.push(`<li class="pc-info__item">${PC_ICON.pin}<span>${esc(endereco)}</span></li>`);
    }

    const horario = tidyText(space.horario);
    if (horario) {
        infoItems.push(`<li class="pc-info__item">${PC_ICON.clock}<span>${esc(horario)}</span></li>`);
    }

    const telefone = tidyText(space.telefone);
    if (telefone) {
        const tel = toTelHref(telefone);
        infoItems.push(`
            <li class="pc-info__item">${PC_ICON.phone}
                <a href="tel:${esc(tel)}" aria-label="Ligar para ${esc(nome)}, telefone ${esc(telefone)}">${esc(telefone)}</a>
            </li>
        `);
    }

    const entradaConfig = {
        gratuita: { text: 'Entrada gratuita', className: 'pc-info__item--free' },
        paga: { text: 'Entrada paga', className: 'pc-info__item--paid' }
    };
    const entrada = entradaConfig[space.entrada];
    if (entrada) {
        infoItems.push(`<li class="pc-info__item ${entrada.className}">${PC_ICON.ticket}<span>${entrada.text}</span></li>`);
    }

    const acessibilidadeConfig = {
        sim: { text: 'Acessível', className: 'pc-info__item--accessible' },
        parcial: { text: 'Parcialmente acessível', className: 'pc-info__item--partial' },
        nao: { text: 'Sem acessibilidade', className: 'pc-info__item--not-accessible' }
    };
    const acessibilidade = acessibilidadeConfig[space.acessibilidade];
    if (acessibilidade) {
        infoItems.push(`<li class="pc-info__item ${acessibilidade.className}">${PC_ICON.accessible}<span>${acessibilidade.text}</span></li>`);
    }

    const infoHTML = infoItems.length ? `<ul class="pc-info">${infoItems.join('')}</ul>` : '';

    // ── Curiosidades ──────────────────────────────────────────────
    // Some inteira se o admin não cadastrou nada — não faz sentido um
    // título de seção sobre um campo vazio (diferente da "Comunidade"
    // da Fase 5, que convida à ação mesmo vazia).
    const curiosidades = tidyText(space.curiosidades);
    const curiosidadesHTML = curiosidades
        ? `
            <div class="ic-section">
                <h4 class="ic-section__title">📖 Curiosidades</h4>
                <p class="pc-desc">${esc(curiosidades)}</p>
            </div>
        `
        : '';

    // ── Comunidade ────────────────────────────────────────────────
    // Conteúdo carregado à parte (assíncrono) por renderDicasSection(),
    // chamado logo após este HTML entrar no DOM — ver renderDetailContent().
    // Ao contrário de curiosidades (só admin, some se vazio), esta seção
    // sempre aparece: a ausência de dicas é um convite a deixar a primeira.
    const comunidadeHTML = `
        <div class="ic-section ic-section--comunidade">
            <h4 class="ic-section__title">💬 O que a comunidade diz</h4>
            <div id="icDicas-${esc(space.id)}">
                <p class="pc-desc">Carregando dicas...</p>
            </div>
        </div>
    `;

    // ── Ações ───────────────────────────────────────────────────────
    // Rotas lado a lado (grid), depois links de apoio em outline e, por
    // último, o compartilhar discreto.
    let routesHTML = '';
    if (hasCoords) {
        const dest = `${space.lat},${space.lng}`;
        routesHTML = `
            <div class="pc-routes">
                <a class="pc-btn pc-btn--primary"
                   href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}"
                   target="_blank" rel="noopener"
                   aria-label="Traçar rota até ${esc(nome)} no Google Maps (abre em nova aba)">
                    ${PC_ICON.navigate}<span>Google Maps</span>
                </a>
                <a class="pc-btn pc-btn--secondary"
                   href="https://www.waze.com/ul?ll=${encodeURIComponent(dest)}&navigate=yes"
                   target="_blank" rel="noopener"
                   aria-label="Traçar rota até ${esc(nome)} no Waze (abre em nova aba)">
                    ${PC_ICON.waze}<span>Waze</span>
                </a>
            </div>
        `;
    }

    let linksInner = '';
    if (space.googleLink) {
        linksInner += `
            <a class="pc-btn pc-btn--outline" href="${esc(space.googleLink)}" target="_blank" rel="noopener"
               aria-label="Ver mais informações sobre ${esc(nome)} (abre em nova aba)">
                ${PC_ICON.info}<span>Ver mais</span>
            </a>
        `;
    }
    if (space.website) {
        const isInstagram = /instagram\./i.test(space.website);
        linksInner += `
            <a class="pc-btn pc-btn--outline" href="${esc(space.website)}" target="_blank" rel="noopener"
               aria-label="${isInstagram ? 'Abrir o Instagram de' : 'Abrir o site de'} ${esc(nome)} (abre em nova aba)">
                ${isInstagram ? PC_ICON.instagram : PC_ICON.globe}
                <span>${isInstagram ? 'Instagram' : 'Site oficial'}</span>
            </a>
        `;
    }

    const linksHTML = linksInner ? `<div class="pc-links">${linksInner}</div>` : '';

    // ── Passaporte cultural ───────────────────────────────────────
    const isVisited = userVisitasIds.has(space.id);
    let nearbyHintHTML = '';
    if (!isVisited && userLocation && hasCoords) {
        const distM = distanceMeters(userLocation.getLatLng(), space);
        if (distM <= 400) nearbyHintHTML = `<p class="ic-nearby-hint">📍 Você está por perto</p>`;
    }
    const checkinHTML = `
        <div>
            ${nearbyHintHTML}
            <button type="button" class="ic-checkin${isVisited ? ' is-visited' : ''}" data-checkin-id="${esc(space.id)}"
                    aria-label="${isVisited ? 'Você já visitou este lugar' : 'Marcar como visitado no passaporte'}">
                ${isVisited ? PC_ICON.roteiroCheck : PC_ICON.pin}<span>${isVisited ? 'Visitado ✓' : 'Marcar como visitado'}</span>
            </button>
        </div>
    `;

    const isFav = userLugaresFavoritos.has(space.id);
    const heartIcon = PC_ICON.heart.replace('<path ', `<path fill="${isFav ? 'currentColor' : 'none'}" `);

    const inRoteiro = isInRoteiro(space.id);

    const narrationText = buildNarrationText(space);
    const listenHTML = (narrationText && isSpeechSupported())
        ? `
            <button type="button" class="pc-fav" data-listen-id="${esc(space.id)}"
                    aria-label="Ouvir narração de ${esc(nome)}">
                ${PC_ICON.listen}<span>Ouvir</span>
            </button>
        `
        : '';

    const secondaryHTML = `
        <div class="ic-actions-row">
            <button type="button" class="pc-fav${isFav ? ' is-fav' : ''}" data-fav-id="${esc(space.id)}"
                    aria-label="${isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">
                ${heartIcon}<span>Favoritar</span>
            </button>
            <button type="button" class="pc-fav${inRoteiro ? ' is-fav' : ''}" data-roteiro-id="${esc(space.id)}"
                    aria-label="${inRoteiro ? 'Remover do roteiro' : 'Adicionar ao roteiro'}">
                ${inRoteiro ? PC_ICON.roteiroCheck : PC_ICON.roteiroAdd}<span>${inRoteiro ? 'No roteiro' : 'Roteiro'}</span>
            </button>
            ${listenHTML}
            <button type="button" class="pc-share" data-share-id="${esc(space.id)}"
                    aria-label="Compartilhar ${esc(nome)}">
                ${PC_ICON.share}<span>Compartilhar</span>
            </button>
        </div>
    `;

    return `
        <article class="ic-card" aria-labelledby="${esc(titleId)}">
            ${heroHTML}
            <div class="ic-body">
                ${tagsHTML}
                ${descHTML}
                ${infoHTML}
                ${curiosidadesHTML}
                ${comunidadeHTML}
            </div>
            <footer class="pc-actions">
                ${routesHTML}
                ${linksHTML}
                ${checkinHTML}
                ${secondaryHTML}
            </footer>
        </article>
    `;
}

// Acha o marcador de um lugar com tolerância (evita o antigo bug de
// comparar floats com === exato).
function findMarkerForSpace(space) {
    return markers.find(marker => {
        const pos = marker.getLatLng();
        return Math.abs(pos.lat - space.lat) < 0.0001 && Math.abs(pos.lng - space.lng) < 0.0001;
    });
}

function focusOnSpace(space) {
    if (!Number.isFinite(space.lat) || !Number.isFinite(space.lng)) return;

    const marker = findMarkerForSpace(space);

    if (marker && markerClusterGroup.hasLayer(marker)) {
        // zoomToShowLayer cuida de expandir o cluster até o marcador ficar visível
        markerClusterGroup.zoomToShowLayer(marker, () => {
            map.setView(marker.getLatLng(), Math.max(map.getZoom(), 16), { animate: true });
            openSpaceDetail(space, marker);
        });
    } else {
        map.setView([space.lat, space.lng], 16, { animate: true, duration: 1 });
    }
}

// ===================================
// PAINEL DE DETALHES (substitui o popup do Leaflet)
// Desacoplado do marcador: gaveta no mobile, painel lateral no desktop.
// ===================================

function isMobileDetailLayout() {
    return window.innerWidth <= 1024;
}

function setActiveMarker(marker) {
    if (activeMarker) {
        const el = activeMarker.getElement();
        if (el) el.classList.remove('marker-selected');
    }
    activeMarker = marker || null;
    if (activeMarker) {
        const el = activeMarker.getElement();
        if (el) el.classList.add('marker-selected');
    }
}

function renderDetailContent(space) {
    const body = document.getElementById('sdBody');
    if (body) body.innerHTML = createImmersiveCard(space);
    renderDicasSection(space);
}

// Evita o marcador clicado ficar escondido atrás do painel lateral no
// desktop (o painel sobrepõe o mapa em vez de redimensioná-lo).
function panMapForDesktopPanel(latlng) {
    if (isMobileDetailLayout()) return;
    const panel = document.getElementById('spaceDetail');
    const panelWidth = panel ? panel.getBoundingClientRect().width : 420;
    const point = map.latLngToContainerPoint(latlng);
    const shifted = L.point(point.x - panelWidth / 2, point.y);
    map.panTo(map.containerPointToLatLng(shifted), { animate: true });
}

function openSpaceDetail(space, marker, { pan = true } = {}) {
    const panel = document.getElementById('spaceDetail');
    const backdrop = document.getElementById('spaceDetailBackdrop');
    if (!panel) return;

    // Em body e html (não só body — ver comentário do seletor
    // ".sd-panel-open .a11y-tools" em map.css) pra afastar o botão de
    // acessibilidade do rodapé de ações do cartão, no desktop.
    document.body.classList.add('sd-panel-open');
    document.documentElement.classList.add('sd-panel-open');

    const wasClosed = !panel.classList.contains('is-open');

    if (currentDetailSpaceId !== space.id) {
        renderDetailContent(space);
    }

    panel.setAttribute('aria-labelledby', `ic-title-${space.id}`);
    panel.removeAttribute('inert');
    panel.setAttribute('aria-hidden', 'false');
    panel.setAttribute('aria-modal', String(isMobileDetailLayout()));

    if (isMobileDetailLayout() && backdrop) {
        backdrop.hidden = false;
        requestAnimationFrame(() => backdrop.classList.add('is-visible'));
    }

    panel.classList.add('is-open');

    setActiveMarker(marker);
    currentDetailSpaceId = space.id;
    if (pan) panMapForDesktopPanel(marker.getLatLng());

    if (wasClosed) {
        detailReturnFocusEl = document.activeElement;
        document.getElementById('sdClose')?.focus({ preventScroll: true });
    }
}

function closeSpaceDetail() {
    const panel = document.getElementById('spaceDetail');
    const backdrop = document.getElementById('spaceDetailBackdrop');
    if (!panel || !panel.classList.contains('is-open')) return;

    document.body.classList.remove('sd-panel-open');
    document.documentElement.classList.remove('sd-panel-open');
    stopSpeaking();

    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    panel.removeAttribute('aria-labelledby');

    if (backdrop) {
        backdrop.classList.remove('is-visible');
        const hideBackdrop = () => { backdrop.hidden = true; };
        backdrop.addEventListener('transitionend', hideBackdrop, { once: true });
        setTimeout(hideBackdrop, 350);
    }

    const finalizeClose = () => panel.setAttribute('inert', '');
    panel.addEventListener('transitionend', finalizeClose, { once: true });
    setTimeout(finalizeClose, 400);

    setActiveMarker(null);
    currentDetailSpaceId = null;

    if (detailReturnFocusEl && document.contains(detailReturnFocusEl)) {
        detailReturnFocusEl.focus({ preventScroll: true });
    } else {
        document.getElementById('map')?.focus();
    }
    detailReturnFocusEl = null;
}

function handleDetailPanelKeydown(event) {
    const panel = document.getElementById('spaceDetail');
    if (!panel || !panel.classList.contains('is-open')) return;

    if (event.key === 'Escape') {
        closeSpaceDetail();
        return;
    }

    // Foco preso dentro do painel só faz sentido no modo modal (mobile).
    if (event.key !== 'Tab' || !isMobileDetailLayout()) return;

    const focusable = Array.from(panel.querySelectorAll('a[href], button:not([disabled])'))
        .filter(el => el.offsetParent !== null);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

// Se a busca/filtro reconstrói os marcadores enquanto o painel está
// aberto, o marcador antigo (agora destruído) fica órfão sem isto.
function reconcileDetailPanelWithFilters(sortedSpaces) {
    if (!currentDetailSpaceId) return;
    const space = sortedSpaces.find(s => s.id === currentDetailSpaceId);
    if (!space) {
        closeSpaceDetail();
        return;
    }
    const marker = findMarkerForSpace(space);
    if (marker) setActiveMarker(marker);
}

function setupSpaceDetailPanel() {
    const panel = document.getElementById('spaceDetail');
    const backdrop = document.getElementById('spaceDetailBackdrop');
    if (!panel) return;

    document.getElementById('sdClose')?.addEventListener('click', closeSpaceDetail);
    backdrop?.addEventListener('click', closeSpaceDetail);
    document.addEventListener('keydown', handleDetailPanelKeydown);

    // Desktop: clicar no mapa (fora de marcadores — cliques em marcador não
    // borbulham até o mapa, bubblingMouseEvents é false por padrão no Leaflet)
    // fecha o painel, sem precisar do X. No mobile isso já é coberto pelo backdrop.
    map.on('click', () => {
        if (isMobileDetailLayout()) return;
        if (panel.classList.contains('is-open')) closeSpaceDetail();
    });

    let wasMobile = isMobileDetailLayout();
    window.addEventListener('resize', () => {
        if (!panel.classList.contains('is-open')) return;
        const isMobile = isMobileDetailLayout();
        if (isMobile === wasMobile) return;
        wasMobile = isMobile;

        panel.setAttribute('aria-modal', String(isMobile));
        if (isMobile && backdrop) {
            backdrop.hidden = false;
            requestAnimationFrame(() => backdrop.classList.add('is-visible'));
        } else if (backdrop) {
            backdrop.classList.remove('is-visible');
            setTimeout(() => { backdrop.hidden = true; }, 350);
        }
    });
}

// ===================================
// MEU ROTEIRO — planejador de passeio
// ===================================

function loadRoteiro() {
    try {
        const raw = localStorage.getItem(ROTEIRO_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        roteiro = Array.isArray(parsed) ? parsed : [];
    } catch {
        roteiro = [];
    }
}

function saveRoteiro() {
    try {
        localStorage.setItem(ROTEIRO_STORAGE_KEY, JSON.stringify(roteiro));
    } catch {
        // localStorage indisponível (modo privado etc.) — segue sem persistir
    }
}

function isInRoteiro(spaceId) {
    return roteiro.some(stop => stop.id === spaceId);
}

function addToRoteiro(spaceId) {
    if (isInRoteiro(spaceId)) return;
    const space = allSpaces.find(s => s.id === spaceId);
    if (!space || !Number.isFinite(space.lat) || !Number.isFinite(space.lng)) return;

    roteiro.push({
        id: space.id,
        nome: tidyText(space.nome) || 'Local',
        categoria: space.categoria || null,
        lat: space.lat,
        lng: space.lng,
        addedAt: Date.now()
    });
    saveRoteiro();
    renderRoteiroBadge();
    renderRoteiroTab();
    refreshRoteiroButtonInOpenCard();
    showToast('Adicionado ao roteiro', 'success');
}

function removeFromRoteiro(spaceId) {
    const idx = roteiro.findIndex(stop => stop.id === spaceId);
    if (idx === -1) return;
    roteiro.splice(idx, 1);
    saveRoteiro();
    renderRoteiroBadge();
    renderRoteiroTab();
    refreshRoteiroButtonInOpenCard();
}

function toggleRoteiro(spaceId) {
    if (isInRoteiro(spaceId)) {
        removeFromRoteiro(spaceId);
        showToast('Removido do roteiro', 'info');
    } else {
        addToRoteiro(spaceId);
    }
}

// Reflete o estado atual (dentro/fora do roteiro) no botão do cartão
// aberto no momento, sem precisar re-renderizar o cartão inteiro.
function refreshRoteiroButtonInOpenCard() {
    const btn = document.querySelector('[data-roteiro-id]');
    if (!btn) return;
    const inRoteiro = isInRoteiro(btn.dataset.roteiroId);
    btn.classList.toggle('is-fav', inRoteiro);
    btn.innerHTML = `${inRoteiro ? PC_ICON.roteiroCheck : PC_ICON.roteiroAdd}<span>${inRoteiro ? 'No roteiro ✓' : 'Adicionar ao roteiro'}</span>`;
    btn.setAttribute('aria-label', inRoteiro ? 'Remover do roteiro' : 'Adicionar ao roteiro');
}

function moveRoteiroStop(spaceId, direction) {
    const idx = roteiro.findIndex(stop => stop.id === spaceId);
    const targetIdx = idx + direction;
    if (idx === -1 || targetIdx < 0 || targetIdx >= roteiro.length) return;
    [roteiro[idx], roteiro[targetIdx]] = [roteiro[targetIdx], roteiro[idx]];
    saveRoteiro();
    renderRoteiroTab();
}

// Ordena por vizinho mais próximo a partir da localização do visitante
// (ou do centro da cidade, se ele não tiver compartilhado localização)
// — reaproveita distanceMeters(), a mesma conta já usada em "Mais perto".
function computeSuggestedRoteiroOrder() {
    if (roteiro.length < 2) return;

    let current = userLocation ? userLocation.getLatLng() : L.latLng(BUENO_CENTER.lat, BUENO_CENTER.lng);
    const remaining = [...roteiro];
    const ordered = [];

    while (remaining.length) {
        remaining.sort((a, b) => distanceMeters(current, a) - distanceMeters(current, b));
        const next = remaining.shift();
        ordered.push(next);
        current = L.latLng(next.lat, next.lng);
    }

    roteiro = ordered;
    saveRoteiro();
    renderRoteiroTab();
    showToast('Ordem sugerida aplicada', 'success');
}

// Soma das distâncias entre paradas consecutivas (na ordem atual) e um
// tempo estimado a uma velocidade média de estrada de serra — não é
// roteamento real, por isso a UI sempre rotula como "estimativa".
function estimateRoteiroTotals() {
    if (roteiro.length < 2) return { km: 0, minutes: 0 };
    let totalM = 0;
    for (let i = 1; i < roteiro.length; i++) {
        totalM += distanceMeters(L.latLng(roteiro[i - 1].lat, roteiro[i - 1].lng), roteiro[i]);
    }
    const km = totalM / 1000;
    return { km, minutes: (km / ROTEIRO_AVG_SPEED_KMH) * 60 };
}

// Monta um link de rota com múltiplas paradas para o Google Maps. Sem
// equivalente no Waze (o esquema de link dele só aceita um destino).
function buildGoogleMapsMultiStopUrl(stops) {
    if (!stops.length) return null;
    const coords = stop => `${stop.lat},${stop.lng}`;

    let origin, waypoints, destination;
    if (userLocation) {
        const ll = userLocation.getLatLng();
        origin = `${ll.lat},${ll.lng}`;
        waypoints = stops.slice(0, -1).map(coords);
        destination = coords(stops[stops.length - 1]);
    } else {
        origin = coords(stops[0]);
        waypoints = stops.slice(1, -1).map(coords);
        destination = coords(stops[stops.length - 1]);
    }

    const params = new URLSearchParams({ api: '1', origin, destination, travelmode: 'driving' });
    let url = `https://www.google.com/maps/dir/?${params.toString()}`;
    if (waypoints.length) url += `&waypoints=${waypoints.map(encodeURIComponent).join('|')}`;
    return url;
}

function openRoteiroRoute() {
    if (!roteiro.length) return;
    let stops = roteiro;
    if (stops.length > ROTEIRO_MAX_WAYPOINTS) {
        stops = stops.slice(0, ROTEIRO_MAX_WAYPOINTS);
        showToast(`O link de rota aceita até ${ROTEIRO_MAX_WAYPOINTS} paradas — abrindo as ${ROTEIRO_MAX_WAYPOINTS} primeiras.`, 'info');
    }
    const url = buildGoogleMapsMultiStopUrl(stops);
    if (url) window.open(url, '_blank', 'noopener');
}

function renderRoteiroBadge() {
    const badge = document.getElementById('rtBadge');
    const badgeCount = document.getElementById('rtBadgeCount');
    const tabCount = document.getElementById('rtTabCount');
    const count = roteiro.length;

    if (badgeCount) badgeCount.textContent = String(count);
    if (badge) badge.hidden = count === 0;
    if (tabCount) {
        tabCount.textContent = String(count);
        tabCount.hidden = count === 0;
    }
}

function renderRoteiroTab() {
    const view = document.getElementById('rtView');
    if (!view) return;

    if (!roteiro.length) {
        view.innerHTML = `
            <div class="rt-empty">
                <span class="rt-empty__icon" aria-hidden="true">🗺️</span>
                <p class="rt-empty__title">Seu roteiro está vazio</p>
                <p class="rt-empty__hint">Adicione lugares pela aba Explorar ou pelo cartão de cada ponto no mapa, e monte seu passeio pela cidade.</p>
            </div>
        `;
        return;
    }

    const { km, minutes } = estimateRoteiroTotals();
    const summaryHTML = roteiro.length > 1
        ? `<p class="rt-summary">${roteiro.length} paradas · ~${km.toFixed(1).replace('.', ',')} km · ~${Math.round(minutes)} min <span class="rt-summary__note">(estimativa)</span></p>`
        : `<p class="rt-summary">1 parada</p>`;

    const itemsHTML = roteiro.map((stop, i) => {
        const icon = categoryIcons[stop.categoria] || '📍';
        const dest = `${stop.lat},${stop.lng}`;
        return `
            <li class="rt-item">
                <span class="rt-item__order" aria-hidden="true">${i + 1}</span>
                <span class="rt-item__icon" aria-hidden="true">${icon}</span>
                <span class="rt-item__name">${esc(stop.nome)}</span>
                <div class="rt-item__actions">
                    <button type="button" class="rt-item__btn" data-rt-move="${esc(stop.id)}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Mover ${esc(stop.nome)} para cima">↑</button>
                    <button type="button" class="rt-item__btn" data-rt-move="${esc(stop.id)}" data-dir="1" ${i === roteiro.length - 1 ? 'disabled' : ''} aria-label="Mover ${esc(stop.nome)} para baixo">↓</button>
                    <a class="rt-item__btn" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}" target="_blank" rel="noopener" aria-label="Navegar até ${esc(stop.nome)} (abre em nova aba)">↗</a>
                    <button type="button" class="rt-item__btn rt-item__btn--danger" data-rt-remove="${esc(stop.id)}" aria-label="Remover ${esc(stop.nome)} do roteiro">×</button>
                </div>
            </li>
        `;
    }).join('');

    view.innerHTML = `
        ${summaryHTML}
        <ul class="rt-list">${itemsHTML}</ul>
        <div class="rt-actions">
            ${roteiro.length > 1 ? `<button type="button" class="pc-btn pc-btn--secondary" id="rtSuggestOrder"><span>Sugerir ordem</span></button>` : ''}
            <button type="button" class="pc-btn pc-btn--primary" id="rtOpenRoute"><span>Abrir rota completa</span></button>
            <button type="button" class="rt-clear" id="rtClear">Limpar roteiro</button>
        </div>
    `;
}

function setupRoteiroUI() {
    const tabExplore = document.getElementById('sbTabExplore');
    const tabRoteiro = document.getElementById('sbTabRoteiro');
    const panelExplore = document.getElementById('sbPanelExplore');
    const panelRoteiro = document.getElementById('sbPanelRoteiro');
    const badge = document.getElementById('rtBadge');
    const view = document.getElementById('rtView');

    function activateTab(name) {
        const isRoteiro = name === 'roteiro';
        tabExplore?.classList.toggle('active', !isRoteiro);
        tabRoteiro?.classList.toggle('active', isRoteiro);
        tabExplore?.setAttribute('aria-selected', String(!isRoteiro));
        tabRoteiro?.setAttribute('aria-selected', String(isRoteiro));
        if (panelExplore) panelExplore.hidden = isRoteiro;
        if (panelRoteiro) panelRoteiro.hidden = !isRoteiro;
    }

    tabExplore?.addEventListener('click', () => activateTab('explore'));
    tabRoteiro?.addEventListener('click', () => activateTab('roteiro'));

    badge?.addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        if (sidebar?.classList.contains('sidebar-collapsed')) {
            document.getElementById('btnToggleMenu')?.click();
        }
        activateTab('roteiro');
    });

    view?.addEventListener('click', (event) => {
        const moveBtn = event.target.closest('[data-rt-move]');
        if (moveBtn) {
            moveRoteiroStop(moveBtn.dataset.rtMove, Number(moveBtn.dataset.dir));
            return;
        }
        const removeBtn = event.target.closest('[data-rt-remove]');
        if (removeBtn) {
            removeFromRoteiro(removeBtn.dataset.rtRemove);
            return;
        }
        if (event.target.closest('#rtSuggestOrder')) {
            computeSuggestedRoteiroOrder();
            return;
        }
        if (event.target.closest('#rtOpenRoute')) {
            openRoteiroRoute();
            return;
        }
        if (event.target.closest('#rtClear')) {
            if (!roteiro.length) return;
            roteiro = [];
            saveRoteiro();
            renderRoteiroBadge();
            renderRoteiroTab();
            refreshRoteiroButtonInOpenCard();
            showToast('Roteiro limpo', 'info');
        }
    });
}

// ===================================
// NARRAÇÃO — Web Speech API
// ===================================

function isSpeechSupported() {
    return 'speechSynthesis' in window;
}

// Prioriza curiosidades (conteúdo editorial); cai pra descrição se não
// houver. null se os dois estiverem vazios — nesse caso o botão nem
// aparece no cartão (ver createImmersiveCard).
function buildNarrationText(space) {
    const curiosidades = tidyText(space.curiosidades);
    if (curiosidades) return curiosidades;
    const descricao = tidyText(space.descricao);
    return descricao || null;
}

function speakSpace(space) {
    if (!isSpeechSupported()) return;

    const text = buildNarrationText(space);
    if (!text) return;

    // Cancela qualquer narração anterior antes de começar uma nova —
    // sem isso, clicar "Ouvir" em dois lugares seguidos sobrepõe áudio.
    speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(`${tidyText(space.nome)}. ${text}`);
    utter.lang = 'pt-BR';

    const btn = document.querySelector(`[data-listen-id="${CSS.escape(space.id)}"]`);
    const setListening = (isListening) => {
        if (!btn) return;
        btn.classList.toggle('is-fav', isListening);
        btn.innerHTML = `${isListening ? PC_ICON.stop : PC_ICON.listen}<span>${isListening ? 'Parar' : 'Ouvir'}</span>`;
        btn.setAttribute('aria-label', isListening ? `Parar narração de ${tidyText(space.nome)}` : `Ouvir narração de ${tidyText(space.nome)}`);
    };

    // Atualiza o botão já ao disparar a fala, sem esperar por onstart —
    // esse evento é conhecidamente pouco confiável em algumas combinações
    // de navegador/SO (dispara tarde ou nunca, mesmo com o áudio tocando
    // normalmente). onend/onerror ainda corrigem o rótulo de volta depois.
    setListening(true);
    utter.onend = () => setListening(false);
    utter.onerror = () => {
        setListening(false);
        showToast('Não foi possível narrar este conteúdo — seu navegador pode não ter voz em português instalada.', 'error');
    };

    speechSynthesis.speak(utter);
}

function stopSpeaking() {
    if (!isSpeechSupported()) return;
    speechSynthesis.cancel();

    // Não depende só de onend (mesma ressalva de confiabilidade do
    // onstart) — reseta na hora qualquer botão que ficou marcado como
    // "Parar", pra não travar visualmente em "Parar" indefinidamente.
    const btn = document.querySelector('[data-listen-id].is-fav');
    if (btn) {
        btn.classList.remove('is-fav');
        btn.innerHTML = `${PC_ICON.listen}<span>Ouvir</span>`;
        btn.setAttribute('aria-label', 'Ouvir narração');
    }
}

// ===================================
// COMUNIDADE — dicas de visitantes (espacos/{id}/dicas)
// ===================================

const DICA_MAX_CHARS = 500;

async function loadDicasForSpace(espacoId) {
    try {
        // Só "where" (sem orderBy num campo diferente) evita precisar de
        // índice composto — ordena no cliente, tranquilo pro volume de
        // dicas de um único lugar.
        const snap = await window.db.collection('espacos').doc(espacoId)
            .collection('dicas').where('status', '==', 'visivel').get();
        return snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    } catch (error) {
        console.error('❌ Dicas da comunidade:', error);
        return [];
    }
}

function formatDicaDate(timestamp) {
    if (!timestamp?.toDate) return '';
    return timestamp.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function buildDicasHTML(space, dicas) {
    const myUid = firebase.auth().currentUser?.uid;
    const listHTML = dicas.length
        ? dicas.map(d => `
            <div class="cm-tip">
                <p class="cm-tip__text">${esc(tidyText(d.texto))}</p>
                <div class="cm-tip__meta">
                    <p class="cm-tip__author">${esc(d.autorNome || 'Visitante')} · ${formatDicaDate(d.createdAt)}</p>
                    ${d.autorUid && d.autorUid === myUid ? `
                        <button type="button" class="cm-tip__delete" data-dica-delete="${esc(d.id)}" data-dica-space="${esc(space.id)}"
                                aria-label="Apagar sua dica">
                            ${PC_ICON.trash}
                        </button>
                    ` : ''}
                </div>
            </div>
        `).join('')
        : `<p class="cm-empty">Seja o primeiro a deixar uma dica sobre este lugar!</p>`;

    return `
        ${listHTML}
        <div class="cm-composer">
            <textarea class="cm-composer__input" id="cmInput-${esc(space.id)}"
                      maxlength="${DICA_MAX_CHARS}" placeholder="Deixe uma dica sobre este lugar..."></textarea>
            <button type="button" class="pc-btn pc-btn--secondary" data-dica-submit="${esc(space.id)}">
                <span>Deixar uma dica</span>
            </button>
        </div>
    `;
}

async function renderDicasSection(space) {
    const container = document.getElementById(`icDicas-${space.id}`);
    if (!container) return;

    const dicas = await loadDicasForSpace(space.id);

    // O painel pode ter fechado ou trocado de lugar enquanto a consulta
    // ao Firestore ainda estava em andamento.
    const stillThere = document.getElementById(`icDicas-${space.id}`);
    if (!stillThere) return;

    stillThere.innerHTML = buildDicasHTML(space, dicas);
}

async function submitDica(espacoId, texto) {
    const cleaned = tidyText(texto);
    if (!cleaned) return;
    if (cleaned.length > DICA_MAX_CHARS) {
        showToast(`A dica pode ter até ${DICA_MAX_CHARS} caracteres.`, 'error');
        return;
    }
    if (!requireAccount('Deixar uma dica')) return;

    const user = firebase.auth().currentUser;
    const space = allSpaces.find(s => s.id === espacoId);

    try {
        await window.db.collection('espacos').doc(espacoId).collection('dicas').add({
            autorUid: user.uid,
            autorNome: currentUser?.nome || user.displayName || 'Visitante',
            texto: cleaned,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'visivel'
        });
        showToast('Dica publicada!', 'success');
        if (space) renderDicasSection(space);
    } catch (error) {
        console.error('❌ Publicar dica:', error);
        showToast(
            error?.code === 'permission-denied' ? 'Sem permissão para publicar.' : 'Não foi possível publicar a dica agora.',
            'error'
        );
    }
}

// Só o autor apaga a própria dica (ou admin, pelo painel) — regra
// espelhada em firestore.rules (allow delete na subcoleção dicas).
async function deleteDica(espacoId, dicaId) {
    if (!confirm('Apagar esta dica? Essa ação não pode ser desfeita.')) return;

    try {
        await window.db.collection('espacos').doc(espacoId).collection('dicas').doc(dicaId).delete();
        showToast('Dica apagada.', 'success');
        const space = allSpaces.find(s => s.id === espacoId);
        if (space) renderDicasSection(space);
    } catch (error) {
        console.error('❌ Apagar dica:', error);
        showToast(
            error?.code === 'permission-denied' ? 'Sem permissão para apagar.' : 'Não foi possível apagar a dica agora.',
            'error'
        );
    }
}

// ===================================
// COMPARTILHAR (nova)
// ===================================

/**
 * Usa a gaveta nativa de compartilhamento quando disponível (celular) e
 * cai para a área de transferência no desktop.
 */
async function shareSpace(id) {
    const space = allSpaces.find(s => s.id === id);
    if (!space) return;

    const nome = tidyText(space.nome) || 'Local';
    const url = `${location.origin}${location.pathname}?place=${encodeURIComponent(id)}`;
    const shareData = {
        title: nome,
        text: `${nome} — descubra em Bueno Brandão`,
        url
    };

    if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        try {
            await navigator.share(shareData);
            return;
        } catch (err) {
            // Usuário fechou a gaveta: não é erro, apenas encerra.
            if (err && err.name === 'AbortError') return;
            // Qualquer outra falha cai no fallback abaixo.
        }
    }

    try {
        await navigator.clipboard.writeText(url);
        showToast('Link copiado!', 'success');
    } catch (err) {
        showToast('Não foi possível compartilhar o link', 'error');
    }
}

// Delegação: o conteúdo do painel é recriado a cada abertura, então um
// listener só no container cobre todos os cards.
function setupCardActionDelegation() {
    const panelEl = document.getElementById('spaceDetail');
    if (!panelEl) return;

    panelEl.addEventListener('click', (event) => {
        const shareBtn = event.target.closest('[data-share-id]');
        if (shareBtn) {
            event.preventDefault();
            shareSpace(shareBtn.dataset.shareId);
            return;
        }

        const favBtn = event.target.closest('[data-fav-id]');
        if (favBtn) {
            event.preventDefault();
            toggleLugarFavorite(favBtn.dataset.favId);
            return;
        }

        const roteiroBtn = event.target.closest('[data-roteiro-id]');
        if (roteiroBtn) {
            event.preventDefault();
            toggleRoteiro(roteiroBtn.dataset.roteiroId);
            return;
        }

        const listenBtn = event.target.closest('[data-listen-id]');
        if (listenBtn) {
            event.preventDefault();
            if (isSpeechSupported() && speechSynthesis.speaking) {
                stopSpeaking();
            } else {
                const space = allSpaces.find(s => s.id === listenBtn.dataset.listenId);
                if (space) speakSpace(space);
            }
            return;
        }

        const checkinBtn = event.target.closest('[data-checkin-id]');
        if (checkinBtn) {
            event.preventDefault();
            const space = allSpaces.find(s => s.id === checkinBtn.dataset.checkinId);
            if (space) handleCheckin(space);
            return;
        }

        const dicaBtn = event.target.closest('[data-dica-submit]');
        if (dicaBtn) {
            event.preventDefault();
            const espacoId = dicaBtn.dataset.dicaSubmit;
            const textarea = document.getElementById(`cmInput-${espacoId}`);
            if (textarea) {
                submitDica(espacoId, textarea.value);
                textarea.value = '';
            }
            return;
        }

        const dicaDeleteBtn = event.target.closest('[data-dica-delete]');
        if (dicaDeleteBtn) {
            event.preventDefault();
            deleteDica(dicaDeleteBtn.dataset.dicaSpace, dicaDeleteBtn.dataset.dicaDelete);
        }
    });
}

function focusMapOnPlaces(filteredPlaces) {
    if (!map || !filteredPlaces || !filteredPlaces.length) return;

    const validPlaces = filteredPlaces.filter(space => Number.isFinite(space.lat) && Number.isFinite(space.lng));
    if (!validPlaces.length) return;

    if (validPlaces.length === 1) {
        focusOnSpace(validPlaces[0]);
        return;
    }

    const bounds = L.latLngBounds(validPlaces.map(space => [space.lat, space.lng]));
    map.fitBounds(bounds.pad(0.35), { animate: true, duration: 1.2 });
}

function updateResultsCount(count) {
    const container = document.getElementById('resultsCount');
    if (!container) return;
    container.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C5.2 0 3 2.2 3 5c0 3.9 5 11 5 11s5-7.1 5-11c0-2.8-2.2-5-5-5zm0 7.5c-1.4 0-2.5-1.1-2.5-2.5S6.6 2.5 8 2.5s2.5 1.1 2.5 2.5S9.4 7.5 8 7.5z"/>
        </svg>
        <span>${count} ${count === 1 ? 'lugar encontrado' : 'lugares encontrados'}</span>
    `;
}

function updateSidebarStats() {
    const totalPlaces = document.getElementById('totalPlaces');
    const totalCategories = document.getElementById('totalCategories');

    if (totalPlaces) totalPlaces.textContent = allSpaces.length;

    if (totalCategories) {
        const uniqueCategories = new Set(allSpaces.map(s => s.categoria).filter(Boolean));
        totalCategories.textContent = uniqueCategories.size;
    }
}

// ===================================
// EVENT LISTENERS
// ===================================

function setupEventListeners() {
    const btnToggleMenu = document.getElementById('btnToggleMenu');
    const sidebar = document.getElementById('sidebar');

    function closeMobileOverlay() {
        const overlay = document.getElementById('sidebarOverlay');
        if (!overlay) return;
        overlay.classList.remove('is-visible');
        setTimeout(() => overlay.remove(), 250);
    }

    function openMobileOverlay(onClose) {
        if (document.getElementById('sidebarOverlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'sidebarOverlay';
        overlay.className = 'sidebar-overlay-backdrop';
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('is-visible'));
        overlay.addEventListener('click', onClose);
    }

    const applySidebarState = (collapsed) => {
        if (!sidebar) return;

        sidebar.classList.toggle('sidebar-collapsed', collapsed);
        sidebar.classList.toggle('active', !collapsed);

        if (btnToggleMenu) {
            btnToggleMenu.classList.toggle('active', !collapsed);
            btnToggleMenu.setAttribute('aria-label', collapsed ? 'Expandir painel lateral' : 'Recolher painel lateral');
            btnToggleMenu.innerHTML = collapsed ? '<span>›</span>' : '<span>‹</span>';
        }

        if (map) setTimeout(() => map.invalidateSize(), 320);

        if (window.innerWidth <= 1024) {
            if (collapsed) closeMobileOverlay();
            else openMobileOverlay(() => applySidebarState(true));
        }
    };

    if (btnToggleMenu && sidebar) {
        btnToggleMenu.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            applySidebarState(!sidebar.classList.contains('sidebar-collapsed'));
        });
    }

    // Menu mobile do header (Início/Mapa/Eventos/Observatório) — nas
    // demais páginas isso vem de shared-components.js, mas o mapa não
    // carrega esse script (evita conflito com o dropdown/logout próprios
    // daqui embaixo), então precisa da própria wiring do botão hambúrguer.
    const hdMenuToggle = document.querySelector('.hd-menu-toggle');
    const hdNav = document.querySelector('.hd-nav');

    if (hdMenuToggle && hdNav) {
        hdMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = hdNav.classList.toggle('active');
            hdMenuToggle.setAttribute('aria-expanded', String(isOpen));
        });

        document.addEventListener('click', (event) => {
            if (!hdNav.contains(event.target) && event.target !== hdMenuToggle) {
                hdNav.classList.remove('active');
                hdMenuToggle.setAttribute('aria-expanded', 'false');
            }
        });

        hdNav.querySelectorAll('.hd-nav-link').forEach(link => {
            link.addEventListener('click', () => hdNav.classList.remove('active'));
        });
    }

    // Menu do usuário
    const btnUserMenu = document.getElementById('btnUserMenu');
    const userDropdown = document.getElementById('userDropdown');

    if (btnUserMenu && userDropdown) {
        btnUserMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = userDropdown.classList.toggle('active');
            btnUserMenu.setAttribute('aria-expanded', String(isOpen));
        });

        document.addEventListener('click', (event) => {
            if (!userDropdown.contains(event.target) && event.target !== btnUserMenu) {
                userDropdown.classList.remove('active');
                btnUserMenu.setAttribute('aria-expanded', 'false');
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && userDropdown.classList.contains('active')) {
                userDropdown.classList.remove('active');
                btnUserMenu.setAttribute('aria-expanded', 'false');
            }
        });

        userDropdown.addEventListener('click', (e) => e.stopPropagation());
    }

    // Logout
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', async (e) => {
            e.preventDefault();
            document.getElementById('userDropdown')?.classList.remove('active');
            try {
                await window.auth.signOut();
                if (typeof garantirSessaoVisitante === 'function') {
                    await garantirSessaoVisitante();
                }
                showToast('Você saiu da sua conta.', 'info');
            } catch (error) {
                console.error('❌ Erro ao sair:', error);
                showToast('Erro ao sair', 'error');
            }
        });
    }

    // Controles do mapa
    document.getElementById('btnMyLocation')?.addEventListener('click', getMyLocation);
    document.getElementById('btnRecenter')?.addEventListener('click', recenterMap);
    document.getElementById('btnZoomIn')?.addEventListener('click', () => map.zoomIn());
    document.getElementById('btnZoomOut')?.addEventListener('click', () => map.zoomOut());
    setupFullscreen();

    // Legenda
    setupLegendToggle();

    // Painel de detalhes do espaço (substitui o popup do Leaflet)
    setupSpaceDetailPanel();

    // Ações do cartão (favoritar/compartilhar, e adiante: roteiro/ouvir/
    // check-in) — delegado, cobre os cards recriados a cada abertura.
    setupCardActionDelegation();

    // Ordenação — "Favoritos" mora na mesma lista de opções em vez de um
    // botão à parte: é um modo de visualização (filtra por favoritos),
    // os demais são critérios de ordenação; escolher um dos outros sai
    // do modo favoritos.
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            const mode = sortSelect.value;

            if (mode === 'favoritos') {
                if (!requireAccount('Ver favoritos')) {
                    sortSelect.value = showFavoritesOnly ? 'favoritos' : sortMode;
                    return;
                }
                showFavoritesOnly = true;
                applyFilters({ focusMap: false });
                return;
            }

            showFavoritesOnly = false;

            if (mode === 'distancia' && !userLocation) {
                requestLocationThenSort(sortSelect);
                return;
            }
            sortMode = mode;
            applyFilters({ focusMap: false });
        });
    }

    // Limpar filtros
    document.getElementById('btnClearFilters')?.addEventListener('click', () => {
        if (showFavoritesOnly) {
            showFavoritesOnly = false;
            if (sortSelect) sortSelect.value = sortMode;
        }
        filterByCategory('todas');
    });

    // Busca
    setupSearch();

    // Resize — invalida duas vezes: agora e depois da transição de
    // largura do container, senão o mapa fica com o tamanho intermediário.
    window.addEventListener('resize', () => {
        if (map) {
            map.invalidateSize();
            setTimeout(() => map.invalidateSize(), 320);
        }

        if (window.innerWidth > 1024) {
            closeMobileOverlay();
            if (sidebar && sidebar.classList.contains('sidebar-collapsed')) {
                applySidebarState(false);
            }
        }
    });
}

function requestLocationThenSort(sortSelect) {
    if (!('geolocation' in navigator)) {
        showToast('Geolocalização não suportada', 'error');
        sortSelect.value = sortMode;
        return;
    }

    showToast('Obtendo sua localização...', 'info');

    navigator.geolocation.getCurrentPosition(
        (position) => {
            placeUserLocationMarker(position.coords.latitude, position.coords.longitude);
            sortMode = 'distancia';
            sortSelect.value = 'distancia';
            applyFilters({ focusMap: false });
            showToast('Localização encontrada! Ordenado por distância.', 'success');
        },
        () => {
            showToast('Não foi possível obter sua localização', 'error');
            sortSelect.value = sortMode;
        }
    );
}

function placeUserLocationMarker(lat, lng) {
    if (userLocation) map.removeLayer(userLocation);

    userLocation = L.marker([lat, lng], {
        icon: L.divIcon({
            className: 'user-location-marker',
            html: `<div style="width:20px;height:20px;background:#2196f3;border:4px solid white;border-radius:50%;box-shadow:0 0 12px rgba(33,150,243,.5);"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        })
    }).addTo(map);
}

function getMyLocation() {
    if (!('geolocation' in navigator)) {
        showToast('Geolocalização não suportada', 'error');
        return;
    }

    showToast('Obtendo localização...', 'info');

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            map.setView([latitude, longitude], 15);
            placeUserLocationMarker(latitude, longitude);
            showToast('Localização encontrada!', 'success');
        },
        (error) => {
            console.error('Erro ao obter localização:', error);
            showToast('Erro ao obter localização', 'error');
        }
    );
}

function recenterMap() {
    map.setView([BUENO_CENTER.lat, BUENO_CENTER.lng], 14, { animate: true, duration: 1 });
}

// ===================================
// TELA CHEIA
// ===================================

function setupFullscreen() {
    const btn = document.getElementById('btnFullscreen');
    const target = document.querySelector('.map-container');
    if (!btn || !target) return;

    const iconExpand = '<path d="M3 7V3H7M13 3H17V7M17 13V17H13M7 17H3V13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>';
    const iconExit = '<path d="M7 3v4H3M13 7V3h4M13 17v-4h4M7 13v4H3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>';

    btn.addEventListener('click', () => {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            target.requestFullscreen?.().catch(() => {
                showToast('Tela cheia não disponível neste navegador', 'error');
            });
        }
    });

    document.addEventListener('fullscreenchange', () => {
        const isFull = !!document.fullscreenElement;
        btn.querySelector('svg').innerHTML = isFull ? iconExit : iconExpand;
        btn.title = isFull ? 'Sair da tela cheia' : 'Tela cheia';
        btn.setAttribute('aria-label', btn.title);
        setTimeout(() => map.invalidateSize(), 120);
    });
}

// ===================================
// TOAST NOTIFICATIONS
// ===================================

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

// ===================================
// UTILS
// ===================================

function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
