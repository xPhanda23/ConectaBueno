// ===================================
// CONECTA BUENO - SETTINGS
// Gestão de Configurações do Usuário
// ===================================

// Aguardar Firebase estar disponível
function waitForFirebase() {
    return new Promise((resolve) => {
        if (window.auth && window.db) {
            resolve();
        } else {
            const checkInterval = setInterval(() => {
                if (window.auth && window.db) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
        }
    });
}

// ===================================
// VARIÁVEIS GLOBAIS
// ===================================

let currentUser = null;
let userProfile = null;
let auth, db, storage;

// ===================================
// INICIALIZAÇÃO
// ===================================

window.addEventListener('load', async () => {
    console.log('🔧 Inicializando Configurações...');
    
    // Aguardar Firebase estar disponível
    await waitForFirebase();
    
    // Obter referências
    auth = window.auth;
    db = window.db;
    
    // Não usar Storage (alternativa com base64 no Firestore)
    storage = null;
    
    auth.onAuthStateChanged(async (user) => {
        if (user && !user.isAnonymous) {
            currentUser = user;
            console.log('✅ Usuário autenticado:', user.email);
            await loadUserProfile();
            hideLoading();
        } else {
            console.log('❌ Configurações exigem uma conta permanente — redirecionando para login');
            window.location.href = 'login.html';
        }
    });
});


// ===================================
// CARREGAR PERFIL DO USUÁRIO
// ===================================

async function loadUserProfile() {
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        
        if (userDoc.exists) {
            userProfile = userDoc.data();
            console.log('👤 Perfil carregado:', userProfile);

            // Preencher dados da conta
            document.getElementById('inputNome').value = userProfile.nome || '';
            document.getElementById('inputEmail').value = currentUser.email || '';

            // Foto de perfil (sem validação que trava)
            updatePhotoDisplay(userProfile.photoURL);
        }

        // Refletir os dados no menu do usuário (avatar/nome/e-mail no header)
        syncHeaderUser();
    } catch (error) {
        console.error('❌ Erro ao carregar perfil:', error);
        showToast('Erro ao carregar perfil', 'error');
    }
}

function syncHeaderUser() {
    if (!window.sharedComponents || !currentUser) return;

    window.sharedComponents.renderUserInfo({
        nome: userProfile?.nome || currentUser.email?.split('@')[0] || 'Usuário',
        email: currentUser.email,
        photoURL: userProfile?.photoURL,
        isAdmin: userProfile?.isAdmin
    });
}

function updatePhotoDisplay(photoURL) {
    const photoInitials = document.getElementById('photoInitials');
    const photoPreview = document.getElementById('photoPreview');
    
    if (photoURL) {
        // Verificar se é base64 ou URL
        if (photoURL.startsWith('data:image')) {
            // É base64 - mostrar diretamente
            photoPreview.src = photoURL;
            photoPreview.style.display = 'block';
            photoInitials.style.display = 'none';
        } else {
            // É URL - tentar carregar (com fallback)
            photoPreview.onerror = function() {
                console.warn('⚠️ Erro ao carregar foto, usando iniciais');
                photoPreview.style.display = 'none';
                photoInitials.style.display = 'flex';
            };
            
            photoPreview.onload = function() {
                photoPreview.style.display = 'block';
                photoInitials.style.display = 'none';
            };
            
            photoPreview.src = photoURL;
        }
    } else {
        const initials = getInitials(userProfile?.nome || currentUser.email);
        photoInitials.textContent = initials;
        photoInitials.style.display = 'flex';
        photoPreview.style.display = 'none';
    }
}

function getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
}

// ===================================
// NAVEGAÇÃO ENTRE ABAS
// ===================================

const SECTION_TITLES = {
    'conta':          { title: 'Informações da Conta', subtitle: 'Gerencie seus dados pessoais e foto de perfil' },
    'seguranca':      { title: 'Segurança', subtitle: 'Proteja sua conta com uma senha forte' },
    'passaporte':     { title: 'Meu Passaporte Cultural', subtitle: 'Acompanhe os lugares que você já visitou' },
    'privacidade':    { title: 'Privacidade & Dados', subtitle: 'Gerencie seus dados conforme a LGPD' }
};

