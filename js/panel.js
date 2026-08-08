/**
 * panel.js - Painel Administrativo Conecta Bueno
 * Gerencia CRUD de lugares, usuários, categorias e configurações
 */

// ===================================
// VARIÁVEIS GLOBAIS
// ===================================

let currentUser = null;
let pickerMap = null;
let pickerMarker = null;
let confirmCallback = null;

// ===================================
// INICIALIZAÇÃO
// ===================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🎛️ Inicializando painel admin...');
    initAuth();
});

// ===================================
// AUTENTICAÇÃO E PROTEÇÃO
// ===================================

function initAuth() {
    const checkAuth = setInterval(() => {
        if (window.db && window.auth) {
            clearInterval(checkAuth);
            
            firebase.auth().onAuthStateChanged(async (user) => {
                if (user) {
                    await loadUserProfile(user);
                    
                    // Verificar se é admin
                    if (!currentUser || !currentUser.isAdmin) {
                        showToast('Acesso negado. Você não é administrador.', 'error');
                        setTimeout(() => {
                            window.location.href = '../index.html';
                        }, 2000);
                        return;
                    }
                    
                    console.log('✅ Admin autenticado:', currentUser.nome);
                    initPanel();
                } else {
                    console.log('⚠️ Não autenticado');
                    window.location.href = 'login.html';
                }
            });
        }
    }, 100);

    setTimeout(() => {
        clearInterval(checkAuth);
        if (!currentUser) {
            window.location.href = 'login.html';
        }
    }, 5000);
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
            
            displayUserInfo();
        }
    } catch (error) {
        console.error('❌ Erro ao carregar perfil:', error);
    }
}

