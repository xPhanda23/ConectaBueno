/**
 * firebase-auth.js — Módulo de Autenticação Firebase
 * Funções para cadastro, login, logout e gerenciamento de usuários
 */

// Aguarda Firebase estar disponível
let auth, db;

// Aguarda evento personalizado do firebase-config.js
window.addEventListener('load', function() {
    // Aguardar Firebase estar completamente inicializado
    setTimeout(initializeFirebaseRefs, 500);
});

function initializeFirebaseRefs() {
    if (typeof firebase === 'undefined') {
        console.warn('⚠️ Firebase SDK não carregado ainda, tentando novamente...');
        setTimeout(initializeFirebaseRefs, 500);
        return;
    }
    
    // Verificar se Firebase foi inicializado
    if (firebase.apps.length === 0) {
        console.warn('⚠️ Firebase não inicializado, tentando novamente...');
        setTimeout(initializeFirebaseRefs, 500);
        return;
    }
    
    try {
        auth = firebase.auth();
        db = firebase.firestore();
        console.log('✅ Referências Firebase Auth inicializadas');
    } catch (error) {
        console.error('❌ Erro ao inicializar referências Firebase:', error);
        setTimeout(initializeFirebaseRefs, 500);
    }
}

/**
 * Cadastra um novo usuário no Firebase Authentication e cria seu perfil no Firestore
 * @param {string} nome - Nome completo do usuário
 * @param {string} email - Email do usuário
 * @param {string} senha - Senha do usuário
 * @returns {Promise<Object>} Dados do usuário criado
 */
async function cadastrarUsuario(nome, email, senha) {
    try {
        if (!auth || !db) {
            throw new Error('Firebase não inicializado. Aguarde...');
        }
        
        // Cria o usuário no Firebase Authentication
        const userCredential = await auth.createUserWithEmailAndPassword(email, senha);
        const user = userCredential.user;

        // Atualiza o perfil com o nome
        await user.updateProfile({
            displayName: nome
        });

        // Cria documento do usuário no Firestore
        await db.collection('users').doc(user.uid).set({
            uid: user.uid,
            nome: nome,
            email: email,
            dataCriacao: firebase.firestore.FieldValue.serverTimestamp(),
            ultimoAcesso: firebase.firestore.FieldValue.serverTimestamp(),
            favoritosIds: [],
            roteirosIds: []
        });

        console.log('✅ Usuário cadastrado com sucesso:', user.uid);

        return {
            success: true,
            user: {
                uid: user.uid,
                nome: nome,
                email: email
            }
        };

    } catch (error) {
        console.error('❌ Erro ao cadastrar:', error);
        
        // Mensagens de erro amigáveis em português
        let mensagem = 'Erro ao criar conta. Tente novamente.';
        
        switch (error.code) {
            case 'auth/email-already-in-use':
                mensagem = 'Este e-mail já está cadastrado.';
                break;
            case 'auth/invalid-email':
                mensagem = 'E-mail inválido.';
                break;
            case 'auth/weak-password':
                mensagem = 'Senha muito fraca. Use pelo menos 6 caracteres.';
                break;
            case 'auth/network-request-failed':
                mensagem = 'Erro de conexão. Verifique sua internet.';
                break;
        }

        return {
            success: false,
            error: mensagem
        };
    }
}

/**
 * Faz login de um usuário existente
 * @param {string} email - Email do usuário
 * @param {string} senha - Senha do usuário
 * @returns {Promise<Object>} Dados do usuário logado
 */
