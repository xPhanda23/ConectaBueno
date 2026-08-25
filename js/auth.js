/**
 * auth.js — Interface de Autenticação
 * Conecta Bueno
 *
 * Corrige todos os bugs identificados na auditoria:
 * #1  switchTab() implementado corretamente
 * #2  IDs formForgot (não forgotPasswordForm)
 * #3  handleForgotPassword() implementado
 * #4  IDs modalTermos / modalPrivacidade (não modalTerms / modalPrivacy)
 * #5  openModal() / closeModal() centralizados
 * #6  handleVisitorLogin() chama loginComoVisitante() do firebase-auth.js
 * #7  vitrine iniciada só após Firebase pronto (via waitForFirebase)
 * #8  fazerLogin/cadastrarUsuario não lançam exceção — resultado verificado por .success
 * #9  campo registerPasswordConfirm removido do HTML e do JS
 * #10 .form-input verde sobrescrito no auth.css via .auth-page .form-input
 */

'use strict';

/* ============================================================
   ESTADO DA UI
   ============================================================ */
let _currentTab = 'login'; // 'login' | 'register' | 'forgot'

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    _setupTabDelegation();
    _setupForms();
    _setupPasswordStrength();
    _initVitrine();   // aguarda Firebase internamente
});

/* ============================================================
   TABS — FIX #1
   ============================================================ */

/**
 * Delegação via atributo data-tab nos botões
 * E também exposta globalmente para onclick="" no HTML
 */
function _setupTabDelegation() {
    document.querySelectorAll('.tab-button[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
}

/**
 * switchTab('login' | 'register' | 'forgot')
 * Exposta globalmente — usada por onclick no HTML
 */
function switchTab(tab) {
    const forms = {
        login:    document.getElementById('formLogin'),
        register: document.getElementById('formRegister'),
        forgot:   document.getElementById('formForgot'),   // FIX #2
    };
    const tabs = {
        login:    document.getElementById('tab-login'),
        register: document.getElementById('tab-register'),
    };

    // Esconde todos os forms
    Object.values(forms).forEach(f => { if (f) f.classList.remove('active'); });

    // Remove active de todas as tabs
    Object.values(tabs).forEach(t => { if (t) { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); } });

    // Ativa form alvo
    if (forms[tab]) forms[tab].classList.add('active');

    // Ativa tab (só login e register têm botão de tab)
    if (tabs[tab]) { tabs[tab].classList.add('active'); tabs[tab].setAttribute('aria-selected', 'true'); }

    // Move o slider animado das tabs (novo design)
    const slider = document.getElementById('tabsSlider');
    if (slider) {
        slider.style.transform = tab === 'register' ? 'translateX(100%)' : 'translateX(0)';
    }

    // Limpa erros ao trocar de tab
    _clearAllErrors();

    _currentTab = tab;
}

/* ============================================================
   FORMULÁRIOS
   ============================================================ */
function _setupForms() {
    const formLogin    = document.getElementById('formLogin');
    const formRegister = document.getElementById('formRegister');
    const formForgot   = document.getElementById('formForgot');   // FIX #2

    if (formLogin)    formLogin.addEventListener('submit',    _handleLoginSubmit);
    if (formRegister) formRegister.addEventListener('submit', _handleRegisterSubmit);
    if (formForgot)   formForgot.addEventListener('submit',   _handleForgotSubmit);  // FIX #3

    const visitorButton = document.getElementById('btnVisitor');
    if (visitorButton) visitorButton.addEventListener('click', handleVisitorLogin);
}

/* ============================================================
   LOGIN — FIX #8 (resultado verificado por .success)
   ============================================================ */
