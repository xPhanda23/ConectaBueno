/**
 * auth.js — Mapa Cultural de Bueno Brandão
 * Lógica de autenticação: troca de abas, validação de formulários,
 * força de senha e feedback visual ao usuário.
 */

/* =============================================
   NAVEGAÇÃO ENTRE ABAS (Login / Cadastro)
   ============================================= */

/**
 * Alterna entre os formulários de login e cadastro.
 * @param {'login'|'register'} tab - qual aba exibir
 */
function showTab(tab) {
    const formLogin    = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');
    const tabLogin     = document.getElementById('tab-login');
    const tabRegister  = document.getElementById('tab-register');
    const indicator    = document.getElementById('tab-indicator');

    // Não faz nada se já estiver na aba correta
    const isLogin = tab === 'login';

    if (formLogin)    formLogin.classList.toggle('active', isLogin);
    if (formRegister) formRegister.classList.toggle('active', !isLogin);
    if (tabLogin)     tabLogin.classList.toggle('active', isLogin);
    if (tabRegister)  tabRegister.classList.toggle('active', !isLogin);

    // Move o indicador da aba
    if (indicator) {
        indicator.classList.toggle('right', !isLogin);
    }

    // Limpa erros ao trocar de aba
    limparErros();
}

/* =============================================
   TOGGLE DE SENHA (mostrar / ocultar)
   ============================================= */

/**
 * Alterna a visibilidade de um campo de senha.
 * @param {string} inputId  - ID do input de senha
 * @param {HTMLElement} btn - botão que disparou o evento
 */
function toggleSenha(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';

    // Troca o ícone
    const icon = btn.querySelector('i');
    if (icon) {
        icon.classList.toggle('fa-eye',        !isPassword);
        icon.classList.toggle('fa-eye-slash',   isPassword);
    }
}

/* =============================================
   FORÇA DA SENHA
   ============================================= */

/**
 * Calcula e exibe a força da senha.
 * @param {string} senha - valor digitado no campo de senha
 */
function atualizarForcaSenha(senha) {
    const strengthEl    = document.getElementById('senha-strength');
    const fillEl        = document.getElementById('strength-fill');
    const labelEl       = document.getElementById('strength-label');

    if (!strengthEl || !fillEl || !labelEl) return;

    if (!senha) {
        strengthEl.classList.remove('visible');
        fillEl.className = 'strength-fill';
        labelEl.textContent = '';
        return;
    }

    strengthEl.classList.add('visible');

    let pontos = 0;
    if (senha.length >= 8)                    pontos++;
    if (senha.length >= 12)                   pontos++;
    if (/[A-Z]/.test(senha))                  pontos++;
    if (/[0-9]/.test(senha))                  pontos++;
    if (/[^A-Za-z0-9]/.test(senha))           pontos++;

    const niveis = [
        { min: 0, classe: 'fraca',  texto: 'Fraca'  },
        { min: 2, classe: 'media',  texto: 'Média'  },
        { min: 3, classe: 'boa',    texto: 'Boa'    },
        { min: 4, classe: 'forte',  texto: 'Forte'  },
    ];

    const nivel = [...niveis].reverse().find(n => pontos >= n.min) || niveis[0];

    fillEl.className  = `strength-fill ${nivel.classe}`;
    labelEl.className = `strength-label ${nivel.classe}`;
    labelEl.textContent = nivel.texto;
}

/* =============================================
   VALIDAÇÕES
   ============================================= */

/**
 * Exibe uma mensagem de erro abaixo de um campo.
 * @param {string} elementId - ID do span de erro
 * @param {string} mensagem  - texto a exibir (vazio para limpar)
 */
function setErro(elementId, mensagem) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = mensagem;
}

/**
 * Marca um input como válido ou inválido visualmente.
 * @param {HTMLElement} input
 * @param {boolean} valido
 */
function setEstadoInput(input, valido) {
    if (!input) return;
    input.classList.toggle('is-invalid', !valido);
    input.classList.toggle('is-valid',    valido);
}