async function fazerLogin(email, senha) {
    try {
        if (!auth || !db) {
            throw new Error('Firebase não inicializado. Recarregue a página.');
        }
        
        const userCredential = await auth.signInWithEmailAndPassword(email, senha);
        const user = userCredential.user;

        // Atualiza último acesso no Firestore
        await db.collection('users').doc(user.uid).update({
            ultimoAcesso: firebase.firestore.FieldValue.serverTimestamp()
        });

        console.log('✅ Login realizado com sucesso:', user.uid);

        return {
            success: true,
            user: {
                uid: user.uid,
                nome: user.displayName,
                email: user.email
            }
        };

    } catch (error) {
        console.error('❌ Erro ao fazer login:', error);

        let mensagem = 'Erro ao fazer login. Tente novamente.';

        switch (error.code) {
            case 'auth/user-not-found':
            case 'auth/wrong-password':
                mensagem = 'E-mail ou senha incorretos.';
                break;
            case 'auth/invalid-email':
                mensagem = 'E-mail inválido.';
                break;
            case 'auth/user-disabled':
                mensagem = 'Esta conta foi desativada.';
                break;
            case 'auth/too-many-requests':
                mensagem = 'Muitas tentativas. Tente novamente mais tarde.';
                break;
            case 'auth/network-request-failed':
                mensagem = 'Erro de conexão. Verifique sua internet.';
                break;
        }

        return {
            success: false,
            error: mensagem
        };
    }
}

/**
 * Faz logout do usuário atual
 * @returns {Promise<Object>} Resultado da operação
 */
async function fazerLogout() {
    try {
        await auth.signOut();
        console.log('✅ Logout realizado com sucesso');
        return { success: true };
    } catch (error) {
        console.error('❌ Erro ao fazer logout:', error);
        return {
            success: false,
            error: 'Erro ao sair. Tente novamente.'
        };
    }
}

/**
 * Login com Google
 * @returns {Promise<Object>} Dados do usuário logado
 */