async function _handleLoginSubmit(e) {
    e.preventDefault();
    if (!_validateLogin()) return;

    const email    = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn      = document.getElementById('btnLogin');
    const remember = document.getElementById('rememberMe')?.checked;

    _setLoading(btn, true);

    try {
        await _waitForFirebase();
    } catch (error) {
        _setLoading(btn, false);
        console.error('Inicialização do Firebase:', error);
        showToast('O serviço está indisponível. Tente novamente.', 'error');
        return;
    }

    try {
        await window.auth.setPersistence(
            remember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION
        );
    } catch (error) {
        _setLoading(btn, false);
        console.error('Persistência do login:', error);
        showToast('Não foi possível salvar a preferência de sessão.', 'error');
        return;
    }

    const resultado = await fazerLogin(email, password); // firebase-auth.js

    _setLoading(btn, false);

    if (resultado.success) {
        showToast('Login realizado! Redirecionando…', 'success');
        setTimeout(() => { window.location.href = 'home.html'; }, 900);
    } else {
        showToast(resultado.error || 'Erro ao fazer login.', 'error');
    }
}

/* ============================================================
   GOOGLE — exposta para onclick no HTML
   ============================================================ */
async function handleGoogleLogin(evt) {
    const btn = evt?.currentTarget || document.getElementById('btnGoogle');
    _setLoading(btn, true);

    try {
        await _waitForFirebase();
    } catch (error) {
        _setLoading(btn, false);
        console.error('Inicialização do Firebase:', error);
        showToast('O serviço está indisponível. Tente novamente.', 'error');
        return;
    }

    const resultado = await loginComGoogle(); // firebase-auth.js

    _setLoading(btn, false);

    if (resultado.success) {
        showToast('Login realizado! Redirecionando…', 'success');
        setTimeout(() => { window.location.href = 'home.html'; }, 900);
    } else {
        if (resultado.error !== 'Login cancelado.') {
            showToast(resultado.error || 'Erro ao entrar com Google.', 'error');
        }
    }
}

/* ============================================================
   VISITANTE — FIX #6 (chama loginComoVisitante, não loginAsVisitor)
   ============================================================ */
async function handleVisitorLogin() {
    const btn = document.getElementById('btnVisitor');
    _setLoading(btn, true);

    try {
        await _waitForFirebase();
    } catch (error) {
        _setLoading(btn, false);
        console.error('Inicialização do Firebase:', error);
        showToast('O serviço está indisponível. Tente novamente.', 'error');
        return;
    }

    const resultado = await loginComoVisitante(); // firebase-auth.js

    _setLoading(btn, false);

    if (resultado.success) {
        showToast('Entrando como visitante…', 'info');
        setTimeout(() => { window.location.href = 'home.html'; }, 900);
    } else {
        showToast(resultado.error || 'Erro ao entrar como visitante.', 'error');
    }
}

/* ============================================================
   CADASTRO — FIX #8 e #9 (sem passwordConfirm)
   ============================================================ */
async function _handleRegisterSubmit(e) {
    e.preventDefault();
    if (!_validateRegister()) return;

    const name     = document.getElementById('registerName').value.trim();
    const email    = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const btn      = document.getElementById('btnRegister');

    _setLoading(btn, true);

    try {
        await _waitForFirebase();
    } catch (error) {
        _setLoading(btn, false);
        console.error('Inicialização do Firebase:', error);
        showToast('O serviço está indisponível. Tente novamente.', 'error');
        return;
    }

    const resultado = await cadastrarUsuario(name, email, password); // firebase-auth.js

    _setLoading(btn, false);

    if (resultado.success) {
        showToast('Conta criada! Redirecionando…', 'success');
        setTimeout(() => { window.location.href = 'home.html'; }, 900);
    } else {
        showToast(resultado.error || 'Erro ao criar conta.', 'error');
    }
}

/* ============================================================
   RECUPERAR SENHA — FIX #3
   ============================================================ */
