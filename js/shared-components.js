/**
 * shared-components.js — Conecta Bueno
 * Lógica compartilhada para header e footer
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// HEADER: Scroll effect e menu mobile
// ═══════════════════════════════════════════════════════════════

function setupHeaderScroll() {
    const header = document.querySelector('.site-header');
    if (!header) return;

    const onScroll = () => {
        header.classList.toggle('scrolled', window.scrollY > 60);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
}

// Menu mobile toggle
function setupMobileMenu() {
    const toggle = document.querySelector('.hd-menu-toggle');
    const nav = document.querySelector('.hd-nav');
    
    if (!toggle || !nav) return;
    
    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        nav.classList.toggle('active');
    });
    
    // Fechar ao clicar fora
    document.addEventListener('click', (e) => {
        if (!nav.contains(e.target) && e.target !== toggle) {
            nav.classList.remove('active');
        }
    });
    
    // Fechar ao clicar em link
    nav.querySelectorAll('.hd-nav-link').forEach(link => {
        link.addEventListener('click', () => {
            nav.classList.remove('active');
        });
    });
}

// ═══════════════════════════════════════════════════════════════
// USER DROPDOWN
// ═══════════════════════════════════════════════════════════════

function setupUserDropdown() {
    const btnUser = document.getElementById('btnUserMenu');
    const dropdown = document.getElementById('userDropdown');
    
    if (!btnUser || !dropdown) return;
    
    btnUser.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.toggle('active');
        btnUser.setAttribute('aria-expanded', String(isOpen));
    });
    
    // Fechar ao clicar fora
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== btnUser) {
            dropdown.classList.remove('active');
            btnUser.setAttribute('aria-expanded', 'false');
        }
    });
    
    // Fechar com ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && dropdown.classList.contains('active')) {
            dropdown.classList.remove('active');
            btnUser.setAttribute('aria-expanded', 'false');
        }
    });
}

// ═══════════════════════════════════════════════════════════════
// LOGOUT
// ═══════════════════════════════════════════════════════════════

function setupLogout() {
    const btnLogout = document.getElementById('btnLogout');
    if (!btnLogout) return;
    
    btnLogout.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            if (window.auth) {
                await window.auth.signOut();
            }
            window.location.href = 'login.html';
        } catch (err) {
            console.error('❌ Logout:', err);
            window.location.href = 'login.html';
        }
    });
}

// ═══════════════════════════════════════════════════════════════
// RENDERIZAR INFO DO USUÁRIO
// ═══════════════════════════════════════════════════════════════

function renderUserInfo(user) {
    if (!user) return;
    
    const nome = user.nome || user.displayName || user.email?.split('@')[0] || 'Visitante';
    const email = user.email || '';
    const iniciais = getInitials(nome);
    const photo = user.photoURL;
    
    setTxt('userName', nome);
    setTxt('userEmail', email);
    setAvatar('userInitials', iniciais, photo);
    setAvatar('userInitialsLarge', iniciais, photo);
    
    // Mostrar painel admin se for admin
    if (user.isAdmin) {
        document.querySelectorAll('#menuAdminPanel').forEach(el => {
            el.style.display = 'flex';
        });
    }
}

function setAvatar(id, initials, photoURL) {
    const el = document.getElementById(id);
    if (!el) return;
    
    if (photoURL && (photoURL.startsWith('data:image') || photoURL.startsWith('http'))) {
        el.innerHTML = `<img src="${photoURL}" alt="${initials}">`;
    } else {
        el.textContent = initials;
    }
}

function setTxt(id, txt) {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
}

function getInitials(name) {
    if (!name) return 'CB';
    const p = name.trim().split(' ');
    return p.length >= 2 
        ? (p[0][0] + p[p.length-1][0]).toUpperCase() 
        : name.slice(0,2).toUpperCase();
}

// ═══════════════════════════════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════════════════

function initSharedComponents() {
    setupHeaderScroll();
    setupMobileMenu();
    setupUserDropdown();
    setupLogout();
}

// Auto-init se documento já carregou
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSharedComponents);
} else {
    initSharedComponents();
}

// Export para uso em outros scripts
if (typeof window !== 'undefined') {
    window.sharedComponents = {
        setupHeaderScroll,
        setupMobileMenu,
        setupUserDropdown,
        setupLogout,
        renderUserInfo,
        setAvatar,
        setTxt,
        getInitials,
        initSharedComponents
    };
}
