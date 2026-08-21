/**
 * map.js - Mapa Principal do Conecta Bueno
 * Gerencia mapa, filtros, busca e autenticação
 */

// ===================================
// VARIÁVEIS GLOBAIS
// ===================================

let map;
let markers = [];
let allSpaces = [];
let currentUser = null;
let userLocation = null;

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

document.addEventListener('DOMContentLoaded', function() {
    console.log('🗺️ Inicializando Conecta Bueno...');
    initAuth();
});

// ===================================
// AUTENTICAÇÃO E PROTEÇÃO DE ROTA
// ===================================

function initAuth() {
    // Verificar se Firebase está disponível
    if (typeof firebase === 'undefined') {
        console.error('❌ Firebase não carregado');
        showToast('Erro ao carregar Firebase', 'error');
        return;
    }

    // Aguardar inicialização do Firebase
    const checkAuth = setInterval(() => {
        if (window.db && window.auth) {
            clearInterval(checkAuth);
            
            // Monitorar estado de autenticação
            firebase.auth().onAuthStateChanged(async (user) => {
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

    // Timeout de segurança aumentado
    setTimeout(() => {
        if (window.db && window.auth) {
            // Firebase carregou, apenas não terminou a verificação ainda
            console.log('⏱️ Aguardando verificação de autenticação...');
        } else {
            // Firebase realmente não carregou
            clearInterval(checkAuth);
            console.error('⏱️ Timeout na inicialização do Firebase');
            showToast('Erro ao conectar. Recarregue a página.', 'error');
        }
    }, 10000); // Aumentado para 10 segundos
}

function redirectToLogin() {
    window.location.href = 'pages/login.html';
}

async function loadUserProfile(user) {
    try {
        const userDoc = await firebase.firestore()
            .collection('users')
            .doc(user.uid)
            .get();

        if (userDoc.exists) {
            currentUser = {
                uid: user.uid,
                email: user.email,
                ...userDoc.data()
            };

            console.log('👤 Perfil carregado:', currentUser);
            displayUserProfile();
        } else {
            // Criar perfil se não existir
            currentUser = {
                uid: user.uid,
                email: user.email,
                nome: user.displayName || user.email.split('@')[0],
                role: 'usuario',
                isAdmin: false
            };

            await firebase.firestore()
                .collection('users')
                .doc(user.uid)
                .set(currentUser);

            console.log('✅ Perfil criado:', currentUser);
            displayUserProfile();
        }
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

    // Atualizar avatar pequeno (header)
    const userAvatar = document.getElementById('btnUserMenu');
    const userInitials = document.getElementById('userInitials');

    if (userAvatar && userInitials) {
        if (photoURL && photoURL.startsWith('data:image')) {
            userInitials.style.display = 'none';
            let img = userAvatar.querySelector('img');
            if (!img) {
                img = document.createElement('img');
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.borderRadius = '50%';
                img.style.objectFit = 'cover';
                userAvatar.appendChild(img);
            }
            img.src = photoURL;
        } else {
            userInitials.textContent = iniciais;
            userInitials.style.display = 'flex';
            const img = userAvatar.querySelector('img');
            if (img) img.remove();
        }
    }

    // Atualizar avatar grande (dropdown) — usa os elementos do cabeçalho da Home
    const userAvatarLarge = document.querySelector('#userDropdown .hd-dd-avatar');
    const userInitialsLarge = document.getElementById('userInitialsLarge');

    if (userAvatarLarge && userInitialsLarge) {
        if (photoURL && photoURL.startsWith('data:image')) {
            userInitialsLarge.style.display = 'none';
            let imgLarge = userAvatarLarge.querySelector('img');
            if (!imgLarge) {
                imgLarge = document.createElement('img');
                imgLarge.style.width = '100%';
                imgLarge.style.height = '100%';
                imgLarge.style.borderRadius = '50%';
                imgLarge.style.objectFit = 'cover';
                userAvatarLarge.appendChild(imgLarge);
            }
            imgLarge.src = photoURL;
        } else {
            userInitialsLarge.textContent = iniciais;
            userInitialsLarge.style.display = 'flex';
            const imgLarge = userAvatarLarge.querySelector('img');
            if (imgLarge) imgLarge.remove();
        }
    }

    const userName = document.getElementById('userName');
    const userEmail = document.getElementById('userEmail');
    if (userName) userName.textContent = nome;
    if (userEmail) userEmail.textContent = email;

    // Mostrar/esconder painel admin (ID novo do header da Home)
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
    const mapContainer = document.querySelector('.map-container');

    if (sidebar && window.innerWidth > 1024) {
        sidebar.classList.add('active');
        sidebar.classList.remove('sidebar-collapsed');
        if (btnToggleMenu) {
            btnToggleMenu.classList.add('active');
            btnToggleMenu.setAttribute('aria-label', 'Recolher painel lateral');
        }

        if (mapContainer) {
            mapContainer.style.marginLeft = '360px';
            mapContainer.style.width = 'calc(100% - 360px)';
        }
    } else if (mapContainer) {
        mapContainer.style.marginLeft = '0';
        mapContainer.style.width = '100%';
    }

    initMap();
    setupEventListeners();
    loadSpaces();
    
    // Remover loading overlay
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

    // Criar mapa com limites
    map = L.map('map', {
        center: [BUENO_CENTER.lat, BUENO_CENTER.lng],
        zoom: 14,
        minZoom: 12,
        maxZoom: 18,
        maxBounds: BUENO_BOUNDS,
        maxBoundsViscosity: 1.0,
        zoomControl: false
    });

    // Adicionar tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    // Ajustar tamanho após carregar e após o layout do header/sidebar
    setTimeout(() => {
        if (map) map.invalidateSize();
    }, 100);

    setTimeout(() => {
        if (map) map.invalidateSize();
    }, 400);

    console.log('✅ Mapa inicializado');
}

// ===================================
// CARREGAR ESPAÇOS DO FIRESTORE
// ===================================

async function loadSpaces() {
    console.log('📍 Carregando espaços...');

    try {
        const snapshot = await firebase.firestore()
            .collection('espacos')
            .where('status', '==', 'ativo')
            .get();

        allSpaces = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            allSpaces.push({
                id: doc.id,
                ...data
            });
            console.log('Lugar carregado:', data.nome, 'Lat:', data.lat, 'Lng:', data.lng);
        });

        console.log(`✅ ${allSpaces.length} espaços carregados`);

        // Carregar categorias únicas
        loadCategories();

        // Renderizar espaços no mapa
        renderSpaces(allSpaces);
        updateResultsCount(allSpaces.length);
        updateSidebarStats();

    } catch (error) {
        console.error('❌ Erro ao carregar espaços:', error);
        showToast('Erro ao carregar espaços', 'error');
    }
}

function loadCategories() {
    const categoriesSet = new Set();
    
    allSpaces.forEach(space => {
        if (space.categoria) {
            categoriesSet.add(space.categoria);
        }
    });

    const categories = Array.from(categoriesSet).sort();
    renderCategoryFilters(categories);
}

function renderCategoryFilters(categories) {
    const container = document.getElementById('filterButtons');
    
    // Limpar container
    container.innerHTML = '';
    
    // Criar botão "Todas"
    const todasBtn = document.createElement('button');
    todasBtn.className = 'filter-btn active';
    todasBtn.setAttribute('data-category', 'todas');
    todasBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        <span>Todas</span>
    `;
    todasBtn.addEventListener('click', () => {
        console.log('Clicou em Todas');
        filterByCategory('todas');
    });
    container.appendChild(todasBtn);

    // Ícones por categoria
    const categoryIcons = {
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
        btn.setAttribute('data-category', category);
        
        const icon = categoryIcons[category] || categoryIcons['default'];
        
        btn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                ${icon}
            </svg>
            <span>${category}</span>
        `;
        
        btn.addEventListener('click', () => {
            console.log('Clicou em categoria:', category);
            filterByCategory(category);
        });
        container.appendChild(btn);
    });
}

function filterByCategory(category) {
    console.log('Filtrando por categoria:', category);
    
    // Atualizar botões ativos
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    const activeBtn = document.querySelector(`[data-category="${category}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Filtrar espaços
    let filtered = allSpaces;
    if (category !== 'todas') {
        filtered = allSpaces.filter(space => space.categoria === category);
    }

    console.log(`${filtered.length} lugares filtrados`);
    
    renderSpaces(filtered);
    updateResultsCount(filtered.length);
    focusMapOnPlaces(filtered);
    updateSidebarStats();
}

// ===================================
// RENDERIZAR ESPAÇOS
// ===================================

function renderSpaces(spaces) {
    // Limpar marcadores existentes
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];

    // Se não há lugares, não fazer nada
    if (spaces.length === 0) {
        console.log('Nenhum lugar para renderizar');
        return;
    }

    // Adicionar marcadores no mapa
    spaces.forEach(space => {
        if (space.lat && space.lng) {
            const marker = createMarker(space);
            markers.push(marker);
        }
    });
    
    console.log(`${markers.length} marcadores adicionados ao mapa`);
}

function createSpaceCard(space) {
    const card = document.createElement('div');
    card.className = 'space-card';
    card.setAttribute('data-id', space.id);

    card.innerHTML = `
        <div class="category">${space.categoria || 'Sem categoria'}</div>
        <h4>${space.nome}</h4>
        <div class="address">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <path d="M7 0C4.2 0 2 2.2 2 5c0 3.9 5 9 5 9s5-5.1 5-9c0-2.8-2.2-5-5-5zm0 7c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
            </svg>
            ${space.endereco || 'Endereço não informado'}
        </div>
    `;

    card.addEventListener('click', () => focusOnSpace(space));

    return card;
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

    const popupContent = createPopupContent(space);
    marker.bindPopup(popupContent, {
        maxWidth: 380,
        minWidth: 300,
        className: 'custom-popup'
    });
    
    marker.addTo(map);
    return marker;
}

function createPopupContent(space) {
    const color = categoryColors[space.categoria] || '#2d5a3d';
    
    // Construir galeria de fotos
    let photosHTML = '';
    if (space.foto) {
        photosHTML = `
            <div class="popup-photo">
                <img src="${space.foto}" alt="${space.nome}" onerror="this.src='https://via.placeholder.com/400x200/2d5a3d/ffffff?text=Sem+Foto'">
            </div>
        `;
    } else if (space.galeria && space.galeria.length > 0) {
        photosHTML = `
            <div class="popup-photo">
                <img src="${space.galeria[0]}" alt="${space.nome}" onerror="this.src='https://via.placeholder.com/400x200/2d5a3d/ffffff?text=Sem+Foto'">
            </div>
        `;
    }
    
    // Sistema de avaliação
    let ratingHTML = '';
    if (space.googleLink) {
        const rating = space.rating || 4.5;
        const reviewCount = space.reviewCount || 0;
        
        ratingHTML = `
            <div class="popup-rating">
                <div class="popup-stars">
                    ${generateStars(rating)}
                </div>
                <span class="popup-rating-text">${rating.toFixed(1)}</span>
                ${reviewCount > 0 ? `<span class="popup-rating-count">(${reviewCount})</span>` : ''}
            </div>
        `;
    }
    
    // Construir tags
    let tagsHTML = '';
    if (space.tags && space.tags.length > 0) {
        tagsHTML = '<div class="popup-tags">';
        space.tags.slice(0, 4).forEach(tag => {
            tagsHTML += `<span class="popup-tag">${tag}</span>`;
        });
        tagsHTML += '</div>';
    }
    
    // Descrição curta
    let descHTML = '';
    if (space.descricao) {
        const shortDesc = space.descricao.length > 120 ? 
            space.descricao.substring(0, 120) + '...' : 
            space.descricao;
        descHTML = `<p class="popup-description">${shortDesc}</p>`;
    }
    
    // Construir informações adicionais
    let infoHTML = '';
    
    if (space.endereco) {
        infoHTML += `
            <div class="popup-info-item">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M9 2C6.5 2 4.5 4 4.5 6.5C4.5 10.4 9 16 9 16C9 16 13.5 10.4 13.5 6.5C13.5 4 11.5 2 9 2ZM9 8.5C8 8.5 7 7.5 7 6.5C7 5.5 8 4.5 9 4.5C10 4.5 11 5.5 11 6.5C11 7.5 10 8.5 9 8.5Z" fill="currentColor"/>
                </svg>
                <span>${space.endereco}</span>
            </div>
        `;
    }
    
    if (space.horario) {
        infoHTML += `
            <div class="popup-info-item">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <circle cx="9" cy="9" r="7.5" stroke="currentColor" stroke-width="1.5"/>
                    <path d="M9 5V9L12 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                <span>${space.horario}</span>
            </div>
        `;
    }
    
    if (space.telefone) {
        infoHTML += `
            <div class="popup-info-item">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20.01 15.38C18.78 15.38 17.59 15.18 16.48 14.82C16.13 14.7 15.74 14.79 15.47 15.06L13.9 17.03C11.07 15.68 8.42 13.13 7.01 10.2L8.96 8.54C9.23 8.26 9.31 7.87 9.2 7.52C8.83 6.41 8.64 5.22 8.64 3.99C8.64 3.45 8.19 3 7.65 3H4.19C3.65 3 3 3.24 3 3.99C3 13.28 10.73 21 20.01 21C20.72 21 21 20.37 21 19.82V16.37C21 15.83 20.55 15.38 20.01 15.38Z" fill="currentColor"/>
                </svg>
                <span>${space.telefone}</span>
            </div>
        `;
    }
    
    if (space.entrada) {
        const entradaConfig = {
            'gratuita': { 
                icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M20 6H16L14 4H10L8 6H4C2.9 6 2 6.9 2 8V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V8C22 6.9 21.1 6 20 6ZM20 18H4V8H8.83L10.83 6H13.17L15.17 8H20V18ZM12 9C10.34 9 9 10.34 9 12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12C15 10.34 13.66 9 12 9ZM12 13C11.45 13 11 12.55 11 12C11 11.45 11.45 11 12 11C12.55 11 13 11.45 13 12C13 12.55 12.55 13 12 13Z" fill="currentColor"/></svg>', 
                text: 'Entrada Gratuita', 
                color: '#4caf50' 
            },
            'paga': { 
                icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M11.8 10.9C9.53 10.31 8.8 9.7 8.8 8.75C8.8 7.66 9.81 6.9 11.5 6.9C13.28 6.9 13.94 7.75 14 9H16.21C16.14 7.28 15.09 5.7 13 5.19V3H10V5.16C8.06 5.58 6.5 6.84 6.5 8.77C6.5 11.08 8.41 12.23 11.2 12.9C13.7 13.5 14.2 14.38 14.2 15.31C14.2 16 13.71 17.1 11.5 17.1C9.44 17.1 8.63 16.18 8.52 15H6.32C6.44 17.19 8.08 18.42 10 18.83V21H13V18.85C14.95 18.48 16.5 17.35 16.5 15.3C16.5 12.46 14.07 11.49 11.8 10.9Z" fill="currentColor"/></svg>', 
                text: 'Entrada Paga', 
                color: '#ff9800' 
            }
        };
        
        const config = entradaConfig[space.entrada];
        if (config) {
            infoHTML += `
                <div class="popup-info-item">
                    <span class="entrada-icon">${config.icon}</span>
                    <span style="color: ${config.color}; font-weight: 600;">${config.text}</span>
                </div>
            `;
        }
    }
    
    // Botões de ação
    let actionsHTML = '<div class="popup-actions">';

    actionsHTML += `
        <a href="https://www.google.com/maps/dir/?api=1&destination=${space.lat},${space.lng}" 
           target="_blank"
           rel="noopener"
           class="popup-btn popup-btn-primary">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 1L3 7H7V13H11V7H15L9 1Z" fill="currentColor"/>
                <rect x="3" y="15" width="12" height="2" rx="1" fill="currentColor"/>
            </svg>
            <span>Ir com Google Maps</span>
        </a>
        <a href="https://waze.com/ul?ll=${space.lat},${space.lng}&navigate=yes" 
           target="_blank"
           rel="noopener"
           class="popup-btn popup-btn-secondary">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 2.5C5.97 2.5 3.5 4.7 3.5 7.7C3.5 10.5 5.6 12.6 8.2 12.9L8.2 14.5H9.8V12.9C12.4 12.6 14.5 10.5 14.5 7.7C14.5 4.7 12.03 2.5 9 2.5Z" stroke="currentColor" stroke-width="1.4"/>
                <circle cx="9" cy="8" r="2.1" stroke="currentColor" stroke-width="1.4"/>
            </svg>
            <span>Ir com Waze</span>
        </a>
    `;
    
    // Botões secundários
    if (space.googleLink) {
        actionsHTML += `
            <a href="${space.googleLink}" target="_blank" rel="noopener" class="popup-btn popup-btn-google">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.5"/>
                    <path d="M9 6V9L12 10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                <span>Ver Mais</span>
            </a>
        `;
    }
    
    if (space.website) {
        const isInstagram = space.website.includes('instagram');
        actionsHTML += `
            <a href="${space.website}" target="_blank" rel="noopener" class="popup-btn popup-btn-secondary">
                ${isInstagram ? `
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <rect x="2" y="2" width="14" height="14" rx="4" stroke="currentColor" stroke-width="1.5"/>
                        <circle cx="9" cy="9" r="3.5" stroke="currentColor" stroke-width="1.5"/>
                        <circle cx="13" cy="5" r="0.5" fill="currentColor"/>
                    </svg>
                ` : `
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.5"/>
                        <path d="M3 9H15M9 3C9 3 7 5 7 9C7 13 9 15 9 15M9 3C9 3 11 5 11 9C11 13 9 15 9 15" stroke="currentColor" stroke-width="1.5"/>
                    </svg>
                `}
                <span>${isInstagram ? 'Instagram' : 'Site'}</span>
            </a>
        `;
    }
    
    actionsHTML += '</div>';
    
    return `
        <div class="custom-popup-content">
            ${photosHTML}
            <div class="popup-body">
                <div class="popup-header">
                    <h3>${space.nome}</h3>
                    <span class="popup-category" style="background: ${color}">${space.categoria}</span>
                </div>
                ${ratingHTML}
                ${tagsHTML}
                ${descHTML}
                ${infoHTML ? `<div class="popup-info">${infoHTML}</div>` : ''}
            </div>
            ${actionsHTML}
        </div>
    `;
}

function generateStars(rating) {
    let starsHTML = '';
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    
    for (let i = 0; i < 5; i++) {
        if (i < fullStars) {
            starsHTML += `
                <svg viewBox="0 0 18 18" fill="#ffa726">
                    <path d="M9 2L11 7L16 7.5L12 11.5L13 17L9 14L5 17L6 11.5L2 7.5L7 7L9 2Z"/>
                </svg>
            `;
        } else if (i === fullStars && hasHalfStar) {
            starsHTML += `
                <svg viewBox="0 0 18 18">
                    <defs>
                        <linearGradient id="half-star-${i}">
                            <stop offset="50%" stop-color="#ffa726"/>
                            <stop offset="50%" stop-color="#e0e0e0"/>
                        </linearGradient>
                    </defs>
                    <path fill="url(#half-star-${i})" d="M9 2L11 7L16 7.5L12 11.5L13 17L9 14L5 17L6 11.5L2 7.5L7 7L9 2Z"/>
                </svg>
            `;
        } else {
            starsHTML += `
                <svg viewBox="0 0 18 18" fill="#e0e0e0">
                    <path d="M9 2L11 7L16 7.5L12 11.5L13 17L9 14L5 17L6 11.5L2 7.5L7 7L9 2Z"/>
                </svg>
            `;
        }
    }
    
    return starsHTML;
}

function focusOnSpace(space) {
    if (space.lat && space.lng) {
        map.setView([space.lat, space.lng], 16, {
            animate: true,
            duration: 1
        });

        // Abrir popup do marcador correspondente
        setTimeout(() => {
            markers.forEach(marker => {
                const markerLatLng = marker.getLatLng();
                if (markerLatLng.lat === space.lat && markerLatLng.lng === space.lng) {
                    marker.openPopup();
                }
            });
        }, 500);
    }
}

// ===================================
// BUSCA
// ===================================

function focusMapOnPlaces(filteredPlaces) {
    if (!map || !filteredPlaces || filteredPlaces.length === 0) return;

    const validPlaces = filteredPlaces.filter(space => Number.isFinite(space.lat) && Number.isFinite(space.lng));
    if (validPlaces.length === 0) return;

    if (validPlaces.length === 1) {
        const target = validPlaces[0];
        map.setView([target.lat, target.lng], 15, {
            animate: true,
            duration: 1.1
        });

        setTimeout(() => {
            const match = markers.find(marker => {
                const pos = marker.getLatLng();
                return Math.abs(pos.lat - target.lat) < 0.0001 && Math.abs(pos.lng - target.lng) < 0.0001;
            });

            if (match) {
                match.openPopup();
            }
        }, 450);

        return;
    }

    const bounds = L.latLngBounds(validPlaces.map(space => [space.lat, space.lng]));
    map.fitBounds(bounds.pad(0.35), {
        animate: true,
        duration: 1.2
    });
}

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const btnClearSearch = document.getElementById('btnClearSearch');

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        
        if (query) {
            btnClearSearch.style.display = 'block';
            
            const filtered = allSpaces.filter(space => {
                return (space.nome && space.nome.toLowerCase().includes(query)) ||
                       (space.categoria && space.categoria.toLowerCase().includes(query)) ||
                       (space.endereco && space.endereco.toLowerCase().includes(query)) ||
                       (space.descricao && space.descricao.toLowerCase().includes(query));
            });

            renderSpaces(filtered);
            updateResultsCount(filtered.length);
            focusMapOnPlaces(filtered);
        } else {
            btnClearSearch.style.display = 'none';
            renderSpaces(allSpaces);
            updateResultsCount(allSpaces.length);
            map.setView([BUENO_CENTER.lat, BUENO_CENTER.lng], 14, {
                animate: true,
                duration: 1
            });
        }
    });

    btnClearSearch.addEventListener('click', () => {
        searchInput.value = '';
        btnClearSearch.style.display = 'none';
        renderSpaces(allSpaces);
        updateResultsCount(allSpaces.length);
        map.setView([BUENO_CENTER.lat, BUENO_CENTER.lng], 14, {
            animate: true,
            duration: 1
        });
    });
}

function updateResultsCount(count) {
    const container = document.getElementById('resultsCount');
    container.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C5.2 0 3 2.2 3 5c0 3.9 5 11 5 11s5-7.1 5-11c0-2.8-2.2-5-5-5zm0 7.5c-1.4 0-2.5-1.1-2.5-2.5S6.6 2.5 8 2.5s2.5 1.1 2.5 2.5S9.4 7.5 8 7.5z"/>
        </svg>
        <span>${count} ${count === 1 ? 'lugar' : 'lugares'}</span>
    `;
}

// ===================================
// EVENT LISTENERS
// ===================================

function setupEventListeners() {
    const btnToggleMenu = document.getElementById('btnToggleMenu');
    const sidebar = document.getElementById('sidebar');
    const mapContainer = document.querySelector('.map-container');

    const applySidebarState = (collapsed) => {
        if (!sidebar || !mapContainer) return;

        sidebar.classList.toggle('sidebar-collapsed', collapsed);
        sidebar.classList.toggle('active', !collapsed);

        if (btnToggleMenu) {
            btnToggleMenu.classList.toggle('active', !collapsed);
            btnToggleMenu.setAttribute('aria-label', collapsed ? 'Expandir painel lateral' : 'Recolher painel lateral');
            btnToggleMenu.innerHTML = collapsed ? '<span>›</span>' : '<span>‹</span>';
        }

        if (window.innerWidth > 1024) {
            if (collapsed) {
                mapContainer.style.marginLeft = '0';
                mapContainer.style.width = '100%';
            } else {
                mapContainer.style.marginLeft = '360px';
                mapContainer.style.width = 'calc(100% - 360px)';
            }
        } else {
            mapContainer.style.marginLeft = '0';
            mapContainer.style.width = '100%';
        }

        if (map) {
            setTimeout(() => map.invalidateSize(), 180);
        }
    };

    if (btnToggleMenu && sidebar) {
        btnToggleMenu.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const collapsed = !sidebar.classList.contains('sidebar-collapsed');
            applySidebarState(collapsed);

            if (window.innerWidth <= 1024) {
                const overlay = document.getElementById('sidebarOverlay');
                if (collapsed) {
                    if (!overlay) {
                        const newOverlay = document.createElement('div');
                        newOverlay.id = 'sidebarOverlay';
                        newOverlay.style.cssText = `
                            position: fixed;
                            top: 0;
                            left: 0;
                            width: 100%;
                            height: 100%;
                            background: rgba(0, 0, 0, 0.5);
                            z-index: 998;
                            opacity: 0;
                            transition: opacity 0.3s ease;
                        `;
                        document.body.appendChild(newOverlay);
                        setTimeout(() => {
                            newOverlay.style.opacity = '1';
                        }, 10);
                        newOverlay.addEventListener('click', () => {
                            applySidebarState(true);
                            newOverlay.style.opacity = '0';
                            setTimeout(() => newOverlay.remove(), 300);
                        });
                    }
                } else if (overlay) {
                    overlay.style.opacity = '0';
                    setTimeout(() => overlay.remove(), 300);
                }
            }
        });
    }

    // User menu - same behavior as the Events page
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

        userDropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    // Perfil (placeholder)
    const btnProfile = document.getElementById('btnProfile');
    if (btnProfile) {
        btnProfile.addEventListener('click', (e) => {
            e.preventDefault();
            showToast('Perfil em desenvolvimento', 'info');
        });
    }

    // Logout
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', async (e) => {
            e.preventDefault();
            
            try {
                await firebase.auth().signOut();
                showToast('Saindo...', 'info');
                setTimeout(() => redirectToLogin(), 500);
            } catch (error) {
                console.error('❌ Erro ao sair:', error);
                showToast('Erro ao sair', 'error');
            }
        });
    }

    // Map controls
    const btnMyLocation = document.getElementById('btnMyLocation');
    const btnRecenter = document.getElementById('btnRecenter');
    
    if (btnMyLocation) {
        btnMyLocation.addEventListener('click', getMyLocation);
    }
    
    if (btnRecenter) {
        btnRecenter.addEventListener('click', recenterMap);
    }

    // Clear filters
    const btnClearFilters = document.getElementById('btnClearFilters');
    if (btnClearFilters) {
        btnClearFilters.addEventListener('click', () => {
            filterByCategory('todas');
        });
    }

    // Search
    setupSearch();

    // Resize
    window.addEventListener('resize', () => {
        if (map) {
            map.invalidateSize();
        }
        
        // Ajustar layout quando redimensiona
        if (window.innerWidth > 1024) {
            const overlay = document.getElementById('sidebarOverlay');
            if (overlay) overlay.remove();
            
            // Reabrir sidebar no desktop se estava fechada
            if (sidebar && !sidebar.classList.contains('active')) {
                sidebar.classList.add('active');
                if (btnToggleMenu) btnToggleMenu.classList.add('active');
                
                if (mapContainer) {
                    mapContainer.style.marginLeft = '360px';
                    mapContainer.style.width = 'calc(100% - 360px)';
                }
            }
        } else {
            // Mobile: garantir que mapa ocupa tudo
            if (mapContainer) {
                mapContainer.style.marginLeft = '0';
                mapContainer.style.width = '100%';
            }
        }
    });
}