async function loginComGoogle() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({
            prompt: 'select_account'
        });

        const result = await auth.signInWithPopup(provider);
        const user = result.user;

        // Verifica se é a primeira vez do usuário
        const docRef = db.collection('users').doc(user.uid);
        const doc = await docRef.get();

        if (!doc.exists) {
            // Cria perfil para novo usuário
            await docRef.set({
                uid: user.uid,
                nome: user.displayName,
                email: user.email,
                foto: user.photoURL,
                dataCriacao: firebase.firestore.FieldValue.serverTimestamp(),
                ultimoAcesso: firebase.firestore.FieldValue.serverTimestamp(),
                favoritosIds: [],
                roteirosIds: []
            });
        } else {
            // Atualiza último acesso
            await docRef.update({
                ultimoAcesso: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        console.log('✅ Login com Google realizado:', user.uid);

        return {
            success: true,
            user: {
                uid: user.uid,
                nome: user.displayName,
                email: user.email,
                foto: user.photoURL
            }
        };

    } catch (error) {
        console.error('❌ Erro ao fazer login com Google:', error);

        if (error.code === 'auth/popup-closed-by-user') {
            return {
                success: false,
                error: 'Login cancelado.'
            };
        }

        return {
            success: false,
            error: 'Erro ao fazer login com Google.'
        };
    }
}

/**
 * Login Anônimo (Visitante)
 * Permite acesso limitado sem cadastro
 * @returns {Promise<Object>} Dados do usuário anônimo
 */
async function loginComoVisitante() {
    try {
        const result = await auth.signInAnonymously();
        const user = result.user;

        // Cria perfil básico para visitante
        const docRef = db.collection('users').doc(user.uid);
        await docRef.set({
            uid: user.uid,
            nome: 'Visitante',
            tipoUsuario: 'anonimo',
            dataCriacao: firebase.firestore.FieldValue.serverTimestamp(),
            ultimoAcesso: firebase.firestore.FieldValue.serverTimestamp(),
            favoritosIds: [],
            roteirosIds: [],
            limitado: true // Flag para identificar recursos limitados
        });

        console.log('✅ Login anônimo realizado:', user.uid);

        return {
            success: true,
            user: {
                uid: user.uid,
                nome: 'Visitante',
                anonimo: true
            }
        };

    } catch (error) {
        console.error('❌ Erro ao fazer login anônimo:', error);

        return {
            success: false,
            error: 'Erro ao entrar como visitante. Tente novamente.'
        };
    }
}

/**
 * Converte usuário anônimo em conta permanente
 * @param {string} nome - Nome do usuário
 * @param {string} email - Email do usuário
 * @param {string} senha - Senha do usuário
 * @returns {Promise<Object>} Resultado da conversão
 */
async function converterVisitanteEmConta(nome, email, senha) {
    try {
        const user = auth.currentUser;
        
        if (!user || !user.isAnonymous) {
            return {
                success: false,
                error: 'Você já tem uma conta permanente.'
            };
        }

        // Cria credencial de email/senha
        const credential = firebase.auth.EmailAuthProvider.credential(email, senha);
        
        // Vincula a credencial à conta anônima
        await user.linkWithCredential(credential);
        
        // Atualiza o perfil
        await user.updateProfile({
            displayName: nome
        });

        // Atualiza dados no Firestore
        await db.collection('users').doc(user.uid).update({
            nome: nome,
            email: email,
            tipoUsuario: 'permanente',
            limitado: false,
            dataConversao: firebase.firestore.FieldValue.serverTimestamp()
        });

        console.log('✅ Visitante convertido em conta permanente:', user.uid);

        return {
            success: true,
            message: 'Conta criada com sucesso! Agora você tem acesso completo.'
        };

    } catch (error) {
        console.error('❌ Erro ao converter visitante:', error);

        let mensagem = 'Erro ao criar conta permanente.';

        switch (error.code) {
            case 'auth/email-already-in-use':
                mensagem = 'Este e-mail já está em uso.';
                break;
            case 'auth/invalid-email':
                mensagem = 'E-mail inválido.';
                break;
            case 'auth/weak-password':
                mensagem = 'Senha muito fraca. Use pelo menos 6 caracteres.';
                break;
        }

        return {
            success: false,
            error: mensagem
        };
    }
}

/**
 * Recuperação de senha
 * @param {string} email - Email do usuário
 * @returns {Promise<Object>} Resultado da operação
 */
async function recuperarSenha(email) {
    try {
        await auth.sendPasswordResetEmail(email);
        console.log('✅ Email de recuperação enviado para:', email);

        return {
            success: true,
            message: 'Link de recuperação enviado para seu e-mail.'
        };

    } catch (error) {
        console.error('❌ Erro ao recuperar senha:', error);

        let mensagem = 'Erro ao enviar email de recuperação.';

        switch (error.code) {
            case 'auth/user-not-found':
                mensagem = 'Nenhuma conta encontrada com este e-mail.';
                break;
            case 'auth/invalid-email':
                mensagem = 'E-mail inválido.';
                break;
        }

        return {
            success: false,
            error: mensagem
        };
    }
}

/**
 * Verifica se o usuário atual é anônimo/visitante
 * @returns {boolean} true se for visitante
 */
function eVisitante() {
    const user = auth.currentUser;
    return user ? user.isAnonymous : false;
}

/**
 * Obtém o usuário atual
 * @returns {Object|null} Dados do usuário ou null se não estiver logado
 */
function obterUsuarioAtual() {
    const user = auth.currentUser;
    if (user) {
        return {
            uid: user.uid,
            nome: user.displayName || (user.isAnonymous ? 'Visitante' : 'Usuário'),
            email: user.email,
            foto: user.photoURL,
            emailVerificado: user.emailVerified,
            anonimo: user.isAnonymous
        };
    }
    return null;
}

/**
 * Verifica se há um usuário logado
 * @returns {boolean} true se houver usuário logado
 */
function estaLogado() {
    return auth.currentUser !== null;
}

/**
 * Listener para mudanças no estado de autenticação
 * @param {Function} callback - Função a ser chamada quando o estado mudar
 */
function observarEstadoAuth(callback) {
    auth.onAuthStateChanged((user) => {
        if (user) {
            callback({
                logado: true,
                user: {
                    uid: user.uid,
                    nome: user.displayName,
                    email: user.email,
                    foto: user.photoURL
                }
            });
        } else {
            callback({
                logado: false,
                user: null
            });
        }
    });
}