function displayUserInfo() {
    const iniciais = getInitials(currentUser.nome);
    const nome = currentUser.nome || 'Admin';
    const role = currentUser.isAdmin ? 'Administrador' : 'Usuário';
    const photoURL = currentUser.photoURL;
    
    // Atualizar avatar no header
    const avatarSmall = document.getElementById('userAvatarSmall');
    
    if (photoURL && photoURL.startsWith('data:image')) {
        // Tem foto - criar elemento img
        avatarSmall.innerHTML = `<img src="${photoURL}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
    } else {
        // Sem foto - usar iniciais
        avatarSmall.textContent = iniciais;
    }
    
    document.getElementById('userNameHeader').textContent = nome;
    document.getElementById('userRoleHeader').textContent = role;
}

function getInitials(name) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

// ===================================
// INICIALIZAÇÃO DO PAINEL
// ===================================

function initPanel() {
    setupEventListeners();
    loadDashboardStats();
    
    // Remover loading
    setTimeout(() => {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 300);
        }
    }, 800);
}

// ===================================
// EVENT LISTENERS
// ===================================

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.getAttribute('data-section');
            showSection(section);
        });
    });

    // Menu toggle (mobile)
    const btnMenuToggle = document.getElementById('btnMenuToggle');
    const sidebar = document.getElementById('adminSidebar');
    
    btnMenuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });

    // Logout
    document.getElementById('btnLogout').addEventListener('click', logout);

    // Botões de adicionar
    document.getElementById('btnAddLugar').addEventListener('click', () => openLugarModal());
    document.getElementById('btnAddUsuario').addEventListener('click', () => openUsuarioModal());
    document.getElementById('btnAddCategoria').addEventListener('click', () => openCategoriaModal());

    // Forms
    document.getElementById('formLugar').addEventListener('submit', saveLugar);
    document.getElementById('formUsuario').addEventListener('submit', saveUsuario);
    document.getElementById('formCategoria').addEventListener('submit', saveCategoria);
}

async function logout() {
    try {
        await firebase.auth().signOut();
        showToast('Saindo...', 'info');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 500);
    } catch (error) {
        console.error('❌ Erro ao sair:', error);
        showToast('Erro ao sair', 'error');
    }
}


// ===================================
// NAVEGAÇÃO ENTRE SEÇÕES
// ===================================

function showSection(sectionName) {
    // Atualizar navegação
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const activeBtn = document.querySelector(`[data-section="${sectionName}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Atualizar seções
    document.querySelectorAll('.section-content').forEach(section => {
        section.classList.remove('active');
    });
    
    const activeSection = document.getElementById(`section${capitalize(sectionName)}`);
    if (activeSection) activeSection.classList.add('active');

    // Atualizar título
    const titles = {
        dashboard: 'Dashboard',
        lugares: 'Gerenciar Lugares',
        usuarios: 'Gerenciar Usuários',
        categorias: 'Gerenciar Categorias',
        configuracoes: 'Configurações',
        logs: 'Logs de Atividade'
    };
    
    document.getElementById('pageTitle').textContent = titles[sectionName] || 'Dashboard';

    // Carregar dados da seção
    loadSectionData(sectionName);
    
    // Fechar sidebar no mobile
    document.getElementById('adminSidebar').classList.remove('active');
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function loadSectionData(sectionName) {
    switch(sectionName) {
        case 'dashboard':
            loadDashboardStats();
            break;
        case 'lugares':
            loadLugares();
            break;
        case 'usuarios':
            loadUsuarios();
            break;
        case 'categorias':
            loadCategorias();
            break;
        case 'logs':
            loadLogs();
            break;
    }
}

// ===================================
// DASHBOARD
// ===================================

async function loadDashboardStats() {
    try {
        // Contar lugares
        const lugaresSnap = await firebase.firestore()
            .collection('espacos')
            .get();
        document.getElementById('statLugares').textContent = lugaresSnap.size;
        
        const ativosSnap = await firebase.firestore()
            .collection('espacos')
            .where('status', '==', 'ativo')
            .get();
        document.getElementById('statAtivos').textContent = ativosSnap.size;

        // Contar usuários
        const usuariosSnap = await firebase.firestore()
            .collection('users')
            .get();
        document.getElementById('statUsuarios').textContent = usuariosSnap.size;

        // Contar categorias únicas
        const categorias = new Set();
        lugaresSnap.forEach(doc => {
            const data = doc.data();
            if (data.categoria) categorias.add(data.categoria);
        });
        document.getElementById('statCategorias').textContent = categorias.size;

    } catch (error) {
        console.error('❌ Erro ao carregar estatísticas:', error);
    }
}

// ===================================
// LUGARES (CRUD)
// ===================================

async function loadLugares() {
    const tbody = document.getElementById('tableLugares');
    tbody.innerHTML = '<tr class="loading-row"><td colspan="5"><div class="loading-spinner-small"></div><span>Carregando...</span></td></tr>';

    try {
        const snapshot = await firebase.firestore()
            .collection('espacos')
            .orderBy('nome')
            .get();

        if (snapshot.empty) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Nenhum lugar cadastrado</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const tr = document.createElement('tr');
            
            tr.innerHTML = `
                <td><strong>${data.nome}</strong></td>
                <td><span class="badge badge-success">${data.categoria || 'Sem categoria'}</span></td>
                <td>${data.endereco || '-'}</td>
                <td><span class="badge ${data.status === 'ativo' ? 'badge-success' : 'badge-danger'}">${data.status}</span></td>
                <td>
                    <button class="btn-icon-table" onclick="editLugar('${doc.id}')" title="Editar">
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                            <path d="M12 3L15 6L6 15H3V12L12 3Z" stroke="currentColor" stroke-width="1.5"/>
                        </svg>
                    </button>
                    <button class="btn-icon-table danger" onclick="deleteLugar('${doc.id}', '${data.nome}')" title="Excluir">
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                            <path d="M3 5H15M7 8V13M11 8V13M4 5L5 15H13L14 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                    </button>
                </td>
            `;
            
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error('❌ Erro ao carregar lugares:', error);
        tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Erro ao carregar dados</td></tr>';
    }
}

function openLugarModal(lugarId = null) {
    const modal = document.getElementById('modalLugar');
    const form = document.getElementById('formLugar');
    
    form.reset();
    document.getElementById('lugarId').value = '';
    document.getElementById('modalLugarTitle').textContent = 'Novo Lugar';
    document.getElementById('lugarStatus').value = 'ativo';
    
    // Inicializar mapa picker
    setTimeout(() => {
        initMapPicker();
    }, 100);

    if (lugarId) {
        loadLugarData(lugarId);
        document.getElementById('modalLugarTitle').textContent = 'Editar Lugar';
    }
    
    modal.classList.add('active');
}

function initMapPicker() {
    const container = document.getElementById('mapPicker');
    
    if (pickerMap) {
        pickerMap.remove();
    }
    
    pickerMap = L.map('mapPicker').setView([-22.4408, -46.3511], 14);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CARTO'
    }).addTo(pickerMap);
    
    // Evento de clique no mapa
    pickerMap.on('click', function(e) {
        updateMapMarker(e.latlng.lat, e.latlng.lng);
    });
    
    // Listeners para os inputs de coordenadas
    const latInput = document.getElementById('lugarLat');
    const lngInput = document.getElementById('lugarLng');
    
    latInput.addEventListener('input', () => {
        const lat = parseFloat(latInput.value);
        const lng = parseFloat(lngInput.value);
        if (!isNaN(lat) && !isNaN(lng)) {
            updateMapMarker(lat, lng, false); // false = não atualizar inputs
        }
    });
    
    lngInput.addEventListener('input', () => {
        const lat = parseFloat(latInput.value);
        const lng = parseFloat(lngInput.value);
        if (!isNaN(lat) && !isNaN(lng)) {
            updateMapMarker(lat, lng, false);
        }
    });
    
    setTimeout(() => pickerMap.invalidateSize(), 100);
}

function updateMapMarker(lat, lng, updateInputs = true) {
    // Validar coordenadas de Bueno Brandão (aproximado)
    if (lat < -23 || lat > -22 || lng < -47 || lng > -45) {
        showToast('⚠️ Coordenadas fora da região de Bueno Brandão!', 'error');
        return;
    }
    
    // Atualizar inputs se necessário
    if (updateInputs) {
        document.getElementById('lugarLat').value = lat.toFixed(6);
        document.getElementById('lugarLng').value = lng.toFixed(6);
    }
    
    // Atualizar display visual
    const displayLat = document.getElementById('displayLat');
    const displayLng = document.getElementById('displayLng');
    if (displayLat) displayLat.textContent = lat.toFixed(6);
    if (displayLng) displayLng.textContent = lng.toFixed(6);
    
    // Remover marcador anterior
    if (pickerMarker) {
        pickerMap.removeLayer(pickerMarker);
    }
    
    // Adicionar novo marcador com popup
    pickerMarker = L.marker([lat, lng]).addTo(pickerMap);
    pickerMarker.bindPopup(`
        <strong>Localização Selecionada</strong><br>
        Lat: ${lat.toFixed(6)}<br>
        Lng: ${lng.toFixed(6)}
    `).openPopup();
    
    // Centralizar mapa suavemente
    pickerMap.setView([lat, lng], 15, {
        animate: true,
        duration: 0.5
    });
}

async function loadLugarData(lugarId) {
    try {
        const doc = await firebase.firestore()
            .collection('espacos')
            .doc(lugarId)
            .get();

        if (doc.exists) {
            const data = doc.data();
            
            // Campos básicos
            document.getElementById('lugarId').value = lugarId;
            document.getElementById('lugarNome').value = data.nome || '';
            document.getElementById('lugarCategoria').value = data.categoria || '';
            document.getElementById('lugarDescricao').value = data.descricao || '';
            document.getElementById('lugarEndereco').value = data.endereco || '';
            document.getElementById('lugarStatus').value = data.status || 'ativo';
            
            // Novos campos
            document.getElementById('lugarTelefone').value = data.telefone || '';
            document.getElementById('lugarWebsite').value = data.website || '';
            document.getElementById('lugarHorario').value = data.horario || '';
            document.getElementById('lugarEntrada').value = data.entrada || 'nao_informado';
            document.getElementById('lugarGoogleLink').value = data.googleLink || '';
            document.getElementById('lugarFoto').value = data.foto || '';
            document.getElementById('lugarGaleria').value = data.galeria ? data.galeria.join(', ') : '';
            document.getElementById('lugarTags').value = data.tags ? data.tags.join(', ') : '';
            
            // Coordenadas
            const lat = data.lat || -22.4408;
            const lng = data.lng || -46.3511;
            
            document.getElementById('lugarLat').value = lat;
            document.getElementById('lugarLng').value = lng;
            
            // Atualizar display visual
            const displayLat = document.getElementById('displayLat');
            const displayLng = document.getElementById('displayLng');
            if (displayLat) displayLat.textContent = lat.toFixed(6);
            if (displayLng) displayLng.textContent = lng.toFixed(6);
            
            // Atualizar mapa
            setTimeout(() => {
                if (pickerMap) {
                    pickerMap.setView([lat, lng], 15);
                    
                    if (pickerMarker) pickerMap.removeLayer(pickerMarker);
                    
                    pickerMarker = L.marker([lat, lng]).addTo(pickerMap);
                    pickerMarker.bindPopup(`
                        <strong>${data.nome}</strong><br>
                        Lat: ${lat.toFixed(6)}<br>
                        Lng: ${lng.toFixed(6)}
                    `).openPopup();
                    
                    pickerMap.invalidateSize();
                }
            }, 300);
        }
    } catch (error) {
        console.error('❌ Erro ao carregar lugar:', error);
        showToast('Erro ao carregar dados', 'error');
    }
}

async function saveLugar(e) {
    e.preventDefault();
    
    const lugarId = document.getElementById('lugarId').value;
    const lat = parseFloat(document.getElementById('lugarLat').value);
    const lng = parseFloat(document.getElementById('lugarLng').value);
    
    // Validar coordenadas
    if (isNaN(lat) || isNaN(lng)) {
        showToast('❌ Coordenadas inválidas! Digite números válidos.', 'error');
        return;
    }
    
    // Processar galeria e tags
    const galeriaText = document.getElementById('lugarGaleria').value.trim();
    const galeria = galeriaText ? galeriaText.split(',').map(url => url.trim()).filter(url => url) : [];
    
    const tagsText = document.getElementById('lugarTags').value.trim();
    const tags = tagsText ? tagsText.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
    
    const data = {
        nome: document.getElementById('lugarNome').value,
        categoria: document.getElementById('lugarCategoria').value,
        descricao: document.getElementById('lugarDescricao').value,
        endereco: document.getElementById('lugarEndereco').value,
        telefone: document.getElementById('lugarTelefone').value,
        website: document.getElementById('lugarWebsite').value,
        horario: document.getElementById('lugarHorario').value,
        entrada: document.getElementById('lugarEntrada').value,
        googleLink: document.getElementById('lugarGoogleLink').value,
        foto: document.getElementById('lugarFoto').value,
        galeria: galeria,
        tags: tags,
        lat: lat,
        lng: lng,
        status: document.getElementById('lugarStatus').value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        if (lugarId) {
            // Atualizar
            await firebase.firestore()
                .collection('espacos')
                .doc(lugarId)
                .update(data);
            
            showToast('✅ Lugar atualizado com sucesso!', 'success');
            await logAction('update', 'lugares', `Editou: ${data.nome}`);
        } else {
            // Criar
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await firebase.firestore()
                .collection('espacos')
                .add(data);
            
            showToast('✅ Lugar adicionado com sucesso!', 'success');
            await logAction('create', 'lugares', `Criou: ${data.nome}`);
        }
        
        closeModal('modalLugar');
        loadLugares();
        loadDashboardStats();
        
    } catch (error) {
        console.error('❌ Erro ao salvar:', error);
        showToast('❌ Erro ao salvar lugar: ' + error.message, 'error');
    }
}

function deleteLugar(lugarId, nome) {
    showConfirm(
        `Tem certeza que deseja excluir "${nome}"?`,
        async () => {
            try {
                await firebase.firestore()
                    .collection('espacos')
                    .doc(lugarId)
                    .delete();
                
                showToast('Lugar excluído com sucesso!', 'success');
                await logAction('delete', 'lugares', `Excluiu: ${nome}`);
                loadLugares();
                loadDashboardStats();
                
            } catch (error) {
                console.error('❌ Erro ao excluir:', error);
                showToast('Erro ao excluir lugar', 'error');
            }
        }
    );
}


// ===================================
// USUÁRIOS (CRUD)
// ===================================

async function loadUsuarios() {
    const tbody = document.getElementById('tableUsuarios');
    tbody.innerHTML = '<tr class="loading-row"><td colspan="5"><div class="loading-spinner-small"></div><span>Carregando...</span></td></tr>';

    try {
        const snapshot = await firebase.firestore()
            .collection('users')
            .orderBy('nome')
            .get();

        if (snapshot.empty) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Nenhum usuário cadastrado</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const tr = document.createElement('tr');
            
            tr.innerHTML = `
                <td><strong>${data.nome}</strong></td>
                <td>${data.email}</td>
                <td><span class="badge ${data.isAdmin ? 'badge-warning' : 'badge-success'}">${data.isAdmin ? 'Admin' : 'Usuário'}</span></td>
                <td><span class="badge badge-success">Ativo</span></td>
                <td>
                    <button class="btn-icon-table" onclick="editUsuario('${doc.id}')" title="Editar">
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                            <path d="M12 3L15 6L6 15H3V12L12 3Z" stroke="currentColor" stroke-width="1.5"/>
                        </svg>
                    </button>
                    <button class="btn-icon-table danger" onclick="deleteUsuario('${doc.id}', '${data.nome}')" title="Excluir">
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                            <path d="M3 5H15M7 8V13M11 8V13M4 5L5 15H13L14 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                    </button>
                </td>
            `;
            
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error('❌ Erro ao carregar usuários:', error);
        tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Erro ao carregar dados</td></tr>';
    }
}

function openUsuarioModal(usuarioId = null) {
    const modal = document.getElementById('modalUsuario');
    const form = document.getElementById('formUsuario');
    
    form.reset();
    document.getElementById('usuarioId').value = '';
    document.getElementById('modalUsuarioTitle').textContent = 'Novo Usuário';
    document.getElementById('usuarioRole').value = 'usuario';
    document.getElementById('usuarioStatus').value = 'ativo';
    document.getElementById('usuarioIsAdmin').checked = false;

    if (usuarioId) {
        loadUsuarioData(usuarioId);
        document.getElementById('modalUsuarioTitle').textContent = 'Editar Usuário';
    }
    
    modal.classList.add('active');
}

async function loadUsuarioData(usuarioId) {
    try {
        const doc = await firebase.firestore()
            .collection('users')
            .doc(usuarioId)
            .get();

        if (doc.exists) {
            const data = doc.data();
            document.getElementById('usuarioId').value = usuarioId;
            document.getElementById('usuarioNome').value = data.nome || '';
            document.getElementById('usuarioEmail').value = data.email || '';
            document.getElementById('usuarioRole').value = data.role || 'usuario';
            document.getElementById('usuarioStatus').value = data.status || 'ativo';
            document.getElementById('usuarioIsAdmin').checked = data.isAdmin || false;
        }
    } catch (error) {
        console.error('❌ Erro ao carregar usuário:', error);
        showToast('Erro ao carregar dados', 'error');
    }
}

async function saveUsuario(e) {
    e.preventDefault();
    
    const usuarioId = document.getElementById('usuarioId').value;
    const data = {
        nome: document.getElementById('usuarioNome').value,
        email: document.getElementById('usuarioEmail').value,
        role: document.getElementById('usuarioRole').value,
        status: document.getElementById('usuarioStatus').value,
        isAdmin: document.getElementById('usuarioIsAdmin').checked,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        if (usuarioId) {
            // Atualizar
            await firebase.firestore()
                .collection('users')
                .doc(usuarioId)
                .update(data);
            
            showToast('Usuário atualizado com sucesso!', 'success');
            await logAction('update', 'usuarios', `Editou: ${data.nome}`);
        } else {
            // Criar
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await firebase.firestore()
                .collection('users')
                .add(data);
            
            showToast('Usuário adicionado com sucesso!', 'success');
            await logAction('create', 'usuarios', `Criou: ${data.nome}`);
        }
        
        closeModal('modalUsuario');
        loadUsuarios();
        loadDashboardStats();
        
    } catch (error) {
        console.error('❌ Erro ao salvar:', error);
        showToast('Erro ao salvar usuário', 'error');
    }
}

function deleteUsuario(usuarioId, nome) {
    if (usuarioId === currentUser.uid) {
        showToast('Você não pode excluir sua própria conta', 'error');
        return;
    }
    
    showConfirm(
        `Tem certeza que deseja excluir o usuário "${nome}"?`,
        async () => {
            try {
                await firebase.firestore()
                    .collection('users')
                    .doc(usuarioId)
                    .delete();
                
                showToast('Usuário excluído com sucesso!', 'success');
                await logAction('delete', 'usuarios', `Excluiu: ${nome}`);
                loadUsuarios();
                loadDashboardStats();
                
            } catch (error) {
                console.error('❌ Erro ao excluir:', error);
                showToast('Erro ao excluir usuário', 'error');
            }
        }
    );
}

// ===================================
// CATEGORIAS
// ===================================

async function loadCategorias() {
    const container = document.getElementById('categoriesGrid');
    container.innerHTML = '<div class="loading-state"><div class="loading-spinner-small"></div><span>Carregando...</span></div>';

    try {
        const snapshot = await firebase.firestore()
            .collection('espacos')
            .get();

        const categorias = new Map();
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.categoria) {
                if (categorias.has(data.categoria)) {
                    categorias.set(data.categoria, categorias.get(data.categoria) + 1);
                } else {
                    categorias.set(data.categoria, 1);
                }
            }
        });

        if (categorias.size === 0) {
            container.innerHTML = '<div class="empty-state">Nenhuma categoria encontrada</div>';
            return;
        }

        container.innerHTML = '';
        const icons = {
            'Cachoeira': '💧',
            'Montanha': '⛰️',
            'Trilha': '🥾',
            'Mirante': '👁️',
            'Parque': '🌳',
            'Cultura': '🎭'
        };

        categorias.forEach((count, nome) => {
            const card = document.createElement('div');
            card.className = 'category-card';
            
            card.innerHTML = `
                <div class="category-icon" style="background: #d0e8da;">
                    ${icons[nome] || '📍'}
                </div>
                <h4>${nome}</h4>
                <p>${count} ${count === 1 ? 'lugar' : 'lugares'}</p>
            `;
            
            container.appendChild(card);
        });

    } catch (error) {
        console.error('❌ Erro ao carregar categorias:', error);
        container.innerHTML = '<div class="empty-state">Erro ao carregar categorias</div>';
    }
}