function getMyLocation() {
    if ('geolocation' in navigator) {
        showToast('Obtendo localização...', 'info');
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                
                map.setView([lat, lng], 15);
                
                if (userLocation) {
                    map.removeLayer(userLocation);
                }
                
                userLocation = L.marker([lat, lng], {
                    icon: L.divIcon({
                        className: 'user-location-marker',
                        html: `<div style="
                            width: 20px;
                            height: 20px;
                            background: #2196f3;
                            border: 4px solid white;
                            border-radius: 50%;
                            box-shadow: 0 0 12px rgba(33,150,243,0.5);
                        "></div>`,
                        iconSize: [20, 20],
                        iconAnchor: [10, 10]
                    })
                }).addTo(map);
                
                showToast('Localização encontrada!', 'success');
            },
            (error) => {
                console.error('Erro ao obter localização:', error);
                showToast('Erro ao obter localização', 'error');
            }
        );
    } else {
        showToast('Geolocalização não suportada', 'error');
    }
}

function recenterMap() {
    map.setView([BUENO_CENTER.lat, BUENO_CENTER.lng], 14, {
        animate: true,
        duration: 1
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
    
    const icons = {
        success: '✓',
        error: '✕',
        info: 'ℹ'
    };
    
    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.info}</div>
        <div class="toast-message">${message}</div>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.2s reverse';
        setTimeout(() => toast.remove(), 200);
    }, 4000);
}