// Carrega só na primeira vez que a aba é aberta — evita ler o
// Firestore de novo a cada troca de aba.
let passaporteCarregado = false;
async function carregarPassaporteSeNecessario() {
    if (passaporteCarregado) return;
    const container = document.getElementById('passaporteContainer');
    if (!container || !window.CBPassport || !currentUser) return;

    if (currentUser.isAnonymous) {
        container.innerHTML = '<p class="pp-empty">Entre com uma conta permanente para acompanhar seu passaporte cultural.</p>';
        return;
    }

    passaporteCarregado = true;
    try {
        const [visitas, activeSpaces] = await Promise.all([
            window.CBPassport.fetchVisitas(currentUser.uid),
            window.CBPassport.fetchActiveSpaces()
        ]);
        window.CBPassport.renderPassportInto(container, { visitas, activeSpaces });
    } catch {
        passaporteCarregado = false;
        container.innerHTML = '<p class="pp-empty">Não foi possível carregar seu passaporte agora.</p>';
    }
}

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        const targetSection = item.dataset.section;

        // Atualizar itens ativos
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        // Mostrar conteúdo
        document.querySelectorAll('.section-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`section-${targetSection}`).classList.add('active');

        // Atualizar título do cabeçalho
        const info = SECTION_TITLES[targetSection] || SECTION_TITLES['conta'];
        document.getElementById('sectionTitle').textContent = info.title;
        document.getElementById('sectionSubtitle').textContent = info.subtitle;

        if (targetSection === 'passaporte') carregarPassaporteSeNecessario();

        // No mobile a sidebar é uma gaveta sobreposta: fecha após escolher a seção
        closeSectionMenu();
    });
});

// ===================================
// MENU TOGGLE MOBILE (gaveta off-canvas, mesmo padrão do Observatório)
// ===================================

function closeSectionMenu() {
    document.getElementById('settingsSidebar')?.classList.remove('active');
    document.getElementById('settingsSidebarBackdrop')?.classList.remove('active');
    document.getElementById('btnMenuToggle')?.setAttribute('aria-expanded', 'false');
}

const btnMenuToggle = document.getElementById('btnMenuToggle');
const settingsBackdrop = document.getElementById('settingsSidebarBackdrop');

if (btnMenuToggle) {
    btnMenuToggle.addEventListener('click', () => {
        const isOpen = document.getElementById('settingsSidebar').classList.toggle('active');
        settingsBackdrop?.classList.toggle('active', isOpen);
        btnMenuToggle.setAttribute('aria-expanded', String(isOpen));
    });
}

settingsBackdrop?.addEventListener('click', closeSectionMenu);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSectionMenu();
});

// ===================================
// UPLOAD DE FOTO
// ===================================

document.getElementById('btnUploadPhoto').addEventListener('click', () => {
    document.getElementById('photoInput').click();
});

document.getElementById('photoInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Validar tipo
    if (!file.type.startsWith('image/')) {
        showToast('Por favor, selecione uma imagem', 'error');
        return;
    }
    
    // Limite de 5MB para arquivo original
    if (file.size > 5 * 1024 * 1024) {
        showToast('A imagem deve ter no máximo 5MB', 'error');
        return;
    }
    
    try {
        showLoading();
        
        // Comprimir e converter para base64
        const base64 = await compressAndConvertImage(file);
        
        // Salvar APENAS no Firestore (Auth tem limite de tamanho)
        await db.collection('users').doc(currentUser.uid).update({ 
            photoURL: base64 
        });
        
        // Atualizar perfil local
        if (userProfile) {
            userProfile.photoURL = base64;
        }
        
        updatePhotoDisplay(base64);
        syncHeaderUser();
        showToast('Foto atualizada com sucesso!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao fazer upload:', error);
        showToast('Erro ao atualizar foto: ' + (error.message || 'Tente uma imagem menor'), 'error');
    } finally {
        hideLoading();
        e.target.value = '';
    }
});

