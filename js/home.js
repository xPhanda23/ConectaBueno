/**
 * home.js - Página inicial pós-login
 * Menu de navegação principal
 */

// ===================================
// VARIÁVEIS GLOBAIS
// ===================================

let currentUser = null;
let db, auth;

// ===================================
// INICIALIZAÇÃO
// ===================================

window.addEventListener('load', async () => {
    console.log('🏠 Inicializando Home...');
    
    // Aguardar Firebase
    await waitForFirebase();
    db = window.db;
    auth = window.auth;
    
    // Verificar autenticação
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            await loadUserProfile(user);
            hideLoading();
        } else {
            // Redirecionar para login se não autenticado
            window.location.href = 'login.html';
        }
    });
    
    // Setup event listeners
    setupEventListeners();
});

function waitForFirebase() {
    return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
            if (window.db && window.auth) {
                clearInterval(checkInterval);
                resolve();
            }
        }, 100);
        
        setTimeout(() => {
            clearInterval(checkInterval);
            resolve();
        }, 5000);
    });
}

// ===================================
// CARREGAR PERFIL DO USUÁRIO
// ===================================

async function loadUserProfile(user) {
    try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (userDoc.exists) {
            currentUser = {
                uid: user.uid,
                email: user.email,
                ...userDoc.data()
            };
            
            console.log('✅ Usuário carregado:', currentUser.nome);
            displayUserInfo();
            
            // Mostrar card admin se for admin
            if (currentUser.isAdmin) {
                document.getElementById('cardAdmin').style.display = 'flex';
            }
        } else {
            // Criar perfil básico se não existir
            currentUser = {
                uid: user.uid,
                email: user.email,
                nome: user.displayName || user.email.split('@')[0],
                isAdmin: false
            };
            
            displayUserInfo();
        }
        
        // Carregar estatísticas
        await loadStatistics();
    } catch (error) {
        console.error('❌ Erro ao carregar perfil:', error);
        currentUser = {
            uid: user.uid,
            email: user.email,
            nome: user.email.split('@')[0],
            isAdmin: false
        };
        displayUserInfo();
    }
}

function displayUserInfo() {
    const userName = document.getElementById('userName');
    const userEmail = document.getElementById('userEmail');
    const userInitials = document.getElementById('userInitials');
    const userInitialsLarge = document.getElementById('userInitialsLarge');
    
    const nome = currentUser.nome || 'Visitante';
    const email = currentUser.email || '';
    
    if (userName) userName.textContent = nome;
    if (userEmail) userEmail.textContent = email;
    
    // Avatar iniciais
    const iniciais = getInitials(nome || email);
    
    if (userInitials) {
        if (currentUser.photoURL && currentUser.photoURL.startsWith('data:image')) {
            userInitials.innerHTML = `<img src="${currentUser.photoURL}" alt="${nome}">`;
        } else if (currentUser.photoURL && currentUser.photoURL.startsWith('http')) {
            userInitials.innerHTML = `<img src="${currentUser.photoURL}" alt="${nome}">`;
        } else {
            userInitials.textContent = iniciais;
        }
    }
    
    if (userInitialsLarge) {
        if (currentUser.photoURL && currentUser.photoURL.startsWith('data:image')) {
            userInitialsLarge.innerHTML = `<img src="${currentUser.photoURL}" alt="${nome}">`;
        } else if (currentUser.photoURL && currentUser.photoURL.startsWith('http')) {
            userInitialsLarge.innerHTML = `<img src="${currentUser.photoURL}" alt="${nome}">`;
        } else {
            userInitialsLarge.textContent = iniciais;
        }
    }
}

function getInitials(name) {
    if (!name) return 'CB';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

// ===================================
// EVENT LISTENERS
// ===================================

function setupEventListeners() {
    const btnLogout = document.getElementById('btnLogout');
    const btnUserMenu = document.getElementById('btnUserMenu');
    const userDropdown = document.getElementById('userDropdown');
    const menuAdminPanel = document.getElementById('menuAdminPanel');
    
    // Dropdown user menu
    if (btnUserMenu && userDropdown) {
        btnUserMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.classList.toggle('active');
        });
        
        // Fechar dropdown ao clicar fora
        document.addEventListener('click', (e) => {
            if (!userDropdown.contains(e.target) && !btnUserMenu.contains(e.target)) {
                userDropdown.classList.remove('active');
            }
        });
    }
    
    // Logout
    if (btnLogout) {
        btnLogout.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }
    
    // Mostrar painel admin no menu se for admin
    if (currentUser && currentUser.isAdmin && menuAdminPanel) {
        menuAdminPanel.style.display = 'flex';
    }
}

async function logout() {
    try {
        await auth.signOut();
        window.location.href = 'login.html';
    } catch (error) {
        console.error('❌ Erro ao sair:', error);
        alert('Erro ao sair. Tente novamente.');
    }
}

// ===================================
// LOADING
// ===================================

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 300);
    }
}

// ===================================
// ESTATÍSTICAS
// ===================================

async function loadStatistics() {
    try {
        // Contar lugares no Firebase
        const placesSnapshot = await db.collection('places').get();
        const placesCount = placesSnapshot.size;
        
        // Contar eventos ativos (com data final >= hoje)
        const now = new Date();
        now.setHours(0, 0, 0, 0); // Começar do início do dia
        
        const eventsSnapshot = await db.collection('events')
            .where('endDate', '>=', now)
            .get();
        const eventsCount = eventsSnapshot.size;
        
        // Animar contadores com valores reais do Firebase
        animateCounter('statPlaces', placesCount);
        animateCounter('statEvents', eventsCount);
        
        console.log('📊 Estatísticas reais carregadas:', { 
            lugares: placesCount, 
            eventosAtivos: eventsCount 
        });
    } catch (error) {
        console.error('❌ Erro ao carregar estatísticas:', error);
        // Em caso de erro, mostrar 0
        const statPlaces = document.getElementById('statPlaces');
        const statEvents = document.getElementById('statEvents');
        
        if (statPlaces) statPlaces.textContent = '0';
        if (statEvents) statEvents.textContent = '0';
    }
}

function animateCounter(elementId, target) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const duration = 2000; // 2 segundos
    const steps = 60;
    const increment = target / steps;
    const stepTime = duration / steps;
    let current = 0;
    
    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            element.textContent = formatNumber(target);
            clearInterval(timer);
        } else {
            element.textContent = formatNumber(Math.floor(current));
        }
    }, stepTime);
}

function formatNumber(num) {
    if (num >= 1000) {
        return (num / 1000).toFixed(1).replace('.0', '') + 'k';
    }
    return num.toString();
}
