/**
 * eventos.js - Página de Eventos Conecta Bueno
 * Exibição pública de eventos festivos
 */

// ===================================
// VARIÁVEIS GLOBAIS
// ===================================

let db;
let allEventos = [];
let filteredEventos = [];

// ===================================
// INICIALIZAÇÃO
// ===================================

window.addEventListener('load', async () => {
    console.log('🎉 Inicializando Eventos...');
    
    // Aguardar Firebase
    await waitForFirebase();
    db = window.db;
    
    // Setup
    setupEventListeners();
    await loadEventos();
    renderEventos();
});

function waitForFirebase() {
    return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
            if (window.db) {
                clearInterval(checkInterval);
                resolve();
            }
        }, 100);
        
        setTimeout(() => {
            clearInterval(checkInterval);
            if (!window.db) {
                console.error('Firebase não carregou');
            }
            resolve();
        }, 5000);
    });
}

// ===================================
// EVENT LISTENERS
// ===================================

function setupEventListeners() {
    // Filtros
    document.getElementById('filterCategoria').addEventListener('change', applyFilters);
    document.getElementById('filterPeriodo').addEventListener('change', applyFilters);
    document.getElementById('btnClearFilters').addEventListener('click', clearFilters);
}

// ===================================
// CARREGAR EVENTOS
// ===================================