/** Remove todos os estados de erro/validação da página */
function limparErros() {
    document.querySelectorAll('.field-error').forEach(el => el.textContent = '');
    document.querySelectorAll('input').forEach(input => {
        input.classList.remove('is-invalid', 'is-valid');
    });
    document.querySelectorAll('.feedback-message').forEach(el => {
        el.className = 'feedback-message';
        el.textContent = '';
    });
}

/** Valida formato de e-mail */
function emailValido(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* =============================================
   FEEDBACK VISUAL
   ============================================= */

/**
 * Exibe uma mensagem de sucesso ou erro no bloco de feedback.
 * @param {string} elementId - ID do div feedback
 * @param {'success'|'error'} tipo
 * @param {string} mensagem
 */
function mostrarFeedback(elementId, tipo, mensagem) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = mensagem;
    el.className = `feedback-message show ${tipo}`;
}

/**
 * Coloca o botão em estado de carregamento.
 * @param {HTMLElement} btn
 * @param {boolean} loading
 */
function setBtnLoading(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    btn.classList.toggle('loading', loading);
}

/* =============================================
   SUBMIT — LOGIN
   ============================================= */

(function inicializarLogin() {
    const form = document.getElementById('form-login');
    if (!form) return;

    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        limparErros();

        const emailInput = document.getElementById('login-email');
        const senhaInput = document.getElementById('login-senha');
        const btn        = document.getElementById('btn-login');

        const email = emailInput?.value.trim() ?? '';
        const senha = senhaInput?.value ?? '';

        let valido = true;

        // Validação de e-mail
        if (!email) {
            setErro('error-login-email', 'Informe seu e-mail.');
            setEstadoInput(emailInput, false);
            valido = false;
        } else if (!emailValido(email)) {
            setErro('error-login-email', 'E-mail inválido.');
            setEstadoInput(emailInput, false);
            valido = false;
        } else {
            setEstadoInput(emailInput, true);
        }

        // Validação de senha
        if (!senha) {
            setErro('error-login-senha', 'Informe sua senha.');
            setEstadoInput(senhaInput, false);
            valido = false;
        } else {
            setEstadoInput(senhaInput, true);
        }

        if (!valido) return;

        // Faz login com Firebase
        setBtnLoading(btn, true);

        const resultado = await fazerLogin(email, senha);

        setBtnLoading(btn, false);

        if (resultado.success) {
            mostrarFeedback('feedback-login', 'success', 'Login realizado com sucesso! Redirecionando...');
            setTimeout(() => {
                window.location.href = '../index.html';
            }, 800);
        } else {
            mostrarFeedback('feedback-login', 'error', resultado.error);
        }
    });
})();

/* =============================================
   SUBMIT — CADASTRO
   ============================================= */

