/**
 * visitor-access.js
 * Utilitários de Conta Visitante — usados em pages INTERNAS (home, mapa, etc.)
 * NÃO é carregado em login.html (o auth.js já cuida do login anônimo lá).
 *
 * Funções exportadas para o window:
 *  - isVisitor()
 *  - trackVisitorAction()
 *  - showConvertAccountBanner()
 *  - showConvertModal() / closeConvertModal()
 *  - convertVisitorToAccount(nome, email, senha)
 *
 * NÃO redefine showToast() — usa a instância já presente na página.
 * NÃO redefine loginAsVisitor() — isso é feito por handleVisitorLogin() no auth.js.
 */

'use strict';

/* ============================================================
   UTILITÁRIOS DE ESTADO
   ============================================================ */

/** Retorna true se o usuário logado for anônimo */
function isVisitor() {
    if (typeof firebase === 'undefined') return false;
    const user = firebase.auth().currentUser;
    return user ? user.isAnonymous : false;
}

/* ============================================================
   CONVERSÃO: VISITANTE → CONTA PERMANENTE
   ============================================================ */

/**
 * Vincula email/senha à conta anônima existente.
 * Preserva todos os dados já salvos (favoritos, roteiros, etc.)
 */
async function convertVisitorToAccount(nome, email, senha) {
    const user = firebase.auth().currentUser;

    if (!user || !user.isAnonymous) {
        _toast('Você já possui uma conta permanente.', 'info');
        return false;
    }

    try {
        const credential = firebase.auth.EmailAuthProvider.credential(email, senha);
        await user.linkWithCredential(credential);
        await user.updateProfile({ displayName: nome });

        await firebase.firestore().collection('users').doc(user.uid).update({
            nome,
            email,
            tipoUsuario: 'permanente',
            limitado: false,
            dataConversao: firebase.firestore.FieldValue.serverTimestamp(),
        });

        _toast('Conta criada! Agora você tem acesso completo.', 'success');
        return true;

    } catch (error) {
        console.error('❌ Erro ao converter visitante:', error);

        const msgs = {
            'auth/email-already-in-use': 'Este e-mail já está em uso.',
            'auth/invalid-email':        'E-mail inválido.',
            'auth/weak-password':        'Senha fraca. Use pelo menos 6 caracteres.',
        };

        _toast(msgs[error.code] || 'Erro ao criar conta permanente.', 'error');
        return false;
    }
}

/* ============================================================
   BANNER DE INCENTIVO À CONVERSÃO
   ============================================================ */

let _visitorActionCount = 0;

/** Chame em cada ação relevante do visitante (ex: favoritar, ver detalhes) */
function trackVisitorAction() {
    if (!isVisitor()) return;

    _visitorActionCount++;

    if (_visitorActionCount === 5) {
        showConvertAccountBanner();
    }
}

function showConvertAccountBanner() {
    if (!isVisitor()) return;
    if (document.getElementById('convertBanner')) return; // já visível

    const banner = document.createElement('div');
    banner.id = 'convertBanner';
    banner.className = 'convert-banner';
    banner.setAttribute('role', 'complementary');
    banner.setAttribute('aria-label', 'Convidar a criar conta permanente');

    banner.innerHTML = `
        <div class="convert-banner-content">
            <div class="convert-banner-icon" aria-hidden="true">
                <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
                    <circle cx="15" cy="15" r="13" stroke="#2d5a3d" stroke-width="2"/>
                    <path d="M15 9v6l4 4" stroke="#2d5a3d" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </div>
            <div class="convert-banner-text">
                <strong>Gostando do Conecta Bueno?</strong>
                <p>Crie uma conta para salvar favoritos e roteiros!</p>
            </div>
            <button class="btn btn-sm btn-primary" onclick="showConvertModal()">Criar Conta</button>
            <button
                class="btn-close-banner"
                onclick="document.getElementById('convertBanner').remove()"
                aria-label="Fechar"
            >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                    <path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </button>
        </div>
    `;

    document.body.appendChild(banner);

    // Auto-remove após 30 s
    setTimeout(() => banner.remove(), 30_000);
}

/* ============================================================
   MODAL DE CONVERSÃO
   ============================================================ */

function showConvertModal() {
    if (document.getElementById('modalConvertVisitor')) return;

    const modal = document.createElement('div');
    modal.id = 'modalConvertVisitor';
    modal.className = 'modal active';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'convertModalTitle');

    modal.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-header">
                <h3 id="convertModalTitle">Criar conta permanente</h3>
                <button class="btn-close-modal" onclick="closeConvertModal()" aria-label="Fechar">&times;</button>
            </div>
            <div class="modal-body">
                <p style="font-size:14px;color:#666;margin-bottom:20px;">
                    Seus dados já salvos serão mantidos!
                </p>
                <form id="formConvertVisitor" novalidate>
                    <div class="form-group">
                        <label for="cvNome">Nome completo</label>
                        <input type="text"  id="cvNome"  class="form-input" placeholder="Seu nome" required>
                    </div>
                    <div class="form-group">
                        <label for="cvEmail">E-mail</label>
                        <input type="email" id="cvEmail" class="form-input" placeholder="seu@email.com" required>
                    </div>
                    <div class="form-group">
                        <label for="cvSenha">Senha</label>
                        <input type="password" id="cvSenha" class="form-input" placeholder="Mínimo 6 caracteres" minlength="6" required>
                    </div>
                    <button type="submit" class="btn btn-primary btn-block">Criar Conta</button>
                </form>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Fechar ao clicar no overlay
    modal.addEventListener('click', e => {
        if (e.target === modal) closeConvertModal();
    });

    document.getElementById('formConvertVisitor')
        .addEventListener('submit', _handleConvertSubmit);
}

function closeConvertModal() {
    const modal = document.getElementById('modalConvertVisitor');
    if (modal) modal.remove();
}

async function _handleConvertSubmit(e) {
    e.preventDefault();

    const nome  = document.getElementById('cvNome').value.trim();
    const email = document.getElementById('cvEmail').value.trim();
    const senha = document.getElementById('cvSenha').value;

    if (!nome || !email || senha.length < 6) {
        _toast('Preencha todos os campos corretamente.', 'error');
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Aguarde…';

    const ok = await convertVisitorToAccount(nome, email, senha);

    if (ok) {
        closeConvertModal();
        setTimeout(() => window.location.reload(), 1200);
    } else {
        btn.disabled = false;
        btn.textContent = 'Criar Conta';
    }
}

/* ============================================================
   HELPER INTERNO — usa showToast() da página se disponível
   ============================================================ */
function _toast(msg, type = 'info') {
    if (typeof window.showToast === 'function') {
        window.showToast(msg, type);
        return;
    }
    // Fallback simples se showToast não estiver no contexto
    console.log(`[${type}] ${msg}`);
}

/* ============================================================
   EXPOSIÇÃO GLOBAL
   ============================================================ */
window.isVisitor               = isVisitor;
window.trackVisitorAction      = trackVisitorAction;
window.showConvertAccountBanner = showConvertAccountBanner;
window.showConvertModal        = showConvertModal;
window.closeConvertModal       = closeConvertModal;
window.convertVisitorToAccount = convertVisitorToAccount;

console.log('✅ visitor-access.js carregado');