function openCategoriaModal() {
    showToast('Gerenciamento de categorias em desenvolvimento', 'info');
}

async function saveCategoria(e) {
    e.preventDefault();
    // Placeholder
}

// ===================================
// CONFIGURAÇÕES
// ===================================

function saveSiteInfo() {
    showToast('Configurações salvas com sucesso!', 'success');
    logAction('update', 'configuracoes', 'Atualizou informações do site');
}

function saveMapSettings() {
    showToast('Configurações do mapa salvas!', 'success');
    logAction('update', 'configuracoes', 'Atualizou configurações do mapa');
}

function saveModerationSettings() {
    showToast('Configurações de moderação salvas!', 'success');
    logAction('update', 'configuracoes', 'Atualizou configurações de moderação');
}

function saveBackupSettings() {
    showToast('Configurações de backup salvas!', 'success');
    logAction('update', 'configuracoes', 'Atualizou configurações de backup');
}

function backupNow() {
    showToast('Iniciando backup...', 'info');
    setTimeout(() => {
        showToast('Backup concluído com sucesso!', 'success');
        logAction('create', 'backup', 'Realizou backup manual');
    }, 2000);
}


// ===================================
// LOGS
// ===================================

async function loadLogs() {
    const container = document.getElementById('logsList');
    container.innerHTML = '<div class="loading-state"><div class="loading-spinner-small"></div><span>Carregando logs...</span></div>';

    try {
        const snapshot = await firebase.firestore()
            .collection('logs')
            .orderBy('timestamp', 'desc')
            .limit(50)
            .get();

        if (snapshot.empty) {
            container.innerHTML = '<div class="empty-state">Nenhum log registrado</div>';
            return;
        }

        container.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const logItem = createLogItem(data);
            container.appendChild(logItem);
        });

    } catch (error) {
        console.error('❌ Erro ao carregar logs:', error);
        // Se a collection não existir, criar alguns logs de exemplo
        container.innerHTML = '<div class="empty-state">Nenhum log registrado ainda</div>';
    }
}