async function _handleForgotSubmit(e) {
    e.preventDefault();
    if (!_validateForgot()) return;

    const email = document.getElementById('forgotEmail').value.trim();
    const btn   = document.getElementById('btnForgot');

    _setLoading(btn, true);

    try {
        await _waitForFirebase();
    } catch (error) {
        _setLoading(btn, false);
        console.error('Inicialização do Firebase:', error);
        showToast('O serviço está indisponível. Tente novamente.', 'error');
        return;
    }

    const resultado = await recuperarSenha(email); // firebase-auth.js

    _setLoading(btn, false);

    if (resultado.success) {
        showToast('Link enviado! Verifique seu e-mail.', 'success');
        document.getElementById('forgotEmail').value = '';
        setTimeout(() => switchTab('login'), 2500);
    } else {
        showToast(resultado.error || 'Erro ao enviar link.', 'error');
    }
}

/* ============================================================
   TOGGLE DE SENHA
   ============================================================ */
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';

    const fieldWrap = input.closest('.field-wrap');
    const btn = fieldWrap?.querySelector('.toggle-password');
    if (btn) btn.setAttribute('aria-label', isHidden ? 'Ocultar senha' : 'Mostrar senha');
}

/* ============================================================
   FORÇA DA SENHA
   ============================================================ */
function _setupPasswordStrength() {
    const input = document.getElementById('registerPassword');
    if (!input) return;

    input.addEventListener('input', () => {
        const val = input.value;
        const container = document.getElementById('passwordStrength');
        const fill      = document.getElementById('strengthFill');
        const label     = document.getElementById('strengthLabel');

        if (!val.length) {
            container.classList.remove('visible');
            return;
        }

        container.classList.add('visible');

        const score = _calcPasswordScore(val);

        const config = [
            { pct: '25%', color: '#e53935', text: 'Fraca'   },
            { pct: '50%', color: '#fb8c00', text: 'Regular' },
            { pct: '75%', color: '#fdd835', text: 'Boa'     },
            { pct: '100%',color: '#43a047', text: 'Forte'   },
        ][score];

        fill.style.width      = config.pct;
        fill.style.background = config.color;
        label.textContent     = config.text;
        label.style.color     = config.color;
    });
}

function _calcPasswordScore(pwd) {
    let score = 0;
    if (pwd.length >= 8)               score++;
    if (/[A-Z]/.test(pwd))             score++;
    if (/[0-9]/.test(pwd))             score++;
    if (/[^A-Za-z0-9]/.test(pwd))      score++;
    return Math.min(score, 3);
}

/* ============================================================
   VALIDAÇÕES INLINE
   ============================================================ */
function _validateLogin() {
    let ok = true;

    const email = document.getElementById('loginEmail').value.trim();
    const pwd   = document.getElementById('loginPassword').value;

    if (!_isValidEmail(email)) {
        _setFieldError('loginEmail', 'loginEmailError', 'Informe um e-mail válido.');
        ok = false;
    } else {
        _clearFieldError('loginEmail', 'loginEmailError');
    }

    if (!pwd) {
        _setFieldError('loginPassword', 'loginPasswordError', 'A senha é obrigatória.');
        ok = false;
    } else {
        _clearFieldError('loginPassword', 'loginPasswordError');
    }

    return ok;
}

function _validateRegister() {
    let ok = true;

    const name  = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const pwd   = document.getElementById('registerPassword').value;
    const terms = document.getElementById('acceptTerms').checked;

    if (name.length < 2) {
        _setFieldError('registerName', 'registerNameError', 'Informe seu nome completo.');
        ok = false;
    } else {
        _clearFieldError('registerName', 'registerNameError');
    }

    if (!_isValidEmail(email)) {
        _setFieldError('registerEmail', 'registerEmailError', 'Informe um e-mail válido.');
        ok = false;
    } else {
        _clearFieldError('registerEmail', 'registerEmailError');
    }

    if (pwd.length < 6) {
        _setFieldError('registerPassword', 'registerPasswordError', 'A senha deve ter no mínimo 6 caracteres.');
        ok = false;
    } else {
        _clearFieldError('registerPassword', 'registerPasswordError');
    }

    if (!terms) {
        _setError('termsError', 'Você precisa aceitar os termos para continuar.');
        ok = false;
    } else {
        _clearError('termsError');
    }

    return ok;
}