// ===================================
// FUNCIONALIDADES SIDEBAR
// ===================================

// Atualizar estatísticas da sidebar
function updateSidebarStats() {
    const totalPlaces = document.getElementById('totalPlaces');
    const totalCategories = document.getElementById('totalCategories');
    const resultsCount = document.getElementById('resultsCount');
    
    if (totalPlaces && allSpaces) {
        totalPlaces.textContent = allSpaces.length;
    }
    
    if (totalCategories && allSpaces) {
        const uniqueCategories = [...new Set(allSpaces.map(s => s.categoria))];
        totalCategories.textContent = uniqueCategories.length;
    }
    
    if (resultsCount) {
        const activeCategory = document.querySelector('.filter-btn.active')?.dataset.category || 'todas';
        let count = allSpaces.length;
        
        if (activeCategory !== 'todas') {
            count = allSpaces.filter(s => s.categoria === activeCategory).length;
        }
        
        resultsCount.querySelector('span').textContent = 
            `${count} ${count === 1 ? 'lugar encontrado' : 'lugares encontrados'}`;
    }
}

// Inicializar funcionalidades da sidebar
function initSidebarFeatures() {
    console.log('Inicializando funcionalidades da sidebar');
    updateSidebarStats();
}

// Hook na inicialização
const originalInitAppSidebar = window.initApp;
if (originalInitAppSidebar) {
    window.initApp = function() {
        originalInitAppSidebar();
        setTimeout(initSidebarFeatures, 1000);
    };
}