(function inicializarCadastro() {
    const form = document.getElementById('form-register');
    if (!form) return;

    // Força da senha em tempo real
    const senhaInput = document.getElementById('reg-senha');
    if (senhaInput) {
        senhaInput.addEventListener('input', () => {
            atualizarForcaSenha(senhaInput.value);
        });
    }

    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        limparErros();

        const nomeInput     = document.getElementById('reg-nome');
        const emailInput    = document.getElementById('reg-email');
        const senhaEl       = document.getElementById('reg-senha');
        const confirmarEl   = document.getElementById('reg-confirmar-senha');
        const termosEl      = document.getElementById('aceitar-termos');
        const btn           = document.getElementById('btn-register');

        const nome     = nomeInput?.value.trim() ?? '';
        const email    = emailInput?.value.trim() ?? '';
        const senha    = senhaEl?.value ?? '';
        const confirmar = confirmarEl?.value ?? '';
        const termos   = termosEl?.checked ?? false;

        let valido = true;

        // Nome
        if (!nome || nome.length < 3) {
            setErro('error-reg-nome', 'Informe seu nome completo (mínimo 3 caracteres).');
            setEstadoInput(nomeInput, false);
            valido = false;
        } else {
            setEstadoInput(nomeInput, true);
        }

        // E-mail
        if (!email) {
            setErro('error-reg-email', 'Informe seu e-mail.');
            setEstadoInput(emailInput, false);
            valido = false;
        } else if (!emailValido(email)) {
            setErro('error-reg-email', 'E-mail inválido.');
            setEstadoInput(emailInput, false);
            valido = false;
        } else {
            setEstadoInput(emailInput, true);
        }

        // Senha
        if (!senha || senha.length < 8) {
            setErro('error-reg-senha', 'A senha deve ter pelo menos 8 caracteres.');
            setEstadoInput(senhaEl, false);
            valido = false;
        } else {
            setEstadoInput(senhaEl, true);
        }

        // Confirmação
        if (!confirmar) {
            setErro('error-reg-confirmar', 'Confirme sua senha.');
            setEstadoInput(confirmarEl, false);
            valido = false;
        } else if (senha !== confirmar) {
            setErro('error-reg-confirmar', 'As senhas não coincidem.');
            setEstadoInput(confirmarEl, false);
            valido = false;
        } else {
            setEstadoInput(confirmarEl, true);
        }

        // Termos
        if (!termos) {
            setErro('error-termos', 'Você precisa aceitar os Termos de Uso para continuar.');
            valido = false;
        }

        if (!valido) return;

        // Cadastra no Firebase
        setBtnLoading(btn, true);

        const resultado = await cadastrarUsuario(nome, email, senha);

        setBtnLoading(btn, false);

        if (resultado.success) {
            mostrarFeedback(
                'feedback-register',
                'success',
                'Conta criada com sucesso! Bem-vindo ao Mapa Cultural 🌿'
            );

            // Redireciona para o mapa após sucesso
            setTimeout(() => {
                window.location.href = '../index.html';
            }, 1500);
        } else {
            mostrarFeedback('feedback-register', 'error', resultado.error);
        }
    });
})();

/* =============================================
   LOGINS SOCIAIS E VISITANTE
   ============================================= */

// Login com Google
(function inicializarLoginGoogle() {
    const btnsGoogle = document.querySelectorAll('.btn-google');
    
    btnsGoogle.forEach(btn => {
        btn.addEventListener('click', async function() {
            limparErros();
            
            btn.disabled = true;
            btn.style.opacity = '0.6';
            
            const resultado = await loginComGoogle();
            
            btn.disabled = false;
            btn.style.opacity = '1';
            
            if (resultado.success) {
                window.location.href = '../index.html';
            } else {
                const feedbackId = document.getElementById('form-login').classList.contains('active') 
                    ? 'feedback-login' 
                    : 'feedback-register';
                mostrarFeedback(feedbackId, 'error', resultado.error);
            }
        });
    });
})();

// Login como Visitante (Anônimo)
(function inicializarLoginVisitante() {
    const btnsVisitante = document.querySelectorAll('.btn-visitante');
    
    btnsVisitante.forEach(btn => {
        btn.addEventListener('click', async function() {
            limparErros();
            
            btn.disabled = true;
            btn.style.opacity = '0.6';
            
            const resultado = await loginComoVisitante();
            
            btn.disabled = false;
            btn.style.opacity = '1';
            
            if (resultado.success) {
                window.location.href = '../index.html';
            } else {
                const feedbackId = document.getElementById('form-login').classList.contains('active') 
                    ? 'feedback-login' 
                    : 'feedback-register';
                mostrarFeedback(feedbackId, 'error', resultado.error);
            }
        });
    });
})();

// Recuperação de senha
(function inicializarRecuperacaoSenha() {
    const linkEsqueci = document.querySelector('.link-esqueci');
    
    if (linkEsqueci) {
        linkEsqueci.addEventListener('click', async function(e) {
            e.preventDefault();
            
            const email = document.getElementById('login-email')?.value.trim();
            
            if (!email) {
                mostrarFeedback('feedback-login', 'error', 'Digite seu e-mail no campo acima primeiro.');
                return;
            }
            
            if (!emailValido(email)) {
                mostrarFeedback('feedback-login', 'error', 'Digite um e-mail válido no campo acima.');
                return;
            }
            
            const resultado = await recuperarSenha(email);
            
            if (resultado.success) {
                mostrarFeedback('feedback-login', 'success', resultado.message);
            } else {
                mostrarFeedback('feedback-login', 'error', resultado.error);
            }
        });
    }
})();