// Função para comprimir e converter imagem
function compressAndConvertImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const img = new Image();
            
            img.onload = () => {
                // Canvas para redimensionar
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Tamanho máximo 400x400 (suficiente para perfil)
                let width = img.width;
                let height = img.height;
                const maxSize = 400;
                
                if (width > height) {
                    if (width > maxSize) {
                        height = height * (maxSize / width);
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width = width * (maxSize / height);
                        height = maxSize;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                
                // Desenhar imagem redimensionada
                ctx.drawImage(img, 0, 0, width, height);
                
                // Converter para base64 com qualidade 0.8
                const base64 = canvas.toDataURL('image/jpeg', 0.8);
                
                // Verificar tamanho final (Firestore tem limite de 1MB por campo)
                if (base64.length > 1000000) {
                    reject(new Error('Imagem muito grande mesmo após compressão'));
                } else {
                    resolve(base64);
                }
            };
            
            img.onerror = () => reject(new Error('Erro ao carregar imagem'));
            img.src = e.target.result;
        };
        
        reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
        reader.readAsDataURL(file);
    });
}

document.getElementById('btnRemovePhoto').addEventListener('click', async () => {
    if (!userProfile || !userProfile.photoURL) {
        showToast('Nenhuma foto para remover', 'info');
        return;
    }
    
    try {
        showLoading();
        
        // Atualizar apenas Firestore (Auth não armazena base64 grande)
        await db.collection('users').doc(currentUser.uid).update({ 
            photoURL: firebase.firestore.FieldValue.delete() 
        });
        
        // Atualizar perfil local
        if (userProfile) {
            userProfile.photoURL = null;
        }
        
        updatePhotoDisplay(null);
        syncHeaderUser();
        showToast('Foto removida com sucesso!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao remover foto:', error);
        showToast('Erro ao remover foto', 'error');
    } finally {
        hideLoading();
    }
});


// ===================================
// ATUALIZAR CONTA
// ===================================

document.getElementById('formConta').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const nome = document.getElementById('inputNome').value.trim();
    const email = document.getElementById('inputEmail').value.trim();
    
    if (!nome || !email) {
        showToast('Preencha todos os campos', 'error');
        return;
    }
    
    try {
        showLoading();
        
        // Atualizar nome no Firestore
        await db.collection('users').doc(currentUser.uid).update({ nome });
        
        // Atualizar email se foi alterado
        if (email !== currentUser.email) {
            await currentUser.updateEmail(email);
        }
        
        // Atualizar perfil local
        userProfile.nome = nome;
        syncHeaderUser();

        showToast('Dados atualizados com sucesso!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao atualizar conta:', error);
        
        if (error.code === 'auth/requires-recent-login') {
            showToast('Por segurança, faça login novamente para alterar o e-mail', 'error');
        } else {
            showToast('Erro ao atualizar dados', 'error');
        }
    } finally {
        hideLoading();
    }
});

// ===================================
// ALTERAR SENHA
// ===================================

document.getElementById('formSenha').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const senhaAtual = document.getElementById('inputSenhaAtual').value;
    const novaSenha = document.getElementById('inputNovaSenha').value;
    const confirmarSenha = document.getElementById('inputConfirmarSenha').value;
    
    if (!senhaAtual || !novaSenha || !confirmarSenha) {
        showToast('Preencha todos os campos', 'error');
        return;
    }
    
    if (novaSenha !== confirmarSenha) {
        showToast('As senhas não coincidem', 'error');
        return;
    }
    
    if (novaSenha.length < 6) {
        showToast('A senha deve ter no mínimo 6 caracteres', 'error');
        return;
    }
    
    try {
        showLoading();
        
        // Reautenticar usuário
        const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, senhaAtual);
        await currentUser.reauthenticateWithCredential(credential);
        
        // Atualizar senha
        await currentUser.updatePassword(novaSenha);
        
        // Limpar campos
        document.getElementById('formSenha').reset();
        
        showToast('Senha atualizada com sucesso!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao alterar senha:', error);
        
        if (error.code === 'auth/wrong-password') {
            showToast('Senha atual incorreta', 'error');
        } else {
            showToast('Erro ao atualizar senha', 'error');
        }
    } finally {
        hideLoading();
    }
});