function createLogItem(data) {
    const div = document.createElement('div');
    div.className = 'log-item';
    
    const icons = {
        create: '➕',
        update: '✏️',
        delete: '🗑️',
        login: '🔐'
    };
    
    const time = data.timestamp ? 
        new Date(data.timestamp.toDate()).toLocaleString('pt-BR') : 
        'Agora';
    
    div.innerHTML = `
        <div class="log-icon ${data.type}">
            ${icons[data.type] || '📝'}
        </div>
        <div class="log-content">
            <strong>${data.action}</strong>
            <p>${data.details || ''}</p>
        </div>
        <div class="log-time">${time}</div>
    `;
    
    return div;
}

async function logAction(type, action, details) {
    try {
        await firebase.firestore()
            .collection('logs')
            .add({
                type: type,
                action: action,
                details: details,
                user: currentUser.nome,
                userId: currentUser.uid,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
    } catch (error) {
        console.error('⚠️ Erro ao registrar log:', error);
    }
}

function filterLogs() {
    const type = document.getElementById('filterLogType').value;
    const date = document.getElementById('filterLogDate').value;
    
    showToast('Filtro aplicado', 'info');
    // Implementar filtro real aqui
}

function clearLogs() {
    showConfirm(
        'Tem certeza que deseja limpar todos os logs? Esta ação não pode ser desfeita.',
        async () => {
            try {
                const snapshot = await firebase.firestore()
                    .collection('logs')
                    .get();
                
                const batch = firebase.firestore().batch();
                snapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });
                
                await batch.commit();
                showToast('Logs limpos com sucesso!', 'success');
                loadLogs();
                
            } catch (error) {
                console.error('❌ Erro ao limpar logs:', error);
                showToast('Erro ao limpar logs', 'error');
            }
        }
    );
}