function _validateForgot() {
    const email = document.getElementById('forgotEmail').value.trim();

    if (!_isValidEmail(email)) {
        _setFieldError('forgotEmail', 'forgotEmailError', 'Informe um e-mail válido.');
        return false;
    }

    _clearFieldError('forgotEmail', 'forgotEmailError');
    return true;
}

function _isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function _setFieldError(inputId, errorId, msg) {
    const input = document.getElementById(inputId);
    const error = document.getElementById(errorId);
    if (input) input.classList.add('has-error');
    if (error) error.textContent = msg;
}

function _clearFieldError(inputId, errorId) {
    const input = document.getElementById(inputId);
    const error = document.getElementById(errorId);
    if (input) input.classList.remove('has-error');
    if (error) error.textContent = '';
}

function _setError(errorId, msg) {
    const el = document.getElementById(errorId);
    if (el) el.textContent = msg;
}

function _clearError(errorId) {
    const el = document.getElementById(errorId);
    if (el) el.textContent = '';
}

function _clearAllErrors() {
    document.querySelectorAll('.field__error').forEach(el => { el.textContent = ''; });
    document.querySelectorAll('.form-input.has-error').forEach(el => el.classList.remove('has-error'));
}

/* ============================================================
   MODAIS — FIX #4 e #5
   openModal() / closeModal() usam IDs reais do HTML
   (modalTermos, modalPrivacidade)
   ============================================================ */
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('active');
        // Foco no primeiro botão de fechar para acessibilidade
        const closeBtn = modal.querySelector('.btn-close-modal');
        if (closeBtn) closeBtn.focus();
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
}

// Fecha modal ao clicar no overlay
document.addEventListener('click', e => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});

// Fecha modal com Escape
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
    }
});

