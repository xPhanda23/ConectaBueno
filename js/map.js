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

// Painel de detalhes do espaço (substitui o popup do Leaflet)
let activeMarker = null;
let currentDetailSpaceId = null;
let detailReturnFocusEl = null;

// Centro de Bueno Brandão
const BUENO_CENTER = {
    lat: -22.4408,
    lng: -46.3511
};

// Limites do município (aproximado ±0.05 graus)
const BUENO_BOUNDS = [
    [-22.4908, -46.4011], // sudoeste
    [-22.3908, -46.3011]  // nordeste
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
    const checkFirebase = setInterval(() => {
        if (window.db && window.auth) {
            clearInterval(checkFirebase);

            window.auth.onAuthStateChanged(async (user) => {
                if (user) {
                    console.log('✅ Usuário autenticado:', user.email);
                    await loadUserProfile(user);
                    initApp();
                } else {
                    console.log('⚠️ Usuário não autenticado, redirecionando...');
                    redirectToLogin();
                }
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

function redirectToLogin() {
    window.location.href = 'pages/login.html';
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
                nome: user.displayName || user.email.split('@')[0],
                role: 'usuario',
                isAdmin: false
            };
            await db.collection('users').doc(user.uid).set(currentUser);
        }

        displayUserProfile();
    } catch (error) {
        console.error('❌ Erro ao carregar perfil:', error);
        showToast('Erro ao carregar perfil', 'error');
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
        minZoom: 12,
        maxZoom: 18,
        maxBounds: BUENO_BOUNDS,
        maxBoundsViscosity: 1.0,
        zoomControl: false
    });

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=cb1_29oc_1_8106c16c07bc5b3596bfab03', {
    maxZoom: 19,
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

    card.innerHTML = `
        <div class="category">${esc(space.categoria || 'Sem categoria')}</div>
        <h4>${esc(space.nome || 'Local')}</h4>
        <div class="address">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor">
                <path d="M7 0C4.2 0 2 2.2 2 5c0 3.9 5 9 5 9s5-5.1 5-9c0-2.8-2.2-5-5-5zm0 7c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
            </svg>
            <span>${esc(space.endereco || 'Endereço não informado')}</span>
        </div>
    `;

    card.addEventListener('click', () => focusOnSpace(space));

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

    marker.on('click', () => openSpaceDetail(space, marker));

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
    share: '<svg class="pc-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false"><circle cx="12.5" cy="3.5" r="2" stroke="currentColor" stroke-width="1.4"/><circle cx="3.5" cy="8" r="2" stroke="currentColor" stroke-width="1.4"/><circle cx="12.5" cy="12.5" r="2" stroke="currentColor" stroke-width="1.4"/><path d="M5.3 7L10.7 4.2M5.3 9L10.7 11.8" stroke="currentColor" stroke-width="1.4"/></svg>'
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

function createPopupContent(space) {
    const nome = tidyText(space.nome) || 'Local';
    const titleId = `pc-title-${space.id}`;
    const hasCoords = Number.isFinite(space.lat) && Number.isFinite(space.lng);

    // ── Capa ────────────────────────────────────────────────────────
    const photo = space.foto || (Array.isArray(space.galeria) ? space.galeria[0] : null);
    const mediaHTML = photo ? `
        <figure class="pc-media">
            <img class="pc-media__img" src="${esc(photo)}" alt="Foto de ${esc(nome)}"
                 onerror="this.closest('.pc-media').remove()">
        </figure>
    ` : '';

    // ── Categoria ─────────────────────────────────────────────────
    const metaParts = [];

    if (space.categoria) {
        const color = categoryColors[space.categoria] || '#2d5a3d';
        metaParts.push(`<span class="pc-chip" style="background:${color}">${esc(tidyText(space.categoria))}</span>`);
    }

    const metaHTML = metaParts.length ? `<div class="pc-meta">${metaParts.join('')}</div>` : '';

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

    const infoHTML = infoItems.length ? `<ul class="pc-info">${infoItems.join('')}</ul>` : '';

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

    const shareHTML = `
        <button type="button" class="pc-share" data-share-id="${esc(space.id)}"
                aria-label="Compartilhar ${esc(nome)}">
            ${PC_ICON.share}<span>Compartilhar</span>
        </button>
    `;

    return `
        <article class="pc-card" aria-labelledby="${esc(titleId)}">
            ${mediaHTML}
            <div class="pc-body">
                <h3 class="pc-title" id="${esc(titleId)}">${esc(nome)}</h3>
                ${metaHTML}
                ${tagsHTML}
                ${descHTML}
                ${infoHTML}
            </div>
            <footer class="pc-actions">
                ${routesHTML}
                ${linksHTML}
                ${shareHTML}
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
    if (body) body.innerHTML = createPopupContent(space);
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

function openSpaceDetail(space, marker) {
    const panel = document.getElementById('spaceDetail');
    const backdrop = document.getElementById('spaceDetailBackdrop');
    if (!panel) return;

    const wasClosed = !panel.classList.contains('is-open');

    if (currentDetailSpaceId !== space.id) {
        renderDetailContent(space);
    }

    panel.setAttribute('aria-labelledby', `pc-title-${space.id}`);
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
    panMapForDesktopPanel(marker.getLatLng());

    if (wasClosed) {
        detailReturnFocusEl = document.activeElement;
        document.getElementById('sdClose')?.focus({ preventScroll: true });
    }
}

function closeSpaceDetail() {
    const panel = document.getElementById('spaceDetail');
    const backdrop = document.getElementById('spaceDetailBackdrop');
    if (!panel || !panel.classList.contains('is-open')) return;

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
function setupShareDelegation() {
    const panelEl = document.getElementById('spaceDetail');
    if (!panelEl) return;

    panelEl.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-share-id]');
        if (!btn) return;
        event.preventDefault();
        shareSpace(btn.dataset.shareId);
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
            try {
                await window.auth.signOut();
                showToast('Saindo...', 'info');
                setTimeout(() => redirectToLogin(), 500);
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

    // Compartilhar (delegado, cobre os cards criados sob demanda)
    setupShareDelegation();

    // Ordenação
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            const mode = sortSelect.value;
            if (mode === 'distancia' && !userLocation) {
                requestLocationThenSort(sortSelect);
                return;
            }
            sortMode = mode;
            applyFilters({ focusMap: false });
        });
    }

    // Limpar filtros
    document.getElementById('btnClearFilters')?.addEventListener('click', () => filterByCategory('todas'));

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