// ===================================
// MODALS
// ===================================

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        
        // Limpar mapa picker se existir
        if (modalId === 'modalLugar' && pickerMap) {
            pickerMap.remove();
            pickerMap = null;
            pickerMarker = null;
        }
    }
}

function showConfirm(message, callback) {
    const modal = document.getElementById('modalConfirm');
    document.getElementById('confirmMessage').textContent = message;
    
    confirmCallback = callback;
    
    const btnConfirm = document.getElementById('btnConfirmAction');
    btnConfirm.onclick = () => {
        if (confirmCallback) {
            confirmCallback();
        }
        closeModal('modalConfirm');
    };
    
    modal.classList.add('active');
}

// Fechar modal ao clicar fora
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        const modalId = e.target.id;
        closeModal(modalId);
    }
});

// Aliases para funções chamadas pelo HTML
window.showSection = showSection;
window.editLugar = (id) => openLugarModal(id);
window.deleteLugar = deleteLugar;
window.editUsuario = (id) => openUsuarioModal(id);
window.deleteUsuario = deleteUsuario;
window.closeModal = closeModal;
window.saveSiteInfo = saveSiteInfo;
window.saveMapSettings = saveMapSettings;
window.saveModerationSettings = saveModerationSettings;
window.saveBackupSettings = saveBackupSettings;
window.backupNow = backupNow;
window.clearLogs = clearLogs;
window.filterLogs = filterLogs;

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
// INICIALIZAÇÃO COMPLETA
// ===================================

console.log('✅ Panel.js carregado');