async function loadEventos() {
    try {
        const snapshot = await db.collection('eventos')
            .where('status', '==', 'ativo')
            .orderBy('dataInicio', 'asc')
            .get();
        
        allEventos = [];
        snapshot.forEach(doc => {
            allEventos.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        filteredEventos = [...allEventos];
        console.log(`✅ ${allEventos.length} eventos carregados`);
        updateEventCount();
        
    } catch (error) {
        console.error('❌ Erro ao carregar eventos:', error);
        allEventos = [];
        filteredEventos = [];
        updateEventCount();
    }
}

function updateEventCount() {
    const countEl = document.getElementById('eventoCount');
    if (countEl) {
        const total = filteredEventos.length;
        countEl.textContent = total === 0 ? 'Nenhum evento encontrado' :
                             total === 1 ? '1 evento disponível' :
                             `${total} eventos disponíveis`;
    }
}

// ===================================
// RENDERIZAR EVENTOS
// ===================================

function renderEventos() {
    const grid = document.getElementById('eventosGrid');
    
    if (filteredEventos.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                    <circle cx="40" cy="40" r="36" stroke="currentColor" stroke-width="2" opacity="0.3"/>
                    <path d="M40 24V44M40 54V54.5" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
                </svg>
                <h3>Nenhum evento encontrado</h3>
                <p>Tente ajustar os filtros ou volte mais tarde</p>
            </div>
        `;
        updateEventCount();
        return;
    }
    
    grid.innerHTML = '';
    
    filteredEventos.forEach(evento => {
        const card = createEventoCard(evento);
        grid.appendChild(card);
    });
    
    updateEventCount();
}

function createEventoCard(evento) {
    const card = document.createElement('div');
    card.className = 'evento-card';
    card.onclick = () => openEventoModal(evento);
    
    const icons = {
        'festa': '🎉',
        'show': '🎵',
        'feira': '🛍️',
        'esporte': '⚽',
        'religioso': '⛪',
        'cultural': '🎭',
        'gastronomico': '🍴'
    };
    
    const dataInicio = formatDate(evento.dataInicio);
    const dataFim = evento.dataFim ? formatDate(evento.dataFim) : null;
    const dataTexto = dataFim && dataFim !== dataInicio ? `${dataInicio} - ${dataFim}` : dataInicio;
    
    card.innerHTML = `
        <div class="evento-imagem">
            ${evento.imagem ? `<img src="${evento.imagem}" alt="${evento.titulo}">` : (icons[evento.categoria] || '🎪')}
            <div class="evento-badge">${evento.categoria}</div>
        </div>
        <div class="evento-info">
            <div class="evento-data">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="2" y="3" width="12" height="11" rx="1" stroke="currentColor" stroke-width="1.5"/>
                    <path d="M5 1V3M11 1V3M2 6H14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                ${dataTexto}
            </div>
            <h3 class="evento-titulo">${evento.titulo}</h3>
            <p class="evento-descricao">${truncateText(evento.descricao, 140)}</p>
            <div class="evento-detalhes">
                ${evento.local ? `
                    <div class="evento-detalhe-item">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M8 2C6 2 4 3.5 4 5.5C4 8.5 8 14 8 14C8 14 12 8.5 12 5.5C12 3.5 10 2 8 2Z" stroke="currentColor" stroke-width="1.5"/>
                            <circle cx="8" cy="5.5" r="1.5" fill="currentColor"/>
                        </svg>
                        <span>${evento.local}</span>
                    </div>
                ` : ''}
                ${evento.horario ? `
                    <div class="evento-detalhe-item">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/>
                            <path d="M8 4V8L10 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                        <span>${evento.horario}</span>
                    </div>
                ` : ''}
                ${evento.entrada ? `
                    <div class="evento-detalhe-item">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M3 8H13M10 5L13 8L10 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                        <span>${evento.entrada}</span>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
    
    return card;
}

// ===================================
// MODAL DETALHES
// ===================================

function openEventoModal(evento) {
    const modal = document.getElementById('modalEvento');
    const content = document.getElementById('modalEventoContent');
    
    const icons = {
        'festa': '🎉',
        'show': '🎵',
        'feira': '🛍️',
        'esporte': '⚽',
        'religioso': '⛪',
        'cultural': '🎭',
        'gastronomico': '🍴'
    };
    
    const dataInicio = formatDate(evento.dataInicio);
    const dataFim = evento.dataFim ? formatDate(evento.dataFim) : null;
    const dataTexto = dataFim && dataFim !== dataInicio ? `${dataInicio} até ${dataFim}` : dataInicio;
    
    content.innerHTML = `
        <div class="modal-evento-imagem">
            ${evento.imagem ? `<img src="${evento.imagem}" alt="${evento.titulo}">` : (icons[evento.categoria] || '🎪')}
        </div>
        <div class="modal-evento-info">
            <div class="modal-evento-categoria">${evento.categoria}</div>
            <h2 class="modal-evento-titulo">${evento.titulo}</h2>
            <div class="modal-evento-data">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <rect x="3" y="4" width="14" height="13" rx="1" stroke="currentColor" stroke-width="1.5"/>
                    <path d="M6 2V4M14 2V4M3 8H17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                ${dataTexto}
            </div>
            <p class="modal-evento-descricao">${evento.descricao}</p>
            
            <div class="modal-evento-detalhes">
                ${evento.local ? `
                    <div class="modal-detalhe-item">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <path d="M10 2C7.5 2 5 4 5 6.5C5 10.5 10 18 10 18C10 18 15 10.5 15 6.5C15 4 12.5 2 10 2Z" stroke="currentColor" stroke-width="1.5"/>
                            <circle cx="10" cy="6.5" r="2" fill="currentColor"/>
                        </svg>
                        <div>
                            <strong>Local</strong>
                            <span>${evento.local}</span>
                        </div>
                    </div>
                ` : ''}
                
                ${evento.horario ? `
                    <div class="modal-detalhe-item">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5"/>
                            <path d="M10 5V10L13 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                        <div>
                            <strong>Horário</strong>
                            <span>${evento.horario}</span>
                        </div>
                    </div>
                ` : ''}
                
                ${evento.entrada ? `
                    <div class="modal-detalhe-item">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <rect x="3" y="7" width="14" height="9" rx="1" stroke="currentColor" stroke-width="1.5"/>
                            <path d="M7 7V5C7 3.5 8.5 2 10 2C11.5 2 13 3.5 13 5V7" stroke="currentColor" stroke-width="1.5"/>
                        </svg>
                        <div>
                            <strong>Entrada</strong>
                            <span>${evento.entrada}</span>
                        </div>
                    </div>
                ` : ''}
                
                ${evento.organizador ? `
                    <div class="modal-detalhe-item">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <circle cx="10" cy="7" r="3" stroke="currentColor" stroke-width="1.5"/>
                            <path d="M5 17C5 14 7 12 10 12C13 12 15 14 15 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                        <div>
                            <strong>Organização</strong>
                            <span>${evento.organizador}</span>
                        </div>
                    </div>
                ` : ''}
                
                ${evento.contato ? `
                    <div class="modal-detalhe-item">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/>
                            <path d="M6 7L10 10L14 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        <div>
                            <strong>Contato</strong>
                            <span>${evento.contato}</span>
                        </div>
                    </div>
                ` : ''}
                
                ${evento.link ? `
                    <div class="modal-detalhe-item">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <path d="M8 10H12M7 6L10 3L13 6M7 14L10 17L13 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                        <div>
                            <strong>Mais Informações</strong>
                            <span><a href="${evento.link}" target="_blank" style="color: #2d5a3d; text-decoration: underline;">Acessar link</a></span>
                        </div>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModalEvento() {
    const modal = document.getElementById('modalEvento');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

// ===================================
// FILTROS
// ===================================

function applyFilters() {
    const categoria = document.getElementById('filterCategoria').value;
    const periodo = document.getElementById('filterPeriodo').value;
    
    filteredEventos = [...allEventos];
    
    // Filtrar por categoria
    if (categoria !== 'todos') {
        filteredEventos = filteredEventos.filter(e => e.categoria === categoria);
    }
    
    // Filtrar por período
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    if (periodo === 'proximos') {
        const limite = new Date(hoje);
        limite.setDate(limite.getDate() + 30);
        filteredEventos = filteredEventos.filter(e => {
            const dataEvento = new Date(e.dataInicio);
            return dataEvento >= hoje && dataEvento <= limite;
        });
    } else if (periodo === 'mes_atual') {
        const mesAtual = hoje.getMonth();
        const anoAtual = hoje.getFullYear();
        filteredEventos = filteredEventos.filter(e => {
            const dataEvento = new Date(e.dataInicio);
            return dataEvento.getMonth() === mesAtual && dataEvento.getFullYear() === anoAtual;
        });
    } else if (periodo === 'proximo_mes') {
        let proximoMes = hoje.getMonth() + 1;
        let ano = hoje.getFullYear();
        if (proximoMes > 11) {
            proximoMes = 0;
            ano++;
        }
        filteredEventos = filteredEventos.filter(e => {
            const dataEvento = new Date(e.dataInicio);
            return dataEvento.getMonth() === proximoMes && dataEvento.getFullYear() === ano;
        });
    }
    
    renderEventos();
}

function clearFilters() {
    document.getElementById('filterCategoria').value = 'todos';
    document.getElementById('filterPeriodo').value = 'todos';
    filteredEventos = [...allEventos];
    renderEventos();
}

// ===================================
// UTILS
// ===================================

function formatDate(dateStr) {
    const date = new Date(dateStr);
    const day = date.getDate();
    const month = date.getMonth();
    const year = date.getFullYear();
    
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    return `${day} ${meses[month]} ${year}`;
}

function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// ===================================
// INICIALIZAÇÃO
// ===================================

window.addEventListener('load', async () => {
    console.log('🎉 Inicializando Eventos...');
    
    // Aguardar Firebase
    await waitForFirebase();
    db = window.db;
    
    // Setup
    setupEventListeners();
    await loadEventos();
    renderEventos();
});

function waitForFirebase() {
    return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
            if (window.db) {
                clearInterval(checkInterval);
                resolve();
            }
        }, 100);
        
        setTimeout(() => {
            clearInterval(checkInterval);
            if (!window.db) {
                console.error('Firebase não carregou');
            }
            resolve();
        }, 5000);
    });
}

// ===================================
// EVENT LISTENERS
// ===================================

function setupEventListeners() {
    // Filtros
    document.getElementById('filterCategoria').addEventListener('change', applyFilters);
    document.getElementById('filterPeriodo').addEventListener('change', applyFilters);
    document.getElementById('btnClearFilters').addEventListener('click', clearFilters);
}

// ===================================
// CARREGAR EVENTOS
// ===================================

async function loadEventos() {
    try {
        const snapshot = await db.collection('eventos')
            .where('status', '==', 'ativo')
            .orderBy('dataInicio', 'asc')
            .get();
        
        allEventos = [];
        snapshot.forEach(doc => {
            allEventos.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        filteredEventos = [...allEventos];
        console.log(`✅ ${allEventos.length} eventos carregados`);
        
    } catch (error) {
        console.error('❌ Erro ao carregar eventos:', error);
        allEventos = [];
        filteredEventos = [];
    }
}

// ===================================
// RENDERIZAR CALENDÁRIO
// ===================================

function renderCalendario() {
    const meses = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    
    document.getElementById('mesAnoAtual').textContent = `${meses[currentMonth]} ${currentYear}`;
    
    const primeiroDia = new Date(currentYear, currentMonth, 1).getDay();
    const ultimoDia = new Date(currentYear, currentMonth + 1, 0).getDate();
    const ultimoDiaMesAnterior = new Date(currentYear, currentMonth, 0).getDate();
    
    const diasContainer = document.getElementById('diasCalendario');
    diasContainer.innerHTML = '';
    
    const hoje = new Date();
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    
    // Dias do mês anterior
    for (let i = primeiroDia - 1; i >= 0; i--) {
        const dia = ultimoDiaMesAnterior - i;
        const diaEl = createDiaElement(dia, true, false);
        diasContainer.appendChild(diaEl);
    }
    
    // Dias do mês atual
    for (let dia = 1; dia <= ultimoDia; dia++) {
        const dataStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        const isHoje = dataStr === hojeStr;
        const eventosNoDia = getEventosNoDia(dataStr);
        
        const diaEl = createDiaElement(dia, false, isHoje, eventosNoDia);
        diasContainer.appendChild(diaEl);
    }
    
    // Completar semana com dias do próximo mês
    const totalDias = primeiroDia + ultimoDia;
    const diasFaltando = totalDias % 7 === 0 ? 0 : 7 - (totalDias % 7);
    
    for (let dia = 1; dia <= diasFaltando; dia++) {
        const diaEl = createDiaElement(dia, true, false);
        diasContainer.appendChild(diaEl);
    }
}

function createDiaElement(numero, outroMes, isHoje, eventos = []) {
    const diaDiv = document.createElement('div');
    diaDiv.className = 'dia-mes';
    
    if (outroMes) diaDiv.classList.add('outro-mes');
    if (isHoje) diaDiv.classList.add('hoje');
    if (eventos.length > 0) diaDiv.classList.add('tem-evento');
    
    const numeroDiv = document.createElement('div');
    numeroDiv.className = 'dia-numero';
    numeroDiv.textContent = numero;
    diaDiv.appendChild(numeroDiv);
    
    // Mostrar eventos (máximo 2)
    eventos.slice(0, 2).forEach(evento => {
        const eventoDot = document.createElement('div');
        eventoDot.className = 'evento-mini';
        eventoDot.textContent = evento.titulo;
        eventoDot.title = evento.titulo;
        diaDiv.appendChild(eventoDot);
    });
    
    // Badge se tiver mais eventos
    if (eventos.length > 0) {
        const badge = document.createElement('div');
        badge.className = 'eventos-dia-badge';
        badge.textContent = eventos.length;
        diaDiv.appendChild(badge);
    }
    
    // Click para ver eventos do dia
    if (eventos.length > 0) {
        diaDiv.style.cursor = 'pointer';
        diaDiv.addEventListener('click', () => {
            // Filtrar eventos deste dia
            filteredEventos = eventos;
            renderEventos();
            // Scroll para a seção de eventos
            document.querySelector('.eventos-section').scrollIntoView({ behavior: 'smooth' });
        });
    }
    
    return diaDiv;
}

function getEventosNoDia(dataStr) {
    return allEventos.filter(evento => {
        const inicio = evento.dataInicio.split('T')[0];
        const fim = evento.dataFim ? evento.dataFim.split('T')[0] : inicio;
        return dataStr >= inicio && dataStr <= fim;
    });
}

// ===================================
// RENDERIZAR EVENTOS
// ===================================

function renderEventos() {
    const grid = document.getElementById('eventosGrid');
    
    if (filteredEventos.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                    <circle cx="32" cy="32" r="30" stroke="currentColor" stroke-width="2" opacity="0.2"/>
                    <path d="M32 20V34M32 42V42.5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
                </svg>
                <p>Nenhum evento encontrado</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = '';
    
    filteredEventos.forEach(evento => {
        const card = createEventoCard(evento);
        grid.appendChild(card);
    });
}

function createEventoCard(evento) {
    const card = document.createElement('div');
    card.className = 'evento-card';
    card.onclick = () => openEventoModal(evento);
    
    const icons = {
        'festa': '🎉',
        'show': '🎵',
        'feira': '🛍️',
        'esporte': '⚽',
        'religioso': '⛪',
        'cultural': '🎭',
        'gastronomico': '🍴'
    };
    
    const dataInicio = formatDate(evento.dataInicio);
    const dataFim = evento.dataFim ? formatDate(evento.dataFim) : null;
    const dataTexto = dataFim && dataFim !== dataInicio ? `${dataInicio} até ${dataFim}` : dataInicio;
    
    card.innerHTML = `
        <div class="evento-imagem">
            ${evento.imagem ? `<img src="${evento.imagem}" alt="${evento.titulo}">` : (icons[evento.categoria] || '🎪')}
            <div class="evento-badge">${evento.categoria}</div>
        </div>
        <div class="evento-info">
            <div class="evento-data">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="2" y="3" width="12" height="11" rx="1" stroke="currentColor" stroke-width="1.5"/>
                    <path d="M5 1V3M11 1V3M2 6H14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                ${dataTexto}
            </div>
            <h3 class="evento-titulo">${evento.titulo}</h3>
            <p class="evento-descricao">${truncateText(evento.descricao, 120)}</p>
            <div class="evento-detalhes">
                ${evento.local ? `
                    <div class="evento-detalhe-item">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M8 2C6 2 4 3.5 4 5.5C4 8.5 8 14 8 14C8 14 12 8.5 12 5.5C12 3.5 10 2 8 2Z" stroke="currentColor" stroke-width="1.5"/>
                            <circle cx="8" cy="5.5" r="1.5" fill="currentColor"/>
                        </svg>
                        <span>${evento.local}</span>
                    </div>
                ` : ''}
                ${evento.horario ? `
                    <div class="evento-detalhe-item">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/>
                            <path d="M8 4V8L10 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                        <span>${evento.horario}</span>
                    </div>
                ` : ''}
                ${evento.entrada ? `
                    <div class="evento-detalhe-item">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M3 8H13M10 5L13 8L10 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                        <span>${evento.entrada}</span>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
    
    return card;
}

// ===================================
// MODAL DETALHES
// ===================================

function openEventoModal(evento) {
    const modal = document.getElementById('modalEvento');
    const content = document.getElementById('modalEventoContent');
    
    const icons = {
        'festa': '🎉',
        'show': '🎵',
        'feira': '🛍️',
        'esporte': '⚽',
        'religioso': '⛪',
        'cultural': '🎭',
        'gastronomico': '🍴'
    };
    
    const dataInicio = formatDate(evento.dataInicio);
    const dataFim = evento.dataFim ? formatDate(evento.dataFim) : null;
    const dataTexto = dataFim && dataFim !== dataInicio ? `${dataInicio} até ${dataFim}` : dataInicio;
    
    content.innerHTML = `
        <div class="modal-evento-imagem">
            ${evento.imagem ? `<img src="${evento.imagem}" alt="${evento.titulo}">` : (icons[evento.categoria] || '🎪')}
        </div>
        <div class="modal-evento-info">
            <div class="modal-evento-categoria">${evento.categoria}</div>
            <h2 class="modal-evento-titulo">${evento.titulo}</h2>
            <div class="modal-evento-data">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <rect x="3" y="4" width="14" height="13" rx="1" stroke="currentColor" stroke-width="1.5"/>
                    <path d="M6 2V4M14 2V4M3 8H17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                ${dataTexto}
            </div>
            <p class="modal-evento-descricao">${evento.descricao}</p>
            
            <div class="modal-evento-detalhes">
                ${evento.local ? `
                    <div class="modal-detalhe-item">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <path d="M10 2C7.5 2 5 4 5 6.5C5 10.5 10 18 10 18C10 18 15 10.5 15 6.5C15 4 12.5 2 10 2Z" stroke="currentColor" stroke-width="1.5"/>
                            <circle cx="10" cy="6.5" r="2" fill="currentColor"/>
                        </svg>
                        <div>
                            <strong>Local</strong>
                            <span>${evento.local}</span>
                        </div>
                    </div>
                ` : ''}
                
                ${evento.horario ? `
                    <div class="modal-detalhe-item">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5"/>
                            <path d="M10 5V10L13 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                        <div>
                            <strong>Horário</strong>
                            <span>${evento.horario}</span>
                        </div>
                    </div>
                ` : ''}
                
                ${evento.entrada ? `
                    <div class="modal-detalhe-item">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <rect x="3" y="7" width="14" height="9" rx="1" stroke="currentColor" stroke-width="1.5"/>
                            <path d="M7 7V5C7 3.5 8.5 2 10 2C11.5 2 13 3.5 13 5V7" stroke="currentColor" stroke-width="1.5"/>
                        </svg>
                        <div>
                            <strong>Entrada</strong>
                            <span>${evento.entrada}</span>
                        </div>
                    </div>
                ` : ''}
                
                ${evento.organizador ? `
                    <div class="modal-detalhe-item">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <circle cx="10" cy="7" r="3" stroke="currentColor" stroke-width="1.5"/>
                            <path d="M5 17C5 14 7 12 10 12C13 12 15 14 15 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                        <div>
                            <strong>Organização</strong>
                            <span>${evento.organizador}</span>
                        </div>
                    </div>
                ` : ''}
                
                ${evento.contato ? `
                    <div class="modal-detalhe-item">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/>
                            <path d="M6 7L10 10L14 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        <div>
                            <strong>Contato</strong>
                            <span>${evento.contato}</span>
                        </div>
                    </div>
                ` : ''}
                
                ${evento.link ? `
                    <div class="modal-detalhe-item">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <path d="M8 10H12M7 6L10 3L13 6M7 14L10 17L13 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                        <div>
                            <strong>Mais Informações</strong>
                            <span><a href="${evento.link}" target="_blank" style="color: #2d5a3d; text-decoration: underline;">Acessar link</a></span>
                        </div>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModalEvento() {
    const modal = document.getElementById('modalEvento');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

// ===================================
// FILTROS
// ===================================

function applyFilters() {
    const categoria = document.getElementById('filterCategoria').value;
    const periodo = document.getElementById('filterPeriodo').value;
    
    filteredEventos = [...allEventos];
    
    // Filtrar por categoria
    if (categoria !== 'todos') {
        filteredEventos = filteredEventos.filter(e => e.categoria === categoria);
    }
    
    // Filtrar por período
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    if (periodo === 'proximos') {
        const limite = new Date(hoje);
        limite.setDate(limite.getDate() + 30);
        filteredEventos = filteredEventos.filter(e => {
            const dataEvento = new Date(e.dataInicio);
            return dataEvento >= hoje && dataEvento <= limite;
        });
    } else if (periodo === 'mes_atual') {
        const mesAtual = hoje.getMonth();
        const anoAtual = hoje.getFullYear();
        filteredEventos = filteredEventos.filter(e => {
            const dataEvento = new Date(e.dataInicio);
            return dataEvento.getMonth() === mesAtual && dataEvento.getFullYear() === anoAtual;
        });
    } else if (periodo === 'proximo_mes') {
        let proximoMes = hoje.getMonth() + 1;
        let ano = hoje.getFullYear();
        if (proximoMes > 11) {
            proximoMes = 0;
            ano++;
        }
        filteredEventos = filteredEventos.filter(e => {
            const dataEvento = new Date(e.dataInicio);
            return dataEvento.getMonth() === proximoMes && dataEvento.getFullYear() === ano;
        });
    }
    
    renderEventos();
}

function clearFilters() {
    document.getElementById('filterCategoria').value = 'todos';
    document.getElementById('filterPeriodo').value = 'todos';
    filteredEventos = [...allEventos];
    renderEventos();
}

// ===================================
// VIEW TOGGLE
// ===================================

function setView(view) {
    currentView = view;
    
    const grid = document.getElementById('eventosGrid');
    const btnCards = document.getElementById('btnViewCards');
    const btnList = document.getElementById('btnViewList');
    
    if (view === 'list') {
        grid.classList.add('view-list');
        btnList.classList.add('active');
        btnCards.classList.remove('active');
    } else {
        grid.classList.remove('view-list');
        btnCards.classList.add('active');
        btnList.classList.remove('active');
    }
}

// ===================================
// UTILS
// ===================================

function formatDate(dateStr) {
    const date = new Date(dateStr);
    const day = date.getDate();
    const month = date.getMonth();
    const year = date.getFullYear();
    
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    return `${day} ${meses[month]} ${year}`;
}

function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}