/* ============================================================
   TOASTS
   ============================================================ */
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('role', 'status');
    toast.innerHTML = `
        <div class="toast-icon">${icons[type] ?? icons.info}</div>
        <div class="toast-message">${_escapeHtml(message)}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 280);
    }, 4200);
}

function _escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* ============================================================
   ESTADO DE LOADING NOS BOTÕES
   ============================================================ */
function _setLoading(btn, isLoading) {
    if (!btn) return;
    if (isLoading) {
        btn.classList.add('loading');
        btn.disabled = true;
    } else {
        btn.classList.remove('loading');
        btn.disabled = false;
    }
}

/* ============================================================
   VITRINE CULTURAL — FIX #7 (race condition)
   Inicia somente após Firebase estar pronto
   ============================================================ */
async function _initVitrine() {
    const container = document.getElementById('eventosListaVitrine');
    if (!container) return;

    try {
        await _waitForFirebase();

        const now = new Date();
        const future = new Date(now);
        future.setDate(future.getDate() + 30);

        const snapshots = await Promise.allSettled([
            window.db.collection('eventos').limit(100).get(),
            window.db.collection('events').limit(100).get(),
        ]);

        const eventos = snapshots.flatMap(resultado => {
            if (resultado.status !== 'fulfilled') return [];
            return resultado.value.docs.map(doc => _normalizeShowcaseEvent(doc.data(), doc.id));
        })
            .filter(evento => evento.date && evento.date >= now && evento.date <= future)
            .sort((a, b) => a.date - b.date)
            .slice(0, 6);

        if (!eventos.length) {
            _renderVitrineEmpty(container);
            return;
        }

        container.innerHTML = '';

        const freeCount = eventos.filter(evento => evento.free).length;
        const freePercent = Math.round((freeCount / eventos.length) * 100);
        const next = eventos[0];
        const days = Math.max(0, Math.ceil((next.date - now) / 86400000));

        container.className = 'insight-content insight-content--ready';
        container.innerHTML = `
            <div class="insight-slide is-active" aria-hidden="false">
                <div class="insight-metric"><strong>${freePercent}%</strong><span>dos próximos eventos têm entrada gratuita</span></div>
                <div class="insight-visual" aria-hidden="true"><span style="width:${Math.max(freePercent, 8)}%"></span></div>
                <p class="insight-caption"><b>Leitura da agenda:</b> acesso cultural para todos</p>
            </div>
            <div class="insight-slide" aria-hidden="true">
                <div class="insight-metric"><strong>${eventos.length}</strong><span>eventos encontrados nos próximos 30 dias</span></div>
                <div class="insight-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
                <p class="insight-caption"><b>Próximo destaque:</b> ${_escapeHtml(next.title)}</p>
            </div>
            <div class="insight-slide" aria-hidden="true">
                <div class="insight-metric"><strong>${days === 0 ? 'Hoje' : days + 'd'}</strong><span>até o próximo encontro cultural</span></div>
                <div class="insight-date" aria-hidden="true">${next.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</div>
                <p class="insight-caption"><b>Onde:</b> ${_escapeHtml(next.location || 'Bueno Brandão')}</p>
            </div>
            <div class="insight-dots" aria-hidden="true"><span class="is-active"></span><span></span><span></span></div>
        `;
        document.dispatchEvent(new CustomEvent('insight:ready'));

    } catch (err) {
        console.error('Vitrine:', err);
        _renderVitrineEmpty(container, true);
    }
}

function _normalizeShowcaseEvent(data, id) {
    const rawDate = data.dataInicio ?? data.startDate;
    let date = null;

    if (rawDate?.toDate) {
        date = rawDate.toDate();
    } else if (rawDate instanceof Date) {
        date = rawDate;
    } else if (typeof rawDate === 'string') {
        date = new Date(rawDate.length === 10 ? `${rawDate}T00:00:00` : rawDate);
    }

    return {
        id,
        date: date && !Number.isNaN(date.getTime()) ? date : null,
        title: data.titulo ?? data.title ?? 'Evento',
        location: data.local ?? data.location ?? '',
        free: data.entrada?.toLowerCase?.().includes('grat') || data.gratuito === true,
    };
}

function _renderVitrineEmpty(container, isError = false) {
    container.innerHTML = `
        <div class="showcase-state swiper-slide">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
                <rect x="4" y="7" width="28" height="22" rx="2" stroke="#ccc" stroke-width="1.8"/>
                <path d="M10 4v3M26 4v3M4 14h28" stroke="#ccc" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
            <p>${isError ? 'Não foi possível carregar os eventos.' : 'Nenhum evento nos próximos 30 dias.'}</p>
        </div>
    `;
}

/* ============================================================
   UTILITÁRIO — AGUARDAR FIREBASE
   Resolve race condition #7: evita chamadas antes de firebase.apps[0]
   ============================================================ */
function _waitForFirebase(timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
        if (typeof firebase !== 'undefined' && firebase.apps.length > 0 && window.db && window.auth) {
            resolve();
            return;
        }

        const start    = Date.now();
        const interval = setInterval(() => {
            if (typeof firebase !== 'undefined' && firebase.apps.length > 0 && window.db && window.auth) {
                clearInterval(interval);
                resolve();
            } else if (Date.now() - start > timeoutMs) {
                clearInterval(interval);
                reject(new Error('Firebase não inicializou a tempo.'));
            }
        }, 120);
    });
}

/* ============================================================
   EXPOSIÇÃO GLOBAL
   Funções chamadas por onclick="" no HTML precisam estar no window
   ============================================================ */
window.switchTab        = switchTab;
window.handleGoogleLogin  = handleGoogleLogin;
window.handleVisitorLogin = handleVisitorLogin;
window.togglePassword   = togglePassword;
window.openModal        = openModal;
window.closeModal       = closeModal;
window.showToast        = showToast;
