/**
 * auth.js - Interface de Autenticação
 * Gerencia a UI de login e cadastro
 */

// Aguardar DOM carregar
document.addEventListener('DOMContentLoaded', function() {
    setupTabs();
    setupForms();
});

// Setup das Tabs
function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-button'); // Corrigido: era .tab-btn
    const forms = document.querySelectorAll('.auth-form');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            
            // Remove active de todas as tabs e forms
            tabBtns.forEach(b => b.classList.remove('active'));
            forms.forEach(f => f.classList.remove('active'));
            
            // Ativa a tab clicada
            btn.classList.add('active');
            
            // Ativa o form correspondente
            const targetForm = targetTab === 'login' ? 
                document.getElementById('formLogin') : 
                document.getElementById('formRegister');
            
            if (targetForm) {
                targetForm.classList.add('active');
            }
        });
    });
}

// Setup dos Formulários
function setupForms() {
    // Formulário de Login
    const formLogin = document.getElementById('formLogin');
    if (formLogin) {
        formLogin.addEventListener('submit', handleLogin);
    }
    
    // Formulário de Cadastro
    const formRegister = document.getElementById('formRegister');
    if (formRegister) {
        formRegister.addEventListener('submit', handleRegister);
    }
}

// Handler de Login
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        showToast('Preencha todos os campos', 'error');
        return;
    }
    
    try {
        showToast('Entrando...', 'info');
        const resultado = await fazerLogin(email, password);
        
        if (resultado.success) {
            showToast('Login realizado com sucesso!', 'success');
            setTimeout(() => {
                window.location.href = 'home.html';
            }, 1000);
        }
    } catch (error) {
        console.error('Erro no login:', error);
        showToast(error.message || 'Erro ao fazer login', 'error');
    }
}

// Handler de Cadastro
async function handleRegister(e) {
    e.preventDefault();
    
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const passwordConfirm = document.getElementById('registerPasswordConfirm').value;
    const acceptTerms = document.getElementById('acceptTerms').checked;
    
    // Validações
    if (!name || !email || !password || !passwordConfirm) {
        showToast('Preencha todos os campos', 'error');
        return;
    }
    
    if (password !== passwordConfirm) {
        showToast('As senhas não coincidem', 'error');
        return;
    }
    
    if (password.length < 6) {
        showToast('A senha deve ter no mínimo 6 caracteres', 'error');
        return;
    }
    
    if (!acceptTerms) {
        showToast('Você precisa aceitar os termos de uso', 'error');
        return;
    }
    
    try {
        showToast('Criando conta...', 'info');
        const resultado = await cadastrarUsuario(name, email, password);
        
        if (resultado.success) {
            showToast('Conta criada com sucesso!', 'success');
            setTimeout(() => {
                window.location.href = 'home.html';
            }, 1000);
        }
    } catch (error) {
        console.error('Erro no cadastro:', error);
        showToast(error.message || 'Erro ao criar conta', 'error');
    }
}

// Toggle de Senha
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    if (input.type === 'password') {
        input.type = 'text';
    } else {
        input.type = 'password';
    }
}

// Mostrar Recuperação de Senha
function showForgotPassword() {
    const loginForm = document.getElementById('formLogin');
    const registerForm = document.getElementById('formRegister');
    const forgotForm = document.getElementById('forgotPasswordForm');
    
    if (loginForm) loginForm.classList.remove('active');
    if (registerForm) registerForm.classList.remove('active');
    if (forgotForm) forgotForm.classList.add('active');
}

// Esconder Recuperação de Senha
function hideForgotPassword() {
    const loginForm = document.getElementById('formLogin');
    const forgotForm = document.getElementById('forgotPasswordForm');
    
    if (forgotForm) forgotForm.classList.remove('active');
    if (loginForm) loginForm.classList.add('active');
}

// Enviar Reset de Senha
async function sendPasswordReset() {
    const email = document.getElementById('forgotEmail').value;
    
    if (!email) {
        showToast('Digite seu e-mail', 'error');
        return;
    }
    
    try {
        showToast('Enviando link...', 'info');
        await recuperarSenha(email);
        showToast('Link enviado! Verifique seu e-mail', 'success');
        
        setTimeout(() => {
            hideForgotPassword();
        }, 2000);
    } catch (error) {
        console.error('Erro ao enviar email:', error);
        showToast(error.message || 'Erro ao enviar link', 'error');
    }
}

// Login com Google
async function loginWithGoogle() {
    try {
        showToast('Abrindo Google...', 'info');
        const resultado = await loginComGoogle();
        
        if (resultado.success) {
            showToast('Login realizado com sucesso!', 'success');
            setTimeout(() => {
                window.location.href = 'home.html';
            }, 1000);
        }
    } catch (error) {
        console.error('Erro no login com Google:', error);
        showToast(error.message || 'Erro ao fazer login com Google', 'error');
    }
}

// Mostrar Termos
function showTerms() {
    const modal = document.getElementById('modalTerms');
    if (modal) {
        modal.classList.add('active');
    }
}

function closeTerms() {
    const modal = document.getElementById('modalTerms');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Mostrar Privacidade
function showPrivacy() {
    const modal = document.getElementById('modalPrivacy');
    if (modal) {
        modal.classList.add('active');
    }
}

function closePrivacy() {
    const modal = document.getElementById('modalPrivacy');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Toast Notifications
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
    
    // Remove após 4 segundos
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.2s reverse';
        setTimeout(() => toast.remove(), 200);
    }, 4000);
}