// Toggle password visibility
document.querySelectorAll('.btn-toggle-password').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);
        
        if (input.type === 'password') {
            input.type = 'text';
        } else {
            input.type = 'password';
        }
    });
});


// ===================================
// EXPORTAR DADOS (LGPD)
// ===================================

document.getElementById('btnExportarDados').addEventListener('click', async () => {
    try {
        showLoading();
        
        // Coletar todos os dados do usuário
        const userData = {
            perfil: userProfile,
            autenticacao: {
                uid: currentUser.uid,
                email: currentUser.email,
                emailVerificado: currentUser.emailVerified,
                dataCriacao: currentUser.metadata.creationTime,
                ultimoLogin: currentUser.metadata.lastSignInTime
            }
        };
        
        // Criar arquivo JSON
        const blob = new Blob([JSON.stringify(userData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `conecta-bueno-dados-${currentUser.uid}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        showToast('Dados exportados com sucesso!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao exportar dados:', error);
        showToast('Erro ao exportar dados', 'error');
    } finally {
        hideLoading();
    }
});


// ===================================
// EXCLUIR CONTA (LGPD)
// ===================================

document.getElementById('btnExcluirConta').addEventListener('click', () => {
    showModal(
        'Excluir Conta Permanentemente',
        'Esta ação é irreversível. Todos os seus dados serão permanentemente excluídos. Deseja continuar?',
        async () => {
            try {
                showLoading();

                // Firestore não cascateia a exclusão de subcoleções — sem
                // isto, favoritos/lugares, favoritos/eventos e visitas/*
                // (selos do passaporte cultural) ficam órfãos, presos sob
                // um uid que não existe mais.
                const userRef = db.collection('users').doc(currentUser.uid);
                const batch = db.batch();
                batch.delete(userRef.collection('favoritos').doc('lugares'));
                batch.delete(userRef.collection('favoritos').doc('eventos'));
                const visitasSnap = await userRef.collection('visitas').get();
                visitasSnap.forEach(doc => batch.delete(doc.ref));
                batch.delete(userRef);
                await batch.commit();
                console.log('✅ Documento Firestore e subcoleções removidos');
                
                // Excluir conta do Firebase Auth
                await currentUser.delete();
                console.log('✅ Conta Auth removida');
                
                showToast('Conta excluída com sucesso', 'success');
                
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 2000);
                
            } catch (error) {
                console.error('❌ Erro ao excluir conta:', error);
                
                if (error.code === 'auth/requires-recent-login') {
                    showToast('Por segurança, faça login novamente para excluir sua conta', 'error');
                    setTimeout(() => {
                        window.location.href = 'login.html';
                    }, 2000);
                } else {
                    showToast('Erro ao excluir conta', 'error');
                }
            } finally {
                hideLoading();
            }
        }
    );
});

// ===================================
// MODAL DE CONFIRMAÇÃO
// ===================================

let modalCallback = null;

function showModal(title, message, onConfirm) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMessage').textContent = message;
    document.getElementById('modalOverlay').classList.add('active');
    modalCallback = onConfirm;
}

function hideModal() {
    document.getElementById('modalOverlay').classList.remove('active');
    modalCallback = null;
}

document.getElementById('btnCancelar').addEventListener('click', hideModal);

document.getElementById('btnConfirmar').addEventListener('click', () => {
    if (modalCallback) {
        modalCallback();
        hideModal();
    }
});

document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        hideModal();
    }
});


// ===================================
// TOAST NOTIFICATIONS
// ===================================

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '✓',
        error: '✕',
        info: 'ℹ',
        warning: '⚠'
    };
    
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${message}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ===================================
// LOADING
// ===================================

function showLoading() {
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

